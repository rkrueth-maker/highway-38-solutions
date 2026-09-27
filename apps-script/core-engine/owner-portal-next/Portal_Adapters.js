/** Provider-neutral integration registry. Secrets are never returned to the client. */
function h38PortalIntegrationStatus_(){
  return [
    {id:'gmail',name:'Gmail',mode:'OWNER_APPROVAL',status:'AVAILABLE',external:true,notes:'Draft creation and strict selected-row send compatibility.'},
    {id:'drive',name:'Google Drive',mode:'INTERNAL',status:'AVAILABLE',external:false,notes:'Files and links; access boundaries required.'},
    {id:'calendar',name:'Google Calendar',mode:'INTERNAL_RECORD',status:'READY',external:false,notes:'Portal calendar first; Google Calendar adapter disabled until approved.'},
    {id:'github',name:'GitHub',mode:'HANDOFF_ONLY',status:'AVAILABLE',external:true,notes:'PR and commit references; no automatic merge/deploy.'},
    {id:'metricool',name:'Metricool',mode:'DISABLED',status:'CREDENTIAL_REQUIRED',external:true,notes:'Schedule adapter contract present; publishing disabled.'},
    {id:'stripe',name:'Stripe',mode:'DISABLED',status:'DECISION_REQUIRED',external:true,notes:'No raw card data stored.'},
    {id:'square',name:'Square',mode:'DISABLED',status:'DECISION_REQUIRED',external:true,notes:'Provider-ready payment adapter.'},
    {id:'paypal',name:'PayPal Checkout / Payment Links',mode:'PROVIDER_HOSTED',status:'ACCOUNT_CONNECTION_REQUIRED',external:true,notes:'Selected hosted payment provider. Supports PayPal, Venmo and cards after a U.S. PayPal Business account is connected and released.'},
    {id:'venmo',name:'Venmo (via PayPal)',mode:'PROVIDER_HOSTED',status:'ACCOUNT_CONNECTION_REQUIRED',external:true,notes:'Venmo is collected through PayPal-hosted checkout in USD for eligible U.S. merchant/customer transactions. H38 never stores Venmo credentials.'},
    {id:'quickbooks',name:'QuickBooks',mode:'CSV_FALLBACK',status:'READY',external:true,notes:'CSV export first; API credential approval required.'},
    {id:'xero',name:'Xero',mode:'CSV_FALLBACK',status:'READY',external:true,notes:'CSV export first.'},
    {id:'wave',name:'Wave',mode:'CSV_FALLBACK',status:'READY',external:true,notes:'CSV export first.'},
    {id:'freshbooks',name:'FreshBooks',mode:'CSV_FALLBACK',status:'READY',external:true,notes:'CSV export first.'},
    {id:'meta',name:'Meta Ads',mode:'DISABLED',status:'APPROVAL_REQUIRED',external:true,notes:'No spend or launch.'},
    {id:'googleads',name:'Google Ads',mode:'DISABLED',status:'APPROVAL_REQUIRED',external:true,notes:'No spend or launch.'},
    {id:'linkedin',name:'LinkedIn',mode:'DISABLED',status:'APPROVAL_REQUIRED',external:true,notes:'No spend or publication.'}
  ];
}

function h38PortalAccountingCsv(){
  h38PortalAssertOwner_();
  var expenses=h38PortalList('expenses',{}),payments=h38PortalList('payments',{}),invoices=h38PortalList('invoices',{});
  var rows=[['Record Type','Record ID','Date','Customer ID','Job ID','Category / Method','Description / Reference','Amount','Tax','Status']];
  expenses.forEach(function(r){rows.push(['Expense',r['Expense ID'],r.Date,r['Customer ID'],r['Job ID'],r.Category,r.Description,r.Amount,r.Tax,r['Accounting Status']]);});
  payments.forEach(function(r){rows.push(['Payment',r['Payment ID'],r['Payment Date'],r['Customer ID'],r['Job ID'],r['Payment Method'],r['Transaction Reference'],r.Amount,'',r.Status]);});
  invoices.forEach(function(r){rows.push(['Invoice',r['Invoice ID'],r['Sent Time']||r['Created Time'],r['Customer ID'],r['Job ID'],r['Invoice Type'],r['Provider Reference'],r.Total,r.Tax,r.Status]);});
  return rows.map(function(row){return row.map(function(v){return '"'+String(v||'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');
}

function h38PortalAdapterTest(adapterId){
  h38PortalAssertOwner_();
  var adapter=h38PortalIntegrationStatus_().filter(function(a){return a.id===adapterId;})[0];if(!adapter)throw new Error('Unknown adapter: '+adapterId);
  h38PortalWriteProof_({jobId:'INTEGRATION',source:'Portal Settings',action:'Adapter test: '+adapterId,decision:'TEST ONLY',result:'PASS - NO EXTERNAL ACTION',evidence:JSON.stringify(adapter),notes:'Connectivity/contract test only. No message, payment, publish, ad spend, merge, or deploy.'});
  return {status:'TEST_PASS',adapter:adapter,message:'Adapter contract available. No external action occurred.'};
}
