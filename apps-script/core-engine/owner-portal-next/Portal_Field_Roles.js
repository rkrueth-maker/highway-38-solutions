/** Foreman and Employee role profiles for field-first operation. */
var H38_FIELD_ROLE_MODULES_=Object.freeze({
  Foreman:Object.freeze(['commandCenter','assignedTasks','calendar','customers','quotes','workOrders','jobs','time','receipts','documents','equipment']),
  Employee:Object.freeze(['commandCenter','assignedTasks','calendar','workOrders','jobs','time','receipts','documents','equipment']),
  'Field Staff':Object.freeze(['commandCenter','assignedTasks','calendar','workOrders','jobs','time','receipts','documents','equipment'])
});

function h38FieldRoleKnown_(role){return Object.prototype.hasOwnProperty.call(H38_FIELD_ROLE_MODULES_,String(role||''));}
function h38FieldRoleDescription_(role){return{
  Foreman:'Crew, assigned work, active jobs, time, equipment, field proof, receipts, and blockers.',
  Employee:'My assigned work, job instructions, time, field photos, receipts, equipment, and safety notes.',
  'Field Staff':'My assigned work, job instructions, time, field photos, receipts, equipment, and safety notes.'
}[String(role||'')]||'Field work assigned to this role.';}
function h38FieldRoleProfile_(role){
  role=String(role||'');
  if(role==='Foreman')return{role:role,portalLabel:'Foreman Portal',headline:"Run today's field work.",description:'Coordinate crews, jobs, time, equipment, photos, receipts, and blockers from one place.',canAssignCrew:true,modules:H38_FIELD_ROLE_MODULES_.Foreman.slice(),externalActions:'Owner approval required'};
  if(role==='Employee'||role==='Field Staff')return{role:role,portalLabel:role==='Employee'?'Employee Portal':'Field Portal',headline:'What do I need to do today?',description:'See assigned work, job instructions, time, photos, receipts, equipment, and safety notes.',canAssignCrew:false,modules:H38_FIELD_ROLE_MODULES_[role].slice(),externalActions:'Internal updates only'};
  return{role:role,portalLabel:role+' Portal',headline:'What needs attention today?',description:'One clear daily workspace for this role.',canAssignCrew:false,modules:[],externalActions:'Owner approval required'};
}
function h38FieldRoleCanView_(access,moduleKey){
  if(!access||!access.user||!h38FieldRoleKnown_(access.role))return false;
  moduleKey=String(moduleKey||'');
  if(H38_FIELD_ROLE_MODULES_[access.role].indexOf(moduleKey)<0)return false;
  if(['commandCenter','assignedTasks','calendar'].indexOf(moduleKey)>=0)return true;
  try{
    var definitions=h38PortalBusinessDefinitions_(),name=definitions[moduleKey]?definitions[moduleKey].title:moduleKey;
    return boHasPermission_(access.user,name,'View')||boHasPermission_(access.user,moduleKey,'View');
  }catch(error){return false;}
}
function h38PortalEnsureFieldRoles_(){
  var access=h38PortalRequireUnifiedUser_();
  boAssert_(access.ownerMode,'Owner approval is required to provision field roles.');
  if(typeof boControlProvisionCredentials_!=='function')return{status:'HOLD',message:'Field-role provisioning service is unavailable.',roles:[]};
  return boControlProvisionCredentials_();
}
function h38PortalFieldRoleProfile(){
  var access=h38PortalRequireUnifiedUser_();
  var profile=h38FieldRoleProfile_(access.role);
  profile.status='PASS';
  profile.user={id:access.user['User ID'],email:access.user.Email,displayName:access.user['Display Name']};
  profile.externalActionsOccurred=false;
  return profile;
}
function h38PortalRequireForeman_(){
  var user=boGetCurrentUser_(),role=boGetRole_(user['Role ID']),name=role&&role['Role Name']||'';
  boAssert_(['Owner','Administrator','Foreman'].indexOf(name)>=0,'Foreman, Administrator, or Owner access is required.');
  return{user:user,role:name};
}
function h38PortalForemanAssignees(){
  var access=h38PortalRequireForeman_();
  var users=boReadTable_(H38_BO_SHEETS.USERS,{includeVoided:true}).filter(function(row){
    if(row.Status!=='Active'||row['Business ID']!==boGetBusinessId_())return false;
    var role=boGetRole_(row['Role ID']),name=role&&role['Role Name']||'';
    return['Employee','Field Staff','Staff','Foreman'].indexOf(name)>=0;
  }).map(function(row){var role=boGetRole_(row['Role ID']);return{id:row['User ID'],name:row['Display Name']||row.Email,email:row.Email,role:role&&role['Role Name']||''};});
  return{status:'PASS',users:users,requestedBy:access.user['User ID'],externalActionsOccurred:false};
}
function h38PortalForemanAssignTask(values){
  var access=h38PortalRequireForeman_(),input=Object.assign({},values||{}),title=boNormalizeText_(input.title||input['Task Title']),assignedUserId=boNormalizeText_(input.assignedUserId||input['Assigned User ID']);
  boAssertModuleEnabled_('assignedTasks');
  boAssert_(title,'Task title is required.');
  boAssert_(assignedUserId,'Select an employee or crew member.');
  var assignedUser=h38TmUserById_(assignedUserId);
  boAssert_(assignedUser,'The selected employee is not active in this business.');
  var assignedRole=boGetRole_(assignedUser['Role ID']),assignedRoleName=assignedRole&&assignedRole['Role Name']||'';
  boAssert_(['Employee','Field Staff','Staff','Foreman'].indexOf(assignedRoleName)>=0,'The selected user is not an assignable field-team member.');
  var jobId=boNormalizeText_(input.jobId||input['Job ID']);
  if(jobId)h38TmValidateLinkedRecord_('Job',jobId);
  var priority=['Urgent','High','Normal','Low'].indexOf(input.priority)>=0?input.priority:'Normal';
  var duplicateKey=h38TmHash_([title,assignedUserId,jobId,boNormalizeText_(input.dueDate)].join('|'));
  var duplicate=h38TmRead_('TASKS',{includeVoided:true}).find(function(row){return row['Duplicate Key']===duplicateKey&&!/^(Completed|Cancelled|Voided)$/.test(row.Status);});
  boAssert_(!duplicate,'Duplicate protection blocked this assignment. Existing task: '+(duplicate&&duplicate['Task ID']||''));
  var task=h38TmAppend_('TASKS',{
    'Task Title':title,
    'Task Type':boNormalizeText_(input.taskType)||'Field Work',
    'Assigned User ID':assignedUserId,
    'Assigned Role':'',
    'Assigned By User ID':access.user['User ID'],
    Priority:priority,
    'Due Date':boNormalizeText_(input.dueDate),
    'Due Time':boNormalizeText_(input.dueTime),
    Status:'Open',
    Instructions:boNormalizeText_(input.instructions),
    Notes:boNormalizeText_(input.notes),
    'Linked Record Type':jobId?'Job':'',
    'Linked Record ID':jobId,
    'Job ID':jobId,
    'Duplicate Key':duplicateKey,
    'Is Voided':'No'
  });
  h38TmTaskHistory_(task,null,'CREATED','Assigned by '+access.role,access.user);
  boProof_('FOREMAN_ASSIGN_TASK','Task',task['Task ID'],'PASS','Internal crew assignment only; no customer or financial action.',access.user.Email);
  return{status:'PASS',task:task,assignee:{id:assignedUserId,name:assignedUser['Display Name']||assignedUser.Email,role:assignedRoleName},externalActionsOccurred:false,ownerApprovalRequired:false};
}
