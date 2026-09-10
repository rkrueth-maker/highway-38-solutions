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
const auth=read('commercial-app/supabase-auth.js');
const office=read('commercial-app/app-01.js');
const parity=read('commercial-app/app-19.js');
const worker=read('commercial-app/service-worker.js');

for(const needle of [
  'business_employee_profiles','business_office_invite_employee','business_office_team_directory',
  'business_office_employee_workspace','business_office_employee_update_task','private.employee_task_assigned',
  'private.employee_job_assigned','private.business_record_row_access',"membership.role='staff'",'Assigned User ID',
  'exactEmailClaim','automaticEmailSent','business_data_import_rows_business_id_idx'
])includes(migration,needle,`Employee data contract missing ${needle}`);
includes(migration,"v_actor_role not in ('owner','administrator')",'Only management may prepare employee access.');
includes(migration,"v_membership.role<>'staff'",'Employee workspace RPC must require Staff role.');
includes(migration,"v_status not in ('Accepted','Started','Waiting','Blocked','Completed')",'Employee task updates must remain bounded.');
includes(migration,"return p_write=false and private.employee_task_assigned",'Generic Staff task mutation must remain blocked.');
includes(migration,"'automaticExternalActions',false",'Employee operations must preserve external-action safety.');

for(const needle of ['customer_messages','customer_files','customer_portal_events',"array['owner','administrator']::text[]","bucket_id='business-office'","bucket_id='business-office-files'"])
  includes(hardening,needle,`Employee direct-access hardening missing ${needle}`);
expect(!hardening.includes("array['owner','administrator','staff']"),'Direct admin/storage hardening must not retain broad Staff access.');

for(const needle of [
  'H38_EMPLOYEE_WORKSPACE','H38_SUPABASE_SHARED_CLIENT','business_office_employee_workspace','business_office_clock_in',
  'business_office_clock_out','business_office_employee_update_task','business_office_invite_employee','business_office_team_directory',
  'Add &amp; send activation','business-office-invite-activation','Site manager','canonicalStartupAuthority:false','companionOnly:true',
  'desktopShellAuthority:false','autoRenderForStaff:false','preservesCanonicalOfficeNavigation:true','genericWorkRouteUsedByStaff:true',
  'delayedRolePolling:false','sameSupabaseAccountAndRecords:true','assignedWorkOnly:true','automaticInvitationEmail:false',
  'userRequestedInvitationEmail:true','duplicateActivationGuard:true','directAuthSignup:false','siteManagerProfile:true','automaticApproval:false',
  'automaticCustomerSending:false','automaticPurchasing:false','automaticPayment:false','automaticScheduling:false'
])includes(ui,needle,`Employee companion contract missing ${needle}`);
expect(!ui.includes('.auth.signUp'),'Employee companion must not expose browser-side Auth user creation.');
expect(!ui.includes('Create employee account'),'Employee companion must use invitation-bound activation instead of public account creation.');
expect(!ui.includes('function installNavigation('),'Employee companion must not install a second navigation authority.');
expect(!ui.includes('window.openPage=function'),'Employee companion must not replace canonical openPage.');
expect(!ui.includes('window.renderNav=function'),'Employee companion must not replace canonical renderNav.');
expect(!ui.includes('window.renderWork=function'),'Employee companion must not replace canonical Work renderer.');
expect(!ui.includes("document.body.classList.add('h38-employee-mode')"),'Employee companion must not switch the whole Office into employee-only mode.');
expect(!ui.includes('renderEmployeePage('),'Employee companion must not own a separate full-page Staff renderer.');
expect(!ui.includes('STAFF_PAGES'),'Employee companion must not define a replacement two-page Staff navigation.');

for(const needle of [
  "people:['manageUsers']",'h38LoadTeamAccessCompanion','H38_TEAM_ACCESS_COMPANION_BUILD',
  'h38TeamAccessMount','employee-workspace.js?build=${H38_TEAM_ACCESS_COMPANION_BUILD}'
])includes(parity,needle,`Canonical People route missing ${needle}`);
expect(!parity.includes("people:['manageUsers','manageField']"),'Staff field access must not expose employee/payroll administration.');

for(const needle of [
  "if (role === 'staff') return {","viewCustomers: true, manageWork: true, viewAssignedWork: true, manageAssignedWork: true",
  'manageQuotes: true, manageSchedule: true, manageCommunications: true, manageField: true',
  'captureEvidence: true, useInventory: true, useAssets: true'
])includes(auth,needle,`Staff permission model missing ${needle}`);
for(const needle of [
  "const OFFICE_PAGES=['today','customers','work','quotes','schedule','messages','field','inventory','fleet','money','documents','social','ai','settings']",
  'function allowedPages()','requirements={customers:',"$('mainNav').innerHTML=pages.map"
])includes(office,needle,`Canonical Business Office navigation missing ${needle}`);

for(const needle of [
  "const BUILD='20260907-staff-canonical-office-1'",'staffUsesCanonicalOffice:true','staffUsesPermissionFilteredNavigation:true',
  'employeeWorkspaceAutoLoad:false','staffWorkspaceBeforeFirstRender:false','delayedStaffTakeover:false'
])includes(startup,needle,`Authenticated startup missing ${needle}`);
expect(!startup.includes('ensureEmployeeWorkspace'),'Startup must not load a second Staff shell.');
expect(!startup.includes('employee-workspace.js'),'Startup must not inject employee workspace code.');
expect(!startup.includes('handleFullSnapshot=async function'),'Full snapshot must not be wrapped to install Staff UI ownership.');

for(const needle of [
  'employeeWorkspaceLoader:false',"employeeWorkspaceStartupAuthority:'none'",'employeeWorkspaceCompanionOnly:true',
  'staffUsesCanonicalOfficeNavigation:true','staffUsesPermissionFilteredNavigation:true','staffWorkRendererFenceHandledByEmployeeRenderer:false',
  'staffMainContentCleanupObserver:false','mutatesNavigation:false','capturesClicks:false'
])includes(loader,needle,`Retired desktop authority missing ${needle}`);
expect(!loader.includes('new MutationObserver'),'Retired desktop authority must not observe Staff content.');
expect(!loader.includes('script.src=`./employee-workspace.js'),'Retired desktop authority must not inject employee workspace code.');

includes(worker,"'employee-workspace.js'",'Employee companion may remain LIVE_FIRST if explicitly requested.');
includes(worker,"'./employee-workspace.js'",'Employee companion must remain available offline.');
expect(/const CACHE_NAME='h38-business-office-\d{8}-\d{4}'/.test(worker),'Service-worker cache must keep accepted dated format.');

console.log(JSON.stringify({
  status:'PASS',staffShell:'canonical Business Office',staffNavigation:'permission-filtered allowedPages',
  employeeWorkspace:'non-owning companion',employeeAutoLoad:false,employeeDesktopTakeover:false,
  taskManagerAssignmentAuthority:true,employeeSelfPunch:true,ownerAdminTeamAccess:true,
  siteManagerProfile:true,directAuthSignup:false,invitationBoundActivation:true,duplicateActivationGuard:true,
  directAdminDataHiddenFromStaff:true,automaticInvitationEmail:false,automaticExternalActions:false
},null,2));
