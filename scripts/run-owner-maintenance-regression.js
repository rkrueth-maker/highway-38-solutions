#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const OWNER_ENDPOINT='https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-owner-maintenance';
const OIDC_ENDPOINT='https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-owner-maintenance-oidc';
const credentialPath=process.argv[2]||path.join(process.env.HOME||'','.clasprc.json');
const outputPath=process.argv[3]||path.join(process.cwd(),'artifacts','owner-maintenance-regression.json');
const oidcPath=process.env.H38_GITHUB_OIDC_TOKEN_FILE||'';
const runVisuals=process.env.H38_RUN_VISUALS!=='0';
function findByKey(value,keys,seen=new Set()){if(!value||typeof value!=='object'||seen.has(value))return'';seen.add(value);for(const [key,child] of Object.entries(value))if(keys.includes(key)&&typeof child==='string'&&child.trim())return child.trim();for(const child of Object.values(value)){const found=findByKey(child,keys,seen);if(found)return found;}return'';}
function save(report){fs.mkdirSync(path.dirname(outputPath),{recursive:true});fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');}
function assertExactCoverage(expected,actual,label){const expectedIds=Array.isArray(expected)?expected.filter(Boolean):[],actualIds=Array.isArray(actual)?actual.filter(Boolean):[],unique=new Set(actualIds),missing=expectedIds.filter(id=>!unique.has(id)),unexpected=actualIds.filter(id=>expectedIds.length&&!expectedIds.includes(id)),duplicates=actualIds.filter((id,index)=>actualIds.indexOf(id)!==index);if(unique.size!==actualIds.length||missing.length||unexpected.length||(expectedIds.length&&actualIds.length!==expectedIds.length))throw new Error(`${label} quote coverage failed: expected=${expectedIds.length||'unknown'} actual=${actualIds.length} unique=${unique.size} missing=${missing.join(',')||'none'} unexpected=${unexpected.join(',')||'none'} duplicates=${[...new Set(duplicates)].join(',')||'none'}`);return{count:actualIds.length,uniqueCount:unique.size,missing,unexpected,duplicates:[...new Set(duplicates)]};}
async function googleAccessToken(){if(!fs.existsSync(credentialPath))throw new Error(`Credential file missing: ${credentialPath}`);const credentials=JSON.parse(fs.readFileSync(credentialPath,'utf8'));let accessToken=findByKey(credentials,['access_token','accessToken']);const refreshToken=findByKey(credentials,['refresh_token','refreshToken']),clientId=findByKey(credentials,['client_id','clientId']),clientSecret=findByKey(credentials,['client_secret','clientSecret']);if(refreshToken&&clientId&&clientSecret){const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});if(response.ok){const payload=await response.json();if(payload.access_token)accessToken=payload.access_token;}}if(!accessToken)throw new Error('No usable Google owner access token is available.');return accessToken;}
async function auth(){if(oidcPath){if(!fs.existsSync(oidcPath))throw new Error(`GitHub OIDC token file missing: ${oidcPath}`);const token=fs.readFileSync(oidcPath,'utf8').trim();if(!token)throw new Error('GitHub OIDC token file is empty.');return{mode:'github-oidc',endpoint:OIDC_ENDPOINT,headers:{'x-h38-github-oidc':token}};}const token=await googleAccessToken();return{mode:'google-owner',endpoint:OWNER_ENDPOINT,headers:{Authorization:`Bearer ${token}`}};}
async function call(identity,body,timeout=180000){const response=await fetch(identity.endpoint,{method:'POST',headers:{...identity.headers,'Content-Type':'application/json',Origin:'https://highway38solutions.com'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});const raw=await response.text();let payload={};try{payload=raw?JSON.parse(raw):{};}catch{payload={status:'FAIL',message:raw.slice(0,1000)};}if(!response.ok||payload.status!=='PASS')throw new Error(`Owner maintenance ${body.action} failed (${response.status}): ${payload.message||raw.slice(0,500)}`);return payload;}
(async()=>{
  const identity=await auth();
  const report={startedAt:new Date().toISOString(),authMode:identity.mode,seed:null,status:null,batches:[],results:[],visualBatches:[],visualResults:[],runVisuals};
  report.status=await call(identity,{action:'status'},30000);save(report);
  report.expectedQuoteIds=Array.isArray(report.status.quoteIds)?report.status.quoteIds.slice():[];
  const statusCoverage=assertExactCoverage(report.expectedQuoteIds,report.expectedQuoteIds,'Status manifest');
  report.statusCoverage=statusCoverage;save(report);
  report.seed=await call(identity,{action:'seed'},180000);save(report);
  if(Array.isArray(report.seed.failures)&&report.seed.failures.length)throw new Error(`Historical evidence seeding had ${report.seed.failures.length} failure(s).`);
  const total=Number(report.status.total||0);
  if(report.expectedQuoteIds.length!==total)throw new Error(`Status manifest expected ${total} quote IDs, got ${report.expectedQuoteIds.length}.`);
  for(let offset=0;offset<total;offset+=6){
    const batch=await call(identity,{action:'run',offset,limit:6},180000);
    report.batches.push({offset,clean:batch.clean,fail:batch.fail,returned:batch.returned,quoteIds:batch.quoteIds||[],build:batch.build,agentBuild:batch.agentBuild});
    report.results.push(...(batch.results||[]));save(report);
    console.log(JSON.stringify({phase:'canonical',offset,clean:batch.clean,fail:batch.fail,returned:batch.returned,quoteIds:batch.quoteIds,results:batch.results},null,2));
  }
  report.clean=report.results.filter(row=>row.status==='CLEAN').length;
  report.fail=report.results.filter(row=>row.status!=='CLEAN').length;
  if(report.results.length!==total)throw new Error(`Expected ${total} canonical quote results, got ${report.results.length}.`);
  report.canonicalCoverage=assertExactCoverage(report.expectedQuoteIds,report.results.map(row=>row.quoteId),'Canonical regression');save(report);
  if(runVisuals&&report.fail===0){
    for(let offset=0;offset<total;offset+=1){
      const batch=await call(identity,{action:'visual',offset,limit:1},190000);
      report.visualBatches.push({offset,clean:batch.clean,fail:batch.fail,returned:batch.returned,quoteIds:batch.quoteIds||[]});
      report.visualResults.push(...(batch.results||[]));save(report);
      console.log(JSON.stringify({phase:'visual',offset,clean:batch.clean,fail:batch.fail,returned:batch.returned,quoteIds:batch.quoteIds,results:batch.results},null,2));
    }
  }
  report.visualClean=report.visualResults.filter(row=>row.status==='CLEAN').length;
  report.visualFail=report.visualResults.filter(row=>row.status!=='CLEAN').length;
  if(runVisuals&&report.fail===0)report.visualCoverage=assertExactCoverage(report.expectedQuoteIds,report.visualResults.map(row=>row.quoteId),'Visual regression');
  report.visualSkipped=runVisuals&&report.fail>0?'Canonical regression failed; visual generation held to avoid validating stale scope.':runVisuals?'':'Disabled by H38_RUN_VISUALS=0.';
  report.completedAt=new Date().toISOString();save(report);
  console.log(JSON.stringify({status:report.fail||report.visualFail?'HOLD':'PASS',total:report.results.length,uniqueQuoteCount:report.canonicalCoverage?.uniqueCount||0,clean:report.clean,fail:report.fail,visualClean:report.visualClean,visualFail:report.visualFail,seed:report.seed},null,2));
  if(report.fail||report.visualFail)process.exitCode=2;
})().catch(error=>{console.error(error&&error.stack||error);process.exitCode=1;});
