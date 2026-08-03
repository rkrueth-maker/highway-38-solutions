#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const [credentialsArg,scriptIdArg='1nNYrjaH4kwCWQ2SGWMbXGxpkDgLWXXEa_vGSec9N1DjSVLzAl1Z1fxhf']=process.argv.slice(2);
const credentialsPath=credentialsArg||path.join(process.env.HOME||'','.clasprc.json');
const scriptId=String(scriptIdArg||'').trim();
const evidenceDir=path.resolve(process.env.GITHUB_WORKSPACE||path.join(__dirname,'..'),'artifacts/commercial-google-native-beta');
const reportPath=path.join(evidenceDir,'apps-script-project-settings-inspection.json');
const screenshotPath=path.join(evidenceDir,'apps-script-project-settings.png');

function findByKey(value,keys,seen=new Set()){
  if(!value||typeof value!=='object'||seen.has(value))return'';
  seen.add(value);
  for(const [key,child] of Object.entries(value))if(keys.includes(key)&&typeof child==='string'&&child.trim())return child.trim();
  for(const child of Object.values(value)){const found=findByKey(child,keys,seen);if(found)return found;}
  return'';
}
function isGoogleHost(hostname){return hostname==='script.google.com'||hostname==='script.googleusercontent.com'||hostname.endsWith('.script.googleusercontent.com')||hostname==='accounts.google.com';}
function sanitizeText(value,limit=1200){return String(value||'').replace(/ya29\.[A-Za-z0-9._-]+/g,'[REDACTED_TOKEN]').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [REDACTED]').replace(/\s+/g,' ').trim().slice(0,limit);}
async function readJson(response){const text=await response.text();try{return text?JSON.parse(text):{};}catch(error){return{};}}
async function accessToken(credentials){
  let token=findByKey(credentials,['access_token','accessToken']);
  const refreshToken=findByKey(credentials,['refresh_token','refreshToken']);
  const clientId=findByKey(credentials,['client_id','clientId']);
  const clientSecret=findByKey(credentials,['client_secret','clientSecret']);
  if(refreshToken&&clientId&&clientSecret){
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});
    const payload=await readJson(response);
    if(response.ok&&payload.access_token)token=payload.access_token;
    else if(!token)throw new Error(`Credential refresh failed with HTTP ${response.status}.`);
  }
  if(!token)throw new Error('No usable Google access token was found.');
  return token;
}
async function compactElements(frame,selector,limit=40){
  const rows=[];
  const locator=frame.locator(selector);
  const count=Math.min(await locator.count().catch(()=>0),limit);
  for(let index=0;index<count;index++){
    const node=locator.nth(index);
    if(!(await node.isVisible().catch(()=>false)))continue;
    rows.push({
      tag:await node.evaluate(element=>element.tagName.toLowerCase()).catch(()=>''),
      type:sanitizeText(await node.getAttribute('type').catch(()=>''),80),
      text:sanitizeText(await node.innerText().catch(()=>''),180),
      ariaLabel:sanitizeText(await node.getAttribute('aria-label').catch(()=>''),180),
      placeholder:sanitizeText(await node.getAttribute('placeholder').catch(()=>''),180),
      name:sanitizeText(await node.getAttribute('name').catch(()=>''),120),
      href:sanitizeText(await node.getAttribute('href').catch(()=>''),240)
    });
  }
  return rows;
}
async function frameSnapshot(frame){
  return{
    url:sanitizeText(frame.url(),500),
    text:sanitizeText(await frame.locator('body').innerText().catch(()=>''),1800),
    headings:await compactElements(frame,'h1,h2,h3,[role="heading"]',24),
    controls:await compactElements(frame,'button,a,input,select,[role="button"],[role="link"]',60)
  };
}

(async()=>{
  const report={status:'FAIL',scriptId,credentialFilePresent:false,candidates:[],finalUrl:'',title:'',frames:[],cloudProjectSignals:[],settingsAccessible:false,changeProjectControlVisible:false,manualLinkRequired:false,screenshotCreated:false,consoleMessages:[],pageErrors:[]};
  let browser;
  try{
    if(!scriptId)throw new Error('Existing Apps Script project ID is required.');
    if(!fs.existsSync(credentialsPath))throw new Error('Encrypted Google credential file was not found.');
    report.credentialFilePresent=true;
    fs.mkdirSync(evidenceDir,{recursive:true});
    const credentials=JSON.parse(fs.readFileSync(credentialsPath,'utf8'));
    const token=await accessToken(credentials);
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*',async route=>{
      const request=route.request();let url;
      try{url=new URL(request.url());}catch(error){await route.continue();return;}
      if(!isGoogleHost(url.hostname)){await route.continue();return;}
      const headers={...request.headers(),authorization:`Bearer ${token}`};
      await route.continue({headers});
    });
    const page=await context.newPage();
    page.on('console',message=>report.consoleMessages.push(sanitizeText(`${message.type()}: ${message.text()}`,500)));
    page.on('pageerror',error=>report.pageErrors.push(sanitizeText(error.message,500)));
    const candidates=[
      `https://script.google.com/home/projects/${encodeURIComponent(scriptId)}/settings`,
      `https://script.google.com/d/${encodeURIComponent(scriptId)}/edit`,
      `https://script.google.com/home/projects/${encodeURIComponent(scriptId)}/edit`
    ];
    for(const candidate of candidates){
      const attempt={requestedUrl:candidate,finalUrl:'',title:'',httpStatus:0,error:''};
      try{
        const response=await page.goto(candidate,{waitUntil:'domcontentloaded',timeout:45000});
        attempt.httpStatus=response?response.status():0;
        await page.waitForTimeout(5000);
        attempt.finalUrl=page.url();
        attempt.title=await page.title().catch(()=>'');
        report.candidates.push(attempt);
        const body=sanitizeText(await page.locator('body').innerText().catch(()=>''),3000).toLowerCase();
        if(!/sign in|couldn.t sign you in|accounts\.google\.com/.test(body)&&(/project settings|google cloud platform|cloud project|script id|change project/.test(body)||page.url().includes('/settings')))break;
      }catch(error){attempt.error=sanitizeText(error.message,500);attempt.finalUrl=page.url();report.candidates.push(attempt);}
    }
    await page.waitForTimeout(2500);
    report.finalUrl=page.url();
    report.title=sanitizeText(await page.title().catch(()=>''),300);
    for(const frame of page.frames())report.frames.push(await frameSnapshot(frame));
    const combined=report.frames.map(frame=>`${frame.text} ${frame.headings.map(item=>item.text).join(' ')} ${frame.controls.map(item=>`${item.text} ${item.ariaLabel}`).join(' ')}`).join(' ');
    const normalized=combined.toLowerCase();
    const phrases=['google cloud platform (gcp) project','google cloud project','cloud project number','change project','project settings','script id'];
    report.cloudProjectSignals=phrases.filter(phrase=>normalized.includes(phrase));
    report.settingsAccessible=report.cloudProjectSignals.includes('project settings')||report.cloudProjectSignals.includes('script id')||report.finalUrl.includes('/settings');
    report.changeProjectControlVisible=/change project|switch project|set project|project number/.test(normalized);
    report.manualLinkRequired=report.settingsAccessible&&!report.changeProjectControlVisible;
    await page.screenshot({path:screenshotPath,fullPage:true});
    report.screenshotCreated=fs.existsSync(screenshotPath);
    report.status=report.settingsAccessible?'PASS':'HOLD';
  }catch(error){report.error=sanitizeText(error.message,800);}
  finally{
    if(browser)await browser.close();
    fs.mkdirSync(evidenceDir,{recursive:true});
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
    if(report.status==='FAIL')process.exitCode=1;
  }
})();
