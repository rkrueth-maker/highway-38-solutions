'use strict';
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const authority=path.join(root,'commercial-app/customer-360-authority.js');
const photoStream=path.join(root,'commercial-app/customer-360-photo-stream.js');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent('<!doctype html><html><body><button id="syncButton">Sync</button><main id="mainContent"></main><div id="toast"></div></body></html>');
    await page.evaluate(()=>{
      const jobs=Array.from({length:11},(_,i)=>({'Job ID':`J-${i+1}`,'Customer ID':'C-1','Project Title':`Customer job ${i+1}`,'Status':'Open','Updated Time':`2026-09-${String(14-i).padStart(2,'0')}T12:00:00Z`}));
      window.state={page:'customers',businessId:'B-1',snapshot:{
        customers:[{'Customer ID':'C-1','Customer Name':'Johnson','Email':'johnson@example.com','Phone':'218-555-0101'}],
        properties:[{'Property ID':'P-1','Customer ID':'C-1','Address':'129 Hwy 38'}],jobs,requests:[],tasks:[],scheduleEvents:[],conversations:[],messages:[],emailThreads:[],emailMessages:[],smsThreads:[],smsMessages:[],portalThreads:[],portalMessages:[],
        quotes:[{'Quote ID':'Q-1','Customer ID':'C-1','Project Title':'Garage repair','Status':'Draft'}],quoteRevisions:[],
        meetings:[{'Meeting ID':'M-1','Customer ID':'C-1','Title':'Garage discussion'}],
        siteCaptureSessions:[{'Capture Session ID':'SCAN-1','Site Visit ID':'SV-1','Customer ID':'C-1','Quote ID':'Q-1','Project Title':'Garage site visit','Status':'Complete'}],
        siteMeasurements:[],checklists:[],changeOrders:[],timeEntries:[],jobNotes:[],dailyLogs:[],
        documents:[{'Document ID':'D-1','Customer ID':'C-1','Source Type':'Site Visit','Source ID':'SV-1','File Name':'garage-before.jpg','Mime Type':'image/jpeg','Storage Bucket':'business-office-files','Storage Path':'B-1/Site Visit/SV-1/garage-before.jpg','Status':'Available — Private','Updated Time':'2026-09-15T08:00:00Z'}],
        invoices:[],payments:[],materialRequests:[],assignments:[],inspections:[],recurringPlans:[],followUps:[]
      }};
      window.esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      window.toast=(message,bad)=>{document.getElementById('toast').textContent=String(message||'');document.getElementById('toast').dataset.bad=bad?'1':'0';};
      window.pageHead=(title,sub)=>`<header class="page-head"><h1>${window.esc(title)}</h1><p>${window.esc(sub)}</p></header>`;
      window.renderCustomers=function(){state.page='customers';document.getElementById('mainContent').innerHTML='<header class="page-head"><h1>Customers</h1><p>Customers</p></header><div class="grid"><section class="card span4"><h2>Add or update customer</h2></section><section class="card span4"><h2>Add property</h2></section></div>';};
      window.openPage=page=>{state.page=page;if(page==='customers')renderCustomers();};
      window.queueOperation=async()=>({ok:true});
      window.H38_CUSTOMER_WORKSPACE_DOCUMENTS={customerForRelated:(type,id)=>String(type).toLowerCase().includes('site')&&id==='SV-1'?'C-1':''};
      const local=[{id:'ATTACH-LOCAL-1',attachmentId:'ATTACH-LOCAL-1',businessId:'B-1',relatedRecordType:'Site Visit',relatedRecordId:'SV-1',fileName:'pending-angle.jpg',mimeType:'image/jpeg',captureTime:'2026-09-15T08:30:00Z',base64Data:'iVBORw0KGgo=',syncStatus:'PENDING'}];
      window.H38DB={all:async store=>store==='attachments'?local:[],put:async()=>{},remove:async()=>{}};
      window.H38_SUPABASE_SHARED_CLIENT={ensure:()=>({
        auth:{getSession:async()=>({data:{session:{user:{id:'U-1'}}}})},
        storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://files.example/garage-before.jpg'}}),remove:async()=>({error:null})})},
        from:()=>({update:()=>({eq(){return this;},select:async()=>({error:null})}),insert:async()=>({error:null})})
      })};
      window.confirm=()=>false;
      window.open=()=>({});
    });
    await page.addScriptTag({path:authority});
    await page.addScriptTag({path:photoStream});
    await page.evaluate(()=>{H38_CUSTOMER_360.selectedCustomerId='C-1';renderCustomers();});
    await page.waitForSelector('[data-h38-c360-photo-stream]');
    await page.waitForFunction(()=>document.querySelectorAll('[data-h38-media-key]').length===2);
    assert.equal((await page.locator('[data-h38-c360-photo-stream] h3').textContent()).trim(),'Customer photos & video');
    assert.equal(await page.locator('[data-h38-media-key]').count(),2,'synced and pending media must share one photo stream');
    assert.equal(await page.locator('.h38-c360-photo-local').count(),1,'pending phone photo must remain visible before sync');
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-h38-media-key] img')).some(img=>img.src==='https://files.example/garage-before.jpg'));
    const jobsSection=page.locator('.h38-c360-grid section.card').filter({has:page.locator('h3:text-is("Jobs")')});
    assert.equal(await jobsSection.locator('.h38-c360-row').count(),11,'Customer 360 must expand beyond the old 8-row cap');
    assert.equal(await jobsSection.locator('.h38-c360-row-actions').count(),11,'every visible customer record must receive edit/delete controls');
    assert.equal(await page.getByRole('button',{name:'Edit customer'}).count(),1);
    assert.equal(await page.getByRole('button',{name:'Delete customer'}).count(),1);
    await page.locator('[data-h38-media-key="document:D-1"]').click();
    await page.waitForSelector('#h38C360MediaDialog[open]');
    assert.equal(await page.locator('#h38C360MediaDialog [data-h38-media-edit]').count(),1);
    assert.equal(await page.locator('#h38C360MediaDialog [data-h38-media-delete]').count(),1);
    const contract=await page.evaluate(()=>window.H38_CUSTOMER_360_PHOTO_STREAM);
    assert.equal(contract.allCustomerLinkedMedia,true);
    assert.equal(contract.localPendingMediaVisible,true);
    assert.equal(contract.allCustomerRowsVisible,true);
    assert.equal(contract.editControls,true);
    assert.equal(contract.deleteControls,true);
    assert.equal(contract.automaticCustomerRelease,false);
    assert.equal(contract.automaticCustomerSending,false);
    assert.equal(contract.automaticApproval,false);
    assert.deepEqual(errors,[],'Photo Stream browser pass must not throw page errors');
    console.log(JSON.stringify({status:'PASS',checks:['synced photo thumbnail','pending phone photo thumbnail','signed private preview','11 customer jobs visible','edit/delete on all rows','customer edit/delete controls','full-screen media viewer','no automatic customer release']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
