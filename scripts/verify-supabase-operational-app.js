'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const expect=(condition,message)=>{if(!condition)throw new Error(message);};
const includes=(text,needle,message)=>expect(text.includes(needle),message || `Expected ${needle}`);

const browserScripts=[
  'commercial-app/supabase-runtime-globals.js',
  'commercial-app/supabase-data.js',
  'commercial-app/supabase-operation-coverage.js',
  'commercial-app/supabase-ai-fallback.js',
  'commercial-app/supabase-storage-provider.js',
  'commercial-app/supabase-portal-hydration.js',
  'commercial-app/supabase-final-startup.js',
  'commercial-app/site-scanner.js'
];

for(const file of browserScripts){
  const source=read(file);
  new vm.Script(source,{filename:file});
  expect(!/sb_service_role|service[_-]?role[_-]?key/i.test(source),`${file} must not expose a Supabase service-role key.`);
  expect(!/google[_-]?client[_-]?secret\s*[:=]/i.test(source),`${file} must not expose a Google client secret.`);
  expect(!/\brefresh[_-]?token\b\s*[:=]/i.test(source),`${file} must not store a Google refresh-token field in browser code.`);
}
new vm.Script(read('commercial-app/service-worker.js'),{filename:'commercial-app/service-worker.js'});

const index=read('commercial-app/index.html');
const ordered=[
  'supabase-auth.js','app-17.js','supabase-runtime-globals.js','supabase-data.js',
  'supabase-operation-coverage.js','supabase-ai-fallback.js','supabase-storage-provider.js',
  'supabase-portal-hydration.js','supabase-startup.js','app-19.js',
  'supabase-final-startup.js','app-18.js'
];
let last=-1;
for(const name of ordered){
  const position=index.indexOf(name);
  expect(position>last,`${name} must load in the accepted Supabase operational order.`);
  last=position;
}
includes(index,"window.H38_GATEWAY_HANDOFF_PRESENT=false",'Legacy gateway handoff must remain disabled.');
includes(index,"window.H38_EXECUTION_HANDOFF_PRESENT=false",'Legacy execution handoff must remain disabled.');

const operationalMigration=read('supabase/migrations/20260805050000_business_office_operational_records.sql');
for(const needle of [
  'create table if not exists public.business_records',
  'create table if not exists public.business_storage_settings',
  "provider in ('supabase', 'google_drive')",
  'alter table public.business_records enable row level security',
  'alter table public.business_storage_settings enable row level security',
  'private.business_record_access',
  "'business-office-files'",
  "'client_google_drive_supported', true",
  "'oauth_secrets_in_browser', false",
  'external_action_occurred'
])includes(operationalMigration,needle,`Operational migration is missing ${needle}`);
expect(!/grant\s+.*business_storage_credentials/i.test(operationalMigration),'Credential access must not be granted to browser roles.');

const hardeningMigration=read('supabase/migrations/20260805050500_harden_business_record_updates.sql');
includes(hardeningMigration,'coalesce((select auth.uid()), old.updated_by)','Migration replay must preserve the existing updater without browser Auth context.');
includes(hardeningMigration,"membership.role = 'viewer'",'Viewer must have an explicit read-only branch.');
includes(hardeningMigration,'and p_write = false','Viewer must never receive operational write access.');

const defaultsMigration=read('supabase/migrations/20260805051000_business_office_week_one_defaults.sql');
for(const needle of [
  "'people'","'accounting'","'payroll-prep'","'tax-prep'","'controls'","'reports'",
  "'GENERIC-QUOTE-CUSTOMER'","'Generic Quote Customer'",
  "'google_records_imported', false","'external_actions_enabled', false"
])includes(defaultsMigration,needle,`Week-one defaults are missing ${needle}`);

const advisorHardening=read('supabase/migrations/20260901223000_business_office_advisor_hardening.sql');
for(const needle of [
  'business_onboarding_runs_requested_by_idx',
  'business_records_created_by_idx',
  'business_records_updated_by_idx',
  'business_storage_settings_connected_by_idx',
  'contractor_pricing_rules_approved_by_idx',
  'contractor_pricing_rules_created_by_idx',
  'price_book_assemblies_approved_by_idx',
  'price_book_assemblies_created_by_idx',
  'drop policy if exists "platform owners manage onboarding runs"',
  'create policy "platform owners insert onboarding runs"',
  'create policy "platform owners update onboarding runs"',
  'create policy "platform owners delete onboarding runs"',
  'private.platform_owner_access((select auth.uid()))',
  'drop policy if exists "administrators manage business storage settings"',
  'create policy "administrators insert business storage settings"',
  'create policy "administrators update business storage settings"',
  'create policy "administrators delete business storage settings"'
])includes(advisorHardening,needle,`Advisor hardening migration is missing ${needle}`);
expect(!/create\s+policy\s+"platform owners[^\n]*"[\s\S]*?for\s+select/i.test(advisorHardening),'Platform-owner hardening must not restore a second onboarding SELECT policy.');
expect(!/grant\s+execute|service[_-]?role/i.test(advisorHardening),'Advisor hardening must not broaden function execution or expose service-role access.');

const data=read('commercial-app/supabase-data.js');
for(const needle of [
  "startupMode = 'SUPABASE_OPERATIONAL_APP'",
  "case 'SAVE_TASK'",
  "case 'SAVE_SCHEDULE'",
  "case 'SAVE_QUOTE'",
  "case 'SAVE_MEASUREMENT'",
  "case 'SAVE_INVOICE'",
  "case 'RECORD_PAYMENT'",
  "externalActionOccurred:false",
  'Task board and punch list',
  'Daily job log',
  'Install H38 Office'
])includes(data,needle,`Supabase data adapter is missing ${needle}`);

const coverage=read('commercial-app/supabase-operation-coverage.js');
for(const action of [
  'SAVE_PARITY_ENTITY','POST_INVENTORY','RECORD_INSPECTION','SCHEDULE_MAINTENANCE',
  'SAVE_EMAIL_DRAFT','SAVE_SMS_DRAFT','SAVE_PORTAL_MESSAGE','SAVE_VOICE_ITEM'
])includes(coverage,`'${action}'`,`Operation coverage is missing ${action}`);
for(const phrase of ['Draft — Not Sent','Draft — Not Released','No quote was changed or approved'])
  includes(coverage,phrase,`Operation safeguards are missing ${phrase}`);

const aiFallback=read('commercial-app/supabase-ai-fallback.js');
for(const needle of ["action==='aiAsk'",'H38 local guidance','cloudProviderConnected:false','externalActionsEnabled:false'])
  includes(aiFallback,needle,`Safe AI fallback is missing ${needle}`);

const storage=read('commercial-app/supabase-storage-provider.js');
for(const needle of [
  "supported:['supabase','google_drive']",
  "functions.invoke('business-drive-upload'",
  "'Storage Provider':'google_drive'",
  'credentialsInBrowser:false',
  'crossTenantAccess:false',
  'automaticCustomerRelease:false',
  'The file remains safely queued on this device'
])includes(storage,needle,`Storage provider adapter is missing ${needle}`);

const portal=read('commercial-app/supabase-portal-hydration.js');
for(const table of ['customer_accounts','customer_jobs','customer_quotes','quote_items','customer_invoices','customer_messages','customer_files'])
  includes(portal,`.from('${table}')`,`Portal hydration must read ${table}`);
includes(portal,'googleRecordsImported:false','Portal hydration must remain read-only and avoid Google migration.');

const serviceWorker=read('commercial-app/service-worker.js');
includes(serviceWorker,"const CACHE_NAME='h38-business-office-",'Installable app cache is missing.');
includes(serviceWorker,"const SUPABASE_CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'",'Offline shell must cache the browser Supabase client.');
for(const file of ['supabase-data.js','supabase-operation-coverage.js','supabase-ai-fallback.js','supabase-storage-provider.js','supabase-portal-hydration.js','supabase-final-startup.js','site-scanner.js'])
  includes(serviceWorker,`'./${file}'`,`Offline app shell must cache ${file}`);
expect(!serviceWorker.includes('registration.unregister()'),'The operational PWA service worker must not unregister itself.');

const manifest=JSON.parse(read('commercial-app/manifest.webmanifest'));
expect(manifest.display==='standalone','The Business Office manifest must install as a standalone app.');
expect(String(manifest.start_url||'').includes('shell=office'),'The installed app must open the full Business Office shell.');

const work=read('commercial-app/app-05.js');
includes(work,'Assign task','The Work page must retain task assignment.');
includes(work,"queueOperation('SAVE_TASK'",'Task assignment must enter the offline/Supabase sync queue.');

const parity=read('docs/architecture/SUPABASE_WEEK_ONE_APP_PARITY.md');
for(const needle of ['Supabase is the system of record','client may connect its own Google Drive','Deliberately not enabled','Northern Lakes activation'])
  includes(parity,needle,`Parity document is missing ${needle}`);

require('./verify-h38-site-scanner.js');
console.log('Supabase operational app verification passed.');
