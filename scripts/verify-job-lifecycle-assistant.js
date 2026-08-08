const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const life=read('commercial-app/job-lifecycle.js');
const loader=read('commercial-app/supabase-no-legacy-office.js');
const sw=read('commercial-app/service-worker.js');
const polish=read('commercial-app/office-polish.js');
const polishCss=read('commercial-app/office-polish.css');

function must(condition,message){
  if(!condition)throw new Error(message);
}

new Function(life);
new Function(loader);
new Function(sw);
new Function(polish);

[
  "'SITE_VISIT','Site Visit'",
  "'ESTIMATE','Estimate'",
  "'PROPOSAL','Proposal'",
  "'APPROVAL','Approval'",
  "'SCHEDULE','Schedule'",
  "'PREJOB','Pre-job'",
  "'WORK','Work'",
  "'QUALITY','Quality Check'",
  "'INVOICE','Invoice'",
  "'PAYMENT','Payment'",
  "'CLOSEOUT','Closeout'",
  "'WARRANTY','Warranty / Follow-up'"
].forEach(marker=>must(life.includes(marker),`Missing lifecycle stage: ${marker}`));

[
  'requiredChecklists:true',
  'completionGates:true',
  'changeOrders:true',
  'jobCosting:true',
  'followUpQueue:true',
  'receiptCapture:true',
  'mileage:true',
  'portalStaging:true',
  'recurringWork:true',
  'globalSearch:true',
  'assistantContext:true'
].forEach(marker=>must(life.includes(marker),`Missing lifecycle capability: ${marker}`));

must(life.includes('Labor hours exist but no labor cost is stored. H38 will not invent a labor rate.'),'Labor-cost no-guess safeguard missing.');
must(life.includes('Draft — Owner Review Required'),'Change order owner-review state missing.');
must(life.includes('Draft — Customer Release Required'),'Portal customer-release gate missing.');
must(life.includes('automaticCustomerSending:false'),'Automatic customer sending must remain disabled.');
must(life.includes('automaticApproval:false'),'Automatic approval must remain disabled.');
must(life.includes('automaticPurchasing:false'),'Automatic purchasing must remain disabled.');
must(life.includes('automaticPayment:false'),'Automatic payment must remain disabled.');
must(life.includes('Job cannot be marked'),'Completion blocker is missing.');
must(life.includes('SAVE_ENTITY'),'Tenant-scoped generic entity save path is missing.');
must(loader.includes('job-lifecycle.js?build=20260807-2225'),'Supported Office does not load lifecycle JS.');
must(loader.includes('job-lifecycle.css?build=20260807-2225'),'Supported Office does not load lifecycle CSS.');
must(loader.includes('office-polish.js?build=20260807-2306'),'Supported Office does not load polish JS.');
must(loader.includes('office-polish.css?build=20260807-2306'),'Supported Office does not load polish CSS.');
must(sw.includes("'./job-lifecycle.js'"),'Offline shell does not cache lifecycle JS.');
must(sw.includes("'./job-lifecycle.css'"),'Offline shell does not cache lifecycle CSS.');
must(sw.includes("'./office-polish.js'"),'Offline shell does not cache polish JS.');
must(sw.includes("'./office-polish.css'"),'Offline shell does not cache polish CSS.');
must(sw.includes('supabase-no-legacy-office.js'),'Supported loader must remain current through service worker.');
must(polish.includes("close.type='button'"),'Search close button must use explicit button behavior.');
must(polish.includes("dialog.addEventListener('cancel'"),'Search must close from browser/phone cancel behavior.');
must(polish.includes("event.target===dialog"),'Search must close from backdrop tap.');
must(polish.includes("event.key==='Escape'"),'Search must close from Escape / Back-equivalent keyboard behavior.');
must(polish.includes('searchExitGuaranteed:true'),'Search exit contract marker missing.');
must(polish.includes('quoteAiChanged:false'),'Polish layer must state Quote AI is untouched.');
must(polishCss.includes('.h38-search-close'),'Visible Search close styling is missing.');
must(polishCss.includes('min-height:48px'),'Phone Search touch target is too small.');

console.log('PASS — Job Lifecycle + Assistant + Office polish verification');
