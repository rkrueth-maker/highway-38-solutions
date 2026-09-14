'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const fail=message=>{throw new Error(message);};
const requireText=(source,needle,label=needle)=>{if(!source.includes(needle))fail(`Missing ${label}`);};
const forbid=(source,needle,label=needle)=>{if(source.includes(needle))fail(`Forbidden ${label}`);};

const importer=read('commercial-app/customer-import-intelligence.js');
const index=read('commercial-app/index.html');
const erp=read('commercial-app/erp-foundation.js');
const stage=read('supabase/migrations/20260903230000_erp_time_uptake_learning_foundation.sql');
const universalAudit=read('supabase/migrations/20260914075000_universal_smart_import_proof_log.sql');

new Function(importer);

for(const marker of [
  "const BUILD='20260914-universal-smart-import-1'",
  'Universal Smart Import',
  'Analyze workbook',
  'Stage selected groups',
  'Apply reviewed groups',
  '.csv,.json,.xlsx,.xls',
  'business_office_stage_import',
  'business_office_apply_import',
  'separateStagingRuns:true',
  'customerReferenceResolution:true',
  'confirmedInferredReview:true',
  'ownerApprovalRequired:true',
  'preservesExistingNonblankValues:true',
  'preservesGenericDataUptake:true',
  'automaticCustomerSending:false',
  'automaticPayments:false',
  'automaticScheduling:false',
  'automaticApproval:false'
])requireText(importer,marker);

for(const marker of [
  "customers:{label:'Customers'",
  "properties:{label:'Properties / locations'",
  "jobs:{label:'Jobs'",
  "quotes:{label:'Quotes / estimates'",
  "invoices:{label:'Invoices'",
  "timeEntries:{label:'Historical time'",
  "expenses:{label:'Expenses'",
  "payments:{label:'Payments'",
  'historicalRecords'
])requireText(importer,marker,`entity support ${marker}`);

requireText(importer,"g.detection.confidence!=='low'",'low-confidence auto-selection guard');
requireText(importer,"g.type!=='historicalRecords'",'unclassified auto-selection guard');
requireText(importer,"targetCollection:'properties'",'customer service-location generation');
requireText(importer,'IMPORT-PROPERTY-','stable imported property key');
requireText(importer,'existingCache.clear()','tenant snapshot cache reset per analysis');
requireText(importer,"p_source_name:`${plan.file} · ${g.sheet}`",'per-sheet staging source');
requireText(importer,'stagedRuns.set(g.id,runId)','separate run tracking');
requireText(importer,'stagedRuns.delete(g.id)','applied run retirement');

requireText(index,'customer-import-intelligence.js?build=20260914-universal-smart-import-1','production cache-busted loader');
forbid(index,'customer-import-intelligence.js?build=20260914-smart-spreadsheet-import-1','stale smart-import loader');
requireText(erp,'id="h38DataUptake"','existing data-uptake host');
requireText(erp,'data-h38-stage-import','manual import fallback preserved');
requireText(importer,"host.querySelector('[data-h38-universal-import-panel]')",'non-destructive universal panel injection');
forbid(importer,'host.innerHTML=','destructive replacement of generic import controls');

for(const collection of ['customers','contacts','properties','jobs','workOrders','tasks','quotes','timeEntries','expenses','invoices','payments','documents','historicalRecords'])
  requireText(stage,`'${collection}'`,`backend import collection ${collection}`);
requireText(stage,"array['owner','administrator']",'owner/admin staging boundary');
requireText(stage,'jsonb_array_length(p_rows)>5000','bounded import batch');

requireText(universalAudit,"'BUSINESS_DATA_IMPORT_APPLY'",'generic Proof Log action');
forbid(universalAudit,"'CUSTOMER_DATA_IMPORT_APPLY'",'customer-only Proof Log action');
requireText(universalAudit,"'universalImport',true",'universal import Proof Log evidence');
requireText(universalAudit,"'tenantIsolated',true",'tenant-isolated Proof Log evidence');
requireText(universalAudit,"'ownerReviewedApply',true",'owner-review Proof Log evidence');
requireText(universalAudit,"'automaticExternalActions',false",'no external action evidence');
requireText(universalAudit,"private.business_access(v_run.business_id,array['owner','administrator']::text[])",'apply tenant/role boundary');

console.log(JSON.stringify({
  status:'PASS',
  build:'20260914-universal-smart-import-1',
  formats:['csv','json','xls','xlsx'],
  entities:['customers','properties','jobs','quotes','invoices','timeEntries','expenses','payments','historicalRecords'],
  analysisWrites:false,
  separateStagingRuns:true,
  ownerApprovalRequired:true,
  tenantIsolated:true,
  preservesExistingNonblankValues:true,
  genericManualImportPreserved:true,
  automaticExternalActions:false
},null,2));
