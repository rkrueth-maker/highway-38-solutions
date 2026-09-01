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
const check=(name,condition,detail='')=>{if(!condition)failures.push(detail?`${name}: ${detail}`:name);};
const has=(source,tokens)=>tokens.every(token=>source.includes(token));

const browserFiles=[
  'commercial-app/supabase-invite-activation.js',
  'commercial-app/supabase-client-branding.js',
  'commercial-app/supabase-client-installer.js',
  'commercial-app/supabase-client-quote-branding.js',
  'commercial-app/supabase-no-legacy-office.js',
  'businesses/northern-lakes/app-launch.js',
  'businesses/northern-lakes/invite-activation.js'
];
for(const file of browserFiles){
  const source=read(file);
  try{new vm.Script(source,{filename:file});}
  catch(error){failures.push(`${file} syntax: ${error.message}`);}
  check(`${file} has no privileged browser key`,!/(sb_service_role_|sb_secret_|SUPABASE_SERVICE_ROLE_KEY\s*=|client_secret\s*[:=]|refresh_token\s*[:=])/i.test(source));
}

const installer=read('supabase/migrations/20260805063000_client_tenant_installer.sql');
const hardening=read('supabase/migrations/20260805063200_harden_client_tenant_installer_wrappers.sql');
const advisorHardening=read('supabase/migrations/20260901223000_business_office_advisor_hardening.sql');
const northernLakes=read('supabase/migrations/20260805063500_northern_lakes_closed_beta_tenant.sql');
const retirement=read('supabase/migrations/20260805064000_retire_legacy_offices.sql');
const edge=read('supabase/functions/business-office-invite-activation/index.ts');
const index=read('commercial-app/index.html');
const worker=read('commercial-app/service-worker.js');
const inviteClient=read('commercial-app/supabase-invite-activation.js');
const branding=read('commercial-app/supabase-client-branding.js');
const installerUi=read('commercial-app/supabase-client-installer.js');
const quoteBranding=read('commercial-app/supabase-client-quote-branding.js');
const noLegacy=read('commercial-app/supabase-no-legacy-office.js');
const deployment=json('businesses/northern-lakes/app-deployment.json');
const pack=json('business-packs/northern-lakes/supabase-business-pack.json');
const ownerLogin=read('businesses/northern-lakes/owner-login.html');
const ownerAccess=read('businesses/northern-lakes/owner-access.html');
const businessOffice=read('businesses/northern-lakes/business-office.html');
const retiredNlOffice=read('businesses/northern-lakes/commercial-app/index.html');
const launch=read('businesses/northern-lakes/app-launch.js');

check('legacy root Office route removed',!exists('legacy-business-office.html'));
check('installer creates onboarding table with RLS',has(installer,[
  'create table if not exists public.business_onboarding_runs',
  'alter table public.business_onboarding_runs enable row level security',
  'business administrators read onboarding state'
]));
check('advisor hardening preserves both onboarding read paths and owner writes',has(advisorHardening,[
  'drop policy if exists "platform owners manage onboarding runs"',
  'drop policy if exists "business administrators read onboarding state"',
  'create policy "business administrators and platform owners read onboarding state"',
  'create policy "platform owners insert onboarding runs"',
  'create policy "platform owners update onboarding runs"',
  'create policy "platform owners delete onboarding runs"',
  'private.platform_owner_access((select auth.uid()))',
  "private.business_access(business_id, array['owner', 'administrator'])"
])&&(advisorHardening.match(/on public\.business_onboarding_runs for select/g)||[]).length===1);
check('installer restricted to active Highway 38 Owner',has(installer,[
  "business.business_key = 'highway38'", "membership.role = 'owner'",
  "membership.status = 'active'", 'Highway 38 Owner authorization is required.'
]));
check('provisioning and activation are separate',has(installer,[
  "'provisioning'",'create or replace function public.provision_client_business',
  'create or replace function public.activate_client_business',"'automaticActivation', false"
]));
check('installer seeds client records and support access',has(installer,[
  "'GENERIC-QUOTE-CUSTOMER'","'CLIENT-ONBOARDING-CHECKLIST'",
  "'H38-CUSTOMER-VISIBLE-SUPPORT'","'supportAccess'"
]));
check('installer defaults to private Supabase storage',has(installer,[
  "'business-office-files'","'client_google_drive_supported', true",
  "'oauth_secrets_in_browser', false"
]));
check('installer never enables external actions or Google import',has(installer,[
  "'externalActionsEnabled', false","'googleRecordImportEnabled', false"
])&&!installer.includes("'externalActionsEnabled', true"));
check('public installer wrappers are security definer and authenticated',has(hardening,[
  'security definer','v_actor uuid := auth.uid()',
  'private.provision_client_business_internal','private.activate_client_business_internal'
]));

check('Northern Lakes seed uses reusable installer and remains provisioning',has(northernLakes,[
  'private.provision_client_business_internal',"'northern-lakes'",
  "'northernlakesproperty@gmail.com'","'mandakw55@gmail.com'",
  "'invitationEmailSent', false","'automaticActivation', false"
])&&!northernLakes.includes('public.activate_client_business'));
check('retirement migration disables all Office fallbacks',has(retirement,[
  "'legacyOfficeEnabled', false","'legacyOfficeFallback', false",
  "'LEGACY_OFFICE_DISABLED'","'supportedRuntime', 'supabase'",
  "'publicLegacyRouteRemoved', true"
]));

check('invite function is exact pending-invitation only',has(edge,[
  '.from("business_memberships")','.eq("status", "invited")',
  '.is("auth_user_id", null)','.ilike("invited_email", email)',
  'business.status === "provisioning" || business.status === "active"'
]));
check('invite function is non-enumerating and rate limited',has(edge,[
  'requestOutcomeDisclosed: false','REQUEST_COOLDOWN_MS',
  'BUSINESS_INVITATION_EMAIL_SENT','If this email has a pending Business Office invitation'
]));
check('invite function sends only user-requested auth invitation',has(edge,[
  'admin.auth.admin.inviteUserByEmail','ownerRequestedActivation: true',
  'automaticBusinessActivation: false','external_action_occurred: true'
]));
check('invite function never handles a password',has(edge,[
  'passwordHandledByFunction: false','serviceRoleExposedToBrowser: false'
])&&!/password\s*[:=]\s*body/i.test(edge));
check('invite function limits browser origins',has(edge,[
  'ALLOWED_ORIGINS','https://highway38solutions.com','https://rkrueth-maker.github.io'
])&&!edge.includes('access-control-allow-origin": "*"'));

const order=[
  'supabase-auth.js','supabase-invite-activation.js','app-17.js','supabase-runtime-globals.js',
  'supabase-data.js','supabase-client-branding.js','supabase-storage-provider.js',
  'supabase-client-installer.js','supabase-final-startup.js','app-18.js','app-20.js',
  'supabase-client-quote-branding.js','supabase-no-legacy-office.js'
];
let previous=-1;
for(const file of order){const position=index.indexOf(file);check(`script order ${file}`,position>previous);previous=position;}
check('PWA caches onboarding and retirement adapters',has(worker,[
  'supabase-invite-activation.js','supabase-client-branding.js',
  'supabase-client-installer.js','supabase-client-quote-branding.js',
  'supabase-no-legacy-office.js'
]));
check('sign-in page can request activation without handling password',has(inviteClient,[
  'Activate invitation','business-office-invite-activation','passwordHandledByHighway38:false'
]));
check('shared Office applies active business identity',has(branding,[
  "document.title=`${businessName} Business Office`",
  "document.documentElement.style.setProperty('--navy',primary)",
  "logoNode.alt=`${businessName} logo`"
]));
check('client installer UI requires Highway 38 Owner',has(installerUi,[
  "businessKey==='highway38'",'snapshot?.user?.owner===true',
  'activate_client_business','suspend_client_business'
]));
check('client quotes use active tenant identity',has(quoteBranding,[
  'currentBusiness()','currentBrand()','businessName()','publicEmail()','safeLogo()',
  'Nothing is automatically approved or sent.','H38_CLIENT_QUOTE_BRANDING'
]));
check('runtime blocks all legacy Office controls',has(noLegacy,[
  'publicRouteRemoved: true','automaticFallback: false','manualFallback: false',
  "supportedRuntime: 'supabase'"
]));

check('Northern Lakes runtime points only to Supabase',deployment.coreEngine==='supabase-operational'&&deployment.systemOfRecord==='supabase'&&deployment.businessKey==='northern-lakes'&&deployment.storageProvider==='supabase'&&deployment.legacyOfficeEnabled===false&&deployment.legacyOfficeFallback===false);
check('Northern Lakes business pack disables legacy Office',pack.package.systemOfRecord==='supabase'&&pack.release.stage==='closed-beta'&&pack.safeguards.legacyOfficeEnabled===false&&pack.safeguards.legacyOfficeFallback===false);
check('Northern Lakes owner page has no rollback',ownerAccess.includes('Send secure activation email')&&ownerAccess.includes('Old Google Apps Script Office versions and old portal links are retired.')&&!/script\.google\.com|rollback/i.test(ownerAccess)&&ownerLogin.includes('owner-access.html?v=owner-access-20260805-v2'));
check('Northern Lakes launch pages use Supabase only',businessOffice.includes('Supabase Business Office')&&launch.includes("config.coreEngine==='supabase-operational'")&&!/script\.google\.com|rollback/i.test(launch));
check('old Northern Lakes Office redirects to current Supabase Office',retiredNlOffice.includes('old Office build is retired')&&retiredNlOffice.includes('businessKey=northern-lakes')&&!retiredNlOffice.includes('H38_GATEWAY_HANDOFF_PRESENT'));

const result={
  status:failures.length?'FAIL':'PASS',failures,
  systemOfRecord:'supabase',clientInstaller:true,northernLakesClosedBeta:true,
  automaticInvitationEmail:false,automaticActivation:false,googleRecordsImported:false,
  legacyOfficeEnabled:false,legacyOfficeFallback:false,externalActionsEnabled:false
};
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exit(1);
