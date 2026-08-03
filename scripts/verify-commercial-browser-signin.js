#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const BUILD='20260803-1405';
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
if(!deploymentArg)throw new Error('Deployment URL is required for same-tab browser acceptance.');
if(!fs.existsSync(credentialsPath))throw new Error('Authorized Google credential file was not found for same-tab browser acceptance.');
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
async function textOf(frame,selector,limit=500){if(!frame)return'';return(((await frame.locator(selector).textContent().catch(()=>''))||'').trim()).slice(0,limit);}
async function waitForOfficeFrame(page){
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){
    const frame=page.frames().find(candidate=>{try{const url=new URL(candidate.url());return (url.hostname==='highway38solutions.com'||url.hostname==='www.highway38solutions.com')&&url.pathname.includes('/commercial-app/')&&url.searchParams.get('embedded')==='1';}catch(error){return false;}});
    if(frame)return frame;
    await page.waitForTimeout(250);
  }
  throw new Error('The authenticated Google host did not load the embedded Highway 38 Office.');
}
async function collectDiagnostics(page,officeFrame,context,consoleMessages,pageErrors,secondaryPages){
  return{
    hostUrl:page&&!page.isClosed()?page.url():'',
    hostTitle:page&&!page.isClosed()?await page.title().catch(()=>''):'',
    hostFrames:page&&!page.isClosed()?page.frames().map(frame=>frame.url()).slice(0,20):[],
    officeUrl:officeFrame?officeFrame.url():'',
    mainContent:await textOf(officeFrame,'#mainContent'),
    businessStatus:await textOf(officeFrame,'#businessStatus'),
    navButtonCount:officeFrame?await officeFrame.locator('#mainNav button').count().catch(()=>0):0,
    secondaryPageCount:context?Math.max(0,context.pages().length-1):0,
    secondaryPages:secondaryPages.slice(-10),
    consoleMessages:consoleMessages.slice(-30),
    pageErrors:pageErrors.slice(-30)
  };
}

(async()=>{
  if(!(await refreshAccessToken())&&!accessToken)throw new Error('The existing Google credential does not contain a usable access token.');
  const browser=await chromium.launch({headless:true});
  let context=null,page=null,officeFrame=null;
  const consoleMessages=[],pageErrors=[],secondaryPages=[];
  try{
    context=await browser.newContext();
    context.on('page',opened=>{if(page&&opened!==page)secondaryPages.push(opened.url()||'about:blank');});
    await context.route('**/*',async route=>{
      const request=route.request();let parsed;try{parsed=new URL(request.url());}catch(error){await route.continue();return;}
      if(!isScriptHost(parsed.hostname)){await route.continue();return;}
      await route.continue({headers:{...request.headers(),authorization:`Bearer ${accessToken}`}});
    });

    page=await context.newPage();
    page.on('console',message=>consoleMessages.push(`${message.type()}:${message.location().url||page.url()}:${message.text()}`));
    page.on('pageerror',error=>pageErrors.push(`${error.message}`));
    const target=new URL(launcherUrl);target.searchParams.set('browserAcceptanceBuild',BUILD);
    await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForURL(url=>{try{return isScriptHost(new URL(url).hostname);}catch(error){return false;}},{timeout:60000});
    officeFrame=await waitForOfficeFrame(page);
    await officeFrame.waitForFunction(()=>{
      const status=(document.getElementById('businessStatus')?.textContent||'').trim();
      return /Office open|latest records loaded/i.test(status)&&document.querySelectorAll('#mainNav button').length>3;
    },undefined,{timeout:90000,polling:250});

    const apiResult=await officeFrame.evaluate(()=>new Promise((resolve,reject)=>{
      const requestId=`acceptance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer=setTimeout(()=>{removeEventListener('message',listener);reject(new Error('Parent API acceptance timed out.'));},30000);
      function listener(event){const message=event.data||{};if(message.type!=='H38_BRIDGE_RESPONSE'||message.requestId!==requestId)return;clearTimeout(timer);removeEventListener('message',listener);message.ok?resolve(message.result):reject(new Error(message.error||'Parent API request failed.'));}
      addEventListener('message',listener);parent.postMessage({type:'H38_BRIDGE_REQUEST',requestId,action:'visibleBusinesses',args:{}},'*');
    }));

    const hostName=new URL(page.url()).hostname;
    const officeErrors=pageErrors.filter(Boolean);
    const secondaryPageCount=Math.max(0,context.pages().length-1);
    const businessStatus=await textOf(officeFrame,'#businessStatus');
    const officeText=await textOf(officeFrame,'#mainContent',260);
    const navButtonCount=await officeFrame.locator('#mainNav button').count();
    if(!isScriptHost(hostName))throw new Error(`Same-tab Office ended on unexpected host: ${hostName}`);
    if(secondaryPageCount!==0)throw new Error(`The Office opened ${secondaryPageCount} extra browser window(s).`);
    if(officeErrors.length)throw new Error(`Office runtime reported page errors: ${officeErrors.join(' | ')}`);
    if(!Array.isArray(apiResult)||!apiResult.length)throw new Error('The authenticated parent API did not return an authorized business list.');

    console.log(JSON.stringify({status:'PASS',acceptance:'BROWSER_AUTHORIZED_SAME_TAB_PARENT_OFFICE',build:BUILD,launcherUrl:target.toString(),deploymentUrl:deploymentArg,hostUrl:page.url(),hostName,officeUrl:officeFrame.url(),businessStatus,officeText,navButtonCount,sameTabParentTransport:true,parentApiBusinessCount:apiResult.length,secondaryPageCount:0,persistentAuthWindow:false,officeRuntimeErrors:0,officeReceivedBootstrap:true},null,2));
  }catch(error){const diagnostics=page?await collectDiagnostics(page,officeFrame,context,consoleMessages,pageErrors,secondaryPages):{};fail('Browser-level authorized same-tab Office acceptance failed.',{error:error.message,build:BUILD,...diagnostics});}
  finally{await browser.close();}
})();
