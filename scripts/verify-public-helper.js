#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const https=require('https');
const http=require('http');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const failures=[];
const passes=[];
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const check=(name,condition,detail='')=>(condition?passes:failures).push({name,detail});

const helper=read('assets/js/h38-helper.js');
const shell=read('assets/js/h38-site-v2.js');
const css=read('assets/css/h38-site-v2.css');

try{new vm.Script(helper,{filename:'assets/js/h38-helper.js'});check('helper JavaScript parses',true);}catch(error){check('helper JavaScript parses',false,error.message);}
try{new vm.Script(shell,{filename:'assets/js/h38-site-v2.js'});check('public shell JavaScript parses',true);}catch(error){check('public shell JavaScript parses',false,error.message);}

check('canonical shell loads one public helper asset',shell.includes("assets/js/h38-helper.js?v=")&&shell.includes("script[data-h38-public-helper]")&&shell.includes("helperPolicy:{approvedSiteInformationOnly:true,storesInput:false,sendsInput:false,privateDataAccess:false,externalActions:false}"));
check('helper identifies approved-information boundary',helper.includes('Answers use approved Highway 38 website information.')&&helper.includes('Nothing entered here is sent or saved.')&&helper.includes('Do not enter private customer information.'));
check('helper covers approved product and service paths',['Quote Builder is $59 per month','Business Office is $249 per month','Custom Business System starts at $499 per month','Business Snapshot is a separate $299 one-time review','Smart Contact Website is a separate service priced at $1,995 setup plus $99 per month'].every(marker=>helper.includes(marker)));
check('helper preserves human approval and external-action boundary',helper.includes('People remain responsible for final approval and controlled external actions.')&&helper.includes('The helper does not promise an integration, move money, send messages, or create commitments.'));
check('helper routes to approved public destinations',['software.html','project-services.html','pricing.html','quote-builder-demo.html','quote-builder.html#examples','implementation.html','security-reliability.html','start-request.html','contact.html'].every(route=>helper.includes(route)));
check('helper does not call network, storage, private app, or model endpoints',!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|script\.google\.com|api\.openai\.com|GmailApp|MailApp|google\.script\.run/.test(helper));
check('helper renders user input with textContent rather than HTML',helper.includes('element.textContent=text')&&!/innerHTML\s*=/.test(helper));
check('helper includes accessible controls and keyboard close',helper.includes("aria-controls','h38-helper-panel")&&helper.includes("aria-live','polite")&&helper.includes("event.key==='Escape'")&&helper.includes("aria-label','Close Highway 38 Helper"));
check('helper includes page-aware prompts and quick starts',helper.includes("'software.html':'Ask which software level fits your business.'")&&helper.includes('Which product fits my business?')&&helper.includes('What does implementation include?'));
check('helper styles support desktop, mobile, focus, and safe-area use',css.includes('.h38-helper-panel')&&css.includes('.h38-helper-launcher:focus-visible')&&css.includes('@media(max-width:620px)')&&css.includes('env(safe-area-inset-bottom)'));
check('footer exposes a non-binding helper entry point',shell.includes("['Ask the H38 Helper','#h38-helper']")&&shell.includes('data-h38-helper-open'));

function normalizeBase(raw){
  const parsed=new URL(raw);
  if(!parsed.pathname.endsWith('/'))parsed.pathname+='/';
  parsed.search='';parsed.hash='';
  return parsed.toString();
}

function fetchText(rawUrl,redirects=4){
  return new Promise((resolve,reject)=>{
    const lib=rawUrl.startsWith('https:')?https:http;
    const request=lib.get(rawUrl,{headers:{'User-Agent':'highway38-public-helper-verify/1.0'}},response=>{
      if(redirects>0&&[301,302,303,307,308].includes(response.statusCode)&&response.headers.location){
        response.resume();
        fetchText(new URL(response.headers.location,rawUrl).toString(),redirects-1).then(resolve,reject);
        return;
      }
      let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body}));
    });
    request.on('error',reject);
    request.setTimeout(20000,()=>request.destroy(new Error('request timed out')));
  });
}

async function verifyLive(){
  const raw=process.env.VERIFY_BASE_URL||process.env.VERIFY_URL||'';
  if(!raw)return;
  const base=normalizeBase(raw);
  const assets=[
    ['live public shell','assets/js/h38-site-v2.js',['assets/js/h38-helper.js?v=','approvedSiteInformationOnly:true','storesInput:false','externalActions:false']],
    ['live public helper','assets/js/h38-helper.js',['Ask the H38 Helper','Nothing entered here is sent or saved.','Which product fits my business?','Quote Builder is $59 per month']]
  ];
  for(const [label,relative,markers] of assets){
    try{
      const response=await fetchText(new URL(relative,base).toString());
      check(`${label} returns HTTP 200`,response.status===200,String(response.status));
      markers.forEach(marker=>check(`${label} contains ${marker}`,response.body.includes(marker)));
      check(`${label} is not a Pages 404`,!response.body.includes('404: File not found'));
    }catch(error){check(`${label} can be fetched`,false,error.message);}
  }
}

(async()=>{
  await verifyLive();
  const result={status:failures.length?'HOLD':'PASS',sourceCommit:process.env.SOURCE_SHA||process.env.GITHUB_SHA||'',passed:passes.length,failed:failures.length,networkedHelper:false,storesInput:false,privateDataAccess:false,externalActions:false,passes,failures};
  const outputDir=path.join(root,'artifacts','public-helper');
  fs.mkdirSync(outputDir,{recursive:true});
  fs.writeFileSync(path.join(outputDir,'verification.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  process.exit(failures.length?1:0);
})().catch(error=>{console.error(error);process.exit(1);});
