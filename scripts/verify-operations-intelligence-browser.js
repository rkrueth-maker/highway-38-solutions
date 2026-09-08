const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const opsPath=path.join(root,'commercial-app','operations-intelligence.js');
function assert(condition,message){if(!condition)throw new Error(message);console.log('PASS:',message);}
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
      const page=await browser.newPage({viewport});
      await page.setContent('<!doctype html><html><head></head><body><main id="mainContent"></main><div id="toast"></div></body></html>');
      await page.evaluate(()=>{
        let seq=0;
        const now=new Date().toISOString();
        window.state={page:'today',businessId:'B-1',snapshot:{
          user:{roleId:'owner',roleName:'owner'},
          customers:[{'Customer ID':'C-1','Customer Name':'North Shop','Access Notes':'Use east service door'}],
          properties:[{'Property ID':'P-1','Customer ID':'C-1','Property Name':'Main Shop','Access Notes':'Keypad at east door'}],
          assets:[],
          jobs:[{'Job ID':'J-1','Customer ID':'C-1','Property ID':'P-1','Project Title':'Garage heater repair','Status':'Approved','Scope':'Inspect and repair unit heater','Updated Time':now}],
          quotes:[{'Quote ID':'Q-1','Job ID':'J-1','Customer ID':'C-1','Project Title':'Garage heater repair','Status':'Accepted','Total':1250,'Updated Time':now}],
          scheduleEvents:[{'Schedule Event ID':'S-1','Job ID':'J-1','Customer ID':'C-1','Start Time':new Date(Date.now()+3600000).toISOString(),'Assigned To':'Tech 1'}],
          siteCaptureSessions:[{'Capture Session ID':'SV-1','Job ID':'J-1','Customer ID':'C-1','Project Title':'Garage heater repair','Status':'Complete','Updated Time':now}],
          jobNotes:[{'Job Note ID':'N-1','Job ID':'J-1','Customer ID':'C-1','Note':'The heater has a leak and should be repaired before winter.','Updated Time':now}],
          dailyLogs:[],changeOrders:[],documents:[{'Document ID':'D-1','Job ID':'J-1','Customer ID':'C-1','Quote ID':'Q-1','File Name':'heater-photo.jpg'}],
          maintenance:[],mediaAnalyses:[],workOpportunities:[]
        }};
        window.records=name=>window.state.snapshot[name]||[];
        window.newId=prefix=>`${prefix}-TEST-${++seq}`;
        window.money=n=>`$${Number(n||0).toFixed(2)}`;
        window.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        window.toast=(message,bad)=>{window.__toast={message,bad};};
        window.__ops=[];
        window.queueOperation=async(...args)=>{window.__ops.push(args);return {status:'PASS'};};
        window.H38_JOB_LIFECYCLE={getSelectedJob:()=>window.__selectedJob||'J-1'};
        window.renderToday=()=>{document.getElementById('mainContent').innerHTML='<section id="baseToday"><h1>Today</h1></section>';};
        window.renderWork=()=>{document.getElementById('mainContent').innerHTML='<section id="baseWork"><h1>Work</h1></section>';};
        window.renderFleet=()=>{document.getElementById('mainContent').innerHTML='<section id="baseFleet"><h1>Fleet</h1></section>';};
        window.renderInventory=()=>{document.getElementById('mainContent').innerHTML='<section id="baseInventory"><h1>Inventory</h1></section>';};
        window.openPage=key=>{window.state.page=key;({today:window.renderToday,work:window.renderWork,fleet:window.renderFleet,inventory:window.renderInventory}[key]||window.renderToday)();};
      });
      await page.addScriptTag({path:opsPath});
      await page.evaluate(()=>window.renderToday());
      await page.waitForTimeout(50);
      assert(await page.locator('#h38OperationsActionCenter').count()===1,`Owner Action Center renders at ${viewport.width}px`);
      assert(await page.getByText('Owner Action Center').isVisible(),`Owner Action Center is visible at ${viewport.width}px`);
      await page.locator('[data-h38-ops="brief"]').first().click();
      assert(await page.locator('#h38PreVisitBriefDialog[open]').count()===1,`Pre-visit brief opens at ${viewport.width}px`);
      assert((await page.locator('#h38BriefBody').innerText()).includes('Garage heater repair'),`Pre-visit brief contains selected job at ${viewport.width}px`);
      await page.locator('#h38PreVisitBriefDialog button[value="cancel"]').first().click();
      await page.locator('[data-h38-ops="opportunities"]').first().click();
      assert(await page.locator('#h38OpportunityFinderDialog[open]').count()===1,`Opportunity review opens at ${viewport.width}px`);
      assert((await page.locator('#h38OpportunityBody').innerText()).toLowerCase().includes('leak'),`Explicit field finding is surfaced at ${viewport.width}px`);
      const quoteCountBefore=await page.evaluate(()=>window.state.snapshot.quotes.length);
      await page.locator('[data-h38-save-opportunity]').first().click();
      await page.waitForTimeout(25);
      const saved=await page.evaluate(()=>({ops:window.__ops.map(x=>x.slice(0,4)),quotes:window.state.snapshot.quotes.length}));
      assert(saved.ops.some(x=>x[0]==='SAVE_ENTITY'&&x[1]==='Work Opportunity'),`Opportunity save uses internal SAVE_ENTITY at ${viewport.width}px`);
      assert(saved.quotes===quoteCountBefore,`Opportunity review does not auto-create a quote at ${viewport.width}px`);
      await page.locator('#h38OpportunityFinderDialog button[value="cancel"]').first().click();
      await page.locator('[data-h38-ops="new-asset"]').first().click();
      assert(await page.locator('#h38AssetPassportDialog[open]').count()===1,`Asset passport dialog opens at ${viewport.width}px`);
      await page.selectOption('#h38AssetPassportDialog select[name="customerId"]','C-1');
      await page.fill('#h38AssetPassportDialog input[name="name"]','Reznor Unit Heater');
      await page.fill('#h38AssetPassportDialog input[name="manufacturer"]','Reznor');
      await page.fill('#h38AssetPassportDialog input[name="model"]','UDAP-75');
      await page.fill('#h38AssetPassportDialog input[name="serial"]','SN-12345');
      await page.locator('#h38AssetPassportForm button[type="submit"]').click();
      await page.waitForTimeout(50);
      assert(await page.evaluate(()=>window.state.snapshot.assets.length===1),`Asset passport saves to active snapshot at ${viewport.width}px`);
      assert(await page.evaluate(()=>window.__ops.some(x=>x[0]==='SAVE_ENTITY'&&x[1]==='Asset')),`Asset passport uses internal SAVE_ENTITY at ${viewport.width}px`);
      await page.evaluate(()=>window.openPage('fleet'));
      await page.waitForTimeout(50);
      assert(await page.locator('#h38AssetPassportPanel').count()===1,`Asset Passport panel renders on Fleet at ${viewport.width}px`);
      assert((await page.locator('#h38AssetPassportPanel').innerText()).includes('Reznor Unit Heater'),`Saved asset appears in passport list at ${viewport.width}px`);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
      assert(!overflow,`Operations panels avoid page-level horizontal overflow at ${viewport.width}px`);
      await page.evaluate(()=>{window.state.snapshot.user={roleId:'staff',roleName:'staff'};window.renderToday();});
      await page.waitForTimeout(50);
      assert(await page.locator('#h38OperationsActionCenter').count()===0,`Staff does not receive owner operations panel at ${viewport.width}px`);
      await page.close();
    }
    console.log('Operations intelligence browser verification PASS');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
