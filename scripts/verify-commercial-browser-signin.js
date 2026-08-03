#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const BUILD='20260803-1700';
const GATEWAY_HOST='jqukmwtsgcsaruucnqja.supabase.co';
const [publicArg='https://highway38solutions.com/commercial-app/',deploymentArg,credentialsArg]=process.argv.slice(2);
const publicUrl=new URL(publicArg);
const launcherUrl=new URL('/open-business-office.html',publicUrl);
const credentialsPath=credentialsArg||path.join(process.env.HOME||'','.clasprc.json');

function fail(message,details={}){console.error(JSON.stringify({status:'FAIL',message,...details},null,2));process.exitCode=1;}
function findByKey(value,keys,seen=new Set()){
  if(!value||typeof value!=='object'||seen.has(value))return'';seen.add(value);
  for(const [key,child] of Object.entries(value))if(keys.includes(key)&&typeof child==='string'&&child.trim())return child.trim();
  for(const child of Object.values(value)){const found=findByKey(child,keys,seen);if(found)return found;}
  return'';
}
function isScriptHost(hostname){return hostname==='script.google.com'||hostname==='script.googleusercontent.com'||hostname.endsWith('.script.googleusercontent.com');}
function isHighwayHost(hostname){return hostname==='highway38solutions.com'||hostname==='www.highway38solutions.com';}
if(!deploymentArg)throw new Error('Deployment URL is required for gateway browser acceptance.');
if(!fs.existsSync(credentialsPath))throw new Error('Authorized Google credential file was not found for gateway browser acceptance.');
let credentials={};
try{credentials=JSON.parse(fs.readFileSync(credentialsPath,'utf8'));}catch(error){throw new Error(`Authorized Google credential file is not valid JSON: ${error.message}`);}
let accessToken=findByKey(credentials,['access_token','accessToken']);
const refreshToken=findByKey(credentials,['refresh_token','refreshToken']);
const clientId=findByKey(credentials,['client_id','clientId']);
const clientSecret=findByKey(credentials,['client_secret','clientSecret']);

async function refreshAccessToken(){
  if(!(refreshToken&&clientId&&clientSecret))return false;
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})});
  if(!response.ok)return false;const payload=await response.json();if(!payload.access_token)return false;accessToken=payload.access_token;return true;
}
async function textOf(page,selector,limit=500){if(!page||page.isClosed())return'';return(((await page.locator(selector).textContent().catch(()=>''))||'').trim()).slice(0,limit);}
async function clickAuthorizedOfficeButton(page){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    for(const frame of page.frames()){
      const button=frame.locator('#continueButton');
      if(!(await button.count().catch(()=>0)))continue;
      const disabled=await button.getAttribute('aria-disabled').catch(()=>'true');
      const ready=await button.getAttribute('data-ready').catch(()=>'');
      if(disabled==='false'&&ready==='true'){
        await button.click({timeout:15000});
        return;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error('The authorized Google page did not present the secure gateway Open Business Office button.');
}
async function browserSecurityState(page){
  if(!page||page.isClosed())return{};
  return page.evaluate(()=>{
    const policy=document.permissionsPolicy||document.featurePolicy||null;
    const values=[];for(let index=0;index<sessionStorage.length;index++){const key=sessionStorage.key(index);values.push({key,value:sessionStorage.getItem(key)||''});}
    const serialized=JSON.stringify(values);
    const gateway=window.H38_GATEWAY_SESSION||null;
    return{
      mediaDevices:!!navigator.mediaDevices,
      cameraAllowed:policy&&policy.allowsFeature?policy.allowsFeature('camera'):true,
      microphoneAllowed:policy&&policy.allowsFeature?policy.allowsFeature('microphone'):true,
      topLevel:window.top===window,
      hashCleared:location.hash==='',
      transport:window.H38_ACTIVE_BRIDGE?.transport||'',
      gatewaySessionPresent:!!gateway?.gatewaySession,
      gatewayUrl:String(gateway?.gatewayUrl||''),
      gatewayOpaqueLength:String(gateway?.gatewaySession||'').length,
      executionSessionPresent:!!window.H38_EXECUTION_SESSION,
      accessTokenPropertyPresent:!!gateway&&Object.prototype.hasOwnProperty.call(gateway,'accessToken'),
      browserGoogleTokenPresent:/ya29\.|"accessToken"\s*:|Bearer\s+ya29\./i.test(serialized),
      sessionKeys:values.map(item=>item.key)
    };
  }).catch(()=>({}));
}
async function collectDiagnostics(page,context,consoleMessages,pageErrors,secondaryPages,gatewayResponses){
  return{
    currentUrl:page&&!page.isClosed()?page.url():'',
    title:page&&!page.isClosed()?await page.title().catch(()=>''):'',
    frames:page&&!page.isClosed()?page.frames().map(frame=>frame.url()).slice(0,20):[],
    mainContent:await textOf(page,'#mainContent'),
    businessStatus:await textOf(page,'#businessStatus'),
    navButtonCount:page&&!page.isClosed()?await page.locator('#mainNav button').count().catch(()=>0):0,
    browserSecurity:await browserSecurityState(page),
    gatewayResponses:gatewayResponses.slice(-20),
    secondaryPageCount:context?Math.max(0,context.pages().length-1):0,
    secondaryPages:secondaryPages.slice(-10),
    consoleMessages:consoleMessages.slice(-30),
    pageErrors:pageErrors.slice(-30)
  };
}

(async()=>{
  if(!(await refreshAccessToken())&&!accessToken)throw new Error('The existing Google credential does not contain a usable access token.');
  const browser=await chromium.launch({headless:true});
  let context=null,page=null;
  const consoleMessages=[],pageErrors=[],secondaryPages=[],gatewayResponses=[];
  try{
    context=await browser.newContext();
    context.on('page',opened=>{if(page&&opened!==page)secondaryPages.push(opened.url()||'about:blank');});
    await context.route('**/*',async route=>{
      const request=route.request();let parsed;try{parsed=new URL(request.url());}catch(error){await route.continue();return;}
      if(!isScriptHost(parsed.hostname)){await route.continue();return;}
      await route.continue({headers:{...request.headers(),authorization:`Bearer ${accessToken}`}});
    });
    context.on('response',response=>{try{const url=new URL(response.url());if(url.hostname===GATEWAY_HOST)gatewayResponses.push({status:response.status(),method:response.request().method(),url:url.pathname});}catch(error){}});

    page=await context.newPage();
    page.on('console',message=>consoleMessages.push(`${message.type()}:${message.location().url||page.url()}:${message.text()}`));
    page.on('pageerror',error=>pageErrors.push(`${error.message}`));
    const target=new URL(launcherUrl);target.searchParams.set('browserAcceptanceBuild',BUILD);
    await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForURL(url=>{try{return isScriptHost(new URL(url).hostname);}catch(error){return false;}},{timeout:60000});
    await clickAuthorizedOfficeButton(page);
    await page.waitForURL(url=>{try{const parsed=new URL(url);return isHighwayHost(parsed.hostname)&&parsed.pathname.includes('/commercial-app/');}catch(error){return false;}},{timeout:90000});
    await page.waitForFunction(()=>{
      const status=(document.getElementById('businessStatus')?.textContent||'').trim();
      return /Office open|latest records loaded/i.test(status)&&document.querySelectorAll('#mainNav button').length>3&&!!window.H38_ACTIVE_BRIDGE?.ready;
    },undefined,{timeout:120000,polling:250});

    const apiResult=await page.evaluate(()=>window.H38_ACTIVE_BRIDGE.request('visibleBusinesses',{},90000));
    const security=await browserSecurityState(page);
    const current=new URL(page.url());
    const officeErrors=pageErrors.filter(Boolean);
    const secondaryPageCount=Math.max(0,context.pages().length-1);
    const businessStatus=await textOf(page,'#businessStatus');
    const officeText=await textOf(page,'#mainContent',260);
    const navButtonCount=await page.locator('#mainNav button').count();
    if(!isHighwayHost(current.hostname)||!current.pathname.includes('/commercial-app/'))throw new Error(`Office did not return to the Highway 38 top-level app: ${page.url()}`);
    if(secondaryPageCount!==0)throw new Error(`The Office opened ${secondaryPageCount} extra browser window(s).`);
    if(officeErrors.length)throw new Error(`Office runtime reported page errors: ${officeErrors.join(' | ')}`);
    if(!Array.isArray(apiResult)||!apiResult.length)throw new Error('The secure gateway did not return an authorized business list.');
    if(!security.topLevel||!security.hashCleared||!security.gatewaySessionPresent||security.transport!=='supabase-gateway')throw new Error(`The top-level gateway session is incomplete: ${JSON.stringify(security)}`);
    if(security.executionSessionPresent||security.accessTokenPropertyPresent||security.browserGoogleTokenPresent)throw new Error(`A Google OAuth token or legacy execution session reached the browser: ${JSON.stringify(security)}`);
    if(!String(security.gatewayUrl||'').includes(`${GATEWAY_HOST}/functions/v1/h38-office-gateway`))throw new Error(`The Office is using an unexpected gateway: ${security.gatewayUrl}`);
    if(!security.mediaDevices||!security.cameraAllowed||!security.microphoneAllowed)throw new Error(`The top-level Office blocks field permissions: ${JSON.stringify(security)}`);
    if(!gatewayResponses.some(item=>item.method==='POST'&&item.status>=200&&item.status<300))throw new Error('No successful live Supabase gateway POST was observed.');

    console.log(JSON.stringify({status:'PASS',acceptance:'BROWSER_AUTHORIZED_TOP_LEVEL_GATEWAY_OFFICE',build:BUILD,launcherUrl:target.toString(),deploymentUrl:deploymentArg,officeUrl:page.url(),businessStatus,officeText,navButtonCount,authorizationContinueClick:true,gatewayBusinessCount:apiResult.length,gatewayResponses,topLevelOffice:true,supabaseGatewayTransport:true,browserGoogleTokenPresent:false,cameraAllowed:true,microphoneAllowed:true,secondaryPageCount:0,persistentAuthWindow:false,officeRuntimeErrors:0,officeReceivedBootstrap:true},null,2));
  }catch(error){const diagnostics=page?await collectDiagnostics(page,context,consoleMessages,pageErrors,secondaryPages,gatewayResponses):{};fail('Browser-level authorized gateway Office acceptance failed.',{error:error.message,build:BUILD,...diagnostics});}
  finally{await browser.close();}
})();
