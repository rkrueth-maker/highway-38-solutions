#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const failures=[],passes=[];
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));
const check=(name,condition,detail='')=>{(condition?passes:failures).push({name,detail});console.log(`${condition?'PASS':'FAIL'}: ${name}${detail?` — ${detail}`:''}`);};

const required=[
 'index.html','sample-library-now.html','solutions.html','pricing.html','about.html','contact.html','start-request.html','portal.html',
 'cabin-project-complete.html','contractor-quote-complete.html','assets/js/h38-site-v2.js','assets/css/h38-site-v2.css',
 'scripts/config/public-website-routes.json','scripts/config/approved-public-assets.json','scripts/config/approved-public-image-placements.json',
 'catalog-data.js','apps-script/commercial-intake/FormBuilder.gs'
];
required.forEach(file=>check(`required ${file}`,exists(file)));

const routeManifest=JSON.parse(read('scripts/config/public-website-routes.json'));
const primary=(routeManifest.primary||[]).map(item=>item.path);
const expectedPrimary=['index.html','sample-library-now.html','solutions.html','pricing.html','about.html','contact.html','start-request.html','portal.html'];
check('project-first route manifest owns the eight current gateways',expectedPrimary.every(path=>primary.includes(path))&&primary.length===8,JSON.stringify(primary));
check('retired catalog routes point to current project-first pages',routeManifest.retired&&routeManifest.retired['products.html']==='pricing.html'&&routeManifest.retired['catalog.html']==='pricing.html'&&routeManifest.retired['packages.html']==='pricing.html'&&routeManifest.retired['tools.html']==='sample-library-now.html');

const shell=read('assets/js/h38-site-v2.js');
check('one canonical public shell owns current navigation',['Project Examples','What We Do','Pricing','About','Contact','Owner Access'].every(label=>shell.includes(label))&&shell.includes('class="pi-menu"'));
check('canonical shell preserves Owner gateway',shell.includes("['Owner Access','portal.html']"));
check('canonical shell locks image source changes',/imagePolicy:\{changeSource:false,insertImages:false,fallbackImages:false/.test(shell));

const home=read('index.html');
check('homepage is project first',home.includes('Bring us the problem.')&&home.includes('complete project plan.')&&home.includes('See it. Scope it. Run it.'));
check('homepage routes to request and complete examples',home.includes('href="start-request.html"')&&home.includes('href="sample-library-now.html"'));
check('homepage does not restore retired catalog as primary experience',!home.includes('Choose Your Path')&&!home.includes('15 fixed-price services')&&!home.includes('9 approved bundles'));

const solutions=read('solutions.html');
const capabilities=['Automation & Robotics','CNC Machining & Process Planning','CNC Fixturing & Workholding','AI-Assisted Quote Builder','Highway 38 Business Office'];
check('What We Do exposes five accepted capabilities',capabilities.every(value=>solutions.includes(value))&&(solutions.match(/data-capability=/g)||[]).length===5);
check('What We Do uses specialist links',['robotics-automation.html','manufacturing-cnc.html','quote-builder.html','business-systems.html'].every(link=>solutions.includes(link)));
check('What We Do does not restore fixed-price product cards',!solutions.includes('Problem Snapshot')&&!solutions.includes('Basic Layout Snapshot')&&!solutions.includes('Workflow Opportunity Snapshot'));

const pricing=read('pricing.html');
check('pricing page is project first',pricing.includes('Project-first pricing')&&pricing.includes('Not a confusing catalog.')&&pricing.includes('The project scope drives the package.'));
check('pricing requires scope and price approval before implementation',pricing.includes('Scope and price are approved before implementation.')&&pricing.includes('Request Project Pricing'));

const samples=read('sample-library-now.html');
check('Project Examples contains eight complete examples',(samples.match(/class="project-card"/g)||[]).length===8&&samples.includes('Eight complete project demonstrations'));
check('Project Examples preserves representative disclosure',samples.includes('Representative demonstrations.')&&samples.includes('data-image-classification="hypothetical-demonstration"'));
const exactExampleImages=['deck-before.webp','deck-after.webp','irrigation-before.webp','irrigation-after.webp','kitchen-before.webp','kitchen-after.webp'];
check('deck irrigation and kitchen use six direct approved files',exactExampleImages.every(name=>samples.includes(`assets/demo-workthroughs/${name}`))&&!samples.includes('at.adobe.com')&&!samples.includes('background-image'));
check('cabin example includes plan and finished concept',samples.includes('cabin-plan-sheet.png')&&samples.includes('cabin-exterior-render.png')&&samples.includes('cabin-project-complete.html'));

const request=read('start-request.html');
const requestFlow=read('request-flow.js');
check('request page keeps three-step secure intake',[1,2,3].every(step=>request.includes(`data-request-step="${step}"`))&&request.includes('id="request-submit"')&&request.includes('data-intake-endpoint='));
check('request page preserves no-charge and Owner review language',/No charge|no-charge/i.test(request)&&/Owner review/i.test(request));
check('request page preserves draft recovery and email fallback',requestFlow.includes('H38Platform.saveDraft')&&requestFlow.includes('H38Platform.loadDraft')&&requestFlow.includes('emailFallback'));

const portal=read('portal.html');
check('public Owner gateway opens one unified Business Office',portal.includes('Opening Highway 38 Business Office')&&portal.includes('location.replace(target)')&&!/<iframe\b/i.test(portal));

const context={window:{}};
vm.createContext(context);
vm.runInContext(read('catalog-data.js'),context,{filename:'catalog-data.js'});
const catalog=context.window.H38_CATALOG;
check('retired catalog compatibility data remains complete',catalog&&catalog.products.length===15&&catalog.bundles.length===9);
if(catalog){
 const productIds=catalog.products.map(item=>item.id),bundleIds=catalog.bundles.map(item=>item.id);
 check('compatibility product and bundle IDs remain unique',new Set(productIds).size===productIds.length&&new Set(bundleIds).size===bundleIds.length);
 check('compatibility bundles reference existing products',catalog.bundles.every(bundle=>(bundle.products||[]).every(id=>productIds.includes(id))));
}

const formBuilder=read('apps-script/commercial-intake/FormBuilder.gs');
check('commercial form builder performs no automatic external action',!/createTrigger|newTrigger|sendEmail|GmailApp|MailApp|UrlFetchApp/.test(formBuilder));
check('commercial form builder preserves Owner review boundary',formBuilder.includes('OWNER REVIEW REQUIRED BEFORE LINK REPLACEMENT'));

const activeText=expectedPrimary.map(read).join('\n')+'\n'+shell;
check('public source contains no private owner email or committed secrets',!/rkrueth@gmail\.com|AIza[0-9A-Za-z_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._-]{20,}/i.test(activeText));
check('prohibited CNC quantity claim remains absent',!/25,000\+\s*(?:CNC\s+)?programs?/i.test(activeText));

const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),passed:passes.length,failed:failures.length,architecture:'project-first-public-site',catalogCompatibilityOnly:true,passes,failures};
const out=path.join(root,'artifacts','commercial-system');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
if(failures.length){console.error(JSON.stringify(result,null,2));process.exit(1);}console.log(JSON.stringify(result,null,2));
