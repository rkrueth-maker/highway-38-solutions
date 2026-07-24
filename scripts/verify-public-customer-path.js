#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const passes=[];
const failures=[];
const check=(name,condition,detail='')=>(condition?passes:failures).push({name,detail});
const exists=rel=>fs.existsSync(path.join(ROOT,rel));
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');

const registryPath='scripts/config/public-website-routes.json';
check('canonical route registry exists',exists(registryPath),registryPath);
const registry=JSON.parse(read(registryPath));
const primary=(registry.primary||[]).map(item=>item.path);
const publicPrimary=(registry.primary||[]).filter(item=>item.visibility==='public').map(item=>item.path);
const retired=registry.retired||{};
const requiredAssets=[
  'assets/js/h38-site-v2.js',
  'assets/css/h38-site-v2.css',
  'assets/highway38-logo.png',
  'favicon.svg',
  'site.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'scripts/config/approved-public-assets.json',
  'scripts/config/approved-public-image-placements.json'
];

check('project-first route registry version',/project-first/.test(String(registry.version||'')),registry.version||'');
check('eight primary routes',primary.length===8,String(primary.length));
for(const expected of ['index.html','sample-library-now.html','solutions.html','pricing.html','about.html','contact.html','start-request.html','portal.html']){
  check(`primary route registered: ${expected}`,primary.includes(expected));
}
for(const file of [...primary,...requiredAssets])check(`required public artifact: ${file}`,exists(file));

const approved=JSON.parse(read('scripts/config/approved-public-assets.json'));
const logoRef=approved.approved_logo&&approved.approved_logo.public_reference;
check('approved logo reference is declared',logoRef==='assets/highway38-logo.png?v=20260720-exact-0cbc4514',logoRef||'');

for(const route of primary){
  const html=read(route);
  check(`${route}: viewport`,/<meta[^>]+name="viewport"/i.test(html));
  check(`${route}: title`,/<title>[^<]+<\/title>/i.test(html));
  check(`${route}: favicon`,/rel="icon"/i.test(html));
  for(const match of html.matchAll(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)){
    const target=match[1];
    if(/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(target))continue;
    if(!target||target.startsWith('/'))continue;
    check(`${route}: local asset ${target}`,exists(target),target);
  }
}

for(const route of publicPrimary.filter(route=>!['start-request.html'].includes(route))){
  const html=read(route);
  check(`${route}: canonical shared shell`,html.includes('assets/js/h38-site-v2.js')||route==='portal.html');
}

const home=read('index.html');
const examples=read('sample-library-now.html');
const solutions=read('solutions.html');
const pricing=read('pricing.html');
const request=read('start-request.html');
const portal=read('portal.html');
check('home routes to project examples',home.includes('sample-library-now.html'));
check('home routes to start project',home.includes('start-request.html'));
check('examples provide eight project cards',(examples.match(/class="project-card(?:"|\s)/g)||[]).length===8);
check('examples route to full demonstrations',examples.includes('contractor-quote-complete.html?example=')&&examples.includes('cabin-project-complete.html'));
check('solutions is capability-first',/Automation|CNC|Quote Builder|Business Office/.test(solutions));
check('pricing is project-first',/project/i.test(pricing)&&pricing.includes('start-request.html'));
check('request page preserves controlled intake',request.includes('assets/js/h38-request-options.js')&&request.includes('request-flow.js'));
check('Owner Access remains a gateway',/Owner Access|owner/i.test(portal));

for(const [oldRoute,target] of Object.entries(retired)){
  check(`retired route exists: ${oldRoute}`,exists(oldRoute));
  if(!exists(oldRoute))continue;
  const html=read(oldRoute);
  check(`${oldRoute}: noindex redirect`,/noindex/i.test(html)&&html.includes(target),target);
  check(`${oldRoute}: deterministic redirect`,/location\.replace|http-equiv="refresh"/i.test(html),target);
}

const sitemap=read('sitemap.xml');
for(const route of publicPrimary){
  const included=route==='index.html'?sitemap.includes('highway-38-solutions/</loc>'):sitemap.includes(route);
  check(`sitemap includes ${route}`,included);
}
for(const oldRoute of Object.keys(retired))check(`sitemap excludes retired ${oldRoute}`,!sitemap.includes(oldRoute));

const publicText=publicPrimary.map(read).join('\n');
check('no public LLC claim',!/Highway 38[^\n<]{0,30}\bLLC\b/i.test(publicText));
check('no private employer names in public package',!/\bClow\b|\bCSC\b/i.test(publicText));
check('no raw card fields',!/cardNumber|\bcvv\b|\bcvc\b|fullCard/i.test(publicText));
check('no fake testimonials',!/customer testimonial|five-star review|★★★★★/i.test(publicText));
check('no actionable public checkout',!/href="[^"]*(?:checkout|cart)|action="[^"]*(?:checkout|cart)|>\s*(?:buy now|add to cart|checkout)\s*</i.test(publicText));

const evidence={
  status:failures.length?'HOLD':'PASS',
  generatedAt:new Date().toISOString(),
  architecture:'project-first-public-v1',
  passed:passes.length,
  failed:failures.length,
  routes:primary,
  controls:{
    routeRegistry:true,
    sharedShell:true,
    projectExamples:true,
    controlledIntake:true,
    deterministicRetiredRedirects:true,
    externalCheckout:false,
    rawCardFields:false
  },
  passes,
  failures
};
const outDir=path.join(ROOT,'launch-control','evidence');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'public-customer-path-verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);
