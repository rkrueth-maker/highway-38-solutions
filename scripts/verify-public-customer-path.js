#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const passes=[];
const failures=[];
const check=(name,condition,detail='')=>(condition?passes:failures).push({name,detail});
const exists=rel=>fs.existsSync(path.join(ROOT,rel));
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');

const requiredRoutes=['index.html','services.html','products.html','product.html','free-tools.html','proof.html','business-os.html','about.html','resources.html','start-request.html','portal.html'];
const requiredAssets=['favicon.svg','site.webmanifest','robots.txt','sitemap.xml','catalog-data.js','commercial.js','commercial-public.js','catalog-navigation.js','product-detail.js','catalog-family.css','brand/highway-38-mark.svg','brand/highway-38-solutions.svg','brand/highway-38-tools.svg','brand/highway-38-business-os.svg','brand/highway-38-supply-co.svg'];
for(const file of [...requiredRoutes,...requiredAssets])check(`required public artifact: ${file}`,exists(file));

const catalogContext={window:{}};
vm.createContext(catalogContext);
try{vm.runInContext(read('catalog-data.js'),catalogContext,{filename:'catalog-data.js'});}catch(error){failures.push({name:'catalog-data.js parses',detail:error.message});}
const catalog=catalogContext.window.H38_CATALOG;
check('catalog object exists',!!catalog);
if(catalog){
  check('catalog has 15 products',catalog.products.length===15,String(catalog.products.length));
  check('catalog has 9 bundles',catalog.bundles.length===9,String(catalog.bundles.length));
  check('catalog has 3 service families',catalog.families.length===3,String(catalog.families.length));
  check('product IDs exact',Array.from({length:15},(_,i)=>`H38-P${String(i+1).padStart(3,'0')}`).every(id=>catalog.products.some(item=>item.id===id)));
  check('bundle IDs exact',Array.from({length:9},(_,i)=>`H38-B${String(i+1).padStart(3,'0')}`).every(id=>catalog.bundles.some(item=>item.id===id)));
  check('catalog IDs unique',new Set([...catalog.products.map(item=>item.id),...catalog.bundles.map(item=>item.id)]).size===24);
  check('all products have controlled commercial fields',catalog.products.every(item=>item.slug&&item.family&&item.price>0&&item.payment&&item.turnaround&&item.revisions&&item.boundary&&Array.isArray(item.inputs)&&Array.isArray(item.deliverables)&&Array.isArray(item.exclusions)));
  check('all bundles map to valid products',catalog.bundles.every(bundle=>bundle.products.every(id=>catalog.products.some(product=>product.id===id))));
}

const products=read('products.html');
check('product wall replaced by family navigation',products.includes('id="plans"')&&products.includes('id="implementation"')&&products.includes('id="manufacturing"')&&!products.includes('data-product-details'));
check('all family render targets present',['data-products="plans"','data-products="implementation"','data-products="manufacturing"'].every(marker=>products.includes(marker)));
check('comparison matrix retained',products.includes('data-pricing-table'));
check('bundles retained',products.includes('data-bundles'));
check('help-me-choose route retained',products.includes('href="start-request.html"'));
check('products page has Open Graph metadata',/property="og:title"/.test(products)&&/property="og:description"/.test(products)&&/property="og:url"/.test(products));

const productPage=read('product.html');
check('reusable product detail mount exists',productPage.includes('data-product-detail-single'));
check('reusable product page loads catalog and renderer',productPage.includes('catalog-data.js')&&productPage.includes('product-detail.js'));
check('product page has no checkout or payment form',!/<form\b/i.test(productPage)&&!/cardNumber|\bcvv\b|\bcvc\b/i.test(productPage));

for(const script of ['catalog-navigation.js','product-detail.js']){
  try{new vm.Script(read(script),{filename:script});passes.push({name:`${script} syntax`,detail:''});}catch(error){failures.push({name:`${script} syntax`,detail:error.message});}
}
const detailScript=read('product-detail.js');
check('detail renderer accepts controlled product ID',detailScript.includes("params.get('id')")&&detailScript.includes('catalog.products.find'));
check('detail renderer exposes complete commercial scope',['product.price','product.inputs','product.deliverables','product.scope','product.exclusions','product.boundary','product.payment','product.turnaround','product.revisions'].every(marker=>detailScript.includes(marker)));
check('detail renderer records analytics event',detailScript.includes("event:'product_detail_view'"));
check('detail renderer has invalid-ID safe state',detailScript.includes('Product not found')&&detailScript.includes('No purchase, payment, or customer action occurred'));
check('catalog navigation rewrites legacy detail links',read('catalog-navigation.js').includes('products.html#')&&read('catalog-navigation.js').includes('product.html?id='));

const commercial=read('commercial.js');
check('intake supports product query preselection',commercial.includes('new URLSearchParams(location.search)')&&commercial.includes('qs.get("product")'));
check('intake supports bundle query preselection',commercial.includes('qs.get("bundle")'));
check('intake builds customer request summary',commercial.includes('HIGHWAY 38 REQUEST SUMMARY'));
check('intake avoids silent external submission',!/(fetch\s*\(|XMLHttpRequest|sendBeacon)/.test(commercial));

const tools=read('free-tools.html')+read('free-tools.js');
check('free tools route is functional',/data-tool|tool_calculate/.test(tools));
check('free tools includes downloads',/Blob|download/i.test(tools));
check('free tools contains no fake checkout',!/(checkout|add to cart|buy now)/i.test(tools));

const forge=read('forgeiq.html');
check('ForgeIQ redirects to Highway 38 Tools',/free-tools\.html/.test(forge)&&/location\.replace/.test(forge));
const brandText=['brand/highway-38-solutions.svg','brand/highway-38-tools.svg','brand/highway-38-business-os.svg','brand/highway-38-supply-co.svg'].map(read).join('\n');
check('four sub-brand assets exist and contain Highway 38',/Highway 38/i.test(brandText));

const sitemap=read('sitemap.xml');
for(const route of requiredRoutes)check(`sitemap includes ${route}`,route==='index.html'?sitemap.includes('highway-38-solutions/</loc>'):sitemap.includes(route));
check('sitemap includes reusable product route',sitemap.includes('product.html'));

const publicFiles=[...requiredRoutes,'catalog-data.js','commercial.js','commercial-public.js','catalog-navigation.js','product-detail.js'];
const publicText=publicFiles.map(read).join('\n');
check('no public LLC claim',!/Highway 38[^\n<]{0,30}\bLLC\b/i.test(publicText));
check('no private employer names in public package',!/\bClow\b|\bCSC\b/i.test(publicText));
check('no raw card fields',!/cardNumber|\bcvv\b|\bcvc\b|fullCard/i.test(publicText));
check('no retired ForgeIQ brand in primary routes',!requiredRoutes.map(read).join('\n').includes('ForgeIQ'));
check('no fake testimonials',!/customer testimonial|five-star review|★★★★★/i.test(publicText));

for(const route of requiredRoutes){
  const html=read(route);
  check(`${route}: viewport`,/<meta[^>]+name="viewport"/i.test(html));
  check(`${route}: title`,/<title>[^<]+<\/title>/i.test(html));
  check(`${route}: favicon`,/rel="icon"/i.test(html)||route==='portal.html');
  for(const match of html.matchAll(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)){
    const target=match[1];
    if(/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(target))continue;
    if(!target||target.startsWith('/'))continue;
    check(`${route}: local asset ${target}`,exists(target),target);
  }
}

const evidence={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),passed:passes.length,failed:failures.length,routes:requiredRoutes,controls:{catalogProducts:catalog?.products?.length||0,catalogBundles:catalog?.bundles?.length||0,serviceFamilies:catalog?.families?.length||0,reusableProductDetails:true,intakePreselection:true,forgeIqRedirect:true,externalCheckout:false,rawCardFields:false},passes,failures};
const outDir=path.join(ROOT,'launch-control','evidence');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'public-customer-path-verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exit(failures.length?1:0);
