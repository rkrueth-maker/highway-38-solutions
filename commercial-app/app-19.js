'use strict';

Object.assign(PAGE_DEFS,{
  people:['👷','People'],
  accounting:['📚','Accounting'],
  payroll:['🧮','Payroll'],
  tax:['🗂️','Tax Prep'],
  controls:['🛡️','Controls'],
  reports:['📊','Reports']
});
const H38_PARITY_OFFICE_PAGES=['today','customers','people','work','quotes','schedule','messages','field','inventory','fleet','money','memberships','accounting','payroll','tax','documents','social','controls','reports','ai','settings'];
OFFICE_PAGES.splice(0,OFFICE_PAGES.length,...H38_PARITY_OFFICE_PAGES);
SHELL_PAGES.office=OFFICE_PAGES;
const H38_PARITY_REQUIREMENTS={
  customers:['viewCustomers','manageWork','manageQuotes'],work:['manageWork','viewAssignedWork','manageAssignedWork'],quotes:['manageQuotes','manageWork'],measure:['manageField','manageQuotes','captureEvidence'],schedule:['manageSchedule','manageWork','viewAssignedWork'],messages:['manageCommunications'],field:['manageField','viewAssignedWork','captureEvidence'],inventory:['manageInventory','useInventory'],fleet:['manageAssets','useAssets','manageMaintenance'],money:['manageFinancial','viewFinancial'],memberships:['manageFinancial','viewFinancial'],accounting:['manageFinancial','viewFinancial'],payroll:['manageFinancial'],tax:['manageFinancial'],people:['manageUsers'],documents:['manageWork','manageQuotes','manageField','captureEvidence'],social:['manageSocial'],controls:['manageSettings'],reports:['manageFinancial','viewFinancial','manageSettings'],settings:['manageSettings','manageUsers']
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
renderPage=function(){if(!state.snapshot){renderWelcome();return;}const parity={people:renderPeople,accounting:renderAccounting,payroll:renderPayrollPrep,tax:renderTaxPrep,controls:renderControls,reports:renderReports,memberships:renderMemberships};if(parity[state.page])parity[state.page]();else h38ParityBaseRenderPage();};

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
  $('mainContent').innerHTML=pageHead('People & Employees','Manage exact-email Office access, employee records, crews, and approved time without mixing payroll funding into sign-in setup.')+`<div class="grid"><section id="h38TeamAccessMount" class="card h38-team-access-mount"><h2>Team Access</h2><p class="muted">Opening secure employee and site-manager access controls…</p></section><section class="card"><div class="stats"><div class="stat"><strong>${active.length}</strong><span>Active employees</span></div><div class="stat"><strong>${users.length}</strong><span>Business users</span></div><div class="stat"><strong>${hours.toFixed(1)}</strong><span>Recorded hours</span></div><div class="stat"><strong>${time.length}</strong><span>Time entries</span></div></div></section><section class="card span5"><h2>Employment record</h2><p class="muted small">This records HR and payroll-preparation details. Use Team Access above to prepare a secure H38 Office sign-in.</p>${editingRow?`<div class="notice">Editing <strong>${esc(v(editingRow,'Display Name'))}</strong> — saving updates this record in place; no duplicate is created. Bank fields left blank keep what is on file.</div>`:''}<form id="employeeForm"><label>Display name</label><input name="displayName" required><label>Email</label><input name="email" type="email"><label>Linked user</label><select name="userId">${optionRows(users,['User ID'],row=>v(row,'Display Name','Email'),'Not linked')}</select><div class="two"><div><label>Employment type</label><select name="employmentType"><option>Employee</option><option>Contractor</option><option>Seasonal</option></select></div><div><label>Crew</label><input name="crew"></div></div><div class="three"><div><label>Pay type</label><select name="payType"><option>Hourly</option><option>Salary</option><option>Contract</option></select></div><div><label>Hourly rate</label><input name="hourlyRate" type="number" step="0.01"></div><div><label>Salary per period</label><input name="salaryRate" type="number" step="0.01"></div></div><div class="three"><div><label>Pay frequency</label><select name="payFrequency"><option>Weekly</option><option selected>Biweekly</option><option>Semimonthly</option><option>Monthly</option></select></div><div><label>Filing status</label><select name="filingStatus"><option>Single</option><option>Married Filing Jointly</option><option>Head of Household</option></select></div><div><label>W-4 allowances</label><input name="withholdingAllowances" type="number" min="0" value="0"></div></div><div class="two"><div><label>Extra withholding / period</label><input name="extraWithholding" type="number" step="0.01" value="0"></div><div><label>Overtime multiplier</label><input name="overtimeMultiplier" type="number" step="0.05" value="1.5"></div></div><div class="three"><div><label>Bank routing #</label><input name="bankRouting" inputmode="numeric" placeholder="For direct deposit"></div><div><label>Bank account #</label><input name="bankAccount" inputmode="numeric" placeholder="For direct deposit"></div><div><label>Account type</label><select name="accountType"><option>Checking</option><option>Savings</option></select></div></div><label>Start date</label><input name="startDate" type="date"><label>Notes</label><textarea name="notes"></textarea><div class="actions"><button>${editingRow?'Update employee':'Save employee'}</button>${editingRow?'<button type="button" class="secondary" id="employeeEditCancel">Cancel edit</button>':''}</div></form>${serverSafeguard()}</section><section class="card span7"><h2>Employees</h2><div class="list">${employees.length?employees.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Display Name'))}</strong>${pill(v(row,'Status')||'Active')}</div><small>${esc(v(row,'Employment Type'))} · ${esc(v(row,'Pay Type'))} · crew ${esc(v(row,'Crew')||'unassigned')} · ${esc(v(row,'Email'))}</small><div class="row-actions"><button type="button" class="secondary" data-employee-edit="${esc(rowId(row,'Employee ID'))}">Edit</button></div></div>`).join(''):empty('No employee records yet.')}</div></section><section class="card"><h2>Recent time</h2><div class="list">${time.length?time.slice(0,80).map(row=>`<div class="row"><div class="row-top"><strong>${esc(userName(v(row,'User ID','Employee ID')))}</strong>${pill(v(row,'Approval Status','Status')||'Recorded')}</div><small>${dateOnly(v(row,'Date','Start Time'))} · ${num(v(row,'Regular Hours','Hours','Duration Hours')).toFixed(2)} regular · ${num(v(row,'Overtime Hours')).toFixed(2)} overtime</small></div>`).join(''):empty('No time entries.')}</div></section></div>`;
  bindForm('employeeForm',async(data,form)=>{
    const fields={'Display Name':requireValue(data.displayName,'Employee name is required.'),'Email':data.email,'User ID':data.userId,'Employment Type':data.employmentType,'Pay Type':data.payType,'Hourly Rate':num(data.hourlyRate),'Salary Rate':num(data.salaryRate),'Overtime Multiplier':num(data.overtimeMultiplier)||1.5,'Pay Frequency':data.payFrequency||'Biweekly','Filing Status':data.filingStatus||'Single','Withholding Allowances':num(data.withholdingAllowances),'Extra Withholding':num(data.extraWithholding),'Account Type':data.accountType||'Checking','Crew':data.crew,'Start Date':data.startDate,'Notes':data.notes};
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
  h38SetEmployeeFormValue(form,'startDate',parityDate(row,'Start Date'));
  h38SetEmployeeFormValue(form,'notes',v(row,'Notes'));
  const nameField=form.querySelector('[name="displayName"]');if(nameField)nameField.focus();
  form.scrollIntoView({behavior:'smooth',block:'center'});
}

function renderAccounting(){
  const vendors=records('vendors'),purchases=records('purchaseOrders'),receipts=records('receipts'),expenses=records('expenses'),periods=records('accountingPeriods'),jobs=records('jobs');
  const committed=purchases.reduce((sum,row)=>sum+num(v(row,'Total')),0),spent=expenses.reduce((sum,row)=>sum+num(v(row,'Amount'))+num(v(row,'Tax')),0);
  $('mainContent').innerHTML=pageHead('Accounting Preparation','Organize vendors, purchases, receipts, expenses and review periods without moving money or replacing an accountant.')+`<div class="grid"><section class="card"><div class="stats"><div class="stat"><strong>${vendors.length}</strong><span>Vendors</span></div><div class="stat"><strong>${money(committed)}</strong><span>Purchase orders</span></div><div class="stat"><strong>${money(spent)}</strong><span>Recorded expenses</span></div><div class="stat"><strong>${receipts.length}</strong><span>Receipts</span></div></div></section><section class="card span4"><h2>Vendor</h2><form id="vendorForm"><label>Vendor name</label><input name="vendorName" required><label>Contact</label><input name="contactName"><label>Email</label><input name="email" type="email"><label>Phone</label><input name="phone"><label>Category</label><input name="category"><label>Payment terms</label><input name="paymentTerms"><div class="actions"><button>Save vendor</button></div></form></section><section class="card span4"><h2>Purchase order draft</h2><form id="purchaseForm"><label>Vendor</label><select name="vendorId">${optionRows(vendors,['Vendor ID'],row=>v(row,'Vendor Name'),'Select vendor')}</select><label>Job</label><select name="jobId">${optionRows(jobs,['Job ID'],row=>v(row,'Project Title'),'No job')}</select><label>Description</label><input name="description" required><div class="two"><div><label>Subtotal</label><input name="subtotal" type="number" step="0.01"></div><div><label>Tax</label><input name="tax" type="number" step="0.01"></div></div><label>Expected date</label><input name="expectedDate" type="date"><div class="actions"><button>Save draft</button></div></form></section><section class="card span4"><h2>Accounting period</h2><form id="accountingPeriodForm"><label>Period name</label><input name="periodName" required placeholder="August 2026"><div class="two"><div><label>Start</label><input name="periodStart" type="date"></div><div><label>End</label><input name="periodEnd" type="date"></div></div><label>Missing documents</label><textarea name="missingDocuments"></textarea><div class="actions"><button>Open review period</button></div></form></section><section class="card span6"><h2>Vendors</h2><div class="list">${vendors.length?vendors.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Vendor Name'))}</strong>${pill(v(row,'Status')||'Active')}</div><small>${esc(v(row,'Category'))} · ${esc(v(row,'Contact Name'))} · ${esc(v(row,'Payment Terms'))}</small></div>`).join(''):empty('No vendors.')}</div></section><section class="card span6"><h2>Purchase orders</h2><div class="list">${purchases.length?purchases.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Order Number'))}</strong>${pill(v(row,'Approval Status','Status')||'Draft')}</div><small>${money(v(row,'Total'))} · ${esc(v(row,'Description'))}</small></div>`).join(''):empty('No purchase orders.')}</div></section><section class="card"><h2>Review periods</h2><div class="list">${periods.length?periods.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Period Name'))}</strong>${pill(v(row,'Review Status','Status'))}</div><small>${dateOnly(v(row,'Period Start'))}–${dateOnly(v(row,'Period End'))} · missing: ${esc(v(row,'Missing Documents')||'none listed')}</small></div>`).join(''):empty('No accounting review periods.')}</div>${serverSafeguard()}</section></div>`;
  bindForm('vendorForm',async(data,form)=>{const id=newId('VENDOR'),record={'Vendor ID':id,'Business ID':state.businessId,'Vendor Name':requireValue(data.vendorName,'Vendor name is required.'),'Contact Name':data.contactName,'Email':data.email,'Phone':data.phone,'Category':data.category,'Payment Terms':data.paymentTerms,'Status':'Active','Created Time':now(),'Updated Time':now(),'Record Version':1};await saveParity('vendors','Vendor',id,record,'vendors',['Vendor ID']);form.reset();await sync(false);renderAccounting();});
  bindForm('purchaseForm',async(data,form)=>{const id=newId('PURCHASE'),subtotal=num(data.subtotal),tax=num(data.tax),record={'Purchase Order ID':id,'Business ID':state.businessId,'Vendor ID':data.vendorId,'Job ID':data.jobId,'Order Number':`PO-${Date.now()}`,'Order Date':new Date().toISOString().slice(0,10),'Expected Date':data.expectedDate,'Description':requireValue(data.description,'Description is required.'),'Subtotal':subtotal,'Tax':tax,'Total':subtotal+tax,'Status':'Draft','Approval Status':'Owner Approval Required','Created By':state.snapshot.user.userId,'Created Time':now(),'Updated Time':now(),'Record Version':1};await saveParity('purchaseOrders','Purchase Order',id,record,'purchaseOrders',['Purchase Order ID']);form.reset();await sync(false);toast('Purchase order draft saved. Nothing purchased.');renderAccounting();});
  bindForm('accountingPeriodForm',async(data,form)=>{const id=newId('ACCOUNTING'),record={'Accounting Period ID':id,'Business ID':state.businessId,'Period Name':requireValue(data.periodName,'Period name is required.'),'Period Start':data.periodStart,'Period End':data.periodEnd,'Status':'Open','Review Status':'Preparation','Missing Documents':data.missingDocuments,'Prepared By':state.snapshot.user.userId,'Created Time':now(),'Updated Time':now(),'Record Version':1};await saveParity('accountingPeriods','Accounting Period',id,record,'accountingPeriods',['Accounting Period ID']);form.reset();await sync(false);renderAccounting();});
}

/* ============ H38 PAYROLL WORKFLOW ============
 * Full payroll: time approval → pay calc (weekly OT) → tax estimates →
 * owner finalize → pay stubs → CSV/NACHA export.
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
/* Build pay-run preview from approved time only */
function h38BuildPayrollPreview(start,end,payDate){
  const employees=records('employees').filter(row=>String(v(row,'Status')).toUpperCase()!=='INACTIVE');
  const time=records('timeEntries');
  const year=String(payDate||start).slice(0,4);
  const preview={start,end,payDate,lines:[],totals:{gross:0,deductions:0,net:0,employerCost:0}};
  employees.forEach(employee=>{
    const empId=rowId(employee,'Employee ID'), userId=String(v(employee,'User ID')||'');
    const entries=time.filter(row=>{
      const match=String(v(row,'Employee ID'))===empId||(userId&&String(v(row,'User ID'))===userId);
      return match&&String(v(row,'Approval Status')).toUpperCase()==='APPROVED'&&within(v(row,'Date','Start Time'),start,end);
    });
    if(!entries.length&&String(v(employee,'Pay Type')).toLowerCase()!=='salary')return;
    // Weekly overtime: group hours by ISO week, OT = hours over 40/week
    const weeks={};
    entries.forEach(row=>{
      const wk=h38WeekKey(v(row,'Date','Start Time'));
      weeks[wk]=(weeks[wk]||0)+num(v(row,'Regular Hours','Hours','Duration Hours'))+num(v(row,'Overtime Hours'));
    });
    let regular=0,overtime=0;
    Object.values(weeks).forEach(h=>{regular+=Math.min(h,40);overtime+=Math.max(0,h-40);});
    const ytd=h38PayrollYTD(empId,year);
    const calc=h38CalculatePaycheck(employee,regular,overtime,ytd);
    preview.lines.push({employeeId:empId,calc,entryCount:entries.length});
    preview.totals.gross+=calc.grossPay;preview.totals.deductions+=calc.totalDeductions;
    preview.totals.net+=calc.netPay;preview.totals.employerCost+=calc.employerCost;
  });
  ['gross','deductions','net','employerCost'].forEach(k=>preview.totals[k]=Math.round(preview.totals[k]*100)/100);
  return preview;
}
async function h38ConfirmPayrollRun(){
  const pv=state.payrollPreview;
  if(!pv||!pv.lines.length){toast('Nothing to save.',true);return;}
  const periodId=newId('PAYROLL');
  const period={'Payroll Period ID':periodId,'Business ID':state.businessId,'Period Start':pv.start,'Period End':pv.end,
    'Pay Date':pv.payDate,'Status':'Prepared','Approval Status':'Owner Approval Required','Export Allowed':'No',
    'Gross Pay':pv.totals.gross,'Deductions':pv.totals.deductions,'Prepared Net Amount':pv.totals.net,
    'Employer Tax Estimate':Math.round((pv.totals.employerCost-pv.totals.gross)*100)/100,
    'Employer Cost Estimate':pv.totals.employerCost,
    'Created By':state.snapshot.user.userId,'Created Time':now(),'Updated Time':now(),'Record Version':1};
  await saveParity('payrollPeriods','Payroll Period',periodId,period,'payrollPeriods',['Payroll Period ID']);
  for(const item of pv.lines){
    const c=item.calc, lineId=newId('PAYLINE');
    const line={'Payroll Line ID':lineId,'Business ID':state.businessId,'Payroll Period ID':periodId,
      'Employee ID':item.employeeId,'Pay Date':pv.payDate,
      'Regular Hours':c.regularHours,'Overtime Hours':c.overtimeHours,'Hourly Rate':c.hourlyRate,
      'Regular Pay':c.regularPay,'Overtime Pay':c.overtimePay,'Salary Pay':c.salaryPay,
      'Gross Pay':c.grossPay,'Federal Withholding':c.federalWithholding,'Social Security':c.socialSecurity,
      'Medicare':c.medicare,'State Withholding':c.stateWithholding,'Total Deductions':c.totalDeductions,
      'Net Pay':c.netPay,'Deductions':c.totalDeductions,'Prepared Net Amount':c.netPay,
      'Employer SS':c.employerSS,'Employer Medicare':c.employerMedicare,'FUTA':c.futa,'SUTA':c.suta,
      'Employer Tax Estimate':c.employerTax,'Employer Cost Estimate':c.employerCost,
      'YTD Gross':c.ytdGross,'YTD Federal':c.ytdFederal,'YTD SS':c.ytdSS,'YTD Medicare':c.ytdMedicare,
      'YTD State':c.ytdState,'YTD Net':c.ytdNet,
      'Approval Status':'Owner Approval Required','Time Entries':item.entryCount,
      'Notes':'Tax figures are estimates. No funds moved.','Created Time':now(),'Updated Time':now(),'Record Version':1};
    await saveParity('payrollLines','Payroll Line',lineId,line,'payrollLines',['Payroll Line ID']);
  }
  state.payrollPreview=null;await sync(false);
  toast('Pay run saved for owner review. No funds moved.');renderPayrollPrep();
}
async function h38FinalizePayRun(periodId){
  const confirmed=typeof h38ConfirmDialog==='function'?await h38ConfirmDialog('Finalize this pay run? This marks it approved and unlocks export. No funds are moved by the Office.','Finalize pay run','Finalize'):confirm('Finalize this pay run? This marks it approved and unlocks export. No funds are moved by the Office.');
  if(!confirmed)return;
  const row=records('payrollPeriods').find(r=>rowId(r,'Payroll Period ID')===periodId);
  if(!row)return;
  const updated=Object.assign({},row,{'Approval Status':'Approved','Status':'Finalized','Export Allowed':'Yes',
    'Finalized By':state.snapshot.user.userId,'Finalized Time':now(),'Updated Time':now(),'Record Version':num(v(row,'Record Version'))+1});
  await saveParity('payrollPeriods','Payroll Period',periodId,updated,'payrollPeriods',['Payroll Period ID']);
  const lines=records('payrollLines').filter(l=>v(l,'Payroll Period ID')===periodId);
  for(const line of lines){
    const lid=rowId(line,'Payroll Line ID');
    const lu=Object.assign({},line,{'Approval Status':'Approved','Updated Time':now(),'Record Version':num(v(line,'Record Version'))+1});
    await saveParity('payrollLines','Payroll Line',lid,lu,'payrollLines',['Payroll Line ID']);
  }
  await sync(false);toast('Pay run finalized. Export unlocked.');renderPayrollPrep();
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
  const nacha=h38PayrollNACHA(state.snapshot.business||{},period,lines,employees);
  h38DownloadFile(`payroll-${v(period,'Pay Date')||'export'}.ach`,nacha,'text/plain');
  toast('NACHA file exported. Verify with your bank before submitting.');
}
function h38PrintStubs(periodId){
  state.payrollPrintRun=periodId;renderPayrollPrep();
  setTimeout(()=>{window.print();},300);
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

  // Preview section (two-phase prepare)
  let previewSection='';
  if(state.payrollPreview){
    const pv=state.payrollPreview;
    previewSection=`<section class="card"><h2>Preview pay run — confirm to save</h2>
      <div class="notice warn"><strong>Review carefully.</strong> This preview uses <strong>approved time only</strong> (${pv.lines.reduce((s,l)=>s+l.entryCount,0)} entries). Tax figures are estimates.</div>
      <div class="list">${pv.lines.map(item=>{const emp=employees.find(e=>rowId(e,'Employee ID')===item.employeeId)||{};
        const c=item.calc;
        return `<div class="row"><div class="row-top"><strong>${esc(v(emp,'Display Name')||item.employeeId)}</strong><span>${money(c.netPay)} net</span></div>
        <small>${c.regularHours.toFixed(2)} reg · ${c.overtimeHours.toFixed(2)} OT · gross ${money(c.grossPay)} · fed ${money(c.federalWithholding)} · SS ${money(c.socialSecurity)} · med ${money(c.medicare)} · MN ${money(c.stateWithholding)} · deductions ${money(c.totalDeductions)}</small></div>`;}).join('')}</div>
      <div class="row-top" style="margin-top:8px"><strong>Totals</strong><span>Gross ${money(pv.totals.gross)} · Deductions ${money(pv.totals.deductions)} · <strong>Net ${money(pv.totals.net)}</strong> · Employer cost ${money(pv.totals.employerCost)}</span></div>
      <div class="actions"><button type="button" data-payroll-confirm="1">Confirm & save for owner review</button>
      <button type="button" class="secondary" data-payroll-cancelpreview="1">Discard preview</button></div>
    </section>`;
  }

  $('mainContent').innerHTML=pageHead('Payroll','Run payroll from approved time: calculate pay, estimate withholding, finalize, print stubs, and export for your bank or accountant. The Office never files returns or moves funds.')+`<div class="grid">
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

  <section class="card"><h2>3 · Pay runs & history</h2>
    <div class="list">${periods.length?periods.slice().reverse().map(row=>{const pid=rowId(row,'Payroll Period ID');
      const st=String(v(row,'Approval Status','Status'));
      const finalized=st.toUpperCase()==='APPROVED';
      return `<div class="row"><div class="row-top"><strong>Pay ${esc(dateOnly(v(row,'Pay Date')))}</strong>${pill(st,finalized?'':'warn')}</div>
      <small>${esc(dateOnly(v(row,'Period Start')))}–${esc(dateOnly(v(row,'Period End')))} · gross ${money(v(row,'Gross Pay'))} · net ${money(v(row,'Prepared Net Amount'))} · employer cost ${money(v(row,'Employer Cost Estimate'))}</small>
      <div class="row-actions">
        ${!finalized?`<button type="button" data-payroll-finalize="${esc(pid)}">Approve & finalize</button>`:''}
        <button type="button" class="secondary" data-payroll-view="${esc(pid)}">View stubs</button>
        ${finalized?`<button type="button" class="secondary" data-payroll-csv="${esc(pid)}">CSV</button><button type="button" class="secondary" data-payroll-nacha="${esc(pid)}">NACHA</button>`:''}
      </div></div>`;}).join(''):empty('No pay runs yet. Approve time, then prepare a run.')}
    </div></section>

  ${stubSection}

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
  bind('[data-payroll-approve]',e=>h38SetTimeApproval(e.target.dataset.payrollApprove,true));
  bind('[data-payroll-reject]',e=>h38SetTimeApproval(e.target.dataset.payrollReject,false));
  bind('[data-payroll-approveall]',()=>h38ApproveAllTime());
  bind('[data-payroll-apprange]',()=>{state.payrollApprovalStart=$('payrollApprStart').value;state.payrollApprovalEnd=$('payrollApprEnd').value;renderPayrollPrep();});
  bind('[data-payroll-confirm]',()=>h38ConfirmPayrollRun());
  bind('[data-payroll-cancelpreview]',()=>{state.payrollPreview=null;renderPayrollPrep();});
  bind('[data-payroll-finalize]',e=>h38FinalizePayRun(e.target.dataset.payrollFinalize));
  bind('[data-payroll-view]',e=>{state.payrollViewRun=e.target.dataset.payrollView;state.payrollPrintRun=null;renderPayrollPrep();});
  bind('[data-payroll-closestubs]',()=>{state.payrollViewRun=null;state.payrollPrintRun=null;renderPayrollPrep();});
  bind('[data-payroll-print]',e=>h38PrintStubs(e.target.dataset.payrollPrint));
  bind('[data-payroll-csv]',e=>h38ExportPayrollCSV(e.target.dataset.payrollCsv));
  bind('[data-payroll-nacha]',e=>h38ExportPayrollNACHA(e.target.dataset.payrollNacha));
  bind('[data-open-page]',e=>{if(window.openPage)window.openPage(e.target.dataset.openPage);});
  bind('[data-payroll-taxedit]',e=>h38EditEmployeeTax(e.target.dataset.payrollTaxedit));

  bindForm('payrollPeriodForm',async(data)=>{
    const start=requireValue(data.periodStart,'Period start is required.');
    const end=requireValue(data.periodEnd,'Period end is required.');
    const payDate=requireValue(data.payDate,'Pay date is required.');
    const pv=h38BuildPayrollPreview(start,end,payDate);
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
  const pv=h38BuildPayrollPreview(start,end,payDate);
  if(!pv.lines.length){toast('No approved time or salaried employees for this period. Approve time first.',true);return;}
  state.payrollPreview=pv;renderPayrollPrep();
}


function renderTaxPrep(){
  const periods=records('taxPeriods'),missing=records('missingDocuments');
  $('mainContent').innerHTML=pageHead('Tax Preparation','Prepare sales-tax and year-end support, track missing documents and preserve owner/accountant review. The Office never files a return.')+`<div class="grid">${(typeof taxPacketSection==='function'?taxPacketSection():'')}<section class="card span5"><h2>Prepare sales-tax period</h2><form id="taxPeriodForm"><label>Jurisdiction</label><input name="jurisdiction" required><div class="two"><div><label>Start</label><input name="periodStart" type="date" required></div><div><label>End</label><input name="periodEnd" type="date" required></div></div><label>Due date</label><input name="dueDate" type="date"><label>Adjustments</label><input name="adjustments" type="number" step="0.01"><div class="actions"><button>Prepare period</button></div></form><div class="notice warn">Preparation and controlled report generation only. No tax return is filed and no tax payment is initiated.</div></section><section class="card span7"><h2>Tax periods</h2><div class="list">${periods.length?periods.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Tax Type'))} · ${esc(v(row,'Jurisdiction'))}</strong>${pill(v(row,'Approval Status','Status'))}</div><small>${dateOnly(v(row,'Period Start'))}–${dateOnly(v(row,'Period End'))} · tax collected ${money(v(row,'Tax Collected'))} · estimated liability ${money(v(row,'Estimated Liability'))}</small></div>`).join(''):empty('No tax periods prepared.')}</div></section><section class="card span5"><h2>Missing document</h2><form id="missingDocumentForm"><label>Area</label><select name="area"><option>Tax</option><option>Payroll</option><option>Accounting</option><option>Year End</option></select><label>Document type</label><input name="documentType" required><label>Description</label><textarea name="description"></textarea><label>Due date</label><input name="dueDate" type="date"><div class="actions"><button>Add missing document</button></div></form></section><section class="card span7"><h2>Missing documents</h2><div class="list">${missing.length?missing.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Document Type'))}</strong>${pill(v(row,'Status')||'Open')}</div><small>${esc(v(row,'Area'))} · due ${dateOnly(v(row,'Due Date'))} · ${esc(v(row,'Description'))}</small></div>`).join(''):empty('No missing documents recorded.')}</div></section></div>`;
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
  $('mainContent').innerHTML=pageHead('Controls','Review approvals, proof, errors and backup requests without bypassing owner approval.')+`<div class="grid"><section class="card"><div class="stats"><div class="stat"><strong>${approvals.filter(row=>String(v(row,'Status')).toUpperCase()!=='CLOSED').length}</strong><span>Open approvals</span></div><div class="stat"><strong>${proof.length}</strong><span>Proof events</span></div><div class="stat"><strong>${errors.filter(row=>String(v(row,'Status')).toUpperCase()!=='RESOLVED').length}</strong><span>Open errors</span></div><div class="stat"><strong>${backups.length}</strong><span>Backup records</span></div></div></section><section class="card span4"><h2>Request approval</h2><form id="approvalForm"><label>Area</label><input name="area" required><label>Record type</label><input name="recordType"><label>Record ID</label><input name="recordId"><label>Request</label><textarea name="request" required></textarea><div class="actions"><button>Submit for review</button></div></form></section><section class="card span4"><h2>Request backup</h2><form id="backupForm"><label>Backup type</label><select name="backupType"><option>Full Business Office</option><option>Accounting Records</option><option>Documents Index</option><option>Configuration</option></select><label>Scope</label><input name="scope" value="Current business"><label>Notes</label><textarea name="notes"></textarea><div class="actions"><button>Queue backup request</button></div></form><p class="muted small">This records an owner-controlled backup request. It does not delete, replace or migrate production data.</p></section><section class="card span4"><h2>Pending action queue</h2><div class="list">${actions.length?actions.slice(0,40).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Action','Action Type'))}</strong>${pill(v(row,'Status'))}</div><small>${esc(v(row,'Record Type'))} ${esc(v(row,'Record ID'))}</small></div>`).join(''):empty('No queued controlled actions.')}</div></section><section class="card span6"><h2>Approvals</h2><div class="list">${approvals.length?approvals.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Area'))}: ${esc(v(row,'Request'))}</strong>${pill(v(row,'Status')||'Open')}</div><small>${esc(v(row,'Record Type'))} ${esc(v(row,'Record ID'))} · decision ${esc(v(row,'Decision')||'not made')}</small></div>`).join(''):empty('No approval records.')}</div></section><section class="card span6"><h2>Backups</h2><div class="list">${backups.length?backups.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Backup Type'))}</strong>${pill(v(row,'Status'))}</div><small>${esc(v(row,'Scope'))} · requested ${dateTime(v(row,'Requested Time'))}</small></div>`).join(''):empty('No backup records.')}</div></section><section class="card span6"><h2>Proof Log</h2><div class="list">${proof.length?proof.slice(0,100).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Action','Action Type','actionType'))}</strong>${pill(v(row,'Outcome','Result','result'))}</div><small>${esc(v(row,'Record Type','Entity Type','entityType'))} ${esc(v(row,'Record ID','Entity ID','entityId'))} · ${esc(formatProofDetails(row))} · ${dateTime(v(row,'Timestamp','Created Time','createdAt'))}</small></div>`).join(''):empty('No proof events yet.')}</div></section><section class="card span6"><h2>Error Log</h2><div class="list">${errors.length?errors.slice(0,100).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Area'))}: ${esc(v(row,'Action'))}</strong>${pill(v(row,'Status')||'Open','bad')}</div><small>${esc(v(row,'Message'))} · ${dateTime(v(row,'Timestamp'))}</small></div>`).join(''):empty('No errors recorded.')}</div></section></div>`;
  bindForm('approvalForm',async(data,form)=>{const id=newId('APPROVAL'),record={'Approval ID':id,'Business ID':state.businessId,'Area':requireValue(data.area,'Area is required.'),'Record Type':data.recordType,'Record ID':data.recordId,'Request':requireValue(data.request,'Request is required.'),'Requested By':state.snapshot.user.userId,'Requested Time':now(),'Decision':'','Status':'Open','Created Time':now(),'Updated Time':now(),'Record Version':1};await saveParity('approvals','Approval',id,record,'approvals',['Approval ID']);form.reset();await sync(false);toast('Approval request saved. Nothing was approved automatically.');renderControls();});
  bindForm('backupForm',async(data,form)=>{const id=newId('BACKUP'),record={'Backup ID':id,'Business ID':state.businessId,'Backup Type':data.backupType,'Scope':data.scope,'Status':'Requested — Owner Review','Requested By':state.snapshot.user.userId,'Requested Time':now(),'Notes':data.notes,'Record Version':1};await saveParity('backups','Backup',id,record,'backups',['Backup ID']);form.reset();await sync(false);toast('Backup request recorded for owner review.');renderControls();});
}

function renderReports(){
  const invoices=records('invoices'),payments=records('payments'),expenses=records('expenses'),purchases=records('purchaseOrders'),payroll=records('payrollPeriods'),tax=records('taxPeriods'),missing=records('missingDocuments'),time=records('timeEntries'),reports=records('reports');
  const invoiced=invoices.reduce((sum,row)=>sum+num(v(row,'Total')),0),received=payments.reduce((sum,row)=>sum+num(v(row,'Amount')),0),spent=expenses.reduce((sum,row)=>sum+num(v(row,'Amount'))+num(v(row,'Tax')),0),committed=purchases.reduce((sum,row)=>sum+num(v(row,'Total')),0),payrollGross=payroll.reduce((sum,row)=>sum+num(v(row,'Gross Pay')),0),taxDue=tax.reduce((sum,row)=>sum+num(v(row,'Estimated Liability'))-num(v(row,'Payment Recorded')),0),hours=time.reduce((sum,row)=>sum+num(v(row,'Regular Hours','Hours','Duration Hours'))+num(v(row,'Overtime Hours')),0);
  $('mainContent').innerHTML=pageHead('Reports & Accountant Preparation','Review operational and financial summaries, then save controlled report snapshots for owner or accountant review.')+`<div class="grid"><section class="card"><div class="stats"><div class="stat"><strong>${money(invoiced)}</strong><span>Invoiced</span></div><div class="stat"><strong>${money(received)}</strong><span>Payments recorded</span></div><div class="stat"><strong>${money(spent)}</strong><span>Expenses</span></div><div class="stat"><strong>${money(invoiced-spent)}</strong><span>Preliminary margin</span></div></div></section><section class="card span4"><h2>Operations</h2><div class="list"><div class="row"><strong>${records('customers').length}</strong><small>Customers</small></div><div class="row"><strong>${records('jobs').length}</strong><small>Jobs</small></div><div class="row"><strong>${records('quotes').length}</strong><small>Quotes</small></div><div class="row"><strong>${hours.toFixed(1)}</strong><small>Recorded hours</small></div></div></section><section class="card span4"><h2>Accounting readiness</h2><div class="list"><div class="row"><strong>${money(committed)}</strong><small>Purchase commitments</small></div><div class="row"><strong>${money(payrollGross)}</strong><small>Prepared payroll gross</small></div><div class="row"><strong>${money(taxDue)}</strong><small>Estimated tax liability</small></div><div class="row"><strong>${missing.filter(row=>String(v(row,'Status')).toUpperCase()!=='COMPLETE').length}</strong><small>Missing documents</small></div></div></section><section class="card span4"><h2>Save report snapshot</h2><form id="reportForm"><label>Report type</label><select name="reportType"><option>Business Summary</option><option>Profit and Loss Preparation</option><option>Accounts Receivable</option><option>Payroll Preparation Summary</option><option>Tax Preparation Summary</option></select><div class="two"><div><label>Start</label><input name="periodStart" type="date"></div><div><label>End</label><input name="periodEnd" type="date"></div></div><label>Notes</label><textarea name="notes"></textarea><div class="actions"><button>Save snapshot</button></div></form></section><section class="card"><h2>Saved reports</h2><div class="list">${reports.length?reports.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Report Type'))}</strong>${pill(v(row,'Approval Status','Status'))}</div><small>${dateOnly(v(row,'Period Start'))}–${dateOnly(v(row,'Period End'))} · prepared ${dateTime(v(row,'Prepared Time'))}</small></div>`).join(''):empty('No saved report snapshots.')}</div>${serverSafeguard()}</section></div>`;
  bindForm('reportForm',async(data,form)=>{const id=newId('REPORT'),record={'Report ID':id,'Business ID':state.businessId,'Report Type':data.reportType,'Period Start':data.periodStart,'Period End':data.periodEnd,'Status':'Prepared','Approval Status':'Owner Review Required','Prepared By':state.snapshot.user.userId,'Prepared Time':now(),'Notes':`${data.notes||''}\nSnapshot: invoiced ${invoiced}; payments ${received}; expenses ${spent}; preliminary margin ${invoiced-spent}; payroll gross ${payrollGross}; tax liability ${taxDue}.`.trim(),'Record Version':1};await saveParity('reports','Report',id,record,'reports',['Report ID']);form.reset();await sync(false);toast('Report snapshot saved for review. Nothing filed or sent.');renderReports();});
}
