#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const [urlArg='https://highway38solutions.com/contractor-quote-complete.html?example=flower',outArg='artifacts/public-quote-live-diagnostic']=process.argv.slice(2);
const outDir=path.resolve(outArg);
fs.mkdirSync(outDir,{recursive:true});

(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:412,height:915}});
  const page=await context.newPage();
  const consoleMessages=[],pageErrors=[],failedRequests=[],responses=[];
  page.on('console',message=>consoleMessages.push({type:message.type(),text:message.text(),url:message.location().url||''}));
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText||''}));
  page.on('response',response=>{if(response.request().resourceType()==='document')responses.push({url:response.url(),status:response.status(),headers:response.headers()});});
  let navigationStatus=0,navigationUrl='',navigationError='';
  try{
    const target=new URL(urlArg);target.searchParams.set('diagnosticTime',String(Date.now()));
    const response=await page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:45000});
    navigationStatus=response?.status()||0;navigationUrl=page.url();
    await page.waitForTimeout(5000);
  }catch(error){navigationError=error.message;}
  const state=await page.evaluate(()=>({
    documentTitle:document.title,
    location:location.href,
    heading:(document.getElementById('title')?.textContent||'').trim(),
    quoteNumber:(document.getElementById('number')?.textContent||'').trim(),
    base:(document.getElementById('base')?.textContent||'').trim(),
    tableTotal:(document.getElementById('tableTotal')?.textContent||'').trim(),
    lineCount:document.querySelectorAll('#items tr').length,
    pickerCount:document.querySelectorAll('#picker a').length,
    logoSrc:document.querySelector('header .brand img')?.getAttribute('src')||'',
    bodyText:(document.body?.innerText||'').slice(0,3000),
    readyState:document.readyState
  })).catch(error=>({evaluationError:error.message}));
  await page.screenshot({path:path.join(outDir,'page.png'),fullPage:true}).catch(()=>{});
  fs.writeFileSync(path.join(outDir,'page.html'),await page.content().catch(()=>''));
  const result={status:'FAIL',acceptance:'PUBLIC_QUOTE_LIVE_DIAGNOSTIC',requestedUrl:urlArg,navigationStatus,navigationUrl,navigationError,responses,state,consoleMessages,pageErrors,failedRequests,finishedAt:new Date().toISOString()};
  const passed=navigationStatus>=200&&navigationStatus<300&&state.heading==='Flower Garden Transformation'&&state.quoteNumber==='Q-DEMO-001'&&state.lineCount===6&&state.pickerCount===7&&!pageErrors.length;
  result.status=passed?'PASS':'FAIL';
  fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  await context.close();await browser.close();
  if(!passed)process.exit(1);
})().catch(error=>{console.error(JSON.stringify({status:'FAIL',acceptance:'PUBLIC_QUOTE_LIVE_DIAGNOSTIC',error:error.message},null,2));process.exit(1);});
