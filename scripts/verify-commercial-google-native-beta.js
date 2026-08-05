#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const cp=require('child_process');

const root=path.resolve(__dirname,'..');
const failures=[];
const checks=[];
const file=rel=>path.join(root,rel);
const read=rel=>{
  if(!fs.existsSync(file(rel)))throw new Error(`Missing required file: ${rel}`);
  return fs.readFileSync(file(rel),'utf8');
};
const check=(name,value,detail='')=>{
  checks.push({name,pass:!!value});
  if(!value)failures.push(`${name}${detail?`: ${detail}`:''}`);
};
const has=(source,tokens)=>tokens.every(token=>source.includes(token));
const joined=(dir,prefix,suffix)=>fs.readdirSync(file(dir))
  .filter(name=>name.startsWith(prefix)&&name.endsWith(suffix)).sort()
  .map(name=>read(path.join(dir,name))).join('\n');

const appFiles=Array.from({length:20},(_,index)=>`commercial-app/app-${String(index+1).padStart(2,'0')}.js`);
const supabaseClientFiles=[
  'commercial-app/supabase-config.js',
  'commercial-app/supabase-auth.js',
  'commercial-app/supabase-startup.js',
  'commercial-app/supabase-runtime-globals.js',
  'commercial-app/supabase-data.js',
  'commercial-app/supabase-operation-coverage.js',
  'commercial-app/supabase-storage-provider.js',
  'commercial-app/supabase-portal-hydration.js',
  'commercial-app/supabase-final-startup.js'
];
const completionFiles=fs.readdirSync(file('apps-script/commercial-office-beta'))
  .filter(name=>name.startsWith('CommercialBeta_Completion')&&name.endsWith('.gs')).sort()
  .map(name=>`apps-script/commercial-office-beta/${name}`);
const required=[
  'apps-script/commercial-office-beta/CommercialBeta_Config.gs',
  'apps-script/commercial-office-beta/CommercialBeta_Web.gs',
  'apps-script/commercial-office-beta/CommercialBeta_Office.html',
  'apps-script/commercial-office-beta/appsscript.json',
  'open-business-office.html','legacy-business-office.html',
  'commercial-app/index.html','commercial-app/styles.css','commercial-app/db.js','commercial-app/bridge.js',
  'commercial-app/startup-fix.js','commercial-app/service-worker.js','commercial-app/manifest.webmanifest','commercial-app/icon.svg',
  'supabase/migrations/20260805050000_business_office_operational_records.sql',
  'supabase/migrations/20260805051000_business_office_week_one_defaults.sql',
  ...supabaseClientFiles,...completionFiles,...appFiles
];
required.forEach(rel=>check(`file ${rel}`,fs.existsSync(file(rel))));
if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1);}

for(const rel of completionFiles.concat([
  'apps-script/commercial-office-beta/CommercialBeta_Config.gs',
  'apps-script/commercial-office-beta/CommercialBeta_Web.gs'
])){
  try{new vm.Script(read(rel),{filename:rel});check(`syntax ${rel}`,true);}
  catch(error){check(`syntax ${rel}`,false,error.message);}
}
for(const rel of appFiles.concat([
  'commercial-app/db.js','commercial-app/bridge.js','commercial-app/startup-fix.js',
  'commercial-app/service-worker.js',...supabaseClientFiles
])){
  const result=cp.spawnSync(process.execPath,['--check',file(rel)],{encoding:'utf8'});
  check(`syntax ${rel}`,result.status===0,(result.stderr||result.stdout||'').trim());
}

const config=read('apps-script/commercial-office-beta/CommercialBeta_Config.gs');
const web=read('apps-script/commercial-office-beta/CommercialBeta_Web.gs');
const office=read('apps-script/commercial-office-beta/CommercialBeta_Office.html');
const launcher=read('open-business-office.html');
const rollback=read('legacy-business-office.html');
const index=read('commercial-app/index.html');
const styles=read('commercial-app/styles.css');
const worker=read('commercial-app/service-worker.js');
const bridge=read('commercial-app/bridge.js');
const supabaseConfig=read('commercial-app/supabase-config.js');
const supabaseAuth=read('commercial-app/supabase-auth.js');
const supabaseData=read('commercial-app/supabase-data.js');
const operationCoverage=read('commercial-app/supabase-operation-coverage.js');
const storageProvider=read('commercial-app/supabase-storage-provider.js');
const portalHydration=read('commercial-app/supabase-portal-hydration.js');
const migration=read('supabase/migrations/20260805050000_business_office_operational_records.sql');
const defaultsMigration=read('supabase/migrations/20260805051000_business_office_week_one_defaults.sql');
const appsScriptManifest=JSON.parse(read('apps-script/commercial-office-beta/appsscript.json'));
const pwaManifest=JSON.parse(read('commercial-app/manifest.webmanifest'));
const app=appFiles.map(read).join('\n');

let platformConfig=null;
try{
  const context={};
  vm.createContext(context);
  new vm.Script(config,{filename:'CommercialBeta_Config.gs'}).runInContext(context);
  platformConfig=context.CB_CONFIG||null;
}catch(error){check('parse platform configuration',false,error.message);}

const requiredModules=['quotes','measure','communications','fleet','money','social','ai','voice','offline'];
const missingModules=requiredModules.filter(module=>!Array.isArray(platformConfig&&platformConfig.modules)||!platformConfig.modules.includes(module));
check('complete rollback platform configuration',!!platformConfig&&platformConfig.version==='1.0.0'&&platformConfig.schemaVersion===3&&platformConfig.pwaUrl==='https://highway38solutions.com/commercial-app/'&&missingModules.length===0,missingModules.length?`missing modules ${missingModules.join(',')}`:'');
check('external safeguards remain locked',!!platformConfig&&platformConfig.externalActionsEnabled===false&&platformConfig.productionMigrationEnabled===false&&platformConfig.automaticCustomerSending===false&&platformConfig.automaticSocialPublishing===false&&platformConfig.automaticFinancialActions===false);

check('standard launcher opens Supabase Office without Google auto-launch',has(launcher,['commercial-app/','Opening the standard Supabase Business Office','location.replace(destination.toString())'])&&!launcher.includes('script.google.com/macros'));
check('Google launcher is explicit rollback only',has(rollback,['Google Office rollback','This is not the standard Business Office.','commercial-app/','AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow'])&&!rollback.includes('window.location.replace'));
check('Google rollback keeps user-activated opaque handoff capability',has(office,['cbPwaGatewayHandoff','H38_GATEWAY_HANDOFF','gatewaySession','browserReceivesGoogleToken','id="continueButton"'])&&!office.includes('window.open('));
check('rollback web source retains controlled JSON route',has(web,['function doPost(event)','H38_SUPABASE_GATEWAY_V1','cbGatewayOutput_','cbApi({action:action,args:args})']));
check('rollback web app executes as signed-in user',appsScriptManifest.webapp&&appsScriptManifest.webapp.executeAs==='USER_ACCESSING');

check('production Supabase Auth configuration remains browser safe',has(supabaseConfig,[
  "stage: 'supabase-auth-production-standard'","projectRef: 'jqukmwtsgcsaruucnqja'",
  "fallbackUrl: '../legacy-business-office.html'",'productionPromotionAuthorized: false',
  'northernLakesEnabled: false','externalActionsEnabled: false'
])&&!/service[_-]?role/i.test(supabaseConfig));
check('Supabase Auth resolves active business with RLS RPC',has(supabaseAuth,["client.rpc('business_office_auth_state')","transport = 'supabase-auth'",'flowType: \'pkce\'']));
check('browser transport contains no Google token or service credential',!bridge.includes('script.googleapis.com')&&!bridge.includes('this.session.accessToken')&&!/service[_-]?role/i.test([bridge,supabaseAuth,supabaseData,operationCoverage,storageProvider,portalHydration].join('\n')));

check('Supabase operational records and RLS are present',has(migration,[
  'create table if not exists public.business_records',
  'create table if not exists public.business_storage_settings',
  'alter table public.business_records enable row level security',
  'private.business_record_access',
  "provider in ('supabase', 'google_drive')",
  "'oauth_secrets_in_browser', false"
]));
check('Generic Quote Customer and complete modules are preserved',has(defaultsMigration,[
  "'GENERIC-QUOTE-CUSTOMER'","'Generic Quote Customer'","'people'","'accounting'","'payroll-prep'","'tax-prep'","'controls'","'reports'"
]));
check('operational bridge covers task schedule quote field and financial records',has(supabaseData,[
  "case 'SAVE_TASK'","case 'SAVE_SCHEDULE'","case 'SAVE_QUOTE'","case 'SAVE_MEASUREMENT'",
  "case 'SAVE_INVOICE'","case 'RECORD_PAYMENT'",'Task board and punch list','Daily job log'
]));
check('remaining Office actions are covered by Supabase',has(operationCoverage,[
  'SAVE_PARITY_ENTITY','POST_INVENTORY','RECORD_INSPECTION','SCHEDULE_MAINTENANCE',
  'SAVE_EMAIL_DRAFT','SAVE_SMS_DRAFT','SAVE_PORTAL_MESSAGE','SAVE_VOICE_ITEM'
]));
check('client Drive is optional and server mediated',has(storageProvider,[
  "supported:['supabase','google_drive']","functions.invoke('business-drive-upload'",
  'credentialsInBrowser:false','crossTenantAccess:false','automaticCustomerRelease:false'
]));
check('existing Supabase customer portal records hydrate without Google migration',has(portalHydration,[
  ".from('customer_accounts')",".from('customer_jobs')",".from('customer_quotes')",
  ".from('customer_invoices')",'googleRecordsImported:false'
]));

check('full Office navigation is present',has(app,['Today','Customers','People','Work','Quotes','Schedule','Messages','Field','Inventory','Fleet','Money','Accounting','Payroll Prep','Tax Prep','Documents','Social','Controls','Reports','H38 AI','Settings']));
check('mobile layout stacks and uses bottom navigation',has(styles,['@media(max-width:760px)','.main-nav{position:fixed','bottom:0','grid-template-columns:1fr','.actions>*{flex:1 1 100%}']));
check('mobile metadata remains present',has(index,['mobile-web-app-capable','apple-mobile-web-app-capable','viewport-fit=cover','manifest.webmanifest']));
check('Supabase operational scripts load before startup and init',index.indexOf('supabase-data.js')<index.indexOf('supabase-startup.js')&&index.indexOf('supabase-final-startup.js')<index.indexOf('app-18.js'));

check('operational service worker installs the Supabase app shell',has(worker,[
  "const CACHE_NAME='h38-business-office-",'caches.open(CACHE_NAME)','supabase-data.js',
  'supabase-storage-provider.js','supabase-final-startup.js','self.clients.claim()'
])&&!worker.includes('registration.unregister()'));
check('PWA manifest installs full Office standalone',pwaManifest.display==='standalone'&&String(pwaManifest.start_url||'').includes('shell=office'));

const sync=joined('apps-script/commercial-office-beta','CommercialBeta_CompletionSync_','.gs');
const queued=[...app.matchAll(/queueOperation\('([^']+)'/g)].map(match=>match[1]);
const supportSource=[sync,supabaseData,operationCoverage,storageProvider].join('\n');
check('every queued action has rollback or Supabase handler',queued.every(action=>supportSource.includes(action)),queued.filter(action=>!supportSource.includes(action)).join(','));
const direct=[...app.matchAll(/bridge\.request\('([^']+)'/g)].map(match=>match[1]);
const directSupport=[web,supabaseAuth,supabaseData,operationCoverage,storageProvider,portalHydration].join('\n');
check('every direct API has rollback or Supabase route',direct.every(action=>directSupport.includes(action)),direct.filter(action=>!directSupport.includes(action)).join(','));

const combined=required.map(read).join('\n');
check('no automatic action release',!/(externalActionsEnabled\s*:\s*true|productionMigrationEnabled\s*:\s*true|automaticSocialPublishing\s*:\s*true|automaticCustomerSending\s*:\s*true|automaticFinancialActions\s*:\s*true)/.test(combined));
check('Northern Lakes remains disabled',!/(northernLakesEnabled\s*:\s*true|requestVersion\s*:\s*[1-9]|productionMigrationEnabled\s*:\s*true)/.test(combined));

const output={
  status:failures.length?'FAIL':'PASS',checks:checks.length,failures,
  standardOffice:'supabase-operational-pwa',googleOffice:'explicit-rollback-only',
  taskAssignment:true,checklists:true,dailyLogs:true,offlineQueue:true,
  defaultFileProvider:'supabase',optionalClientFileProvider:'google_drive',
  browserReceivesGoogleToken:false,productionMigration:false,externalActions:false,northernLakes:false
};
if(failures.length){console.error(JSON.stringify(output,null,2));process.exit(1);}
console.log(JSON.stringify(output,null,2));
