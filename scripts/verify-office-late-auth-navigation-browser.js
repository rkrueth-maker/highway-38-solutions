#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const authority=fs.readFileSync(path.join(root,'commercial-app/desktop-navigation-authority.js'),'utf8');
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};

for(const needle of [
  'lateAuthNavigationPaint:true',
  'pageRenderNavigationReconcile:true',
  "window.addEventListener('h38:office-page-rendered',scheduleFinalReconcile)",
  "window.addEventListener('h38:business-snapshot-updated',scheduleFinalReconcile)",
  "window.addEventListener('h38:auth-cleared',scheduleFinalReconcile)"
])check(authority.includes(needle),`Late-auth navigation contract missing: ${needle}`);

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent('<!doctype html><html><head></head><body><nav id="mainNav" class="main-nav"></nav><main id="mainContent"></main></body></html>');
    await page.evaluate(()=>{
      window.PAGE_DEFS={
        today:['🏠','Today'],customers:['👥','Customers'],work:['🧰','Work'],meetings:['🗣️','Meetings'],quotes:['🧾','Quotes'],schedule:['📅','Schedule'],messages:['💬','Messages'],field:['📷','Field'],
        money:['💵','Money'],accounting:['📚','Accounting'],payroll:['🧮','Payroll Prep'],tax:['🗂️','Tax Prep'],reports:['📊','Reports'],people:['👷','People'],inventory:['📦','Inventory'],fleet:['🚚','Fleet'],documents:['📁','Documents'],social:['📣','Social'],controls:['🛡️','Controls'],ai:['✨','H38 AI'],assistant:['🤖','Assistant'],settings:['⚙️','Settings']
      };
      window.H38_OFFICE_PAGES=['today','customers','work','meetings','quotes','schedule','messages','field','inventory','fleet','money','documents','social','ai','settings'];
      window.state={shell:'office',page:'today',snapshot:null};
      window.allowedPages=()=>[];
      window.renderNav=()=>{};
      window.openPage=page=>{window.state.page=page;window.dispatchEvent(new CustomEvent('h38:office-page-rendered',{detail:{page,shell:'office'}}));};
      window.H38_PROFITABILITY_OPERATING_LAYER={writeSettings(){}};
      window.H38_OFFICE_ACCESS_COMPLETION={placeholder:true};
      window.H38_OFFICE_ACCOUNT_IDENTITY={placeholder:true};
    });
    await page.addScriptTag({content:authority});
    await page.waitForTimeout(25);
    check((await page.locator('#mainNav > button[data-page]').count())===0,'Signed-out startup must not expose Office navigation.');

    await page.evaluate(()=>{
      window.state.snapshot={user:{owner:true,email:'owner@example.test',roleName:'Owner',roleId:'owner',permissions:{all:true}}};
      window.openPage('today');
    });
    await page.waitForTimeout(25);
    const ownerKeys=await page.locator('#mainNav > button[data-page]').evaluateAll(nodes=>nodes.map(node=>node.dataset.page));
    const expectedOwner=['today','customers','work','meetings','quotes','schedule','messages','field','money','accounting','payroll','tax','reports','people','inventory','fleet','documents','social','controls','ai','assistant','settings'];
    check(JSON.stringify(ownerKeys)===JSON.stringify(expectedOwner),`Late-auth Owner navigation did not repaint completely: ${JSON.stringify(ownerKeys)}`);
    const ownerGroups=await page.locator('#mainNav > .h38-nav-section-label').allTextContents();
    check(JSON.stringify(ownerGroups)===JSON.stringify(['Daily work','Money & accounting','Team & assets','Business']),`Late-auth Owner groups mismatch: ${JSON.stringify(ownerGroups)}`);
    check((await page.locator('#mainNav button[data-page="today"]').getAttribute('aria-current'))==='page','Late-auth Today navigation must become active.');

    await page.evaluate(()=>{
      window.state.snapshot.user={email:'staff@example.test',roleName:'Staff',roleId:'staff',permissions:{viewCustomers:true,manageWork:true,viewAssignedWork:true,manageAssignedWork:true,manageQuotes:true,manageSchedule:true,manageCommunications:true,manageField:true,captureEvidence:true,useInventory:true,useAssets:true}};
      window.dispatchEvent(new Event('h38:business-snapshot-updated'));
    });
    await page.waitForTimeout(25);
    const staffKeys=await page.locator('#mainNav > button[data-page]').evaluateAll(nodes=>nodes.map(node=>node.dataset.page));
    for(const key of ['today','customers','work','meetings','quotes','schedule','messages','field','inventory','fleet','documents'])check(staffKeys.includes(key),`Late-auth Staff operational page missing: ${key}`);
    for(const key of ['money','accounting','payroll','tax','reports','people','social','controls','assistant','settings'])check(!staffKeys.includes(key),`Late-auth Staff received restricted page: ${key}`);

    await page.evaluate(()=>{
      window.state.snapshot=null;
      window.dispatchEvent(new Event('h38:auth-cleared'));
    });
    await page.waitForTimeout(25);
    check((await page.locator('#mainNav > button[data-page]').count())===0,'Auth clear must remove previously authorized desktop navigation.');
    check(errors.length===0,`Browser errors: ${errors.join(' | ')}`);
  }catch(error){failures.push(error.stack||error.message||String(error));}
  await browser.close();
  if(failures.length){console.error(JSON.stringify({status:'FAIL',acceptance:'OFFICE_LATE_AUTH_NAVIGATION',failures},null,2));process.exit(1);}
  console.log(JSON.stringify({status:'PASS',acceptance:'OFFICE_LATE_AUTH_NAVIGATION',signedOutNavHidden:true,lateOwnerNavRepainted:true,staffPermissionFiltered:true,authClearRemovesNav:true,externalActionsOccurred:false},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
