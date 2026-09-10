#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
const syntax=file=>{try{new vm.Script(read(file),{filename:file});}catch(error){failures.push(file+' syntax: '+error.message);}};

const index=read('commercial-app/index.html');
const auth=read('commercial-app/supabase-auth.js');
const startup=read('commercial-app/supabase-startup.js');
const invite=read('commercial-app/supabase-invite-activation.js');
const autofill=read('commercial-app/auth-autofill.js');
const authCss=read('commercial-app/auth-autofill.css');
const employee=read('commercial-app/employee-workspace.js');
const people=read('commercial-app/app-19.js');
const worker=read('commercial-app/service-worker.js');
const customerHtml=read('customer-portal.html');
const customerClient=read('customer-portal-supabase.js');
const customerCss=read('ux-unified-public.css');

[
  'commercial-app/supabase-auth.js',
  'commercial-app/supabase-startup.js',
  'commercial-app/supabase-invite-activation.js',
  'commercial-app/auth-autofill.js',
  'commercial-app/employee-workspace.js',
  'commercial-app/app-19.js',
  'commercial-app/service-worker.js',
  'customer-portal-supabase.js'
].forEach(syntax);

check(index.includes('<body class="h38-auth-locked">'),'Office must start with unauthorized chrome locked before JavaScript resolves.');
check(authCss.includes('body.h38-auth-locked .top-actions')&&authCss.includes('body.h38-auth-locked .business-bar')&&authCss.includes('body.h38-auth-locked .main-nav'),'Signed-out Office controls must remain visually absent.');
check(startup.includes("classList.toggle('h38-auth-locked',!allowed)")&&startup.includes("classList.toggle('h38-auth-authorized',allowed)"),'Only an authorized snapshot may restore Office chrome.');
check(['Owner or administrator','Site manager / foreman','Employee','Customer'].every(label=>auth.includes(label)),'Office sign-in must explain every supported access path.');
check(auth.includes('Your choice does not grant a role.')&&auth.includes('Row Level Security decide exactly what opens.'),'Role guidance must not be represented as authorization.');
check(auth.includes('signInWithPassword({ email, password })')&&!/signInWithPassword\(\{[^}]*\b(role|access|intent)\b/.test(auth),'Office sign-in payload must contain credentials only, never a browser-selected role.');
check(auth.includes('href="../customer-portal.html"')&&!auth.includes('Google Office fallback'),'Office sign-in must route customers separately and expose no retired fallback.');
check(auth.includes('h38:auth-panel-rendered')&&invite.includes("addEventListener('h38:auth-panel-rendered',installActivationControl)")&&autofill.includes("window.addEventListener('h38:auth-panel-rendered',schedule)"),'Auth enhancements must use the explicit render event.');
check(!invite.includes('new MutationObserver')&&!autofill.includes('observe(main'),'Login enhancements must not scan the page with broad mutation observers.');
check(invite.includes('business-office-invite-activation')&&invite.includes('No password is handled by Highway 38.'),'Office activation must remain invitation-bound and password-free.');
check(!employee.includes('.auth.signUp')&&employee.includes('directAuthSignup:false')&&employee.includes('business-office-invite-activation'),'Employee access must not create arbitrary browser Auth users.');
check(employee.includes("dataset.h38InviteBusy==='1'")&&employee.includes('duplicateActivationGuard:true'),'Team Access must suppress duplicate membership and activation requests.');
check(employee.includes('siteManagerProfile:true')&&employee.includes('assigned-work Staff access'),'Site Manager must remain an explicit experience label over the approved Staff authorization boundary.');
check(people.includes("people:['manageUsers']")&&!people.includes("people:['manageUsers','manageField']"),'Employee and payroll administration must be owner/administrator-only.');
check(people.includes('h38LoadTeamAccessCompanion')&&people.includes('h38TeamAccessMount'),'Team Access must load on demand inside the canonical People route.');
check(customerHtml.includes('id="portalAccountActions" class="portal-actions" hidden'),'Customer account actions must start hidden.');
check(customerHtml.includes('First time here?')&&customerHtml.includes('Owner, site manager, or employee? Open H38 Office'),'Customer login must explain activation and route Office users correctly.');
check(customerClient.includes("accountActions.hidden=name!=='app'")&&customerClient.includes('shouldCreateUser: false'),'Customer controls require an authenticated app view and magic links cannot create accounts.');
check(customerCss.includes('#portalAccountActions[hidden]{display:none!important}'),'Customer signed-out controls must not be re-shown by author CSS.');
check(/const CACHE_NAME='h38-business-office-20260910-(?:\d{4}|nav-core-\d+)'/.test(worker),'Office service-worker cache must advance with the access/navigation surface.');

if(failures.length){
  console.error(JSON.stringify({status:'FAIL',acceptance:'H38_OFFICE_ACCESS',failures},null,2));
  process.exit(1);
}
console.log(JSON.stringify({
  status:'PASS',
  acceptance:'H38_OFFICE_ACCESS',
  canonicalOffice:true,
  roleGuidanceIsNotAuthorization:true,
  siteManagerProfile:'staff-assigned-work',
  employeeDirectSignup:false,
  invitationBoundActivation:true,
  customerPortalIsolated:true,
  signedOutChromeHidden:true
},null,2));
