#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const portal = path.join(root, 'apps-script', 'core-engine', 'owner-portal-next');
const shell = fs.readFileSync(path.join(portal, 'Portal_Index.html'), 'utf8');
const rawIncludes = fs.readFileSync(path.join(portal, 'Portal_RawIncludes.js'), 'utf8');
const workspace = fs.readFileSync(path.join(portal, 'Portal_Experience_Client_Workspace.html'), 'utf8');

const checks = [
  ['raw include function exists', /function\s+h38PortalRawInclude_\s*\(/.test(rawIncludes)],
  ['raw include uses template file API', /HtmlService\.createTemplateFromFile\(fileName\)/.test(rawIncludes)],
  ['raw include returns unprocessed content', /\.getRawContent\(\)/.test(rawIncludes)],
  ['allowlist remains enforced', /allowed\.indexOf\(fileName\)\s*<\s*0/.test(rawIncludes)],
  ['portal shell uses raw style include', /h38PortalRawInclude_\('Portal_Experience_Styles'\)/.test(shell)],
  ['portal shell uses raw core include', /h38PortalRawInclude_\('Portal_Experience_Client_Core'\)/.test(shell)],
  ['portal shell uses raw views include', /h38PortalRawInclude_\('Portal_Experience_Client_Views'\)/.test(shell)],
  ['portal shell uses raw workspace include', /h38PortalRawInclude_\('Portal_Experience_Client_Workspace'\)/.test(shell)],
  ['portal shell no longer parses client fragments as HtmlOutput', !/h38PortalInclude_\('Portal_Experience_Client_/.test(shell)],
  ['regression fixture contains HTML template literals', /`<div class="workspace-head"/.test(workspace)]
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
const evidence = {
  status: failures.length ? 'FAIL' : 'PASS',
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  regression: 'Apps Script raw JavaScript fragments must be included with HtmlTemplate.getRawContent().' 
};
console.log(JSON.stringify(evidence, null, 2));
process.exit(failures.length ? 1 : 0);
