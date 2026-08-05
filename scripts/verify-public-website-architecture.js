#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const childProcess=require('child_process');
const root=path.resolve(__dirname,'..');
const file=relative=>path.join(root,relative);
const read=relative=>fs.readFileSync(file(relative),'utf8');
const exists=relative=>fs.existsSync(file(relative));
const size=relative=>fs.statSync(file(relative)).size;
const count=(source,pattern)=>(source.match(pattern)||[]).length;
const failures=[];
const passes=[];
const warnings=[];
const check=(name,condition,detail='')=>{(condition?passes:failures).push({name,detail});console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${detail?` — ${detail}`:''}`);};
const warn=(name,detail='')=>{warnings.push({name,detail});console.warn(`WARN: ${name}${detail?` — ${detail}`:''}`);};

const governance=childProcess.spawnSync(process.execPath,[path.join(__dirname,'verify-change-governance.js')],{cwd:root,encoding:'utf8'});
if(governance.stdout)process.stdout.write(governance.stdout);
if(governance.stderr)process.stderr.write(governance.stderr);
if(governance.status!==0)process.exit(governance.status||1);

const routes=JSON.parse(read('scripts/config/public-website-routes.json'));
const canonicalJs='assets/js/h38-site-v2.js';
const canonicalCss='assets/css/h38-site-v2.css';
const capabilityCss='assets/css/project-intelligence.css';
const pricingData='pricing-data.js';
const requestOptions='assets/js/h38-request-options.js';
const requestFlow='request-flow.js';
const publicExamplesData='assets/js/uqb-public-examples.js';
const legacyGlobalScripts=['commercial.js','commercial-public.js','public-expansion.js','brand-global.js','assets/js/project-intelligence.js'];
const customerPages=routes.primary.filter(route=>route.visibility==='public');

check('route registry schema',routes.schemaVersion===1,routes.version||'');
for(const asset of [canonicalJs,canonicalCss,capabilityCss,pricingData,requestOptions,requestFlow,publicExamplesData])check(`${asset} exists`,exists(asset));

const shell=read(canonicalJs);
const shellCss=read(canonicalCss);
const capabilityStyles=read(capabilityCss);
const pricingSource=read(pricingData);
const requestController=read(requestOptions);
const secureRequest=read(requestFlow);
check('canonical shell has one navigation registry',count(shell,/navigation\s*:\s*\[/g)===1);
check('canonical shell has one footer registry',count(shell,/footer\s*:\s*\[/g)===1);
check('canonical shell owns header and footer rendering',/function mountHeader\(/.test(shell)&&/function mountFooter\(/.test(shell));
check('canonical shell has no page-wide observer',!/MutationObserver/.test(shell));
check('canonical shell preserves approved image policy',/imagePolicy:\{changeSource:false,insertImages:false,fallbackImages:false/.test(shell));
check('canonical shell handles mobile menu accessibly',/aria-expanded/.test(shell)&&/aria-controls/.test(shell)&&/wireMenu/.test(shell));
check('canonical shell JavaScript budget',size(canonicalJs)<=14000,`${size(canonicalJs)} bytes`);
check('canonical shell CSS budget',size(canonicalCss)<=24000,`${size(canonicalCss)} bytes`);
check('canonical stylesheet includes mobile behavior',/@media\(max-width:/.test(shellCss));

function shellHost(html){return html.match(/<(?:header|nav)\b[^>]*class=["'][^"']*(?:pi-nav|site-nav)[^"']*["'][^>]*>([\s\S]*?)<\/(?:header|nav)>/i);}
function footerHost(html){return html.match(/<footer\b[^>]*class=["'][^"']*(?:pi-footer|site-footer)[^"']*["'][^>]*>([\s\S]*?)<\/footer>/i);}
for(const route of customerPages){
  const page=route.path;
  check(`${page} exists`,exists(page));
  if(!exists(page))continue;
  const html=read(page);
  const scripts=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1].split('?')[0]);
  const styles=[...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1].split('?')[0]);
  const header=shellHost(html);
  const footer=footerHost(html);
  check(`${page} has one title`,count(html,/<title>/gi)===1);
  check(`${page} has one description`,count(html,/<meta\s+name=["']description["']/gi)===1);
  check(`${page} has one main landmark`,count(html,/<main\b/gi)===1);
  check(`${page} loads canonical shell once`,scripts.filter(src=>src===canonicalJs).length===1,scripts.join(', '));
  check(`${page} has empty shared header host`,Boolean(header)&&header[1].trim()==='');
  check(`${page} has empty shared footer host`,Boolean(footer)&&footer[1].trim()==='');
  check(`${page} excludes legacy global runtimes`,legacyGlobalScripts.every(src=>!scripts.includes(src)),scripts.join(', '));
  if(route.canonical)check(`${page} canonical URL`,html.includes(`href="${route.canonical}"`)||html.includes(`href='${route.canonical}'`),route.canonical);
  if(page==='start-request.html'){
    const allowed=[pricingData,'platform-states.js',canonicalJs,requestOptions,requestFlow];
    check('request page uses focused startup scripts',scripts.every(src=>allowed.includes(src))&&scripts.length===allowed.length,scripts.join(', '));
    check('request page keeps secure intake endpoint',/data-intake-endpoint=["']https:\/\/script\.google\.com\/macros\/s\//.test(html));
    check('request page keeps no-charge language',/No charge/i.test(html)&&/No charge is created/i.test(html));
  }else if(page==='sample-library-now.html'){
    const allowed=[canonicalJs,publicExamplesData];
    check('sample library public script budget',scripts.every(src=>allowed.includes(src))&&scripts.length===allowed.length,scripts.join(', '));
  }else check(`${page} public script budget`,scripts.length===1,scripts.join(', '));
  if(styles.length>7)warn(`${page} stylesheet count`,`${styles.length} stylesheets`);
}

const solutions=read('solutions.html');
const requiredCapabilities=['Automation & Robotics','CNC Machining & Process Planning','CNC Fixturing & Workholding','AI-Assisted Quote Builder','Highway 38 Business Office'];
const capabilityKeys=['automation','cnc','fixturing','quote-builder','business-office'];
const capabilityLinks=['robotics-automation.html','manufacturing-cnc.html','fixture-jig-concept-review.html','quote-builder.html','business-systems.html'];
const capabilityStart=solutions.indexOf('data-capability-section="primary"');
const capabilityEnd=solutions.indexOf('<section class="pi-section dark">',capabilityStart);
const capabilitySection=capabilityStart>=0&&capabilityEnd>capabilityStart?solutions.slice(capabilityStart,capabilityEnd):'';
check('What We Do names all five core capabilities',requiredCapabilities.every(label=>solutions.includes(label)));
check('What We Do links dedicated capability pages',capabilityLinks.every(route=>solutions.includes(`href="${route}"`)));
check('What We Do has one five-card capability grid',capabilitySection.length>0&&count(capabilitySection,/data-capability="/g)===5);
check('What We Do capability identities are complete',capabilityKeys.every(key=>capabilitySection.includes(`data-capability="${key}"`)));
check('What We Do has no retired fixed-price catalog',!/Choose your path|Problem Snapshot|Basic Layout Snapshot|Business Workflow Starter|Workflow Opportunity Snapshot|Digital Workflow Build/.test(solutions));
check('What We Do has no fixed-price cards',!/\$\d[\d,]*(?:\.\d{2})?/.test(solutions));
check('capability desktop layout is controlled',/\.pi-capability-grid\{[^}]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/.test(capabilityStyles));
check('capability phone layout is one column',/@media\(max-width:620px\)[\s\S]*\.pi-capability-grid[\s\S]*grid-template-columns:1fr/.test(capabilityStyles));

check('final pricing source exposes three software offers',count(pricingSource,/classification:'software'/g)===3);
check('final pricing source exposes one diagnostic',count(pricingSource,/classification:'diagnostic'/g)===1&&pricingSource.includes("id:'business-snapshot'"));
check('request controller has no submit handler',!/addEventListener\(['"]submit['"]/.test(requestController));
check('request controller owns final offer rendering',/renderOffers/.test(requestController)&&/selectedOffer/.test(requestController)&&/offerById/.test(requestController));
check('request controller prepares email fallback',/mailto:/.test(requestController)&&/email-summary/.test(requestController));
check('request controller JavaScript budget',size(requestOptions)<=18000,`${size(requestOptions)} bytes`);
check('secure request flow owns one submit handler',count(secureRequest,/addEventListener\(['"]submit['"]/g)===1);
check('secure request flow preserves idempotency',/idempotencyKey:getIdempotencyKey\(\)/.test(secureRequest));
check('secure request flow preserves draft storage',/saveDraft/.test(secureRequest)&&/restoreDraft/.test(secureRequest));
check('secure request flow JavaScript budget',size(requestFlow)<=18000,`${size(requestFlow)} bytes`);

for(const [page,target] of Object.entries(routes.retired||{})){
  check(`${page} retired route exists`,exists(page));
  if(!exists(page))continue;
  const html=read(page);
  check(`${page} redirects to ${target}`,html.includes(target),target);
  if(size(page)>5000)warn(`${page} should be a lightweight redirect`,`${size(page)} bytes`);
}

const privateGateway=routes.primary.find(route=>route.visibility==='private-gateway');
check('owner gateway is registered',Boolean(privateGateway));
if(privateGateway){
  check('owner gateway exists',exists(privateGateway.path),privateGateway.path);
  if(exists(privateGateway.path)){
    const html=read(privateGateway.path);
    const launcher=read('open-business-office.html');
    check('owner gateway remains noindex',/noindex,nofollow/.test(html));
    check('owner gateway routes to standard Office',html.includes("const target='open-business-office.html'")&&/location\.replace\(target\)/.test(html));
    check('standard launcher opens Supabase only',/commercial-app\/index\.html/.test(launcher)&&/location\.replace\(destination\.toString\(\)\)/.test(launcher)&&launcher.includes('Supabase is the only supported Office runtime.')&&!/script\.google\.com\/macros\/s\//.test(launcher));
    check('legacy Office route is removed',!exists('legacy-business-office.html'));
    check('launcher forwards businessKey',/\['page','shell','businessId','businessKey'\]/.test(launcher));
  }
}

const evidence={
  status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),
  architecture:'project-first-public-site-v2.4-plus-supabase-only-office',
  governance:'website-and-web-app-governance-v1',logoLocked:true,imagePlacementsLocked:true,
  pricingProducts:3,whatWeDoCapabilities:requiredCapabilities,canonicalShell:canonicalJs,
  standardOffice:'supabase-only',legacyOfficeRoute:false,
  passed:passes.length,failed:failures.length,warnings,passes,failures
};
const outDir=file('artifacts/public-website-architecture');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);
