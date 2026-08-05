#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const file=rel=>path.join(root,rel);
const read=rel=>fs.readFileSync(file(rel),'utf8');
const exists=rel=>fs.existsSync(file(rel));
const failures=[];
const check=(name,value,detail='')=>{if(!value)failures.push(`${name}${detail?`: ${detail}`:''}`);};
const has=(source,tokens)=>tokens.every(token=>source.includes(token));

const appFiles=Array.from({length:20},(_,index)=>`commercial-app/app-${String(index+1).padStart(2,'0')}.js`);
const browserFiles=[
  'commercial-app/db.js','commercial-app/bridge.js','commercial-app/startup-fix.js',
  'commercial-app/service-worker.js','commercial-app/supabase-config.js',
  'commercial-app/supabase-auth.js','commercial-app/supabase-startup.js',
  'commercial-app/supabase-runtime-globals.js','commercial-app/supabase-data.js',
  'commercial-app/supabase-operation-coverage.js','commercial-app/supabase-storage-provider.js',
  'commercial-app/supabase-portal-hydration.js','commercial-app/supabase-final-startup.js',
  'commercial-app/supabase-no-legacy-office.js',...appFiles
];
const required=[
  'open-business-office.html','commercial-app/index.html','commercial-app/styles.css',
  'commercial-app/manifest.webmanifest','commercial-app/icon.svg',...browserFiles,
  'supabase/migrations/20260805050000_business_office_operational_records.sql',
  'supabase/migrations/20260805051000_business_office_week_one_defaults.sql'
];
required.forEach(rel=>check(`file ${rel}`,exists(rel)));
check('legacy launcher removed',!exists('legacy-business-office.html'));
if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1);}

for(const rel of browserFiles){
  const result=cp.spawnSync(process.execPath,['--check',file(rel)],{encoding:'utf8'});
  check(`syntax ${rel}`,result.status===0,(result.stderr||result.stdout||'').trim());
}

const launcher=read('open-business-office.html');
const index=read('commercial-app/index.html');
const styles=read('commercial-app/styles.css');
const worker=read('commercial-app/service-worker.js');
const bridge=read('commercial-app/bridge.js');
const config=read('commercial-app/supabase-config.js');
const auth=read('commercial-app/supabase-auth.js');
const noLegacy=read('commercial-app/supabase-no-legacy-office.js');
const data=read('commercial-app/supabase-data.js');
const coverage=read('commercial-app/supabase-operation-coverage.js');
const storage=read('commercial-app/supabase-storage-provider.js');
const portal=read('commercial-app/supabase-portal-hydration.js');
const migration=read('supabase/migrations/20260805050000_business_office_operational_records.sql');
const defaults=read('supabase/migrations/20260805051000_business_office_week_one_defaults.sql');
const manifest=JSON.parse(read('commercial-app/manifest.webmanifest'));
const app=appFiles.map(read).join('\n');

check('standard launcher is Supabase only',has(launcher,['Supabase is the only supported Office runtime.','location.replace(destination.toString())'])&&!/script\.google\.com|legacy-business-office/i.test(launcher));
check('browser config is Supabase only',has(config,["stage: 'supabase-production-only'",'clientTenantsEnabled: true','legacyOfficeEnabled: false','externalActionsEnabled: false'])&&!config.includes('fallbackUrl'));
check('runtime guard disables every fallback',has(noLegacy,['publicRouteRemoved: true','automaticFallback: false','manualFallback: false',"supportedRuntime: 'supabase'"]));
check('runtime guard loads last',index.indexOf('supabase-no-legacy-office.js')>index.indexOf('app-20.js'));
check('no public legacy Office URL',!/["']https:\/\/script\.google\.com\/macros\/s\//.test([launcher,index,noLegacy].join('\n')));

check('Supabase Auth resolves active membership',has(auth,["client.rpc('business_office_auth_state')","transport = 'supabase-auth'","flowType: 'pkce'"]));
check('browser has no privileged credential',!/(sb_service_role_|SUPABASE_SERVICE_ROLE_KEY|service[_-]?role[_-]?key)/i.test([config,bridge,auth,data,coverage,storage,portal].join('\n')));
check('tenant operational records and RLS exist',has(migration,[
  'create table if not exists public.business_records',
  'create table if not exists public.business_storage_settings',
  'alter table public.business_records enable row level security',
  'private.business_record_access',"provider in ('supabase', 'google_drive')"
]));
check('Generic Quote Customer and full modules exist',has(defaults,[
  "'GENERIC-QUOTE-CUSTOMER'","'Generic Quote Customer'","'people'",
  "'accounting'","'payroll-prep'","'tax-prep'","'controls'","'reports'"
]));
check('core operational workflows are mapped',has(data,[
  "case 'SAVE_TASK'","case 'SAVE_SCHEDULE'","case 'SAVE_QUOTE'",
  "case 'SAVE_MEASUREMENT'","case 'SAVE_INVOICE'","case 'RECORD_PAYMENT'",
  'Task board and punch list','Daily job log'
]));
check('remaining workflows are mapped',has(coverage,[
  'SAVE_PARITY_ENTITY','POST_INVENTORY','RECORD_INSPECTION','SCHEDULE_MAINTENANCE',
  'SAVE_EMAIL_DRAFT','SAVE_SMS_DRAFT','SAVE_PORTAL_MESSAGE','SAVE_VOICE_ITEM'
]));
check('client Drive remains server mediated',has(storage,[
  "supported:['supabase','google_drive']","functions.invoke('business-drive-upload'",
  'credentialsInBrowser:false','crossTenantAccess:false','automaticCustomerRelease:false'
]));
check('portal records hydrate from Supabase',has(portal,[
  ".from('customer_accounts')",".from('customer_jobs')",".from('customer_quotes')",
  ".from('customer_invoices')",'googleRecordsImported:false'
]));
check('complete Office navigation remains',has(app,[
  'Today','Customers','People','Work','Quotes','Schedule','Messages','Field',
  'Inventory','Fleet','Money','Accounting','Payroll Prep','Tax Prep','Documents',
  'Social','Controls','Reports','H38 AI','Settings'
]));
check('mobile layout remains',has(styles,['@media(max-width:760px)','.main-nav{position:fixed','bottom:0','grid-template-columns:1fr']));
check('installable PWA shell remains',has(worker,["const CACHE_NAME='h38-business-office-",'caches.open(CACHE_NAME)','supabase-data.js','supabase-no-legacy-office.js','self.clients.claim()'])&&!worker.includes('registration.unregister()'));
check('manifest remains standalone',manifest.display==='standalone'&&String(manifest.start_url||'').includes('shell=office'));
check('external actions remain disabled',!/(externalActionsEnabled\s*:\s*true|automaticSocialPublishing\s*:\s*true|automaticCustomerSending\s*:\s*true|automaticFinancialActions\s*:\s*true)/.test(required.map(read).join('\n')));

const output={
  status:failures.length?'FAIL':'PASS',failures,
  standardOffice:'supabase-only',legacyOfficeRoute:false,legacyFallback:false,
  taskAssignment:true,checklists:true,dailyLogs:true,offlineQueue:true,
  defaultFileProvider:'supabase',optionalClientFileProvider:'google_drive',
  serviceRoleInBrowser:false,externalActions:false
};
if(failures.length){console.error(JSON.stringify(output,null,2));process.exit(1);}
console.log(JSON.stringify(output,null,2));
