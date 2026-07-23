#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
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
function shellHost(html){
  return html.match(/<(?:header|nav)\b[^>]*class=["'][^"']*(?:pi-nav|site-nav)[^"']*["'][^>]*>([\s\S]*?)<\/(?:header|nav)>/i);
}
function footerHost(html){
  return html.match(/<footer\b[^>]*class=["'][^"']*(?:pi-footer|site-footer)[^"']*["'][^>]*>([\s\S]*?)<\/footer>/i);
}

const canonicalJs='assets/js/h38-site-v2.js';
const canonicalCss='assets/css/h38-site-v2.css';
const requestOptions='assets/js/h38-request-options.js';
const requestFlow='request-flow.js';
const legacyGlobalScripts=['commercial.js','commercial-public.js','public-expansion.js','brand-global.js','assets/js/project-intelligence.js'];
const customerPages=routes.primary.filter(route=>route.visibility==='public');

check('route registry schema',routes.schemaVersion===1,routes.version||'');
check('canonical site script exists',exists(canonicalJs),canonicalJs);
check('canonical site stylesheet exists',exists(canonicalCss),canonicalCss);
check('focused request controller exists',exists(requestOptions),requestOptions);
check('secure request flow exists',exists(requestFlow),requestFlow);

const shell=read(canonicalJs);
const shellCss=read(canonicalCss);
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
    const allowed=['catalog-data.js','business-systems-data.js','platform-states.js',canonicalJs,requestOptions,requestFlow];
    check('request page uses only focused startup scripts',scripts.every(src=>allowed.includes(src))&&scripts.length===allowed.length,scripts.join(', '));
    check('request page keeps secure endpoint',/data-intake-endpoint=["']https:\/\/script\.google\.com\/macros\/s\//.test(html));
    check('request page keeps no-charge language',/No charge/i.test(html)&&/No charge is created/i.test(html));
  }else{
    check(`${page} public script budget`,scripts.length===1,scripts.join(', '));
  }
  if(styles.length>4)warn(`${page} stylesheet count`,`${styles.length} stylesheets`);
});

check('request controller has no submit handler',!/addEventListener\(['"]submit['"]/.test(requestController));
check('request controller owns approved option rendering',/renderProductOptions/.test(requestController)&&/renderBundleOptions/.test(requestController)&&/renderSystemOptions/.test(requestController));
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

const evidence={
  status:failures.length?'HOLD':'PASS',
  generatedAt:new Date().toISOString(),
  architecture:'project-first-public-site-v2',
  logoLocked:true,
  imagePlacementsLocked:true,
  canonicalShell:canonicalJs,
  passed:passes.length,
  failed:failures.length,
  warnings,
  passes,
  failures
};
const outDir=file('artifacts/public-website-architecture');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);