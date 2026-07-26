'use strict';
const fs=require('fs');
const http=require('http');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const assetManifest=JSON.parse(fs.readFileSync(path.join(root,'scripts/config/approved-public-assets.json'),'utf8'));
const approvedLogo=assetManifest.approved_logo;
const pages=fs.readdirSync(root).filter(file=>file.endsWith('.html')).sort();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.csv':'text/csv; charset=utf-8','.md':'text/plain; charset=utf-8'};
const failures=[];
const pass=name=>process.stdout.write(`PASS: ${name}\n`);
const fail=(name,detail='')=>{failures.push({name,detail});process.stderr.write(`FAIL: ${name}${detail?` — ${detail}`:''}\n`);};
function server(){return http.createServer((req,res)=>{let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/')pathname='/index.html';const file=path.resolve(root,`.${pathname}`);if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return;}res.writeHead(200,{'content-type':mime[path.extname(file).toLowerCase()]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});}
(async()=>{
 const local=server();await new Promise(resolve=>local.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${local.address().port}`;const browser=await chromium.launch({headless:true});
 try{
  for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
   await context.route('https://script.google.com/**',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body>Authorized Google workspace requires sign-in.</body></html>'}));
   for(const file of pages){
    const page=await context.newPage();const errors=[];const failedAssets=[];const source=fs.readFileSync(path.join(root,file),'utf8');
    const intentionalRedirect=/<meta[^>]+http-equiv=["']refresh["']/i.test(source)||/location\.(?:replace|assign)\s*\(/.test(source);
    page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
    page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400&&response.request().resourceType()!=='document')failedAssets.push(`${response.status()} ${response.url()}`);});
    page.on('requestfailed',request=>{if(!request.url().startsWith(base))return;const errorText=request.failure()?.errorText||'failed';if(intentionalRedirect&&errorText==='net::ERR_ABORTED')return;failedAssets.push(`${errorText} ${request.url()}`);});
    const response=await page.goto(`${base}/${file}`,{waitUntil:'networkidle',timeout:20000});if(!response||response.status()>=400)fail(`${viewport.name} ${file} loads`,response?String(response.status()):'no response');
    const overflow=await page.evaluate(()=>Math.max(0,Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-window.innerWidth));if(overflow>1)fail(`${viewport.name} ${file} horizontal overflow`,`${overflow}px`);
    const brokenImages=await page.locator('img').evaluateAll(images=>images.filter(img=>(img.currentSrc||img.getAttribute('src'))&&img.loading!=='lazy'&&(!img.complete||img.naturalWidth===0)).map(img=>img.getAttribute('src')));if(brokenImages.length)fail(`${viewport.name} ${file} images`,brokenImages.join(', '));
    if(failedAssets.length)fail(`${viewport.name} ${file} asset responses`,failedAssets.join(' | '));if(errors.length)fail(`${viewport.name} ${file} runtime`,errors.join(' | '));await page.close();
   }
   await context.close();pass(`${viewport.name}: ${pages.length} top-level pages load without browser, image, or overflow failures`);
  }
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(`${base}/index.html`,{waitUntil:'networkidle'});const logo=page.locator('.pi-brand img,.site-header .brand img,.site-header .site-brand img,.site-nav img.brand-logo').first();if(!await logo.count())fail('approved logo visible in primary navigation');else{const src=await logo.getAttribute('src'),alt=await logo.getAttribute('alt');if(src!==approvedLogo.public_reference||alt!==approvedLogo.alt_text)fail('approved logo contract',`${src} | ${alt}`);else pass('manifest-controlled approved logo, cache key, and alt text are visible');}
  const menu=page.locator('.pi-menu,.menu,.menu-button,.eco-menu,.nav-toggle').first();if(await menu.count()){await menu.click();if(await menu.getAttribute('aria-expanded')!=='true')fail('mobile menu opens');else pass('mobile menu opens');}
  await page.goto(`${base}/solutions.html`,{waitUntil:'networkidle'});if(await page.locator('[data-capability]').count()!==5)fail('five accepted capability cards render');else pass('five accepted capability cards render');
  await page.goto(`${base}/pricing.html`,{waitUntil:'networkidle'});if(await page.locator('a[href="start-request.html"]').count()<2)fail('project pricing routes to secure request');else pass('project pricing routes to secure request');
  await page.goto(`${base}/quote-builder.html`,{waitUntil:'networkidle'});if(await page.locator('a[href="#examples"]').count()<2)fail('Quote Builder routes to complete examples');else pass('Quote Builder routes to complete examples');
  await page.goto(`${base}/sample-library-now.html`,{waitUntil:'networkidle'});if(await page.locator('.project-card').count()!==8)fail('eight complete project examples render');else pass('eight complete project examples render');const exact=['deck-existing-condition.webp','deck-finished-concept.webp','irrigation-before-clean.webp','irrigation-after-clean.webp','kitchen-existing-condition.webp','kitchen-remodel-concept.webp'];const sources=await page.locator('img').evaluateAll(images=>images.map(img=>img.getAttribute('src')||''));if(!exact.every(name=>sources.some(src=>src.includes(name))))fail('six controlled deck irrigation and kitchen images render');else pass('six controlled deck irrigation and kitchen images render');if(await page.locator('a[href*="contractor-demo"]').count())fail('public examples expose private contractor routes');else pass('public examples keep contractor demo private');
  await page.close();
 }finally{await browser.close();await new Promise(resolve=>local.close(resolve));}
 if(failures.length){console.error(JSON.stringify({status:'FAIL',pages:pages.length,failures},null,2));process.exit(1);}console.log(JSON.stringify({status:'PASS',pages:pages.length,viewports:['desktop','mobile'],checks:'load + runtime + images + overflow + navigation + five capabilities + project pricing + Quote Builder examples + eight examples'},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
