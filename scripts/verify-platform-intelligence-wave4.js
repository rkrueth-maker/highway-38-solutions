'use strict';
const assert=require('assert');
const W=require('../commercial-app/platform-intelligence-wave4.js');
const H='BIZ-H38',N='BIZ-NORTH',today=new Date('2026-09-27T12:00:00Z');
const snapshot={
 invoices:[
  {'Invoice ID':'INV-H1','Business ID':H,'Job ID':'J1',Total:1000,'Paid Amount':200,'Due Date':'2026-09-20',Status:'Sent'},
  {'Invoice ID':'INV-N1','Business ID':N,Total:9000,'Paid Amount':0,'Due Date':'2026-09-01',Status:'Sent'}
 ],
 payments:[{'Payment ID':'PAY-H1','Business ID':H,Amount:200,Status:'Recorded'}],
 vendorBills:[
  {'Vendor Bill ID':'BILL-H1','Business ID':H,'Vendor ID':'V1','Vendor Name':'Parts Co',Amount:250,'Due Date':'2026-09-28',Status:'Approved'},
  {'Vendor Bill ID':'BILL-N1','Business ID':N,Amount:7000,'Due Date':'2026-09-28',Status:'Approved'}
 ],
 expenses:[{'Expense ID':'EXP-H1','Business ID':H,'Job ID':'J1',Amount:1200,Status:'Recorded'}],
 bankAccounts:[{'Account ID':'BANK-H1','Business ID':H,Type:'Checking','Available Balance':2000}],
 bankTransactions:[{'Transaction ID':'TX-H1','Business ID':H,Amount:25,'Reconciliation Status':'Unreconciled'}],
 payrollPreparations:[{'Payroll Preparation ID':'PR-H1','Business ID':H,'Gross Pay':100,Status:'Prepared'}],
 jobs:[{'Job ID':'J1','Business ID':H,Status:'Open'},{'Job ID':'JN1','Business ID':N,Status:'Open'}],
 jobPhotos:[],
 changeOrders:[{'Change Order ID':'CO-H1','Business ID':H,Status:'Pending customer approval'}],
 recurringBills:[
  {'Bill ID':'R1','Business ID':H,'Vendor ID':'SUB1',Recurring:true,Amount:100,Date:'2026-08-01'},
  {'Bill ID':'R2','Business ID':H,'Vendor ID':'SUB1',Recurring:true,Amount:120,Date:'2026-09-01'}
 ],
 quotes:[{'Quote ID':'Q1','Business ID':H,Status:'Sent'},{'Quote ID':'Q2','Business ID':H,Status:'Accepted'}],
 customers:[{'Customer ID':'C1','Business ID':H},{'Customer ID':'CN','Business ID':N}],
 approvalRequests:[{'id':'APR-H1','Business ID':H,Status:'Pending review'}],
 integrationStates:[
  {'Business ID':H,Provider:'quickbooks',Status:'Connected',Connected:true,'Last Sync':'2026-09-27T11:00:00Z',AccessToken:'DO-NOT-EXPOSE'},
  {'Business ID':N,Provider:'quickbooks',Status:'Connected',Connected:true,AccessToken:'NORTH-SECRET'}
 ]
};
assert.equal(W.overdueInvoices(snapshot,H,today).length,1,'H38 overdue invoices stay tenant-scoped');
assert.equal(W.overdueInvoices(snapshot,H,today)[0].row['Invoice ID'],'INV-H1');
assert.equal(W.billsDue(snapshot,H,today,7).length,1,'H38 bills due stay tenant-scoped');
assert.equal(W.unreconciled(snapshot,H).length,1);
assert.equal(W.missingReceipts(snapshot,H).length,1);
assert.equal(W.unsignedChangeOrders(snapshot,H).length,1);
const cash=W.cashScenario(snapshot,H,{today,days:7});
assert.equal(cash.knownCash,true);assert.equal(cash.cashOnHand,2000);assert.equal(cash.dueBills,250);assert.equal(cash.payrollObligations,100);assert.equal(cash.guaranteed,false,'cash scenario must be explicitly non-guaranteed');
const noBank=W.cashScenario({...snapshot,bankAccounts:[]},H,{today,days:7});assert.equal(noBank.knownCash,false);assert.equal(noBank.projectedAvailable,null,'Office cannot invent cash availability without recorded balances');
const report=W.reportPack(snapshot,H,{today});assert.equal(report.summary.accountsReceivable,800);assert.equal(report.summary.accountsPayable,250);assert.equal(report.summary.customers,1,'report must not count Northern customer');assert.equal(report.drilldowns.jobsLosingMoney.includes('J1'),true);
const brief=W.ownerBrief(snapshot,H,{today});assert.equal(brief.counts.overdueInvoices,1);assert.equal(brief.counts.recurringExpenseIncreases,1);assert.equal(brief.paymentReview.ownerApprovalRequired,true);assert.equal(brief.paymentReview.items[0].automaticPayment,false);
const ask=W.assistantPlan('What bills should I pay this week?',snapshot,H,{today});assert.equal(ask.intent,'bills-to-pay');assert.equal(ask.executionMode,'PREVIEW_ONLY');assert.equal(ask.externalActionOccurred,false);assert.equal(ask.ownerApprovalRequired,true);
const risky=W.automationRule({businessId:H,trigger:'invoice overdue',action:'send customer email',mode:'automatic'});assert.equal(risky['Execution Mode'],'approval','high-impact automation must be coerced to approval');assert.equal(W.evaluateAutomation(risky,{type:'invoice overdue'}).automaticExecutionAllowed,false);
const safe=W.automationRule({businessId:H,trigger:'job completed',action:'prepare internal draft',mode:'automatic'});assert.equal(safe['Execution Mode'],'automatic');assert.equal(W.evaluateAutomation(safe,{type:'job completed'}).automaticExecutionAllowed,true,'low-impact internal automation may be automatic');
const clean=W.sanitizeIntegration({Provider:'quickbooks',Status:'Connected',AccessToken:'SECRET',apiKey:'SECRET2',lastSync:'now'});assert.equal(clean.AccessToken,undefined);assert.equal(clean.apiKey,undefined);assert.equal(clean.lastSync,'now');
const integrations=W.integrationCenter(snapshot,H),qb=integrations.find(x=>x.provider==='quickbooks'),bouncie=integrations.find(x=>x.provider==='bouncie');assert.equal(qb.connected,true);assert.equal(qb.secretsExposed,false);assert.equal(bouncie.status,'EXTERNAL_GATE');assert.equal(bouncie.externalGate,true,'missing live integration must stay an external gate');
assert.equal(W.approvalQueue(snapshot,H).some(x=>x.id==='APR-H1'),true);
assert.equal(W.overdueInvoices(snapshot,N,today).length,1);assert.equal(W.overdueInvoices(snapshot,N,today)[0].row['Invoice ID'],'INV-N1','Northern tenant must remain independently scoped');
console.log('Platform Intelligence Wave 4 engine acceptance complete.');