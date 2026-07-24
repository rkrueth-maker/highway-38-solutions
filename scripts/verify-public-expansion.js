'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const exists=p=>fs.existsSync(path.join(root,p));
const read=p=>exists(p)?fs.readFileSync(path.join(root,p),'utf8'):'';
const failures=[],passes=[];
const check=(name,condition,detail='')=>{(condition?passes:failures).push({name,detail});};
const requireFile=p=>check(`required file ${p}`,exists(p),p);

[
 'index.html','sample-library-now.html','solutions.html','pricing.html','about.html','contact.html','start-request.html','portal.html',
 'cabin-project-complete.html','contractor-quote-complete.html','request-flow.js','assets/js/h38-site-v2.js','assets/css/h38-site-v2.css',
 'scripts/config/public-website-routes.json','scripts/config/approved-public-assets.json','scripts/config/approved-public-image-placements.json',
 'apps-script/unified-shell/Unified_PublicIntake.gs','catalog-data.js','docs/public-website/CUSTOM_DOMAIN_READINESS.md'
].forEach(requireFile);

const routes=JSON.parse(read('scripts/config/public-website-routes.json'));
const primary=(routes.primary||[]).map(item=>item.path);
const expected=['index.html','sample-library-now.html','solutions.html','pricing.html','about.html','contact.html','start-request.html','portal.html'];
check('eight current public gateways are canonical',expected.every(page=>primary.includes(page))&&primary.length===8,JSON.stringify(primary));
check('retired catalog and tool routes redirect to current pages',routes.retired['products.html']==='pricing.html'&&routes.retired['catalog.html']==='pricing.html'&&routes.retired['packages.html']==='pricing.html'&&routes.retired['tool-center.html']==='sample-library-now.html');

const shell=read('assets/js/h38-site-v2.js');
check('one public shell owns navigation and footer',/navigation\s*:\s*\[/.test(shell)&&/footer\s*:\s*\[/.test(shell)&&shell.includes('aria-label="Main navigation"'));
check('public shell contains current destinations',['Project Examples','What We Do','Pricing','About','Contact','Owner Access'].every(label=>shell.includes(label)));
check('public shell locks runtime image substitution',/imagePolicy:\{changeSource:false,insertImages:false,fallbackImages:false/.test(shell));

const home=read('index.html');
check('homepage presents project-first promise',home.includes('Bring us the problem.')&&home.includes('complete project plan.')&&home.includes('See it. Scope it. Run it.'));
check('homepage routes to request examples and capabilities',['start-request.html','sample-library-now.html','solutions.html'].every(link=>home.includes(`href="${link}"`)));
check('homepage uses approved local images without mockup repair',home.includes('assets/')&&!home.includes('approved-homepage-mockup.png')&&!/https?:[^"']+\.(?:jpg|jpeg|png|webp)/i.test(home));
check('homepage does not restore retired catalog experience',!home.includes('Choose Your Path')&&!home.includes('15 fixed-price services')&&!home.includes('9 approved bundles'));

const solutions=read('solutions.html');
const capabilities=['Automation & Robotics','CNC Machining & Process Planning','CNC Fixturing & Workholding','AI-Assisted Quote Builder','Highway 38 Business Office'];
check('What We Do contains five connected capabilities',(solutions.match(/data-capability=/g)||[]).length===5&&capabilities.every(label=>solutions.includes(label)));
check('capabilities route to specialist pages',['robotics-automation.html','manufacturing-cnc.html','fixture-jig-concept-review.html','quote-builder.html','business-systems.html'].every(link=>solutions.includes(link)));

const pricing=read('pricing.html');
check('pricing is scope-driven instead of catalog-driven',pricing.includes('Project-first pricing')&&pricing.includes('Not a confusing catalog.')&&pricing.includes('The project scope drives the package.'));
check('pricing requires approval before implementation',pricing.includes('Scope and price are approved before implementation.')&&pricing.includes('Request Project Pricing'));

const samples=read('sample-library-now.html');
check('Project Examples contains eight complete demonstrations',(samples.match(/class="project-card"/g)||[]).length===8&&samples.includes('Eight complete project demonstrations'));
check('Project Examples preserves hypothetical disclosure',samples.includes('Representative demonstrations.')&&samples.includes('data-image-classification="hypothetical-demonstration"'));
check('Project Examples uses six exact controlled replacement images',['deck-before.webp','deck-after.webp','irrigation-before.webp','irrigation-after.webp','kitchen-before.webp','kitchen-after.webp'].every(name=>samples.includes(`assets/demo-workthroughs/${name}`))&&!samples.includes('at.adobe.com'));
check('Project Examples includes complete cabin package',samples.includes('cabin-plan-sheet.png')&&samples.includes('cabin-exterior-render.png')&&samples.includes('cabin-project-complete.html'));

const request=read('start-request.html');
const requestFlow=read('request-flow.js');
const intake=read('apps-script/unified-shell/Unified_PublicIntake.gs');
check('request flow preserves three controlled steps',[1,2,3].every(step=>request.includes(`data-request-step="${step}"`)));
check('request form uses secure existing intake endpoint',request.includes('data-intake-endpoint="https://script.google.com/macros/s/'));
check('request saves progress and returns confirmation',requestFlow.includes('H38Platform.saveDraft')&&requestFlow.includes('H38Platform.loadDraft')&&requestFlow.includes('Request received')&&requestFlow.includes('requestId'));
check('request keeps email as fallback only',requestFlow.includes('emailFallback')&&request.includes('id="email-summary" hidden'));
check('intake remains duplicate-protected and Owner reviewed',intake.includes('DUPLICATE_ACCEPTED')&&intake.includes('Owner Approval Required')&&intake.includes('External actions remain locked'));

const contact=read('contact.html');
check('contact offers quick email and conversation request',contact.includes('Email a quick message')&&contact.includes('Request a conversation')&&contact.includes('Nothing is sent automatically'));
const portal=read('portal.html');
check('Owner gateway opens the existing unified Business Office',portal.includes('Opening Highway 38 Business Office')&&portal.includes('location.replace(target)')&&!/<iframe\b/i.test(portal));

const context={window:{}};
vm.createContext(context);
vm.runInContext(read('catalog-data.js'),context,{filename:'catalog-data.js'});
const catalog=context.window.H38_CATALOG;
check('legacy catalog compatibility data remains intact',catalog&&catalog.products.length===15&&catalog.bundles.length===9);
check('custom-domain work remains approval gated',read('docs/public-website/CUSTOM_DOMAIN_READINESS.md').includes('NO DOMAIN, BILLING, OR DNS CHANGE AUTHORIZED'));
check('prohibited quantitative CNC claim is absent',!/25,000\+\s*(?:CNC\s+)?programs?/i.test(expected.map(read).join('\n')));

const result={status:failures.length?'FAIL':'PASS',architecture:'project-first-public-site',canonicalRoutes:primary.length,projectExamples:8,capabilities:5,catalogCompatibilityOnly:true,passed:passes.length,failed:failures.length,failures};
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
