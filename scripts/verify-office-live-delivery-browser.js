#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const authority=read('commercial-app/desktop-navigation-authority.js');
const identity=read('commercial-app/office-account-identity.js');
const worker=read('commercial-app/service-worker.js');
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};

for(const needle of [
  "ACCOUNT_IDENTITY_BUILD='20260910-office-account-identity-1'",
  'loadOfficeAccountIdentity()',
  'explicitSignedInAccountIdentity:true',
  "OFFICE_ACCESS_BUILD='20260910-office-access-completion-2-live'"
])check(authority.includes(needle),`Desktop live authority contract missing: ${needle}`);
for(const needle of [
  "CACHE_NAME='h38-business-office-20260910-nav-core-3'",
  "'office-access-completion.js'",
  "'office-account-identity.js'",
  'function freshLiveRequest(request,file)',
  "freshUrl.searchParams.set('h38sw',CACHE_NAME)",
  "fetch(networkRequest,{cache:'no-store'})"
])check(worker.includes(needle),`Service-worker live delivery contract missing: ${needle}`);
for(const needle of [
  'permissionEscalation:false','automaticApproval:false','automaticSending:false','automaticPurchase:false','automaticPayment:false',
  "button.textContent='Switch account'"
])check(identity.includes(needle),`Account identity safety contract missing: ${needle}`);
check(!identity.includes('permissions='),'Account identity helper must never mutate permissions.');
check(!identity.includes('user.role='),'Account identity helper must never mutate roles.');

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  try{
    await page.setContent(`<!doctype html><html><head></head><body><header></header><section class="business-bar"><span id="businessStatus">Highway 38 Solutions · Staff · Office online</span></section><button id="authSignOutButton" type="button">Sign out</button><main id="mainContent"></main></body></html>`);
    await page.evaluate(()=>{
      window.__signOutCount=0;
      document.getElementById('authSignOutButton').onclick=()=>window.__signOutCount++;
      window.state={shell:'office',page:'today',snapshot:{user:{email:'review@example.test',roleName:'Staff',roleId:'staff',permissions:{viewCustomers:true}}}};
    });
    await page.addScriptTag({content:identity});
    await page.waitForTimeout(30);
    const initial=await page.locator('#h38OfficeAccountIdentity').innerText();
    check(initial.includes('review@example.test')&&/Staff/i.test(initial),'Staff identity must show exact signed-in email and role.');
    check((await page.locator('#h38OfficeAccountIdentity button').innerText())==='Switch account','Identity must expose Switch account.');
    await page.locator('#h38OfficeAccountIdentity button').click();
    check((await page.evaluate(()=>window.__signOutCount))===1,'Switch account must use the existing sign-out authority exactly once.');
    await page.evaluate(()=>{
      window.state.snapshot.user={email:'owner@example.test',roleName:'Owner',roleId:'owner',owner:true,permissions:{all:true}};
      window.dispatchEvent(new Event('h38:business-snapshot-updated'));
    });
    await page.waitForTimeout(20);
    const owner=await page.locator('#h38OfficeAccountIdentity').innerText();
    check(owner.includes('owner@example.test')&&/Owner/i.test(owner),'Identity must update when the authoritative membership changes.');
    check((await page.evaluate(()=>document.body.dataset.h38OfficeRole))==='owner','Body role marker must reflect the current role without granting permissions.');
    await page.evaluate(()=>{window.state.snapshot=null;window.dispatchEvent(new Event('h38:auth-cleared'));});
    await page.waitForTimeout(20);
    check((await page.locator('#h38OfficeAccountIdentity').count())===0,'Identity must clear when authentication is cleared.');
    check(pageErrors.length===0,`Browser errors: ${pageErrors.join(' | ')}`);
  }catch(error){failures.push(error.stack||error.message||String(error));}
  await browser.close();
  if(failures.length){console.error(JSON.stringify({status:'FAIL',acceptance:'OFFICE_LIVE_DELIVERY_AND_IDENTITY',failures},null,2));process.exit(1);}
  console.log(JSON.stringify({status:'PASS',acceptance:'OFFICE_LIVE_DELIVERY_AND_IDENTITY',warmBrowserCacheBust:true,signedInIdentityVisible:true,roleVisible:true,switchAccountSafe:true,permissionEscalation:false,externalActionsOccurred:false},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
