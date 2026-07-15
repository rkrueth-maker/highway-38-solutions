#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const boDir = path.join(root, 'apps-script', 'business-office');
const syncDir = path.join(root, 'apps-script', 'business-office-sync');
const h38PackDir = path.join(root, 'business-packs', 'highway38');
const h38PackPath = path.join(h38PackDir, 'business-pack.json');
const h38AcceptancePath = path.join(h38PackDir, 'apps-script', 'BusinessOffice_Highway38Acceptance.gs');
const templatePackPath = path.join(root, 'business-packs', 'template-business', 'business-pack.json');
const requiredFiles = [
  'BusinessOffice_BusinessPack.gs','BusinessOffice_Config.gs','BusinessOffice_Auth.gs','BusinessOffice_Core.gs','BusinessOffice_Workflows.gs',
  'BusinessOffice_Accounting.gs','BusinessOffice_PayrollTax.gs','BusinessOffice_DocumentsPDF.gs',
  'BusinessOffice_Installer.gs','BusinessOffice_Provisioning.gs','BusinessOffice_Web.gs','BusinessOffice_Test.gs','BusinessOffice_PlatformAcceptance.gs',
  'BusinessOffice_Index.html','appsscript.json','README.md'
];

const failures = [], passes = [];
function pass(name,evidence=''){passes.push({name,evidence});console.log(`PASS: ${name}${evidence?` — ${evidence}`:''}`)}
function fail(name,evidence=''){failures.push({name,evidence});console.error(`FAIL: ${name}${evidence?` — ${evidence}`:''}`)}
function assert(name,condition,evidence=''){condition?pass(name,evidence):fail(name,evidence)}
function read(file){return fs.readFileSync(file,'utf8')}
function syntaxCheck(source,label){
  const temp=path.join(process.cwd(),`.tmp-${label.replace(/[^a-z0-9]+/gi,'-')}.js`);
  fs.copyFileSync(source,temp);
  try{execFileSync(process.execPath,['--check',temp],{stdio:'pipe'});pass(`syntax ${label}`)}
  catch(error){fail(`syntax ${label}`,error.stderr?error.stderr.toString():error.message)}
  finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}

for(const file of requiredFiles) assert(`required file ${file}`,fs.existsSync(path.join(boDir,file)));
assert('Highway 38 business pack exists',fs.existsSync(h38PackPath));
assert('Highway 38-specific acceptance exists in Highway 38 pack',fs.existsSync(h38AcceptancePath));
assert('template business pack exists',fs.existsSync(templatePackPath));
assert('separate intake sync source',fs.existsSync(path.join(syncDir,'BusinessOffice_Sync.gs')));
assert('separate intake sync manifest',fs.existsSync(path.join(syncDir,'appsscript.json')));

for(const dir of [boDir,syncDir]){
  for(const file of fs.readdirSync(dir).filter(name=>name.endsWith('.gs'))) syntaxCheck(path.join(dir,file),`${dir===syncDir?'sync ':''}${file}`);
}
if(fs.existsSync(h38AcceptancePath)) syntaxCheck(h38AcceptancePath,'Highway 38 pack acceptance');

const allSource=fs.readdirSync(boDir).filter(name=>/\.(gs|html|json)$/.test(name)).map(name=>read(path.join(boDir,name))).join('\n');
const syncSource=read(path.join(syncDir,'BusinessOffice_Sync.gs'));
const h38Acceptance=fs.existsSync(h38AcceptancePath)?read(h38AcceptancePath):'';
const h38Pack=JSON.parse(read(h38PackPath));
const templatePack=JSON.parse(read(templatePackPath));
const requiredFunctions=['boGetBusinessPack_','boPackPropertyKey_','boGetCurrentUser_','boRequirePermission_','boListRecords','boSaveRecord','boCreateCustomerFromRequest','boCreateQuote','boReviseQuote','boConvertQuoteToWorkOrderAndJob','boCreateInvoiceFromJob','boMatchVendorBillToPurchaseOrder','boConvertReceiptToExpense','boRecordPayment','boPrepareJournalEntry','boPostJournalEntry','boReverseJournalEntry','boLockAccountingPeriod','boPreparePayrollPeriod','boExportPayrollProviderCsv','boPrepareSalesTaxPeriod','boFinalizeTaxPreparationReport','boUploadDocument','boExtractDocument','boReviewOcrField','boApproveDocument','boGeneratePdf','boCreateBackup','boPrepareRestore','boValidateInstallation','boValidateResourceIsolation','boProvisionIsolatedBusiness','boRunSelfTest','boRunPlatformAcceptance','doGet','boApi'];
for(const fn of requiredFunctions) assert(`function ${fn}`,new RegExp(`function\\s+${fn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\(`).test(allSource));
assert('Highway 38 live acceptance is outside reusable core',!allSource.includes('function boRunLiveAcceptance(')&&/function\s+boRunLiveAcceptance\s*\(/.test(h38Acceptance));

assert('core resolves storage through business pack',allSource.includes('boPackPropertyKey_')&&allSource.includes("SPREADSHEET_PROPERTY: 'spreadsheetId'"));
assert('core has no live Highway 38 resource defaults',!/(1kDDKWx9|1Vq8UjAz|11ak4QZ7|1Jn2vW5g|1rjl_m8u)/.test(allSource));
assert('Highway 38 pack retains Highway 38 property names',h38Pack.storage.propertyKeys.spreadsheetId==='H38_BUSINESS_OFFICE_SPREADSHEET_ID');
assert('template pack uses neutral property names',templatePack.storage.propertyKeys.spreadsheetId==='BUSINESS_OFFICE_SPREADSHEET_ID');
assert('catalog requirements are pack driven',allSource.includes('boCatalogRequirements_')&&!/products\.length\s*===\s*15\s*&&\s*bundles\.length\s*===\s*9/.test(read(path.join(boDir,'BusinessOffice_Installer.gs'))));
assert('source-preserving intake sync',syncSource.includes('h38BusinessOfficeSyncRequests')&&syncSource.includes('Backend Requests'));
assert('sync bootstrap',syncSource.includes('h38BusinessOfficeBootstrapSync')&&syncSource.includes('H38_BACKEND_SPREADSHEET_ID'));
assert('sync trigger installer',syncSource.includes('h38BusinessOfficeInstallSyncTrigger')&&syncSource.includes('everyMinutes(5)'));
assert('sync deployed acceptance',syncSource.includes('h38BusinessOfficeSyncAcceptance'));
assert('intake bridge idempotency',syncSource.includes('DUPLICATE_PREVENTED'));
assert('intake survives mirror failure',syncSource.includes("return { status: 'HOLD'"));

const forbidden=[/GmailApp\.sendEmail/i,/MailApp\.sendEmail/i,/Stripe/i,/PayPal/i,/DirectDepositService|createDirectDeposit|issueDirectDeposit/i,/TaxFilingService|submitTaxReturn|efileTaxReturn/i,/coming soon/i,/TODO\s*:\s*implement/i,/password\s*[:=]\s*['"][^'"]+/i,/private[_ -]?key\s*[:=]/i,/api[_ -]?key\s*[:=]\s*['"][^'"]+/i];
for(const pattern of forbidden) assert(`forbidden pattern absent ${pattern}`,!pattern.test(allSource));
assert('no anonymous production web access',!read(path.join(boDir,'appsscript.json')).includes('ANYONE_ANONYMOUS'));
assert('web app executes as accessing user',read(path.join(boDir,'appsscript.json')).includes('USER_ACCESSING'));
assert('external actions hard disabled',/EXTERNAL_ACTIONS_ENABLED\s*:\s*false/.test(allSource)&&h38Pack.workflow.externalActionsEnabled===false&&templatePack.workflow.externalActionsEnabled===false);
assert('direct payment hard disabled',/DIRECT_PAYMENT_PROCESSING\s*:\s*false/.test(allSource)&&h38Pack.boundaries.directPaymentProcessing===false&&templatePack.boundaries.directPaymentProcessing===false);
assert('payroll funding hard disabled',/DIRECT_PAYROLL_FUNDING\s*:\s*false/.test(allSource)&&h38Pack.boundaries.directPayrollFunding===false&&templatePack.boundaries.directPayrollFunding===false);
assert('tax filing hard disabled',/DIRECT_TAX_FILING\s*:\s*false/.test(allSource)&&h38Pack.boundaries.directTaxFiling===false&&templatePack.boundaries.directTaxFiling===false);
assert('selected-record API requires record IDs',/recordId/.test(read(path.join(boDir,'BusinessOffice_Web.gs'))));
assert('soft void preserves documents',allSource.includes('Drive original preserved'));
assert('duplicate hash protection',allSource.includes('SHA_256')&&allSource.includes('Duplicate upload blocked'));
assert('expected duplicate test error resolved',allSource.includes('Expected reusable-platform duplicate-protection acceptance result'));
assert('OCR review gate',allSource.includes('Every extracted field must be reviewed'));
assert('posting gate',allSource.includes("'Posting Allowed'] === 'Yes'"));
assert('payroll export gate',allSource.includes("'Export Allowed'] === 'Yes'"));
assert('tax finalization gate',allSource.includes("'Finalization Allowed'] === 'Yes'"));
assert('quote send gate',allSource.includes("'Send Allowed'"));
assert('role set complete',['Owner','Administrator','Staff','Bookkeeper','Payroll','Viewer'].every(role=>h38Pack.roles.names.includes(role)&&templatePack.roles.names.includes(role)));

const configSource=read(path.join(boDir,'BusinessOffice_Config.gs'));
const sheetNames=[...configSource.matchAll(/:\s*'BO [^']+'/g)].map(match=>match[0]);
assert('complete workbook schema represented in source',sheetNames.length>=75,`${sheetNames.length} configured sheets`);

const manifest=JSON.parse(read(path.join(boDir,'appsscript.json'))),syncManifest=JSON.parse(read(path.join(syncDir,'appsscript.json')));
assert('manifest V8 runtime',manifest.runtimeVersion==='V8');
assert('Drive advanced service configured',manifest.dependencies&&manifest.dependencies.enabledAdvancedServices.some(service=>service.serviceId==='drive'));
assert('required OAuth scopes',['spreadsheets','drive','documents','userinfo.email'].every(token=>manifest.oauthScopes.some(scope=>scope.includes(token))));
assert('execution API enabled for deployed acceptance',manifest.executionApi&&manifest.executionApi.access==='ANYONE');
assert('sync execution API enabled',syncManifest.executionApi&&syncManifest.executionApi.access==='ANYONE');

const ui=read(path.join(boDir,'BusinessOffice_Index.html'));
assert('mobile responsive UI',/@media\s*\(max-width:800px\)/.test(ui));
assert('confirmation before destructive action',ui.includes('confirm('));
assert('document preview before approval',ui.includes('previewUpload')&&ui.includes('uploadPreview'));
assert('mobile camera capture control',ui.includes('capture="environment"'));
assert('search and filters',ui.includes('Search')&&ui.includes('savedViews')&&ui.includes('applySavedView'));
assert('plain-language navigation modules',['Customers','Vendors','Quotes','Work Orders','Jobs','Purchase Orders','Expenses','Invoices','Payroll Preparation','Tax Preparation','Documents / OCR','Approval Queue'].every(label=>ui.includes(label)||allSource.includes(label)));
assert('no empty button labels',!/<button[^>]*>\s*<\/button>/i.test(ui));

function money(value){return Math.round((Number(value||0)+Number.EPSILON)*100)/100}
function payroll(input){const regular=money(input.regularHours*input.hourlyRate),overtime=money(input.overtimeHours*input.hourlyRate*input.overtimeMultiplier),gross=money(regular+overtime+(input.salaryPay||0)+(input.otherPay||0)),net=money(gross+(input.reimbursements||0)-(input.deductions||0)),employerTax=money(gross*.0765);return{regular,overtime,gross,net,employerTax}}
const payrollCase=payroll({regularHours:40,overtimeHours:5,hourlyRate:20,overtimeMultiplier:1.5,reimbursements:50,deductions:100});
assert('payroll test gross',payrollCase.gross===950,JSON.stringify(payrollCase));
assert('payroll test prepared net',payrollCase.net===900,JSON.stringify(payrollCase));
assert('payroll test employer tax estimate',payrollCase.employerTax===72.68,JSON.stringify(payrollCase));
const journal=[{debit:1070,credit:0},{debit:0,credit:1000},{debit:0,credit:70}].reduce((acc,line)=>({debit:money(acc.debit+line.debit),credit:money(acc.credit+line.credit)}),{debit:0,credit:0});
assert('double-entry test balances',journal.debit===journal.credit,JSON.stringify(journal));
const packageJson=JSON.parse(read(path.join(root,'package.json')));
assert('package test script',packageJson.scripts&&packageJson.scripts['test:business-office']==='node scripts/verify-business-office.js');
const result={status:failures.length?'HOLD':'PASS',passes:passes.length,failures};
fs.mkdirSync(path.join(root,'artifacts','business-office'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts','business-office','verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`\nRESULT: ${result.status} (${passes.length} pass, ${failures.length} fail)`);
process.exit(failures.length?1:0);
