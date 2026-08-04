/** Additive parity records for the replacement Commercial Business Office. */
var CB_PARITY_HEADERS=Object.freeze({
  employees:['Employee ID','Business ID','User ID','Display Name','Email','Employment Type','Pay Type','Hourly Rate','Salary Rate','Overtime Multiplier','Crew','Status','Start Date','End Date','Notes','Created Time','Updated Time','Record Version'],
  vendors:['Vendor ID','Business ID','Vendor Name','Contact Name','Email','Phone','Category','Tax ID Last Four','Payment Terms','Status','Notes','Created Time','Updated Time','Record Version'],
  purchaseOrders:['Purchase Order ID','Business ID','Vendor ID','Job ID','Location ID','Order Number','Order Date','Expected Date','Description','Subtotal','Tax','Total','Status','Approval Status','Approved By','Created By','Created Time','Updated Time','Record Version'],
  accountingPeriods:['Accounting Period ID','Business ID','Period Name','Period Start','Period End','Status','Review Status','Missing Documents','Prepared By','Created Time','Updated Time','Record Version'],
  payrollPeriods:['Payroll Period ID','Business ID','Period Start','Period End','Pay Date','Provider','Status','Approval Status','Export Allowed','Gross Pay','Deductions','Prepared Net Amount','Employer Tax Estimate','Employer Cost Estimate','Created By','Created Time','Updated Time','Record Version'],
  payrollLines:['Payroll Line ID','Business ID','Payroll Period ID','Employee ID','Regular Hours','Overtime Hours','Regular Pay','Overtime Pay','Salary Pay','Reimbursements','Other Pay','Gross Pay','Deductions','Prepared Net Amount','Employer Tax Estimate','Employer Cost Estimate','Approval Status','Notes','Created Time','Updated Time','Record Version'],
  payrollDeductions:['Payroll Deduction ID','Business ID','Employee ID','Payroll Period ID','Description','Amount','Status','Created Time','Updated Time','Record Version'],
  taxPeriods:['Tax Period ID','Business ID','Tax Type','Jurisdiction','Period Start','Period End','Due Date','Status','Approval Status','Finalization Allowed','Taxable Sales','Exempt Sales','Tax Collected','Tax Adjustments','Estimated Liability','Payment Recorded','Missing Documents','Created By','Created Time','Updated Time','Record Version'],
  missingDocuments:['Missing Document ID','Business ID','Area','Period ID','Document Type','Description','Requested From','Due Date','Status','Notes','Created Time','Updated Time','Record Version'],
  approvals:['Approval ID','Business ID','Area','Record Type','Record ID','Approval Type','Request','Requested By','Requested Time','Decision','Decided By','Decided Time','Status','Notes','Created Time','Updated Time','Record Version'],
  backups:['Backup ID','Business ID','Backup Type','Scope','Status','Requested By','Requested Time','Completed Time','File ID','Notes','Record Version'],
  reports:['Report ID','Business ID','Report Type','Period Start','Period End','Status','Approval Status','File ID','Prepared By','Prepared Time','Notes','Record Version']
});
var CB_PARITY_ENTITY_REGISTRY=Object.freeze({
  employees:{book:'core',sheet:'employees',id:'Employee ID',prefix:'EMPLOYEE',capability:'manageUsers'},
  vendors:{book:'inventory',sheet:'vendors',id:'Vendor ID',prefix:'VENDOR',capability:'manageFinancial'},
  purchaseOrders:{book:'inventory',sheet:'purchaseOrders',id:'Purchase Order ID',prefix:'PURCHASE',capability:'manageFinancial'},
  accountingPeriods:{book:'core',sheet:'accountingPeriods',id:'Accounting Period ID',prefix:'ACCOUNTING',capability:'manageFinancial'},
  payrollPeriods:{book:'core',sheet:'payrollPeriods',id:'Payroll Period ID',prefix:'PAYROLL',capability:'manageFinancial'},
  payrollLines:{book:'core',sheet:'payrollLines',id:'Payroll Line ID',prefix:'PAYLINE',capability:'manageFinancial'},
  payrollDeductions:{book:'core',sheet:'payrollDeductions',id:'Payroll Deduction ID',prefix:'DEDUCTION',capability:'manageFinancial'},
  taxPeriods:{book:'core',sheet:'taxPeriods',id:'Tax Period ID',prefix:'TAX',capability:'manageFinancial'},
  missingDocuments:{book:'core',sheet:'missingDocuments',id:'Missing Document ID',prefix:'MISSING',capability:'manageFinancial'},
  approvals:{book:'core',sheet:'approvals',id:'Approval ID',prefix:'APPROVAL',capability:'manageSettings'},
  backups:{book:'core',sheet:'backups',id:'Backup ID',prefix:'BACKUP',capability:'manageSettings'},
  reports:{book:'core',sheet:'reports',id:'Report ID',prefix:'REPORT',capability:'manageFinancial'}
});
function cbCompletionEnsureParitySchema_(context){
  ['employees','accountingPeriods','payrollPeriods','payrollLines','payrollDeductions','taxPeriods','missingDocuments','approvals','backups','reports'].forEach(function(name){cbPlatformEnsureHeaders_(context.core,name,CB_PARITY_HEADERS[name]);});
  cbPlatformEnsureHeaders_(context.inventory,'vendors',CB_PARITY_HEADERS.vendors);
  cbPlatformEnsureHeaders_(context.inventory,'purchaseOrders',CB_PARITY_HEADERS.purchaseOrders);
}
function cbCompletionControlRows_(sheetName,businessId,limit){
  return cbRows_(cbControlSpreadsheet_(),sheetName).filter(function(row){return !row['Business ID']||row['Business ID']===businessId;}).slice().reverse().slice(0,Math.max(1,Math.min(Number(limit||500),1000)));
}
function cbCompletionProofRows_(context){
  var businessId=context.row['Business ID'],control=cbCompletionControlRows_(CB_CONTROL_SHEETS.AUDIT,businessId,800).map(function(row){return{'Proof ID':row['Audit Event ID'],'Business ID':row['Business ID'],'Action':row.Action,'Record Type':row['Record Type'],'Record ID':row['Record ID'],'Outcome':row.Result,'Details':row.Details,'User Email':row['User Email'],'Timestamp':row.Timestamp,'Record Version':1};});
  var local=cbCompletionListRows_(context,'core','audit',800).map(function(row){return{'Proof ID':row['Audit Event ID'],'Business ID':row['Business ID'],'Action':row.Action,'Record Type':row['Record Type'],'Record ID':row['Record ID'],'Outcome':row.Result,'Details':row.Details,'User Email':row['User ID'],'Timestamp':row.Timestamp,'Record Version':1};});
  return control.concat(local).slice(0,1000);
}
function cbCompletionErrorRows_(context){
  var businessId=context.row['Business ID'],control=cbCompletionControlRows_(CB_CONTROL_SHEETS.ERRORS,businessId,800).map(function(row){return{'Error ID':row['Error Event ID'],'Business ID':row['Business ID'],'Area':'Commercial Office','Action':row.Action,'Message':row.Message,'Details':row.Stack,'Status':'Open','User Email':row['User Email'],'Timestamp':row.Timestamp,'Resolved Time':'','Record Version':1};});
  var local=cbCompletionListRows_(context,'core','errors',800).map(function(row){return{'Error ID':row['Error Event ID'],'Business ID':row['Business ID'],'Area':'Business Records','Action':row.Action,'Message':row.Message,'Details':row.Stack,'Status':'Open','User Email':row['User ID'],'Timestamp':row.Timestamp,'Resolved Time':'','Record Version':1};});
  return control.concat(local).slice(0,1000);
}
function cbCompletionParityData_(context){
  cbCompletionEnsureParitySchema_(context);
  var owner=context.user.owner===true,canPeople=owner||cbCompletionCan_(context.user,'manageUsers')||cbCompletionCan_(context.user,'manageField'),canFinancial=owner||cbCompletionCan_(context.user,'manageFinancial')||cbCompletionCan_(context.user,'viewFinancial'),canControl=owner||cbCompletionCan_(context.user,'manageSettings');
  return {
    employees:canPeople?cbCompletionListRows_(context,'core','employees',500):[],
    vendors:canFinancial?cbCompletionListRows_(context,'inventory','vendors',500):[],
    purchaseOrders:canFinancial?cbCompletionListRows_(context,'inventory','purchaseOrders',500):[],
    receipts:canFinancial?cbCompletionListRows_(context,'inventory','receipts',500):[],
    accountingPeriods:canFinancial?cbCompletionListRows_(context,'core','accountingPeriods',200):[],
    payrollPeriods:canFinancial?cbCompletionListRows_(context,'core','payrollPeriods',200):[],
    payrollLines:canFinancial?cbCompletionListRows_(context,'core','payrollLines',1000):[],
    payrollDeductions:canFinancial?cbCompletionListRows_(context,'core','payrollDeductions',500):[],
    taxPeriods:canFinancial?cbCompletionListRows_(context,'core','taxPeriods',300):[],
    missingDocuments:canFinancial?cbCompletionListRows_(context,'core','missingDocuments',500):[],
    approvals:canControl?cbCompletionListRows_(context,'core','approvals',500):[],
    proofLog:canControl?cbCompletionProofRows_(context):[],
    errorLog:canControl?cbCompletionErrorRows_(context):[],
    backups:canControl?cbCompletionListRows_(context,'core','backups',300):[],
    reports:canFinancial?cbCompletionListRows_(context,'core','reports',300):[]
  };
}
function cbCompletionSaveParityEntity_(request){
  var input=request||{},key=cbText_(input.entityKey),entity=CB_PARITY_ENTITY_REGISTRY[key];cbAssert_(entity,'Unsupported parity record type.');
  var context=cbCompletionContext_(input.businessId,entity.capability);cbCompletionEnsureParitySchema_(context);
  var result=cbCompletionUpsert_(context,entity.book,entity.sheet,entity.id,entity.prefix,input.record||{},input);
  if(result.status==='PASS')cbAudit_(context.row['Business ID'],'SAVE '+entity.sheet.toUpperCase(),entity.sheet,result.recordId,'PASS','Record saved through the replacement Office parity service.');
  return result;
}
