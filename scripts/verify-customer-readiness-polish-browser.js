'use strict';
const path=require('path');
const {chromium}=require('playwright');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const authority=path.join(root,'commercial-app/customer-360-authority.js');
const integration=path.join(root,'commercial-app/customer-360-browser-integration-v3.js');
const polish=path.join(root,'commercial-app/customer-readiness-polish.js');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent(`<!doctype html><html><head></head><body><header class="topbar"><div class="top-actions"><button id="globalAiButton">AI</button></div></header><nav id="mainNav"><button data-page="today">Today</button></nav><main id="mainContent"></main><dialog id="globalAiDialog"><form id="paCommandForm"><textarea name="command"></textarea></form></dialog><div id="h38MeetingVisitDock"></div></body></html>`);
    await page.evaluate(()=>{
      const now=new Date().toISOString();
      window.state={page:'today',businessId:'B-OWNER',snapshot:{
        customers:[{'Customer ID':'C-JOHN','Customer Name':'Johnson','Email':'johnson@example.com'}],
        properties:[{'Property ID':'P-JOHN','Customer ID':'C-JOHN','Address':'129 Hwy 38','Updated Time':now}],
        jobs:[{'Job ID':'J-JOHN','Customer ID':'C-JOHN','Project Title':'Gutter repair','Status':'Open','Updated Time':now}],
        quotes:[{'Quote ID':'Q-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Project Title':'Gutters','Quote Number':'Q-101','Status':'Draft','Updated Time':now}],
        siteCaptureSessions:[{'Capture Session ID':'SV-JOHN','Customer ID':'C-JOHN','Quote ID':'Q-JOHN','Project Title':'Gutter site visit','Status':'COMPLETE','Updated Time':now}],
        meetings:[{'Meeting ID':'MT-JOHN','Customer ID':'C-JOHN','Title':'Johnson follow-up','Status':'Review','Updated Time':now}],
        followUps:[{'Follow-up ID':'F-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Title':'Call Johnson','Status':'Open','Due Time':now,'Updated Time':now}],
        invoices:[{'Invoice ID':'I-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Invoice Number':'INV-101','Status':'Open','Balance Due':125,'Updated Time':now}],
        scheduleEvents:[{'Schedule ID':'S-JOHN','Customer ID':'C-JOHN','Start Time':new Date(Date.now()+86400000).toISOString(),'Status':'Scheduled'}],
        documents:[{'Document ID':'D-JOHN','Customer ID':'C-JOHN','File Name':'gutter-before.jpg','Updated Time':now}],
        requests:[],quoteRevisions:[],siteMeasurements:[],tasks:[],payments:[],portalMessages:[],checklists:[],jobNotes:[],conversations:[],messages:[],emailThreads:[],emailMessages:[],smsThreads:[],smsMessages:[],portalThreads:[],changeOrders:[],timeEntries:[],dailyLogs:[],materialRequests:[],assignments:[],inspections:[],recurringPlans:[],expenses:[]
      }};
      window.esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
      window.money=value=>`$${Number(value||0).toFixed(2)}`;
      window.toast=()=>{};
      window.renderToday=function(){state.page='today';document.getElementById('mainContent').innerHTML='<header class="page-head"><h1>Today</h1></header><section class="card"><h2>Legacy today</h2></section>';};
      window.renderCustomers=function(){state.page='customers';document.getElementById('mainContent').innerHTML='<header class="page-head"><h1>Customers</h1></header><div class="grid"><section class="card span4"><h2>Add or update customer</h2></section></div>';};
      window.openPage=function(pageName){state.page=pageName;if(pageName==='today')renderToday();else if(pageName==='customers')renderCustomers();else document.getElementById('mainContent').innerHTML=`<header class="page-head"><h1>${pageName}</h1></header>`;};
      window.H38_FIELD_VISIT={open:args=>window.__siteOpen=args};
      window.H38_CONVERSATION_MEETING_ASSISTANT={startMeeting:args=>window.__meetingOpen=args};
      document.getElementById('globalAiButton').onclick=()=>document.getElementById('globalAiDialog').showModal();
      window.H38Bridge=class{async request(){return{ok:true};}};
    });
    await page.addScriptTag({path:authority});
    await page.addScriptTag({path:integration});
    await page.addScriptTag({path:polish});
    await page.waitForSelector('#h38NewActionButton');
    await page.evaluate(()=>renderToday());
    await page.waitForSelector('#h38CustomerReadyToday');
    assert.equal((await page.locator('#h38CustomerReadyToday h1').textContent()).trim(),'What needs attention today?');
    assert.equal(await page.locator('.h38-ready-metrics button').count(),5,'Today command center should have five business metrics');
    assert.equal(await page.locator('.h38-ready-prompts button').count(),4,'assistant should show useful owner-language prompts');
    await page.locator('#h38NewActionButton').click();
    assert.equal(await page.locator('#h38QuickCreateDialog [data-h38-quick]').count(),8,'universal New menu should cover common creation paths');
    await page.locator('#h38QuickCreateDialog button[value="cancel"]').click();
    await page.evaluate(()=>{H38_CUSTOMER_360.selectedCustomerId='C-JOHN';renderCustomers();});
    await page.waitForSelector('#h38CustomerReadyHero');
    assert((await page.locator('#h38CustomerReadyHero').textContent()).includes('Johnson'),'Customer 360 hero should identify the customer');
    assert((await page.locator('#h38CustomerReadyHero').textContent()).includes('$125.00'),'Customer 360 hero should show customer billing balance');
    await page.locator('#h38CustomerReadyHero [data-h38-customer-action="site"]').click();
    assert.equal(await page.evaluate(()=>window.__siteOpen.customerId),'C-JOHN','site visit should inherit customer context');
    await page.evaluate(()=>{state.page='customers';H38_CUSTOMER_360.selectedCustomerId='C-JOHN';renderCustomers();});
    await page.waitForSelector('#h38CustomerReadyHero');
    await page.locator('#h38CustomerReadyHero').getByRole('button',{name:'Meeting',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__meetingOpen.customerId),'C-JOHN','meeting should inherit customer context');
    await page.evaluate(()=>{window.H38_FIELD_VISIT_CORE={state:{visit:{sessionId:'VISIT-1',projectTitle:'Garage visit',photoAttachmentIds:['P1','P2'],videoAttachmentIds:['V1'],measurements:[1,2,3],unknowns:['confirm outlet']}}};});
    await page.waitForSelector('#h38CustomerReadyVisitSummary',{timeout:2500});
    const visitText=await page.locator('#h38CustomerReadyVisitSummary').textContent();
    assert(visitText.includes('2 photos')&&visitText.includes('1 walkthroughs')&&visitText.includes('3 measurements'),'site visit summary should show capture counts');
    const contract=await page.evaluate(()=>window.H38_CUSTOMER_READINESS_POLISH);
    for(const key of ['automaticApproval','automaticCustomerSending','automaticPurchase','automaticPayment','automaticScheduling'])assert.equal(contract[key],false,`${key} must remain false`);
    assert.deepEqual(errors,[],'customer readiness browser should have no page errors');
    console.log(JSON.stringify({status:'PASS',checks:['universal New','Today command center','assistant prompts','Customer 360 summary','customer-context site visit','customer-context meeting','site visit capture summary','owner-control safety']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
