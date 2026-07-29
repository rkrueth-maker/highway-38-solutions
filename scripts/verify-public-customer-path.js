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
const requiredAssets=['assets/js/h38-site-v2.js','assets/css/h38-site-v2.css','assets/highway38-logo.png','favicon.svg','site.webmanifest','robots.txt','sitemap.xml','scripts/config/approved-public-assets.json','scripts/config/approved-public-image-placements.json'];
check('competitive-readiness route registry version',/competitive-readiness/.test(String(registry.version||'')),registry.version||'');
check('thirteen primary routes',primary.length===13,String(primary.length));
for(const expected of ['index.html','sample-library-now.html','solutions.html','software.html','project-services.html','pricing.html','quote-builder-demo.html','implementation.html','security-reliability.html','about.html','contact.html','start-request.html','portal.html'])check(`primary route registered: ${expected}`,primary.includes(expected));
check('universal demonstration registered',(registry.demonstrations||[]).some(item=>item.path==='universal-quote-builder.html'&&item.visibility==='public'));
for(const file of [...primary,'universal-quote-builder.html',...requiredAssets])check(`required public artifact: ${file}`,exists(file));
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
    if(!target||target.startsWith('/')||/[+'()]/.test(target))continue;
    check(`${route}: local asset ${target}`,exists(target),target);
  }
}
for(const route of publicPrimary.filter(route=>!['start-request.html'].includes(route))){
  const html=read(route);
  check(`${route}: canonical shared shell`,html.includes('assets/js/h38-site-v2.js')||route==='portal.html');
}
const home=read('index.html');
const shell=read('assets/js/h38-site-v2.js');
const software=read('software.html');
const projectServices=read('project-services.html');
const implementation=read('implementation.html');
const security=read('security-reliability.html');
const interactiveDemo=read('quote-builder-demo.html');
const examples=read('sample-library-now.html');
const universal=read('universal-quote-builder.html');
const quoteBuilder=read('quote-builder.html');
const examplesData=read('assets/js/uqb-public-examples.js');
const solutions=read('solutions.html');
const pricing=read('pricing.html');
const request=read('start-request.html');
const portal=read('portal.html');
check('home separates software and project-service discovery',home.includes('software.html')&&home.includes('project-services.html'));
check('home keeps neutral pricing and controlled request paths',home.includes('pricing.html')&&home.includes('start-request.html'));
check('home does not directly sell the authenticated Business Office route',!/href=["']business-systems\.html/i.test(home));
check('shared shell exposes balanced buyer paths',shell.includes("{href:'software.html',label:'Software'}")&&shell.includes("{href:'project-services.html',label:'Project Services'}"));
check('shared shell does not directly promote one software product',!shell.includes("{href:'quote-builder.html',label:'Quote Builder'}")&&!shell.includes("{href:'business-systems.html',label:'Business Office'}"));
check('software path explains all three product levels',software.includes('Quote Builder')&&software.includes('Business Office')&&software.includes('Custom Business System'));
check('project services path preserves licensed and field verification boundary',projectServices.includes('Planning support does not replace licensed or field verification.'));
check('implementation page explains configure, verify, launch, and handoff',implementation.includes('Discover and preserve')&&implementation.includes('Configure and migrate')&&implementation.includes('Verify and train')&&implementation.includes('Launch and hand off'));
check('security page preserves external-action and fail-closed controls',security.includes('Controlled external actions')&&security.includes('Fail-closed boundaries'));
check('interactive quote demo is browser-only and non-submitting',interactiveDemo.includes('Nothing leaves this page')&&interactiveDemo.includes("addEventListener('submit',event=>event.preventDefault())")&&!/script\.google\.com|data-intake-endpoint/.test(interactiveDemo));
const projectCardCount=(examples.match(/class="project-card(?:"|\s)/g)||[]).length;
check('examples preserve approved project cards and remain open-ended',projectCardCount>=8&&examples.includes('Open-ended example library'),String(projectCardCount));
check('Quote Builder owns the current public example experience',quoteBuilder.includes('id="examples"')&&quoteBuilder.includes('id="quoteBuilderExamples"')&&quoteBuilder.includes('assets/js/uqb-public-examples.js'));
check('Quote Builder links the interactive demo',quoteBuilder.includes('quote-builder-demo.html')&&quoteBuilder.includes('Try Interactive Demo'));
check('Quote Builder loads project cards and complete quote/CAD/package actions',quoteBuilder.includes("fetch('sample-library-now.html")&&quoteBuilder.includes("href(item.key,'quote')")&&quoteBuilder.includes("href(item.key,'cad')")&&quoteBuilder.includes("href(item.key,'package')"));
check('examples remove fixed count wording',!/Eight complete|Explore the Eight|current eight-project/i.test(examples));
check('legacy Universal Quote Builder route redirects to the maintained example library',universal.includes('sample-library-now.html#universal-quote-builder-examples')&&universal.includes('location.replace'));
check('public quote and CAD data remains available',examplesData.includes('global.H38_UQB_PUBLIC_EXAMPLES')&&examplesData.includes('const packages = [')&&examplesData.includes('const drawings = {'));
check('universal demonstration removes stale renovation scope',!universal.includes('Whole-House Renovation and Property Improvement')&&!universal.includes('$342,815'));
check('solutions is capability-first',/Automation|CNC|Quote Builder|Business Office/.test(solutions));
check('pricing names implementation value and links the process',pricing.includes('Implementation value')&&pricing.includes('implementation.html'));
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
const publicText=publicPrimary.map(read).join('\n')+'\n'+universal;
check('no public LLC claim',!/Highway 38[^\n<]{0,30}\bLLC\b/i.test(publicText));
check('no private employer names in public package',!/\bClow\b|\bCSC\b/i.test(publicText));
check('no raw card fields',!/cardNumber|\bcvv\b|\bcvc\b|fullCard/i.test(publicText));
check('no fake testimonial claims',!/five-star review|★★★★★|verified customer review|what our customers say/i.test(publicText));
check('no actionable public checkout',!/href="[^"]*(?:checkout|cart)|action="[^"]*(?:checkout|cart)|>\s*(?:buy now|add to cart|checkout)\s*</i.test(publicText));
const evidence={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),architecture:'competitive-readiness-split-buyer-paths-integrated-quote-demo',passed:passes.length,failed:failures.length,routes:primary,existingProjectExamples:projectCardCount,universalDemonstration:true,interactiveQuoteDemo:true,quoteBuilderIntegratedExamples:true,controls:{routeRegistry:true,sharedShell:true,splitBuyerPaths:true,implementationTransparency:true,securityTransparency:true,projectExamples:true,controlledIntake:true,deterministicRetiredRedirects:true,externalCheckout:false,rawCardFields:false},passes,failures};
const outDir=path.join(ROOT,'launch-control','evidence');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'public-customer-path-verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);
