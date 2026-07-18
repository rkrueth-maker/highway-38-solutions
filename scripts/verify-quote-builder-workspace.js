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
const client = read('apps-script/business-office/BusinessOffice_QuoteBuilder_Client.html');
const unified = read('apps-script/business-office/BusinessOffice_Unified_Client.html');
const engine = read('apps-script/business-office/BusinessOffice_QuoteBuilder.gs');
const gate = read('apps-script/business-office/BusinessOffice_ModuleAccess.gs');
const gateway = read('quote-builder.html');

requireText(web, "boInclude_('BusinessOffice_QuoteBuilder_Client')", 'Quote Builder client include');
requireText(web, "boInclude_('BusinessOffice_UX_Client')+boInclude_('BusinessOffice_QuoteBuilder_Client')+boInclude_('BusinessOffice_Unified_Client')", 'client load order');
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

console.log('PASS — dedicated Quote Builder workspace, secure route, shared engine, and approval boundaries verified.');
