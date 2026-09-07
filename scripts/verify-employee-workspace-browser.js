'use strict';
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const employeeScript=path.join(root,'commercial-app','employee-workspace.js');
const authorityScript=path.join(root,'commercial-app','desktop-navigation-authority.js');

function assert(condition,message){if(!condition)throw new Error(message);}
const STAFF_PERMISSIONS={
  viewCustomers:true,manageWork:true,viewAssignedWork:true,manageAssignedWork:true,
  manageQuotes:true,manageSchedule:true,manageCommunications:true,manageField:true,
  captureEvidence:true,useInventory:true,useAssets:true
};
async function installHarness(page,{role='',authForm=false,deferredRole=false}={}){
  await page.setContent(`<!doctype html><html><body>
    <header><button id="globalAiButton">AI</button><button id="voiceButton">Voice</button></header>
    <section class="business-bar"><select><option>Business</option></select><button>Open</button><span id="businessStatus"></span></section>
    <div class="app-shell"><nav id="mainNav"></nav><main id="mainContent" tabindex="-1">${authForm?'<form id="h38AuthForm"><input id="h38AuthEmail"><input id="h38AuthPassword"></form>':'<div data-base-office>Base office</div>'}</main></div>
    <div id="toast" class="hidden"></div><div id="h38ErpBody"></div>
  </body></html>`);
  await page.evaluate(({role,authForm,deferredRole,permissions})=>{
    const pageDefs={today:['🏠','Today'],customers:['👥','Customers'],work:['🧰','Work'],quotes:['🧾','Quotes'],measure:['📐','Measure'],schedule:['📅','Schedule'],messages:['💬','Messages'],field:['📷','Field'],inventory:['📦','Inventory'],fleet:['🚚','Fleet'],money:['💵','Money'],documents:['📁','Documents'],social:['📣','Social'],ai:['✨','H38 AI'],settings:['⚙️','Settings']};
    const officePages=['today','customers','work','quotes','schedule','messages','field','inventory','fleet','money','documents','social','ai','settings'];
    const requirements={customers:['viewCustomers','manageWork','manageQuotes'],work:['manageWork','viewAssignedWork','manageAssignedWork'],quotes:['manageQuotes','manageWork'],measure:['manageField','manageQuotes','captureEvidence'],schedule:['manageSchedule','manageWork','viewAssignedWork'],messages:['manageCommunications'],field:['manageField','viewAssignedWork','captureEvidence'],inventory:['manageInventory','useInventory'],fleet:['manageAssets','useAssets','manageMaintenance'],money:['manageFinancial','viewFinancial'],documents:['manageWork','manageQuotes','manageField','captureEvidence'],social:['manageSocial'],settings:['manageSettings','manageUsers']};
    window.PAGE_DEFS=pageDefs;
    const snapshot=authForm||deferredRole?null:{user:{roleId:role,roleName:role,permissions:role==='staff'?permissions:{all:true}},business:{businessId:'B-1',businessName:'Test Business'}};
    window.state={shell:'office',page:'today',businessId:'B-1',snapshot};
    window.__calls=[];
    window.__workspace={
      profile:{membershipId:'M-1',authUserId:'U-1',email:'employee@example.com',displayName:'Alex Employee',jobTitle:'Installer',role:'staff'},
      time:{role:'staff',canEdit:false,currentPunch:null,recent:[]},
      tasks:[{'Task ID':'TASK-1','Job ID':'JOB-1','Task Title':'Install cabinet','Assigned User ID':'U-1','Status':'Open','Due Time':'2026-09-08T15:00:00.000Z'}],
      jobs:[{'Job ID':'JOB-1','Customer ID':'CUS-1','Project Title':'Kitchen project','Status':'Active'}],
      customers:[{'Customer ID':'CUS-1','Customer Name':'Sample Customer'}]
    };
    window.allowedPages=function(){
      const user=window.state.snapshot?.user;
      const can=cap=>!user||user.permissions?.all===true||user.permissions?.[cap]===true;
      return officePages.filter(key=>!requirements[key]||requirements[key].some(can));
    };
    window.renderNav=function(){
      window.__calls.push({type:'base-nav'});
      const nav=document.getElementById('mainNav');
      nav.innerHTML=window.allowedPages().map(key=>`<button type="button" data-page="${key}" class="${key===window.state.page?'active':''}"><span>${pageDefs[key][1]}</span></button>`).join('');
      nav.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>window.openPage(button.dataset.page));
    };
    window.openPage=function(pageName){
      if(!window.allowedPages().includes(pageName))pageName='today';
      window.__calls.push({type:'base-open',pageName});window.state.page=pageName;
      document.getElementById('mainContent').innerHTML=`<section data-canonical-office><h1>${pageDefs[pageName]?.[1]||pageName}</h1><p>Canonical Business Office</p></section>`;
      window.renderNav();return true;
    };
    const db={
      rpc:async(name,args)=>{
        window.__calls.push({type:'rpc',name,args});
        if(name==='business_office_employee_workspace')return {data:structuredClone(window.__workspace),error:null};
        if(name==='business_office_clock_in')return {data:{'Time Entry ID':'TIME-1','Task ID':args.p_task_id||'','Job ID':args.p_job_id||''},error:null};
        if(name==='business_office_clock_out')return {data:{Status:'Recorded'},error:null};
        if(name==='business_office_employee_update_task'){const task=window.__workspace.tasks[0];task.Status=args.p_status;return {data:structuredClone(task),error:null};}
        if(name==='business_office_team_directory')return {data:{employees:[{authUserId:'U-2',email:'alice@example.com',displayName:'Alice',jobTitle:'Installer',status:'active'}]},error:null};
        if(name==='business_office_invite_employee')return {data:{email:args.p_email,displayName:args.p_display_name||args.p_email},error:null};
        return {data:{},error:null};
      },
      auth:{signUp:async(payload)=>{window.__calls.push({type:'signup',payload});return {data:{session:null,user:{email:payload.email}},error:null};}}
    };
    window.H38_SUPABASE_SHARED_CLIENT={ensure:()=>db};
    window.H38_ACTIVE_BRIDGE={connect:()=>window.__calls.push({type:'connect'})};
    window.H38_PROFITABILITY_OPERATING_LAYER={writeSettings:()=>true};
    window.toast=(message,bad)=>window.__calls.push({type:'toast',message,bad:!!bad});
    if(snapshot)window.renderNav();
  },{role,authForm,deferredRole,permissions:STAFF_PERMISSIONS});
  await page.addScriptTag({path:employeeScript});
  await page.addScriptTag({path:authorityScript});
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const desktop=await browser.newContext({viewport:{width:1366,height:768}});
    const page=await desktop.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(String(error.message||error)));

    await installHarness(page,{deferredRole:true});
    assert(await page.locator('[data-base-office]').count()===1,'Test must begin on the canonical Office surface before auth resolves.');
    assert(await page.locator('.h38-employee-page').count()===0,'Employee companion must not create a replacement page before auth.');
    await page.evaluate(({permissions})=>{window.state.snapshot={user:{roleId:'staff',roleName:'staff',permissions},business:{businessId:'B-1',businessName:'Test Business'}};window.renderNav();},{permissions:STAFF_PERMISSIONS});
    await page.waitForTimeout(1400);
    assert(await page.locator('[data-base-office]').count()===1,'Staff role resolution must not replace an already-correct Office surface.');
    assert(await page.locator('.h38-employee-page').count()===0,'Employee companion must never auto-render a Today/My Tasks shell.');
    assert(!(await page.locator('body').evaluate(el=>el.classList.contains('h38-employee-mode'))),'Staff must not be switched into employee-only body mode.');

    const navText=await page.locator('#mainNav').innerText();
    for(const label of ['Today','Customers','Work','Quotes','Schedule','Messages','Field','Inventory','Fleet','Documents'])
      assert(navText.includes(label),`Canonical Staff navigation must include ${label}.`);
    for(const label of ['Money','Social','Settings'])assert(!navText.includes(label),`Staff navigation must not expose unpermitted ${label}.`);
    assert(!navText.includes('My Tasks'),'Replacement two-button employee navigation must be gone.');

    await page.evaluate(()=>window.openPage('quotes'));
    await page.waitForFunction(()=>document.querySelector('[data-canonical-office] h1')?.textContent==='Quotes');
    assert(await page.evaluate(()=>window.state.page)==='quotes','Staff must remain on the canonical Quotes route.');
    assert(await page.locator('[data-canonical-office]').count()===1,'Canonical Office renderer must own Staff pages.');
    let calls=await page.evaluate(()=>window.__calls);
    assert(calls.some(call=>call.type==='base-open'&&call.pageName==='quotes'),'Canonical openPage must receive the Staff navigation action.');

    const workspace=await page.evaluate(()=>window.H38_EMPLOYEE_WORKSPACE.refresh());
    assert(workspace?.tasks?.[0]?.['Task ID']==='TASK-1','Employee companion must retain assigned-work RPC access without owning the shell.');
    assert(await page.locator('[data-canonical-office] h1').textContent()==='Quotes','Refreshing employee data must not change the current Office page.');
    await page.evaluate(()=>window.H38_EMPLOYEE_WORKSPACE.clockInToTask(window.__workspace.tasks[0]));
    await page.evaluate(()=>window.H38_EMPLOYEE_WORKSPACE.updateAssignedTask('TASK-1','Started','Started layout.'));
    calls=await page.evaluate(()=>window.__calls);
    const clock=calls.find(call=>call.name==='business_office_clock_in');
    assert(clock?.args?.p_job_id==='JOB-1'&&clock?.args?.p_task_id==='TASK-1','Task punch must stay linked to assigned Job ID and Task ID.');
    const update=calls.find(call=>call.name==='business_office_employee_update_task');
    assert(update?.args?.p_status==='Started'&&update?.args?.p_note==='Started layout.','Bounded task update RPC must remain available.');
    assert(await page.locator('[data-canonical-office] h1').textContent()==='Quotes','Time/task RPCs must not hijack the Office page.');
    assert(!errors.length,`Staff canonical Office browser error(s): ${errors.join(' | ')}`);
    await desktop.close();

    const ownerContext=await browser.newContext({viewport:{width:1440,height:1000}});
    const owner=await ownerContext.newPage();
    await installHarness(owner,{role:'owner'});
    await owner.waitForSelector('#h38TeamAccess',{state:'attached'});
    const teamText=await owner.locator('#h38TeamAccess').innerText();
    assert(teamText.includes('normal Business Office pages allowed by their role'),'Team Access must describe canonical role-filtered Office behavior.');
    assert(teamText.includes('Task Manager assigns work'),'Task Manager must remain assignment authority.');
    await owner.locator('#h38EmployeeName').fill('Bob Builder');
    await owner.locator('#h38EmployeeEmail').fill('bob@example.com');
    await owner.locator('#h38EmployeeTitle').fill('Installer');
    await owner.locator('#h38EmployeeInviteForm button[type="submit"]').click();
    await owner.waitForFunction(()=>window.__calls.some(call=>call.name==='business_office_invite_employee'));
    assert((await owner.evaluate(()=>window.__calls.find(call=>call.name==='business_office_invite_employee')?.args?.p_email))==='bob@example.com','Owner Team Access must preserve exact-email membership preparation.');
    await ownerContext.close();

    const signupContext=await browser.newContext({viewport:{width:390,height:844}});
    const signup=await signupContext.newPage();
    await installHarness(signup,{authForm:true});
    await signup.waitForSelector('[data-h38-show-signup]');
    await signup.locator('[data-h38-show-signup]').click();
    await signup.locator('#h38EmployeeSignupEmail').fill('invited@example.com');
    await signup.locator('#h38EmployeeSignupPassword').fill('very-secure-123');
    await signup.locator('#h38EmployeeSignupConfirm').fill('very-secure-123');
    await signup.locator('#h38EmployeeSignupForm button[type="submit"]').click();
    await signup.waitForFunction(()=>window.__calls.some(call=>call.type==='signup'));
    assert((await signup.evaluate(()=>window.__calls.find(call=>call.type==='signup')?.payload?.email))==='invited@example.com','Invited employee signup must preserve exact email.');
    await signupContext.close();

    console.log(JSON.stringify({status:'PASS',desktopViewport:'1366x768',staffShell:'canonical Business Office',permissionFilteredNavigation:true,employeeCompanionAutoRender:false,delayedTakeoverBlocked:true,taskPunchLinked:true,taskStatusUpdate:true,managerTeamAccess:true,employeeSignup:true},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
