'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const authority=path.join(root,'commercial-app/customer-360-authority.js');
const runtime=path.join(root,'commercial-app/customer-workspace-documents.js');
const app04=fs.readFileSync(path.join(root,'commercial-app/app-04.js'),'utf8');
const app13=fs.readFileSync(path.join(root,'commercial-app/app-13.js'),'utf8');
const app14=fs.readFileSync(path.join(root,'commercial-app/app-14.js'),'utf8');
assert(app04.includes('name="customerId" type="hidden"'),'customer form must retain the customer id while editing');
assert(app04.includes("existing?'SAVE_ENTITY':'SAVE_CUSTOMER'"),'editing must update the existing customer instead of creating a new id');
assert(app13.includes('id="documentInput" type="file" multiple'),'global document picker must support bulk selection');
assert(!/id="documentInput"[^>]*accept=/.test(app13),'global document picker must not restrict file types');
assert(app14.includes('H38_CUSTOMER_WORKSPACE_DOCUMENTS?.uploadLargeFile'),'files over the offline threshold must route to the resumable uploader');
assert(app14.includes('customerId=attachmentCustomerId'),'attachment queue must retain the customer relationship');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent('<!doctype html><html><head></head><body><main id="mainContent"></main><div id="toast"></div></body></html>');
    await page.evaluate(()=>{
      window.state={page:'customers',businessId:'B-1',snapshot:{
        customers:[
          {'Customer ID':'C-1','Customer Name':'North Pine','Email':'north@example.com','Phone':'218-555-0101','Status':'Active'},
          {'Customer ID':'C-2','Customer Name':'Lake Shop','Email':'lake@example.com','Phone':'218-555-0102','Status':'Active'}
        ],
        properties:[{'Property ID':'P-1','Customer ID':'C-1','Property Name':'Cabin','Address':'1 Pine Rd'}],
        jobs:[],requests:[],quotes:[],quoteRevisions:[],siteCaptureSessions:[],siteMeasurements:[],meetings:[],followUps:[],tasks:[],invoices:[],payments:[],portalMessages:[],checklists:[],jobNotes:[],scheduleEvents:[],conversations:[],messages:[],emailThreads:[],emailMessages:[],smsThreads:[],smsMessages:[],portalThreads:[],changeOrders:[],timeEntries:[],dailyLogs:[],materialRequests:[],assignments:[],inspections:[],recurringPlans:[],
        documents:[{'Document ID':'D-2','Source Type':'Customer','Source ID':'C-2','File Name':'existing-manual.docx','Status':'Available — Private'}]
      }};
      window.esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      window.toast=(message,bad)=>{window.__toast={message:String(message||''),bad:!!bad};};
      window.__ops=[];window.__uploads=[];
      window.queueOperation=async(...args)=>{window.__ops.push(args);return{ok:true};};
      window.handleAttachmentFiles=async(...args)=>{window.__uploads.push(args.map((v,i)=>i===0?Array.from(v).map(f=>f.name):v));};
      window.renderCustomers=function(){
        state.page='customers';
        document.getElementById('mainContent').innerHTML=`<header class="page-head"><h1>Customers</h1><p>Customers</p></header><div class="grid">
          <section class="card span4"><h2>Add or update customer</h2><form id="customerForm"><input name="customerId" type="hidden"><label>Name</label><input name="customerName"><label>Email</label><input name="email"><label>Phone</label><input name="phone"><button type="submit">Add customer</button></form></section>
          <section class="card span4"><h2>Add property</h2><form id="propertyForm"><select name="customerId"><option value="C-1">North Pine</option><option value="C-2">Lake Shop</option></select><input name="propertyName"><input name="address"><button>Save</button></form></section>
        </div>`;
      };
      window.openPage=pageName=>{state.page=pageName;if(pageName==='customers')window.renderCustomers();};
      window.H38Bridge=class{async request(){return{ok:true};}};
    });
    await page.addScriptTag({path:authority});
    await page.waitForFunction(()=>window.H38_CUSTOMER_360&&window.renderCustomers.__h38Customer360===true);
    await page.evaluate(()=>{H38_CUSTOMER_360.selectedCustomerId='C-1';renderCustomers();});
    await page.addScriptTag({path:runtime});
    await page.waitForSelector('[data-h38-customer-directory]');
    await page.waitForFunction(()=>document.querySelectorAll('[data-h38-customer-card]').length===2);
    assert.equal(await page.locator('[data-h38-customer-card="C-2"] .h38-customer-card-meta').textContent(),'0 locations · 1 file','customer-linked source document should be counted without a second database');
    await page.locator('[data-h38-customer-card="C-2"]').click();
    await page.waitForFunction(()=>window.H38_CUSTOMER_360.selectedCustomerId==='C-2'&&document.querySelector('.h38-c360 h2')?.textContent.includes('Lake Shop'));
    await page.locator('[data-h38-edit-customer]').click();
    assert.equal(await page.locator('#customerForm [name="customerId"]').inputValue(),'C-2','edit must preserve selected customer id');
    assert.equal(await page.locator('#customerForm [name="customerName"]').inputValue(),'Lake Shop','edit must load selected customer');
    await page.locator('[data-h38-add-location]').click();
    assert.equal(await page.locator('#propertyForm [name="customerId"]').inputValue(),'C-2','new location must stay attached to selected customer');
    await page.locator('#h38CustomerNoteInput').fill('Prefers text before arrival.');
    await page.locator('#h38SaveCustomerNote').click();
    await page.waitForFunction(()=>window.__ops.length>0);
    const noteOp=await page.evaluate(()=>window.__ops[0]);
    assert.equal(noteOp[0],'SAVE_ENTITY');assert.equal(noteOp[3].record['Customer ID'],'C-2','customer note must be customer-linked');
    await page.waitForSelector('#h38CustomerDocumentInput');
    assert.equal(await page.locator('#h38CustomerDocumentInput').getAttribute('multiple'),'','customer document picker must allow multiple files');
    assert.equal(await page.locator('#h38CustomerDocumentInput').getAttribute('accept'),null,'customer document picker must accept all document types');
    await page.locator('#h38CustomerDocumentInput').setInputFiles([{name:'manual.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('docx')},{name:'estimate.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('xlsx')}]);
    await page.waitForFunction(()=>window.__uploads.length>0);
    const upload=await page.evaluate(()=>window.__uploads[0]);
    assert.deepEqual(upload[0],['manual.docx','estimate.xlsx']);assert.equal(upload[1],'Customer');assert.equal(upload[2],'C-2');assert.equal(upload[3],'Internal');assert.equal(upload[4].customerId,'C-2');
    const contract=await page.evaluate(()=>window.H38_CUSTOMER_WORKSPACE_DOCUMENTS);
    assert.equal(contract.largeFileThreshold,3000000);assert.equal(contract.automaticCustomerRelease,false);assert.equal(contract.automaticCustomerSending,false);
    assert.deepEqual(errors,[],'customer workspace browser flow should not raise page errors');
    console.log(JSON.stringify({status:'PASS',checks:['clickable customer cards','same customer edit id','selected customer location','customer notes','bulk unrestricted document picker','customer-linked upload','private-by-default large-file contract']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
