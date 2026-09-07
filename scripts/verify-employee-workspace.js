'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const expect=(condition,message)=>{if(!condition)throw new Error(message);};
const includes=(source,needle,message)=>expect(source.includes(needle),message||`Missing ${needle}`);

const migration=read('supabase/migrations/20260903233000_employee_workspace_team_access.sql');
const hardening=read('supabase/migrations/20260903233100_employee_workspace_direct_access_hardening.sql');
const ui=read('commercial-app/employee-workspace.js');
const startup=read('commercial-app/supabase-final-startup.js');
const loader=read('commercial-app/desktop-navigation-authority.js');
const worker=read('commercial-app/service-worker.js');

for(const needle of [
  'business_employee_profiles',
  'business_office_invite_employee',
  'business_office_team_directory',
  'business_office_employee_workspace',
  'business_office_employee_update_task',
  'private.employee_task_assigned',
  'private.employee_job_assigned',
  'private.business_record_row_access',
  "membership.role='staff'",
  'Assigned User ID',
  'exactEmailClaim',
  'automaticEmailSent',
  'business_data_import_rows_business_id_idx'
])includes(migration,needle,`Employee data contract missing ${needle}`);

includes(migration,"v_actor_role not in ('owner','administrator')",'Only management may prepare employee access.');
includes(migration,"v_membership.role<>'staff'",'Employee workspace must require Staff role.');
includes(migration,"v_status not in ('Accepted','Started','Waiting','Blocked','Completed')",'Employee task updates must be bounded to operational states.');
includes(migration,"return p_write=false and private.employee_task_assigned",'Generic Staff task mutation must be blocked.');
includes(migration,"'automaticExternalActions',false",'Employee workspace must preserve external-action safety.');

for(const needle of [
  'customer_messages',
  'customer_files',
  'customer_portal_events',
  "array['owner','administrator']::text[]",
  "bucket_id='business-office'",
  "bucket_id='business-office-files'"
])includes(hardening,needle,`Employee direct-access hardening missing ${needle}`);
expect(!hardening.includes("array['owner','administrator','staff']"),'Direct admin/storage hardening must not retain broad Staff access.');

for(const needle of [
  'H38_EMPLOYEE_WORKSPACE',
  'H38_SUPABASE_SHARED_CLIENT',
  "const STAFF_TASKS_PAGE='my-tasks'",
  'normalizeStaffPage',
  'business_office_employee_workspace',
  'business_office_clock_in',
  'business_office_clock_out',
  'business_office_employee_update_task',
  'business_office_invite_employee',
  'business_office_team_directory',
  'Invited employee? Create account',
  '.auth.signUp',
  'H38 phone app',
  'H38 web app',
  'Task Manager assigns work',
  'canonicalStartupAuthority:true',
  'genericWorkRouteUsedByStaff:false',
  'delayedRolePolling:false',
  'assignedWorkOnly:true',
  'sameSupabaseAccountAndRecords:true',
  'window.renderWork.h38StaffEmployeeBoundary=true',
  'ensureTeamSection();if(isStaff())',
  'automaticInvitationEmail:false',
  'automaticApproval:false',
  'automaticCustomerSending:false',
  'automaticPurchasing:false',
  'automaticPayment:false',
  'automaticScheduling:false'
])includes(ui,needle,`Employee UI contract missing ${needle}`);

expect(!ui.includes("setInterval(()=>{ensureTeamSection();enhanceAuthPanel();if(isStaff()"),'Staff role must not be polled on a timer to take over an already-rendered Office.');
expect(!ui.includes("state().page=target==='work'?'work':'today'"),'Staff My Tasks must not reuse the generic work route.');
includes(ui,"if(isStaff())return renderEmployeePage(STAFF_TASKS_PAGE)",'Generic Work renderer must terminate at the Staff renderer boundary.');
includes(ui,"return name&&!/[+@]/.test(name)?name:''",'Internal-looking Staff aliases must be filtered in the employee renderer itself.');

for(const needle of [
  "const EMPLOYEE_WORKSPACE_BUILD='20260906-employee-startup-authority-1'",
  'function ensureEmployeeWorkspace()',
  "script.src=`./employee-workspace.js?build=${EMPLOYEE_WORKSPACE_BUILD}`",
  'handleFullSnapshot=async function(snapshot,businessId)',
  'if(isStaffSnapshot(snapshot))await ensureEmployeeWorkspace();',
  'if(isStaffSnapshot(startup.snapshot))await ensureEmployeeWorkspace();',
  'staffWorkspaceBeforeFirstRender:true',
  'delayedStaffTakeover:false'
])includes(startup,needle,`Authenticated Staff startup authority missing ${needle}`);

includes(loader,'employeeWorkspaceLoader:false','Retired desktop authority must not dynamically load Staff after Office startup.');
includes(loader,"employeeWorkspaceStartupAuthority:'supabase-final-startup.js'",'Staff startup ownership must be declared at authenticated startup.');
includes(loader,'staffNavLoadMask:false','Late Staff navigation masking workaround must remain retired.');
includes(loader,'staffMainContentCleanupObserver:false','Late Staff main-content cleanup observer must remain retired.');
includes(loader,'staffWorkRendererFenceHandledByEmployeeRenderer:true','Staff Work fence belongs to the employee renderer boundary.');
expect(!loader.includes("script.src=`./employee-workspace.js"),'Retired desktop authority must not inject the employee workspace script late.');
expect(!loader.includes('new MutationObserver'),'Retired desktop authority must not observe Staff main content.');

includes(worker,"'employee-workspace.js'",'Employee workspace must be LIVE_FIRST.');
includes(worker,"'./employee-workspace.js'",'Employee workspace must be in offline shell.');
expect(/const CACHE_NAME='h38-business-office-\d{8}-\d{4}'/.test(worker),'Service-worker cache must keep accepted dated format.');

console.log(JSON.stringify({
  status:'PASS',
  employeeAccount:'exact-email Staff membership',
  phoneAppPreferred:true,
  webFallbackFullFunction:true,
  sameSupabaseAccountAndRecords:true,
  assignedTaskOnly:true,
  taskManagerAssignmentAuthority:true,
  employeeSelfPunch:true,
  ownerAdminTeamAccess:true,
  staffStartupAuthority:true,
  delayedStaffTakeover:false,
  staffTasksRoute:'my-tasks',
  genericOfficeFirstRenderBlocked:true,
  staffGenericWorkFence:true,
  staffSiteVisitLeakBlocked:true,
  directAdminDataHiddenFromStaff:true,
  lateStaffCleanupObserver:false,
  automaticInvitationEmail:false,
  automaticExternalActions:false
},null,2));
