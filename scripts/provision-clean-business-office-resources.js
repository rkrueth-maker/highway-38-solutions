#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const pathModule = require('path');
const querystring = require('querystring');
const zlib = require('zlib');

const outputPath = process.argv[2];
if (!outputPath) throw new Error('Output path is required.');

const ownerEmail = String(process.env.CLEAN_OWNER_EMAIL || '').trim().toLowerCase();
const businessName = String(process.env.CLEAN_BUSINESS_NAME || 'Template Business').trim();
const businessId = String(process.env.CLEAN_BUSINESS_ID || 'BUSINESS').trim();
const installationId = String(process.env.CLEAN_INSTALLATION_ID || 'template-business-clean').trim();
if (!ownerEmail) throw new Error('CLEAN_OWNER_EMAIL is required.');
let phase = 'startup';
const partial = {};

function writeEvidence(value) {
  fs.mkdirSync(pathModule.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(value, null, 2) + '\n');
}

function loadNeutralSchema() {
  const schemaPath = pathModule.resolve(__dirname, '../business-packs/template-business/business-office.schema.json.gz.b64');
  const encoded = fs.readFileSync(schemaPath, 'utf8').trim();
  const schema = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  if (!schema || !Array.isArray(schema.sheets) || schema.sheets.length !== 81) {
    throw new Error(`Neutral schema must contain 81 sheets; found ${schema && schema.sheets ? schema.sheets.length : 0}.`);
  }
  const leakText = JSON.stringify(schema);
  if (/Highway\s*38|\bH38\b|rkrueth-maker|highway-38-solutions|AKfyc/i.test(leakText)) {
    throw new Error('Neutral schema contains Highway 38 identity or deployment data.');
  }
  return schema;
}

function walk(value) {
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(walk)];
}

function loadOAuth() {
  const raw = JSON.parse(fs.readFileSync(process.env.HOME + '/.clasprc.json', 'utf8'));
  const auth = walk(raw).find(item => item && typeof item === 'object' &&
    (item.refresh_token || item.refreshToken) &&
    (item.client_id || item.clientId) &&
    (item.client_secret || item.clientSecret));
  if (!auth) throw new Error('No refreshable OAuth credential was found.');
  return {
    refreshToken: auth.refresh_token || auth.refreshToken,
    clientId: auth.client_id || auth.clientId,
    clientSecret: auth.client_secret || auth.clientSecret
  };
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
    const headers = Object.assign({}, options.headers || {});
    if (payload) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request(Object.assign({}, options, { headers }), res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${options.method || 'GET'} ${options.hostname}${options.path} returned ${res.statusCode}: ${data}`));
          return;
        }
        if (!data) return resolve({});
        try { resolve(JSON.parse(data)); } catch (error) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function accessToken() {
  const oauth = loadOAuth();
  const body = querystring.stringify({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: oauth.refreshToken,
    grant_type: 'refresh_token'
  });
  const result = await request({
    method: 'POST', hostname: 'oauth2.googleapis.com', path: '/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, body);
  if (!result.access_token) throw new Error('OAuth token response did not contain access_token.');
  return result.access_token;
}

async function google(token, method, hostname, path, body) {
  return request({ method, hostname, path, headers: { Authorization: `Bearer ${token}` } }, body);
}

async function createFolder(token, name, parentId) {
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  return google(token, 'POST', 'www.googleapis.com', '/drive/v3/files?fields=id,name,webViewLink,parents', body);
}

function patchSheet(schema, sheetName, valuesByHeader) {
  const sheet = schema.sheets.find(item => item.name === sheetName);
  if (!sheet || !sheet.rows || sheet.rows.length < 2) throw new Error(`Neutral schema is missing seed row for ${sheetName}.`);
  const headers = sheet.rows[0];
  Object.keys(valuesByHeader).forEach(header => {
    const index = headers.indexOf(header);
    if (index < 0) throw new Error(`${sheetName} is missing required header ${header}.`);
    sheet.rows[1][index] = valuesByHeader[header];
  });
}

function materializeSchema(schema, resources) {
  const now = new Date().toISOString();
  schema.sheets.forEach(sheet => {
    sheet.rows = (sheet.rows || []).map(row => row.map(value => {
      if (value === '{{OWNER_EMAIL}}') return ownerEmail;
      if (value === '{{NOW}}') return now;
      return value;
    }));
  });
  patchSheet(schema, 'BO Businesses', {
    'Business ID': businessId,
    'Legal Name': businessName,
    'Public Name': businessName,
    'Time Zone': 'Etc/UTC',
    'Private Root Folder ID': resources.rootFolder.id,
    'Original Documents Folder ID': resources.documentFolder.id,
    'Generated PDF Folder ID': resources.pdfFolder.id,
    'Export Folder ID': resources.exportFolder.id,
    'Backup Folder ID': resources.backupFolder.id,
    'White-Label Name': `${businessName} Business Office`,
    'Created Time': now,
    'Updated Time': now
  });
  patchSheet(schema, 'BO Users', {
    'Business ID': businessId,
    Email: ownerEmail,
    'Created Time': now,
    'Updated Time': now
  });
  patchSheet(schema, 'BO Migrations', {
    'Migration ID': `MIGRATION-${installationId}`,
    'Business ID': businessId,
    'Source System': 'Embedded Neutral Schema',
    Status: 'Provisioned — Acceptance Required',
    'Validation Result': 'Separate resources created; live acceptance pending.',
    'Started Time': now,
    Notes: 'No customer, vendor, financial, payroll, tax, document, proof, or error data copied from another installation.'
  });
  return schema;
}

async function createWorkbook(token, schema, rootId) {
  const createBody = {
    properties: { title: `${businessName} — Business Office — ${installationId}`, timeZone: 'Etc/UTC' },
    sheets: schema.sheets.map((sheet, index) => {
      const maxColumns = Math.max(1, ...(sheet.rows || []).map(row => row.length));
      return { properties: { title: sheet.name, index, gridProperties: { rowCount: Math.max(100, (sheet.rows || []).length + 25), columnCount: Math.max(26, maxColumns) } } };
    })
  };
  const workbook = await google(token, 'POST', 'sheets.googleapis.com', '/v4/spreadsheets', createBody);
  if (!workbook.spreadsheetId) throw new Error('Sheets API did not return a spreadsheetId.');
  const metadata = await google(token, 'GET', 'www.googleapis.com', `/drive/v3/files/${workbook.spreadsheetId}?fields=id,name,parents,webViewLink`);
  const params = { addParents: rootId, fields: 'id,name,parents,webViewLink' };
  if (metadata.parents && metadata.parents.length) params.removeParents = metadata.parents.join(',');
  const moved = await google(token, 'PATCH', 'www.googleapis.com', `/drive/v3/files/${workbook.spreadsheetId}?${querystring.stringify(params)}`, {});
  const data = schema.sheets.filter(sheet => sheet.rows && sheet.rows.length).map(sheet => ({
    range: `'${sheet.name.replace(/'/g, "''")}'!A1`, values: sheet.rows
  }));
  await google(token, 'POST', 'sheets.googleapis.com', `/v4/spreadsheets/${workbook.spreadsheetId}/values:batchUpdate`, {
    valueInputOption: 'RAW', data
  });
  return { id: workbook.spreadsheetId, url: moved.webViewLink || workbook.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${workbook.spreadsheetId}/edit` };
}

async function verifyWorkbook(token, spreadsheetId) {
  const metadata = await google(token, 'GET', 'sheets.googleapis.com', `/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties,sheets.properties`);
  const sheets = metadata.sheets || [];
  if (sheets.length !== 81) throw new Error(`Clean workbook must contain 81 sheets; found ${sheets.length}.`);
  const names = new Set(sheets.map(sheet => sheet.properties.title));
  for (const required of ['BO Businesses', 'BO Users', 'BO Roles', 'BO Permissions', 'BO Documents', 'BO Proof Log', 'BO Error Log', 'BO Settings', 'BO Products & Services']) {
    if (!names.has(required)) throw new Error(`Clean workbook is missing required sheet: ${required}`);
  }
  return metadata;
}

async function createScriptProject(token) {
  return google(token, 'POST', 'script.googleapis.com', '/v1/projects', {
    title: `${businessName} Business Office — ${installationId}`
  });
}

(async () => {
  phase = 'load-neutral-schema';
  let schema = loadNeutralSchema();
  phase = 'oauth';
  const token = await accessToken();
  phase = 'create-root-folder';
  const rootFolder = await createFolder(token, `${businessName} Business Office — ${installationId}`);
  partial.rootFolder = rootFolder;
  phase = 'create-document-folder';
  const documentFolder = await createFolder(token, 'Original Documents', rootFolder.id);
  partial.documentFolder = documentFolder;
  phase = 'create-pdf-folder';
  const pdfFolder = await createFolder(token, 'Generated PDFs', rootFolder.id);
  partial.pdfFolder = pdfFolder;
  phase = 'create-export-folder';
  const exportFolder = await createFolder(token, 'Exports', rootFolder.id);
  partial.exportFolder = exportFolder;
  phase = 'create-backup-folder';
  const backupFolder = await createFolder(token, 'Backups', rootFolder.id);
  partial.backupFolder = backupFolder;
  const resources = { rootFolder, documentFolder, pdfFolder, exportFolder, backupFolder };
  phase = 'materialize-neutral-schema';
  schema = materializeSchema(schema, resources);
  phase = 'create-neutral-workbook';
  const workbook = await createWorkbook(token, schema, rootFolder.id);
  partial.spreadsheet = workbook;
  phase = 'verify-neutral-workbook';
  const workbookMetadata = await verifyWorkbook(token, workbook.id);
  phase = 'create-apps-script-project';
  const scriptProject = await createScriptProject(token);
  if (!scriptProject.scriptId) throw new Error('Apps Script project creation did not return a scriptId.');
  partial.appsScriptProject = { id: scriptProject.scriptId };
  const result = {
    status: 'PROVISIONED — ACCEPTANCE REQUIRED', installationId, businessId, businessName, ownerEmail,
    neutralSchema: { source: 'repository', verifiedSheetCount: workbookMetadata.sheets.length },
    spreadsheet: workbook, rootFolder, documentFolder, pdfFolder, exportFolder, backupFolder,
    appsScriptProject: { id: scriptProject.scriptId },
    externalActionsEnabled: false, directPaymentProcessing: false, directPayrollFunding: false,
    directTaxFiling: false, sourceBusinessDataCopied: false
  };
  phase = 'complete';
  writeEvidence(result);
  console.log(JSON.stringify({ status: result.status, installationId, businessId, sheetCount: workbookMetadata.sheets.length, scriptProjectCreated: true }, null, 2));
})().catch(error => {
  const failure = {
    status: 'HOLD', phase, installationId, businessId, businessName,
    error: error && error.message ? error.message : String(error), partialResources: partial,
    externalActionsOccurred: false, paymentProcessed: false, payrollFundsMoved: false, taxReturnFiled: false
  };
  writeEvidence(failure);
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
