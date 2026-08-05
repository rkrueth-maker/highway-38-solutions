#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const json=file=>JSON.parse(read(file));
const failures=[];const checks=[];
function check(name,condition,detail=''){checks.push({name,status:condition?'PASS':'FAIL'});if(!condition)failures.push(detail?`${name}: ${detail}`:name);}

const packageConfig=json('businesses/northern-lakes/commercial-office-package.json');
const runtime=json('businesses/northern-lakes/app-deployment.json');
const supabasePack=json('business-packs/northern-lakes/supabase-business-pack.json');
const launcher=read('businesses/northern-lakes/business-office.html');
const ownerLogin=read('businesses/northern-lakes/owner-login.html');
const launchJs=read('businesses/northern-lakes/app-launch.js');
const inviteJs=read('businesses/northern-lakes/invite-activation.js');
const pwa=read('businesses/northern-lakes/commercial-app/index.html');
const db=read('businesses/northern-lakes/commercial-app/db.js');
const bridge=read('businesses/northern-lakes/commercial-app/bridge.js');
const startup=read('businesses/northern-lakes/commercial-app/startup-fix.js');
const brand=read('businesses/northern-lakes/commercial-app/brand-patch.js');
const manifest=json('businesses/northern-lakes/commercial-app/manifest.webmanifest');
const gateway=read('supabase/functions/nlpm-office-gateway/index.ts');
const supabase=read('supabase/config.toml');
const builder=read('scripts/build-northern-lakes-commercial-office.js');
const portal=read('portal.html');
const signIn=read('sign-in.html');

check('legacy Google package remains prepared and permission-gated',packageConfig.status==='prepared-not-deployed'&&packageConfig.safety.deploymentRequiresExplicitPermission===true);
check('legacy Google project and deployment remain fixed rollback targets',runtime.legacyGoogleOffice&&runtime.legacyGoogleOffice.status==='rollback-only'&&runtime.legacyGoogleOffice.deploymentId===packageConfig.existingAppsScriptDeploymentId&&runtime.legacyGoogleOffice.changed===false);
check('new Apps Script project or deployment remains forbidden',packageConfig.safety.createAppsScriptProjectAllowed===false&&packageConfig.safety.createAppsScriptDeploymentAllowed===false);
check('Supabase is the standard Northern Lakes runtime',runtime.coreEngine==='supabase-operational'&&runtime.systemOfRecord==='supabase'&&runtime.businessKey==='northern-lakes'&&runtime.packageVersion==='nlps-supabase-closed-beta-v1');
check('external actions and Google record import remain disabled',runtime.externalActionsEnabled===false&&runtime.automaticCustomerSending===false&&runtime.automaticFinancialActions===false&&runtime.automaticSocialPublishing===false&&runtime.googleRecordsImported===false);
check('Northern Lakes launcher opens only the standard Supabase tenant',launchJs.includes("config.coreEngine==='supabase-operational'")&&launchJs.includes("var PACKAGE='nlps-supabase-closed-beta-v1'")&&launchJs.includes("url.searchParams.get('businessKey')==='northern-lakes'")&&!launchJs.includes('script.google.com'));
check('owner activation uses exact-email Supabase invitation request',ownerLogin.includes('Send secure activation email')&&ownerLogin.includes('invite-activation.js')&&inviteJs.includes('business-office-invite-activation')&&inviteJs.includes('northern-lakes-owner-invite-activation'));
check('legacy Google Office is explicit rollback only',ownerLogin.includes('Emergency rollback only')&&ownerLogin.includes(packageConfig.existingAppsScriptDeploymentId)&&!ownerLogin.includes('window.location.replace'));
check('Supabase tenant pack is complete and isolated',supabasePack.package.systemOfRecord==='supabase'&&supabasePack.business.businessKey==='northern-lakes'&&supabasePack.storage.defaultProvider==='supabase'&&supabasePack.safeguards.googleRecordsImported===false&&supabasePack.legacyGoogleOffice.automaticLaunch===false);
check('shared Supabase Office launch page is presented',launcher.includes('Supabase Business Office')&&launcher.includes('owner-login.html')&&!launcher.includes('existing protected deployment'));

check('legacy NL PWA remains branded rollback source',pwa.includes('Northern Lakes Business Office')&&pwa.includes('diamond-logo.png')&&brand.includes('Northern Lakes Property Maintenance LLC'));
check('legacy NL PWA keeps isolated browser database',db.includes("DB_NAME='nlpm-commercial-offline'")&&!db.includes("DB_NAME='h38-commercial-offline'"));
check('legacy NL PWA keeps isolated opaque session',bridge.includes("SESSION_KEY='nlpm-gateway-session-v1'")&&!bridge.includes("SESSION_KEY='h38-gateway-session-v1'"));
check('legacy NL startup remains locally isolated',startup.includes('/businesses/northern-lakes/business-office.html')&&startup.includes("NLPM_SELECTED_BUSINESS_KEY='nlpm-selected-business'"));
check('legacy NL manifest remains installable and branded',manifest.name==='Northern Lakes Commercial Office'&&manifest.start_url==='./'&&manifest.icons.length>=2);
check('legacy NL gateway locks exact existing deployment',gateway.includes(packageConfig.existingAppsScriptProjectId)&&gateway.includes(packageConfig.existingAppsScriptDeploymentId)&&gateway.includes('nlpm-office-gateway'));
check('legacy NL gateway never exposes Google token',gateway.includes('browserReceivesGoogleToken: false')&&!gateway.includes('browserReceivesGoogleToken: true'));
check('legacy NL gateway has no wildcard CORS',!gateway.includes('access-control-allow-origin": "*"')&&!gateway.includes("'Access-Control-Allow-Origin':'*'"));
check('Supabase config preserves dedicated rollback function',supabase.includes('[functions.nlpm-office-gateway]')&&supabase.includes('verify_jwt = false'));
check('legacy builder retains isolated target values',builder.includes('northern-lakes-commercial-office-trial')&&builder.includes('nlpm-office-gateway')&&builder.includes('northernlakesproperty@gmail.com'));
check('H38 portal remains on standard Office',portal.includes('open-business-office.html')&&!portal.includes('AKfycbzr0hoImRF4iQ1gR90Cr17juP8PODkEWRorXxW6qralEYTGLhOU33E1wYEPU_3duQKpQg'));
check('H38 sign-in remains on secure launcher',signIn.includes('href="open-business-office.html"')&&!signIn.includes('portal.html#business-office'));

for(const file of ['businesses/northern-lakes/app-launch.js','businesses/northern-lakes/invite-activation.js']){
  try{new vm.Script(read(file),{filename:file});check(`syntax ${file}`,true);}
  catch(error){check(`syntax ${file}`,false,error.message);}
}

console.log(JSON.stringify({
  status:failures.length?'FAIL':'PASS',
  standardRuntime:'supabase-operational',
  standardBusinessKey:'northern-lakes',
  legacyGoogleOffice:'explicit-rollback-only',
  existingNlProjectPreserved:true,
  existingNlDeploymentPreserved:true,
  automaticInvitationEmail:false,
  automaticActivation:false,
  externalActionsEnabled:false,
  checks,failures
},null,2));
if(failures.length)process.exit(1);
