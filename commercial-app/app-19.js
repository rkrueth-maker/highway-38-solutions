'use strict';

Object.assign(PAGE_DEFS,{
  people:['👷','People'],
  accounting:['📚','Accounting'],
  payroll:['🧮','Payroll'],
  tax:['🗂️','Tax Prep'],
  controls:['🛡️','Controls'],
  reports:['📊','Reports'],
  onboarding:['🧭','Business Onboarding'],
  setupChecklist:['✅','Setup Checklist']
});
const H38_PARITY_OFFICE_PAGES=['today','customers','people','work','quotes','schedule','messages','field','inventory','fleet','money','memberships','accounting','payroll','tax','documents','social','controls','reports','ai','settings'];
OFFICE_PAGES.splice(0,OFFICE_PAGES.length,...H38_PARITY_OFFICE_PAGES);
SHELL_PAGES.office=OFFICE_PAGES;
const H38_PARITY_REQUIREMENTS={
  customers:['viewCustomers','manageWork','manageQuotes'],work:['manageWork','viewAssignedWork','manageAssignedWork'],quotes:['manageQuotes','manageWork'],measure:['manageField','manageQuotes','captureEvidence'],schedule:['manageSchedule','manageWork','viewAssignedWork'],messages:['manageCommunications'],field:['manageField','viewAssignedWork','captureEvidence'],inventory:['manageInventory','useInventory'],fleet:['manageAssets','useAssets','manageMaintenance'],money:['manageFinancial','viewFinancial'],memberships:['manageFinancial','viewFinancial'],accounting:['manageFinancial','viewFinancial'],payroll:['manageFinancial'],tax:['manageFinancial'],people:['manageUsers'],documents:['manageWork','manageQuotes','manageField','captureEvidence'],social:['manageSocial'],controls:['manageSettings'],reports:['manageFinancial','viewFinancial','manageSettings'],settings:['manageSettings','manageUsers'],onboarding:['manageSettings','manageUsers'],setupChecklist:['manageSettings','manageUsers']
};

const H38_TEAM_ACCESS_COMPANION_BUILD='20260910-office-access-1';
let h38TeamAccessCompanionPromise=null;
function h38LoadTeamAccessCompanion(){
  if(!can('manageUsers'))return Promise.resolve(false);
  if(window.H38_EMPLOYEE_WORKSPACE?.ensureTeamSection){window.H38_EMPLOYEE_WORKSPACE.ensureTeamSection();return Promise.resolve(true);}
  if(h38TeamAccessCompanionPromise)return h38TeamAccessCompanionPromise;
  h38TeamAccessCompanionPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=`./employee-workspace.js?build=${H38_TEAM_ACCESS_COMPANION_BUILD}`;
    script.async=true;
    script.dataset.h38TeamAccessLoader='true';
    script.onload=()=>{window.H38_EMPLOYEE_WORKSPACE?.ensureTeamSection?.();resolve(true);};
    script.onerror=()=>reject(new Error('Team Access could not be opened. Refresh and try again.'));
    document.head.appendChild(script);
  }).catch(error=>{h38TeamAccessCompanionPromise=null;throw error;});
  return h38TeamAccessCompanionPromise;
}

allowedPages=function(){return SHELL_PAGES[state.shell].filter(page=>!H38_PARITY_REQUIREMENTS[page]||H38_PARITY_REQUIREMENTS[page].some(can));};
renderNav=function(){const pages=allowedPages();$('mainNav').innerHTML=pages.map(key=>{const d=PAGE_DEFS[key]||[''];const icon=d.length>1?d[0]:'';const label=d.length>1?d[1]:d[0];return `<button type="button" data-page="${key}" class="${key===state.page?'active':''}">${icon?`<span class="nav-icon">${icon}</span>`:''}<span>${label}</span></button>`;}).join('');$('mainNav').querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>openPage(button.dataset.page));};
const h38ParityBaseRenderPage=renderPage;
renderPage=function(){if(!state.snapshot){renderWelcome();return;}const parity={people:renderPeople,accounting:renderAccounting,payroll:renderPayrollPrep,tax:renderTaxPrep,controls:renderControls,reports:renderReports,onboarding:()=>window.renderOnboardingPage&&window.renderOnboardingPage(),setupChecklist:()=>window.renderSetupChecklistPage&&window.renderSetupChecklistPage()};if(typeof window.renderMemberships==='function')parity.memberships=window.renderMemberships;if(parity[state.page])parity[state.page]();else h38ParityBaseRenderPage();};

network=function(){const online=navigator.onLine,node=$('networkBadge');node.textContent=online?'Internet':'No internet';node.className=`badge ${online?'online':'offline'}`;updateGatewayBadge();};
function updateGatewayBadge(status=''){
  const node=$('gatewayBadge');if(!node)return;
  const connected=state.bridgeReady===true||['connected','bootstrapped'].includes(status);
  node.textContent=connected?'Secure sync':'Sync offline';node.className=`badge ${connected?'online':'offline'}`;
}
const h38ParityBaseBindGlobal=bindGlobal;
bindGlobal=function(){h38ParityBaseBindGlobal();if($('globalAiButton'))$('globalAiButton').onclick=openGlobalAi;};
const h38ParityBaseBridgeStatus=handleBridgeStatus;
handleBridgeStatus=function(status){const result=h38ParityBaseBridgeStatus(status);updateGatewayBadge(status);updatePending().catch(()=>{});return result;};
const h38ParityBaseFullSnapshot=handleFullSnapshot;
handleFullSnapshot=async function(snapshot,businessId){const result=await h38ParityBaseFullSnapshot(snapshot,businessId);updateGatewayBadge('bootstrapped');return result;};
const h38ParityBaseBridgeError=handleBridgeError;
handleBridgeError=function(stage,message){const result=h38ParityBaseBridgeError(stage,message);updateGatewayBadge('offline');return result;};

function isUsageOperation(operation){return String(operation&&operation.action||'').toUpperCase()==='RECORD_USAGE_EVENT';}
updatePending=async function(){
  const operations=(await all('operations')).filter(op=>op.businessId===state.businessId&&op.syncStatus==='PENDING');
  const real=operations.filter(op=>!isUsageOperation(op)),telemetry=operations.length-real.length,node=$('syncBadge');
  node.textContent=real.length?`${real.length} unsynced`:'All saved';node.className=`badge ${real.length?'warn':'neutral'}`;node.title=telemetry?`${telemetry} internal activity records will sync quietly.`:'No business records are waiting.';updateGatewayBadge();
  try{window.dispatchEvent(new CustomEvent('h38:pending-updated',{detail:{pending:real.length,failed:real.filter(op=>num(op.retryCount)>0).length,online:navigator.onLine!==false}}));}catch(error){}
};
recordUsage=async function(pageKey,actionKey,metadata={}){
  if(!state.businessId||!navigator.onLine||!state.bridgeReady)return false;
  const id=newId('USAGE'),operation={id,operationId:id,businessId:state.businessId,deviceId:await deviceId(),recordType:'Usage Event',recordId:id,action:'RECORD_USAGE_EVENT',baseVersion:0,localTimestamp:now(),payload:{pageKey,actionKey,deviceId:await deviceId(),metadata},syncStatus:'PENDING',retryCount:0};
  state.bridge.request('completionSync',{businessId:state.businessId,operations:[operation]},30000).catch(()=>{});return true;
};

async function saveParity(entityKey,recordType,id,record,collection,idKeys){
  return queueOperation('SAVE_PARITY_ENTITY',recordType,id,{entityKey,record},{collection,record,idKeys},false);
}
function parityDate(row,...keys){const value=v(row,...keys);return value?String(value).slice(0,10):'';}
function within(value,start,end){if(!value)return false;const day=String(value).slice(0,10);return(!start||day>=start)&&(!end||day<=end);}

let h38EditingEmployeeId='';
function h38SetEmployeeFormValue(form,name,value){const field=form&&form.elements?form.elements.namedItem(name):null;if(field)field.value=value===undefined||value===null?'':String(value);}

function renderPeople(){
  let editingRow=h38EditingEmployeeId?records('employees').find(row=>rowId(row,'Employee ID')===h38EditingEmployeeId):null;
  if(h38EditingEmployeeId&&!editingRow){h38EditingEmployeeId='';editingRow=null;}
  const employees=records('employees'),users=records('users'),time=records('timeEntries'),active=employees.filter(row=>String(v(row,'Status')).toUpperCase()!=='INACTIVE');
  const hours=time.reduce((sum,row)=>sum+num(v(row,'Regular Hours','Hours','Duration Hours'))+num(v(row,'Overtime Hours')),0);
  const h38PeopleHead={page:'people',title:'People',purpose:'Your team — who can sign in, what they can do, and their time.',primary:{label:'＋ Add team member',handler:()=>{const m=document.getElementById('h38TeamAccessMount');if(m){m.scrollIntoView({behavior:'smooth',block:'start'});}}},more:[{label:'Crews',handler:()=>{const f=document.getElementById('employeeForm');if(f){f.scrollIntoView({behavior:'smooth',block:'center'});f.querySelector('[name="crew"]')?.focus({preventScroll:true});}}},{label:'Contractors & W-9',handler:()=>{const f=document.getElementById('employeeForm');if(f){f.scrollIntoView({behavior:'smooth',block:'center'});const s=f.querySelector('[name="employmentType"]');if(s)s.focus({preventScroll:true});}}}]};
  $('mainContent').innerHTML=(window.H38Flow?window.H38Flow.screenHeader(h38PeopleHead):pageHead('People',h38PeopleHead.purpose))+`<div class="grid"><section id="h38TeamAccessMount" class="card h38-team-access-mount"><h2>Team Access</h2><p class="muted">Opening secure employee and site-manager access controls…</p></section><section class="card"><div class="stats"><div class="stat"><strong>${active.length}</strong><span>Active employees</span></div><div class="stat"><strong>${users.length}</strong><span>Business users</span></div><div class="stat"><strong>${hours.toFixed(1)}</strong><span>Recorded hours</span></div><div class="stat"><strong>${time.length}</strong><span>Time entries</span></div></div></section><section class="card span5"><h2>Employment record</h2><p class="muted small">This records HR and payroll-preparation details. Use Team Access above to prepare a secure H38 Office sign-in.</p>${editingRow?`<div class="notice">Editing <strong>${esc(v(editingRow,'Display Name'))}</strong> — saving updates this record in place; no duplicate is created. Bank fields left blank keep what is on file.</div>`:''}<form id="employeeForm"><label>Display name</label><input name="displayName" required><label>Email</label><input name="email" type="email"><label>Linked user</label><select name="userId">${optionRows(users,['User ID'],row=>v(row,'Display Name','Email'),'Not linked')}</select><div class="two"><div><label>Employment type</label><select name="employmentType"><option>Employee</option><option>Contractor</option><option>Seasonal</option></select></div><div><label>Crew</label><input name="crew"></div></div><div class="three"><div><label>Pay type</label><select name="payType"><option>Hourly</option><option>Salary</option><option>Contract</option></select></div><div><label>Hourly rate</label><input name="hourlyRate" type="number" step="0.01"></div><div><label>Salary per period</label><input name="salaryRate" type="number" step="0.01"></div></div><div class="three"><div><label>Pay frequency</label><select name="payFrequency"><option>Weekly</option><option selected>Biweekly</option><option>Semimonthly</option><option>Monthly</option></select></div><div><label>Filing status</label><select name="filingStatus"><option>Single</option><option>Married Filing Jointly</option><option>Head of Household</option></select></div><div><label>W-4 allowances</label><input name="withholdingAllowances" type="number" min="0" value="0"></div></div><div class="two"><div><label>Extra withholding / period</label><input name="extraWithholding" type="number" step="0.01" value="0"></div><div><label>Overtime multiplier</label><input name="overtimeMultiplier" type="number" step="0.05" value="1.5"></div></div><div class="three"><div><label>Bank routing #</label><input name="bankRouting" inputmode="numeric" placeholder="For direct deposit"></div><div><label>Bank account #</label><input name="bankAccount" inputmode="numeric" placeholder="For direct deposit"></div><div><label>Account type</label><select name="accountType"><option>Checking</option><option>Savings</option></select></div></div><div class="three"><div><label>W-4 Step 2 (multiple jobs)</label><select name="w4Step2"><option value="no">Not checked</option><option value="yes">Checked</option></select></div><div><label>W-4 Step 3 credits ($/yr)</label><input name="w4Step3" type="number" step="0.01" min="0" value="0"></div><div><label>W-4 Step 4a other income ($/yr)</label><input name="w4Step4a" type="number" step="0.01" min="0" value="0"></div></div><div class="three"><div><label>W-4 Step 4b deductions ($/yr)</label><input name="w4Step4b" type="number" step="0.01" min="0" value="0"></div><div><label>MN allowances</label><input name="mnAllowances" type="number" min="0" placeholder="Defaults to W-4 allowances"></div><div><label>MN extra withholding / period</label><input name="mnAdditional" type="number" step="0.01" value="0"></div></div><label>Deductions — one per line: Name | pre-tax or post-tax | amount | period or percent-gross</label><textarea name="deductions" placeholder="HSA | pre-tax | 50 | period"></textarea><label>Start date</label><input name="startDate" type="date"><label>Notes</label><textarea name="notes"></textarea><div class="actions"><button>${editingRow?'Update employee':'Save employee'}</button>${editingRow?'<button type="button" class="secondary" id="employeeEditCancel">Cancel edit</button>':''}</div></form>${serverSafeguard()}</section><section class="card span7"><h2>Employees</h2><div class="list">${employees.length?employees.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Display Name'))}</strong>${pill(v(row,'Status')||'Active')}</div><small>${esc(v(row,'Employment Type'))} · ${esc(v(row,'Pay Type'))} · crew ${esc(v(row,'Crew')||'unassigned')} · ${esc(v(row,'Email'))}</small><div class="row-actions"><button type="button" class="secondary" data-employee-edit="${esc(rowId(row,'Employee ID'))}">Edit</button></div></div>`).join(''):empty('No employee records yet.')}</div></section><section class="card"><h2>Recent time</h2><div class="list">${time.length?time.slice(0,80).map(row=>`<div class="row"><div class="row-top"><strong>${esc(userName(v(row,'User ID','Employee ID')))}</strong>${pill(v(row,'Approval Status','Status')||'Recorded')}</div><small>${dateOnly(v(row,'Date','Start Time'))} · ${num(v(row,'Regular Hours','Hours','Duration Hours')).toFixed(2)} regular · ${num(v(row,'Overtime Hours')).toFixed(2)} overtime</small></div>`).join(''):empty('No time entries.')}</div></section></div>`;
  if(window.H38Flow)window.H38Flow.bindScreenHeader($('mainContent'),h38PeopleHead);
  bindForm('employeeForm',async(data,form)=>{
    const fields={'Display Name':requireValue(data.displayName,'Employee name is required.'),'Email':data.email,'User ID':data.userId,'Employment Type':data.employmentType,'Pay Type':data.payType,'Hourly Rate':num(data.hourlyRate),'Salary Rate':num(data.salaryRate),'Overtime Multiplier':num(data.overtimeMultiplier)||1.5,'Pay Frequency':data.payFrequency||'Biweekly','Filing Status':data.filingStatus||'Single','Withholding Allowances':num(data.withholdingAllowances),'Extra Withholding':num(data.extraWithholding),'Account Type':data.accountType||'Checking','Crew':data.crew,'Start Date':data.startDate,'Notes':data.notes,
      'W-4 Step 2 Checked':data.w4Step2==='yes','W-4 Step 3 Credits':num(data.w4Step3),'W-4 Step 4a Other Income':num(data.w4Step4a),'W-4 Step 4b Deductions':num(data.w4Step4b),
      'MN Allowances':String(data.mnAllowances||'').trim()===''?num(data.withholdingAllowances):num(data.mnAllowances),'MN Additional Withholding':num(data.mnAdditional),
      'Deductions':h38ParseDeductions(data.deductions)};
    if(h38EditingEmployeeId){
      const existing=records('employees').find(row=>rowId(row,'Employee ID')===h38EditingEmployeeId);
      if(!existing){h38EditingEmployeeId='';toast('That employee record no longer exists — edit cancelled.',true);renderPeople();return;}
      const updated=Object.assign({},existing,fields,{'Bank Routing':String(data.bankRouting||'').trim()||v(existing,'Bank Routing'),'Bank Account':String(data.bankAccount||'').trim()||v(existing,'Bank Account'),'Updated Time':now(),'Record Version':num(v(existing,'Record Version'))+1});
      await saveParity('employees','Employee',h38EditingEmployeeId,updated,'employees',['Employee ID']);
      h38EditingEmployeeId='';form.reset();await sync(false);toast('Employee updated. No payroll funds moved.');renderPeople();return;
    }
    const id=newId('EMPLOYEE'),record=Object.assign({'Employee ID':id,'Business ID':state.businessId,'Bank Routing':String(data.bankRouting||'').trim(),'Bank Account':String(data.bankAccount||'').trim(),'Status':'Active','Created Time':now(),'Updated Time':now(),'Record Version':1},fields);
    await saveParity('employees','Employee',id,record,'employees',['Employee ID']);form.reset();await sync(false);toast('Employee saved. No payroll funds moved.');renderPeople();
  });
  $('mainContent').querySelectorAll('[data-employee-edit]').forEach(button=>button.onclick=()=>h38EditEmployee(button.dataset.employeeEdit));
  const cancelBtn=$('employeeEditCancel');if(cancelBtn)cancelBtn.onclick=()=>{h38EditingEmployeeId='';renderPeople();};
  void h38LoadTeamAccessCompanion().catch(error=>{const mount=$('h38TeamAccessMount');if(mount)mount.innerHTML=`<div class="notice warn">${esc(error.message||error)}</div>`;});
}

/* Employee deduction lines (§4.4): owner-entered as
 * "Name | pre-tax|post-tax | amount | period|percent-gross" per line. */
function h38ParseDeductions(textValue){
  return String(textValue||'').split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{
    const parts=line.split('|').map(p=>p.trim());
    return {name:parts[0]||'Deduction',kind:/pre/i.test(parts[1]||'')?'pre-tax':'post-tax',
      amount:num(parts[2]),per:/percent/i.test(parts[3]||'')?'percent-gross':'period',active:true};
  }).filter(d=>d.name&&d.amount>0);
}
function h38DeductionsToText(list){
  return (Array.isArray(list)?list:[]).map(d=>`${d.name||'Deduction'} | ${d.kind||'post-tax'} | ${num(d.amount)} | ${d.per||'period'}`).join('\n');
}

function h38EditEmployee(employeeId){
  const row=records('employees').find(item=>rowId(item,'Employee ID')===employeeId);
  if(!row){toast('That employee record could not be found.',true);return;}
  h38EditingEmployeeId=employeeId;renderPeople();
  const form=$('employeeForm');if(!form)return;
  h38SetEmployeeFormValue(form,'displayName',v(row,'Display Name'));
  h38SetEmployeeFormValue(form,'email',v(row,'Email'));
  h38SetEmployeeFormValue(form,'userId',v(row,'User ID'));
  h38SetEmployeeFormValue(form,'employmentType',v(row,'Employment Type')||'Employee');
  h38SetEmployeeFormValue(form,'crew',v(row,'Crew'));
  h38SetEmployeeFormValue(form,'payType',v(row,'Pay Type')||'Hourly');
  h38SetEmployeeFormValue(form,'hourlyRate',v(row,'Hourly Rate'));
  h38SetEmployeeFormValue(form,'salaryRate',v(row,'Salary Rate'));
  h38SetEmployeeFormValue(form,'payFrequency',v(row,'Pay Frequency')||'Biweekly');
  h38SetEmployeeFormValue(form,'filingStatus',v(row,'Filing Status')||'Single');
  h38SetEmployeeFormValue(form,'withholdingAllowances',v(row,'Withholding Allowances'));
  h38SetEmployeeFormValue(form,'extraWithholding',v(row,'Extra Withholding'));
  h38SetEmployeeFormValue(form,'overtimeMultiplier',v(row,'Overtime Multiplier')||1.5);
  h38SetEmployeeFormValue(form,'accountType',v(row,'Account Type')||'Checking');
  h38SetEmployeeFormValue(form,'w4Step2',v(row,'W-4 Step 2 Checked')===true||v(row,'W-4 Step 2 Checked')==='Yes'?'yes':'no');
  h38SetEmployeeFormValue(form,'w4Step3',v(row,'W-4 Step 3 Credits'));
  h38SetEmployeeFormValue(form,'w4Step4a',v(row,'W-4 Step 4a Other Income'));
  h38SetEmployeeFormValue(form,'w4Step4b',v(row,'W-4 Step 4b Deductions'));
  h38SetEmployeeFormValue(form,'mnAllowances',v(row,'MN Allowances'));
  h38SetEmployeeFormValue(form,'mnAdditional',v(row,'MN Additional Withholding'));
  h38SetEmployeeFormValue(form,'deductions',h38DeductionsToText(v(row,'Deductions')));
  h38SetEmployeeFormValue(form,'startDate',parityDate(row,'Start Date'));
  h38SetEmployeeFormValue(form,'notes',v(row,'Notes'));
  const nameField=form.querySelector('[name="displayName"]');if(nameField)nameField.focus();
  form.scrollIntoView({behavior:'smooth',block:'center'});
}

function renderAccounting(){
  const vendors=records('vendors'),purchases=records('purchaseOrders'),receipts=records('receipts'),expenses=records('expenses'),periods=records('accountingPeriods'),jobs=records('jobs');
  const committed=purchases.reduce((sum,row)=>sum+num(v(row,'Total')),0),spent=expenses.reduce((sum,row)=>sum+num(v(row,'Amount'))+num(v(row,'Tax')),0);
  const h38AcctFallbackHead={page:'accounting',title:'Accounting & Bills',purpose:'Check the books, pay the bills, and get records ready for your accountant.',primary:{label:'＋ Enter a bill',handler:()=>{document.querySelectorAll('.h38-accounting-form-details').forEach(d=>d.open=true);const f=document.getElementById('vendorForm');if(f){f.scrollIntoView({behavior:'smooth',block:'center'});f.querySelector('input')?.focus({preventScroll:true});}}},more:[{label:'Add vendor',handler:()=>{document.querySelectorAll('.h38-accounting-form-details').forEach(d=>d.open=true);document.getElementById('vendorForm')?.scrollIntoView({behavior:'smooth',block:'center'});}},{label:'Purchase order',handler:()=>{document.querySelectorAll('.h38-accounting-form-details').forEach(d=>d.open=true);document.getElementById('purchaseForm')?.scrollIntoView({behavior:'smooth',block:'center'});}},{label:'Accounting period',handler:()=>{document.querySelectorAll('.h38-accounting-form-details').forEach(d=>d.open=true);document.getElementById('accountingPeriodForm')?.scrollIntoView({behavior:'smooth',block:'center'});}}]};
  $('mainContent').innerHTML=(window.H38Flow?window.H38Flow.screenHeader(h38AcctFallbackHead):pageHead('Accounting & Bills',h38AcctFallbackHead.purpose))+`<div class="grid"><section class="card"><div class="stats"><div class="stat"><strong>${vendors.length}</strong><span>Vendors</span></div><div class="stat"><strong>${money(committed)}</strong><span>Purchase orders</span></div><div class="stat"><strong>${money(spent)}</strong><span>Recorded expenses</span></div><div class="stat"><strong>${receipts.length}</strong><span>Receipts</span></div></div></section><section class="card span4"><h2>Vendor</h2><details class="h38-accounting-form-details"><summary>Add a vendor</summary><form id="vendorForm"><label>Vendor name</label><input name="vendorName" required><label>Contact</label><input name="contactName"><label>Email</label><input name="email" type="email"><label>Phone</label><input name="phone"><label>Category</label><input name="category"><label>Payment terms</label><input name="paymentTerms"><div class="actions"><button>Save vendor</button></div></form></details></section><section class="card span4"><h2>Purchase order draft</h2><details class="h38-accounting-form-details"><summary>Create a purchase order</summary><form id="purchaseForm"><label>Vendor</label><select name="vendorId">${optionRows(vendors,['Vendor ID'],row=>v(row,'Vendor Name'),'Select vendor')}</select><label>Job</label><select name="jobId">${optionRows(jobs,['Job ID'],row=>v(row,'Project Title'),'No job')}</select><label>Description</label><input name="description" required><div class="two"><div><label>Subtotal</label><input name="subtotal" type="number" step="0.01"></div><div><label>Tax</label><input name="tax" type="number" step="0.01"></div></div><label>Expected date</label><input name="expectedDate" type="date"><div class="actions"><button>Save draft</button></div></form></details></section><section class="card span4"><h2>Accounting period</h2><details class="h38-accounting-form-details"><summary>Open an accounting period</summary><form id="accountingPeriodForm"><label>Period name</label><input name="periodName" required placeholder="August 2026"><div class="two"><div><label>Start</label><input name="periodStart" type="date"></div><div><label>End</label><input name="periodEnd" type="date"></div></div><label>Missing documents</label><textarea name="missingDocuments"></textarea><div class="actions"><button>Open review period</button></div></form></details></section><section class="card span6"><h2>Vendors</h2><div class="list">${vendors.length?vendors.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Vendor Name'))}</strong>${pill(v(row,'Status')||'Active')}</div><small>${esc(v(row,'Category'))} · ${esc(v(row,'Contact Name'))} · ${esc(v(row,'Payment Terms'))}</small></div>`).join(''):empty('No vendors.')}</div></section><section class="card span6"><h2>Purchase orders</h2><div class="list">${purchases.length?purchases.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Order Number'))}</strong>${pill(v(row,'Approval Status','Status')||'Draft')}</div><small>${money(v(row,'Total'))} · ${esc(v(row,'Description'))}</small></div>`).join(''):empty('No purchase orders.')}</div></section><section class="card"><h2>Review periods</h2><div class="list">${periods.length?periods.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Period Name'))}</strong>${pill(v(row,'Review Status','Status'))}</div><small>${dateOnly(v(row,'Period Start'))}–${dateOnly(v(row,'Period End'))} · missing: ${esc(v(row,'Missing Documents')||'none listed')}</small></div>`).join(''):empty('No accounting review periods.')}</div>${serverSafeguard()}</section></div>`;
  if(window.H38Flow)window.H38Flow.bindScreenHeader($('mainContent'),h38AcctFallbackHead);
  bindForm('vendorForm',async(data,form)=>{const id=newId('VENDOR'),record={'Vendor ID':id,'Business ID':state.businessId,'Vendor Name':requireValue(data.vendorName,'Vendor name is required.'),'Contact Name':data.contactName,'Email':data.email,'Phone':data.phone,'Category':data.category,'Payment Terms':data.paymentTerms,'Status':'Active','Created Time':now(),'Updated Time':now(),'Record Version':1};await saveParity('vendors','Vendor',id,record,'vendors',['Vendor ID']);form.reset();await sync(false);renderAccounting();});
  bindForm('purchaseForm',async(data,form)=>{const id=newId('PURCHASE'),subtotal=num(data.subtotal),tax=num(data.tax),record={'Purchase Order ID':id,'Business ID':state.businessId,'Vendor ID':data.vendorId,'Job ID':data.jobId,'Order Number':`PO-${Date.now()}`,'Order Date':new Date().toISOString().slice(0,10),'Expected Date':data.expectedDate,'Description':requireValue(data.description,'Description is required.'),'Subtotal':subtotal,'Tax':tax,'Total':subtotal+tax,'Status':'Draft','Approval Status':'Owner Approval Required','Created By':state.snapshot.user.userId,'Created Time':now(),'Updated Time':now(),'Record Version':1};await saveParity('purchaseOrders','Purchase Order',id,record,'purchaseOrders',['Purchase Order ID']);form.reset();await sync(false);toast('Purchase order draft saved. Nothing purchased.');renderAccounting();});
  bindForm('accountingPeriodForm',async(data,form)=>{const id=newId('ACCOUNTING'),record={'Accounting Period ID':id,'Business ID':state.businessId,'Period Name':requireValue(data.periodName,'Period name is required.'),'Period Start':data.periodStart,'Period End':data.periodEnd,'Status':'Open','Review Status':'Preparation','Missing Documents':data.missingDocuments,'Prepared By':state.snapshot.user.userId,'Created Time':now(),'Updated Time':now(),'Record Version':1};await saveParity('accountingPeriods','Accounting Period',id,record,'accountingPeriods',['Accounting Period ID']);form.reset();await sync(false);renderAccounting();});
}

/* ============ H38 PAYROLL WORKFLOW ============
 * Full payroll (WS3): time approval → run builder (payroll-run.js reuses
 * payrollPreparation() for selection — entry-level OT splits are the single
 * source of truth; the old weekly-40 recomputation is RETIRED) →
 * payroll-calc.js withholding (Pub. 15-T 2026) → Draft → Reviewed →
 * Finalized (time-entry stamping attempted via MARK_TIME_PAID, honest
 * fallback on the run header) → Posted (one balanced GL transaction,
 * GL-PAYROLL-<runId>) → pay stubs → CSV/NACHA export.
 * The Office never files returns or moves funds. All tax figures are estimates.
 */
function h38PayrollYTD(employeeId, year){
  const lines=records('payrollLines').filter(row=>v(row,'Employee ID')===employeeId
    && String(v(row,'Pay Date')||v(row,'Created Time')||'').slice(0,4)===String(year)
    && String(v(row,'Approval Status')).toUpperCase()==='APPROVED');
  const sum=k=>lines.reduce((t,row)=>t+num(v(row,k)),0);
  return {gross:sum('Gross Pay'), federal:sum('Federal Withholding'), ss:sum('Social Security'),
    medicare:sum('Medicare'), state:sum('State Withholding'), net:sum('Net Pay')};
}
function h38TimeEmployeeName(row){
  const empId=v(row,'Employee ID'), userId=v(row,'User ID');
  const emp=records('employees').find(e=>rowId(e,'Employee ID')===String(empId||''));
  if(emp)return v(emp,'Display Name');
  return userName(userId)||empId||'Unassigned';
}
function h38FindEmployeeForTime(row){
  const empId=String(v(row,'Employee ID')||''), userId=String(v(row,'User ID')||'');
  return records('employees').find(e=>rowId(e,'Employee ID')===empId||String(v(e,'User ID'))===userId&&userId)||null;
}
async function h38SetTimeApproval(entryId, approved){
  const row=records('timeEntries').find(r=>rowId(r,'Time Entry ID','id')===entryId);
  if(!row){toast('Time entry not found.',true);return;}
  // Approval writes go through the audited RPC (direct timeEntries writes are
  // RLS-blocked for every role). The optimistic record keeps the UI snappy.
  const updated=Object.assign({},row,{'Approval Status':approved?'Approved':'Rejected','Approved By':state.snapshot.user.userId,'Approved Time':now(),'Updated Time':now(),'Record Version':num(v(row,'Record Version'))+1});
  await queueOperation('APPROVE_TIME_ENTRY','Time Entry',entryId,{timeEntryId:entryId,approved:!!approved,note:''},{collection:'timeEntries',record:updated,idKeys:['Time Entry ID']},false);
  await sync(false);renderPayrollPrep();
}
async function h38ApproveAllTime(){
  const start=state.payrollApprovalStart, end=state.payrollApprovalEnd;
  const pending=records('timeEntries').filter(row=>within(v(row,'Date','Start Time'),start,end)
    &&!['APPROVED','REJECTED'].includes(String(v(row,'Approval Status')||'').toUpperCase()));
  for(const row of pending){
    const id=rowId(row,'Time Entry ID','id');
    const updated=Object.assign({},row,{'Approval Status':'Approved','Approved By':state.snapshot.user.userId,'Approved Time':now(),'Updated Time':now(),'Record Version':num(v(row,'Record Version'))+1});
    await queueOperation('APPROVE_TIME_ENTRY','Time Entry',id,{timeEntryId:id,approved:true,note:''},{collection:'timeEntries',record:updated,idKeys:['Time Entry ID']},false);
  }
  await sync(false);toast(`${pending.length} time entries approved.`);renderPayrollPrep();
}
/* Build pay-run preview — delegates to the canonical run builder
 * (payroll-run.js): selection comes from payrollPreparation() (approved,
 * in-period, not-already-paid; entry-level OT splits), withholding from
 * payroll-calc.js. Returns {header, lines, preparation} in stored shape. */
async function h38BuildPayrollPreview(start,end,payDate){
  if(!window.H38_PAYROLL_RUN)throw new Error('Payroll run module is still loading. Try again in a moment.');
  const built=await window.H38_PAYROLL_RUN.buildRun({start,end,payDate,source:'payroll-page'});
  const totals={gross:num(v(built.header,'Gross Pay')),deductions:num(v(built.header,'Deductions')),
    net:num(v(built.header,'Net Pay')),employerCost:num(v(built.header,'Employer Cost Estimate'))};
  return {start,end,payDate,header:built.header,lines:built.lines,preparation:built.preparation,totals};
}
async function h38ConfirmPayrollRun(){
  const pv=state.payrollPreview;
  if(!pv||!pv.lines.length){toast('Nothing to save.',true);return;}
  if(!window.H38_PAYROLL_RUN){toast('Payroll run module is still loading.',true);return;}
  const header=await window.H38_PAYROLL_RUN.saveDraft({header:pv.header,lines:pv.lines});
  state.payrollPreview=null;state.payrollReviewRun=v(header,'Payroll Period ID');
  await sync(false);
  toast('Draft pay run saved. Review the estimates, then finalize. No funds moved.');renderPayrollPrep();
}
/* Run state machine actions — all delegate to payroll-run.js. */
async function h38MarkPayRunReviewed(periodId){
  if(!window.H38_PAYROLL_RUN){toast('Payroll run module is still loading.',true);return;}
  try{
    await window.H38_PAYROLL_RUN.markReviewed(periodId,state.snapshot.user.userId);
    toast('Run marked reviewed. Confirm the estimates to finalize.');renderPayrollPrep();
  }catch(e){toast(e.message||String(e),true);}
}
async function h38FinalizePayRun(periodId){
  const box=document.getElementById('payrollEstimatesConfirm');
  const estimatesConfirmed=!!(box&&box.checked);
  if(!estimatesConfirmed){toast('Check "I reviewed these estimates" on the review panel before finalizing.',true);return;}
  const confirmed=typeof h38ConfirmDialog==='function'?await h38ConfirmDialog('Finalize this pay run? This marks it approved, unlocks export, and stamps the selected time entries as paid (or tracks them on the run if the server action is pending). No funds are moved by the Office.','Finalize pay run','Finalize'):confirm('Finalize this pay run? No funds are moved by the Office.');
  if(!confirmed)return;
  if(!window.H38_PAYROLL_RUN){toast('Payroll run module is still loading.',true);return;}
  try{
    const header=await window.H38_PAYROLL_RUN.finalizeRun(periodId,{by:state.snapshot.user.userId,estimatesConfirmed});
    toast(`Pay run finalized. Export unlocked. Time entries: ${v(header,'Time Entry Stamping')}.`);
    renderPayrollPrep();
  }catch(e){toast(e.message||String(e),true);}
}
async function h38PostPayRun(periodId){
  const confirmed=typeof h38ConfirmDialog==='function'?await h38ConfirmDialog('Post this pay run to the books? This writes one balanced ledger entry (GL-PAYROLL) for wages, employer taxes, withholdings and net-pay payable. It does not pay anyone.','Post to books','Post'):confirm('Post this pay run to the books?');
  if(!confirmed)return;
  if(!window.H38_PAYROLL_RUN){toast('Payroll run module is still loading.',true);return;}
  try{
    const out=await window.H38_PAYROLL_RUN.postRun(periodId,{by:state.snapshot.user.userId});
    toast(out.alreadyPosted?'Already posted — ledger entry kept (no duplicate).':`Posted to books as ${out.transaction.id}.`);
    renderPayrollPrep();
  }catch(e){toast(e.message||String(e),true);}
}
async function h38VoidPayRun(periodId){
  const confirmed=typeof h38ConfirmDialog==='function'?await h38ConfirmDialog('Void this pay run? The run stays on record as Void and its time entries become available again (unless already stamped).','Void pay run','Void'):confirm('Void this pay run?');
  if(!confirmed)return;
  if(!window.H38_PAYROLL_RUN){toast('Payroll run module is still loading.',true);return;}
  try{await window.H38_PAYROLL_RUN.voidRun(periodId);toast('Pay run voided.');renderPayrollPrep();}
  catch(e){toast(e.message||String(e),true);}
}
function h38ExportPayrollCSV(periodId){
  const period=records('payrollPeriods').find(r=>rowId(r,'Payroll Period ID')===periodId);
  const lines=records('payrollLines').filter(l=>v(l,'Payroll Period ID')===periodId);
  const employees=records('employees');
  const csv=h38PayrollCSV(period,lines,employees);
  h38DownloadFile(`payroll-${v(period,'Pay Date')||'export'}.csv`,csv,'text/csv');
  toast('CSV exported for bank / accountant.');
}
function h38ExportPayrollNACHA(periodId){
  const period=records('payrollPeriods').find(r=>rowId(r,'Payroll Period ID')===periodId);
  const lines=records('payrollLines').filter(l=>v(l,'Payroll Period ID')===periodId);
  const employees=records('employees');
  const missing=lines.filter(line=>{
    const emp=employees.find(e=>rowId(e,'Employee ID')===v(line,'Employee ID'));
    return num(v(line,'Net Pay'))>0&&(!v(emp,'Bank Routing')||!v(emp,'Bank Account'));
  });
  if(missing.length){toast(`${missing.length} employee(s) missing bank details — NACHA skipped for them. Add routing/account in People.`,true);}
  let nacha;
  try{nacha=h38PayrollNACHA(state.snapshot.business||{},period,lines,employees);}
  catch(e){toast(e.message||String(e),true);return;} // fails closed: no placeholder routing/EIN, ever
  h38DownloadFile(`payroll-${v(period,'Pay Date')||'export'}.ach`,nacha,'text/plain');
  toast('NACHA file exported. Verify with your bank before submitting.');
}
function h38PrintStubs(periodId){
  state.payrollPrintRun=periodId;renderPayrollPrep();
  setTimeout(()=>{window.print();},300);
}

/* ---------- Payroll check printing (bank-supplied check-on-top stock) ----------
 * Toggle-gated by Owner Controls 'payroll_check_printing' (default OFF).
 * The Office prints ONLY the variable fields (date, payee, amounts, memo,
 * stub). The MICR line, bank, routing and account numbers live on the
 * business's own bank stock and are never printed or stored here.
 * Only finalized (owner-approved) pay runs can be printed; amounts and
 * names always come from the finalized payroll lines, never re-typed.
 * Every print / reprint / void / reissue is written to the payrollChecks
 * register. No funds move. */
function h38CheckPrintingOn(){
  return !!(window.H38OwnerControls&&typeof H38OwnerControls.isEnabled==='function'&&H38OwnerControls.isEnabled('payroll_check_printing'));
}
function h38PayrollCheckSettingsRow(){
  return records('payrollCheckSettings').find(r=>String(v(r,'Business ID')||'')===String(state.businessId||''))||null;
}
function h38PayrollChecksForPeriod(periodId){
  return records('payrollChecks').filter(c=>v(c,'Payroll Period ID')===periodId);
}
function h38ActiveCheckForLine(periodId,lineId){
  return h38PayrollChecksForPeriod(periodId).find(c=>v(c,'Payroll Line ID')===lineId&&String(v(c,'Status'))!=='Void')||null;
}
function h38SuggestedNextCheckNumber(){
  const settings=h38PayrollCheckSettingsRow();
  const saved=num(v(settings||{},'Next Check Number'));
  if(saved>0)return saved;
  const used=records('payrollChecks').map(c=>num(v(c,'Check Number'))).filter(n=>n>0);
  return used.length?Math.max(...used)+1:0;
}
async function h38SaveCheckPrintSettings(nextNumber,offsetX,offsetY){
  const existing=h38PayrollCheckSettingsRow();
  const id=existing?rowId(existing,'Payroll Check Settings ID'):newId('PAYCHKSET');
  const record=Object.assign({},existing||{},{
    'Payroll Check Settings ID':id,'Business ID':state.businessId,
    'Next Check Number':Math.max(0,Math.round(num(nextNumber))),
    'Offset X Mm':Math.round(num(offsetX)*10)/10,'Offset Y Mm':Math.round(num(offsetY)*10)/10,
    'Updated Time':now(),'Record Version':num(v(existing||{},'Record Version'))+1});
  await saveParity('payrollCheckSettings','Payroll Check Settings',id,record,'payrollCheckSettings',['Payroll Check Settings ID']);
}
async function h38SavePayrollCheck(record){
  await saveParity('payrollChecks','Payroll Check',v(record,'Payroll Check ID'),record,'payrollChecks',['Payroll Check ID']);
}
function h38PayrollFormDialog({title,okLabel,bodyHtml}){
  return new Promise(resolve=>{
    let dialog=document.getElementById('h38PayrollFormDialog');
    if(!dialog){
      dialog=document.createElement('dialog');
      dialog.id='h38PayrollFormDialog';
      document.body.appendChild(dialog);
    }
    dialog.innerHTML=`<form method="dialog"><h2>${esc(title)}</h2>${bodyHtml}<div class="actions"><button value="cancel" class="secondary">Cancel</button><button value="ok" class="primary">${esc(okLabel||'Save')}</button></div></form>`;
    const onClose=()=>{dialog.removeEventListener('close',onClose);
      resolve(dialog.returnValue==='ok'?dialog.querySelector('form'):null);};
    dialog.addEventListener('close',onClose);
    dialog.showModal();
  });
}
function h38EmployeeForLine(line){
  return records('employees').find(e=>rowId(e,'Employee ID')===v(line,'Employee ID'))||{};
}
async function h38PrintPayrollChecks(periodId){
  const period=records('payrollPeriods').find(r=>rowId(r,'Payroll Period ID')===periodId);
  if(!period)return;
  if(String(v(period,'Approval Status')).toUpperCase()!=='APPROVED'){toast('Only finalized pay runs can print checks.',true);return;}
  if(!h38CheckPrintingOn()){toast('Payroll check printing is off. Turn it on in Settings → Owner Controls.',true);return;}
  const lines=records('payrollLines').filter(l=>v(l,'Payroll Period ID')===periodId&&num(v(l,'Net Pay'))>0);
  if(!lines.length){toast('No pay lines with net pay in this run.',true);return;}
  const settings=h38PayrollCheckSettingsRow();
  const startDefault=h38SuggestedNextCheckNumber();
  const rows=lines.map(line=>{const emp=h38EmployeeForLine(line);const existing=h38ActiveCheckForLine(periodId,rowId(line,'Payroll Line ID'));
    return `<label style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #eef2f7">
      <input type="checkbox" data-check-line="${esc(rowId(line,'Payroll Line ID'))}" checked style="width:auto;margin-top:3px">
      <span style="flex:1"><strong>${esc(v(emp,'Display Name')||v(line,'Employee ID'))}</strong><br>
      <small>Net ${money(v(line,'Net Pay'))} · gross ${money(v(line,'Gross Pay'))}${existing?` · <strong>check #${esc(v(existing,'Check Number'))} already printed</strong> (reprints on the same number)`:''}</small></span></label>`;}).join('');
  const form=await h38PayrollFormDialog({title:'Print payroll checks',okLabel:'Print checks',bodyHtml:`
    <p class="muted small">Checks print on <strong>your bank's check-on-top stock</strong> — payee, date, amounts and the pay stub only.<br>
    The MICR line, bank name, routing and account numbers are already on your stock; the Office never prints them. Nothing is paid or sent anywhere.</p>
    <div class="list" style="max-height:260px;overflow:auto">${rows}</div>
    <div class="three" style="margin-top:10px">
      <div><label>First check number</label><input id="pcStartNumber" type="number" min="1" step="1" value="${startDefault||''}" placeholder="From your check stock"></div>
      <div><label>Nudge right (mm)</label><input id="pcOffsetX" type="number" step="0.5" min="-25" max="25" value="${num(v(settings||{},'Offset X Mm'))}"></div>
      <div><label>Nudge down (mm)</label><input id="pcOffsetY" type="number" step="0.5" min="-25" max="25" value="${num(v(settings||{},'Offset Y Mm'))}"></div>
    </div>
    <p class="muted small">Numbers must match the numbers printed on your bank stock. Offsets calibrate alignment per business and are remembered.</p>`});
  if(!form)return;
  const picked=[...form.querySelectorAll('[data-check-line]:checked')].map(cb=>cb.dataset.checkLine);
  if(!picked.length){toast('Pick at least one employee.',true);return;}
  const offsetX=num(form.querySelector('#pcOffsetX').value), offsetY=num(form.querySelector('#pcOffsetY').value);
  const selected=lines.filter(l=>picked.includes(rowId(l,'Payroll Line ID')));
  const reprints=selected.filter(l=>h38ActiveCheckForLine(periodId,rowId(l,'Payroll Line ID')));
  const fresh=selected.filter(l=>!h38ActiveCheckForLine(periodId,rowId(l,'Payroll Line ID')));
  let start=parseInt(form.querySelector('#pcStartNumber').value,10);
  if(fresh.length){
    if(!start||start<1){toast('Enter the first check number from your stock.',true);return;}
    // Duplicate-number conflict check against the whole register (voids included).
    const taken=new Map(records('payrollChecks').map(c=>[num(v(c,'Check Number')),c]).filter(([n])=>n>0));
    const conflicts=[];for(let i=0;i<fresh.length;i++){const n=start+i;if(taken.has(n))conflicts.push(n);}
    if(conflicts.length){
      let nextFree=start;while(taken.has(nextFree)||conflicts.includes(nextFree))nextFree++;
      const c=taken.get(conflicts[0]);
      const useNext=await h38ConfirmDialog(`Check number ${conflicts[0]} is already in the register (${esc(v(c,'Payee Name')||'employee')}, ${esc(dateOnly(v(c,'Check Date')))}, ${esc(v(c,'Status'))}). Print starting at ${nextFree} instead?`,'Check number conflict',`Use ${nextFree}`);
      if(!useNext)return;
      start=nextFree;
    }
  }
  if(reprints.length){
    const ok=await h38ConfirmDialog(`${reprints.length} selected check(s) were already printed. Reprinting keeps the same check number and marks the register. Continue?`,'Reprint checks','Reprint');
    if(!ok)return;
  }
  const userId=state.snapshot.user.userId, stamp=now();
  const sheets=[];let n=start;
  for(const line of fresh){
    const emp=h38EmployeeForLine(line);
    const id=newId('PAYCHECK');
    const record={'Payroll Check ID':id,'Business ID':state.businessId,'Payroll Period ID':periodId,
      'Payroll Line ID':rowId(line,'Payroll Line ID'),'Employee ID':v(line,'Employee ID'),
      'Check Number':n,'Check Date':String(v(period,'Pay Date')||'').slice(0,10),'Payee Name':v(emp,'Display Name')||'',
      'Amount':num(v(line,'Net Pay')),'Memo':`Payroll ${dateOnly(v(period,'Period Start'))} – ${dateOnly(v(period,'Period End'))}`,
      'Status':'Printed','Print Count':1,'Printed By':userId,'Printed Time':stamp,'Last Printed Time':stamp,
      'Voided By':'','Voided Time':'','Void Reason':'','Replaces Check ID':'','Replaced By Check ID':'',
      'Created Time':stamp,'Updated Time':stamp,'Record Version':1};
    await h38SavePayrollCheck(record);
    sheets.push({period,line,emp,check:record});
    n++;
  }
  for(const line of reprints){
    const existing=h38ActiveCheckForLine(periodId,rowId(line,'Payroll Line ID'));
    const updated=Object.assign({},existing,{'Print Count':num(v(existing,'Print Count'))+1,
      'Last Printed Time':stamp,'Updated Time':stamp,'Record Version':num(v(existing,'Record Version'))+1});
    await h38SavePayrollCheck(updated);
    sheets.push({period,line,emp:h38EmployeeForLine(line),check:updated});
  }
  await h38SaveCheckPrintSettings(fresh.length?n:h38SuggestedNextCheckNumber(),offsetX,offsetY);
  try{await sync(false);}catch(e){}
  toast(`${sheets.length} check(s) recorded in the register. Load your bank check stock, then print.`);
  h38RenderPayrollCheckSheets(sheets,offsetX,offsetY);
  renderPayrollPrep();
}
function h38RenderPayrollCheckSheets(sheets,offsetX,offsetY){
  let root=document.getElementById('h38PayrollCheckPrintRoot');
  if(!root){root=document.createElement('div');root.id='h38PayrollCheckPrintRoot';document.body.appendChild(root);}
  const business=state.snapshot.business||{};
  root.innerHTML=sheets.map(s=>h38PaycheckSheetHTML(business,s.emp,s.period,s.line,
    Object.assign({},s.check,{'Offset X Mm':offsetX,'Offset Y Mm':offsetY}))).join('');
  document.body.classList.add('h38-printing-checks');
  const cleanup=()=>{document.body.classList.remove('h38-printing-checks');root.innerHTML='';};
  window.addEventListener('afterprint',cleanup,{once:true});
  setTimeout(()=>{try{window.print();}catch(e){cleanup();}},300);
  setTimeout(()=>{if(document.body.classList.contains('h38-printing-checks'))cleanup();},60000);
}
async function h38ReprintRecordedCheck(checkId){
  const check=records('payrollChecks').find(c=>rowId(c,'Payroll Check ID')===checkId);
  if(!check)return;
  if(!h38CheckPrintingOn()){toast('Payroll check printing is off. Turn it on in Settings → Owner Controls.',true);return;}
  const ok=await h38ConfirmDialog(`Check #${v(check,'Check Number')} to ${v(check,'Payee Name')} for ${money(v(check,'Amount'))} was already printed ${num(v(check,'Print Count'))} time(s). Reprint it on the same number and mark the register?`,'Reprint check','Reprint');
  if(!ok)return;
  const period=records('payrollPeriods').find(r=>rowId(r,'Payroll Period ID')===v(check,'Payroll Period ID'))||{};
  const line=records('payrollLines').find(l=>rowId(l,'Payroll Line ID')===v(check,'Payroll Line ID'))||{};
  const stamp=now();
  const updated=Object.assign({},check,{'Print Count':num(v(check,'Print Count'))+1,'Last Printed Time':stamp,
    'Updated Time':stamp,'Record Version':num(v(check,'Record Version'))+1});
  await h38SavePayrollCheck(updated);
  const settings=h38PayrollCheckSettingsRow();
  try{await sync(false);}catch(e){}
  h38RenderPayrollCheckSheets([{period,line,emp:h38EmployeeForLine(line),check:updated}],
    num(v(settings||{},'Offset X Mm')),num(v(settings||{},'Offset Y Mm')));
  renderPayrollPrep();
}
async function h38VoidPayrollCheck(checkId){
  const check=records('payrollChecks').find(c=>rowId(c,'Payroll Check ID')===checkId);
  if(!check)return;
  const form=await h38PayrollFormDialog({title:`Void check #${v(check,'Check Number')}`,okLabel:'Void check',bodyHtml:`
    <p class="muted small">Voiding check #${v(check,'Check Number')} to ${esc(v(check,'Payee Name'))} for ${money(v(check,'Amount'))}. The check stays in the register as Void for your audit trail. No bank transaction happens.</p>
    <label>Reason</label><input id="pcVoidReason" type="text" placeholder="e.g. printed on wrong stock, amount wrong">`});
  if(!form)return;
  const reason=form.querySelector('#pcVoidReason').value.trim();
  const stamp=now();
  const updated=Object.assign({},check,{'Status':'Void','Voided By':state.snapshot.user.userId,'Voided Time':stamp,
    'Void Reason':reason,'Updated Time':stamp,'Record Version':num(v(check,'Record Version'))+1});
  await h38SavePayrollCheck(updated);
  try{await sync(false);}catch(e){}
  toast(`Check #${v(check,'Check Number')} voided and recorded.`);
  renderPayrollPrep();
}
async function h38ReissuePayrollCheck(checkId){
  const old=records('payrollChecks').find(c=>rowId(c,'Payroll Check ID')===checkId);
  if(!old)return;
  if(!h38CheckPrintingOn()){toast('Payroll check printing is off. Turn it on in Settings → Owner Controls.',true);return;}
  const next=h38SuggestedNextCheckNumber();
  const ok=await h38ConfirmDialog(`Reissue voided check #${v(old,'Check Number')} (${esc(v(old,'Payee Name'))}, ${money(v(old,'Amount'))}) as new check #${next}? The void stays on record, linked to the replacement.`,'Reissue check',`Issue #${next}`);
  if(!ok)return;
  const period=records('payrollPeriods').find(r=>rowId(r,'Payroll Period ID')===v(old,'Payroll Period ID'))||{};
  const line=records('payrollLines').find(l=>rowId(l,'Payroll Line ID')===v(old,'Payroll Line ID'))||{};
  const stamp=now(), id=newId('PAYCHECK');
  const record={'Payroll Check ID':id,'Business ID':state.businessId,'Payroll Period ID':v(old,'Payroll Period ID'),
    'Payroll Line ID':v(old,'Payroll Line ID'),'Employee ID':v(old,'Employee ID'),
    'Check Number':next,'Check Date':String(v(period,'Pay Date')||v(old,'Check Date')||'').slice(0,10),'Payee Name':v(old,'Payee Name'),
    'Amount':num(v(old,'Amount')),'Memo':v(old,'Memo'),'Status':'Printed','Print Count':1,
    'Printed By':state.snapshot.user.userId,'Printed Time':stamp,'Last Printed Time':stamp,
    'Voided By':'','Voided Time':'','Void Reason':'','Replaces Check ID':checkId,'Replaced By Check ID':'',
    'Created Time':stamp,'Updated Time':stamp,'Record Version':1};
  await h38SavePayrollCheck(record);
  await h38SavePayrollCheck(Object.assign({},old,{'Replaced By Check ID':id,'Updated Time':stamp,
    'Record Version':num(v(old,'Record Version'))+1}));
  const settings=h38PayrollCheckSettingsRow();
  await h38SaveCheckPrintSettings(next+1,num(v(settings||{},'Offset X Mm')),num(v(settings||{},'Offset Y Mm')));
  try{await sync(false);}catch(e){}
  toast(`Check #${next} issued to replace #${v(old,'Check Number')}.`);
  h38RenderPayrollCheckSheets([{period,line,emp:h38EmployeeForLine(line),check:record}],
    num(v(settings||{},'Offset X Mm')),num(v(settings||{},'Offset Y Mm')));
  renderPayrollPrep();
}

/* Payroll tax liability summary (spec §3.6) — accrued from POSTED runs;
 * balances read from the ledger so manual clearing entries reduce them. */
function h38PayrollLiabilitySection(periods,allLines){
  if(!window.H38_PAYROLL_RUN||!window.H38_ACCOUNTING_ENGINE)return '';
  const txs=records('accountingTransactions').map(r=>({id:rowId(r,'Transaction ID'),businessId:state.businessId,
    date:dateOnly(v(r,'Transaction Date','date')),type:v(r,'Transaction Type','type'),sourceType:v(r,'Source Type','sourceType'),
    sourceId:v(r,'Source ID','sourceId'),memo:v(r,'Memo','memo'),status:v(r,'Status','status')||'Posted',
    lines:Array.isArray(v(r,'Lines'))?v(r,'Lines'):(r.lines||[])})).filter(x=>x.id&&x.date&&x.lines.length>=2);
  let s;try{s=window.H38_PAYROLL_RUN.liabilitySummary({runs:periods,lines:allLines,transactions:txs,accounts:records('accountingAccounts')});}catch(e){return '';}
  return `<section class="card"><h2>4 · Payroll tax liabilities</h2>
    <p class="muted small">Accrued from <strong>posted</strong> runs only. Balances come from the general ledger, so tax payments recorded against accounts 2400–2450 reduce them — and these balances must match the Balance Sheet liability lines for the same accounts.</p>
    <div class="list">${s.rows.map(row=>`<div class="row"><div class="row-top"><strong>${esc(row.label)}</strong><span>accrued ${money(row.accrued)}</span></div><small>${esc(row.accountId)}${row.balance==null?' · shared employer-taxes account (2450)':` · ledger balance ${money(row.balance)}`}</small></div>`).join('')}</div></section>`;
}
/* Payroll tax tables settings (spec §4.5) — one payrollTaxConfigs record per
 * business. Federal (Pub. 15-T 2026) + FICA ship enabled with verified
 * tables. MN + FUTA/SUTA stay OFF (warning pill) until the owner confirms. */
function h38PayrollTaxSettingsSection(){
  const C=window.H38_PAYROLL_CALC;if(!C)return '';
  const cfg=window.H38_PAYROLL_RUN?window.H38_PAYROLL_RUN.loadConfig():C.createConfig();
  const mnOn=!!(cfg.minnesota&&cfg.minnesota.enabled&&cfg.minnesota.confirmed);
  const futaOn=!!(cfg.employer&&cfg.employer.futaEnabled), sutaOn=!!(cfg.employer&&cfg.employer.sutaEnabled);
  const pillFor=on=>on?pill('On'):`<span class="pill warn">⚠ Unverified — OFF</span>`;
  return `<section class="card"><h2>5 · Payroll tax tables</h2>
    <p class="muted small">Withholding tables used by every new run. Each run stores a snapshot of the tables it used, so editing here never rewrites history.</p>
    <div class="list">
      <div class="row"><div class="row-top"><strong>Federal income tax</strong>${pill('On')}</div><small>${esc(cfg.federal.source||'IRS Pub. 15-T (2026)')}. Percentage Method (automated tables), built-in $12,900 MFJ / $8,600 other, pre-2020 allowance $4,300.</small></div>
      <div class="row"><div class="row-top"><strong>FICA</strong>${pill('On')}</div><small>${esc(cfg.fica.source||'IRS Topic 751 + SSA')}. SS 6.2% to $${Number(cfg.fica.ssWageBase).toLocaleString()}, Medicare 1.45%, Additional Medicare 0.9% over $200,000 paid.</small></div>
      <div class="row"><div class="row-top"><strong>Minnesota withholding</strong>${pillFor(mnOn)}</div><small>${esc(cfg.minnesota.source||'')}. Allowance value $${Number(cfg.minnesota.allowanceValue).toLocaleString()}. While OFF, state withholding computes $0 and every run flags it for review — never a guessed number. MN Paid Leave is modeled here too and stays off until enabled.</small></div>
      <div class="row"><div class="row-top"><strong>FUTA / SUTA (employer)</strong>${pillFor(futaOn&&sutaOn)}</div><small>${esc(cfg.employer.source||'')}. Enter your confirmed FUTA rate/base and your MN DEED SUTA rate/base, then confirm each section.</small></div>
    </div>
    <form id="payrollTaxConfigForm">
      <div class="three">
        <div><label>FUTA rate (e.g. 0.006)</label><input name="futaRate" type="number" step="0.0001" min="0" value="${futaOn||cfg.employer.futaRate!=null?esc(cfg.employer.futaRate):''}"></div>
        <div><label>FUTA wage base</label><input name="futaWageBase" type="number" step="1" min="0" value="${cfg.employer.futaWageBase!=null?esc(cfg.employer.futaWageBase):''}"></div>
        <div><label>Confirm FUTA</label><select name="futaConfirmed"><option value="no"${futaOn?'':' selected'}>Not confirmed (OFF)</option><option value="yes"${futaOn?' selected':''}>Confirmed — enable</option></select></div>
      </div>
      <div class="three">
        <div><label>SUTA rate (your DEED rate)</label><input name="sutaRate" type="number" step="0.0001" min="0" value="${cfg.employer.sutaRate!=null?esc(cfg.employer.sutaRate):''}" placeholder="No default — enter yours"></div>
        <div><label>SUTA wage base</label><input name="sutaWageBase" type="number" step="1" min="0" value="${cfg.employer.sutaWageBase!=null?esc(cfg.employer.sutaWageBase):''}" placeholder="No default"></div>
        <div><label>Confirm SUTA</label><select name="sutaConfirmed"><option value="no"${sutaOn?'':' selected'}>Not confirmed (OFF)</option><option value="yes"${sutaOn?' selected':''}>Confirmed — enable</option></select></div>
      </div>
      <div class="two">
        <div><label>Minnesota tables</label><select name="mnConfirmed"><option value="no"${mnOn?'':' selected'}>Not confirmed (OFF)</option><option value="yes"${mnOn?' selected':''}>Confirmed vs MN Revenue booklet — enable</option></select></div>
        <div><label>MN allowance value</label><input name="mnAllowanceValue" type="number" step="1" min="0" value="${esc(cfg.minnesota.allowanceValue)}"></div>
      </div>
      <div class="actions"><button>Save tax tables</button><button type="button" class="secondary" data-payroll-taxreset="1">Reset to 2026 defaults</button></div>
    </form>
    <p class="muted small">Sources: federal — IRS Pub. 15-T (2026), verified 2026-10-20; FICA — IRS Topic 751 + SSA, verified 2026-10-20; Minnesota + FUTA/SUTA — corroborated only until you confirm them above.</p>
  </section>`;
}
async function h38SavePayrollTaxConfig(data){
  const C=window.H38_PAYROLL_CALC;if(!C){toast('Payroll calc module is still loading.',true);return;}
  const cfg=window.H38_PAYROLL_RUN?window.H38_PAYROLL_RUN.loadConfig():C.createConfig();
  const existing=records('payrollTaxConfigs').find(r=>String(v(r,'Business ID'))===String(state.businessId));
  const id=existing?rowId(existing,'Payroll Tax Config ID'):newId('TAXCFG');
  const mnConfirmed=data.mnConfirmed==='yes';
  const record={'Payroll Tax Config ID':id,'Business ID':state.businessId,'Tax Year':2026,
    'FICA':cfg.fica,
    'Federal':{builtInMFJ:cfg.federal.builtInMFJ,builtInOther:cfg.federal.builtInOther,pre2020AllowanceValue:cfg.federal.pre2020AllowanceValue,tables:cfg.federal.tables},
    'Minnesota':{allowanceValue:num(data.mnAllowanceValue)||cfg.minnesota.allowanceValue,tables:cfg.minnesota.tables,paidLeave:cfg.minnesota.paidLeave,confirmed:mnConfirmed},
    'Employer':{futaRate:data.futaRate===''?null:num(data.futaRate),futaWageBase:data.futaWageBase===''?null:num(data.futaWageBase),
      sutaRate:data.sutaRate===''?null:num(data.sutaRate),sutaWageBase:data.sutaWageBase===''?null:num(data.sutaWageBase),stateOtherRate:cfg.employer.stateOtherRate||0},
    'Minnesota Confirmed':mnConfirmed,'FUTA Confirmed':data.futaConfirmed==='yes','SUTA Confirmed':data.sutaConfirmed==='yes',
    'Sources':{fica:cfg.fica.source,federal:cfg.federal.source,minnesota:mnConfirmed?'Owner-confirmed in Office settings':'UNVERIFIED — confirm MN Revenue booklet'},
    'Updated By':state.snapshot.user.userId,
    'Created Time':existing?v(existing,'Created Time'):now(),'Updated Time':now(),'Record Version':num(v(existing,'Record Version'))+1};
  await saveParity('payrollTaxConfigs','Payroll Tax Config',id,record,'payrollTaxConfigs',['Payroll Tax Config ID']);
  await sync(false);toast('Payroll tax tables saved. New runs will use them; saved runs keep their snapshot.');renderPayrollPrep();
}
async function h38ResetPayrollTaxConfig(){
  const C=window.H38_PAYROLL_CALC;if(!C)return;
  const d=C.defaultConfig();
  const existing=records('payrollTaxConfigs').find(r=>String(v(r,'Business ID'))===String(state.businessId));
  const id=existing?rowId(existing,'Payroll Tax Config ID'):newId('TAXCFG');
  const record={'Payroll Tax Config ID':id,'Business ID':state.businessId,'Tax Year':2026,
    'FICA':d.fica,'Federal':{builtInMFJ:d.federal.builtInMFJ,builtInOther:d.federal.builtInOther,pre2020AllowanceValue:d.federal.pre2020AllowanceValue,tables:d.federal.tables},
    'Minnesota':{allowanceValue:d.minnesota.allowanceValue,tables:d.minnesota.tables,paidLeave:d.minnesota.paidLeave,confirmed:false},
    'Employer':{futaRate:d.employer.futaRate,futaWageBase:d.employer.futaWageBase,sutaRate:null,sutaWageBase:null,stateOtherRate:0},
    'Minnesota Confirmed':false,'FUTA Confirmed':false,'SUTA Confirmed':false,
    'Sources':{fica:d.fica.source,federal:d.federal.source,minnesota:d.minnesota.source},
    'Updated By':state.snapshot.user.userId,'Created Time':existing?v(existing,'Created Time'):now(),'Updated Time':now(),'Record Version':num(v(existing,'Record Version'))+1};
  await saveParity('payrollTaxConfigs','Payroll Tax Config',id,record,'payrollTaxConfigs',['Payroll Tax Config ID']);
  await sync(false);toast('Payroll tax tables reset to the 2026 defaults (MN + FUTA/SUTA off until confirmed).');renderPayrollPrep();
}

function renderPayrollPrep(){
  const employees=records('employees'),periods=records('payrollPeriods'),allLines=records('payrollLines'),time=records('timeEntries');
  const active=employees.filter(row=>String(v(row,'Status')).toUpperCase()!=='INACTIVE');
  // Approval range defaults: last 14 days
  if(!state.payrollApprovalStart||!state.payrollApprovalEnd){
    const today=new Date();const end=today.toISOString().slice(0,10);
    today.setDate(today.getDate()-13);const start=today.toISOString().slice(0,10);
    state.payrollApprovalStart=start;state.payrollApprovalEnd=end;
  }
  const aStart=state.payrollApprovalStart,aEnd=state.payrollApprovalEnd;
  const pending=time.filter(row=>within(v(row,'Date','Start Time'),aStart,aEnd)
    &&!['APPROVED','REJECTED'].includes(String(v(row,'Approval Status')||'').toUpperCase()));
  const approved=time.filter(row=>within(v(row,'Date','Start Time'),aStart,aEnd)
    &&String(v(row,'Approval Status')).toUpperCase()==='APPROVED').length;
  const finalizedGross=periods.filter(p=>String(v(p,'Approval Status')).toUpperCase()==='APPROVED')
    .reduce((s,p)=>s+num(v(p,'Gross Pay')),0);
  const checkPrintingOn=h38CheckPrintingOn();
  const checkRegister=records('payrollChecks').slice().sort((a,b)=>num(v(b,'Check Number'))-num(v(a,'Check Number'))).slice(0,50);

  // Stub viewer
  let stubSection='';
  if(state.payrollViewRun){
    const period=periods.find(p=>rowId(p,'Payroll Period ID')===state.payrollViewRun);
    const lines=allLines.filter(l=>v(l,'Payroll Period ID')===state.payrollViewRun);
    if(period){
      stubSection=`<section class="card"><h2>Pay stubs — pay ${esc(dateOnly(v(period,'Pay Date')))}</h2>
        <div class="notice warn"><strong>Estimates only:</strong> tax figures are planning estimates, not official tax documents. Consult your accountant before filing.</div>
        <div class="actions paystub-actions no-print" style="margin-bottom:12px">
          <button type="button" data-payroll-print="${esc(state.payrollViewRun)}">Print all stubs</button>
          <button type="button" class="secondary" data-payroll-csv="${esc(state.payrollViewRun)}">Export CSV</button>
          <button type="button" class="secondary" data-payroll-nacha="${esc(state.payrollViewRun)}">Export NACHA</button>
          <button type="button" class="secondary" data-payroll-closestubs="1">Close</button>
        </div>
        ${lines.map(line=>{const emp=employees.find(e=>rowId(e,'Employee ID')===v(line,'Employee ID'))||{};
          return h38PayStubHTML(state.snapshot.business||{},emp,period,line);}).join('')||empty('No pay lines in this run.')}
      </section>`;
    }
  }

  // Preview section (two-phase prepare) — built by payroll-run.js from
  // payrollPreparation() selection + payroll-calc.js withholding.
  let previewSection='';
  if(state.payrollPreview){
    const pv=state.payrollPreview;
    const entryTotal=pv.lines.reduce((s,l)=>s+((v(l,'Time Entry IDs')||[]).length||0),0);
    const excludedCount=((pv.preparation&&v(pv.preparation,'Excluded Sources'))||[]).length;
    previewSection=`<section class="card"><h2>Preview pay run — confirm to save as Draft</h2>
      <div class="notice warn"><strong>Review carefully.</strong> This preview uses <strong>approved time only</strong> (${entryTotal} entries${excludedCount?`, ${excludedCount} source(s) excluded — see run after saving`:''}). Tax figures are estimates from the payroll tax tables in Settings.</div>
      <div class="notice"><strong>OT note:</strong> ${esc(v(pv.header,'OT Migration Note'))}</div>
      <div class="list">${pv.lines.map(line=>{const emp=employees.find(e=>rowId(e,'Employee ID')===v(line,'Employee ID'))||{};
        const trace=v(line,'Calc Trace')||{};const fedPath=trace.federal?trace.federal.path:'';
        return `<div class="row"><div class="row-top"><strong>${esc(v(emp,'Display Name')||v(line,'Employee ID'))}</strong><span>${money(v(line,'Net Pay'))} net</span></div>
        <small>${num(v(line,'Regular Hours')).toFixed(2)} reg · ${num(v(line,'Overtime Hours')).toFixed(2)} OT · gross ${money(v(line,'Gross Pay'))} · fed ${money(v(line,'Federal Withholding'))} · SS ${money(v(line,'Social Security'))} · med ${money(v(line,'Medicare'))}${num(v(line,'Additional Medicare'))>0?` · addl med ${money(v(line,'Additional Medicare'))}`:''} · MN ${money(v(line,'State Withholding'))} · deductions ${money(v(line,'Total Deductions'))}${v(line,'Contractor')?' · <strong>Contractor — 1099, no withholding</strong>':''}${fedPath?` · W-4: ${esc(fedPath)}`:''}</small></div>`;}).join('')}</div>
      <div class="row-top" style="margin-top:8px"><strong>Totals</strong><span>Gross ${money(pv.totals.gross)} · Deductions ${money(pv.totals.deductions)} · <strong>Net ${money(pv.totals.net)}</strong> · Employer cost ${money(pv.totals.employerCost)}</span></div>
      <div class="actions"><button type="button" data-payroll-confirm="1">Confirm & save Draft</button>
      <button type="button" class="secondary" data-payroll-cancelpreview="1">Discard preview</button></div>
    </section>`;
  }

  // Review section — the §4.6 estimates gate for Draft/Reviewed runs.
  let reviewSection='';
  if(state.payrollReviewRun){
    const run=periods.find(p=>rowId(p,'Payroll Period ID')===state.payrollReviewRun);
    if(run&&['Draft','Reviewed'].includes(String(v(run,'Status')))){
      const runLines=allLines.filter(l=>v(l,'Payroll Period ID')===state.payrollReviewRun);
      const status=String(v(run,'Status'));
      reviewSection=`<section class="card"><h2>Review pay run — pay ${esc(dateOnly(v(run,'Pay Date')))} (${esc(status)})</h2>
      <div class="notice warn"><strong>Withholding figures are estimates</strong> calculated from the tax tables in Settings (sources shown there). They are not a tax filing. Confirm the amounts — or edit any line — before finalizing.</div>
      <div class="notice"><strong>OT note:</strong> ${esc(v(run,'OT Migration Note')||'OT now follows approved entry splits.')}</div>
      <div class="list">${runLines.map(line=>{const emp=employees.find(e=>rowId(e,'Employee ID')===v(line,'Employee ID'))||{};
        const trace=v(line,'Calc Trace')||{};const fed=trace.federal||{};
        return `<div class="row"><div class="row-top"><strong>${esc(v(emp,'Display Name')||v(line,'Employee ID'))}</strong><span>${money(v(line,'Net Pay'))} net</span></div>
        <small>gross ${money(v(line,'Gross Pay'))} · fed ${money(v(line,'Federal Withholding'))} · FICA ${money(num(v(line,'Social Security'))+num(v(line,'Medicare'))+num(v(line,'Additional Medicare')))} · MN ${money(v(line,'State Withholding'))}${v(line,'Contractor')?' · <strong>Contractor — 1099, no withholding</strong>':''}${fed.annualizedWages!=null?`<br>Calc: annualized ${money(fed.annualizedWages)} → adjusted ${money(fed.adjustedAnnualWage)} · ${esc(fed.path||'')} · bracket base ${money(fed.bracketRow?fed.bracketRow.baseTax:0)} + ${fed.bracketRow?Math.round(fed.bracketRow.rate*1000)/10:0}% over ${money(fed.bracketRow?fed.bracketRow.excessOver:0)}`:''}${(trace.reviewFlags||[]).length?`<br>⚠ ${trace.reviewFlags.map(esc).join('<br>⚠ ')}`:''}</small></div>`;}).join('')||empty('No lines in this run.')}</div>
      <label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px"><input type="checkbox" id="payrollEstimatesConfirm" style="width:auto;margin-top:3px" ${v(run,'Estimates Confirmed Time')?'checked disabled':''}> <span><strong>I reviewed these estimates</strong> — withholding was calculated from the tax tables in Settings and I confirm the amounts before finalizing.</span></label>
      <div class="actions">
        ${status==='Draft'?`<button type="button" data-payroll-review="${esc(state.payrollReviewRun)}">Mark reviewed</button>`:''}
        ${status==='Reviewed'?`<button type="button" data-payroll-finalize="${esc(state.payrollReviewRun)}">Finalize run</button>`:''}
        <button type="button" class="secondary" data-payroll-closereview="1">Close review</button>
        <button type="button" class="secondary" data-payroll-void="${esc(state.payrollReviewRun)}">Void run</button>
      </div>
      <p class="muted small">Finalizing stamps the selected time entries via the audited MARK_TIME_PAID action when available; otherwise the run header records “Server action pending — entries tracked on this run” and the entry IDs stay on the run lines so they can never be paid twice.</p>
      </section>`;
    }
  }

  const h38PayrollUnapprovedHours=pending.reduce((s,row)=>s+num(v(row,'Regular Hours','Hours','Duration Hours'))+num(v(row,'Overtime Hours')),0);
  const h38PayrollHead={page:'payroll',title:'Payroll',purpose:'Pay your team from approved time. Nothing is filed or paid automatically.',primary:{label:'Start a pay run',handler:()=>{if(window.H38GuidedPayroll&&typeof window.H38GuidedPayroll.start==='function'){window.H38GuidedPayroll.start();return;}document.querySelector('#mainContent section.card')?.scrollIntoView({behavior:'smooth',block:'start'});}},more:[{label:'Print checks',handler:()=>{window.toast?.('Print checks from a finalized pay run below — check printing is a feature toggle in Settings.');}},{label:'Export',handler:()=>{document.querySelector('[data-payroll-csv],[data-payroll-nacha]')?.scrollIntoView({behavior:'smooth',block:'center'});}}]};
  const h38PayrollNotice=pending.length?`<div class="notice warn">${h38PayrollUnapprovedHours.toFixed(1)} hours are not approved yet — they will not be in this run. <button type="button" class="secondary" data-h38-review-time="1">Review time</button></div>`:'';
  $('mainContent').innerHTML=(window.H38Flow?window.H38Flow.screenHeader(h38PayrollHead):pageHead('Payroll',h38PayrollHead.purpose))+h38PayrollNotice+`<div class="grid">
  <section class="card"><div class="stats">
    <div class="stat"><strong>${active.length}</strong><span>Active employees</span></div>
    <div class="stat"><strong>${pending.length}</strong><span>Time awaiting approval</span></div>
    <div class="stat"><strong>${periods.length}</strong><span>Pay runs</span></div>
    <div class="stat"><strong>${money(finalizedGross)}</strong><span>Finalized gross</span></div>
  </div></section>

  <section class="card span6"><h2>1 · Approve time</h2>
    <p class="muted small">Only <strong>approved</strong> time entries go into a pay run. Review the range, then approve.</p>
    <div class="two"><div><label>From</label><input id="payrollApprStart" type="date" value="${esc(aStart)}"></div>
    <div><label>To</label><input id="payrollApprEnd" type="date" value="${esc(aEnd)}"></div></div>
    <div class="actions"><button type="button" class="secondary" data-payroll-apprange="1">Update range</button>
    ${pending.length?`<button type="button" data-payroll-approveall="1">Approve all ${pending.length}</button>`:''}</div>
    <div class="list" style="margin-top:8px;max-height:320px;overflow:auto">${pending.length?pending.slice(0,100).map(row=>{const id=rowId(row,'Time Entry ID','id');
      return `<div class="row"><div class="row-top"><strong>${esc(h38TimeEmployeeName(row))}</strong>${pill(v(row,'Approval Status')||'Pending','warn')}</div>
      <small>${esc(dateOnly(v(row,'Date','Start Time')))} · ${num(v(row,'Regular Hours','Hours','Duration Hours')).toFixed(2)} hrs${num(v(row,'Overtime Hours'))?` · ${num(v(row,'Overtime Hours')).toFixed(2)} OT`:''} · ${esc(v(row,'Notes')||'')}</small>
      <div class="row-actions"><button type="button" class="secondary" data-payroll-approve="${esc(id)}">Approve</button><button type="button" class="secondary" data-payroll-reject="${esc(id)}">Reject</button></div></div>`;}).join(''):empty('No time awaiting approval in this range.')}
    </div>
    <p class="muted small">${approved} entries already approved in range.</p>
  </section>

  <section class="card span6"><h2>2 · Prepare pay run</h2>
    <form id="payrollPeriodForm"><div class="two"><div><label>Period start</label><input name="periodStart" type="date" required value="${esc(aStart)}"></div>
    <div><label>Period end</label><input name="periodEnd" type="date" required value="${esc(aEnd)}"></div></div>
    <label>Pay date</label><input name="payDate" type="date" required>
    <div class="actions"><button>Preview pay run</button></div></form>
    <div class="notice warn"><strong>Preparation only:</strong> preview first, then confirm. Owner final approval is required before export. No funds are moved.</div>
  </section>

  ${previewSection}

  ${reviewSection}

  <section class="card"><h2>3 · Pay runs & history</h2>
    <div class="list">${periods.length?periods.slice().reverse().map(row=>{const pid=rowId(row,'Payroll Period ID');
      const status=String(v(row,'Status')||'');
      const st=String(v(row,'Approval Status','Status'));
      const finalized=st.toUpperCase()==='APPROVED'&&status!=='Void';
      const posted=status==='Posted';
      return `<div class="row"><div class="row-top"><strong>Pay ${esc(dateOnly(v(row,'Pay Date')))}</strong>${pill(status||st,finalized||posted?'':'warn')}</div>
      <small>${esc(dateOnly(v(row,'Period Start')))}–${esc(dateOnly(v(row,'Period End')))} · gross ${money(v(row,'Gross Pay'))} · net ${money(v(row,'Net Pay','Prepared Net Amount'))} · employer cost ${money(v(row,'Employer Cost Estimate'))}${finalized||posted?`<br>Time entries: ${esc(v(row,'Time Entry Stamping')||'—')}`:''}${posted?`<br>Ledger: ${esc(v(row,'Ledger Transaction ID'))} · posted ${esc(dateOnly(v(row,'Posted Time')))}`:(finalized?'<br><strong>Not posted to books</strong> — post when ready; liabilities accrue only after posting.':'')}</small>
      <div class="row-actions">
        ${status==='Draft'||status==='Reviewed'?`<button type="button" data-payroll-openreview="${esc(pid)}">Review & finalize</button>`:''}
        ${status==='Finalized'?`<button type="button" data-payroll-post="${esc(pid)}">Post to books</button>`:''}
        <button type="button" class="secondary" data-payroll-view="${esc(pid)}">View stubs</button>
        ${finalized?`<button type="button" class="secondary" data-payroll-csv="${esc(pid)}">CSV</button><button type="button" class="secondary" data-payroll-nacha="${esc(pid)}">NACHA</button>`:''}
        ${finalized?(checkPrintingOn?`<button type="button" data-payroll-checkprint="${esc(pid)}">Print checks</button>`:`<button type="button" disabled title="Turn on Payroll check printing in Settings → Owner Controls">Print checks</button>`):''}
      </div>${finalized&&!checkPrintingOn?'<small class="muted">Check printing is off — enable <strong>Payroll check printing</strong> in Settings → Owner Controls to print on your bank check stock.</small>':''}</div>`;}).join(''):empty('No pay runs yet. Approve time, then prepare a run.')}
    </div></section>

  ${h38PayrollLiabilitySection(periods,allLines)}
  ${h38PayrollTaxSettingsSection()}

  ${stubSection}

  <section class="card"><h2>4 · Payroll check register</h2>
    <p class="muted small">Every printed, reprinted, voided and reissued check is recorded here. Checks print only on <strong>your bank's check stock</strong> — the Office never prints a MICR line, routing or account number, and never moves money.</p>
    ${!checkPrintingOn?'<p class="muted small">Check printing is <strong>off</strong>. Enable <strong>Payroll check printing</strong> in Settings → Owner Controls to print, reprint or reissue. Voiding stays available for your records.</p>':''}
    <div class="list">${checkRegister.length?checkRegister.map(c=>{const cid=rowId(c,'Payroll Check ID');const st=String(v(c,'Status'));
      return `<div class="row"><div class="row-top"><strong>Check #${esc(v(c,'Check Number'))} — ${esc(v(c,'Payee Name'))}</strong>${pill(st,st==='Void'?'bad':'')}</div>
      <small>${esc(dateOnly(v(c,'Check Date')))} · ${money(v(c,'Amount'))}${v(c,'Replaces Check ID')?' · reissue':''}${v(c,'Replaced By Check ID')?' · replaced':''} · printed ${num(v(c,'Print Count'))}×${v(c,'Last Printed Time')?` (last ${esc(dateOnly(v(c,'Last Printed Time')))})`:''}${st==='Void'&&v(c,'Void Reason')?` · void: ${esc(v(c,'Void Reason'))}`:''}</small>
      <div class="row-actions">
        ${st!=='Void'?`<button type="button" class="secondary" data-payroll-checkreprint="${esc(cid)}" ${checkPrintingOn?'':'disabled'}>Reprint</button><button type="button" class="secondary" data-payroll-checkvoid="${esc(cid)}">Void</button>`:`<button type="button" class="secondary" data-payroll-checkreissue="${esc(cid)}" ${checkPrintingOn?'':'disabled'}>Reissue with new number</button>`}
      </div></div>`;}).join(''):empty('No checks printed yet. Finalize a pay run, then choose Print checks.')}
    </div></section>

  <section class="card"><h2>Employee tax setup</h2>
    <p class="muted small">W-4 details drive withholding estimates. Edit in <button type="button" class="secondary" data-open-page="people">People</button>, or quick-edit allowances here.</p>
    <div class="list">${active.map(row=>{const id=rowId(row,'Employee ID');
      return `<div class="row"><div class="row-top"><strong>${esc(v(row,'Display Name'))}</strong><span>${esc(v(row,'Pay Type'))} ${v(row,'Pay Type')==='Hourly'?money(v(row,'Hourly Rate'))+'/hr':money(v(row,'Salary Rate'))+'/period'}</span></div>
      <small>Filing: ${esc(v(row,'Filing Status')||'Single')} · Allowances: ${esc(v(row,'Withholding Allowances')||'0')} · Extra WH: ${money(v(row,'Extra Withholding'))} · Frequency: ${esc(v(row,'Pay Frequency')||'Biweekly')}</small>
      <div class="row-actions"><button type="button" class="secondary" data-payroll-taxedit="${esc(id)}">Edit tax info</button></div></div>`;}).join('')||empty('No active employees. Add them in People.')}
    </div></section>
  </div>`;

  // Bindings
  const bind=(sel,fn)=>{document.querySelectorAll(sel).forEach(b=>b.onclick=fn);};
  if(window.H38Flow)window.H38Flow.bindScreenHeader($('mainContent'),h38PayrollHead);
  document.querySelectorAll('[data-h38-review-time]').forEach(b=>b.onclick=()=>{const a=document.querySelector('[data-payroll-approve]');if(a){a.scrollIntoView({behavior:'smooth',block:'center'});}else window.toast?.('No time is waiting for approval in this range.');});
  bind('[data-payroll-approve]',e=>h38SetTimeApproval(e.target.dataset.payrollApprove,true));
  bind('[data-payroll-reject]',e=>h38SetTimeApproval(e.target.dataset.payrollReject,false));
  bind('[data-payroll-approveall]',()=>h38ApproveAllTime());
  bind('[data-payroll-apprange]',()=>{state.payrollApprovalStart=$('payrollApprStart').value;state.payrollApprovalEnd=$('payrollApprEnd').value;renderPayrollPrep();});
  bind('[data-payroll-confirm]',()=>h38ConfirmPayrollRun());
  bind('[data-payroll-cancelpreview]',()=>{state.payrollPreview=null;renderPayrollPrep();});
  bind('[data-payroll-finalize]',e=>h38FinalizePayRun(e.target.dataset.payrollFinalize));
  bind('[data-payroll-openreview]',e=>{state.payrollReviewRun=e.target.dataset.payrollOpenreview;renderPayrollPrep();});
  bind('[data-payroll-review]',e=>h38MarkPayRunReviewed(e.target.dataset.payrollReview));
  bind('[data-payroll-closereview]',()=>{state.payrollReviewRun=null;renderPayrollPrep();});
  bind('[data-payroll-post]',e=>h38PostPayRun(e.target.dataset.payrollPost));
  bind('[data-payroll-void]',e=>h38VoidPayRun(e.target.dataset.payrollVoid));
  bind('[data-payroll-taxreset]',()=>h38ResetPayrollTaxConfig());
  bindForm('payrollTaxConfigForm',data=>h38SavePayrollTaxConfig(data));
  bind('[data-payroll-view]',e=>{state.payrollViewRun=e.target.dataset.payrollView;state.payrollPrintRun=null;renderPayrollPrep();});
  bind('[data-payroll-closestubs]',()=>{state.payrollViewRun=null;state.payrollPrintRun=null;renderPayrollPrep();});
  bind('[data-payroll-print]',e=>h38PrintStubs(e.target.dataset.payrollPrint));
  bind('[data-payroll-checkprint]',e=>h38PrintPayrollChecks(e.target.dataset.payrollCheckprint));
  bind('[data-payroll-checkreprint]',e=>h38ReprintRecordedCheck(e.target.dataset.payrollCheckreprint));
  bind('[data-payroll-checkvoid]',e=>h38VoidPayrollCheck(e.target.dataset.payrollCheckvoid));
  bind('[data-payroll-checkreissue]',e=>h38ReissuePayrollCheck(e.target.dataset.payrollCheckreissue));
  bind('[data-payroll-csv]',e=>h38ExportPayrollCSV(e.target.dataset.payrollCsv));
  bind('[data-payroll-nacha]',e=>h38ExportPayrollNACHA(e.target.dataset.payrollNacha));
  bind('[data-open-page]',e=>{if(window.openPage)window.openPage(e.target.dataset.openPage);});
  bind('[data-payroll-taxedit]',e=>h38EditEmployeeTax(e.target.dataset.payrollTaxedit));

  bindForm('payrollPeriodForm',async(data)=>{
    const start=requireValue(data.periodStart,'Period start is required.');
    const end=requireValue(data.periodEnd,'Period end is required.');
    const payDate=requireValue(data.payDate,'Pay date is required.');
    let pv;
    try{pv=await h38BuildPayrollPreview(start,end,payDate);}
    catch(e){toast(e.message||String(e),true);return;}
    if(!pv.lines.length){toast('No approved time or salaried employees for this period. Approve time first.',true);return;}
    state.payrollPreview=pv;state.payrollViewRun=null;renderPayrollPrep();
    toast('Preview ready — review, then confirm.');
  });
}
async function h38EditEmployeeTax(employeeId){
  const row=records('employees').find(r=>rowId(r,'Employee ID')===employeeId);
  if(!row)return;
  const filing=prompt('Filing status (Single, Married Filing Jointly, Head of Household):',v(row,'Filing Status')||'Single');
  if(filing===null)return;
  const allowances=prompt('W-4 withholding allowances (number):',v(row,'Withholding Allowances')||'0');
  if(allowances===null)return;
  const extra=prompt('Extra withholding per pay period ($):',v(row,'Extra Withholding')||'0');
  if(extra===null)return;
  const freq=prompt('Pay frequency (Weekly, Biweekly, Semimonthly, Monthly):',v(row,'Pay Frequency')||'Biweekly');
  if(freq===null)return;
  const updated=Object.assign({},row,{'Filing Status':filing,'Withholding Allowances':num(allowances),
    'Extra Withholding':num(extra),'Pay Frequency':freq,'Updated Time':now(),'Record Version':num(v(row,'Record Version'))+1});
  await saveParity('employees','Employee',employeeId,updated,'employees',['Employee ID']);
  await sync(false);toast('Tax info updated.');renderPayrollPrep();
}
/* Legacy alias: old prepare flow now goes through preview */
async function preparePayrollPeriod(data){
  const start=requireValue(data.periodStart,'Period start is required.');
  const end=requireValue(data.periodEnd,'Period end is required.');
  const payDate=requireValue(data.payDate,'Pay date is required.');
  const pv=await h38BuildPayrollPreview(start,end,payDate);
  if(!pv.lines.length){toast('No approved time or salaried employees for this period. Approve time first.',true);return;}
  state.payrollPreview=pv;renderPayrollPrep();
}


function renderTaxPrep(){
  const periods=records('taxPeriods'),missing=records('missingDocuments');
  const h38TaxHead={page:'tax',title:'Tax Prep',purpose:'Get sales-tax and year-end records ready for your accountant. The Office never files a return.',primary:{label:'Open tax packet',handler:()=>{const s=document.getElementById('h38-tax-packet')||document.querySelector('#mainContent section.card');if(s)s.scrollIntoView({behavior:'smooth',block:'start'});const b=document.getElementById('downloadTaxPacketBtn');if(b)b.focus({preventScroll:true});}},more:[{label:'QuickBooks (tax) status',handler:()=>{if(typeof window.openPage==='function')window.openPage('accounting');}}]};
  $('mainContent').innerHTML=(window.H38Flow?window.H38Flow.screenHeader(h38TaxHead):pageHead('Tax Prep',h38TaxHead.purpose))+`<div class="grid">${(typeof taxPacketSection==='function'?taxPacketSection():'')}<section class="card span5"><h2>Prepare sales-tax period</h2><form id="taxPeriodForm"><label>Jurisdiction</label><input name="jurisdiction" required><div class="two"><div><label>Start</label><input name="periodStart" type="date" required></div><div><label>End</label><input name="periodEnd" type="date" required></div></div><label>Due date</label><input name="dueDate" type="date"><label>Adjustments</label><input name="adjustments" type="number" step="0.01"><div class="actions"><button>Prepare period</button></div></form><div class="notice warn">Preparation and controlled report generation only. No tax return is filed and no tax payment is initiated.</div></section><section class="card span7"><h2>Tax periods</h2><div class="list">${periods.length?periods.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Tax Type'))} · ${esc(v(row,'Jurisdiction'))}</strong>${pill(v(row,'Approval Status','Status'))}</div><small>${dateOnly(v(row,'Period Start'))}–${dateOnly(v(row,'Period End'))} · tax collected ${money(v(row,'Tax Collected'))} · estimated liability ${money(v(row,'Estimated Liability'))}</small></div>`).join(''):empty('No tax periods prepared.')}</div></section><section class="card span5"><h2>Missing document</h2><form id="missingDocumentForm"><label>Area</label><select name="area"><option>Tax</option><option>Payroll</option><option>Accounting</option><option>Year End</option></select><label>Document type</label><input name="documentType" required><label>Description</label><textarea name="description"></textarea><label>Due date</label><input name="dueDate" type="date"><div class="actions"><button>Add missing document</button></div></form></section><section class="card span7"><h2>Missing documents</h2><div class="list">${missing.length?missing.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Document Type'))}</strong>${pill(v(row,'Status')||'Open')}</div><small>${esc(v(row,'Area'))} · due ${dateOnly(v(row,'Due Date'))} · ${esc(v(row,'Description'))}</small></div>`).join(''):empty('No missing documents recorded.')}</div></section></div>`;
  if(window.H38Flow)window.H38Flow.bindScreenHeader($('mainContent'),h38TaxHead);
  if(typeof bindTaxPacket==='function')bindTaxPacket();
  bindForm('taxPeriodForm',prepareTaxPeriod);bindForm('missingDocumentForm',async(data,form)=>{const id=newId('MISSING'),record={'Missing Document ID':id,'Business ID':state.businessId,'Area':data.area,'Document Type':requireValue(data.documentType,'Document type is required.'),'Description':data.description,'Due Date':data.dueDate,'Status':'Open','Created Time':now(),'Updated Time':now(),'Record Version':1};await saveParity('missingDocuments','Missing Document',id,record,'missingDocuments',['Missing Document ID']);form.reset();await sync(false);renderTaxPrep();});
}
async function prepareTaxPeriod(data,form){
  const start=requireValue(data.periodStart,'Start date is required.'),end=requireValue(data.periodEnd,'End date is required.'),invoices=records('invoices').filter(row=>within(v(row,'Invoice Date','Created Time'),start,end)&&String(v(row,'Status')).toUpperCase()!=='VOIDED'),taxable=invoices.reduce((sum,row)=>sum+num(v(row,'Subtotal')),0),collected=invoices.reduce((sum,row)=>sum+num(v(row,'Tax','Tax Amount')),0),adjustments=num(data.adjustments),id=newId('TAX'),record={'Tax Period ID':id,'Business ID':state.businessId,'Tax Type':'Sales Tax','Jurisdiction':requireValue(data.jurisdiction,'Jurisdiction is required.'),'Period Start':start,'Period End':end,'Due Date':data.dueDate,'Status':'Prepared','Approval Status':'Owner Approval Required','Finalization Allowed':'No','Taxable Sales':taxable,'Exempt Sales':0,'Tax Collected':collected,'Tax Adjustments':adjustments,'Estimated Liability':collected+adjustments,'Payment Recorded':0,'Missing Documents':'','Created By':state.snapshot.user.userId,'Created Time':now(),'Updated Time':now(),'Record Version':1};await saveParity('taxPeriods','Tax Period',id,record,'taxPeriods',['Tax Period ID']);form.reset();await sync(false);toast('Tax period prepared. Nothing filed or paid.');renderTaxPrep();
}

function formatProofDetails(row){
  const details=v(row,'Details','details');
  if(!details||typeof details!=='object')return String(details||'');
  const change=values=>typeof values!=='object'?String(values??'(blank)'):Object.entries(values||{}).map(([field,value])=>`${field}: ${value===null||value===undefined?'(blank)':String(value)}`).join(', ');
  const parts=[details.sourceRequest||details.request||'',details.approvalState||''];
  if(details.before!==undefined&&details.after!==undefined)parts.push(`${change(details.before)} → ${change(details.after)}`);
  if(Array.isArray(details.recordsAffected))parts.push(details.recordsAffected.map(record=>[record.collection,record.recordId].filter(Boolean).join(' ')).filter(Boolean).join(', '));
  if(details.aiActionId)parts.push(`AI action ${details.aiActionId}`);
  return parts.filter(Boolean).join(' · ');
}

function renderControls(){
  const approvals=records('approvals'),proof=records('proofLog'),errors=records('errorLog'),backups=records('backups'),actions=records('actionQueue');
  const h38ControlsHead={page:'controls',title:'Controls',purpose:'Approvals, proof, and problems — the record of what happened and what needs you.',primary:{label:'Review approvals',handler:()=>{document.getElementById('h38ControlsApprovals')?.scrollIntoView({behavior:'smooth',block:'start'});}}};
  $('mainContent').innerHTML=(window.H38Flow?window.H38Flow.screenHeader(h38ControlsHead):pageHead('Controls',h38ControlsHead.purpose))+`<div class="grid"><section class="card"><div class="stats"><div class="stat"><strong>${approvals.filter(row=>String(v(row,'Status')).toUpperCase()!=='CLOSED').length}</strong><span>Open approvals</span></div><div class="stat"><strong>${proof.length}</strong><span>Proof events</span></div><div class="stat"><strong>${errors.filter(row=>String(v(row,'Status')).toUpperCase()!=='RESOLVED').length}</strong><span>Open errors</span></div><div class="stat"><strong>${backups.length}</strong><span>Backup records</span></div></div></section><section class="card span4"><h2>Request approval</h2><form id="approvalForm"><label>Area</label><input name="area" required><label>Record type</label><input name="recordType"><label>Record ID</label><input name="recordId"><label>Request</label><textarea name="request" required></textarea><div class="actions"><button>Submit for review</button></div></form></section><section class="card span4"><h2>Request backup</h2><form id="backupForm"><label>Backup type</label><select name="backupType"><option>Full Business Office</option><option>Accounting Records</option><option>Documents Index</option><option>Configuration</option></select><label>Scope</label><input name="scope" value="Current business"><label>Notes</label><textarea name="notes"></textarea><div class="actions"><button>Queue backup request</button></div></form><p class="muted small">This records an owner-controlled backup request. It does not delete, replace or migrate production data.</p></section><section class="card span4"><h2>Pending action queue</h2><div class="list">${actions.length?actions.slice(0,40).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Action','Action Type'))}</strong>${pill(v(row,'Status'))}</div><small>${esc(v(row,'Record Type'))} ${esc(v(row,'Record ID'))}</small></div>`).join(''):empty('No queued controlled actions.')}</div></section><section class="card span6" id="h38ControlsApprovals"><h2>Approvals</h2><p class="muted small">Requests waiting for your decision.</p><div class="list">${approvals.length?approvals.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Area'))}: ${esc(v(row,'Request'))}</strong>${pill(v(row,'Status')||'Open')}</div><small>${esc(v(row,'Record Type'))} ${esc(v(row,'Record ID'))} · decision ${esc(v(row,'Decision')||'not made')}</small></div>`).join(''):empty('No approval records.')}</div></section><section class="card span6" id="h38ControlsProof"><h2>Proof Log</h2><p class="muted small">Every important action, recorded.</p><div class="list">${proof.length?proof.slice(0,100).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Action','Action Type','actionType'))}</strong>${pill(v(row,'Outcome','Result','result'))}</div><small>${esc(v(row,'Record Type','Entity Type','entityType'))} ${esc(v(row,'Record ID','Entity ID','entityId'))} · ${esc(formatProofDetails(row))} · ${dateTime(v(row,'Timestamp','Created Time','createdAt'))}</small></div>`).join(''):empty('No proof events yet.')}</div></section><section class="card span6" id="h38ControlsErrors"><h2>Error Log</h2><p class="muted small">Problems the Office hit, and whether they are resolved.</p><div class="list">${errors.length?errors.slice(0,100).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Area'))}: ${esc(v(row,'Action'))}</strong>${pill(v(row,'Status')||'Open','bad')}</div><small>${esc(v(row,'Message'))} · ${dateTime(v(row,'Timestamp'))}</small></div>`).join(''):empty('No errors recorded.')}</div></section><section class="card span6" id="h38ControlsBackups"><h2>Backups</h2><p class="muted small">Backup requests and records for this business.</p><div class="list">${backups.length?backups.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Backup Type'))}</strong>${pill(v(row,'Status'))}</div><small>${esc(v(row,'Scope'))} · requested ${dateTime(v(row,'Requested Time'))}</small></div>`).join(''):empty('No backup records.')}</div></section></div>`;
  if(window.H38Flow)window.H38Flow.bindScreenHeader($('mainContent'),h38ControlsHead);
  bindForm('approvalForm',async(data,form)=>{const id=newId('APPROVAL'),record={'Approval ID':id,'Business ID':state.businessId,'Area':requireValue(data.area,'Area is required.'),'Record Type':data.recordType,'Record ID':data.recordId,'Request':requireValue(data.request,'Request is required.'),'Requested By':state.snapshot.user.userId,'Requested Time':now(),'Decision':'','Status':'Open','Created Time':now(),'Updated Time':now(),'Record Version':1};await saveParity('approvals','Approval',id,record,'approvals',['Approval ID']);form.reset();await sync(false);toast('Approval request saved. Nothing was approved automatically.');renderControls();});
  bindForm('backupForm',async(data,form)=>{const id=newId('BACKUP'),record={'Backup ID':id,'Business ID':state.businessId,'Backup Type':data.backupType,'Scope':data.scope,'Status':'Requested — Owner Review','Requested By':state.snapshot.user.userId,'Requested Time':now(),'Notes':data.notes,'Record Version':1};await saveParity('backups','Backup',id,record,'backups',['Backup ID']);form.reset();await sync(false);toast('Backup request recorded for owner review.');renderControls();});
}

function renderReports(){
  const invoices=records('invoices'),payments=records('payments'),expenses=records('expenses'),purchases=records('purchaseOrders'),payroll=records('payrollPeriods'),tax=records('taxPeriods'),missing=records('missingDocuments'),time=records('timeEntries'),reports=records('reports');
  const invoiced=invoices.reduce((sum,row)=>sum+num(v(row,'Total')),0),received=payments.reduce((sum,row)=>sum+num(v(row,'Amount')),0),spent=expenses.reduce((sum,row)=>sum+num(v(row,'Amount'))+num(v(row,'Tax')),0),committed=purchases.reduce((sum,row)=>sum+num(v(row,'Total')),0),payrollGross=payroll.reduce((sum,row)=>sum+num(v(row,'Gross Pay')),0),taxDue=tax.reduce((sum,row)=>sum+num(v(row,'Estimated Liability'))-num(v(row,'Payment Recorded')),0),hours=time.reduce((sum,row)=>sum+num(v(row,'Regular Hours','Hours','Duration Hours'))+num(v(row,'Overtime Hours')),0);
  const h38ReportsHead={page:'reports',title:'Reports',purpose:'Plain-language answers about your money and work. Nothing here files or moves anything.',primary:{label:'Run a report',handler:()=>{const f=document.getElementById('reportForm');if(f){f.scrollIntoView({behavior:'smooth',block:'center'});f.querySelector('select,input')?.focus({preventScroll:true});}}},more:[{label:'Accountant package',handler:()=>{if(typeof window.openPage==='function')window.openPage('tax');}}]};
  $('mainContent').innerHTML=(window.H38Flow?window.H38Flow.screenHeader(h38ReportsHead):pageHead('Reports',h38ReportsHead.purpose))+`<div class="grid"><section class="card"><div class="stats"><div class="stat"><strong>${money(invoiced)}</strong><span>Invoiced</span></div><div class="stat"><strong>${money(received)}</strong><span>Payments recorded</span></div><div class="stat"><strong>${money(spent)}</strong><span>Expenses</span></div><div class="stat"><strong>${money(invoiced-spent)}</strong><span>Preliminary margin</span></div></div></section><section class="card span4"><h2>Operations</h2><div class="list"><div class="row"><strong>${records('customers').length}</strong><small>Customers</small></div><div class="row"><strong>${records('jobs').length}</strong><small>Jobs</small></div><div class="row"><strong>${records('quotes').length}</strong><small>Quotes</small></div><div class="row"><strong>${hours.toFixed(1)}</strong><small>Recorded hours</small></div></div></section><section class="card span4"><h2>Accounting readiness</h2><div class="list"><div class="row"><strong>${money(committed)}</strong><small>Purchase commitments</small></div><div class="row"><strong>${money(payrollGross)}</strong><small>Prepared payroll gross</small></div><div class="row"><strong>${money(taxDue)}</strong><small>Estimated tax liability</small></div><div class="row"><strong>${missing.filter(row=>String(v(row,'Status')).toUpperCase()!=='COMPLETE').length}</strong><small>Missing documents</small></div></div></section><section class="card span4"><h2>Save report snapshot</h2><form id="reportForm"><label>Report type</label><select name="reportType"><option>Business Summary</option><option>Profit and Loss Preparation</option><option>Accounts Receivable</option><option>Payroll Preparation Summary</option><option>Tax Preparation Summary</option></select><div class="two"><div><label>Start</label><input name="periodStart" type="date"></div><div><label>End</label><input name="periodEnd" type="date"></div></div><label>Notes</label><textarea name="notes"></textarea><div class="actions"><button>Save snapshot</button></div></form></section><section class="card"><h2>Saved reports</h2><div class="list">${reports.length?reports.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Report Type'))}</strong>${pill(v(row,'Approval Status','Status'))}</div><small>${dateOnly(v(row,'Period Start'))}–${dateOnly(v(row,'Period End'))} · prepared ${dateTime(v(row,'Prepared Time'))}</small></div>`).join(''):empty('No saved report snapshots.')}</div>${serverSafeguard()}</section></div>`;
  if(window.H38Flow)window.H38Flow.bindScreenHeader($('mainContent'),h38ReportsHead);
  bindForm('reportForm',async(data,form)=>{const id=newId('REPORT'),record={'Report ID':id,'Business ID':state.businessId,'Report Type':data.reportType,'Period Start':data.periodStart,'Period End':data.periodEnd,'Status':'Prepared','Approval Status':'Owner Review Required','Prepared By':state.snapshot.user.userId,'Prepared Time':now(),'Notes':`${data.notes||''}\nSnapshot: invoiced ${invoiced}; payments ${received}; expenses ${spent}; preliminary margin ${invoiced-spent}; payroll gross ${payrollGross}; tax liability ${taxDue}.`.trim(),'Record Version':1};await saveParity('reports','Report',id,record,'reports',['Report ID']);form.reset();await sync(false);toast('Report snapshot saved for review. Nothing filed or sent.');renderReports();});
}
