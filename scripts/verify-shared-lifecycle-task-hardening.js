'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const ui=read('commercial-app/shared-lifecycle-task-ui.js');
const coverage=read('commercial-app/supabase-operation-coverage.js');
const quoteSql=read('supabase/migrations/20260927030000_quote_owner_role_task_hardening.sql');
const lifecycleSql=read('supabase/migrations/20260927031000_lifecycle_owner_tasks.sql');
const linkageSql=read('supabase/migrations/20260927031100_site_visit_linkage_correction.sql');
const marker=read('supabase/migrations/20260927021836_quote_owner_task_lifecycle.sql');

assert(!fs.existsSync(path.join(root,'supabase/migrations/20260927013000_quote_owner_task_lifecycle.sql')),'drifted quote migration filename must stay retired');
assert.match(marker,/20260927030000_quote_owner_role_task_hardening\.sql/);
assert.match(marker,/20260927031000_lifecycle_owner_tasks\.sql/);
assert.match(quoteSql,/'Assigned User ID',''/,'automatic quote owner tasks must not pin one owner account');
assert.match(quoteSql,/'Assigned Role','Owner'/,'automatic quote lifecycle tasks must be role-assigned');
assert.match(ui,/COMPLETED/,'Today filter must treat Completed as closed');
assert.match(ui,/blankTasksOwnerOnly:true/,'blank tasks must stay owner-only');
assert.match(ui,/quoteRevisionAware:true/,'quote work must be revision-aware');
assert.match(ui,/quoteJobRelink:true/,'quote work must repair the job link');
assert.match(coverage,/shared-lifecycle-task-ui\.js\?build=20260926-shared-lifecycle-task-ui-1/,'shared Office bootstrap must load lifecycle task UI');
for(const token of ['request.review','job.schedule','job.prejob','job.invoice','invoice.payment','job.closeout','recurring.next_visit','field.issue','change_order.review','site_visit.linkage'])assert(lifecycleSql.includes(token),`missing lifecycle task domain ${token}`);
assert.match(linkageSql,/Quote ID/);assert.match(linkageSql,/Job ID/);assert.match(linkageSql,/Property ID/);assert.match(linkageSql,/Request ID/);
for(const source of [quoteSql,lifecycleSql,linkageSql]){
  assert(!/sendgrid|stripe\.charges|capture_payment|automatic customer send/i.test(source),'lifecycle migrations must not add external actions');
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.setContent('<!doctype html><html><body><main><section id="supabaseAssignedTasks" class="card"><h2>Assigned tasks</h2><div class="list"></div></section></main></body></html>');
  await page.evaluate(()=>{
    const tasks=[
      {'Task ID':'DONE-1','Task Title':'Old completed','Status':'Completed','Assigned Role':'Owner'},
      {'Task ID':'OWNER-1','Task Title':'Owner role task','Status':'Open','Assigned Role':'Owner','Priority':'High'},
      {'Task ID':'BLANK-1','Task Title':'Legacy blank','Status':'Open'},
      {'Task ID':'STAFF-1','Task Title':'Assigned staff','Status':'Open','Assigned User ID':'STAFF-A'},
      {'Task ID':'OLD-WORK','Task Title':'Old quote line','Task Type':'Quote Work','Status':'Open','Assigned Role':'Owner','Quote ID':'Q-1','Quote Revision':'1','Quote Checklist Key':'Q-1:r1:1','Job ID':''}
    ];
    window.state={businessId:'B-TEST',page:'today',snapshot:{user:{userId:'OWNER-A',roleId:'owner'},users:[{'User ID':'OWNER-A','Role ID':'owner'},{'User ID':'OWNER-B','Role ID':'owner'},{'User ID':'STAFF-A','Role ID':'staff'}],tasks,jobs:[{'Job ID':'JOB-1','Customer ID':'C-1','Project Title':'Snow service'}],quotes:[{'Quote ID':'Q-1','Customer ID':'C-1','Project Title':'Snow service','Status':'Accepted','Revision':2,'Quote Number':'Q-100',lines:[{Description:'Plow driveway',Quantity:1,Unit:'visit'},{Description:'Salt walk',Quantity:1,Unit:'visit'}]}]}};
    window.records=name=>window.state.snapshot[name]||[];
    window.H38_SUPABASE_AUTH={getState:()=>({userId:window.state.snapshot.user.userId})};
    window.esc=v=>String(v??'');window.pill=v=>`<span>${v}</span>`;window.dateTime=v=>String(v||'');window.jobName=id=>String(id||'');window.empty=v=>`<p>${v}</p>`;
    window.queueOperation=async(action,type,id,payload,optimistic)=>{const record=payload.record,rows=window.state.snapshot.tasks,index=rows.findIndex(r=>String(r['Task ID'])===String(record['Task ID']));if(index>=0)rows[index]=record;else rows.unshift(record);return{ok:true};};
    window.renderToday=()=>{};window.renderWork=()=>{};window.renderQuotes=()=>{};
  });
  await page.addScriptTag({content:ui});
  await page.waitForTimeout(100);
  let owner=await page.locator('#supabaseAssignedTasks').innerText();
  assert.match(owner,/Owner role task/);assert.match(owner,/Legacy blank/);assert(!/Old completed/.test(owner));assert(!/Assigned staff/.test(owner));
  const ownerVisible=await page.evaluate(()=>window.H38_SHARED_LIFECYCLE_TASK_UI.taskVisible({'Status':'Open','Assigned Role':'Owner'}));assert.equal(ownerVisible,true);
  await page.evaluate(()=>{window.state.snapshot.user={userId:'OWNER-B',roleId:'owner'};});
  assert.equal(await page.evaluate(()=>window.H38_SHARED_LIFECYCLE_TASK_UI.taskVisible({'Status':'Open','Assigned Role':'Owner'})),true,'second owner must see Owner-role task');
  await page.evaluate(()=>{window.state.snapshot.user={userId:'STAFF-A',roleId:'staff'};});
  assert.equal(await page.evaluate(()=>window.H38_SHARED_LIFECYCLE_TASK_UI.taskVisible({'Status':'Open','Assigned Role':'Owner'})),false,'staff must not see Owner-role task');
  assert.equal(await page.evaluate(()=>window.H38_SHARED_LIFECYCLE_TASK_UI.taskVisible({'Status':'Open'})),false,'staff must not see blank/unassigned task');
  assert.equal(await page.evaluate(()=>window.H38_SHARED_LIFECYCLE_TASK_UI.taskVisible({'Status':'Open','Assigned User ID':'STAFF-A'})),true,'staff must see directly assigned task');
  await page.evaluate(()=>{window.state.snapshot.user={userId:'OWNER-A',roleId:'owner'};});
  await page.evaluate(()=>window.H38_SHARED_LIFECYCLE_TASK_UI.reconcileQuoteWorkTasks());
  await page.waitForTimeout(100);
  const result=await page.evaluate(()=>window.state.snapshot.tasks.map(r=>({id:r['Task ID'],status:r.Status,role:r['Assigned Role'],job:r['Job ID'],rev:String(r['Quote Revision']||''),key:r['Quote Checklist Key']})));
  const current=result.filter(r=>r.rev==='2'&&r.status==='Open');assert.equal(current.length,2,'accepted revision 2 must create exactly two current quote-work tasks');
  assert(current.every(r=>r.role==='Owner'&&r.job==='JOB-1'&&/Q-1:r2:/.test(r.key)),'current quote work must be owner-role, revision-aware, and linked to job');
  assert.equal(result.find(r=>r.id==='OLD-WORK')?.status,'Completed','prior quote revision task must be retired');
  assert.equal(await page.evaluate(()=>window.H38_SHARED_LIFECYCLE_TASK_UI.externalActionsOccurred),false);
  await browser.close();
  console.log(JSON.stringify({status:'PASS',acceptance:'SHARED_LIFECYCLE_TASK_HARDENING',ownerRoleVisibleToBothOwners:true,staffOwnerLeak:false,completedHidden:true,quoteRevisionSync:true,quoteJobRelink:true,externalActionsOccurred:false},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
