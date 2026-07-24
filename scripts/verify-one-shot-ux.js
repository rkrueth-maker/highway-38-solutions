#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));
const failures=[];
const passes=[];
const check=(name,condition,detail='')=>(condition?passes:failures).push({name,detail});
const need=(file,marker,label)=>check(label,read(file).includes(marker),`${file} must contain ${marker}`);

const required=['assets/css/project-intelligence.css','assets/js/h38-site-v2.js','platform-unified.css','platform-states.js','request-flow.js','customer-portal-ux.js','customer-portal-unification.js','index.html','solutions.html','pricing.html','start-request.html','customer-portal.html','supabase/migrations/20260717_customer_portal_quote_project_ux.sql','apps-script/unified-shell/Unified_PublicIntake.gs','apps-script/core-engine/owner-portal-next/Portal_OneShot_UX_Styles.html','apps-script/core-engine/owner-portal-next/Portal_OneShot_Client.html','apps-script/core-engine/owner-portal-next/Portal_Product_Styles.html','apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js','apps-script/core-engine/owner-portal-next/Portal_Index.html'];
required.forEach(file=>check(`required ${file}`,exists(file)));
['assets/js/h38-site-v2.js','platform-states.js','request-flow.js','customer-portal-ux.js','customer-portal-unification.js','customer-portal-supabase.js','apps-script/core-engine/owner-portal-next/Portal_OneShot_Client.html'].forEach(file=>{try{new vm.Script(read(file),{filename:file});check(`syntax ${file}`,true);}catch(error){check(`syntax ${file}`,false,error.message);}});

const home=read('index.html');
const publicShell=read('assets/js/h38-site-v2.js');
need('index.html','class="pi-nav"','homepage uses current responsive navigation host');
check('canonical shell labels the main navigation',publicShell.includes('aria-label="Main navigation"'));
check('canonical shell provides accessible mobile navigation control',publicShell.includes('class="pi-menu"')&&publicShell.includes('aria-expanded="false"')&&publicShell.includes('aria-controls="h38-main-navigation"'));
need('index.html','Bring us the problem.','homepage presents current project-first promise');
need('index.html','complete project plan.','homepage completes current project-first promise');
need('index.html','See it. Scope it. Run it.','homepage explains the project-first workflow');
need('index.html','From first photo to final closeout.','homepage explains the connected project lifecycle');
check('homepage exposes the three accepted project steps',['See complete examples','Tell us about your project','Receive the working package'].every(marker=>home.includes(marker)));
check('homepage exposes connected deliverables',['Plans and visual concepts','Detailed quotes','Job-ready instructions','Connected Business Office'].every(marker=>home.includes(marker)));
check('homepage preserves current request examples solutions pricing and contact routes',['start-request.html','sample-library-now.html','solutions.html','pricing.html'].every(marker=>home.includes(marker))&&publicShell.includes("['Contact','contact.html']"));
check('homepage uses verified local imagery',home.includes('assets/')&&!/https?:[^"']+\.(?:jpg|jpeg|png|webp)/i.test(home));
check('homepage removes obsolete mockup shells',!home.includes('approved-homepage-mockup.png')&&!home.includes('class="hotspot')&&!home.includes('approved-home__stage'));
check('homepage does not restore retired product catalog as primary experience',!home.includes('Choose Your Path')&&!home.includes('Browse 15 products')&&!home.includes('9 bundles'));

const request=read('start-request.html');
const requestFlow=read('request-flow.js');
const publicIntake=read('apps-script/unified-shell/Unified_PublicIntake.gs');
[1,2,3].forEach(step=>check(`request step ${step}`,request.includes(`data-request-step="${step}"`)));
['What result do you need?','Tell us about the problem.','Contact and review.'].forEach(text=>check(`request copy ${text}`,request.includes(text)));
check('request has three primary choices',(request.match(/class="h38-choice-card"/g)||[]).length===3);
check('request has two secondary choices',(request.match(/class="h38-choice-link"/g)||[]).length===2);
check('first Continue is disabled until selection',/data-request-next disabled aria-disabled="true"/.test(request)&&requestFlow.includes('updateFirstContinue'));
check('request preserves approved selectors',request.includes('id="product"')&&request.includes('id="bundle"')&&request.includes('id="business-system-interest"'));
check('request preserves buying-term truth',['price','payment','turnaround','revisions','exclusions'].every(term=>request.toLowerCase().includes(term)));
check('request no-charge control',/No charge|no-charge/i.test(request));
check('secure submission remains owner reviewed',request.includes('id="request-submit"')&&request.includes('data-intake-endpoint=')&&publicIntake.includes('Owner Approval Required'));
check('email remains fallback only',request.includes('id="email-summary" hidden>Email fallback')&&requestFlow.includes('emailFallback'));
check('request progress survives refresh',requestFlow.includes('H38Platform.saveDraft')&&requestFlow.includes('H38Platform.loadDraft'));

const customer=read('customer-portal.html');
check('customer action required host',customer.includes('id="actionRequired"'));
check('customer current project host',customer.includes('id="currentProject"'));
check('customer project selector',customer.includes('id="projectSelector"')&&customer.includes('id="projectSelectorWrap"'));
check('customer complete quote review dialog',customer.includes('id="quoteReviewDialog"')&&customer.includes('id="quoteApproveConfirmed"'));
check('customer project-bound messages',customer.includes('id="messageProjectContext"'));
check('customer remains noindex',customer.includes('noindex,nofollow'));
const customerUx=read('customer-portal-ux.js');
check('quote approval occurs from complete review',customerUx.includes('openQuoteReview')&&customerUx.includes('quoteApproveConfirmed'));
check('incomplete quote terms block approval',customerUx.includes('quoteReviewComplete')&&customerUx.includes('approve.disabled=!available'));
const customerClient=read('customer-portal-supabase.js');
check('messages attach selected project',customerClient.includes('job_id: state.selectedJobId || null'));

const portalIndex=read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const raw=read('apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js');
check('Owner one-shot styles included',portalIndex.includes('Portal_OneShot_UX_Styles')&&raw.includes('Portal_OneShot_UX_Styles'));
check('Owner canonical product styles included',portalIndex.includes('Portal_Product_Styles')&&raw.includes('Portal_Product_Styles'));
check('Owner one-shot client included',portalIndex.includes('Portal_OneShot_Client')&&raw.includes('Portal_OneShot_Client'));
check('legacy portal product and control layers absent',!/(Portal_Product_Unification|Portal_ProductCenter|Portal_ProductApps|Portal_ControlPlane_Client|Portal_ControlPlane_Styles)/.test(portalIndex+raw));
const owner=read('apps-script/core-engine/owner-portal-next/Portal_OneShot_Client.html');
['Needs decision','Due today','Overdue','Money requiring attention','Next up','Recent activity'].forEach(marker=>check(`Owner Today marker ${marker}`,owner.includes(marker)));
check('Owner external actions remain gated',owner.includes('remain approval gated'));
check('Owner selected record controls preserved',read('apps-script/core-engine/owner-portal-next/Portal_Application_Client_Views.html').includes('Selected record only'));

const css=read('assets/css/project-intelligence.css');
check('current site responsive rules exist',css.includes('@media(max-width:980px)')&&css.includes('@media(max-width:620px)'));
check('mobile navigation collapses',css.includes('.pi-links{display:none')&&css.includes('.pi-links.open{display:flex}'));
check('workflow and card grids collapse for mobile',css.includes('.pi-flow')&&css.includes('grid-template-columns:1fr'));
check('interactive controls preserve usable sizing',read('visual-cleanup.css').includes('min-height:44px')&&read('platform-unified.css').includes('min-height:44px'));

const result={status:failures.length?'FAIL':'PASS',passed:passes.length,failed:failures.length,failures};
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
