/** Additive parity records for the replacement Commercial Business Office. */
var CB_PARITY_HEADERS=Object.freeze({
  employees:['Employee ID','Business ID','User ID','Display Name','Email','Employment Type','Pay Type','Hourly Rate','Salary Rate','Overtime Multiplier','Crew','Status','Start Date','End Date','Notes','Created Time','Updated Time','Record Version'],
  vendors:['Vendor ID','Business ID','Vendor Name','Contact Name','Email','Phone','Category','Tax ID Last Four','Payment Terms','Status','Notes','Created Time','Updated Time','Record Version'],
  purchaseOrders:['Purchase Order ID','Business ID','Vendor ID','Job ID','Order Number','Order Date','Expected Date','Description','Subtotal','Tax','Total','Status','Approval Status','Created By','Created Time','Updated Time','Record Version'],
  accountingPeriods:['Accounting Period ID','Business ID','Period Name','Period Start','Period End','Status','Review Status','Missing Documents','Prepared By','Created Time','Updated Time','Record Version'],
  payrollPeriods:['Payroll Period ID','Business ID','Period Start','Period End','Pay Date','Provider','Status','Approval Status','Export Allowed','Gross Pay','Deductions','Prepared Net Amount','Employer Tax Estimate','Employer Cost Estimate','Created By','Created Time','Updated Time','Record Version'],
  payrollLines:['Payroll Line ID','Business ID','Payroll Period ID','Employee ID','Regular Hours','Overtime Hours','Regular Pay','Overtime Pay','Salary Pay','Reimbursements','Other Pay','Gross Pay','Deductions','Prepared Net Amount','Employer Tax Estimate','Employer Cost Estimate','Approval Status','Notes','Created Time','Updated Time','Record Version'],
  payrollDeductions:['Payroll Deduction ID','Business ID','Employee ID','Payroll Period ID','Description','Amount','Status','Created Time','Updated Time','Record Version'],
  taxPeriods:['Tax Period ID','Business ID','Tax Type','Jurisdiction','Period Start','Period End','Due Date','Status','Approval Status','Finalization Allowed','Taxable Sales','Exempt Sales','Tax Collected','Tax Adjustments','Estimated Liability','Payment Recorded','Missing Documents','Created By','Created Time','Updated Time','Record Version'],
  missingDocuments:['Missing Document ID','Business ID','Area','Period ID','Document Type','Description','Requested From','Due Date','Status','Notes','Created Time','Updated Time','Record Version'],
  approvals:['Approval ID','Business ID','Area','Record Type','Record ID','Request','Requested By','Requested Time','Decision','Decision By','Decision Time','Status','Notes','Created Time','Updated Time','Record Version'],
  proofLog:['Proof ID','Business ID','Action','Record Type','Record ID','Outcome','Details','User Email','Timestamp','Record Version'],
  errorLog:['Error ID','Business ID','Area','Action','Message','Details','Status','User Email','Timestamp','Resolved Time','Record Version'],
  backups:['Backup ID','Business ID','Backup Type','Scope','Status','Requested By','Requested Time','Completed Time','File ID','Notes','Record Version'],
  reports:['Report ID','Business ID','Report Type','Period Start','Period End','Status','Approval Status','File ID','Prepared By','Prepared Time','Notes','Record Version']
});
var CB_PARITY_ENTITY_REGISTRY=Object.freeze({
  employees:{sheet:'employees',id:'Employee ID',prefix:'EMPLOYEE',capability:'manageUsers'},
  vendors:{sheet:'vendors',id:'Vendor ID',prefix:'VENDOR',capability:'manageFinancial'},
  purchaseOrders:{sheet:'purchaseOrders',id:'Purchase Order ID',prefix:'PURCHASE',capability:'manageFinancial'},
  accountingPeriods:{sheet:'accountingPeriods',id:'Accounting Period ID',prefix:'ACCOUNTING',capability:'manageFinancial'},
  payrollPeriods:{sheet:'payrollPeriods',id:'Payroll Period ID',prefix:'PAYROLL',capability:'manageFinancial'},
  payrollLines:{sheet:'payrollLines',id:'Payroll Line ID',prefix:'PAYLINE',capability:'manageFinancial'},
  payrollDeductions:{sheet:'payrollDeductions',id:'Payroll Deduction ID',prefix:'DEDUCTION',capability:'manageFinancial'},
  taxPeriods:{sheet:'taxPeriods',id:'Tax Period ID',prefix:'TAX',capability:'manageFinancial'},
  missingDocuments:{sheet:'missingDocuments',id:'Missing Document ID',prefix:'MISSING',capability:'manageFinancial'},
  approvals:{sheet:'approvals',id:'Approval ID',prefix:'APPROVAL',capability:'manageSettings'},
  backups:{sheet:'backups',id:'Backup ID',prefix:'BACKUP',capability:'manageSettings'},
  reports:{sheet:'reports',id:'Report ID',prefix:'REPORT',capability:'manageFinancial'}
});
function cbCompletionEnsureParitySchema_(context){
  Object.keys(CB_PARITY_HEADERS).forEach(function(name){cbPlatformEnsureHeaders_(context.core,name,CB_PARITY_HEADERS[name]);});
}
function cbCompletionParityData_(context){
  cbCompletionEnsureParitySchema_(context);
  var owner=context.user.owner===true,canPeople=owner||cbCompletionCan_(context.user,'manageUsers')||cbCompletionCan_(context.user,'manageField'),canFinancial=owner||cbCompletionCan_(context.user,'manageFinancial')||cbCompletionCan_(context.user,'viewFinancial'),canControl=owner||cbCompletionCan_(context.user,'manageSettings');
  return {
    employees:canPeople?cbCompletionListRows_(context,'core','employees',500):[],
    vendors:canFinancial?cbCompletionListRows_(context,'core','vendors',500):[],
    purchaseOrders:canFinancial?cbCompletionListRows_(context,'core','purchaseOrders',500):[],
    accountingPeriods:canFinancial?cbCompletionListRows_(context,'core','accountingPeriods',200):[],
    payrollPeriods:canFinancial?cbCompletionListRows_(context,'core','payrollPeriods',200):[],
    payrollLines:canFinancial?cbCompletionListRows_(context,'core','payrollLines',1000):[],
    payrollDeductions:canFinancial?cbCompletionListRows_(context,'core','payrollDeductions',500):[],
    taxPeriods:canFinancial?cbCompletionListRows_(context,'core','taxPeriods',300):[],
    missingDocuments:canFinancial?cbCompletionListRows_(context,'core','missingDocuments',500):[],
    approvals:canControl?cbCompletionListRows_(context,'core','approvals',500):[],
    proofLog:canControl?cbCompletionListRows_(context,'core','proofLog',1000):[],
    errorLog:canControl?cbCompletionListRows_(context,'core','errorLog',1000):[],
    backups:canControl?cbCompletionListRows_(context,'core','backups',300):[],
    reports:canFinancial?cbCompletionListRows_(context,'core','reports',300):[]
  };
}
function cbCompletionSaveParityEntity_(request){
  var input=request||{},key=cbText_(input.entityKey),entity=CB_PARITY_ENTITY_REGISTRY[key];cbAssert_(entity,'Unsupported parity record type.');
  var context=cbCompletionContext_(input.businessId,entity.capability);cbCompletionEnsureParitySchema_(context);
  var result=cbCompletionUpsert_(context,'core',entity.sheet,entity.id,entity.prefix,input.record||{},input);
  if(result.status==='PASS')cbAudit_(context.row['Business ID'],'SAVE '+entity.sheet.toUpperCase(),entity.sheet,result.recordId,'PASS','Record saved through the replacement Office parity service.');
  return result;
}
