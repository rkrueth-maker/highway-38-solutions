#!/usr/bin/env node
'use strict';

// Real portal recording. Authentication happens before video capture, and the
// authenticated browser state stays in memory. Never upload a storage-state file.
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const {chromium}=require('playwright');

const out=path.resolve(process.env.H38_PORTAL_PROOF_DIR||'artifacts/customer-portal-signed-in');
const sourceSha=process.env.GITHUB_SHA||'local';
const required=process.env.H38_PORTAL_REQUIRE_BOTH==='true';
const authorized=process.env.H38_PORTAL_RECORDING_AUTHORIZED==='true';
const cases=[
  {key:'highway38',name:'H38',url:'https://highway38solutions.com/customer-portal.html',app:'#portal-app',login:'#portal-login',sections:['#projects-section','#quotes-section','#invoices-section','#files-section','#messages-section'],email:process.env.H38_PORTAL_TEST_EMAIL,password:process.env.H38_PORTAL_TEST_PASSWORD},
  {key:'northern-lakes',name:'Northern Lakes',url:'https://highway38solutions.com/businesses/northern-lakes/customer-portal.html',app:'#portalApp',login:'#portalLogin',sections:['#jobsPanel','#quotesPanel','#invoicesPanel','#filesPanel','#messagesPanel'],email:process.env.NL_PORTAL_TEST_EMAIL,password:process.env.NL_PORTAL_TEST_PASSWORD}
];
const manifest={kind:'customer-portal-signed-in-training',sourceSha,status:'HOLD',startedAt:new Date().toISOString(),videos:[],externalActionsOccurred:false,credentialsRecorded:false,storageStatePersisted:false};
fs.mkdirSync(out,{recursive:true});
function save(){fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');}
function fail(message){throw new Error(message);}
async function caption(page,words){
  await page.evaluate(text=>{
    let node=document.getElementById('h38PortalTrainingCaption');
    if(!node){node=document.createElement('div');node.id='h38PortalTrainingCaption';document.body.appendChild(node);Object.assign(node.style,{position:'fixed',top:'8px',left:'8px',right:'8px',zIndex:'2147483647',background:'rgba(7,36,51,.96)',color:'#fff',borderRadius:'12px',padding:'12px 14px',font:'600 17px/1.35 system-ui',pointerEvents:'none',boxShadow:'0 5px 18px #0018'});}
    node.textContent=text;
  },words);
  await page.waitForTimeout(1150);
}
async function verifyIdentity(page,item){
  const result=await page.evaluate(async tenant=>{
    const config=window.NL_CUSTOMER_PORTAL_CONFIG||window.H38_CUSTOMER_PORTAL_SUPABASE;
    const client=window.supabase.createClient(config.supabaseUrl||config.url,config.publishableKey);
    const {data:session,error:sessionError}=await client.auth.getSession();
    if(sessionError||!session?.session?.user)return {error:'No authenticated customer session'};
    const {data,error}=await client.from('customer_accounts').select('id,tenant_key,business_id,display_name,portal_enabled,status').eq('auth_user_id',session.session.user.id);
    if(error)return {error:'Customer mapping query failed'};
    const rows=Array.isArray(data)?data:[];
    const own=rows.filter(row=>row.tenant_key===tenant&&row.portal_enabled===true&&row.status==='active'&&/TEST/i.test(row.display_name||''));
    return {visibleMappings:rows.length,ownTestMappings:own.length,otherTenantMappings:rows.filter(row=>row.tenant_key!==tenant).length,businessMatches:tenant==='northern-lakes'?own.every(row=>row.business_id===config.businessId):true};
  },item.key);
  if(result.error||result.visibleMappings!==1||result.ownTestMappings!==1||result.otherTenantMappings!==0||!result.businessMatches)fail(`${item.name} TEST customer or tenant isolation did not pass.`);
  if(!/TEST/i.test(await page.locator('#customerName').innerText()))fail(`${item.name} visible customer is not marked TEST.`);
  return result;
}
async function record(browser,item){
  const proof={tenant:item.key,status:'HOLD',sourceSha,viewport:'390x844',externalActionsOccurred:false,credentialsRecorded:false,steps:[]};
  if(!item.email||!item.password){proof.status='EXTERNAL_GATE';proof.detail=`Dedicated ${item.name} TEST customer credentials are required.`;return proof;}
  if(!/\+[^@]*portaltest@/i.test(item.email))fail(`${item.name} recorder requires a dedicated +portaltest email alias.`);
  if(!authorized)fail('Controlled TEST recording authorization is required.');

  const authContext=await browser.newContext({viewport:{width:390,height:844}});
  let state;
  try{
    const signIn=await authContext.newPage();
    await signIn.goto(item.url,{waitUntil:'domcontentloaded',timeout:45000});
    await signIn.locator(item.login).waitFor({state:'visible',timeout:30000});
    await signIn.locator('#portalEmail').fill(item.email);
    await signIn.locator('#portalPassword').fill(item.password);
    await signIn.locator('#loginForm button[type="submit"]').click();
    await signIn.locator(item.app).waitFor({state:'visible',timeout:40000});
    await verifyIdentity(signIn,item);
    state=await authContext.storageState();
  }finally{await authContext.close();}

  const videoDir=path.join(out,'raw');fs.mkdirSync(videoDir,{recursive:true});
  const context=await browser.newContext({viewport:{width:390,height:844},storageState:state,recordVideo:{dir:videoDir,size:{width:390,height:844}}});
  state=null;
  const page=await context.newPage();let videoPath='';let mutations=0;
  page.on('request',request=>{if(request.method()!=='GET'&&/\/rest\/v1\/customer_messages|\/rpc\/customer_portal_decide_quote/i.test(request.url())){mutations++;manifest.externalActionsOccurred=true;}});
  try{
    await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator(item.app).waitFor({state:'visible',timeout:40000});
    const identity=await verifyIdentity(page,item);
    proof.steps.push({name:'signed-in-test-customer-and-rls',status:'PASS',visibleMappings:identity.visibleMappings,otherTenantMappings:0});
    await caption(page,`${item.name} TEST customer: this is the real signed-in portal. Only the connected customer account is visible.`);
    for(const selector of item.sections){
      const section=page.locator(selector);await section.waitFor({state:'visible',timeout:15000});
      await section.scrollIntoViewIfNeeded();
      const heading=await section.locator('h2,h3').first().innerText().catch(()=>selector.slice(1));
      await caption(page,`${heading}: review what the business has released. No approval, message, payment, or download is performed in this lesson.`);
      proof.steps.push({name:selector.slice(1),status:'PASS'});
    }
    if(mutations)fail('Customer action endpoint was called during read-only training.');
    proof.status='PASS';
  }finally{
    const video=page.video();await page.close().catch(()=>{});await context.close().catch(()=>{});
    if(video)videoPath=await video.path().catch(()=> '');
    if(videoPath&&fs.existsSync(videoPath)){
      const raw=path.join(out,`${item.key}-signed-in-test-customer.webm`);fs.renameSync(videoPath,raw);
      const mp4=path.join(out,`${item.key}-signed-in-test-customer.mp4`);
      const converted=spawnSync('ffmpeg',['-y','-i',raw,'-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',mp4],{stdio:'ignore'});
      if(converted.status===0)proof.video=path.basename(mp4);else proof.video=path.basename(raw);
    }
    proof.externalActionsOccurred=mutations>0;
  }
  if(!proof.video)fail(`${item.name} recording did not produce a video.`);
  return proof;
}
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const item of cases){
      try{manifest.videos.push(await record(browser,item));}
      catch(error){manifest.videos.push({tenant:item.key,status:'HOLD',error:String(error?.message||error).slice(0,500),externalActionsOccurred:false,credentialsRecorded:false});}
      save();
    }
    manifest.status=manifest.videos.every(v=>v.status==='PASS')?'PASS':manifest.videos.some(v=>v.status==='HOLD')?'HOLD':'EXTERNAL_GATE';
    manifest.externalActionsOccurred=manifest.externalActionsOccurred||manifest.videos.some(v=>v.externalActionsOccurred);
    if(manifest.externalActionsOccurred)manifest.status='HOLD';
    manifest.completedAt=new Date().toISOString();save();
    if(manifest.status==='HOLD'||required&&manifest.status!=='PASS')process.exitCode=1;
    console.log(JSON.stringify({status:manifest.status,tenants:manifest.videos.map(v=>({tenant:v.tenant,status:v.status})),externalActionsOccurred:manifest.externalActionsOccurred}));
  }finally{await browser.close();}
})().catch(error=>{manifest.status='HOLD';manifest.error=String(error?.message||error).slice(0,500);save();console.error(manifest.error);process.exitCode=1;});
