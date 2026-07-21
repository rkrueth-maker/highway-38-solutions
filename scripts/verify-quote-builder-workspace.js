#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}
function requireText(text, marker, label) {
  if (!text.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
}

const web = read('apps-script/business-office/BusinessOffice_Web.gs');
const clientManifest = read('apps-script/business-office/BusinessOffice_ClientManifest.gs');
const client = read('apps-script/business-office/BusinessOffice_QuoteBuilder_Client.html');
const unified = read('apps-script/business-office/BusinessOffice_Unified_Client.html');
const engine = read('apps-script/business-office/BusinessOffice_QuoteBuilder.gs');
const gate = read('apps-script/business-office/BusinessOffice_ModuleAccess.gs');
const gateway = read('quote-builder.html');

requireText(web, 'boRenderClientIncludes_()', 'controlled client renderer');
requireText(clientManifest, "'BusinessOffice_UX_Client'", 'UX client manifest entry');
requireText(clientManifest, "'BusinessOffice_QuoteBuilder_Client'", 'Quote Builder client manifest entry');
requireText(clientManifest, "'BusinessOffice_Unified_Client'", 'unified client manifest entry');
const orderedClients=['BusinessOffice_UX_Client','BusinessOffice_QuoteBuilder_Client','BusinessOffice_Unified_Client'];
for(let index=1;index<orderedClients.length;index++){
  if(clientManifest.indexOf(`'${orderedClients[index-1]}'`)>=clientManifest.indexOf(`'${orderedClients[index]}'`))throw new Error('Invalid controlled client load order.');
}
if(orderedClients.some(name=>(clientManifest.match(new RegExp(name,'g'))||[]).length!==1))throw new Error('Controlled client manifest must include each core workspace client exactly once.');
requireText(client, "module==='quoteBuilder'", 'dedicated module route');
requireText(client, "call('createQuote'", 'new quote workflow');
requireText(client, "call('quoteBuilderPriceBook'", 'Price Book workflow');
requireText(client, "call('quoteBuilderTemplates'", 'template workflow');
requireText(client, "call('prepareAiQuoteDraft'", 'AI draft staging workflow');
requireText(client, "call('duplicateQuote'", 'quote duplication');
requireText(client, "call('generatePdf'", 'quote PDF generation');
requireText(client, "call('approve'", 'owner approval action');
requireText(client, "call('quoteToJob'", 'quote-to-job action');
requireText(client, 'Nothing was sent', 'no-send boundary language');
requireText(engine, 'function boQuoteBuilderDashboard_', 'shared Quote Builder engine');
requireText(engine, 'AI did not invent or approve pricing.', 'AI pricing boundary');
requireText(gate, 'quoteBuilderDashboard|quoteBuilderPriceBook|quoteBuilderTemplates|prepareAiQuoteDraft|quoteBuilderPackage', 'server-side module gate');
requireText(gateway, '?app=business-office#module=quoteBuilder', 'secure Quote Builder deep link');
requireText(unified, 'function moduleAllowed(module)', 'unified module guard');

const match = client.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('Quote Builder client script block is missing.');
new Function(match[1]);

console.log('PASS — dedicated Quote Builder workspace, controlled client manifest, secure route, shared engine, and approval boundaries verified.');
