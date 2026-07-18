#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const assert = (name, condition) => {
  checks.push({ name, pass: Boolean(condition) });
  if (!condition) console.error(`FAIL: ${name}`);
  else console.log(`PASS: ${name}`);
};

const home = read('index.html');
const request = read('start-request.html');
const contact = read('contact.html');
const css = read('contact-options.css');
const packageJson = read('package.json');
const catalog = read('catalog-data.js');

assert('contact page exists with two low-friction paths', /Email a quick message/.test(contact) && /Request a conversation/.test(contact));
assert('quick email opens the approved public business inbox', /mailto:highway38solutions@gmail\.com\?subject=Quick%20Highway%2038%20question/.test(contact));
assert('public inbox matches the approved catalog configuration', /"businessEmail":\s*"highway38solutions@gmail\.com"/.test(catalog));
assert('private owner email is absent from public contact files', !/rkrueth@gmail\.com/i.test(home + request + contact));
assert('conversation request collects preferred follow-up details', /Phone%20or%20preferred%20contact/.test(contact) && /Best%20time%20to%20reach%20me/.test(contact));
assert('contact page states that no message is sent automatically', /Nothing is sent automatically/.test(contact));
assert('guided request remains available from the contact page', /href="start-request\.html"/.test(contact));
assert('request page exposes skip-form choices before the form', request.indexOf('h38-contact-shortcuts') < request.indexOf('id="intake-form"'));
assert('request page includes quick email and contact-us links', /Email a quick message/.test(request) && /href="contact\.html"/.test(request));
assert('homepage surfaces the shorter contact path outside the hero', /class="final-cta"/.test(home) && /href="contact\.html">Contact Highway 38<\/a>/.test(home));
assert('contact choices stack on small screens', /@media\(max-width:760px\)[\s\S]*\.h38-contact-grid\{grid-template-columns:1fr\}/.test(css));
assert('contact options preserve minimum-size buttons through shared button classes', /class="btn btn-primary"/.test(contact) && /class="btn btn-secondary"/.test(request));
assert('contact verifier is part of the commercial test chain', /verify-contact-options\.js/.test(packageJson));

const failed = checks.filter(check => !check.pass);
if (failed.length) {
  console.error(JSON.stringify({ status: 'FAIL', failed: failed.map(check => check.name) }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'PASS', checks: checks.length, scope: 'quick email + request conversation + guided request preservation' }, null, 2));
