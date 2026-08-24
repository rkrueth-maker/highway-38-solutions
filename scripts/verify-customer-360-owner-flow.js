const assert=require('assert');
const C=require('../commercial-app/customer-360-authority.js');
const S={
 customers:[
  {'Customer ID':'C-JOHN','Customer Name':'Johnson','Email':'johnson@example.com'},
  {'Customer ID':'C-SMITH','Customer Name':'Smith','Phone':'555-0002'}
 ],
 properties:[
  {'Property ID':'P-JOHN','Customer ID':'C-JOHN','Property Name':'Home','Address':'129 Hwy 38, Grand Rapids, MN'},
  {'Property ID':'P-SMITH','Customer ID':'C-SMITH','Property Name':'Cabin','Address':'7 Pine Rd, Grand Rapids, MN'}
 ],
 requests:[{'Request ID':'R-JOHN','Customer ID':'C-JOHN','Subject':'Gutter repair request'}],
 jobs:[
  {'Job ID':'J-JOHN','Customer ID':'C-JOHN','Property ID':'P-JOHN','Project Title':'Gutter repair','Job Number':'H38-101'},
  {'Job ID':'J-SMITH','Customer ID':'C-SMITH','Property ID':'P-SMITH','Project Title':'Deck repair','Job Number':'H38-202'}
 ],
 quotes:[{'Quote ID':'Q-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Project Title':'Gutters','Quote Number':'Q-101'}],
 quoteRevisions:[{'Quote Revision ID':'QR-JOHN','Quote ID':'Q-JOHN','Revision':2}],
 siteCaptureSessions:[{'Site Visit ID':'SV-JOHN','Customer ID':'C-JOHN','Quote ID':'Q-JOHN','Project Title':'Gutter site visit'}],
 siteMeasurements:[{'Measurement ID':'M-JOHN','Site Visit ID':'SV-JOHN','Label':'gutter length','Value':'45 ft'}],
 documents:[{'Document ID':'D-JOHN','Source Type':'Quote','Source ID':'Q-JOHN','File Name':'gutter-before.jpg'}],
 checklists:[{'Checklist ID':'CL-JOHN','Job ID':'J-JOHN','Checklist Name':'Pre-job readiness'}],
 tasks:[{'Task ID':'T-JOHN','Job ID':'J-JOHN','Task Title':'Order gutter'}],
 meetings:[{'Meeting ID':'MT-JOHN','Customer ID':'C-JOHN','Title':'Follow-up conversation'}],
 followUps:[{'Follow-up ID':'F-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Title':'Call Johnson','Status':'Open'}],
 invoices:[{'Invoice ID':'I-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Invoice Number':'INV-101'}],
 payments:[{'Payment ID':'PAY-JOHN','Invoice ID':'I-JOHN','Amount':100}],
 expenses:[{'Expense ID':'E-PRIVATE','Job ID':'J-JOHN','Description':'internal material cost','Amount':999}],
 payroll:[{'id':'PAYROLL-PRIVATE','Job ID':'J-JOHN','Amount':888}],
 usageLogs:[{'Usage Log ID':'USE-1','metadata':'Johnson'}]
};
for(const q of ['Johnson','Johnsons','pull Johnson','job on hwy 38','129 highway 38','Gutter repair']){
 const r=C.resolveAssistantQuery(S,q);
 assert.equal(r.confident,true,`expected confident Johnson for ${q}: ${JSON.stringify(r.results?.map(x=>[x.customerId,x.score]))}`);
 assert.equal(r.customerId,'C-JOHN',q);
}
for(const q of ['Smith','Smiths','deck repair','7 pine road']){
 const r=C.resolveAssistantQuery(S,q);
 assert.equal(r.confident,true,`expected confident Smith for ${q}`);
 assert.equal(r.customerId,'C-SMITH',q);
}
const graph=C.buildGraph(S);
assert.equal(graph.customerIdFor('documents',S.documents[0]),'C-JOHN','document through quote source');
assert.equal(graph.customerIdFor('siteMeasurements',S.siteMeasurements[0]),'C-JOHN','measurement through site visit');
assert.equal(graph.customerIdFor('checklists',S.checklists[0]),'C-JOHN','checklist through job');
assert.equal(graph.customerIdFor('tasks',S.tasks[0]),'C-JOHN','task through job');
assert.equal(graph.customerIdFor('payments',S.payments[0]),'C-JOHN','payment through invoice');
const enriched=C.enrichSnapshot(S);
assert(enriched.enriched>=5,'expected derived customer IDs to be written into in-memory child records');
assert.equal(S.documents[0]['Customer ID'],'C-JOHN');
assert.equal(S.checklists[0]['Customer ID'],'C-JOHN');
const bundle=C.customerBundle(S,'C-JOHN');
for(const collection of ['properties','jobs','quotes','siteCaptureSessions','siteMeasurements','documents','checklists','tasks','meetings','followUps','invoices','payments'])assert(bundle.groups[collection]?.length,`missing ${collection}`);
assert(!bundle.groups.expenses,'internal expense must be excluded');
assert(!bundle.groups.payroll,'payroll must be excluded');
assert(!bundle.groups.usageLogs,'usage log must be excluded');
const op=C.enrichOperation(S,{action:'SAVE_ENTITY',payload:{entity:'documents',record:{'Document ID':'D-NEW','Quote ID':'Q-JOHN','File Name':'new.jpg'}}});
assert.equal(op.payload.record['Customer ID'],'C-JOHN','new child writes get customer id');
assert.equal(op.payload.customerId,'C-JOHN','operation receives customer id');
const historic={customers:[{'Customer ID':'C-HIST','Customer Name':'Historic Customer'}],portalMessages:[{'Portal Message ID':'PM-HIST','Customer ID':'C-HIST','Job ID':'J-DELETED','Body':'old customer update'}],checklists:[{'Checklist ID':'CL-HIST','Job ID':'J-DELETED','Checklist Name':'Old closeout'}]};
const hg=C.buildGraph(historic);
assert.equal(hg.customerIdFor('checklists',historic.checklists[0]),'C-HIST','orphaned historical job child recovered from unique customer evidence');
const summary=C.customerSummary(bundle);
assert(summary.includes('Johnson'));
assert(summary.includes('Internal cost, margin, purchasing, payroll and tax data are not included'));
console.log(JSON.stringify({status:'PASS',build:C.BUILD,queries:['Johnson','Johnsons','job on hwy 38','129 highway 38','Smiths'],derived:S.documents[0]['Customer Link Source'],excluded:['expenses','payroll','usageLogs'],summary},null,2));
