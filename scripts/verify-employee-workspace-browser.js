'use strict';
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const employeeScript=path.join(root,'commercial-app','employee-workspace.js');
const authorityScript=path.join(root,'commercial-app','desktop-navigation-authority.js');

function assert(condition,message){if(!condition)throw new Error(message);}
async function installHarness(page,{role='staff',authForm=false,authority=false,deferredRole=false}={}){
  await page.setContent(`<!doctype html><html><body>
    <header><button id="globalAiButton">AI</button><button id="voiceButton">Voice</button></header>
    <section class="business-bar"><select><option>Business</option></select><button>Open</button><span id="businessStatus"></span></section>
    <nav id="mainNav"></nav><main id="mainContent" tabindex="-1">${authForm?'<form id="h38AuthForm"><input id="h38AuthEmail"><input id="h38AuthPassword"></form>':'<div data-base-office>Base office</div>'}</main>
    <div id="toast" class="hidden"></div><div id="h38ErpBody"></div>
  </body></html>`);
  await page.evaluate(({role,authForm,deferredRole})=>{
    const now='2026-09-03T20:00:00.000Z';
    const snapshot=authForm||deferredRole?null:{user:{roleId:role,roleName:role},business:{businessId:'B-1',businessName:'Test Business'}};
    window.state={page:'today',businessId:'B-1',snapshot};
    window.__calls=[];
    window.__workspace={
      profile:{membershipId:'M-1',authUserId:'U-1',email:'employee@example.com',displayName:'Alex Employee',jobTitle:'Installer',role:'staff'},
      time:{role:'staff',canEdit:false,currentPunch:null,recent:[]},
      tasks:[{'Task ID':'TASK-1','Job ID':'JOB-1','Task Title':'Install cabinet','Assigned User ID':'U-1','Status':'Open','Due Time':'2026-09-04T15:00:00.000Z'}],
      jobs:[{'Job ID':'JOB-1','Customer ID':'CUS-1','Project Title':'Kitchen project','Status':'Active'}],
      customers:[{'Customer ID':'CUS-1','Customer Name':'Sample Customer'}],schedule:[],androidAndWebSameAccount:true,assignedWorkOnly:true
    };
    const db={
      rpc:async(name,args)=>{
        window.__calls.push({type:'rpc',name,args});
        if(name==='business_office_employee_workspace')return {data:structuredClone(window.__workspace),error:null};
        if(name==='business_office_clock_in'){
          window.__workspace.time.currentPunch={'Time Entry ID':'TIME-1','Job ID':args.p_job_id||'','Task ID':args.p_task_id||'','Start Time':now,'Status':'Clocked In'};
          return {data:structuredClone(window.__workspace.time.currentPunch),error:null};
        }
        if(name==='business_office_clock_out'){window.__workspace.time.currentPunch=null;return {data:{Status:'Recorded'},error:null};}
        if(name==='business_office_employee_update_task'){
          const task=window.__workspace.tasks.find(row=>row['Task ID']===args.p_task_id);if(task)task.Status=args.p_status;
          return {data:structuredClone(task||{}),error:null};
        }
        if(name==='business_office_team_directory')return {data:{employees:[{membershipId:'M-2',authUserId:'U-2',email:'alice@example.com',displayName:'Alice',jobTitle:'Installer',status:'active'}],automaticEmailSending:false,taskManagerAssignmentAuthority:true},error:null};
        if(name==='business_office_invite_employee')return {data:{membershipId:'M-3',email:args.p_email,displayName:args.p_display_name||args.p_email,jobTitle:args.p_job_title||'',role:'staff',status:'invited',automaticEmailSent:false},error:null};
        return {data:{},error:null};
      },
      auth:{signUp:async(payload)=>{window.__calls.push({type:'signup',payload});return {data:{session:null,user:{email:payload.email}},error:null};}}
    };
    window.H38_SUPABASE_SHARED_CLIENT={ensure:()=>db};
    window.H38_ACTIVE_BRIDGE={connect:()=>{window.__calls.push({type:'connect'});}};
    window.H38_PROFITABILITY_OPERATING_LAYER={writeSettings:()=>true};
    window.openPage=function(pageName){window.__calls.push({type:'base-open',pageName});window.state.page=pageName;document.getElementById('mainContent').innerHTML=`<h1>Base ${pageName}</h1>`;};
    window.renderNav=function(){window.__calls.push({type:'base-nav'});document.getElementById('mainNav').innerHTML='<button>Base nav</button>';};
    window.renderWork=function(){
      window.__calls.push({type:'generic-work-render'});
      document.getElementById('mainContent').insertAdjacentHTML('afterbegin','<section data-generic-site-visits><h2>Site Visits</h2><p>Open, edit or delete a Site Visit directly.</p><button>Start Site Visit</button><div>No Site Visits yet.</div></section>');
    };
    window.toast=function(message,bad){window.__calls.push({type:'toast',message,bad:!!bad});};
  },{role,authForm,deferredRole});
  await page.addScriptTag({path:employeeScript});
  if(authority)await page.addScriptTag({path:authorityScript});
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const phone=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 Android H38SiteScannerAndroid/0.5.32'});
    const page=await phone.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(String(error.message||error)));

    // Reproduce the real production lifecycle: Office exists first, Staff role is unknown,
    // then authenticated Staff identity arrives later. Role resolution by itself must NOT
    // trigger a timer-based takeover. The canonical startup openPage call owns the transition.
    await installHarness(page,{role:'staff',authority:true,deferredRole:true});
    assert(await page.locator('[data-base-office]').count()===1,'Deferred Staff test must begin on the base Office surface.');
    assert(await page.locator('.h38-employee-page').count()===0,'Employee UI must not guess Staff before auth resolves.');
    await page.evaluate(()=>{window.state.snapshot={user:{roleId:'staff',roleName:'staff'},business:{businessId:'B-1',businessName:'Test Business'}};});
    await page.waitForTimeout(1350);
    assert(await page.locator('[data-base-office]').count()===1,'Resolved Staff role must not cause a delayed polling takeover.');
    assert(await page.locator('.h38-employee-page').count()===0,'No 1.2-second Staff takeover is allowed.');

    await page.evaluate(()=>window.openPage('today'));
    await page.waitForSelector('.h38-employee-page h1',{state:'visible'});
    assert(await page.locator('.h38-employee-page h1').textContent()==='Today','Canonical Staff startup should land directly on Today.');
    let calls=await page.evaluate(()=>window.__calls);
    assert(!calls.some(call=>call.type==='base-open'),'Authenticated Staff startup must not invoke the generic Office renderer first.');
    const nav=await page.locator('#mainNav').innerText();
    assert(nav.includes('Today')&&nav.includes('My Tasks')&&!nav.includes('Quotes'),'Staff nav must be Today + My Tasks only.');
    assert((await page.locator('.h38-employee-mode').first().innerText()).includes('H38 phone app'),'Native shell must identify phone-app experience.');
    assert(await page.locator('#globalAiButton').isHidden(),'Employee shell should hide owner AI launcher.');
    assert((await page.locator('body').innerText()).includes('Install cabinet'),'Assigned task must be visible on Today.');

    await page.locator('[data-h38-clock-task="TASK-1"]').click();
    await page.waitForFunction(()=>window.__workspace.time.currentPunch?.['Task ID']==='TASK-1');
    calls=await page.evaluate(()=>window.__calls);
    const clockCall=calls.find(call=>call.name==='business_office_clock_in');
    assert(clockCall&&clockCall.args.p_job_id==='JOB-1'&&clockCall.args.p_task_id==='TASK-1','Task punch must carry Job ID and Task ID.');

    await page.locator('[data-h38-open-my-tasks]').first().click();
    await page.waitForFunction(()=>document.querySelector('.h38-employee-page h1')?.textContent==='My Tasks');
    assert(await page.evaluate(()=>window.state.page)==='my-tasks','Staff My Tasks must use its own route instead of generic work.');

    // Even if legacy code calls the generic Work renderer directly, the Staff renderer boundary
    // must route back to My Tasks and leave state.page outside the generic work route.
    await page.evaluate(()=>window.renderWork());
    await page.waitForFunction(()=>document.querySelector('.h38-employee-page h1')?.textContent==='My Tasks');
    const mainText=await page.locator('#mainContent').innerText();
    assert(!mainText.includes('Site Visits')&&!mainText.includes('Start Site Visit'),'Staff renderer boundary must reject generic Site Visits rendering.');
    assert(await page.evaluate(()=>window.state.page)==='my-tasks','Generic renderWork must not put Staff back on state.page=work.');
    assert(await page.locator('#mainContent > .h38-employee-page').count()===1,'Staff My Tasks must retain one employee workspace root.');

    await page.locator('[data-h38-task-status="TASK-1"]').selectOption({label:'Started'});
    await page.locator('[data-h38-task-note="TASK-1"]').fill('Started layout.');
    await page.locator('[data-h38-save-task="TASK-1"]').click();
    await page.waitForFunction(()=>window.__calls.some(call=>call.name==='business_office_employee_update_task'));
    calls=await page.evaluate(()=>window.__calls);
    const taskCall=calls.find(call=>call.name==='business_office_employee_update_task');
    assert(taskCall.args.p_status==='Started'&&taskCall.args.p_note==='Started layout.','Employee task status/note update must use bounded RPC.');
    await page.evaluate(()=>window.openPage('quotes'));
    await page.waitForFunction(()=>document.querySelector('.h38-employee-page h1')?.textContent==='Today');
    assert(!errors.length,`Staff phone browser error(s): ${errors.join(' | ')}`);
    await phone.close();

    const desktop=await browser.newContext({viewport:{width:1440,height:1000}});
    const owner=await desktop.newPage();
    const ownerErrors=[];owner.on('pageerror',error=>ownerErrors.push(String(error.message||error)));
    await installHarness(owner,{role:'owner'});
    await owner.waitForSelector('#h38TeamAccess',{state:'attached'});
    assert((await owner.locator('#h38TeamAccess').innerText()).includes('same account works in the phone app and web app'),'Owner Team Access must explain app/web parity.');
    assert((await owner.locator('#h38TeamAccess').innerText()).includes('Task Manager'),'Task Manager must remain assignment authority.');
    await owner.locator('#h38EmployeeName').fill('Bob Builder');
    await owner.locator('#h38EmployeeEmail').fill('bob@example.com');
    await owner.locator('#h38EmployeeTitle').fill('Installer');
    await owner.locator('#h38EmployeeInviteForm button[type="submit"]').click();
    await owner.waitForFunction(()=>window.__calls.some(call=>call.name==='business_office_invite_employee'));
    calls=await owner.evaluate(()=>window.__calls);
    const inviteCall=calls.find(call=>call.name==='business_office_invite_employee');
    assert(inviteCall.args.p_email==='bob@example.com','Owner must prepare exact-email employee membership.');
    assert(!ownerErrors.length,`Owner desktop browser error(s): ${ownerErrors.join(' | ')}`);
    await desktop.close();

    const signupContext=await browser.newContext({viewport:{width:390,height:844}});
    const signup=await signupContext.newPage();
    await installHarness(signup,{role:'',authForm:true});
    await signup.waitForSelector('[data-h38-show-signup]');
    await signup.locator('[data-h38-show-signup]').click();
    await signup.locator('#h38EmployeeSignupEmail').fill('invited@example.com');
    await signup.locator('#h38EmployeeSignupPassword').fill('very-secure-123');
    await signup.locator('#h38EmployeeSignupConfirm').fill('very-secure-123');
    await signup.locator('#h38EmployeeSignupForm button[type="submit"]').click();
    await signup.waitForFunction(()=>window.__calls.some(call=>call.type==='signup'));
    calls=await signup.evaluate(()=>window.__calls);
    assert(calls.find(call=>call.type==='signup')?.payload?.email==='invited@example.com','Invited employee signup must use the exact entered email.');
    await signupContext.close();

    console.log(JSON.stringify({status:'PASS',mobileViewport:'390x844',desktopViewport:'1440x1000',deferredStaffRoleTested:true,delayedRolePollingBlocked:true,genericOfficeFirstRenderBlocked:true,staffAssignedWorkOnly:true,staffTasksRoute:'my-tasks',staffGenericWorkFence:true,staffSiteVisitLeakBlocked:true,taskPunchLinked:true,taskStatusUpdate:true,managerTeamAccess:true,employeeSignup:true,appWebParity:true},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
