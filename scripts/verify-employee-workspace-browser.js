'use strict';
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const employeeScript=path.join(root,'commercial-app','employee-workspace.js');

function assert(condition,message){if(!condition)throw new Error(message);}
async function installHarness(page,{role='staff',authForm=false}={}){
  await page.setContent(`<!doctype html><html><body>
    <header><button id="globalAiButton">AI</button><button id="voiceButton">Voice</button></header>
    <section class="business-bar"><select><option>Business</option></select><button>Open</button><span id="businessStatus"></span></section>
    <nav id="mainNav"></nav><main id="mainContent" tabindex="-1">${authForm?'<form id="h38AuthForm"><input id="h38AuthEmail"><input id="h38AuthPassword"></form>':'<div>Base office</div>'}</main>
    <div id="toast" class="hidden"></div><div id="h38ErpBody"></div>
  </body></html>`);
  await page.evaluate(({role,authForm})=>{
    const now='2026-09-03T20:00:00.000Z';
    window.state={page:'today',businessId:'B-1',snapshot:authForm?null:{user:{roleId:role,roleName:role},business:{businessId:'B-1',businessName:'Test Business'}}};
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
    window.openPage=function(pageName){window.state.page=pageName;document.getElementById('mainContent').innerHTML=`<h1>Base ${pageName}</h1>`;};
    window.renderNav=function(){document.getElementById('mainNav').innerHTML='<button>Base nav</button>';};
    window.toast=function(message,bad){window.__calls.push({type:'toast',message,bad:!!bad});};
  },{role,authForm});
  await page.addScriptTag({path:employeeScript});
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const phone=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 Android H38SiteScannerAndroid/0.5.32'});
    const page=await phone.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(String(error.message||error)));
    await installHarness(page,{role:'staff'});
    await page.waitForSelector('.h38-employee-page h1',{state:'visible'});
    assert(await page.locator('.h38-employee-page h1').textContent()==='Today','Staff should land on Today.');
    const nav=await page.locator('#mainNav').innerText();
    assert(nav.includes('Today')&&nav.includes('My Tasks')&&!nav.includes('Quotes'),'Staff nav must be Today + My Tasks only.');
    assert((await page.locator('.h38-employee-mode').first().innerText()).includes('H38 phone app'),'Native shell must identify phone-app experience.');
    assert(await page.locator('#globalAiButton').isHidden(),'Employee shell should hide owner AI launcher.');
    assert((await page.locator('body').innerText()).includes('Install cabinet'),'Assigned task must be visible on Today.');
    await page.locator('[data-h38-clock-task="TASK-1"]').click();
    await page.waitForFunction(()=>window.__workspace.time.currentPunch?.['Task ID']==='TASK-1');
    let calls=await page.evaluate(()=>window.__calls);
    const clockCall=calls.find(call=>call.name==='business_office_clock_in');
    assert(clockCall&&clockCall.args.p_job_id==='JOB-1'&&clockCall.args.p_task_id==='TASK-1','Task punch must carry Job ID and Task ID.');
    await page.locator('[data-h38-open-my-tasks]').first().click();
    await page.waitForFunction(()=>document.querySelector('.h38-employee-page h1')?.textContent==='My Tasks');
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

    console.log(JSON.stringify({status:'PASS',mobileViewport:'390x844',desktopViewport:'1440x1000',staffAssignedWorkOnly:true,taskPunchLinked:true,taskStatusUpdate:true,managerTeamAccess:true,employeeSignup:true,appWebParity:true},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
