'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const polish=read('commercial-app/office-polish.js');
const authority=read('docs/architecture/H38_ASSISTANT_AUTHORITY.md');

for(const needle of [
  'h38CrossPlatformBusinessControls:true',
  'erpCenterCommands:true',
  'timeAttendanceCommands:true',
  'teamAccessCommands:true',
  'dataUptakeCommands:true',
  'quoteLearningCommands:true',
  'taskManagerCommands:true',
  'automaticTimePunch:false',
  'automaticTeamAccessChange:false',
  'automaticDataImportApply:false',
  'automaticQuoteLearningMutation:false',
  "return'Opened Time & attendance.",
  "return'Opened Team Access in ERP Center.",
  "return'Opened Existing-data uptake in ERP Center.",
  'started the internal advisory analysis',
  "return'Opened Jobs & Task Manager."
])assert(polish.includes(needle),`management command polish missing ${needle}`);

for(const needle of ['ERP Center','Time & Attendance','Team Access','Existing-data uptake','quote-history analysis','Task Manager / deployment']){
  assert(authority.includes(needle),`assistant authority missing ${needle}`);
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(String(error.message||error)));
  try{
    await page.setContent(`<!doctype html><html><head></head><body>
      <header class="topbar"><button id="personalAssistantButton"><span class="pa-due-dot">1</span></button><button id="globalAiButton">AI</button><button id="h38OfficeSearchButton">Search</button></header>
      <section class="business-bar"><span>Highway 38 Solutions · Owner</span></section>
      <main id="mainContent"><header class="page-head"><h1>Personal Assistant</h1><p>Assistant</p></header><div class="pa-shell"><form id="paCommandForm"><label>Command</label><textarea name="command"></textarea><button>Run</button></form></div></main>
      <nav id="mainNav"></nav>
      <dialog id="h38OfficeSearchDialog"><div class="h38-search-shell"><header><button>Close</button></header><input id="h38OfficeSearchInput"><div id="h38OfficeSearchResults"></div></div></dialog>
    </body></html>`);
    await page.evaluate(()=>{
      window.__erpOpens=[];window.__learningRuns=0;window.__baseCommands=[];
      window.state={page:'assistant',businessId:'B1',snapshot:{user:{roleName:'owner',email:'owner@example.com'}}};
      window.H38_SUPABASE_AUTH={getState:()=>({user:{email:'owner@example.com'}})};
      window.openPage=page=>{window.state.page=page;return true;};
      window.openGlobalAi=()=>{};
      window.H38_ASSISTANT_COMMAND_BUS={
        build:'test-bus',
        canHandle:command=>String(command).toLowerCase()==='open jobs',
        handle:async command=>{window.__baseCommands.push(command);return'base handled';},
        externalActionsEnabled:false,automaticApproval:false,automaticPayment:false,automaticPurchasing:false
      };
      window.H38_PERSONAL_ASSISTANT={build:'test-pa',enabled:true,runCommand:async command=>`base:${command}`};
      window.H38_ERP_FOUNDATION={build:'test-erp'};
      function ensure(id,html){if(document.getElementById(id))return;const node=document.createElement('section');node.id=id;node.innerHTML=html||'';document.body.appendChild(node);}
      document.addEventListener('click',event=>{
        const open=event.target.closest?.('[data-h38-erp-open]');
        if(open){
          window.__erpOpens.push(open.dataset.h38ErpOpen);
          ensure('h38ErpTime','Time & attendance');
          ensure('h38TeamAccess','Team Access');
          ensure('h38DataUptake','Existing-data uptake');
          ensure('h38QuoteLearning','<button type="button" data-h38-learning>Analyze this business</button>');
        }
        if(event.target.closest?.('[data-h38-learning]'))window.__learningRuns+=1;
      },true);
      document.getElementById('paCommandForm').addEventListener('submit',event=>event.preventDefault());
    });
    await page.addScriptTag({path:path.join(root,'commercial-app/office-polish.js')});
    await page.waitForTimeout(120);

    const result=await page.evaluate(async()=>{
      const bus=window.H38_ASSISTANT_COMMAND_BUS;
      const can={
        erp:bus.canHandle('Open ERP Center'),
        time:bus.canHandle('Open Time & Attendance'),
        team:bus.canHandle('Open Team Access'),
        data:bus.canHandle('Open Existing-data uptake'),
        learning:bus.canHandle('Analyze quote history'),
        tasks:bus.canHandle('Open Task Manager / deployment')
      };
      const responses={};
      responses.erp=await bus.handle('Open ERP Center');
      responses.time=await bus.handle('Open Time & Attendance');
      responses.team=await bus.handle('Open Team Access');
      responses.data=await bus.handle('Open Existing-data uptake');
      responses.tasks=await bus.handle('Open Task Manager / deployment');
      const taskPage=window.state.page;
      window.state.page='assistant';
      responses.learning=await bus.handle('Analyze quote history');
      responses.programmaticTeam=await window.H38_PERSONAL_ASSISTANT.runCommand('Open Team Access');
      return{
        can,responses,taskPage,
        busFlags:{
          extended:bus.h38CrossPlatformBusinessControls,
          automaticTimePunch:bus.automaticTimePunch,
          automaticTeamAccessChange:bus.automaticTeamAccessChange,
          automaticDataImportApply:bus.automaticDataImportApply,
          automaticQuoteLearningMutation:bus.automaticQuoteLearningMutation
        },
        paExtended:window.H38_PERSONAL_ASSISTANT.h38CrossPlatformBusinessControls,
        polishFlags:window.H38_OFFICE_POLISH,
        chips:Array.from(document.querySelectorAll('[data-h38-business-control-chip]')).map(node=>node.textContent)
      };
    });
    await page.waitForTimeout(220);
    const activity=await page.evaluate(()=>({erpOpens:window.__erpOpens,learningRuns:window.__learningRuns,baseCommands:window.__baseCommands}));

    assert(Object.values(result.can).every(Boolean),`all management intents must be first-class: ${JSON.stringify(result.can)}`);
    assert.equal(result.taskPage,'work','Task Manager command must open the existing Work/Task Manager authority');
    assert(result.responses.erp.includes('ERP Center'));
    assert(result.responses.time.includes('audited time controls'));
    assert(result.responses.team.includes('explicit Team Access controls'));
    assert(result.responses.data.includes('does not stage or apply'));
    assert(result.responses.learning.includes('internal advisory analysis'));
    assert(result.responses.programmaticTeam.includes('Team Access'),'programmatic Personal Assistant command must use the extended bus');
    assert(activity.erpOpens.includes('erp'),'ERP management commands must use the existing ERP open control');
    assert(activity.erpOpens.includes('time'),'Time command must use the existing ERP time target');
    assert.equal(activity.learningRuns,1,'explicit quote-history analysis should start exactly one existing advisory analysis');
    assert.equal(activity.baseCommands.length,0,'management intents must not fall through to an unrelated base handler');
    assert.equal(result.busFlags.extended,true);
    assert.equal(result.busFlags.automaticTimePunch,false);
    assert.equal(result.busFlags.automaticTeamAccessChange,false);
    assert.equal(result.busFlags.automaticDataImportApply,false);
    assert.equal(result.busFlags.automaticQuoteLearningMutation,false);
    assert.equal(result.paExtended,true);
    assert.equal(result.polishFlags.erpAssistantCommands,true);
    assert.deepEqual(result.chips,['ERP center','Time & attendance','Team access']);
    assert.deepEqual(errors,[],`browser errors: ${errors.join('; ')}`);
    console.log(JSON.stringify({status:'PASS',intents:Object.keys(result.can),erpTargets:activity.erpOpens,quoteLearningRuns:activity.learningRuns,taskManagerPage:result.taskPage,mutationBoundaries:result.busFlags},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
