#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const [credentialsArg='']=process.argv.slice(2);
const credentialsPath=credentialsArg||path.join(process.env.HOME||'','.clasprc.json');
const launcherUrl='https://highway38solutions.com/open-business-office.html?gatewayDiagnostic=20260803-1700';
const gatewayHost='jqukmwtsgcsaruucnqja.supabase.co';
const evidenceDir=path.resolve(process.env.GITHUB_WORKSPACE||path.join(__dirname,'..'),'artifacts/commercial-google-native-beta');

function findByKey(value,keys,seen=new Set()){
  if(!value||typeof value!=='object'||seen.has(value))return'';
  seen.add(value);
  for(const [key,child] of Object.entries(value))if(keys.includes(key)&&typeof child==='string'&&child.trim())return child.trim();
  for(const child of Object.values(value)){const found=findByKey(child,keys,seen);if(found)return found;}
  return'';
}
function redact(value,limit=5000){
  return String(value||'')
    .replace(/ya29\.[A-Za-z0-9._-]+/g,'[REDACTED_GOOGLE_TOKEN]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [REDACTED]')
    .replace(/[A-Za-z0-9_-]{180,}/g,'[REDACTED_LONG_VALUE]')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,limit);
}
function isScriptHost(hostname){
  return hostname==='script.google.com'||
    hostname==='script.googleusercontent.com'||
    hostname.endsWith('.script.googleusercontent.com')||
    hostname.endsWith('-script.googleusercontent.com');
}
async function readJson(response){const text=await response.text();try{return text?JSON.parse(text):{};}catch(error){return{};}}
async function refreshAccessToken(credentials){
  let token=findByKey(credentials,['access_token','accessToken']);
  const refreshToken=findByKey(credentials,['refresh_token','refreshToken']);
  const clientId=findByKey(credentials,['client_id','clientId']);
  const clientSecret=findByKey(credentials,['client_secret','clientSecret']);
  if(refreshToken&&clientId&&clientSecret){
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});
    const payload=await readJson(response);
    if(response.ok&&payload.access_token)token=payload.access_token;
  }
  if(!token)throw new Error('No usable Google access token was found.');
  return token;
}
async function frameState(frame){
  const body=redact(await frame.locator('body').innerText().catch(()=>''),7000);
  const status=redact(await frame.locator('#status').textContent().catch(()=>''),1000);
  const button=frame.locator('#continueButton');
  const buttonCount=await button.count().catch(()=>0);
  return{
    url:redact(frame.url(),900),
    body,
    status,
    continueButton:buttonCount?{
      text:redact(await button.textContent().catch(()=>''),500),
      ariaDisabled:redact(await button.getAttribute('aria-disabled').catch(()=>''),100),
      dataReady:redact(await button.getAttribute('data-ready').catch(()=>''),100),
      href:redact(await button.getAttribute('href').catch(()=>''),900)
    }:null
  };
}

(async()=>{
  fs.mkdirSync(evidenceDir,{recursive:true});
  const report={status:'DIAGNOSTIC',launcherUrl,startedAt:new Date().toISOString(),pageUrl:'',title:'',frames:[],gatewayResponses:[],consoleMessages:[],pageErrors:[],secondaryPages:[],screenshotCreated:false};
  const gatewayResponseReads=[];
  let browser;
  try{
    if(!fs.existsSync(credentialsPath))throw new Error('Authorized Google credential file was not found.');
    const credentials=JSON.parse(fs.readFileSync(credentialsPath,'utf8'));
    const accessToken=await refreshAccessToken(credentials);
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    context.on('page',opened=>report.secondaryPages.push(redact(opened.url()||'about:blank',900)));
    context.on('response',response=>{
      const read=(async()=>{
        try{
          const url=new URL(response.url());
          if(url.hostname!==gatewayHost)return;
          let body='';
          try{body=redact(await response.text(),1800);}catch(error){body=`[BODY_UNAVAILABLE:${redact(error.message||String(error),300)}]`;}
          const request=response.request();
          report.gatewayResponses.push({
            status:response.status(),
            method:request.method(),
            url:redact(url.pathname,500),
            requestOrigin:redact(request.headers().origin||'',900),
            responseAllowOrigin:redact(response.headers()['access-control-allow-origin']||'',900),
            body
          });
        }catch(error){}
      })();
      gatewayResponseReads.push(read);
    });
    await context.route('**/*',async route=>{
      const request=route.request();let parsed;
      try{parsed=new URL(request.url());}catch(error){await route.continue();return;}
      if(!isScriptHost(parsed.hostname)){await route.continue();return;}
      await route.continue({headers:{...request.headers(),authorization:`Bearer ${accessToken}`}});
    });
    const page=await context.newPage();
    report.secondaryPages=[];
    page.on('console',message=>report.consoleMessages.push(redact(`${message.type()}:${message.location().url||page.url()}:${message.text()}`,1500)));
    page.on('pageerror',error=>report.pageErrors.push(redact(error.message,1500)));
    await page.goto(launcherUrl,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForURL(url=>{try{return isScriptHost(new URL(url).hostname);}catch(error){return false;}},{timeout:60000});
    await page.waitForTimeout(30000);
    await Promise.allSettled(gatewayResponseReads);
    report.pageUrl=redact(page.url(),900);
    report.title=redact(await page.title().catch(()=>''),500);
    for(const frame of page.frames())report.frames.push(await frameState(frame));
    await page.screenshot({path:path.join(evidenceDir,'gateway-handoff-diagnostic.png'),fullPage:true});
    report.screenshotCreated=true;
  }catch(error){report.error=redact(error.message||String(error),2000);}
  finally{
    await Promise.allSettled(gatewayResponseReads);
    if(browser)await browser.close();
    report.finishedAt=new Date().toISOString();
    fs.writeFileSync(path.join(evidenceDir,'gateway-handoff-diagnostic.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }
})();
