'use strict';
const path=require('path');
const {chromium}=require('playwright');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const runtime=path.join(root,'commercial-app/web-media-intake-runtime.js');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.setContent('<!doctype html><html><head></head><body><main id="mainContent"><div class="grid"></div></main><dialog id="h38QuickCreateDialog"><div class="h38-quick-grid"></div><button value="cancel"></button></dialog></body></html>');
  await page.evaluate(()=>{
   const records=new Map();let nextId=0;
   window.state={page:'documents',businessId:'B-OWNER',snapshot:{customers:[{'Customer ID':'C-1','Customer Name':'Johnson'}],jobs:[{'Job ID':'J-1','Customer ID':'C-1','Project Title':'Deck repair'}]}};
   window.newId=prefix=>`${String(prefix||'ID')}-OWNER-${++nextId}`;
   window.esc=v=>String(v??'');
   window.toast=(m,e)=>{window.__toasts=window.__toasts||[];window.__toasts.push({m,e});};
   window.H38_BUSINESS_OFFICE_SUPABASE={url:'https://test.supabase.co',publishableKey:'pk-test'};
   window.H38_SUPABASE_AUTH={getState:()=>({selectedBusinessId:'B-OWNER',userId:'U-OWNER'})};
   window.__tusTrace=[];
   let uploadLength=0;
   const nativeFetch=window.fetch.bind(window);
   window.fetch=async(input,init={})=>{
     const url=typeof input==='string'?input:String(input?.url||input);
     if(url.startsWith('https://test.storage.supabase.co/')){
       const method=String(init.method||'GET').toUpperCase();
       const h=init.headers||{};
       const header=(name)=>{
         if(h instanceof Headers)return h.get(name)||'';
         const key=Object.keys(h).find(k=>k.toLowerCase()===name.toLowerCase());
         return key?h[key]:'';
       };
       window.__tusTrace.push({method,url});
       if(method==='POST'){
         uploadLength=Number(header('Upload-Length')||0);
         return new Response(null,{status:201,headers:{Location:'https://test.storage.supabase.co/upload/owner-media-1','Tus-Resumable':'1.0.0'}});
       }
       if(method==='PATCH'){
         const bodySize=Number(init.body?.size||0);
         const start=Number(header('Upload-Offset')||0);
         const next=uploadLength||start+bodySize;
         return new Response(null,{status:204,headers:{'Upload-Offset':String(next),'Tus-Resumable':'1.0.0'}});
       }
       return new Response(null,{status:200});
     }
     return nativeFetch(input,init);
   };
   const match=(row,filters)=>filters.every(([k,v])=>String(row[k]??'')===String(v));
   function builder(table){
     let filters=[],payload=null,mode='select';
     const api={
       select(){mode='select';return api;},
       eq(k,v){filters.push([k,v]);return api;},
       in(){return api;},
       order(){return api;},
       limit(){return api;},
       maybeSingle(){
         if(table==='business_records'){
           for(const row of records.values())if(match(row,filters))return Promise.resolve({data:{id:row.id,payload:row.payload},error:null});
         }
         return Promise.resolve({data:null,error:null});
       },
       insert(v){
         const vals=Array.isArray(v)?v:[v];
         for(const row of vals){
           if(table==='business_records'){
             const id=row.id||`ROW-OWNER-${++nextId}`;
             records.set(`${row.business_id}|${row.collection}|${row.record_key}`,{id,...row});
           }
         }
         return Promise.resolve({data:vals,error:null});
       },
       update(v){payload=v;mode='update';return api;},
       then(resolve){
         if(mode==='update'&&table==='business_records'){
           for(const [key,row] of records)if(match(row,filters))records.set(key,{...row,...payload});
         }
         resolve({data:null,error:null});
       }
     };
     return api;
   }
   window.__records=records;
   window.H38_SUPABASE_SHARED_CLIENT={
     ensure:()=>({
       auth:{
         getSession:async()=>({data:{session:{access_token:'token',expires_at:9999999999}},error:null}),
         refreshSession:async()=>({data:{session:{access_token:'token',expires_at:9999999999}},error:null})
       },
       from:builder,
       storage:{from:()=>({upload:async()=>({data:{},error:null})})},
       functions:{
         invoke:async(name,args)=>{
           window.__invokes=window.__invokes||[];
           window.__invokes.push({name,args});
           if(name==='h38-media-intake-ai')return{data:{status:'PASS',transcriptStatus:'COMPLETE',transcript:'Customer wants deck railing repaired. The door opening is 36 inches wide.',frameCount:0,analysis:{summary:'Deck repair media reviewed.',observedFacts:[{fact:'Railing damage is discussed',confidence:.9,evidence:'transcript'}],measurementTargets:[{label:'deck width',dimension:'width',reason:'quote scope'}],candidateReferenceMentions:[{label:'door opening',valueText:'36 in',reason:'spoken reference',requiresOwnerConfirmation:true}]},usage:{inputTokens:12,outputTokens:8,totalTokens:20}},error:null};
           if(name==='h38-web-video-measurements')return{data:{status:'PASS',outcome:'ESTIMATES_READY',message:'1 camera estimate is ready for field verification.',estimates:[{label:'deck width',displayValue:'12 ft 0 in',confidence:.61}]},error:null};
           return{data:{status:'PASS'},error:null};
         }
       }
     })
   };
   window.renderDocuments=function(){state.page='documents';document.getElementById('mainContent').innerHTML='<div class="grid"></div>';};
  });
  await page.addScriptTag({path:runtime});
  await page.waitForSelector('#h38WebMediaCard');
  assert((await page.locator('#h38WebMediaCard').textContent()).includes('Upload media for AI'));
  await page.locator('#h38WebMediaCard button').click();
  await page.waitForSelector('#h38WebMediaDialog[open]');
  assert.equal(await page.locator('#h38MediaFile').getAttribute('accept'),'video/*,audio/*');
  await page.locator('#h38MediaCustomer').selectOption('C-1');
  await page.locator('#h38MediaJob').selectOption('J-1');
  await page.locator('#h38MediaPurpose').selectOption({label:'Meeting'});
  await page.locator('#h38MediaTitle').fill('Customer deck recording');
  await page.locator('#h38MediaFile').setInputFiles({name:'customer-note.webm',mimeType:'audio/webm',buffer:Buffer.from('H38 synthetic owner acceptance audio')});
  assert.equal(await page.locator('#h38MediaFile').evaluate(el=>el.files?.length||0),1,'synthetic owner media must be attached');
  await page.locator('#h38MediaFile').dispatchEvent('change');
  const uploadBoundary=await page.evaluate(async()=>{
    const button=document.getElementById('h38MediaUpload');
    if(!button)return{ok:false,reason:'missing'};
    if(button.disabled)return{ok:false,reason:'disabled'};
    if(typeof button.onclick!=='function')return{ok:false,reason:'handler'};
    await button.onclick.call(button);
    return{ok:true};
  });
  assert.equal(uploadBoundary.ok,true,`bound upload handler must execute: ${uploadBoundary.reason||''}`);
  try{
    await page.waitForFunction(()=>{const t=document.querySelector('#h38MediaStatus')?.textContent||'';return t.includes('complete')||t.startsWith('Stopped:');},null,{timeout:10000});
  }catch(error){
    const debug=await page.evaluate(()=>({status:document.querySelector('#h38MediaStatus')?.textContent||'',fileCount:document.querySelector('#h38MediaFile')?.files?.length||0,uploadHandler:typeof document.querySelector('#h38MediaUpload')?.onclick,toasts:window.__toasts||[],invokes:window.__invokes||[],tus:window.__tusTrace||[],records:window.__records?.size||0}));
    throw new Error(`media intake did not finish: ${JSON.stringify(debug)}`);
  }
  const status=await page.locator('#h38MediaStatus').textContent();
  assert(!status.startsWith('Stopped:'),`media intake stopped: ${status}`);
  const result=await page.locator('#h38MediaResult').textContent();
  assert(result.includes('Deck repair media reviewed.'));
  assert(result.includes('Owner authority preserved.'));
  assert.equal(await page.locator('#h38MediaMeasure').isDisabled(),true,'distance scan must be disabled before owner confirms a reference');
  await page.locator('#h38MediaRefLabel').fill('door opening width');
  await page.locator('#h38MediaRefValue').fill('36');
  await page.locator('#h38MediaRefConfirmed').check();
  assert.equal(await page.locator('#h38MediaMeasure').isEnabled(),true);
  await page.locator('#h38MediaMeasure').click();
  await page.waitForSelector('#h38MediaMeasurements .h38-media-estimate');
  const measurement=await page.locator('#h38MediaMeasurements').textContent();
  assert(measurement.includes('Camera estimate')&&measurement.includes('UNVERIFIED')&&measurement.includes('field verification required'));
  const evidence=await page.evaluate(()=>({invokes:window.__invokes||[],tus:window.__tusTrace||[]}));
  assert(evidence.tus.some(x=>x.method==='POST'),'TUS create must run');
  assert(evidence.tus.some(x=>x.method==='PATCH'),'TUS chunk upload must run');
  assert(evidence.invokes.some(x=>x.name==='h38-media-intake-ai'),'media AI must run');
  assert(evidence.invokes.some(x=>x.name==='h38-web-video-measurements'),'distance engine must run only after owner confirmation');
  await page.locator('#h38WebMediaDialog [data-close]').last().click();
  assert.equal(await page.locator('#h38WebMediaDialog').getAttribute('open'),null,'close button should close the media dialog');
  await page.evaluate(()=>document.getElementById('h38QuickCreateDialog').showModal());
  await page.waitForSelector('#h38QuickCreateDialog [data-web-media]');
  await page.locator('#h38QuickCreateDialog [data-web-media]').click();
  assert.equal(await page.locator('#h38WebMediaDialog').getAttribute('open'),'','Quick Create media button should open intake');
  const contract=await page.evaluate(()=>window.H38_WEB_MEDIA_INTAKE);
  for(const key of ['automaticCustomerRelease','automaticCustomerSending','automaticApproval','automaticScheduling','automaticFinancialAction'])assert.equal(contract.safeguards[key],false,`${key} must remain false`);
  assert.equal(contract.safeguards.measurementsVerified,false);
  assert.equal(contract.safeguards.confirmedReferenceRequired,true);
  assert.deepEqual(errors,[],'web media owner browser should have no page errors');
  console.log(JSON.stringify({status:'PASS',checks:['Documents video/recording card','media dialog','customer/job assignment','bound upload handler','resumable private upload','AI analysis','owner-confirmed reference gate','unverified distance estimate','close','Quick Create video/recording','safety authority']},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
