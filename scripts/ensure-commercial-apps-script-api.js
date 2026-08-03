#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');

const [credentialsArg,projectArg='891330876039']=process.argv.slice(2);
const credentialsPath=credentialsArg||path.join(process.env.HOME||'','.clasprc.json');
const projectNumber=String(projectArg||'').trim();
const serviceName='script.googleapis.com';
const evidenceDir=path.resolve(process.env.GITHUB_WORKSPACE||path.join(__dirname,'..'),'artifacts/commercial-google-native-beta');
const evidencePath=path.join(evidenceDir,'apps-script-api-preflight.json');

function findByKey(value,keys,seen=new Set()){
  if(!value||typeof value!=='object'||seen.has(value))return'';
  seen.add(value);
  for(const [key,child] of Object.entries(value)){
    if(keys.includes(key)&&typeof child==='string'&&child.trim())return child.trim();
  }
  for(const child of Object.values(value)){
    const found=findByKey(child,keys,seen);
    if(found)return found;
  }
  return'';
}
function safeMessage(payload){
  if(!payload)return'';
  if(typeof payload==='string')return payload.slice(0,600);
  return String(payload.error?.message||payload.message||payload.error_description||'').slice(0,600);
}
function writeEvidence(result){
  fs.mkdirSync(evidenceDir,{recursive:true});
  fs.writeFileSync(evidencePath,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
async function readJson(response){
  const text=await response.text();
  try{return text?JSON.parse(text):{};}catch(error){return{raw:text.slice(0,600)};}
}
async function refreshToken(credentials){
  let accessToken=findByKey(credentials,['access_token','accessToken']);
  const refreshToken=findByKey(credentials,['refresh_token','refreshToken']);
  const clientId=findByKey(credentials,['client_id','clientId']);
  const clientSecret=findByKey(credentials,['client_secret','clientSecret']);
  if(refreshToken&&clientId&&clientSecret){
    const response=await fetch('https://oauth2.googleapis.com/token',{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),
      signal:AbortSignal.timeout(30000)
    });
    const payload=await readJson(response);
    if(response.ok&&payload.access_token)accessToken=payload.access_token;
    else if(!accessToken)throw new Error(`Google credential refresh failed (${response.status}): ${safeMessage(payload)}`);
  }
  if(!accessToken)throw new Error('The encrypted Google credential does not contain a usable access token.');
  return accessToken;
}
async function tokenMetadata(accessToken){
  const response=await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,{signal:AbortSignal.timeout(30000)});
  const payload=await readJson(response);
  const scopes=String(payload.scope||'').split(/\s+/).filter(Boolean).sort();
  return{status:response.status,ok:response.ok,audience:String(payload.aud||payload.azp||''),email:String(payload.email||''),scopes};
}
async function serviceRequest(accessToken,method,url){
  const response=await fetch(url,{
    method,
    headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json'},
    body:method==='POST'?'{}':undefined,
    signal:AbortSignal.timeout(30000)
  });
  return{status:response.status,ok:response.ok,payload:await readJson(response)};
}
async function waitForEnabled(accessToken,serviceUrl){
  for(let attempt=1;attempt<=12;attempt++){
    const check=await serviceRequest(accessToken,'GET',serviceUrl);
    const state=String(check.payload.state||'');
    if(check.ok&&state==='ENABLED')return{enabled:true,attempt,state,httpStatus:check.status};
    if(attempt<12)await new Promise(resolve=>setTimeout(resolve,5000));
  }
  return{enabled:false,attempt:12,state:'UNKNOWN'};
}

(async()=>{
  const result={status:'FAIL',projectNumber,service:serviceName,credentialFilePresent:false,tokenMetadata:null,initialState:null,enableAttempt:null,finalState:null,changed:false};
  try{
    if(!/^\d+$/.test(projectNumber))throw new Error('A numeric Google Cloud project number is required.');
    if(!fs.existsSync(credentialsPath))throw new Error('Encrypted Google credential file was not found.');
    result.credentialFilePresent=true;
    const credentials=JSON.parse(fs.readFileSync(credentialsPath,'utf8'));
    const accessToken=await refreshToken(credentials);
    result.tokenMetadata=await tokenMetadata(accessToken);
    const serviceUrl=`https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/${serviceName}`;
    const initial=await serviceRequest(accessToken,'GET',serviceUrl);
    result.initialState={httpStatus:initial.status,state:String(initial.payload.state||''),message:safeMessage(initial.payload)};
    if(initial.ok&&initial.payload.state==='ENABLED'){
      result.status='PASS';
      result.finalState={httpStatus:initial.status,state:'ENABLED'};
      writeEvidence(result);
      return;
    }
    const enable=await serviceRequest(accessToken,'POST',`${serviceUrl}:enable`);
    result.enableAttempt={httpStatus:enable.status,operation:String(enable.payload.name||''),message:safeMessage(enable.payload)};
    if(!enable.ok){
      const scopes=result.tokenMetadata?.scopes||[];
      const hasEnableScope=scopes.includes('https://www.googleapis.com/auth/cloud-platform')||scopes.includes('https://www.googleapis.com/auth/service.management');
      result.requiredScopePresent=hasEnableScope;
      throw new Error(`Apps Script API enable request failed (${enable.status}): ${safeMessage(enable.payload)||'Google rejected the request.'}`);
    }
    result.changed=true;
    result.finalState=await waitForEnabled(accessToken,serviceUrl);
    if(!result.finalState.enabled)throw new Error('Apps Script API enablement did not reach ENABLED state within 60 seconds.');
    result.status='PASS';
    writeEvidence(result);
  }catch(error){
    result.error=String(error.message||error).slice(0,800);
    writeEvidence(result);
    process.exitCode=1;
  }
})();
