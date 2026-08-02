#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'apps-script/business-office/BusinessOffice_QuoteBuilder_Details_Recovery.html'),'utf8');
const scripts=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
if(scripts.length<2)throw new Error('Native Quote Builder recovery script was not found.');
const native=scripts[scripts.length-1];

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({
    viewport:{width:412,height:915},
    isMobile:true,
    hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
  });
  await page.setContent(`<!doctype html><html><body>
    <input id="customer" value="CUST-H38-GENERIC-QUOTE">
    <input id="project" value="Gutters">
    <textarea id="scope">Replace existing gutters with 6-inch white gutters and add leaf guard to all new gutter runs</textarea>
    <textarea id="assumptions">Door with window is 36 inches by 80 inches</textarea>
    <textarea id="internalNotes"></textarea><textarea id="customerNotes"></textarea>
    <div id="qbToast"></div><div id="qbFieldStatus"></div>
    <div id="qbSimplePhotoQuote"><div class="qb-simple-photo-actions"><button id="qbSimpleTake">Take</button><button id="qbSimpleChoose">Choose</button><button id="qbSimpleBuild">Build</button></div><div id="qbSimplePhotoStatus"></div></div>
    <div id="lines"><div class="line"><label class="description"><input value=""></label><input value="1"><input value="each"><input value="0"></div></div>
    <div id="qbContent"></div>
  </body></html>`);
  await page.evaluate(()=>{
    window.__h38Calls=[];
    window.__h38Lines=[];
    window.H38_QB_CONTEXT={permissions:{edit:true}};
    window.qbSave=async()=>({quoteId:'QUOTE-TEST'});
    window.qbAddLine=item=>{
      window.__h38Lines.push(item);
      const line=document.createElement('div');line.className='line';
      line.innerHTML='<label class="description"><input></label><input><input><input>';
      const inputs=line.querySelectorAll('input');inputs[0].value=item.description||'';inputs[1].value=item.quantity||1;inputs[2].value=item.unit||'each';inputs[3].value=item.rate||0;
      document.getElementById('lines').appendChild(line);
    };
    window.qbRemoveLine=index=>{const lines=document.querySelectorAll('#lines .line');if(lines[index])lines[index].remove()};
    const response=(name,payload)=>{
      window.__h38Calls.push({name,payload});
      if(name==='boQuoteBuilderStageAiPhoto')return {documentId:'DOC-LIVE-1',fileId:'FILE-LIVE-1',sizeBytes:4800000};
      if(name==='boBuildAiQuoteDraft')return {draft:{projectTitle:'Gutters',scope:'Replace visible gutters and add leaf guard',suggestedLines:[
        {description:'6 inch white gutter replacement',quantity:40,unit:'ft',rate:'',searchQuery:'6 inch white gutter replacement'},
        {description:'Downspout installation',quantity:1,unit:'each',rate:'',searchQuery:'downspout installation'},
        {description:'Leaf guard installation',quantity:40,unit:'ft',rate:'',searchQuery:'leaf guard installation'}
      ]}};
      if(name==='boQuoteBuilderResolveLinePrice'){
        const text=String(payload.description||payload.query||'');
        const down=/downspout/i.test(text),guard=/(leaf|gutter)\s*guard|gutter\s*protection/i.test(text);
        const id=down?'LOCAL-DOWNSPOUT':guard?'LOCAL-LEAF-GUARD':'LOCAL-GUTTER';
        const unit=down?'each':'ft';
        const rate=down?210:guard?7.5:15.75;
        return {source:'price_book_match',catalogId:id,ownerReviewRequired:true,finalPriceApproved:false,item:{'Product / Service ID':id,'Customer Description':payload.description,Name:payload.description,Unit:unit,'Standard Selling Price':rate}};
      }
      if(name==='boQuoteBuilderAttachStagedAiPhotos')return {attached:1};
      return {};
    };
    window.google={script:{run:null}};
    Object.defineProperty(window.google.script,'run',{get(){
      let success=()=>{},failure=()=>{};
      let runner;
      runner=new Proxy({}, {get(_target,prop){
        if(prop==='withSuccessHandler')return fn=>{success=fn;return runner};
        if(prop==='withFailureHandler')return fn=>{failure=fn;return runner};
        return payload=>{setTimeout(()=>{try{success(response(String(prop),payload))}catch(error){failure(error)}},0)};
      }});
      return runner;
    }});
  });
  await page.addScriptTag({content:native});
  await page.waitForSelector('#qbNativeGallery');
  const before=page.url();
  const buffer=Buffer.alloc(4_800_000,65);
  await page.setInputFiles('#qbNativeGallery',{name:'1000007797.jpg',mimeType:'image/jpeg',buffer});
  await page.waitForFunction(()=>document.getElementById('qbSimplePhotoStatus').textContent.includes('uploaded safely'),null,{timeout:30000});
  const after=page.url();
  if(after!==before)throw new Error(`Native file selection navigated away: ${before} -> ${after}`);
  const stage=await page.evaluate(()=>window.__h38Calls.find(call=>call.name==='boQuoteBuilderStageAiPhoto'));
  if(!stage)throw new Error('The native picker did not call the canonical photo staging endpoint.');
  if(!stage.payload.base64Data||stage.payload.base64Data.length<6_000_000)throw new Error('The normal phone-photo-sized file was not read completely.');

  await page.click('#qbNativeBuild');
  await page.waitForFunction(()=>window.__h38Calls.some(call=>call.name==='boBuildAiQuoteDraft')&&window.__h38Calls.filter(call=>call.name==='boQuoteBuilderResolveLinePrice').length>=3,null,{timeout:30000});
  let result=await page.evaluate(()=>({calls:window.__h38Calls.map(call=>call.name),lines:window.__h38Lines,url:location.href,status:document.getElementById('qbSimplePhotoStatus').textContent,domLines:Array.from(document.querySelectorAll('#lines .description input')).map(input=>input.value).filter(Boolean)}));
  if(result.lines.length!==3||result.domLines.length!==3)throw new Error('Gutter, downspout, and leaf-guard lines did not populate the active quote.');
  if(Number(result.lines[0].rate)!==15.75||Number(result.lines[1].rate)!==210||Number(result.lines[2].rate)!==7.5)throw new Error('Distinct gutter, downspout, and leaf-guard rates did not populate.');
  if(!/Quote draft prepared/i.test(result.status))throw new Error('The completed mobile workflow did not reach its review state.');

  await page.click('#qbNativeBuild');
  await page.waitForFunction(()=>window.__h38Calls.filter(call=>call.name==='boBuildAiQuoteDraft').length>=2&&window.__h38Calls.filter(call=>call.name==='boQuoteBuilderResolveLinePrice').length>=6,null,{timeout:30000});
  result=await page.evaluate(()=>({calls:window.__h38Calls.map(call=>call.name),lines:window.__h38Lines,url:location.href,status:document.getElementById('qbSimplePhotoStatus').textContent,domLines:Array.from(document.querySelectorAll('#lines .description input')).map(input=>input.value).filter(Boolean)}));
  if(result.lines.length!==3||result.domLines.length!==3)throw new Error('Reprocessing duplicated existing quote lines.');

  await browser.close();
  console.log(JSON.stringify({status:'PASS',viewport:'412x915 Android',uploadBytes:buffer.length,navigationPreserved:true,stageCalls:result.calls.filter(name=>name==='boQuoteBuilderStageAiPhoto').length,analysisCalls:result.calls.filter(name=>name==='boBuildAiQuoteDraft').length,priceCalls:result.calls.filter(name=>name==='boQuoteBuilderResolveLinePrice').length,lines:result.lines.map(line=>({description:line.description,quantity:line.quantity,unit:line.unit,rate:line.rate})),reprocessDuplicateFree:true,ownerReviewOnly:true},null,2));
})().catch(error=>{console.error(error);process.exit(1)});
