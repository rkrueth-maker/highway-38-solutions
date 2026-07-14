#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const pages = ['ecosystem-status.html', 'customer-portal.html', 'business-concept-builder.html', 'tool-center.html', 'proof-center.html', 'portal.html'];
const pass = [];
const failures = [];

function check(name, condition, detail = '') {
  (condition ? pass : failures).push({ name, detail });
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function linkedStylesheets(html) {
  return [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)]
    .map(match => match[1].split('?')[0])
    .filter(href => href && !/^(?:https?:|\/\/)/i.test(href));
}

function linkedScripts(html) {
  return [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi)]
    .map(match => match[1].split('?')[0])
    .filter(src => src && !/^(?:https?:|\/\/)/i.test(src));
}

for (const rel of pages) {
  const full = path.join(ROOT, rel);
  check(`${rel} exists`, fs.existsSync(full));
  if (!fs.existsSync(full)) continue;

  const html = read(rel);
  check(`${rel} title`, /<title>[^<]+<\/title>/i.test(html));
  check(`${rel} viewport`, /<meta[^>]+name=["']viewport["']/i.test(html));

  const styles = linkedStylesheets(html);
  const responsive = /@media\s*\(/.test(html) || styles.some(style => {
    const target = path.join(ROOT, style);
    return fs.existsSync(target) && /@media\s*\(/.test(fs.readFileSync(target, 'utf8'));
  });
  check(`${rel} responsive CSS`, responsive, styles.join(', '));

  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(Boolean);
  inlineScripts.forEach((source, index) => {
    try {
      new vm.Script(source, { filename: `${rel}:inline-${index + 1}` });
      pass.push({ name: `${rel} inline script ${index + 1} syntax`, detail: '' });
    } catch (error) {
      failures.push({ name: `${rel} inline script ${index + 1} syntax`, detail: error.message });
    }
  });

  for (const script of linkedScripts(html)) {
    const target = path.join(ROOT, script);
    check(`${rel} script ${script}`, fs.existsSync(target), script);
    if (!fs.existsSync(target)) continue;
    try {
      new vm.Script(fs.readFileSync(target, 'utf8'), { filename: script });
      pass.push({ name: `${rel} script syntax ${script}`, detail: '' });
    } catch (error) {
      failures.push({ name: `${rel} script syntax ${script}`, detail: error.message });
    }
  }

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (/\$\{|^(?:https?:|mailto:|tel:|#|javascript:)/i.test(href)) continue;
    const target = href.split('#')[0].split('?')[0];
    if (!target) continue;
    check(`${rel} local link ${target}`, fs.existsSync(path.join(ROOT, target)), target);
  }
}

const customer = read('customer-portal.html');
check('customer portal truthfully not activated', /Not activated/i.test(customer));
check('customer portal discloses no records exposed', /No customer records, files, quotes, invoices, payments, deliverables, or communications are exposed/i.test(customer));
check('customer portal has no credential or customer form', !/<form\b/i.test(customer));
check('customer portal has safe alternate request path', /href=["']start-request\.html["']/i.test(customer));
check('customer portal no network submit', !/(fetch\(|XMLHttpRequest|sendBeacon)/.test(customer));

const ownerPortal = read('portal.html');
const ownerLinks = [...ownerPortal.matchAll(/data-owner-app/g)].length;
check('owner portal is noindex', /name="robots" content="noindex,nofollow"/.test(ownerPortal));
check('owner portal has private Business Office launch', /script\.google\.com\/macros\/s\//.test(ownerPortal) && ownerLinks >= 6, String(ownerLinks));
check('owner portal does not embed private app', !/<iframe\b/i.test(ownerPortal));
check('owner portal does not collect credentials', !/<form\b/i.test(ownerPortal) && !/type=["']password["']/i.test(ownerPortal));
check('owner portal exposes upload path', /PDF &amp; photo intake/.test(ownerPortal) && /Upload in Business Office/.test(ownerPortal));
check('owner portal exposes social command center', /Social command center/.test(ownerPortal) && /Content calendar/.test(ownerPortal) && /Publishing queue/.test(ownerPortal));
check('owner portal has approved social channel spots', ['Facebook','Instagram','LinkedIn','YouTube','Google Business Profile'].every(channel => ownerPortal.includes(channel)));
check('owner portal includes growth controls', /Analytics &amp; attribution/.test(ownerPortal) && /Reviews &amp; reputation/.test(ownerPortal) && /Ads &amp; campaigns/.test(ownerPortal));
check('owner portal includes management gaps', ['Communications &amp; inbox','Calendar &amp; scheduling','Website management','Files &amp; deliverables','Team &amp; access','System, backup &amp; recovery','Products &amp; fulfillment','Goals, KPIs &amp; decisions'].every(label => ownerPortal.includes(label)));
check('owner portal preserves approval boundaries', /No auto-publish/.test(ownerPortal) && /Spend approval/.test(ownerPortal) && /Keep owner approval/.test(ownerPortal));
const ecosystemJs = read('ecosystem.js');
check('global Owner Login routes through portal webpage', /const ownerPortal='portal\.html'/.test(ecosystemJs));

const builderHtml = read('business-concept-builder.html');
const builderJs = read('business-concept-builder.js');
check('concept builder owner-review package', /OWNER_REVIEW_REQUIRED/.test(builderJs) && /automaticExternalActions:false/.test(builderJs));
check('concept builder local storage', /localStorage\.setItem/.test(builderJs));
check('concept builder Markdown export', /-launch-brief\.md/.test(builderJs));
check('concept builder portable JSON export', /-business-package\.json/.test(builderJs));
check('concept builder offer and workflow package', /offers/.test(builderJs) && /sopList/.test(builderJs) && /launchPlan30Days/.test(builderJs));
check('concept builder task generation', /BCB-T001/.test(builderJs) && /BCB-T007/.test(builderJs));
check('concept builder browser-only operation', !/(fetch\(|XMLHttpRequest|sendBeacon)/.test(builderHtml + builderJs));

const tools = read('tool-center.html');
check('four calculators', ([...tools.matchAll(/data-tool=/g)]).length === 4, String(([...tools.matchAll(/data-tool=/g)]).length));
check('calculator downloads', /new Blob/.test(tools) && /estimate\.txt/.test(tools));
check('calculator coverage', ['area', 'labor', 'margin', 'project'].every(name => tools.includes(`data-tool="${name}"`)));

const proof = JSON.parse(read('launch-control/public-proof-manifest.json'));
check('proof manifest items', Array.isArray(proof.items) && proof.items.length >= 4, String(proof.items?.length));
check('all proof items explicitly public safe', (proof.items || []).every(item => item.privacyStatus === 'PUBLIC_SAFE'));
for (const item of proof.items || []) {
  check(`proof target ${item.url}`, fs.existsSync(path.join(ROOT, item.url)), item.id);
}

const status = read('ecosystem-status.html');
for (const label of ['Customer email', 'Payment collection', 'Social publishing', 'Advertising spend', 'Final delivery', 'Private proof sources']) {
  check(`status lock ${label}`, status.includes(label));
}

const result = {
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  passed: pass.length,
  failed: failures.length,
  pages,
  pass,
  failures
};
const outDir = path.join(ROOT, 'launch-control', 'evidence');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'public-ecosystem-tools.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exit(failures.length ? 1 : 0);
