#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const bundle = path.resolve(root, process.argv[2] || 'artifacts/business-office-control-plane/render-bundle');
const out = path.resolve(root, process.argv[3] || 'artifacts/business-office-control-plane/renders-v2');
fs.mkdirSync(out, { recursive: true });

function read(name) {
  return fs.readFileSync(path.join(bundle, name), 'utf8');
}

const shell = read('BusinessOffice_Index.html');
const control = read('BusinessOffice_ControlPlane.html');
const routes = read('BusinessOffice_ControlPlane_Routes.html');

const sample = {
  tasks: [
    {
      'Task ID': 'TASK-1001',
      'Task Title': 'Retaining wall — footing preparation',
      Priority: 'High',
      'Due Date': '2026-07-21',
      Status: 'In Progress',
      Instructions: 'Excavate to 24 inches, verify grade, and photograph the footing before base material.',
      'Required Proof': 'Before Photo,Progress Photo,Completion Photo,Checklist,Notes',
      'Customer ID': 'CUST-100',
      'Job ID': 'JOB-100',
      'Work Order ID': 'WO-100'
    },
    {
      'Task ID': 'TASK-1002',
      'Task Title': 'Shed site measurements',
      Priority: 'Normal',
      'Due Date': '2026-07-22',
      Status: 'Open',
      Instructions: 'Confirm setbacks and photograph all four corners.',
      'Required Proof': 'Before Photo,Notes',
      'Customer ID': 'CUST-101',
      'Job ID': 'JOB-101',
      'Work Order ID': 'WO-101'
    },
    {
      'Task ID': 'TASK-1003',
      'Task Title': 'Gutter-cleaning completion',
      Priority: 'Normal',
      'Due Date': '2026-07-23',
      Status: 'Open',
      Instructions: 'Clear gutters and downspouts; completion photo required.',
      'Required Proof': 'Completion Photo,Notes',
      'Customer ID': 'CUST-102',
      'Job ID': 'JOB-102',
      'Work Order ID': 'WO-102'
    }
  ],
  proofQueue: [
    {
      'Task Proof ID': 'PROOF-1',
      'Task ID': 'TASK-1001',
      'Photo Type': 'Progress',
      Caption: 'Footing excavated and grade confirmed.',
      'Approval Status': 'Owner Approval Required',
      'Customer Visible': 'No'
    },
    {
      'Task Proof ID': 'PROOF-2',
      'Task ID': 'TASK-1003',
      'Photo Type': 'Completion',
      Caption: 'Gutters and downspouts cleared.',
      'Approval Status': 'Owner Approval Required',
      'Customer Visible': 'No'
    }
  ],
  socialQueue: [
    {
      'Social Content ID': 'SOCIAL-1',
      Platform: 'Facebook',
      'Content Type': 'Project Update',
      Caption: 'Footing preparation is complete and the retaining-wall base is ready for the next stage.',
      Status: 'Needs Review',
      'Approval Status': 'Owner Approval Required',
      'Publish Allowed': 'No',
      'Source Document ID': 'DOC-1'
    },
    {
      'Social Content ID': 'SOCIAL-2',
      Platform: 'Instagram',
      'Content Type': 'Before and After',
      Caption: 'A clean gutter system protects the roofline and foundation.',
      Status: 'Draft',
      'Approval Status': 'Not Submitted',
      'Publish Allowed': 'No',
      'Source Document ID': 'DOC-2'
    }
  ]
};

function capabilities(role) {
  return {
    controlPlane: ['Owner', 'Administrator'].includes(role),
    assignWork: ['Owner', 'Administrator', 'Foreman'].includes(role),
    clockWork: ['Owner', 'Administrator', 'Foreman', 'Field Staff', 'Staff'].includes(role),
    captureProgress: ['Owner', 'Administrator', 'Foreman', 'Field Staff', 'Staff'].includes(role),
    captureReceipt: ['Owner', 'Administrator', 'Foreman', 'Field Staff', 'Staff', 'Bookkeeper'].includes(role),
    reviewReceipt: ['Owner', 'Administrator', 'Bookkeeper'].includes(role),
    createQuote: ['Owner', 'Administrator', 'Foreman', 'Estimator', 'Staff'].includes(role),
    sendQuote: ['Owner', 'Administrator'].includes(role),
    prepareSocial: ['Owner', 'Administrator', 'Foreman', 'Staff'].includes(role),
    approveSocial: role === 'Owner',
    markSocialPosted: ['Owner', 'Administrator'].includes(role),
    payrollReview: ['Owner', 'Administrator', 'Bookkeeper', 'Payroll'].includes(role),
    customerVisibility: ['Owner', 'Administrator', 'Foreman'].includes(role),
    readOnly: role === 'Viewer'
  };
}

function actions(role, current) {
  const caps = capabilities(role);
  const result = [];
  if (caps.clockWork) result.push({ key: 'clock', label: current ? 'Open Current Work' : 'Clock In', icon: '⏱', route: 'control:field', primary: true });
  if (caps.assignWork) result.push({ key: 'assign', label: 'Assign Task', icon: '✓', route: 'control:assign', primary: true });
  if (caps.captureProgress) result.push({ key: 'photo', label: 'Add Job Photo', icon: '📷', route: 'control:photo', primary: true });
  if (caps.captureReceipt) result.push({ key: 'receipt', label: 'Scan Receipt', icon: '🧾', route: 'control:receipt', primary: true });
  if (caps.createQuote) result.push({ key: 'quote', label: 'Create Quote', icon: '＋', route: 'app:quote-builder', primary: true });
  if (caps.controlPlane) result.push({ key: 'approvals', label: 'Review Approvals', icon: '✓', route: 'bo:approvals', primary: false });
  if (caps.prepareSocial) result.push({ key: 'social', label: 'Social Control', icon: '◉', route: 'control:social', primary: false });
  if (caps.payrollReview) result.push({ key: 'time', label: 'Time & Payroll', icon: '👥', route: 'bo:time', primary: false });
  if (role === 'Owner') result.push({ key: 'proof', label: 'Review Job Photos', icon: '📸', route: 'control:proof', primary: false });
  return result;
}

function controlBootstrap(role, active) {
  const current = active ? {
    'Field Session ID': 'FIELD-1',
    'Task ID': 'TASK-1001',
    Status: 'WORKING',
    'Started Time': '2026-07-20 08:00:00',
    'Job ID': 'JOB-100',
    'Customer ID': 'CUST-100'
  } : null;
  return {
    status: 'PASS',
    user: {
      id: `USER-${role.toUpperCase().replace(/\s/g, '-')}`,
      email: `${role.toLowerCase().replace(/\s/g, '.')}@example.com`,
      displayName: role === 'Owner' ? 'Business Owner' : role,
      role
    },
    capabilities: capabilities(role),
    actions: actions(role, current),
    currentSession: current,
    tasks: sample.tasks,
    socialQueue: ['Owner', 'Foreman'].includes(role) ? sample.socialQueue : [],
    proofQueue: role === 'Owner' ? sample.proofQueue : [],
    schema: { status: 'PASS', created: [] },
    externalActionsEnabled: false
  };
}

function coreBootstrap(role) {
  return {
    context: {
      version: '3.0.0',
      business: {
        name: 'Sample Property Services',
        branding: {
          businessName: 'Sample Property Services',
          businessOfficeName: 'Business Office',
          primaryColor: '#173a5e',
          secondaryColor: '#326a9e'
        }
      },
      user: { id: 'USER-1', displayName: role, role },
      boundaries: {
        externalActionsEnabled: false,
        directPaymentProcessing: false,
        directPayrollFunding: false,
        directTaxFiling: false
      }
    },
    dashboard: { cards: [], attention: [], recent: [] },
    modules: [],
    definitions: {},
    apps: [],
    savedViews: { quotes: [], invoices: [] }
  };
}

function mockScript(role, active) {
  const core = JSON.stringify(coreBootstrap(role));
  const controlData = JSON.stringify(controlBootstrap(role, active));
  const social = JSON.stringify(sample.socialQueue);
  return `<script>
window.__LAST_MODULE='';
window.__MOCK_ROLE=${JSON.stringify(role)};
(function(){
  function makeRunner(){
    var success=function(){},failure=function(){};
    var runner={
      withSuccessHandler:function(fn){success=fn;return runner;},
      withFailureHandler:function(fn){failure=fn;return runner;},
      boApi:function(){setTimeout(function(){try{success(${core});}catch(error){failure(error);}},0);},
      boControlApiLive:function(request){setTimeout(function(){try{
        var action=request&&request.action||'';
        if(action==='bootstrap')success(${controlData});
        else if(action==='socialList')success(${social});
        else if(action==='socialAction'&&request.args&&request.args.action==='PUBLISH')success({status:'HOLD',reason:'External social publishing is locked.',externalActionOccurred:false});
        else success({status:'PASS',externalActionOccurred:false});
      }catch(error){failure(error);}},0);}
    };
    return runner;
  }
  window.google={script:{}};
  Object.defineProperty(window.google.script,'run',{configurable:true,get:makeRunner});
})();
</script>`;
}

function buildHtml(role, active) {
  return shell
    .replace('</head>', `${mockScript(role, active)}</head>`)
    .replace('</body>', `${control}${routes}</body>`);
}

async function initialize(page) {
  await page.waitForFunction(() => typeof window.boControlUiHome === 'function', { timeout: 10000 });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.__LAST_MODULE = '';
    window.openModule = function(module) {
      window.__LAST_MODULE = module;
      var content = document.getElementById('content');
      if (content) content.innerHTML = '<div style="padding:32px"><h2>Opened ' + module + '</h2><p>Focused module routing passed.</p></div>';
    };
  });
  await page.evaluate(async () => { await window.boControlUiHome(); });
  await page.waitForSelector('.bo-control', { timeout: 10000 });
}

async function renderScenario(browser, scenario, errors) {
  const page = await browser.newPage({
    viewport: { width: scenario.width, height: scenario.height },
    deviceScaleFactor: 1
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });
  try {
    await page.setContent(buildHtml(scenario.role, scenario.active), { waitUntil: 'load' });
    await initialize(page);
    if (scenario.route !== 'home') {
      await page.evaluate(async route => { await window.boControlUiRoute(route); }, scenario.route);
      await page.waitForTimeout(180);
    }
    const screenshot = path.join(out, `${scenario.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const metrics = await page.evaluate(() => {
      const actionButtons = Array.from(document.querySelectorAll('.bo-action'));
      const smallTargets = actionButtons
        .map(button => ({ text: button.textContent.trim(), height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width }))
        .filter(item => item.height < 56 || item.width < 56);
      const bottom = document.querySelector('.bo-control-bottom');
      return {
        actions: actionButtons.length,
        buttons: document.querySelectorAll('button').length,
        hasBottomNav: !!bottom,
        bottomNavVisible: !!bottom && getComputedStyle(bottom).display !== 'none',
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        smallTargets
      };
    });
    if (pageErrors.length) errors.push(`${scenario.name}: ${pageErrors.join(' | ')}`);
    if (metrics.horizontalOverflow) errors.push(`${scenario.name}: horizontal overflow`);
    if (scenario.width <= 400 && !metrics.bottomNavVisible) errors.push(`${scenario.name}: mobile bottom navigation is not visible`);
    if (metrics.smallTargets.length) errors.push(`${scenario.name}: undersized action targets ${JSON.stringify(metrics.smallTargets)}`);
    return { ...scenario, file: path.relative(root, screenshot), metrics, pageErrors };
  } catch (error) {
    const failure = `${scenario.name}: ${error.stack || error.message}`;
    errors.push(failure);
    fs.writeFileSync(path.join(out, `${scenario.name}-error.txt`), `${failure}\n${pageErrors.join('\n')}\n`);
    return { ...scenario, status: 'HOLD', error: failure, pageErrors };
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const scenarios = [
    { name: 'owner-desktop-home', role: 'Owner', active: false, width: 1440, height: 1000, route: 'home' },
    { name: 'owner-mobile-home', role: 'Owner', active: false, width: 390, height: 844, route: 'home' },
    { name: 'foreman-mobile-home', role: 'Foreman', active: false, width: 390, height: 844, route: 'home' },
    { name: 'foreman-mobile-receipt', role: 'Foreman', active: false, width: 390, height: 844, route: 'receipt' },
    { name: 'field-mobile-work', role: 'Field Staff', active: true, width: 390, height: 844, route: 'field' },
    { name: 'owner-desktop-proof-review', role: 'Owner', active: false, width: 1440, height: 1000, route: 'proof' },
    { name: 'owner-desktop-social-control', role: 'Owner', active: false, width: 1440, height: 1000, route: 'social' }
  ];
  const renders = [];
  for (const scenario of scenarios) renders.push(await renderScenario(browser, scenario, errors));

  const routePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const routeErrors = [];
  routePage.on('pageerror', error => routeErrors.push(error.message));
  try {
    await routePage.setContent(buildHtml('Owner', false), { waitUntil: 'load' });
    await initialize(routePage);
    await routePage.evaluate(async () => { await window.boControlUiRoute('app:quote-builder'); });
    const quoteRoute = await routePage.evaluate(() => window.__LAST_MODULE);
    await routePage.evaluate(async () => { await window.boControlUiRoute('bo:approvals'); });
    const approvalRoute = await routePage.evaluate(() => window.__LAST_MODULE);
    if (quoteRoute !== 'quotes') errors.push(`Create Quote routed to ${quoteRoute || 'nothing'} instead of quotes`);
    if (approvalRoute !== 'approvals') errors.push(`Review Approvals routed to ${approvalRoute || 'nothing'} instead of approvals`);
    if (routeErrors.length) errors.push(`route-check: ${routeErrors.join(' | ')}`);
    const result = {
      status: errors.length ? 'HOLD' : 'PASS',
      generatedAt: new Date().toISOString(),
      renders,
      routeChecks: { quoteBuilder: quoteRoute, approvals: approvalRoute },
      automaticExternalActions: false,
      failures: errors
    };
    fs.writeFileSync(path.join(out, 'render-verification.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    process.exit(errors.length ? 1 : 0);
  } catch (error) {
    errors.push(`route-check: ${error.stack || error.message}`);
    fs.writeFileSync(path.join(out, 'render-verification.json'), `${JSON.stringify({ status: 'HOLD', generatedAt: new Date().toISOString(), renders, failures: errors }, null, 2)}\n`);
    await browser.close();
    console.error(error);
    process.exit(1);
  }
})().catch(error => {
  fs.writeFileSync(path.join(out, 'renderer-fatal.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exit(1);
});
