#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const childProcess=require('child_process');
const root=path.resolve(__dirname,'..');
const governance=childProcess.spawnSync(process.execPath,[path.join(__dirname,'verify-change-governance.js')],{cwd:root,encoding:'utf8'});
if(governance.stdout)process.stdout.write(governance.stdout);
if(governance.stderr)process.stderr.write(governance.stderr);
if(governance.status!==0)process.exit(governance.status||1);

const routes=JSON.parse(fs.readFileSync(path.join(root,'scripts/config/public-website-routes.json'),'utf8'));
const failures=[];
const passes=[];
const warnings=[];

function check(name,condition,detail=''){
  (condition?passes:failures).push({name,detail});
  console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${detail?` — ${detail}`:''}`);
}
function warn(name,detail=''){warnings.push({name,detail});console.warn(`WARN: ${name}${detail?` — ${detail}`:''}`);}
function file(relative){return path.join(root,relative);}
function read(relative){return fs.readFileSync(file(relative),'utf8');}
function exists(relative){return fs.existsSync(file(relative));}
function size(relative){return fs.statSync(file(relative)).size;}
function count(source,pattern){return (source.match(pattern)||[]).length;}
function shellHost(html){return html.match(/<(?:header|nav)\b[^>]*class=["'][^"']*(?:pi-nav|site-nav)[^"']*["'][^>]*>([\s\S]*?)<\/(?:header|nav)>/i);}
function footerHost(html){return html.match(/<footer\b[^>]*class=["'][^"']*(?:pi-footer|site-footer)[^"']*["'][^>]*>([\s\S]*?)<\/footer>/i);}

const canonicalJs='assets/js/h38-site-v2.js';
const canonicalCss='assets/css/h38-site-v2.css';
const capabilityCss='assets/css/project-intelligence.css';
const pricingData='pricing-data.js';
const requestOptions='assets/js/h38-request-options.js';
const requestFlow='request-flow.js';
const legacyGlobalScripts=['commercial.js','commercial-public.js','public-expansion.js','brand-global.js','assets/js/project-intelligence.js'];
const customerPages=routes.primary.filter(route=>route.visibility==='public');

check('route registry schema',routes.schemaVersion===1,routes.version||'');
check('canonical site script exists',exists(canonicalJs),canonicalJs);
check('canonical site stylesheet exists',exists(canonicalCss),canonicalCss);
check('capability stylesheet exists',exists(capabilityCss),capabilityCss);
check('final pricing data exists',exists(pricingData),pricingData);
check('focused request controller exists',exists(requestOptions),requestOptions);
check('secure request flow exists',exists(requestFlow),requestFlow);

const shell=read(canonicalJs);
const shellCss=read(canonicalCss);
const capabilityStyles=read(capabilityCss);
const pricingSource=read(pricingData);
const requestController=read(requestOptions);
const secureRequest=read(requestFlow);

check('canonical shell has one navigation registry',count(shell,/navigation\s*:\s*\[/g)===1);
check('canonical shell has one footer registry',count(shell,/footer\s*:\s*\[/g)===1);
check('canonical shell owns header and footer rendering',/function mountHeader\(/.test(shell)&&/function mountFooter\(/.test(shell));
check('canonical shell has no page-wide MutationObserver',!/MutationObserver/.test(shell));
check('canonical shell never changes content image sources',!/setAttribute\(\s*['"]src['"]|\.src\s*=\s*['"](?:assets\/|https?:\/\/)/.test(shell));
check('canonical shell preserves approved image policy',/imagePolicy:\{changeSource:false,insertImages:false,fallbackImages:false/.test(shell));
check('canonical shell handles mobile menu accessibly',/aria-expanded/.test(shell)&&/aria-controls/.test(shell)&&/wireMenu/.test(shell));
check('canonical shell JavaScript budget',size(canonicalJs)<=14000,`${size(canonicalJs)} bytes`);
check('canonical shell CSS budget',size(canonicalCss)<=24000,`${size(canonicalCss)} bytes`);
check('canonical stylesheet includes mobile behavior',/@media\(max-width:/.test(shellCss));

customerPages.forEach(route=>{
  const page=route.path;
  check(`${page} exists`,exists(page));
  if(!exists(page))return;
  const html=read(page);
  const scripts=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1].split('?')[0]);
  const styles=[...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1].split('?')[0]);
  const header=shellHost(html);
  const footer=footerHost(html);
  const directShell=scripts.filter(src=>src===canonicalJs).length;

  check(`${page} has one title`,count(html,/<title>/gi)===1);
  check(`${page} has one description`,count(html,/<meta\s+name=["']description["']/gi)===1);
  check(`${page} has one main landmark`,count(html,/<main\b/gi)===1);
  check(`${page} loads canonical shell directly`,directShell===1,scripts.join(', '));
  check(`${page} has one shared shell host`,Boolean(header));
  check(`${page} shared shell host is empty`,Boolean(header)&&header[1].trim()==='',header?header[1].trim().slice(0,80):'missing');
  check(`${page} has one shared footer host`,Boolean(footer));
  check(`${page} shared footer host is empty`,Boolean(footer)&&footer[1].trim()==='',footer?footer[1].trim().slice(0,80):'missing');
  check(`${page} does not load legacy global runtimes`,legacyGlobalScripts.every(src=>!scripts.includes(src)),scripts.join(', '));
  if(route.canonical)check(`${page} canonical URL`,html.includes(`href="${route.canonical}"`)||html.includes(`href='${route.canonical}'`),route.canonical);

  if(page==='start-request.html'){
    const allowed=[pricingData,'platform-states.js',canonicalJs,requestOptions,requestFlow];
    check('request page uses only focused startup scripts',scripts.every(src=>allowed.includes(src))&&scripts.length===allowed.length,scripts.join(', '));
    check('request page keeps secure endpoint',/data-intake-endpoint=["']https:\/\/script\.google\.com\/macros\/s\//.test(html));
    check('request page keeps no-charge language',/No charge/i.test(html)&&/No charge is created/i.test(html));
  }else{
    check(`${page} public script budget`,scripts.length===1,scripts.join(', '));
  }
  if(styles.length>7)warn(`${page} stylesheet count`,`${styles.length} stylesheets`);
});

const solutions=read('solutions.html');
const requiredCapabilities=['Automation & Robotics','CNC Machining & Process Planning','CNC Fixturing & Workholding','AI-Assisted Quote Builder','Highway 38 Business Office'];
const capabilityKeys=['automation','cnc','fixturing','quote-builder','business-office'];
const capabilityLinks=['robotics-automation.html','manufacturing-cnc.html','fixture-jig-concept-review.html','quote-builder.html','business-systems.html'];
const capabilityImages=['assets/approved-website-images/manufacturing-automation.jpg','assets/approved-website-images/12-cnc-machining-closeup.jpg','assets/approved-website-images/10-project-planning-documents.jpg','assets/approved-website-images/business-workflow-office.webp','assets/approved-website-images/13-digital-organization-file-system.jpg'];
const capabilityStart=solutions.indexOf('data-capability-section="primary"');
const capabilityEnd=solutions.indexOf('<section class="pi-section dark">',capabilityStart);
const capabilitySection=capabilityStart>=0&&capabilityEnd>capabilityStart?solutions.slice(capabilityStart,capabilityEnd):'';
const capabilityImageSources=[...capabilitySection.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1].split('?')[0]);
check('What We Do page names all five core capabilities',requiredCapabilities.every(label=>solutions.includes(label)),requiredCapabilities.join(', '));
check('What We Do page links to dedicated capability pages',capabilityLinks.every(route=>solutions.includes(`href="${route}"`)),capabilityLinks.join(', '));
check('What We Do page uses one primary capability section',capabilitySection.length>0&&count(solutions,/data-capability-section="primary"/g)===1);
check('What We Do page puts all five capabilities in one dedicated grid',/class="pi-capability-grid"/.test(capabilitySection)&&count(capabilitySection,/data-capability="/g)===5,`${count(capabilitySection,/data-capability="/g)} cards`);
check('What We Do capability identities are complete',capabilityKeys.every(key=>capabilitySection.includes(`data-capability="${key}"`)),capabilityKeys.join(', '));
check('What We Do uses locked local capability images',capabilityImages.every(src=>capabilityImageSources.includes(src)),capabilityImages.join(', '));
check('What We Do contains no remote capability images',!/<img\s+[^>]*src="https?:\/\//i.test(capabilitySection));
check('What We Do keeps exactly one action per capability',count(capabilitySection,/class="pi-link"/g)===5,`${count(capabilitySection,/class="pi-link"/g)} links`);
check('What We Do keeps three outcomes per capability',count(capabilitySection,/class="pi-list"/g)===5&&count(capabilitySection,/<div>[^<]+<\/div>/g)>=15);
check('What We Do page contains no retired product-path catalog',!/Choose your path|Problem Snapshot|Basic Layout Snapshot|Business Workflow Starter|Workflow Opportunity Snapshot|Digital Workflow Build/.test(solutions));
check('What We Do page contains no fixed-price product cards',!/\$\d[\d,]*(?:\.\d{2})?/.test(solutions));
check('What We Do page uses direct static capability content',!/<script[^>]+(?:catalog-data|business-systems-data|public-expansion|commercial\.js)/i.test(solutions));
check('capability desktop layout is three plus two',/\.pi-capability-grid\{[^}]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/.test(capabilityStyles)&&/\.pi-capability-card:nth-child\(n\+4\)\{grid-column:span 3\}/.test(capabilityStyles));
check('capability tablet layout is two columns',/@media\(max-width:980px\)[\s\S]*\.pi-capability-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(capabilityStyles));
check('capability phone layout is one column',/@media\(max-width:620px\)[\s\S]*\.pi-capability-grid[\s\S]*grid-template-columns:1fr/.test(capabilityStyles));
check('capability layout prevents horizontal overflow',/body\{[^}]*overflow-x:hidden/.test(capabilityStyles)&&/minmax\(0,1fr\)/.test(capabilityStyles));

check('final pricing source exposes three software offers',count(pricingSource,/classification:'software'/g)===3);
check('final pricing source exposes one separate diagnostic',count(pricingSource,/classification:'diagnostic'/g)===1&&pricingSource.includes("id:'business-snapshot'"));
check('request controller has no submit handler',!/addEventListener\(['"]submit['"]/.test(requestController));
check('request controller owns final offer rendering',/renderOffers/.test(requestController)&&/selectedOffer/.test(requestController)&&/offerById/.test(requestController));
check('request controller has no legacy catalog or bundle rendering',!/renderProductOptions|renderBundleOptions|renderSystemOptions|H38_CATALOG/.test(requestController));
check('request controller prepares email fallback',/mailto:/.test(requestController)&&/email-summary/.test(requestController));
check('request controller JavaScript budget',size(requestOptions)<=18000,`${size(requestOptions)} bytes`);
check('secure request flow owns the only submit handler',count(secureRequest,/addEventListener\(['"]submit['"]/g)===1);
check('secure request flow preserves idempotency',/idempotencyKey:getIdempotencyKey\(\)/.test(secureRequest));
check('secure request flow preserves draft storage',/saveDraft/.test(secureRequest)&&/restoreDraft/.test(secureRequest));
check('secure request flow JavaScript budget',size(requestFlow)<=18000,`${size(requestFlow)} bytes`);

Object.entries(routes.retired||{}).forEach(([page,target])=>{
  check(`${page} retired route exists`,exists(page));
  if(!exists(page))return;
  const html=read(page);
  check(`${page} redirects to ${target}`,html.includes(target),target);
  if(size(page)>5000)warn(`${page} should be reduced to a lightweight redirect`,`${size(page)} bytes`);
  if(html.includes(canonicalJs))warn(`${page} still loads the canonical shell`);
  if(/<img\b/i.test(html))warn(`${page} still contains content images`);
});

const privateGateway=routes.primary.find(route=>route.visibility==='private-gateway');
if(privateGateway){
  check('owner gateway exists',exists(privateGateway.path),privateGateway.path);
  if(exists(privateGateway.path)){
    const html=read(privateGateway.path);
    check('owner gateway remains noindex',/noindex,nofollow/.test(html));
    check('owner gateway redirects to existing Apps Script',/script\.google\.com\/macros\/s\//.test(html)&&/location\.replace\(target\)/.test(html));
  }
}

const evidence={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),architecture:'project-first-public-site-v2.4-final-pricing',governance:'website-and-web-app-governance-v1',logoLocked:true,imagePlacementsLocked:true,pricingProducts:3,whatWeDoCapabilities:requiredCapabilities,canonicalShell:canonicalJs,passed:passes.length,failed:failures.length,warnings,passes,failures};
const outDir=file('artifacts/public-website-architecture');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);
