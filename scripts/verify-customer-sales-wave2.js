'use strict';
const assert=require('assert');
const S=require('../commercial-app/customer-sales-next.js');

const h38='B-H38', northern='B-NORTHERN';
const lead=S.lead({businessId:h38,leadId:'LEAD-1',name:'Pat Customer',email:'pat@example.com',phone:'218-555-1212',address:'123 Main St',source:'Website',leadOwner:'U-1',nextAction:'Call'});
assert.equal(lead.Status,'New Lead');
assert.throws(()=>S.transitionLead(lead,'Lost',{}),/Lost reason/);
const qualified=S.transitionLead(lead,'Qualified',{actorId:'U-1',nextAction:'Site visit'});
assert.equal(qualified.Status,'Qualified');
const lost=S.transitionLead(qualified,'Lost',{lostReason:'No budget'});
assert.equal(lost['Lost Reason'],'No budget');
const pipe=S.pipeline([lead,qualified,lost]);
assert.equal(pipe.counts['New Lead'],1);assert.equal(pipe.counts.Qualified,1);assert.equal(pipe.counts.Lost,1);

const customers=[{'Customer ID':'C-1','Business ID':h38,'Customer Name':'Pat Customer',Email:'pat@example.com',Phone:'2185551212','Service Address':'123 Main St'}];
const duplicate=S.conversionProposal(qualified,customers);
assert.equal(duplicate.action,'use-existing-customer');assert.equal(duplicate.duplicatePrevented,true);assert.equal(duplicate.customer['Customer ID'],'C-1');
const newLead=S.lead({businessId:h38,leadId:'LEAD-2',name:'New Person',email:'new@example.com',phone:'2185559999'});
const fresh=S.conversionProposal(newLead,customers);assert.equal(fresh.action,'create-customer-after-owner-confirmation');assert.equal(fresh.newCustomer['Business ID'],h38);

const msg=S.prepareMessage({businessId:h38,messageId:'M-1',customerId:'C-1',channel:'sms',kind:'appointment-confirmation',to:'2185551212',context:{customerName:'Pat',when:'Monday 8 AM',businessName:'Highway 38'}});
assert.equal(msg['Send Allowed'],false);assert.equal(msg['External Send Occurred'],false);assert.match(msg.Body,/Monday 8 AM/);

const snap={
 customers:[{'Customer ID':'C-1','Business ID':h38,'Customer Name':'Pat','Internal Note':'owner only','Owner Margin':0.45},{'Customer ID':'C-2','Business ID':h38,'Customer Name':'Other'}],
 jobs:[{'Job ID':'J-1','Customer ID':'C-1',Status:'Scheduled','Internal Notes':'secret'},{'Job ID':'J-2','Customer ID':'C-2',Status:'Scheduled'}],
 quotes:[{'Quote ID':'Q-1','Customer ID':'C-1',Total:1000,'Gross Margin':0.5},{'Quote ID':'Q-2','Customer ID':'C-2',Total:900}],
 invoices:[{'Invoice ID':'I-1','Customer ID':'C-1',Balance:500},{'Invoice ID':'I-2','Customer ID':'C-2',Balance:100}],
 documents:[{'Document ID':'D-1','Customer ID':'C-1','Approved to Share':true,Visibility:'Customer Released'},{'Document ID':'D-2','Customer ID':'C-1',Visibility:'Internal'},{'Document ID':'D-3','Customer ID':'C-2','Approved to Share':true}],
 messages:[{'Message ID':'MSG-1','Customer ID':'C-1',Visibility:'Customer',Body:'hello'},{'Message ID':'MSG-2','Customer ID':'C-1',Visibility:'Internal',Body:'secret'}],
 proofLog:[{customerId:'C-1',secret:'proof'}],bankAccounts:[{'Business ID':h38,'Account Name':'Operating'}],vendorBills:[{'Customer ID':'C-1',Total:999}],payrollPreparations:[{'Business ID':h38,'Gross Pay':1234}]
};
const portal=S.portalProjection(snap,'C-1');
assert.equal(portal.collections.customers.length,1);assert.equal(portal.collections.jobs.length,1);assert.equal(portal.collections.quotes.length,1);assert.equal(portal.collections.invoices.length,1);assert.equal(portal.collections.documents.length,1);assert.equal(portal.collections.messages.length,1);
assert(!('proofLog' in portal.collections));assert(!('bankAccounts' in portal.collections));assert(!('vendorBills' in portal.collections));assert(!('payrollPreparations' in portal.collections));
assert(!('Internal Note' in portal.collections.customers[0]));assert(!('Owner Margin' in portal.collections.customers[0]));assert(!('Gross Margin' in portal.collections.quotes[0]));
assert.equal(portal.collections.customers[0]['Customer ID'],'C-1');

const sig=S.signatureEvidence({businessId:h38,signatureId:'SIG-1',customerId:'C-1',documentId:'Q-1',documentType:'Quote',revision:'3',signerName:'Pat Customer',signerEmail:'pat@example.com',signatureDataRef:'blob://signature-1',ipAddress:'192.0.2.1',device:'iPhone'});
assert.equal(sig['Document Revision'],'3');assert.equal(sig['Audit Evidence'],true);assert.equal(sig['Business ID'],h38);
const decision=S.quoteDecision({businessId:h38,customerId:'C-1',quoteId:'Q-1',revision:'3',decision:'Approved',signatureId:'SIG-1'});assert.equal(decision.Decision,'Approved');
assert.throws(()=>S.quoteDecision({businessId:h38,customerId:'C-1',quoteId:'Q-1',revision:'3',decision:'Approved'}),/signature evidence/i);

const change=S.changeOrder({businessId:h38,changeOrderId:'CO-1',customerId:'C-1',jobId:'J-1',quoteId:'Q-1',reason:'Hidden rot',description:'Replace damaged framing',priceChange:350,currentContractAmount:2000,scheduleImpact:'Add one day'});
assert.equal(change['New Contract Amount'],2350);assert.equal(change.Status,'Pending Customer Approval');
const revised=S.reviseChangeOrder(change,{priceChange:425,description:'Replace framing and sheathing'});assert.equal(revised.Revision,2);assert.equal(revised['New Contract Amount'],2425);
const approved=S.approveChangeOrder(revised,{signatureId:'SIG-CO-1'});assert.equal(approved.Status,'Approved');assert.equal(S.changeOrderImpact(approved).requiresCustomerApproval,false);
assert.throws(()=>S.reviseChangeOrder(approved,{priceChange:500}),/new revision record/i);

const northernMsg=S.prepareMessage({businessId:northern,customerId:'N-C1',kind:'custom',channel:'email',to:'north@example.com',body:'Northern test'});assert.equal(northernMsg['Business ID'],northern);assert.equal(northernMsg['External Send Occurred'],false);

console.log('Customer / sales Wave 2 engine acceptance complete.');
