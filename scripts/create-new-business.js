#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
function value(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
function required(name) {
  const result = value(name);
  if (!result) throw new Error(`${name} is required.`);
  return result;
}

const slug = required('--slug').toLowerCase();
if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) throw new Error('Slug must contain lowercase letters, numbers, and hyphens.');
const businessName = required('--business-name');
const businessId = value('--business-id', slug.replace(/-/g, '_').toUpperCase());
const ownerEmail = required('--owner-email').toLowerCase();
const timeZone = value('--time-zone', 'Etc/UTC');
const primaryColor = value('--primary-color', '#263746');
const secondaryColor = value('--secondary-color', '#5b7285');
const publicUrl = value('--website-url', '');
const ownerPortalUrl = value('--owner-portal-url', '');
const templatePath = path.join(root, 'business-packs', 'template-business', 'business-office.config.json');
const pack = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

pack.installationId = `${slug}-business-office`;
pack.business = { id: businessId, legalName: businessName, publicName: businessName };
pack.branding.businessName = businessName;
pack.branding.businessOfficeName = `${businessName} Business Office`;
pack.branding.primaryColor = primaryColor;
pack.branding.secondaryColor = secondaryColor;
pack.contact.ownerEmailProperty = 'BO_OWNER_EMAIL';
pack.regional.timeZone = timeZone;
pack.website.publicUrl = publicUrl;
pack.website.ownerPortalUrl = ownerPortalUrl;

const output = path.join(root, 'business-packs', slug);
if (fs.existsSync(output)) throw new Error(`Business pack already exists: ${slug}`);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'business-office.config.json'), JSON.stringify(pack, null, 2) + '\n');

const propertyKeys = pack.resources.propertyKeys;
const setup = {
  status: 'NOT_PROVISIONED',
  installationId: pack.installationId,
  businessId,
  businessName,
  ownerEmail,
  mode: publicUrl ? 'combined' : 'standalone',
  resources: {
    appsScriptProject: { required: true, id: '' },
    webDeployment: { required: true, id: '' },
    spreadsheet: { required: true, property: propertyKeys.BO_SPREADSHEET_ID, id: '' },
    rootFolder: { required: true, property: propertyKeys.BO_ROOT_FOLDER_ID, id: '' },
    documentFolder: { required: true, property: propertyKeys.BO_DOCUMENT_FOLDER_ID, id: '' },
    pdfFolder: { required: true, property: propertyKeys.BO_PDF_FOLDER_ID, id: '' },
    exportFolder: { required: true, property: propertyKeys.BO_EXPORT_FOLDER_ID, id: '' },
    backupFolder: { required: true, property: propertyKeys.BO_BACKUP_FOLDER_ID, id: '' }
  },
  scriptProperties: {
    [propertyKeys.BO_DEFAULT_BUSINESS_ID]: businessId,
    BO_OWNER_EMAIL: ownerEmail,
    BO_INSTALLATION_CONFIG_JSON: JSON.stringify(pack)
  },
  requiredSteps: [
    'Create a new Apps Script project.',
    'Create a new Google Sheet from the Business Office schema.',
    'Create separate root, document, PDF, export, and backup folders.',
    'Set installation Script Properties with the new resource IDs.',
    'Create the owner user record for the new business only.',
    'Deploy the Business Office web application.',
    'Run installation validation and clean-install acceptance.',
    'Optionally connect the public website and Owner Portal.'
  ]
};
fs.writeFileSync(path.join(output, 'setup-plan.json'), JSON.stringify(setup, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'README.md'), `# ${businessName} business pack\n\nGenerated from the neutral template. Resource IDs must be provisioned separately and must never point to another business installation.\n`);
console.log(JSON.stringify({ created: output, installationId: pack.installationId, businessId, mode: setup.mode }, null, 2));
