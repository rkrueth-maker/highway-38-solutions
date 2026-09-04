'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const expect=(condition,message)=>{if(!condition)throw new Error(message);};
const includes=(text,needle,message)=>expect(text.includes(needle),message||`Expected ${needle}`);

const foundation=read('supabase/migrations/20260903230000_erp_time_uptake_learning_foundation.sql');
const enrichment=read('supabase/migrations/20260903231000_erp_quote_learning_enrichment.sql');
const hardening=read('supabase/migrations/20260903232000_erp_time_learning_data_quality.sql');
const importIndex=read('supabase/migrations/20260904001500_erp_import_rows_business_index.sql');
const erp=read('commercial-app/erp-foundation.js');
const quoteContext=read('commercial-app/quote-learning-context.js');

includes(foundation,"and not (p_write=true and p_collection='timeEntries')",'Generic owner/admin record writes must not bypass audited time RPCs.');
includes(foundation,"membership.role='staff'",'Staff membership boundary must remain explicit.');
includes(foundation,"'timeEntries'",'Time entries must remain part of the ERP foundation.');
includes(foundation,"jsonb_array_length(p_rows)>5000",'Existing-data uptake must keep a bounded import batch.');
includes(foundation,"status='importing'",'Import apply must remain an explicit second step after staging.');

includes(hardening,"v_event_payload->>'Import Run ID'",'Audit ledger must recognize imported historical time.');
includes(hardening,"'Historical time import'",'Imported historical time must not be labeled as a live employee punch.');
includes(hardening,"'Employee clock in'",'Live employee clock-in audit reason must remain distinct.');
includes(hardening,"'Employee clock out'",'Live employee clock-out audit reason must remain distinct.');
includes(hardening,"if v_role not in ('owner','administrator')",'Business-wide learning must require owner/administrator access.');
includes(hardening,"raise exception 'Owner or administrator access required'",'Learning access failure must be explicit.');

for(const needle of [
  "group by t.payload->>'Job ID'",
  "sum((t.payload->>'Hours')::numeric) as actual_hours",
  "'timedJobSamples'",
  "'totalActualLaborHours'",
  "'averageHoursPerTimedJob'",
  "'averageActualHoursPerJob'",
  "'jobLevelLaborAggregation',true"
])includes(hardening,needle,`Job-level labor learning is missing ${needle}`);

expect(!/select\s+round\(avg\(\(t\.payload->>'Hours'\)::numeric\),2\)/i.test(hardening),'Final learning authority must not average individual punch rows.');
for(const needle of [
  "'tenantIsolated',true",
  "'ownerAdminOnly',true",
  "'advisoryOnly',true",
  "'automaticPriceChanges',false",
  "'automaticApproval',false",
  "'automaticCustomerSending',false"
])includes(hardening,needle,`Learning safety boundary is missing ${needle}`);

includes(importIndex,'business_data_import_rows_business_id_idx','Existing-data uptake must cover the business_id foreign key.');
includes(importIndex,'on public.business_data_import_rows(business_id)','Import-row business index must lead on business_id.');

includes(erp,"label:'Task Manager / deployment'",'Task Manager must remain the deployment/assignment surface.');
includes(erp,"label:'Existing-data uptake'",'ERP Center must retain existing-data uptake.');
includes(erp,"label:'Time & attendance'",'ERP Center must retain time and attendance.');
includes(quoteContext,"business_office_quote_learning_profile",'Quote workflow must consume the tenant learning profile.');

expect(enrichment.includes('business_office_quote_learning_profile'),'Base enrichment migration must define the learning profile before hardening.');

console.log(JSON.stringify({
  status:'PASS',
  employeePunchAudit:true,
  historicalImportAudit:true,
  ownerAdminCorrections:true,
  genericTimeWriteBypass:false,
  businessLearningOwnerAdminOnly:true,
  laborAggregation:'job-level',
  taskManagerDeploymentAuthority:true,
  stagedDataUptake:true,
  importRowsBusinessIndex:true,
  tenantIsolated:true,
  advisoryOnly:true,
  automaticPriceChanges:false,
  automaticApproval:false,
  automaticCustomerSending:false
},null,2));
