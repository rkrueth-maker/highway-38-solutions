#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const access=fs.readFileSync(path.join(root,'commercial-app','office-access-completion.js'),'utf8');
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1365,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent('<!doctype html><html><head></head><body><button id="authSignOutButton" type="button">Sign out</button><main id="mainContent"></main></body></html>');
    await page.evaluate(()=>{
      window.PAGE_DEFS={today:['🏠','Today'],work:['🧰','Work'],money:['💵','Money'],accounting:['📚','Accounting'],payroll:['🧮','Payroll Prep'],tax:['🗂️','Tax Prep'],reports:['📊','Reports'],people:['👷','People'],controls:['🛡️','Controls'],settings:['⚙️','Settings']};
      window.state={page:'today',snapshot:{user:{roleName:'Staff',roleId:'staff',permissions:{viewCustomers:true,manageWork:true}}}};
      window.allowedPages=()=>{
        const user=window.state.snapshot.user;
        return user.owner===true||user.permissions?.all===true
          ? ['today','work','money','accounting','payroll','tax','reports','people','controls','settings']
          : ['today','work'];
      };
      const main=document.getElementById('mainContent');
      const head=title=>`<div class="page-head"><h1>${title}</h1></div>`;
      window.renderToday=()=>{main.innerHTML=head('Today')+'<section class="card"><h2>Daily work</h2></section>';};
      window.renderWork=()=>{main.innerHTML=head('Work')+'<section class="card"><h2>Assigned work</h2></section>';};
      window.renderMoney=()=>{main.innerHTML=head('Money')+'<section class="card"><h2>Invoices</h2></section><section class="card"><h2>Record payment</h2></section><section class="card"><h2>Expenses</h2></section>';};
      window.renderAccounting=()=>{main.innerHTML=head('Accounting')+'<section class="card"><h2>Vendors</h2></section><section class="card"><h2>Purchase orders</h2></section>';};
      window.renderPayrollPrep=()=>{main.innerHTML=head('Payroll Preparation');};
      window.renderTaxPrep=()=>{main.innerHTML=head('Tax Preparation');};
      window.renderReports=()=>{main.innerHTML=head('Reports');};
      window.renderPeople=()=>{main.innerHTML=head('People & Employees')+'<section class="card"><h2>Team Access</h2></section><section class="card"><h2>Employees</h2></section><section class="card"><h2>Recent time</h2></section>';};
      window.renderControls=()=>{main.innerHTML=head('Controls');};
      window.renderSettings=()=>{main.innerHTML=head('Settings');};
      const renderers={today:'renderToday',work:'renderWork',money:'renderMoney',accounting:'renderAccounting',payroll:'renderPayrollPrep',tax:'renderTaxPrep',reports:'renderReports',people:'renderPeople',controls:'renderControls',settings:'renderSettings'};
      window.openPage=page=>{window.state.page=page;window[renderers[page]]?.();};
      window.__signOut=0;document.getElementById('authSignOutButton').onclick=()=>window.__signOut++;
    });
    await page.addScriptTag({content:access});

    await page.evaluate(()=>window.openPage('work'));
    await page.evaluate(()=>window.openPage('today'));
    await page.waitForTimeout(30);
    check(await page.locator('#h38AccessRoleContext').count()===1,'Live Staff navigation back to Today must render exactly one role context card.');
    const staffText=await page.locator('#h38AccessRoleContext').innerText();
    check(/Staff view/.test(staffText),'Live Staff navigation must identify the Staff view.');
    check(/accounting, payroll, tax and owner controls are hidden/i.test(staffText),'Staff context must explain restricted Owner/Admin areas.');
    const staffButtons=await page.locator('#h38AccessRoleContext button').allTextContents();
    check(staffButtons.includes('Switch account'),'Live Staff context must keep Switch account reachable.');
    await page.locator('#h38AccessRoleContext button', {hasText:'Switch account'}).click();
    check(await page.evaluate(()=>window.__signOut)===1,'Switch account must invoke the existing secure sign-out control.');

    await page.evaluate(()=>{window.state.snapshot.user={owner:true,roleName:'Owner',roleId:'owner',permissions:{all:true}};window.openPage('money');});
    await page.waitForTimeout(30);
    const financeButtons=await page.locator('#h38FinanceAccessStrip button').allTextContents();
    for(const name of ['Invoices','Payments','Expenses','Accounting','Payroll Prep','Tax Prep','Reports'])check(financeButtons.includes(name),`Live Owner Money navigation missing ${name}.`);

    await page.evaluate(()=>window.openPage('people'));
    await page.waitForTimeout(30);
    const peopleButtons=await page.locator('#h38PeopleAccessStrip button').allTextContents();
    for(const name of ['Team Access','Employees','Time Records','Payroll Prep','Users & Settings'])check(peopleButtons.includes(name),`Live Owner People navigation missing ${name}.`);

    await page.evaluate(()=>{window.openPage('work');window.openPage('today');window.openPage('today');});
    await page.waitForTimeout(30);
    check(await page.locator('#h38AccessRoleContext').count()===1,'Repeated live Today navigation must not duplicate the role context card.');
    const ownerText=await page.locator('#h38AccessRoleContext').innerText();
    check(/Full Office access/.test(ownerText),'Live Owner navigation must restore full Office context on Today.');
    const ownerButtons=await page.locator('#h38AccessRoleContext button').allTextContents();
    for(const name of ['Invoices & Money','Employees','Reports','Office Settings'])check(ownerButtons.includes(name),`Live Owner Today shortcut missing ${name}.`);

    check(errors.length===0,`Browser errors: ${errors.join(' | ')}`);
    check(access.includes('livePageNavigationReconcile:true'),'Access helper must publish the live page navigation reconciliation contract.');
  }catch(error){failures.push(error.stack||error.message||String(error));}
  await browser.close();
  if(failures.length){console.error(JSON.stringify({status:'FAIL',acceptance:'OFFICE_LIVE_NAVIGATION_CONTEXT',failures},null,2));process.exit(1);}
  console.log(JSON.stringify({status:'PASS',acceptance:'OFFICE_LIVE_NAVIGATION_CONTEXT',staffContextSurvivesLiveNavigation:true,ownerAccessStripsSurviveLiveNavigation:true,noDuplicateContext:true,externalActionsOccurred:false},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
