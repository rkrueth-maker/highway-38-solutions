#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const authority=read('commercial-app/desktop-navigation-authority.js');
const access=read('commercial-app/office-access-completion.js');
const app19=read('commercial-app/app-19.js');
const money=read('commercial-app/app-13.js');
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};

for(const needle of [
  "people:['manageUsers']","accounting:['manageFinancial','viewFinancial']","payroll:['manageFinancial']","tax:['manageFinancial']",
  'function renderPeople()','function renderAccounting()','function renderPayrollPrep()','function renderTaxPrep()','function renderReports()'
])check(app19.includes(needle),`Existing Office function missing: ${needle}`);
for(const needle of ['function renderMoney()','<h2>Invoice draft</h2>','<h2>Record payment</h2>','<h2>Invoices</h2>','<h2>Expenses</h2>'])check(money.includes(needle),`Money workspace missing: ${needle}`);
for(const needle of ['completeOwnerOfficeNavigation:true','groupedOwnerOfficeNavigation:true','permissionEscalation:false','automaticPayrollFunding:false','automaticTaxFiling:false','loadOfficeAccessCompletion()'])check(authority.includes(needle),`Desktop authority contract missing: ${needle}`);
for(const needle of ['permissionEscalation:false','automaticApproval:false','automaticSending:false','automaticPurchase:false','automaticPayment:false','automaticPayrollFunding:false','automaticTaxFiling:false'])check(access.includes(needle),`Access helper safety contract missing: ${needle}`);
check(!access.includes('user.permissions='),'Access helper must never mutate user permissions.');

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent(`<!doctype html><html><head></head><body><button id="authSignOutButton" type="button">Sign out</button><nav id="mainNav" class="main-nav"></nav><main id="mainContent"></main></body></html>`);
    await page.evaluate(()=>{
      window.PAGE_DEFS={
        today:['🏠','Today'],customers:['👥','Customers'],work:['🧰','Work'],meetings:['🗣️','Meetings'],quotes:['🧾','Quotes'],schedule:['📅','Schedule'],messages:['💬','Messages'],field:['📷','Field'],
        money:['💵','Money'],accounting:['📚','Accounting'],payroll:['🧮','Payroll Prep'],tax:['🗂️','Tax Prep'],reports:['📊','Reports'],people:['👷','People'],inventory:['📦','Inventory'],fleet:['🚚','Fleet'],documents:['📁','Documents'],social:['📣','Social'],controls:['🛡️','Controls'],ai:['✨','H38 AI'],settings:['⚙️','Settings']
      };
      // Deliberately stale/stripped input list: final authority must recover the complete Office from real page definitions.
      window.H38_OFFICE_PAGES=['today','customers','work','quotes','schedule','messages','field','inventory','fleet','money','documents','social','ai','settings'];
      window.state={shell:'office',page:'today',snapshot:{user:{owner:true,roleName:'Owner',roleId:'owner',permissions:{all:true}}}};
      window.allowedPages=()=>window.H38_OFFICE_PAGES.slice();
      window.renderNav=()=>{};
      window.openPage=page=>{window.state.page=page;};
      window.H38_PROFITABILITY_OPERATING_LAYER={writeSettings(){}};
      window.H38_OFFICE_ACCESS_COMPLETION={placeholder:true};
    });
    await page.addScriptTag({content:authority});
    await page.waitForTimeout(30);
    const ownerKeys=await page.locator('#mainNav > button[data-page]').evaluateAll(nodes=>nodes.map(node=>node.dataset.page));
    const expectedOwner=['today','customers','work','meetings','quotes','schedule','messages','field','money','accounting','payroll','tax','reports','people','inventory','fleet','documents','social','controls','ai','settings'];
    check(JSON.stringify(ownerKeys)===JSON.stringify(expectedOwner),`Owner complete navigation mismatch: ${JSON.stringify(ownerKeys)}`);
    const groups=await page.locator('#mainNav > .h38-nav-section-label').allTextContents();
    check(JSON.stringify(groups)===JSON.stringify(['Daily work','Money & accounting','Team & assets','Business']),`Owner navigation groups mismatch: ${JSON.stringify(groups)}`);

    await page.evaluate(()=>{
      window.state.snapshot.user={roleName:'Staff',roleId:'staff',permissions:{viewCustomers:true,manageWork:true,viewAssignedWork:true,manageAssignedWork:true,manageQuotes:true,manageSchedule:true,manageCommunications:true,manageField:true,captureEvidence:true,useInventory:true,useAssets:true}};
      window.H38_DESKTOP_NAVIGATION_AUTHORITY.reconcile();
    });
    const staffKeys=await page.locator('#mainNav > button[data-page]').evaluateAll(nodes=>nodes.map(node=>node.dataset.page));
    for(const key of ['money','accounting','payroll','tax','reports','people','controls','settings','social'])check(!staffKeys.includes(key),`Staff must not receive restricted ${key} navigation.`);
    for(const key of ['today','customers','work','meetings','quotes','schedule','messages','field','inventory','fleet','documents'])check(staffKeys.includes(key),`Staff expected operational page missing: ${key}`);

    await page.evaluate(()=>{
      const main=document.getElementById('mainContent');
      const head=title=>`<div class="page-head"><h1>${title}</h1></div>`;
      window.renderToday=function(){window.state.page='today';main.innerHTML=head('Today');};
      window.renderMoney=function(){window.state.page='money';main.innerHTML=head('Money')+'<section class="card"><h2>Invoice draft</h2></section><section class="card"><h2>Record payment</h2></section><section class="card"><h2>Expenses</h2></section><section class="card"><h2>Invoices</h2></section>';};
      window.renderPeople=function(){window.state.page='people';main.innerHTML=head('People & Employees')+'<section class="card"><h2>Team Access</h2></section><section class="card"><h2>Employees</h2></section><section class="card"><h2>Recent time</h2></section>';};
      window.renderAccounting=function(){window.state.page='accounting';main.innerHTML=head('Accounting Preparation')+'<section class="card"><h2>Vendors</h2></section><section class="card"><h2>Purchase orders</h2></section>';};
      window.renderPayrollPrep=function(){window.state.page='payroll';main.innerHTML=head('Payroll Preparation');};
      window.renderTaxPrep=function(){window.state.page='tax';main.innerHTML=head('Tax Preparation');};
      window.renderReports=function(){window.state.page='reports';main.innerHTML=head('Reports');};
      window.renderControls=function(){window.state.page='controls';main.innerHTML=head('Controls');};
      window.renderSettings=function(){window.state.page='settings';main.innerHTML=head('Settings');};
      delete window.H38_OFFICE_ACCESS_COMPLETION;
      window.__signOut=0;document.getElementById('authSignOutButton').onclick=()=>window.__signOut++;
    });
    await page.addScriptTag({content:access});

    await page.evaluate(()=>{window.state.snapshot.user={owner:true,roleName:'Owner',roleId:'owner',permissions:{all:true}};window.H38_DESKTOP_NAVIGATION_AUTHORITY.reconcile();window.renderMoney();});
    await page.waitForTimeout(20);
    const financeButtons=await page.locator('#h38FinanceAccessStrip button').allTextContents();
    for(const name of ['Invoices','Payments','Expenses','Accounting','Payroll Prep','Tax Prep','Reports'])check(financeButtons.includes(name),`Money access missing ${name}.`);

    await page.evaluate(()=>window.renderPeople());await page.waitForTimeout(20);
    const peopleButtons=await page.locator('#h38PeopleAccessStrip button').allTextContents();
    for(const name of ['Team Access','Employees','Time Records','Payroll Prep','Users & Settings'])check(peopleButtons.includes(name),`People access missing ${name}.`);

    await page.evaluate(()=>{window.state.snapshot.user={roleName:'Staff',roleId:'staff',permissions:{viewCustomers:true,manageWork:true,viewAssignedWork:true,manageAssignedWork:true,manageQuotes:true,manageSchedule:true,manageCommunications:true,manageField:true,captureEvidence:true,useInventory:true,useAssets:true}};window.H38_DESKTOP_NAVIGATION_AUTHORITY.reconcile();window.renderToday();});
    await page.waitForTimeout(20);
    const restricted=await page.locator('#h38AccessRoleContext').innerText();
    check(/Staff view/.test(restricted)&&/hidden by your signed-in permissions/.test(restricted),'Staff Today must explain restricted financial/admin access.');
    check((await page.locator('#h38AccessRoleContext button').allTextContents()).includes('Switch account'),'Staff Today must expose Switch account.');

    await page.evaluate(()=>{window.state.snapshot.user={owner:true,roleName:'Owner',roleId:'owner',permissions:{all:true}};window.H38_DESKTOP_NAVIGATION_AUTHORITY.reconcile();window.renderToday();});
    await page.waitForTimeout(20);
    const full=await page.locator('#h38AccessRoleContext').innerText();
    const fullButtons=await page.locator('#h38AccessRoleContext button').allTextContents();
    check(/Full Office access/.test(full),'Owner Today must identify full Office access.');
    for(const name of ['Invoices & Money','Employees','Reports','Office Settings'])check(fullButtons.includes(name),`Owner Today shortcut missing ${name}.`);

    check(errors.length===0,`Browser errors: ${errors.join(' | ')}`);
  }catch(error){failures.push(error.stack||error.message||String(error));}
  await browser.close();
  if(failures.length){console.error(JSON.stringify({status:'FAIL',acceptance:'COMPLETE_OFFICE_ACCESS',failures},null,2));process.exit(1);}
  console.log(JSON.stringify({status:'PASS',acceptance:'COMPLETE_OFFICE_ACCESS',ownerCompleteNavigation:true,staffPermissionFiltered:true,invoicesReachable:true,employeesReachable:true,accountingReachable:true,payrollTaxReportsReachable:true,externalActionsOccurred:false},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
