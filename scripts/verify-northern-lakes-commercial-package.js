#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const json=file=>JSON.parse(read(file));
const exists=file=>fs.existsSync(path.join(root,file));
const failures=[];
function check(name,condition,detail=''){if(!condition)failures.push(detail?`${name}: ${detail}`:name);}

const runtime=json('businesses/northern-lakes/app-deployment.json');
const pack=json('business-packs/northern-lakes/supabase-business-pack.json');
const launcher=read('businesses/northern-lakes/business-office.html');
const ownerPortal=read('businesses/northern-lakes/owner-portal.html');
const ownerLogin = read('businesses/northern-lakes/owner-login.html');
const ownerAccess=exists('businesses/northern-lakes/owner-access.html')?read('businesses/northern-lakes/owner-access.html'):ownerLogin;
const launchJs=read('businesses/northern-lakes/app-launch.js');
const inviteJs=read('businesses/northern-lakes/invite-activation.js');
const retiredPwa=read('businesses/northern-lakes/commercial-app/index.html');
const portal=read('portal.html');
const signIn=read('sign-in.html');

check('Supabase is the only Northern Lakes runtime',runtime.coreEngine==='supabase-operational'&&runtime.systemOfRecord==='supabase'&&runtime.businessKey==='northern-lakes'&&runtime.packageVersion==='nlps-supabase-closed-beta-v1');
check('legacy Office is fully disabled',runtime.legacyOfficeEnabled===false&&runtime.legacyOfficeFallback===false&&!runtime.legacyGoogleOffice);
check('external actions and Google import remain disabled',runtime.externalActionsEnabled===false&&runtime.automaticCustomerSending===false&&runtime.automaticFinancialActions===false&&runtime.automaticSocialPublishing===false&&runtime.googleRecordsImported===false);
check('launcher opens only shared Supabase tenant',launchJs.includes("config.coreEngine==='supabase-operational'")&&launchJs.includes("url.searchParams.get('businessKey')==='northern-lakes'")&&!/script\.google\.com|rollback/i.test(launchJs));
check('owner activation uses exact-email Supabase invitation',ownerAccess.includes('Send secure activation email')&&ownerAccess.includes('invite-activation.js')&&inviteJs.includes('business-office-invite-activation')&&inviteJs.includes('northern-lakes-owner-invite-activation'));
check('owner page exposes no old Office',ownerAccess.includes('Old Google Apps Script Office versions and old portal links are retired.')&&!/script\.google\.com|Emergency rollback|Open legacy|Open Owner Portal/i.test(ownerAccess));
check('legacy owner routes redirect to current owner access',ownerLogin.includes('owner-access.html?v=owner-access-20260805-v2')&&ownerPortal.includes('owner-access.html?v=owner-access-20260805-v2'));
check('tenant pack disables legacy Office',pack.package.systemOfRecord==='supabase'&&pack.business.businessKey==='northern-lakes'&&pack.storage.defaultProvider==='supabase'&&pack.safeguards.googleRecordsImported===false&&pack.safeguards.legacyOfficeEnabled===false&&pack.safeguards.legacyOfficeFallback===false);
check('shared launch pages are Supabase only',launcher.includes('Supabase Business Office')&&ownerPortal.includes('Supabase')&&!/script\.google\.com|rollback/i.test(launcher+ownerPortal));
check('old Northern Lakes PWA redirects to shared Supabase Office',retiredPwa.includes('old Office build is retired')&&retiredPwa.includes('businessKey=northern-lakes')&&!retiredPwa.includes('H38_GATEWAY_HANDOFF_PRESENT'));
check('root legacy Office route removed',!exists('legacy-business-office.html'));
check('H38 portal remains standard Supabase launcher',portal.includes('open-business-office.html'));
check('H38 sign-in remains secure launcher',signIn.includes('href="open-business-office.html"'));

for(const file of ['businesses/northern-lakes/app-launch.js','businesses/northern-lakes/invite-activation.js']){
  try{new vm.Script(read(file),{filename:file});}
  catch(error){failures.push(`${file} syntax: ${error.message}`);}
}

const result={
  status:failures.length?'FAIL':'PASS',
  standardRuntime:'supabase-operational',standardBusinessKey:'northern-lakes',
  legacyOfficeEnabled:false,legacyOfficeFallback:false,
  automaticInvitationEmail:false,automaticActivation:false,
  externalActionsEnabled:false,failures
};
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exit(1);
