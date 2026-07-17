#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));
const failures=[];
const pass=[];
const check=(name,condition,detail='')=>(condition?pass:failures).push({name,detail});
const need=(file,marker,label)=>check(label,read(file).includes(marker),`${file} must contain ${marker}`);

const required=[
  'ux-unified-public.css','request-flow.js','customer-portal-ux.js','index.html','products.html','start-request.html','customer-portal.html','public-expansion.js',
  'supabase/migrations/20260717_customer_portal_quote_project_ux.sql',
  'apps-script/core-engine/owner-portal-next/Portal_OneShot_UX_Styles.html','apps-script/core-engine/owner-portal-next/Portal_OneShot_Client.html',
  'apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js','apps-script/core-engine/owner-portal-next/Portal_Index.html'
];
required.forEach(file=>check(`required ${file}`,exists(file)));

['public-expansion.js','request-flow.js','customer-portal-ux.js','customer-portal-supabase.js','apps-script/core-engine/owner-portal-next/Portal_OneShot_Client.html'].forEach(file=>{
  try{new vm.Script(read(file),{filename:file});check(`syntax ${file}`,true);}catch(error){check(`syntax ${file}`,false,error.message);}
});

const publicExpansion=read('public-expansion.js');
need('public-expansion.js','Solutions & Pricing','public navigation uses one commercial label');
need('public-expansion.js','Examples','public navigation uses Examples');
need('public-expansion.js','Customer Portal','public navigation exposes customer access');
need('public-expansion.js','Owner Login','one public owner-access label');
check('draft offers excluded from primary public navigation',!publicExpansion.includes('["services"')&&!publicExpansion.includes('["business-os"'));

const home=read('index.html');
need('index.html','h38-home-hero','homepage uses approved split hero');
need('index.html','Big problems.','homepage preserves primary promise');
need('index.html','Clear plans.','homepage preserves primary promise completion');
need('index.html','Plans, workflows, and business systems built around the real problem.','homepage uses approved specific supporting line');
need('index.html','h38-outcome-grid','homepage routes by outcome');
need('index.html','h38-trust-strip','homepage shows buying assurances');
need('index.html','homepage-hero-garage-workspace.webp','homepage uses approved representative image');
check('unsupported On Time On Point claim absent',!home.includes('On Time. On Point.'));
check('representative hero image remains classified',home.includes('data-image-classification="representative-environment"')&&home.includes('Representative planning environment—not customer proof.'));

const request=read('start-request.html');
const requestFlow=read('request-flow.js');
[1,2,3].forEach(step=>check(`request step ${step}`,request.includes(`data-request-step="${step}"`)));
['What result do you need?','Tell us about the problem.','Contact and review.'].forEach(text=>check(`request copy ${text}`,request.includes(text)));
check('request has three primary choices',(request.match(/class="h38-choice-card"/g)||[]).length===3);
check('request has primary grid classification',request.includes('h38-choice-grid--primary'));
check('request has two smaller secondary choices',(request.match(/class="h38-choice-link"/g)||[]).length===2&&request.includes('I know the exact service')&&request.includes('Help me choose'));
check('first Continue is disabled until selection',/data-request-next disabled aria-disabled="true"/.test(request)&&requestFlow.includes('updateFirstContinue'));
check('selected state is visibly stronger',request.includes('h38-choice-check')&&read('ux-unified-public.css').includes('.h38-choice-card.is-selected'));
check('request preserves approved catalog selectors',request.includes('id="product"')&&request.includes('id="bundle"')&&request.includes('id="business-system-interest"'));
check('request preserves buying-term truth',['price','payment','turnaround','revisions','exclusions'].every(term=>request.toLowerCase().includes(term)));
check('request no-charge control',/No charge|no-charge/i.test(request));
check('final request review is complete',['Selected outcome','Customer summary','Files expected','Contact information','What happens next'].every(marker=>requestFlow.includes(marker)));
check('request uses one visible final submission action',request.includes('id="request-submit"')&&request.includes('type="submit">Open email to submit</button>')&&request.includes('id="email-summary" hidden'));
check('second external web form remains hidden',request.includes('id="open-form"')&&request.includes('hidden>Open Approved Request Form'));
check('single final action opens prepared email',requestFlow.includes('openPreparedEmail')&&requestFlow.includes('window.location.href=href'));

const customer=read('customer-portal.html');
check('customer action required host',customer.includes('id="actionRequired"'));
check('customer current project host',customer.includes('id="currentProject"'));
check('customer multiple-project selector',customer.includes('id="projectSelector"')&&customer.includes('id="projectSelectorWrap"'));
check('customer complete quote review dialog',customer.includes('id="quoteReviewDialog"')&&customer.includes('id="quoteReviewDetails"')&&customer.includes('id="quoteApproveConfirmed"'));
check('customer project-bound message context',customer.includes('id="messageProjectContext"'));
check('customer mobile bottom navigation',['Home','Projects','Files','Messages','More'].every(label=>customer.includes(`<span>${label}</span>`)));
check('customer UX enhancement loaded',customer.includes('customer-portal-ux.js'));
check('customer portal remains noindex',customer.includes('noindex,nofollow'));
const customerUx=read('customer-portal-ux.js');
check('quote approval only occurs from complete review',customerUx.includes('openQuoteReview')&&customerUx.includes('quoteApproveConfirmed')&&!customerUx.includes('approve.focus')&&!customerUx.includes('approve.click'));
check('quote review exposes required terms',['Deliverables','Price','Timing','Revision allowance','Exclusions','Approval consequence'].every(marker=>customerUx.includes(marker)));
check('incomplete quote terms block approval',customerUx.includes('quoteReviewComplete')&&customerUx.includes('approve.disabled=!available')&&customerUx.includes('approval is unavailable'));
check('quote change becomes project-bound owner-review message',customerUx.includes('Request a change')&&customerUx.includes('messageBody')&&customerUx.includes('quote.job_id'));
check('project timeline includes next expected event',customerUx.includes('Next step:')&&customerUx.includes('Expected update:'));
const customerClient=read('customer-portal-supabase.js');
check('messages attach selected project',customerClient.includes('job_id: state.selectedJobId || null'));
check('summary quote approval removed',customerClient.includes('data-review-quote')&&!customerClient.includes('data-approve-quote'));

const portalIndex=read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const raw=read('apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js');
check('Owner one-shot styles included',portalIndex.includes('Portal_OneShot_UX_Styles')&&raw.includes('Portal_OneShot_UX_Styles'));
check('Owner one-shot client included',portalIndex.includes('Portal_OneShot_Client')&&raw.includes('Portal_OneShot_Client'));
const owner=read('apps-script/core-engine/owner-portal-next/Portal_OneShot_Client.html');
['Needs decision','Due today','Overdue','Money requiring attention','Next up',"Today\\'s calendar",'Recent activity'].forEach(marker=>check(`Owner Today marker ${marker}`,owner.includes(marker)));
check('Owner uses four primary metrics',(owner.match(/h38RoleMetric\(/g)||[]).length===4);
check('Owner holds and errors are conditional alert',owner.includes('h38OwnerAttentionStrip')&&owner.includes("if(!holdCount)return ''"));
check('Owner Next Up distinguishes waiting state',['Assigned to me','Waiting on customer','Waiting on another user','Blocked'].every(marker=>owner.includes(marker)));
check('Owner system health is not a permanent dashboard card',!owner.includes('<section class="ux-section"><h2>System health</h2>'));
check('Owner external actions remain gated',owner.includes('remain approval gated'));
check('Owner selected record controls preserved',read('apps-script/core-engine/owner-portal-next/Portal_Application_Client_Views.html').includes('Selected record only'));

const css=read('ux-unified-public.css');
['h38-home-hero','h38-portal-mobile-nav','@media(max-width:760px)'].forEach(marker=>check(`responsive visual contract ${marker}`,css.includes(marker)));
check('public outcome cards collapse 2x2 then 1x1',css.includes('.h38-outcome-grid{grid-template-columns:repeat(2,1fr)}')&&css.includes('.h38-outcome-grid,.h38-trust-strip__inner{grid-template-columns:1fr}'));
check('request choices stack on mobile',css.includes('@media(max-width:760px)')&&css.includes('.h38-choice-grid{grid-template-columns:1fr}'));
check('interactive controls meet minimum target',css.includes('min-height:44px'));
const ownerCss=read('apps-script/core-engine/owner-portal-next/Portal_OneShot_UX_Styles.html');
check('Owner four-metric layout',ownerCss.includes('repeat(4,minmax(170px,1fr))'));
check('Owner text and rows enlarged',ownerCss.includes('font-size:15px')&&ownerCss.includes('min-height:68px'));
check('Owner responsive metric collapse',ownerCss.includes('@media(max-width:1180px)')&&ownerCss.includes('@media(max-width:850px)')&&ownerCss.includes('@media(max-width:520px)'));

const result={status:failures.length?'FAIL':'PASS',passed:pass.length,failed:failures.length,failures};
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
