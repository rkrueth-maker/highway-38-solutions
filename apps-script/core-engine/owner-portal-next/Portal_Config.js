/**
 * Highway 38 Owner Portal — integrated business operating system configuration.
 * Customer-facing and public actions remain locked until separately released.
 */
var H38_PORTAL_ENVIRONMENT = String(
  PropertiesService.getScriptProperties().getProperty('H38_PORTAL_ENVIRONMENT') || 'UNCONFIGURED'
).toUpperCase();

var H38_PORTAL_NEXT = Object.freeze({
  APP_NAME: 'Highway 38 Business Operating System',
  RELEASE: 'production-2026-07-12-hard-rule-owner-portal',
  TIMEZONE: 'America/Chicago',
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty('H38_PORTAL_SPREADSHEET_ID') || '',
  ENVIRONMENT: H38_PORTAL_ENVIRONMENT,
  OWNER_EMAILS: ['rkrueth@gmail.com', 'highway38solutions@gmail.com'],
  TEST_MODE: H38_PORTAL_ENVIRONMENT !== 'PRODUCTION',
  LIVE_EXTERNAL_ACTIONS_ENABLED: false,
  MAX_ROWS: 500,
  DEFAULT_PAGE_SIZE: 75,
  REQUIRED_PRODUCTS: [
    'H38-P001','H38-P002','H38-P003','H38-P004','H38-P005',
    'H38-P006','H38-P007','H38-P008','H38-P009','H38-P010',
    'H38-P011','H38-P012','H38-P013','H38-P014','H38-P015'
  ],
  REQUIRED_BUNDLES: [
    'H38-B001','H38-B002','H38-B003','H38-B004','H38-B005',
    'H38-B006','H38-B007','H38-B008','H38-B009'
  ],
  LEGACY_QUEUES: [
    'New Requests','Job Queue','Email Approval Queue','Quote Approval Queue',
    'Follow-Up Queue','Output Queue','Social Approval Queue','Website Approval Queue',
    'Proof Log','Error Log'
  ],
  MODULES: [
    'dashboard','tasks','leads','customers','jobs','quotes','invoices','payments',
    'expenses','communications','social','advertising','website','calendar','products',
    'reports','proof','errors','settings'
  ],
  WORKSPACE_SECTIONS: [
    'task','customer','leads','job','quotes','invoices','payments','expenses',
    'communications','social','advertising','website','calendar','proof','errors'
  ]
});

var H38_PORTAL_STATUS = Object.freeze({
  task: ['Open','In progress','Waiting for information','Needs review','Approved','Blocked','On hold','Revision required','Rejected','Complete','Cancelled','Archived'],
  lead: ['New','Needs review','Needs information','Qualified','Product recommended','Quote preparation','Quote awaiting approval','Quote sent','Awaiting customer','Deposit pending','Ready to start','Declined','Closed','Archived'],
  customer: ['Prospect','Active','Inactive','Closed','Archived'],
  job: ['Intake','Qualification','Scope','Quote','Awaiting payment','Ready to start','In production','Internal QA','Owner review','Needs revision','Approved for delivery','Delivered','Follow-up','Complete','On hold','Cancelled','Archived'],
  quote: ['Draft','Needs review','Needs changes','Approved','Sent','Viewed','Accepted','Declined','Expired','Replaced','Cancelled'],
  invoice: ['Draft','Needs review','Approved','Sent','Partially paid','Paid','Overdue','Refunded','Partially refunded','Failed','Disputed','Written off','Cancelled'],
  payment: ['Not required','Not requested','Invoice draft','Awaiting approval','Invoice sent','Deposit due','Partially paid','Paid','Overdue','Refunded','Partially refunded','Failed','Disputed','Written off'],
  communication: ['Draft','Needs review','Approved','Sent','Received','Follow-up required','Closed','Archived'],
  social: ['Idea','Draft','Needs assets','Needs review','Needs changes','Approved','Scheduled','Published','Failed','Cancelled','Archived'],
  advertising: ['Idea','Planning','Draft','Needs review','Approved','Ready to launch','Active','Paused','Complete','Rejected','Archived'],
  website: ['Idea','Draft','In build','Testing','Needs review','Approved for merge','Merged','Deploying','Live verification','Complete','Rolled back','Rejected'],
  expense: ['Needs review','Recorded','Exported','Reconciled','Archived'],
  approval: ['Rick Review Required / Owner Approval Required','Approved by Rick - Action Allowed','HOLD','REVISE','REJECTED','Completed - Proof Logged']
});

var H38_PORTAL_TABLES = Object.freeze({
  tasks: {sheet:'Portal Tasks', id:'Task ID', headers:['Task ID','Task Title','Task Type','Related Customer ID','Related Project','Job ID','Product / Bundle ID','Priority','Due Date','Status','Approval Requirement','Approval Status','Rick Decision','Assigned Action','Source System','Source Sheet','Source Row','Last Update','Blocking Issue','Next Recommended Action','Notes','Created Time','Updated Time']},
  leads: {sheet:'Portal Leads', id:'Lead ID', headers:['Lead ID','Customer ID','Name','Business','Email','Phone','Preferred Contact','Lead Source','First Contact Date','Status','Product / Bundle ID','Job ID','Next Action','Follow-Up Date','Privacy Classification','Notes','Created Time','Updated Time']},
  customers: {sheet:'Portal Customers', id:'Customer ID', headers:['Customer ID','Name','Business','Email','Phone','Preferred Contact','Address','Lead Source','First Contact Date','Customer Status','Active Jobs','Completed Jobs','Lifetime Revenue','Outstanding Balance','Privacy Classification','Drive Folder Link','Notes','Created Time','Updated Time']},
  jobs: {sheet:'Portal Jobs', id:'Job ID', headers:['Job ID','Customer ID','Customer Name','Product / Bundle ID','Scope','Inputs Received','Intake Complete','Missing Information','Quote ID','Payment Requirement','Payment Status','Start Authorization','Job Stage','Deliverables','Revisions Used','Revision Allowance','Revision Status','Due Date','QA Status','Approval Status','Final Delivery Status','Follow-Up Date','Archive Status','Drive Folder Link','Revenue','Expense Total','Profit Estimate','Notes','Created Time','Updated Time']},
  quotes: {sheet:'Portal Quotes', id:'Quote ID', headers:['Quote ID','Job ID','Customer ID','Product / Bundle ID','Catalog Price','Quoted Amount','Scope','Exclusions','Payment Terms','Turnaround','Revision Allowance','Optional Extras','Discount','Status','Approval Status','Rick Decision','Gmail Draft Reference','Sent Time','Accepted Time','Expiration Date','Proof Log ID','Notes','Created Time','Updated Time']},
  invoices: {sheet:'Portal Invoices', id:'Invoice ID', headers:['Invoice ID','Job ID','Customer ID','Quote ID','Invoice Type','Subtotal','Discount','Tax','Fees','Total','Amount Paid','Balance','Due Date','Status','Approval Status','Rick Decision','Payment Provider','Provider Reference','Gmail Draft Reference','Sent Time','Proof Log ID','Notes','Created Time','Updated Time']},
  payments: {sheet:'Portal Payments', id:'Payment ID', headers:['Payment ID','Invoice ID','Job ID','Customer ID','Payment Date','Amount','Payment Method','Transaction Reference','Status','Refund Amount','Receipt Link','Recorded By','Proof Log ID','Notes','Created Time','Updated Time']},
  expenses: {sheet:'Portal Expenses', id:'Expense ID', headers:['Expense ID','Date','Vendor','Description','Category','Amount','Tax','Payment Method','Receipt Link','Customer ID','Job ID','Product / Bundle ID','Billable','Reimbursable','Recurring','Accounting Status','Proof Log ID','Notes','Created Time','Updated Time']},
  communications: {sheet:'Portal Communications', id:'Communication ID', headers:['Communication ID','Customer ID','Job ID','Quote ID','Invoice ID','Task ID','Category','Channel','Direction','Recipient','Subject','Gmail Draft Reference','Status','Approval Status','Rick Decision','Sent Time','Proof Log ID','Follow-Up Task ID','Notes','Created Time','Updated Time']},
  social: {sheet:'Portal Social', id:'Social ID', headers:['Social ID','Campaign ID','Product / Bundle ID','Platform','Content Type','Caption','Asset Links','Hashtags','Target Link','Status','Approval Status','Rick Decision','Scheduled Time','Published Time','Publication URL','Performance Notes','Proof Log ID','Notes','Created Time','Updated Time']},
  advertising: {sheet:'Portal Advertising', id:'Campaign ID', headers:['Campaign ID','Platform','Product / Bundle ID','Audience','Location','Budget','Start Date','End Date','Creative Links','Copy','Landing Page','Tracking Link','Status','Approval Status','Rick Decision','Spend','Leads','Revenue','Return Estimate','Proof Log ID','Notes','Created Time','Updated Time']},
  website: {sheet:'Portal Website', id:'Change ID', headers:['Change ID','Page','Change Type','Requested Change','Reason','Before State','Proposed State','Files Affected','Proof Link','Test Results','Status','Approval Status','Rick Decision','Commit SHA','Pull Request','Deployment Time','Production Verification','Rollback Information','Proof Log ID','Notes','Created Time','Updated Time']},
  calendar: {sheet:'Portal Calendar', id:'Event ID', headers:['Event ID','Title','Event Type','Related ID','Start Time','End Time','Platform','Campaign ID','Product / Bundle ID','Status','Approval Warning','Conflict Warning','Notes','Created Time','Updated Time']},
  catalog: {sheet:'Portal Catalog', id:'Catalog ID', headers:['Catalog ID','Record Type','Name','Family','Price','Payment Classification','Payment Wording','Turnaround','Revision Allowance','Scope Limits','SOP Reference','Customer Template IDs','Website Link','Sample Link','Source Hash','Sync Status','Notes','Created Time','Updated Time']},
  settings: {sheet:'Portal Settings', id:'Setting Key', headers:['Setting Key','Setting Value','Value Type','Category','Secret','Status','Notes','Updated Time']}
});

var H38_PORTAL_EXPENSE_CATEGORIES = Object.freeze(['Software','Advertising','Materials','Supplies','Equipment','Tools','Contractors','Travel','Mileage','Printing','Shipping','Banking and payment fees','Insurance','Legal','Accounting','Office','Website and hosting','Phone and internet','Training','Miscellaneous']);

var H38_PORTAL_APPROVAL_MATRIX = Object.freeze({
  APPROVE_TASK: {decision:'APPROVE', external:false},
  SEND_EMAIL: {decision:'APPROVE SEND', external:true, allowedField:'Send Allowed'},
  SEND_QUOTE: {decision:'APPROVE QUOTE SEND', external:true, allowedField:'Send Allowed'},
  SEND_INVOICE: {decision:'APPROVE INVOICE SEND', external:true, allowedField:'Send Allowed'},
  REQUEST_PAYMENT: {decision:'APPROVE PAYMENT REQUEST', external:true, allowedField:'Send Allowed'},
  SEND_FINAL_DELIVERY: {decision:'APPROVE FINAL DELIVERY', external:true, allowedField:'Delivery Allowed'},
  SCHEDULE_SOCIAL: {decision:'APPROVE SOCIAL SCHEDULE', external:false},
  PUBLISH_SOCIAL: {decision:'APPROVE SOCIAL PUBLISH', external:true, allowedField:'Publish Allowed'},
  APPROVE_AD_PLAN: {decision:'APPROVE AD PLAN', external:false},
  LAUNCH_AD: {decision:'APPROVE AD LAUNCH', external:true, allowedField:'Publish Allowed'},
  APPROVE_WEBSITE_MERGE: {decision:'APPROVE WEBSITE MERGE', external:false},
  DEPLOY_WEBSITE: {decision:'APPROVE WEBSITE DEPLOY', external:true, allowedField:'Publish Allowed'},
  RECORD_PAYMENT: {decision:'APPROVE PAYMENT RECORD', external:false},
  RECORD_EXPENSE: {decision:'APPROVE EXPENSE RECORD', external:false}
});
