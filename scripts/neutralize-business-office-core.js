#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'apps-script', 'business-office');
const changed = [];

function update(relativePath, transform) {
  const file = path.join(root, relativePath);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after === before) return;
  fs.writeFileSync(file, after);
  changed.push(relativePath);
}

function replaceRequired(text, oldValue, newValue, label) {
  if (!text.includes(oldValue)) throw new Error(`Missing neutralization marker ${label || oldValue}`);
  return text.replace(oldValue, newValue);
}

for (const name of fs.readdirSync(dir).filter(name => name.endsWith('.gs'))) {
  update(path.join('apps-script', 'business-office', name), text => text
    .replace('/** Highway 38 Business Office —', '/** Business Office —')
    .replaceAll('H38_BO.TIME_ZONE', 'boTimeZone_()'));
}

update('apps-script/business-office/BusinessOffice_DocumentsPDF.gs', text => {
  const replacements = [
    ["file.setDescription('Private Highway 38 Business Office original. Document ID: ' + documentId);", "file.setDescription('Private ' + boBusinessOfficeTitle_() + ' original. Document ID: ' + documentId);", 'document description'],
    ["const title = body.appendParagraph(source.businessName || 'Highway 38 Solutions');", "const title = body.appendParagraph(source.businessName || boBusinessName_());", 'PDF business-name fallback'],
    ["body.appendParagraph('Generated: ' + boNow_() + ' CT');", "body.appendParagraph('Generated: ' + boNow_() + ' ' + boTimeZone_());", 'PDF timezone'],
    ["body.appendParagraph(documentType === 'Tax Preparation Packet' ? H38_BO.TAX_BOUNDARY : H38_BO.ACCOUNTING_BOUNDARY).setItalic(true);", "body.appendParagraph(documentType === 'Tax Preparation Packet' ? boTaxBoundary_() : boAccountingBoundary_()).setItalic(true);", 'PDF boundary'],
    ["footer.appendParagraph('Highway 38 Business Office · Private preparation document').setAlignment(DocumentApp.HorizontalAlignment.CENTER);", "footer.appendParagraph(boDocumentFooterLabel_()).setAlignment(DocumentApp.HorizontalAlignment.CENTER);", 'PDF footer'],
    ["businessName: business['Public Name'] || business['Legal Name'] || 'Highway 38 Solutions',", "businessName: business['Public Name'] || business['Legal Name'] || boBusinessName_(),", 'PDF source identity']
  ];
  for (const [oldValue, newValue, label] of replacements) text = replaceRequired(text, oldValue, newValue, label);
  return text;
});

update('apps-script/business-office/BusinessOffice_PlatformAcceptance.gs', text => {
  text = replaceRequired(
    text,
    "const terms = input.forbiddenTerms || ['Highway 38 Solutions', '1kDDKWx9jfObWm8EmaXm5weDCTJbQ8RTf7-sq4RDEYlA', '1Vq8UjAzxW4hIKYoodkf1hfqkATWiXjVC', '11ak4QZ7ag8daYO1_uO6NTCVXIO7Kh6j3'];",
    "const terms = input.forbiddenTerms || boPackValue_('isolation.forbiddenTerms', []);",
    'platform leakage terms'
  );
  return replaceRequired(
    text,
    "if (boBusinessName_() !== 'Highway 38 Solutions') boAssert_(text.indexOf('Highway 38 Solutions') < 0, item[0] + ' PDF leaked Highway 38 identity.');",
    "(input.forbiddenTerms || boPackValue_('isolation.forbiddenTerms', [])).forEach(function (term) { boAssert_(text.indexOf(String(term)) < 0, item[0] + ' PDF leaked a protected identity or resource marker.'); });",
    'platform PDF leakage check'
  );
});

update('apps-script/business-office/BusinessOffice_Provisioning.gs', text => replaceRequired(
  text,
  "const forbidden=values.forbiddenTerms||['Highway 38 Solutions','rkrueth','AKfyc'];",
  "const forbidden=values.forbiddenTerms||boPackValue_('isolation.forbiddenTerms',[]);",
  'provisioning leakage terms'
));

update('apps-script/business-office/BusinessOffice_Index.html', text => {
  text = replaceRequired(text, ':root { --navy:#173a5e; --blue:#326a9e;', ':root { --navy:#243447; --blue:#52677d;', 'neutral UI colors');
  text = replaceRequired(text, '<h1>Highway 38 Business Office</h1>', '<h1>Business Office</h1>', 'neutral UI title');
  return text.replaceAll('Highway 38 Business Office', 'Business Office');
});

update('apps-script/business-office/BusinessOffice_Web.gs', text => {
  text = replaceRequired(text, ".replace('Highway 38 Business Office',title)", ".replace('Business Office',title)", 'runtime title marker');
  text = replaceRequired(text, ".replace('--navy:#173a5e','--navy:'+branding.primaryColor)", ".replace('--navy:#243447','--navy:'+branding.primaryColor)", 'runtime primary color marker');
  text = replaceRequired(text, ".replace('--blue:#326a9e','--blue:'+branding.secondaryColor)", ".replace('--blue:#52677d','--blue:'+branding.secondaryColor)", 'runtime secondary color marker');
  return text;
});

update('apps-script/business-office/README.md', () => `# Business Office Platform\n\nPrivate, role-aware operations platform for customers, vendors, quotes, work orders, jobs, purchasing, billing, payments, receipts, expenses, document intake, OCR-assisted review, accounting preparation, payroll preparation, tax-preparation support, approvals, reports, backups, proof logs, and error logs.\n\n## Business pack\n\nEvery deployment must assemble exactly one business pack. The pack supplies business identity, branding, contacts, URLs, enabled modules, roles, approval language, catalog requirements, tax settings, document labels, property-key names, deployment mode, and isolation rules. The reusable core contains no live business resource IDs.\n\n## Storage and deployment isolation\n\nEach installation requires a dedicated Apps Script project, deployment, spreadsheet, root folder, document folder, PDF folder, export folder, backup folder, user records, audit log, proof log, and error log. Resource IDs are stored in Script Properties or encrypted deployment inputs, never public source.\n\n## Safety boundaries\n\nExternal actions default to disabled. The platform does not directly process payments, fund payroll, initiate direct deposit, file tax returns, or bypass selected-record approval controls. Original uploads are preserved and duplicate hashes are blocked.\n\n## Deployment modes\n\n- Combined: configured website, owner portal, and Business Office.\n- Standalone: private Business Office with separate authentication, configuration, storage, and deployment.\n\nUse the repository assembly and installation scripts with a selected business pack. Do not copy another installation's data or resource IDs.\n`);

const forbidden = ['Highway 38 Solutions','1kDDKWx9jfObWm8EmaXm5weDCTJbQ8RTf7-sq4RDEYlA','1Vq8UjAzxW4hIKYoodkf1hfqkATWiXjVC','11ak4QZ7ag8daYO1_uO6NTCVXIO7Kh6j3','AKfycb'];
const leakLocations = [];
for (const name of fs.readdirSync(dir).filter(name => /\.(gs|html|md|json)$/.test(name))) {
  const text = fs.readFileSync(path.join(dir, name), 'utf8');
  for (const value of forbidden) {
    if (!text.includes(value)) continue;
    const line = text.slice(0, text.indexOf(value)).split('\n').length;
    leakLocations.push({ file: name, marker: value, line });
  }
}
if (leakLocations.length) throw new Error(`Reusable core still contains protected identity or resource markers: ${JSON.stringify(leakLocations)}`);

console.log(JSON.stringify({ status: 'PASS', changed }, null, 2));
