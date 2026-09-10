(function(){
'use strict';
const BUILD='20260910-office-access-1';
const TASK_STATES=Object.freeze(['Accepted','Started','Waiting','Blocked','Completed']);
let workspaceCache=null,workspaceCacheAt=0,teamCache=null,teamCacheAt=0;
const text=value=>String(value==null?'':value).trim();
const esc=value=>text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state=()=>{try{return window.state||{};}catch(_){return{};}};
const role=()=>text(state().snapshot?.user?.roleId||state().snapshot?.user?.roleName||state().snapshot?.user?.role).toLowerCase();
const isStaff=()=>role()==='staff';
const isManager=()=>['owner','administrator'].includes(role());
const businessId=()=>text(state().businessId);
const client=()=>window.H38_SUPABASE_SHARED_CLIENT?.ensure?.()||null;
function toast(message,bad=false){try{if(typeof window.toast==='function')return window.toast(message,bad);if(typeof window.showToast==='function')return window.showToast(message);const node=document.getElementById('toast');if(node){node.textContent=message;node.classList.toggle('bad',bad);node.classList.remove('hidden');setTimeout(()=>node.classList.add('hidden'),3800);}}catch(_){}}
async function rpc(name,args){const db=client();if(!db)throw new Error('Secure Business Office connection is not ready.');const {data,error}=await db.rpc(name,args||{});if(error)throw error;return data;}
function injectStyle(){if(document.getElementById('h38EmployeeCompanionStyle'))return;const node=document.createElement('style');node.id='h38EmployeeCompanionStyle';node.textContent=`
	.h38-team-section{border:1px solid var(--line,var(--border,#d6e0e8));border-radius:14px;padding:14px;display:grid;gap:11px}.h38-team-access-mount .h38-team-section,#h38TeamAccessMount .h38-team-section{border:0;padding:0}.h38-team-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.h38-team-head>span{padding:5px 9px;border-radius:999px;background:#eef5fa;color:var(--blue,#174a70);font-size:.7rem;font-weight:900}.h38-team-form{display:grid;grid-template-columns:1fr 1.25fr .9fr 1fr auto;gap:8px;align-items:end}.h38-team-form label{display:grid;gap:4px;font-size:.78rem;font-weight:800}.h38-team-form input,.h38-team-form select{min-height:42px}.h38-team-list{display:grid;gap:7px}.h38-team-row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(180px,1.3fr) minmax(115px,.8fr) minmax(105px,.7fr) auto;gap:8px;align-items:center;padding:10px 0;border-top:1px solid var(--line,var(--border,#d6e0e8));font-size:.82rem}.h38-team-state{font-weight:850}.h38-team-action{min-height:36px;padding:6px 9px;border:1px solid var(--line-strong,#c8d5de);border-radius:8px;background:#fff;color:var(--navy,#0b2438);font-weight:850}
@media(max-width:760px){.h38-team-form,.h38-team-row{grid-template-columns:1fr}.h38-team-row>*{min-width:0}}
`;document.head.appendChild(node);}
async function loadWorkspace(force=false){if(!businessId()||!isStaff())return null;if(!force&&workspaceCache&&Date.now()-workspaceCacheAt<12000)return workspaceCache;workspaceCache=await rpc('business_office_employee_workspace',{p_business_id:businessId()});workspaceCacheAt=Date.now();return workspaceCache;}
async function loadTeam(force=false){if(!businessId()||!isManager())return null;if(!force&&teamCache&&Date.now()-teamCacheAt<12000)return teamCache;teamCache=await rpc('business_office_team_directory',{p_business_id:businessId()});teamCacheAt=Date.now();return teamCache;}
async function clockInToTask(task){if(!isStaff())throw new Error('Staff sign-in is required.');const taskId=text(task?.['Task ID']||task?.taskId),jobId=text(task?.['Job ID']||task?.jobId);const result=await rpc('business_office_clock_in',{p_business_id:businessId(),p_job_id:jobId||null,p_task_id:taskId||null,p_notes:null});workspaceCache=null;toast(taskId?'Clocked in to assigned task.':'Clocked in.');return result;}
async function clockOut(){if(!isStaff())throw new Error('Staff sign-in is required.');const result=await rpc('business_office_clock_out',{p_business_id:businessId(),p_notes:null});workspaceCache=null;toast('Clocked out.');return result;}
async function updateAssignedTask(taskId,status,note=''){if(!isStaff())throw new Error('Staff sign-in is required.');const bounded=text(status);if(!TASK_STATES.includes(bounded))throw new Error('Choose an allowed task status.');const result=await rpc('business_office_employee_update_task',{p_business_id:businessId(),p_task_id:text(taskId),p_status:bounded,p_note:text(note)||null});workspaceCache=null;toast('Task updated.');return result;}
function teamSectionShell(){return `<section class="h38-team-section" id="h38TeamAccess"><div class="h38-team-head"><div><h3>Secure team access</h3><div class="h38-erp-note">Prepare one exact-email H38 Office membership for an employee or site manager. The server keeps both on assigned-work Staff access; the selected profile only changes guidance and labeling.</div></div><span>Owner / admin only</span></div><form class="h38-team-form" id="h38EmployeeInviteForm"><label>Name<input id="h38EmployeeName" maxlength="160" placeholder="Team member name"></label><label>Email<input id="h38EmployeeEmail" type="email" required autocomplete="email" placeholder="name@company.com"></label><label>Access profile<select id="h38EmployeeAccessProfile"><option value="employee">Employee</option><option value="site-manager">Site manager / foreman</option></select></label><label>Job title<input id="h38EmployeeTitle" maxlength="160" placeholder="Installer, crew lead…"></label><button class="primary" type="submit">Add &amp; send activation</button></form><div class="h38-erp-note"><strong>What happens:</strong> H38 prepares an invited Staff membership, then requests a secure Supabase activation email after this button is pressed. It never accepts a password here and never grants owner or administrator access.</div><div id="h38TeamList" class="h38-team-list"><div class="h38-erp-note">Loading team…</div></div></section>`;}
async function refreshTeamUi(force=true){const host=document.getElementById('h38TeamList');if(!host||!isManager())return;try{const directory=await loadTeam(force),employees=directory?.employees||[];host.innerHTML=employees.length?employees.map(employee=>{const title=text(employee.jobTitle)||'Employee',profile=/site manager|foreman|crew lead/i.test(title)?'Site manager':'Employee',activation=employee.status==='invited'?`<button class="h38-team-action" type="button" data-h38-send-activation="${esc(employee.email)}">Resend activation</button>`:'<span></span>';return `<div class="h38-team-row"><strong>${esc(employee.displayName||employee.email)}</strong><span>${esc(employee.email)}</span><span>${esc(profile)} · ${esc(title)}</span><span class="h38-team-state">${esc(employee.status)}${employee.authUserId?' · active account':''}</span>${activation}</div>`;}).join(''):'<div class="h38-erp-note">No employee or site-manager access has been prepared yet.</div>';}catch(error){host.innerHTML=`<div class="h38-erp-note">${esc(error.message||'Team directory unavailable.')}</div>`;}}
function ensureTeamSection(){injectStyle();if(!isManager())return false;const mount=document.getElementById('h38TeamAccessMount'),body=document.getElementById('h38ErpBody'),host=mount||body;if(!host||host.querySelector('#h38TeamAccess'))return false;if(mount)mount.innerHTML=teamSectionShell();else body.insertAdjacentHTML('afterbegin',teamSectionShell());refreshTeamUi(true);return true;}
function enhanceAuthPanel(){return false;}
async function requestActivation(email){const db=client();if(!db?.functions?.invoke)throw new Error('Secure invitation service is not ready.');const {data,error}=await db.functions.invoke('business-office-invite-activation',{body:{email:text(email).toLowerCase()}});if(error)throw error;if(!data||data.status!=='PASS')throw new Error(data?.error||'Activation email request failed.');return data;}
async function inviteEmployee(form){
  if(form?.dataset.h38InviteBusy==='1')return;
  const submit=form?.querySelector('button[type="submit"]'),submitLabel=submit?.textContent||'Add & send activation';
  if(form)form.dataset.h38InviteBusy='1';
  if(submit){submit.disabled=true;submit.textContent='Preparing access…';}
  try{
    const email=text(document.getElementById('h38EmployeeEmail')?.value).toLowerCase(),displayName=text(document.getElementById('h38EmployeeName')?.value),accessProfile=text(document.getElementById('h38EmployeeAccessProfile')?.value),enteredTitle=text(document.getElementById('h38EmployeeTitle')?.value);
    let jobTitle=enteredTitle;
    if(accessProfile==='site-manager'&&!/site manager|foreman/i.test(jobTitle))jobTitle=jobTitle?`Site Manager · ${jobTitle}`:'Site Manager';
    if(!jobTitle)jobTitle='Employee';
    const created=await rpc('business_office_invite_employee',{p_business_id:businessId(),p_email:email,p_display_name:displayName||null,p_job_title:jobTitle});
    teamCache=null;
    try{await requestActivation(email);toast(`${created.displayName||created.email} added. A secure activation email was requested.`);}
    catch(error){toast(`${created.displayName||created.email} was added, but the activation email was not sent. Use Resend activation.`,true);}
    form.reset();
    await refreshTeamUi(true);
  }catch(error){toast(error.message||'Could not prepare team access.',true);}
  finally{if(form)delete form.dataset.h38InviteBusy;if(submit?.isConnected){submit.disabled=false;submit.textContent=submitLabel;}}
}
function bindEvents(){if(document.documentElement.dataset.h38EmployeeCompanionEvents==='1')return;document.documentElement.dataset.h38EmployeeCompanionEvents='1';document.addEventListener('click',event=>{const target=event.target.closest?.('[data-h38-send-activation]');if(!target)return;event.preventDefault();target.disabled=true;requestActivation(target.dataset.h38SendActivation).then(()=>toast('A secure activation email was requested.')).catch(error=>toast(error.message||'Could not request activation.',true)).finally(()=>{target.disabled=false;});});document.addEventListener('submit',event=>{if(event.target.id==='h38EmployeeInviteForm'){event.preventDefault();inviteEmployee(event.target);}});}
function install(){bindEvents();enhanceAuthPanel();ensureTeamSection();window.addEventListener('h38:auth-cleared',()=>{workspaceCache=null;teamCache=null;});window.addEventListener('h38:business-snapshot-updated',()=>{workspaceCache=null;teamCache=null;ensureTeamSection();});}
install();
window.H38_EMPLOYEE_WORKSPACE=Object.freeze({
  build:BUILD,
  canonicalStartupAuthority:false,
  companionOnly:true,
  desktopShellAuthority:false,
  autoRenderForStaff:false,
  preservesCanonicalOfficeNavigation:true,
  genericWorkRouteUsedByStaff:true,
  delayedRolePolling:false,
  sameSupabaseAccountAndRecords:true,
  employeeRole:'staff',
  assignedWorkOnly:true,
  taskManagerAssignmentAuthority:true,
  ownerAdminTeamManagement:true,
  siteManagerProfile:true,
  selfServiceTimeClock:true,
  ownerTimeCorrectionsAudited:true,
  automaticInvitationEmail:false,
  userRequestedInvitationEmail:true,
  duplicateActivationGuard:true,
  directAuthSignup:false,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchasing:false,
  automaticPayment:false,
  automaticScheduling:false,
  refresh:()=>loadWorkspace(true),
  clockInToTask,
  clockOut,
  updateAssignedTask,
  ensureTeamSection,
  enhanceAuthPanel
});
})();
