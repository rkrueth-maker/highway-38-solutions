/** Highway 38 controlled test mode and internal onboarding agent. */
var H38_TEST_MODE_PROPERTY='H38_TEST_MODE_STATE_V1';
var H38_TEST_MODE_MAX_MINUTES=240;

function h38TestModeNormalizeEmail_(value){return String(value||'').trim().toLowerCase();}
function h38TestModeNow_(){return new Date();}
function h38TestModeRead_(){
  var raw=PropertiesService.getScriptProperties().getProperty(H38_TEST_MODE_PROPERTY),state=null;
  try{state=raw?JSON.parse(raw):null;}catch(error){state=null;}
  if(!state||!state.expiresAt||new Date(state.expiresAt).getTime()<=Date.now()){
    if(raw)PropertiesService.getScriptProperties().deleteProperty(H38_TEST_MODE_PROPERTY);
    return {active:false,expiresAt:'',allowlist:[],enabledBy:'',remainingMinutes:0,externalActionsEnabled:false};
  }
  var remaining=Math.max(0,Math.ceil((new Date(state.expiresAt).getTime()-Date.now())/60000));
  return {active:true,expiresAt:state.expiresAt,allowlist:state.allowlist||[],enabledBy:state.enabledBy||'',remainingMinutes:remaining,externalActionsEnabled:true};
}
function h38PortalTestModeStatus(){boGetCurrentUser_();return h38TestModeRead_();}
function h38PortalEnableTestMode(minutes,recipients){
  var owner=boRequireOwner_(),duration=Math.max(15,Math.min(Number(minutes)||60,H38_TEST_MODE_MAX_MINUTES));
  var list=Array.isArray(recipients)?recipients:String(recipients||'').split(/[;,\s]+/);
  list=list.map(h38TestModeNormalizeEmail_).filter(function(value,index,items){return value&&value.indexOf('@')>0&&items.indexOf(value)===index;});
  [h38TestModeNormalizeEmail_(owner.Email),h38TestModeNormalizeEmail_(boGetActiveEmail_()),'highway38solutions@gmail.com'].forEach(function(email){if(email&&list.indexOf(email)<0)list.push(email);});
  var state={active:true,enabledAt:h38TestModeNow_().toISOString(),expiresAt:new Date(Date.now()+duration*60000).toISOString(),allowlist:list,enabledBy:owner.Email};
  PropertiesService.getScriptProperties().setProperty(H38_TEST_MODE_PROPERTY,JSON.stringify(state));
  boProof_('ENABLE_TEST_MODE','System',boGetBusinessId_(),'PASS','Owner-only test mode enabled for '+duration+' minutes. Allowlisted recipients only. Payments, purchasing, payroll, tax, and public publishing remain blocked.',owner.Email);
  return h38TestModeRead_();
}
function h38PortalDisableTestMode(){
  var owner=boRequireOwner_();PropertiesService.getScriptProperties().deleteProperty(H38_TEST_MODE_PROPERTY);
  boProof_('DISABLE_TEST_MODE','System',boGetBusinessId_(),'PASS','Controlled test mode disabled.',owner.Email);
  return h38TestModeRead_();
}
function h38TestModePrepareEmail_(payload){
  payload=Object.assign({},payload||{});var state=h38TestModeRead_();if(!state.active)return payload;
  var recipients=String(payload.to||'').split(',').map(h38TestModeNormalizeEmail_).filter(Boolean);
  boAssert_(recipients.length>0,'A test recipient is required.');
  recipients.forEach(function(email){boAssert_(state.allowlist.indexOf(email)>=0,'Test Mode can only send to an allowlisted internal recipient: '+email);});
  payload.to=recipients.join(', ');
  if(String(payload.subject||'').indexOf('[H38 TEST]')!==0)payload.subject='[H38 TEST] '+String(payload.subject||'Highway 38 test');
  var marker='TEST MODE — internal validation only. No customer commitment or financial action.\n\n';
  if(String(payload.body||'').indexOf('TEST MODE —')!==0)payload.body=marker+String(payload.body||'');
  payload.h38TestMode=true;payload.h38TestModeExpiresAt=state.expiresAt;
  return payload;
}
function h38TestModeBoundary_(){var state=h38TestModeRead_();return {externalActionsEnabled:state.active,testMode:state};}

function h38OnboardingText_(value){return String(value==null?'':value).trim();}
function h38OnboardingDate_(offset){var date=new Date();date.setDate(date.getDate()+(Number(offset)||0));return Utilities.formatDate(date,boPackValue_('business.timeZone','America/Chicago'),'yyyy-MM-dd');}
function h38OnboardingTask_(title,instructions,linkedType,linkedId,dueOffset){
  if(typeof h38TmSaveTask_!=='function')return null;
  return h38TmSaveTask_('',{'Task Title':title,'Task Type':'Onboarding','Assigned User ID':boGetCurrentUser_()['User ID'],'Priority':'Normal','Due Date':h38OnboardingDate_(dueOffset||0),'Status':'Open','Instructions':instructions,'Linked Record Type':linkedType||'','Linked Record ID':linkedId||'','Notes':'Created by H38 Onboarding Agent.','Is Voided':'No'});
}
function h38OnboardingDuplicate_(module,fields){
  var rows=boListRecords(module,{limit:1000,includeVoided:true})||[];
  return rows.find(function(row){return fields.some(function(field){var value=h38OnboardingText_(field.value).toLowerCase();return value&&h38OnboardingText_(row[field.name]).toLowerCase()===value;});})||null;
}
function h38PortalOnboard(kind,values){
  var owner=boRequireOwner_();kind=h38OnboardingText_(kind).toLowerCase();values=values||{};
  boAssert_(['employee','customer','vendor'].indexOf(kind)>=0,'Choose employee, customer, or vendor onboarding.');
  var saved=null,created=[],tasks=[];
  if(kind==='employee'){
    var first=h38OnboardingText_(values.firstName),last=h38OnboardingText_(values.lastName),email=h38TestModeNormalizeEmail_(values.email),name=[first,last].filter(Boolean).join(' ');
    boAssert_(name,'Employee name is required.');
    var existingEmployee=h38OnboardingDuplicate_('employees',[{name:'Email',value:email},{name:'First Name',value:first},{name:'Last Name',value:last}]);
    if(existingEmployee)return {status:'PASS',kind:kind,duplicatePrevented:true,record:existingEmployee,tasks:[],externalActionsOccurred:false};
    saved=boSaveRecord('employees','',{'First Name':first,'Last Name':last,'Email':email,'Phone':h38OnboardingText_(values.phone),'Employment Status':'Active','Pay Type':h38OnboardingText_(values.payType)||'Hourly','Hire Date':h38OnboardingText_(values.hireDate)||h38OnboardingDate_(0),'Status':'Active'});created.push(saved);
    var employeeId=saved['Employee ID']||'';
    tasks.push(h38OnboardingTask_('Set up Business Office access for '+name,'Review the employee role and create an active Users & Roles account before inviting them.','Employee',employeeId,0));
    tasks.push(h38OnboardingTask_('Complete first-day onboarding for '+name,'Confirm login, Today screen, assigned tasks, photos, time tracking, and completion proof.','Employee',employeeId,1));
  }
  if(kind==='customer'){
    var display=h38OnboardingText_(values.displayName)||h38OnboardingText_(values.name),customerEmail=h38TestModeNormalizeEmail_(values.email),phone=h38OnboardingText_(values.phone);
    boAssert_(display,'Customer name is required.');
    var existingCustomer=h38OnboardingDuplicate_('customers',[{name:'Email',value:customerEmail},{name:'Phone',value:phone},{name:'Display Name',value:display}]);
    if(existingCustomer)return {status:'PASS',kind:kind,duplicatePrevented:true,record:existingCustomer,tasks:[],externalActionsOccurred:false};
    saved=boSaveRecord('customers','',{'Display Name':display,'Customer Type':h38OnboardingText_(values.customerType)||'Customer','Email':customerEmail,'Phone':phone,'Payment Terms':h38OnboardingText_(values.paymentTerms)||'Due on receipt','Status':'Active','Attention Status':'New customer','Notes':h38OnboardingText_(values.notes)});created.push(saved);
    var customerId=saved['Customer ID']||'';
    var outcome=h38OnboardingText_(values.desiredOutcome);
    if(outcome){var request=boSaveRecord('requests','',{'Received Time':boNow_(),'Source':'H38 Onboarding Agent','Status':'New','Approval Status':'Owner Review Required','Name':display,'Email':customerEmail,'Phone':phone,'Desired Outcome':outcome,'Next Action':'Review intake and prepare next step'});created.push(request);}
    tasks.push(h38OnboardingTask_('Review new customer '+display,'Confirm contact details, service address, request scope, and the next quote or site-visit step.','Customer',customerId,0));
  }
  if(kind==='vendor'){
    var vendorName=h38OnboardingText_(values.displayName)||h38OnboardingText_(values.name),vendorEmail=h38TestModeNormalizeEmail_(values.email);
    boAssert_(vendorName,'Vendor name is required.');
    var existingVendor=h38OnboardingDuplicate_('vendors',[{name:'Email',value:vendorEmail},{name:'Display Name',value:vendorName}]);
    if(existingVendor)return {status:'PASS',kind:kind,duplicatePrevented:true,record:existingVendor,tasks:[],externalActionsOccurred:false};
    saved=boSaveRecord('vendors','',{'Display Name':vendorName,'Vendor Type':h38OnboardingText_(values.vendorType)||'Supplier','Email':vendorEmail,'Phone':h38OnboardingText_(values.phone),'Payment Terms':h38OnboardingText_(values.paymentTerms)||'Net 30','Contractor Status':h38OnboardingText_(values.contractorStatus)||'Not reviewed','W-9 Status':h38OnboardingText_(values.w9Status)||'Needed','Status':'Active'});created.push(saved);
    var vendorId=saved['Vendor ID']||'';
    tasks.push(h38OnboardingTask_('Finish vendor setup for '+vendorName,'Confirm payment terms, W-9 status, insurance, purchasing limits, and default expense account.','Vendor',vendorId,1));
  }
  tasks=tasks.filter(Boolean);
  boProof_('ONBOARD_'+kind.toUpperCase(),'Onboarding',h38OnboardingText_(saved&&saved[Object.keys(saved).find(function(key){return / ID$/.test(key);})]||''),'PASS','H38 Onboarding Agent created internal records and follow-up tasks only. No invitation or customer message was sent.',owner.Email);
  return {status:'PASS',kind:kind,duplicatePrevented:false,record:saved,created:created,tasks:tasks,externalActionsOccurred:false,boundary:boApprovalNotice_()};
}
