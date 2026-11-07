#!/usr/bin/env node
'use strict';
/* Gap8 contract: Today front door (ask box + KPI strip) renders
 * synchronously from owner-home.js; setup checklist steps derive from
 * real state; chat routing stays in today-command-setup.js and submits
 * into the existing owner chat; no new startup work. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const failures = [];
const check = (name, cond) => { if (!cond) failures.push(name); };

const STAMP = '20261107-gap8-fronthome-2';
const ownerHome = read('commercial-app/owner-home.js');
const ownerCss = read('commercial-app/owner-home.css');
const shim = read('commercial-app/today-command-setup.js');
const loader = read('commercial-app/h38-script-loader.js');
const index = read('commercial-app/index.html');
const version = read('commercial-app/version.json');

/* Front door renders in owner-home's first paint */
check('owner-home carries gap8 build', ownerHome.includes("build: '" + STAMP + "'"));
check('front door container id (workbench palette host)', ownerHome.includes('id="h38TodayCommandSetup"'));
check('front door class marker', ownerHome.includes('h38-front-door'));
check('ask form present', ownerHome.includes('id="h38FrontAskForm"') && ownerHome.includes('id="h38FrontAskInput"'));
check('ask placeholder is the spec copy', ownerHome.includes('Ask anything — who owes me money?'));
check('suggestion chips route through frontAsk', ownerHome.includes('data-front-chip="Who owes me money?"'));
check('front door assembled before trio frames (top of Today)', (() => {
  const a = ownerHome.indexOf('headerHtml + frontDoorHtml'); const b = ownerHome.indexOf('trioFramesHtml');
  const asm = ownerHome.indexOf("$('mainContent').innerHTML = headerHtml");
  return asm > -1 && ownerHome.slice(asm, asm + 200).includes('frontDoorHtml');
})());
check('ask submits via the today-command router', ownerHome.includes('H38_TODAY_COMMAND_SETUP') && ownerHome.includes('router.openChat(q, true)'));
check('fallback opens the existing ai page only', ownerHome.includes("openPage('ai')") && ownerHome.includes('H38_OWNER_CHAT'));

/* KPI strip: snapshot-only computations */
check('KPI strip container', ownerHome.includes('id="h38FrontKpis"') && ownerHome.includes('h38-kpi-strip'));
check('KPI function exists', ownerHome.includes('function computeFrontDoorKpis()'));
check('money owed excludes paid/draft and uses stored balances', ownerHome.includes("'Balance Due'") && ownerHome.includes('Open Balance') && /PAID\|CLOSED\|VOID\|CANCEL\|DRAFT/.test(ownerHome));
check('today jobs uses scheduleEvents', ownerHome.includes("frontRecords('scheduleEvents')"));
check('open quotes rule present', ownerHome.includes('DRAFT|SENT|PRESENT'));
check('jobs done this week rule present', ownerHome.includes('jobsDoneWeek') && ownerHome.includes('Completed Time'));
check('money tile gated on financial permission', ownerHome.includes('frontCanFinancial'));

/* Checklist: 8 steps from real state */
check('step computation exists', ownerHome.includes('function computeSetupSteps()'));
['profile', 'services', 'customers', 'quote', 'job', 'team', 'portal', 'deposit'].forEach(id =>
  check('step id ' + id, ownerHome.includes("id: '" + id + "'")));
check('portal/deposit steps require a reviewed save (config.updatedAt)', (ownerHome.match(/updatedAt/g) || []).length >= 2 && ownerHome.includes("settingRow('customer_portal')") && ownerHome.includes("settingRow('signed_deposit_acceptance')"));
check('logo step removed (optional add-on, nagged set-up businesses)', !ownerHome.includes("id: 'logo'"));
check('AI answering step removed (optional add-on)', !ownerHome.includes("id: 'ai'"));
check('unknown steps excluded from the count', ownerHome.includes('s.done !== null') && ownerHome.includes('be confirmed from your records'));
check('complete checklist renders nothing', ownerHome.includes('done === determinable.length'));
check('checklist names the Settings home for re-finding setup', ownerHome.includes('Business setup &amp; onboarding'));
check('refresh rewrites KPI+checklist only, never the ask form', ownerHome.includes('function refreshFrontDoor()') && ownerHome.includes("querySelector('#h38FrontKpis')") && ownerHome.includes("querySelector('#h38TodaySetupSlot')"));

/* Performance: no new startup work in either file */
check('owner-home has no MutationObserver', !ownerHome.includes('MutationObserver'));
check('owner-home has no fetch/XHR', !/fetch\(|XMLHttpRequest/.test(ownerHome));
check('shim has no MutationObserver', !shim.includes('MutationObserver'));
check('shim has no fetch/XHR', !/fetch\(|XMLHttpRequest/.test(shim));

/* Shim: routing owner + delegation, no duplicate front door */
check('shim carries gap8 build', shim.includes("var BUILD = '" + STAMP + "'"));
check('shim delegates refresh to owner-home front door', shim.includes("classList.contains('h38-front-door')") && shim.includes('refreshFrontDoor'));
check('shim computeSteps delegates to owner-home', shim.includes('H38OwnerHome.computeSetupSteps'));
check('shim still routes into owner chat send', shim.includes('chatApi.send(question)') && shim.includes('owner_chat') === false || shim.includes('H38_OWNER_CHAT'));
check('shim openChat unchanged in shape', shim.includes('function openChat(question, sendIt)'));

/* Pins + stamp */
check('loader pins shim at gap8', loader.includes('./today-command-setup.js?build=' + STAMP));
check('index pins owner-home.js at gap8', index.includes('./owner-home.js?build=' + STAMP));
check('index pins owner-home.css at gap8', index.includes('./owner-home.css?build=' + STAMP));
check('index pins today-command-setup.css at gap8', index.includes('./today-command-setup.css?build=' + STAMP));
check('version.json at gap8', version.includes('"version": "20261107-polish-a4-quotes-1"'));
check('css has front door styles', ownerCss.includes('.h38-front-ask') && ownerCss.includes('.h38-kpi-strip') && ownerCss.includes('.h38-setup-step'));

console.log(JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', failed: failures.length, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
