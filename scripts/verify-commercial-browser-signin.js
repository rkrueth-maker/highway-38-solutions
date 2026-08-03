#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const BUILD='20260803-1250';
const [publicArg='https://highway38solutions.com/commercial-app/',deploymentArg,credentialsArg]=process.argv.slice(2);
const publicUrl=new URL(publicArg);
const credentialsPath=credentialsArg||path.join(process.env.HOME||'','.clasprc.json');

function fail(message,details={}){console.error(JSON.stringify({status:'FAIL',message,...details},null,2));process.exitCode=1;}
function findByKey(value,keys,seen=new Set()){
  if(!value||typeof value!=='object'||seen.has(value))return'';seen.add(value);
  for(const [key,child] of Object.entries(value))if(keys.includes(key)&&typeof child==='string'&&child.trim())return child.trim();
  for(const child of Object.values(value)){const found=findByKey(child,keys,seen);if(found)return found;}
  return'';
}
function isScriptHost(hostname){return hostname==='script.google.com'||hostname==='script.googleusercontent.com'||hostname.endsWith('.script.googleusercontent.com');}
if(!deploymentArg)throw new Error('Deployment URL is required for browser relay acceptance.');
if(!fs.existsSync(credentialsPath))throw new Error('Authorized Google credential file was not found for browser relay acceptance.');
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
function attachDiagnostics(page,label,consoleMessages,pageErrors){
  page.on('console',message=>consoleMessages.push(`${label}:${message.type()}:${message.text()}`));
  page.on('pageerror',error=>pageErrors.push(`${label}:${error.message}`));
}
async function collectDiagnostics(page,popup,channelId,consoleMessages,pageErrors){
  const popupFrames=popup&&!popup.isClosed()?popup.frames().map(frame=>frame.url()).slice(0,20):[];
  return{channelIdPresent:Boolean(channelId),mainUrl:page&&!page.isClosed()?page.url():'',mainContent:await textOf(page,'#mainContent'),businessStatus:await textOf(page,'#businessStatus'),navButtonCount:page&&!page.isClosed()?await page.locator('#mainNav button').count().catch(()=>0):0,popupUrl:popup&&!popup.isClosed()?popup.url():'',popupStatus:await textOf(popup,'#status'),popupDetail:await textOf(popup,'#detail'),popupFrames,relayFramePresent:popupFrames.some(url=>url.includes('/commercial-app/secure-relay.html')),openerSevered:popup&&!popup.isClosed()?await popup.evaluate(()=>window.opener===null).catch(()=>null):null,consoleMessages:consoleMessages.slice(-30),pageErrors:pageErrors.slice(-30)};
}

(async()=>{
  if(!(await refreshAccessToken())&&!accessToken)throw new Error('The existing Google credential does not contain a usable access token.');
  const browser=await chromium.launch({headless:true});
  let page=null,popup=null,channelId='',visibleSelector='';
  const consoleMessages=[],pageErrors=[];
  try{
    const context=await browser.newContext();
    await context.addInitScript(()=>{
      if(location.hostname==='highway38solutions.com'||location.hostname==='www.highway38solutions.com'){
        const stalledIndexedDb={open(){return{};}};try{Object.defineProperty(window,'indexedDB',{configurable:true,value:stalledIndexedDb});}catch(error){window.indexedDB=stalledIndexedDb;}
      }
      if(location.hostname==='script.google.com'||location.hostname==='script.googleusercontent.com'||location.hostname.endsWith('.script.googleusercontent.com')){try{window.opener=null;}catch(error){}}
    });
    let authorizeStarted=false;
    await context.route('**/*',async route=>{
      const request=route.request();let parsed;try{parsed=new URL(request.url());}catch(error){await route.continue();return;}
      if(!isScriptHost(parsed.hostname)){await route.continue();return;}
      if(!authorizeStarted){await route.abort();return;}
      await route.continue({headers:{...request.headers(),authorization:`Bearer ${accessToken}`}});
    });

    page=await context.newPage();attachDiagnostics(page,'office',consoleMessages,pageErrors);
    const target=new URL(publicUrl);target.searchParams.set('browserAcceptanceBuild',BUILD);
    await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForTimeout(1000);
    const initialOfficeErrors=pageErrors.filter(message=>message.startsWith('office:'));
    if(initialOfficeErrors.length)throw new Error(`Office runtime failed before sign-in: ${initialOfficeErrors.join(' | ')}`);
    const selector='#secureSignInButton, #watchdogSecureSignInButton';
    await page.waitForSelector(selector,{state:'visible',timeout:22000});
    visibleSelector=await page.locator('#secureSignInButton').isVisible().catch(()=>false)?'#secureSignInButton':'#watchdogSecureSignInButton';
    channelId=await page.evaluate(()=>window.H38_BRIDGE_CHANNEL||'');
    const directHref=await page.locator(visibleSelector).getAttribute('href');
    if(!channelId||!directHref||!directHref.includes(`channel=${encodeURIComponent(channelId)}`))throw new Error('The visible secure sign-in link is missing its per-tab relay channel.');

    authorizeStarted=true;
    const popupPromise=page.waitForEvent('popup',{timeout:10000});
    await page.click(visibleSelector);
    popup=await popupPromise;attachDiagnostics(popup,'popup',consoleMessages,pageErrors);
    await popup.waitForLoadState('domcontentloaded',{timeout:30000});
    await page.waitForFunction(()=>{
      const main=(document.getElementById('mainContent')?.textContent||'').trim();
      const status=(document.getElementById('businessStatus')?.textContent||'').trim();
      const waiting=/Sign in to open Business Office|Opening Highway 38 Business Office|Finish secure sign-in/.test(main);
      return !waiting&&(/Office open|latest records loaded/i.test(status)||document.querySelectorAll('#mainNav button').length>3);
    },undefined,{timeout:90000,polling:250});

    const officeErrors=pageErrors.filter(message=>message.startsWith('office:'));
    if(officeErrors.length)throw new Error(`Office runtime reported page errors: ${officeErrors.join(' | ')}`);
    const popupHost=new URL(popup.url()).hostname;
    const popupStatus=await textOf(popup,'#status');
    const businessStatus=await textOf(page,'#businessStatus');
    const officeText=await textOf(page,'#mainContent',240);
    const relayFramePresent=popup.frames().some(frame=>frame.url().includes('/commercial-app/secure-relay.html')&&frame.url().includes(`channel=${encodeURIComponent(channelId)}`));
    const openerSevered=await popup.evaluate(()=>window.opener===null).catch(()=>false);
    if(!isScriptHost(popupHost))throw new Error(`Authorized popup ended on unexpected host: ${popupHost}`);
    if(!relayFramePresent)throw new Error('The authorized popup did not load the same-origin Highway 38 relay.');
    if(!openerSevered)throw new Error('The browser acceptance did not sever window.opener, so it did not reproduce the recorded failure.');

    console.log(JSON.stringify({status:'PASS',acceptance:'BROWSER_AUTHORIZED_ISOLATED_RELAY_BOOTSTRAP_WITH_OPENER_SEVERED',build:BUILD,publicUrl:target.toString(),deploymentUrl:deploymentArg,clickedSelector:visibleSelector,channelPresent:true,popupHost,popupStatus,businessStatus,officeText,relayFramePresent:true,openerSevered:true,indexedDbWasStalled:true,officeRuntimeErrors:0,officeReceivedBootstrap:true},null,2));
  }catch(error){const diagnostics=await collectDiagnostics(page,popup,channelId,consoleMessages,pageErrors);fail('Browser-level authorized isolated relay acceptance failed.',{error:error.message,build:BUILD,clickedSelector:visibleSelector,...diagnostics});}
  finally{await browser.close();}
})();
