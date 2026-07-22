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

const required=['assets/css/project-intelligence.css','assets/js/project-intelligence.js','platform-unified.css','platform-states.js','request-flow.js','customer-portal-ux.js','customer-portal-unification.js','index.html','solutions.html','products.html','start-request.html','customer-portal.html','supabase/migrations/20260717_customer_portal_quote_project_ux.sql','apps-script/unified-shell/Unified_PublicIntake.gs','apps-script/core-engine/owner-portal-next/Portal_OneShot_UX_Styles.html','apps-script/core-engine/owner-portal-next/Portal_OneShot_Client.html','apps-script/core-engine/owner-portal-next/Portal_Product_Unification_Styles.html','apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js','apps-script/core-engine/owner-portal-next/Portal_Index.html'];
required.forEach(file=>check(`required ${file}`,exists(file)));
['assets/js/project-intelligence.js','platform-states.js','request-flow.js','customer-portal-ux.js','customer-portal-unification.js','customer-portal-supabase.js','apps-script/core-engine/owner-portal-next/Portal_OneShot_Client.html'].forEach(file=>{try{new vm.Script(read(file),{filename:file});check(`syntax ${file}`,true);}catch(error){check(`syntax ${file}`,false,error.message);}});

const home=read('index.html');
need('index.html','class="pi-nav"','homepage uses current responsive navigation');
need('index.html','aria-label="Main navigation"','homepage navigation is labeled');
need('index.html','class="pi-menu" aria-expanded="false"','homepage provides accessible mobile navigation control');
need('index.html','From photos to plans.','homepage presents current primary promise');
need('index.html','profitable work.','homepage completes current primary promise');
need('index.html','Capture once. Use the information everywhere.','homepage explains the shared project record');
need('index.html','Start small. Scale as you grow.','homepage explains platform scalability');
check('homepage exposes contractor manufacturing automation and training paths',['Contractors & Builders','Manufacturing & CNC','Robotics & Automation','DIY & Training'].every(marker=>home.includes(marker)));
check('homepage exposes connected platform products',['Quote Builder','Job Guide','Business Office'].every(marker=>home.includes(marker)));
check('homepage preserves request examples products and contact routes',['start-request.html','sample-library-now.html','products.html','contact.html'].every(marker=>home.includes(marker)));
check('homepage uses verified local imagery',home.includes('assets/approved-website-images/')&&!/https?:[^"']+\.(?:jpg|jpeg|png|webp)/i.test(home));
check('homepage removes obsolete mockup shells',!home.includes('approved-homepage-mockup.png')&&!home.includes('class="hotspot')&&!home.includes('approved-home__stage'));

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
check('Owner product-unification styles included',portalIndex.includes('Portal_Product_Unification_Styles')&&raw.includes('Portal_Product_Unification_Styles'));
check('Owner one-shot client included',portalIndex.includes('Portal_OneShot_Client')&&raw.includes('Portal_OneShot_Client'));
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
