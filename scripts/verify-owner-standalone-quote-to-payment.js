#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const checks=[];
function check(condition,message){if(!condition)throw new Error(`FAIL: ${message}`);checks.push(message);}
function moduleBlock(src,key){
  const marker=`boUnifiedModule_('${key}'`;
  const start=src.indexOf(marker);
  if(start<0)throw new Error(`FAIL: missing ${key} module`);
  const end=src.indexOf('\n    boUnifiedModule_(',start+marker.length);
  return src.slice(start,end<0?src.length:end);
}
function noStaffDependency(block,label){
  check(!/dependencies\s*:\s*\[[^\]]*(employees|users|assignedTasks|site.?manager|staff)/i.test(block),`${label} does not depend on Site Manager, Staff, Employees, Users, or assigned tasks`);
}

const contract=read('apps-script/business-office/BusinessOffice_ModuleContract.gs');
const ux=read('apps-script/core-engine/owner-portal-next/Portal_Application_UX.js');
const release=read('supabase/functions/h38-quote-release-gate/index.ts');
const portal=read('customer-portal.html');
const regression=read('scripts/run-owner-maintenance-regression.js');
const regressionWorkflow=read('.github/workflows/owner-maintenance-regression.yml');

const quote=moduleBlock(contract,'quotes');
const workOrder=moduleBlock(contract,'workOrders');
const jobs=moduleBlock(contract,'jobs');
const invoices=moduleBlock(contract,'invoices');
const payments=moduleBlock(contract,'payments');
const documents=moduleBlock(contract,'documents');
const customerPortal=moduleBlock(contract,'customerPortal');

check(/if \(access\.ownerMode\) return true;/.test(ux),'Owner mode bypasses employee-role navigation restrictions');
check(/\['owner','administrator'\]/.test(release),'Canonical quote release explicitly authorizes Owner or Administrator without any Site Manager requirement');
check(!/Site Manager.+required|required.+Site Manager/i.test(release),'Quote release contract does not require a Site Manager');

for(const [block,label] of [[quote,'Quotes'],[workOrder,'Work Orders'],[jobs,'Jobs'],[invoices,'Invoices'],[payments,'Payments'],[documents,'Documents']])noStaffDependency(block,label);

for(const field of ['Quote Number','Customer ID','Project Title','Revision Number','Approval Status','Send Allowed','Payment Terms','Scope','Assumptions','Exclusions','Subtotal','Deposit','Total'])check(quote.includes(field),`Quotes retain ${field}`);
check(workOrder.includes("dependencies:['quotes','customers']"),'Approved quotes can continue into Work Orders');
check(jobs.includes("'Quote ID'"),'Jobs retain quote linkage');

for(const field of ['Invoice Number','Customer ID','Job ID','Quote ID','Payment Terms','Approval Status','Send Allowed','Delivery Status','Deposit Applied','Total','Amount Paid','Balance Due'])check(invoices.includes(field),`Invoices retain ${field}`);
for(const field of ['Invoice ID','Customer ID','Job ID','Payment Date','Amount','Payment Method','Transaction Reference','Status','Approval Status','Posting Status'])check(payments.includes(field),`Payments retain ${field}`);
for(const field of ['File Name','Source Type','Source ID','Document Type','OCR State','Review Status','Approval Status','Export Status','Access Classification','Uploaded Time'])check(documents.includes(field),`Documents retain ${field}`);

check(customerPortal.includes("dependencies:['customers','quotes','jobs','invoices','documents']"),'Customer Portal keeps quote, job, invoice, and document continuity');
for(const marker of ['quotes-section','invoices-section','files-section','quoteReviewDialog','customer-portal-quote-delivery.js'])check(portal.includes(marker),`Customer Portal exposes ${marker}`);
check(portal.includes('portalAccountActions')&&portal.includes('hidden'),'Customer account actions remain hidden until authenticated');

check(regression.includes('canonicalQuoteReady'),'Regression has an explicit canonical quote-readiness decision');
check(regression.includes('quoteReadinessIndependentOfVisuals:true'),'Quote readiness is explicitly independent of optional visual rendering');
check(regression.includes('visualRequiredForQuoteReady:false'),'Optional visual failure cannot mark a valid quote unusable');
check(/if\(report\.fail\)process\.exitCode=2;/.test(regression),'Regression fails the quote gate only for canonical quote failure');

check(/on:\s*\n\s*workflow_dispatch:/m.test(regressionWorkflow),'Production-writing Owner Maintenance regression is manual-only');
check(!/^\s*push:/m.test(regressionWorkflow),'Owner Maintenance regression cannot auto-run on main push');
check(!/^\s*pull_request:/m.test(regressionWorkflow),'Owner Maintenance regression cannot seed production from pull requests');

const result={status:'PASS',ownerStandalone:true,siteManagerRequired:false,quoteToPayment:true,optionalVisualsDoNotBlockQuote:true,productionWritingRegressionManualOnly:true,checks:checks.length};
console.log(JSON.stringify(result,null,2));
