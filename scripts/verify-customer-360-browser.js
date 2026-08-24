'use strict';
const path=require('path');
const {chromium}=require('playwright');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const authority=path.join(root,'commercial-app/customer-360-authority.js');
const integration=path.join(root,'commercial-app/customer-360-browser-integration-v3.js');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent(`<!doctype html><html><head></head><body><main id="mainContent"></main><aside><form id="paCommandForm"><textarea name="command"></textarea><button>Run</button></form><div id="testToast"></div></aside></body></html>`);
    await page.evaluate(()=>{
      window.state={page:'customers',snapshot:{
        customers:[
          {'Customer ID':'C-SMITH-1','Customer Name':'Smith','Email':'smith1@example.com'},
          {'Customer ID':'C-SMITH-2','Customer Name':'Smith','Email':'smith2@example.com'},
          {'Customer ID':'C-JOHN','Customer Name':'Johnson','Email':'johnson@example.com'},
          {'Customer ID':'C-TEST','Customer Name':'Recovered Customer Portal Test','Internal Only':true,'Test Data':true}
        ],
        properties:[
          {'Property ID':'P-SMITH-1','Customer ID':'C-SMITH-1','Address':'101 Pine Rd','Updated Time':'2026-08-20T12:00:00Z'},
          {'Property ID':'P-SMITH-2','Customer ID':'C-SMITH-2','Address':'202 Oak Rd','Updated Time':'2026-08-20T12:00:00Z'},
          {'Property ID':'P-JOHN','Customer ID':'C-JOHN','Address':'129 Hwy 38','Updated Time':'2026-08-20T12:00:00Z'}
        ],
        jobs:[
          {'Job ID':'J-SMITH-1','Customer ID':'C-SMITH-1','Project Title':'Deck repair','Status':'Open','Updated Time':'2026-08-21T12:00:00Z'},
          {'Job ID':'J-SMITH-2','Customer ID':'C-SMITH-2','Project Title':'Roof repair','Status':'Open','Updated Time':'2026-08-21T12:00:00Z'},
          {'Job ID':'J-JOHN','Customer ID':'C-JOHN','Project Title':'Gutter repair','Status':'Open','Updated Time':'2026-08-22T12:00:00Z'}
        ],
        requests:[{'Request ID':'R-JOHN','Customer ID':'C-JOHN','Subject':'Gutter request','Status':'Open','Updated Time':'2026-08-19T12:00:00Z'}],
        quotes:[{'Quote ID':'Q-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Project Title':'Gutters','Quote Number':'Q-101','Status':'Draft','Updated Time':'2026-08-23T12:00:00Z'}],
        quoteRevisions:[],
        siteCaptureSessions:[{'Site Visit ID':'SV-JOHN','Customer ID':'C-JOHN','Quote ID':'Q-JOHN','Project Title':'Gutter site visit','Updated Time':'2026-08-23T13:00:00Z'}],
        siteMeasurements:[{'Measurement ID':'M-JOHN','Customer ID':'C-JOHN','Site Visit ID':'SV-JOHN','Label':'Gutter length','Updated Time':'2026-08-23T13:05:00Z'}],
        meetings:[{'Meeting ID':'MT-JOHN','Customer ID':'C-JOHN','Title':'Johnson follow-up','Updated Time':'2026-08-23T14:00:00Z'}],
        documents:[{'Document ID':'D-JOHN','Customer ID':'C-JOHN','Quote ID':'Q-JOHN','File Name':'gutter-before.jpg','Updated Time':'2026-08-23T13:10:00Z'}],
        followUps:[{'Follow-up ID':'F-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Title':'Call Johnson','Status':'Open','Updated Time':'2026-08-23T15:00:00Z'}],
        tasks:[{'Task ID':'T-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Task Title':'Order gutter','Status':'Open','Updated Time':'2026-08-23T15:10:00Z'}],
        invoices:[{'Invoice ID':'I-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Invoice Number':'INV-101','Status':'Draft','Updated Time':'2026-08-23T16:00:00Z'}],
        payments:[],portalMessages:[],checklists:[],jobNotes:[],scheduleEvents:[],conversations:[],messages:[],emailThreads:[],emailMessages:[],smsThreads:[],smsMessages:[],portalThreads:[],changeOrders:[],timeEntries:[],dailyLogs:[],materialRequests:[],assignments:[],inspections:[],recurringPlans:[],
        expenses:[{'Expense ID':'E-PRIVATE','Job ID':'J-JOHN','Description':'internal material cost','Amount':999}]
      }};
      window.esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      window.toast=message=>{document.getElementById('testToast').textContent=String(message||'');};
      window.pageHead=(title,sub)=>`<header class="page-head"><h1>${window.esc(title)}</h1><p>${window.esc(sub)}</p></header>`;
      window.renderCustomers=function(){
        state.page='customers';
        document.getElementById('mainContent').innerHTML=`<header class="page-head"><h1>Customers</h1><p>Customers</p></header><div class="grid"><section class="card span4"><h2>Add or update customer</h2><p>setup</p></section><section class="card span4"><h2>Add property</h2><p>setup</p></section></div>`;
      };
      window.openPage=function(pageName){state.page=pageName;if(pageName==='customers')window.renderCustomers();};
      window.H38Bridge=class{async request(action,args){window.__lastBridgeRequest={action,args};return{ok:true};}};
    });
    await page.addScriptTag({path:authority});
    await page.addScriptTag({path:integration});
    await page.evaluate(()=>{H38_CUSTOMER_360.selectedCustomerId='C-JOHN';renderCustomers();});
    await page.waitForSelector('.h38-c360-activity');
    assert.equal((await page.locator('.h38-c360 h2').first().textContent()).trim(),'Johnson');
    assert.equal((await page.locator('.h38-c360-activity h3').textContent()).trim(),'Recent activity');
    assert.equal(await page.locator('details.h38-c360-detail-group').count(),3);
    const summaries=await page.locator('details.h38-c360-detail-group > summary strong').allTextContents();
    assert.deepEqual(summaries,['Active work','History, conversations & files','Billing history']);
    assert.equal(await page.locator('details.h38-c360-detail-group').nth(0).getAttribute('open'),'');
    assert.equal(await page.locator('details.h38-c360-detail-group').nth(1).getAttribute('open'),null);
    assert.equal(await page.locator('body').textContent().then(t=>t.includes('internal material cost')),false,'internal expense must not render');
    const firstActivity=await page.locator('.h38-c360-event strong').first().textContent();assert(firstActivity&&firstActivity.trim().length,'activity feed should render a title');
    const search=page.locator('#h38Customer360Search');await search.fill('Recovered Customer Portal Test');await search.dispatchEvent('input');
    assert.equal(await page.locator('[data-c360-policy-customer]').count(),0,'internal test root must stay hidden');
    await page.locator('#paCommandForm textarea').fill('Smiths');await page.locator('#paCommandForm').evaluate(form=>form.requestSubmit());
    await page.waitForTimeout(50);assert((await page.locator('#testToast').textContent()).includes('more than one possible customer'),'duplicate Smith should request disambiguation');
    assert.equal(await page.evaluate(()=>H38_CUSTOMER_360.selectedCustomerId),'C-JOHN','ambiguous lookup must not switch customer');
    await page.locator('#paCommandForm textarea').fill('Johnsn');await page.locator('#paCommandForm').evaluate(form=>form.requestSubmit());await page.waitForTimeout(50);
    assert.equal(await page.evaluate(()=>H38_CUSTOMER_360.selectedCustomerId),'C-JOHN','owner typo should resolve Johnson');
    await page.evaluate(async()=>{
      const bridge=new H38Bridge();
      await bridge.request('completionSync',{operations:[
        {action:'SAVE_ENTITY',payload:{entity:'expenses',record:{'Expense ID':'E-NEW','Quote ID':'Q-JOHN'}}},
        {action:'SAVE_ENTITY',payload:{entity:'documents',record:{'Document ID':'D-NEW','Quote ID':'Q-JOHN','File Name':'new.jpg'}}}
      ]});
    });
    const synced=await page.evaluate(()=>window.__lastBridgeRequest.args.operations);
    assert.equal(synced[0].payload.record['Customer ID'],undefined,'finance write must remain customer-free');
    assert.equal(synced[1].payload.record['Customer ID'],'C-JOHN','operational child should inherit unique customer');
    assert.deepEqual(errors,[],'browser should have no page errors');
    console.log(JSON.stringify({status:'PASS',checks:['render Johnson Customer 360','recent activity','progressive disclosure','internal finance hidden','internal test hidden','duplicate Smith ambiguity','one-character typo','finance sync isolation','operational source inheritance']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
