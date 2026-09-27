const path=require('path');
const {chromium}=require('playwright');

function must(ok,msg){if(!ok)throw new Error(`FAIL: ${msg}`);console.log(`PASS: ${msg}`);}

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.setContent(`<!doctype html><html><head></head><body><main id="mainContent"><div class="grid"><section class="card" id="existingUpload"><h2>Existing upload</h2></section></div></main><div id="toast"></div></body></html>`);
  await page.addStyleTag({path:path.resolve(__dirname,'../commercial-app/smart-import.css')});
  await page.evaluate(()=>{
    window.state={page:'documents',businessId:'biz-h38',snapshot:{user:{owner:true},customers:[{'Customer ID':'cust-nelson','Customer Name':'Nelson Wood Shims',Email:'nelson@example.com',Phone:'218-555-1000','Service Address':'123 Main St','Customer Number':'NWS-1'}],jobs:[]}};
    window.__rpcCalls=[];
    window.__uploads=[];
    window.__toasts=[];
    window.toast=(message,bad=false)=>window.__toasts.push({message:String(message),bad});
    window.H38_SMART_UPLOAD={
      readableContent:async file=>await file.text(),
      analyze:async file=>({documentType:file.name.endsWith('.csv')?'Structured business export':'Business document',confidence:file.name.includes('poor-note')?.45:.82,classificationSource:'test fixture',originalName:file.name,mimeType:file.type||'text/plain'})
    };
    const historyChain={select(){return this;},eq(){return this;},order(){return this;},async limit(){return{data:[],error:null};}};
    window.H38_SUPABASE_SHARED_CLIENT={ensure:()=>({
      rpc:async(name,args)=>{window.__rpcCalls.push({name,args});if(name==='business_office_stage_import')return{data:`run-${window.__rpcCalls.length}`,error:null};if(name==='business_office_apply_import')return{data:{imported:6,errors:0},error:null};return{data:null,error:null};},
      from:()=>Object.create(historyChain),
      functions:{invoke:async()=>({data:{status:'PASS',extractedText:'',observedFacts:[],likelyCustomer:{},likelyJob:{},model:'fixture'},error:null})}
    })};
    window.handleAttachmentFiles=async(files,type,id,visibility,meta)=>{window.__uploads.push({names:Array.from(files).map(f=>f.name),type,id,visibility,meta});};
  });
  await page.addScriptTag({path:path.resolve(__dirname,'../commercial-app/smart-import.js')});
  await page.waitForFunction(()=>window.H38_SMART_IMPORT?.enabled===true);
  await page.waitForSelector('[data-h38-smart-import-launch]');
  must(await page.locator('[data-h38-smart-import-launch]').count()===1,'Documents page gets one Smart Upload & Import entry point');
  must(await page.evaluate(()=>window.H38_SMART_IMPORT.validateFile(new File(['x'],'danger.exe',{type:'application/octet-stream'})).safe===false),'executable input is blocked');
  must(await page.evaluate(()=>{const f=new File(['x'],'note.txt',{type:'text/plain'});Object.defineProperty(f,'h38RelativePath',{value:'../escape/note.txt'});return window.H38_SMART_IMPORT.validateFile(f).safe===false;}),'path traversal input is blocked');
  const folderName=await page.evaluate(()=>window.H38_SMART_IMPORT.extract('',{path:'Customers/Smith Property/scan001.jpg'}).customerName);
  must(folderName==='Smith Property','folder hierarchy can supply a conservative customer hint');
  const exactMatch=await page.evaluate(()=>window.H38_SMART_IMPORT.matchCustomer({customerName:'NELSON WOOD SHIMS',email:'nelson@example.com',phone:'2185551000',address:'123 Main Street',customerNumber:'NWS-1'}));
  must(exactMatch.state==='MATCH'&&exactMatch.best?.id==='cust-nelson','multi-signal duplicate matching resolves the existing customer');
  await page.evaluate(()=>window.H38_SMART_IMPORT.openImport());
  await page.waitForSelector('#h38SmartImportDialog[open]');
  const summary=await page.evaluate(async()=>{
    const conflict=new File(['Customer: Nelson Wood Shims  Email: nelson@example.com  Phone: 218-555-1090  Address: 123 Main St  Invoice # INV-1018  Total: $125.00  Date: 09/01/2024  Service: Snow Plowing'],'invoice-1018.txt',{type:'text/plain'});
    Object.defineProperty(conflict,'h38RelativePath',{value:'Customers/Nelson Wood Shims/invoice-1018.txt'});
    const fresh=new File(['Customer: Smith Property  Phone: 218-555-2222  Address: 44 Oak Road  Work Order # WO-7  Service: Lawn mowing'],'poor-note-smith.txt',{type:'text/plain'});
    Object.defineProperty(fresh,'h38RelativePath',{value:'Customers/Smith Property/poor-note-smith.txt'});
    const blocked=new File(['not executable'],'legacy.exe',{type:'application/octet-stream'});
    return await window.H38_SMART_IMPORT.discover([conflict,fresh,blocked],'Acceptance archive');
  });
  must(summary.files===3&&summary.blocked===1,'discovery inventories supported and blocked files without skipping the batch');
  must(summary.conflicts>=1,'incoming conflict is surfaced for owner review');
  must(await page.evaluate(()=>window.__rpcCalls.length===0&&window.__uploads.length===0),'discovery performs zero production writes');
  const visibleRows=await page.locator('[data-h38-smart-import-row]').count();
  must(visibleRows===3,'review table shows every discovered fixture');
  const folderInputAttrs=await page.evaluate(()=>({webkit:document.getElementById('h38SmartImportFolder').hasAttribute('webkitdirectory'),multiple:document.getElementById('h38SmartImportFolder').multiple}));
  must(folderInputAttrs.webkit&&folderInputAttrs.multiple,'folder/USB picker requires explicit browser selection and supports batch files');
  let approvalBlocked=false;
  try{await page.evaluate(()=>window.H38_SMART_IMPORT.commitImport());}catch(error){approvalBlocked=/Confirm owner review/.test(String(error));}
  must(approvalBlocked,'commit is blocked until owner approval is explicitly checked');
  must(await page.evaluate(()=>window.__rpcCalls.length===0&&window.__uploads.length===0),'failed approval check still performs zero writes');
  await page.locator('[data-h38-import-review]').evaluateAll(nodes=>nodes.forEach(node=>{node.checked=true;node.dispatchEvent(new Event('change',{bubbles:true}));}));
  await page.locator('#h38SmartImportOwnerApproval').check();
  await page.evaluate(()=>window.H38_SMART_IMPORT.commitImport());
  const commitEvidence=await page.evaluate(()=>({rpc:window.__rpcCalls,uploads:window.__uploads,html:document.querySelector('[data-h38-smart-import-body]').innerText}));
  must(commitEvidence.uploads.length>0,'approved import preserves original source files');
  must(commitEvidence.uploads.every(x=>x.visibility==='Internal'&&x.meta?.sourcePreserved===true),'preserved sources stay private and carry import provenance');
  const stage=commitEvidence.rpc.find(x=>x.name==='business_office_stage_import');
  const apply=commitEvidence.rpc.find(x=>x.name==='business_office_apply_import');
  must(stage?.args?.p_business_id==='biz-h38','H38 import stages only into the active H38 tenant');
  must(!!apply?.args?.p_run_id,'approved staged import is applied by explicit run ID');
  must(/Import complete/.test(commitEvidence.html),'successful reviewed import reports completion');
  await page.evaluate(()=>{window.state.businessId='biz-northern';window.state.snapshot.customers=[];});
  const northernMatch=await page.evaluate(()=>window.H38_SMART_IMPORT.matchCustomer({customerName:'Nelson Wood Shims',email:'nelson@example.com',phone:'2185551000',address:'123 Main St',customerNumber:'NWS-1'}));
  must(northernMatch.state==='NEW','tenant switch does not reuse H38 customer candidates in Northern');
  const mobileOverflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,dialog:document.getElementById('h38SmartImportDialog')?.getBoundingClientRect().width||0}));
  must(mobileOverflow.page<=mobileOverflow.viewport+2&&mobileOverflow.dialog<=mobileOverflow.viewport,'phone layout stays within the viewport');
  must(pageErrors.length===0,`no browser runtime errors${pageErrors.length?`: ${pageErrors.join(' | ')}`:''}`);
  await browser.close();
  console.log('Smart Import browser acceptance PASS');
})().catch(async error=>{console.error(error.stack||error);process.exit(1);});
