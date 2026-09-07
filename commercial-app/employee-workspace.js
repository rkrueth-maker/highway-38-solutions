(function(){
'use strict';
const BUILD='20260907-employee-companion-1';
const TASK_STATES=Object.freeze(['Accepted','Started','Waiting','Blocked','Completed']);
let workspaceCache=null,workspaceCacheAt=0,teamCache=null,teamCacheAt=0;
const text=value=>String(value==null?'':value).trim();
const esc=value=>text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
const state=()=>{try{return window.state||{};}catch(_){return{};}};
const role=()=>text(state().snapshot?.user?.roleId||state().snapshot?.user?.roleName||state().snapshot?.user?.role).toLowerCase();
const isStaff=()=>role()==='staff';
const isManager=()=>['owner','administrator'].includes(role());
const businessId=()=>text(state().businessId);
const client=()=>window.H38_SUPABASE_SHARED_CLIENT?.ensure?.()||null;
function toast(message,bad=false){try{if(typeof window.toast==='function')return window.toast(message,bad);if(typeof window.showToast==='function')return window.showToast(message);const node=document.getElementById('toast');if(node){node.textContent=message;node.classList.toggle('bad',bad);node.classList.remove('hidden');setTimeout(()=>node.classList.add('hidden'),3800);}}catch(_){}}
async function rpc(name,args){const db=client();if(!db)throw new Error('Secure Business Office connection is not ready.');const {data,error}=await db.rpc(name,args||{});if(error)throw error;return data;}
function injectStyle(){if(document.getElementById('h38EmployeeCompanionStyle'))return;const node=document.createElement('style');node.id='h38EmployeeCompanionStyle';node.textContent=`
.h38-team-section{border:1px solid var(--line,var(--border,#d6e0e8));border-radius:14px;padding:14px;display:grid;gap:11px}.h38-team-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.h38-team-form{display:grid;grid-template-columns:1fr 1.3fr 1fr auto;gap:8px;align-items:end}.h38-team-form label{display:grid;gap:4px;font-size:.78rem;font-weight:800}.h38-team-form input{min-height:42px}.h38-team-list{display:grid;gap:7px}.h38-team-row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(180px,1.4fr) minmax(100px,.7fr) auto;gap:8px;align-items:center;padding:9px 0;border-top:1px solid var(--line,var(--border,#d6e0e8));font-size:.82rem}.h38-team-state{font-weight:850}.h38-employee-signup{margin-top:10px;padding-top:10px;border-top:1px solid var(--line,var(--border,#d6e0e8));display:grid;gap:9px}.h38-employee-signup form{display:grid;gap:9px}.h38-employee-signup label{display:grid;gap:4px}.h38-employee-signup-note{font-size:.8rem;color:var(--muted,#607080)}
@media(max-width:760px){.h38-team-form,.h38-team-row{grid-template-columns:1fr}.h38-team-row>*{min-width:0}}
`;document.head.appendChild(node);}
async function loadWorkspace(force=false){if(!businessId()||!isStaff())return null;if(!force&&workspaceCache&&Date.now()-workspaceCacheAt<12000)return workspaceCache;workspaceCache=await rpc('business_office_employee_workspace',{p_business_id:businessId()});workspaceCacheAt=Date.now();return workspaceCache;}
async function loadTeam(force=false){if(!businessId()||!isManager())return null;if(!force&&teamCache&&Date.now()-teamCacheAt<12000)return teamCache;teamCache=await rpc('business_office_team_directory',{p_business_id:businessId()});teamCacheAt=Date.now();return teamCache;}
async function clockInToTask(task){if(!isStaff())throw new Error('Staff sign-in is required.');const taskId=text(task?.['Task ID']||task?.taskId),jobId=text(task?.['Job ID']||task?.jobId);const result=await rpc('business_office_clock_in',{p_business_id:businessId(),p_job_id:jobId||null,p_task_id:taskId||null,p_notes:null});workspaceCache=null;toast(taskId?'Clocked in to assigned task.':'Clocked in.');return result;}
async function clockOut(){if(!isStaff())throw new Error('Staff sign-in is required.');const result=await rpc('business_office_clock_out',{p_business_id:businessId(),p_notes:null});workspaceCache=null;toast('Clocked out.');return result;}
async function updateAssignedTask(taskId,status,note=''){if(!isStaff())throw new Error('Staff sign-in is required.');const bounded=text(status);if(!TASK_STATES.includes(bounded))throw new Error('Choose an allowed task status.');const result=await rpc('business_office_employee_update_task',{p_business_id:businessId(),p_task_id:text(taskId),p_status:bounded,p_note:text(note)||null});workspaceCache=null;toast('Task updated.');return result;}
function teamSectionShell(){return `<section class="h38-team-section" id="h38TeamAccess"><div class="h38-team-head"><div><h3>Team access</h3><div class="h38-erp-note">Give employees their own H38 sign-in for time and assigned work. Their account opens the normal Business Office pages allowed by their role.</div></div><span>Task Manager assigns work</span></div><form class="h38-team-form" id="h38EmployeeInviteForm"><label>Name<input id="h38EmployeeName" maxlength="160" placeholder="Employee name"></label><label>Email<input id="h38EmployeeEmail" type="email" required placeholder="employee@example.com"></label><label>Job title<input id="h38EmployeeTitle" maxlength="160" placeholder="Installer, foreman…"></label><button class="btn" type="submit">Add employee</button></form><div class="h38-erp-note">H38 does not automatically send an invitation. Add the employee here, then have them create or sign into H38 with this exact email.</div><div id="h38TeamList" class="h38-team-list"><div class="h38-erp-note">Loading team…</div></div></section>`;}
async function refreshTeamUi(force=true){const host=document.getElementById('h38TeamList');if(!host||!isManager())return;try{const directory=await loadTeam(force),employees=directory?.employees||[];host.innerHTML=employees.length?employees.map(employee=>`<div class="h38-team-row"><strong>${esc(employee.displayName||employee.email)}</strong><span>${esc(employee.email)}</span><span>${esc(employee.jobTitle||'Employee')}</span><span class="h38-team-state">${esc(employee.status)}${employee.authUserId?' · signed in':''}</span></div>`).join(''):'<div class="h38-erp-note">No employees added yet.</div>';}catch(error){host.innerHTML=`<div class="h38-erp-note">${esc(error.message||'Team directory unavailable.')}</div>`;}}
function ensureTeamSection(){injectStyle();if(!isManager())return false;const body=document.getElementById('h38ErpBody');if(!body||body.querySelector('#h38TeamAccess'))return false;body.insertAdjacentHTML('afterbegin',teamSectionShell());refreshTeamUi(true);return true;}
function employeeSignupHtml(){return `<div class="h38-employee-signup" id="h38EmployeeSignup"><button type="button" class="secondary" data-h38-show-signup>Invited employee? Create account</button><form id="h38EmployeeSignupForm" hidden><label><span>Employee email</span><input id="h38EmployeeSignupEmail" type="email" autocomplete="email" required></label><label><span>Create password</span><input id="h38EmployeeSignupPassword" type="password" autocomplete="new-password" minlength="10" required></label><label><span>Confirm password</span><input id="h38EmployeeSignupConfirm" type="password" autocomplete="new-password" minlength="10" required></label><button class="primary" type="submit">Create employee account</button><div class="h38-employee-signup-note">Use the exact email your employer added to H38. Once verified, Business Office shows the pages allowed by your role.</div><div id="h38EmployeeSignupResult" class="notice">Your phone app and web app use this same account and records.</div></form></div>`;}
function enhanceAuthPanel(){injectStyle();const form=document.getElementById('h38AuthForm');if(!form||document.getElementById('h38EmployeeSignup'))return false;form.insertAdjacentHTML('afterend',employeeSignupHtml());return true;}
async function signUpEmployee(){const result=document.getElementById('h38EmployeeSignupResult');try{const email=text(document.getElementById('h38EmployeeSignupEmail')?.value).toLowerCase(),password=text(document.getElementById('h38EmployeeSignupPassword')?.value),confirm=text(document.getElementById('h38EmployeeSignupConfirm')?.value);if(!email)throw new Error('Enter the employee email your employer added to H38.');if(password.length<10)throw new Error('Use at least 10 characters for the password.');if(password!==confirm)throw new Error('Passwords do not match.');const db=client();if(!db)throw new Error('Secure sign-in is not ready.');if(result){result.textContent='Creating employee account…';result.classList.remove('warn');}const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:email.split('@')[0]}}});if(error)throw error;if(data?.session){if(result)result.textContent='Account created. Opening Business Office…';setTimeout(()=>window.H38_ACTIVE_BRIDGE?.connect?.(),0);}else if(result)result.textContent='Account created. Check your email if Supabase requires confirmation, then sign in here with the same address.';}catch(error){if(result){result.textContent=text(error.message||error);result.classList.add('warn');}}}
async function inviteEmployee(form){try{const email=text(document.getElementById('h38EmployeeEmail')?.value).toLowerCase(),displayName=text(document.getElementById('h38EmployeeName')?.value),jobTitle=text(document.getElementById('h38EmployeeTitle')?.value);const created=await rpc('business_office_invite_employee',{p_business_id:businessId(),p_email:email,p_display_name:displayName||null,p_job_title:jobTitle||null});teamCache=null;toast(`${created.displayName||created.email} added to Team Access.`);form.reset();await refreshTeamUi(true);}catch(error){toast(error.message||'Could not add employee.',true);}}
function bindEvents(){if(document.documentElement.dataset.h38EmployeeCompanionEvents==='1')return;document.documentElement.dataset.h38EmployeeCompanionEvents='1';document.addEventListener('click',event=>{const target=event.target.closest?.('[data-h38-show-signup]');if(!target)return;event.preventDefault();const form=document.getElementById('h38EmployeeSignupForm');if(form)form.hidden=!form.hidden;});document.addEventListener('submit',event=>{if(event.target.id==='h38EmployeeInviteForm'){event.preventDefault();inviteEmployee(event.target);}else if(event.target.id==='h38EmployeeSignupForm'){event.preventDefault();signUpEmployee();}});}
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
  selfServiceTimeClock:true,
  ownerTimeCorrectionsAudited:true,
  automaticInvitationEmail:false,
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
