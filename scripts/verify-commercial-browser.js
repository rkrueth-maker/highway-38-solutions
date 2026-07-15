#!/usr/bin/env node
'use strict';

const fs=require('fs');
const http=require('http');
const path=require('path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const pages=fs.readdirSync(root).filter(file=>file.endsWith('.html')).sort();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.csv':'text/csv; charset=utf-8','.md':'text/plain; charset=utf-8'};
const failures=[];
const pass=(name)=>process.stdout.write(`PASS: ${name}\n`);
const fail=(name,detail='')=>{failures.push({name,detail});process.stderr.write(`FAIL: ${name}${detail?` — ${detail}`:''}\n`);};

function server(){return http.createServer((req,res)=>{
  let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname==='/')pathname='/index.html';
  const file=path.resolve(root,`.${pathname}`);
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return;}
  res.writeHead(200,{'content-type':mime[path.extname(file).toLowerCase()]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});}

(async()=>{
  const local=server();await new Promise(resolve=>local.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${local.address().port}`;
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
      const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
      await context.route('https://script.google.com/**',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body>Authorized Google workspace requires sign-in.</body></html>'}));
      for(const file of pages){
        const page=await context.newPage();const errors=[];const failedAssets=[];
        const source=fs.readFileSync(path.join(root,file),'utf8');
        const intentionalRedirect=/<meta[^>]+http-equiv=["']refresh["']/i.test(source)||/location\.(?:replace|assign)\s*\(/.test(source);
        page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));
        page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
        page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400&&response.request().resourceType()!=='document')failedAssets.push(`${response.status()} ${response.url()}`);});
        page.on('requestfailed',request=>{
          if(!request.url().startsWith(base))return;
          const errorText=request.failure()?.errorText||'failed';
          if(intentionalRedirect&&errorText==='net::ERR_ABORTED')return;
          failedAssets.push(`${errorText} ${request.url()}`);
        });
        const response=await page.goto(`${base}/${file}`,{waitUntil:'networkidle',timeout:20000});
        if(!response||response.status()>=400)fail(`${viewport.name} ${file} loads`,response?String(response.status()):'no response');
        const overflow=await page.evaluate(()=>{
          const viewportWidth=document.documentElement.clientWidth;
          const scrollWidth=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth);
          const offenders=[...document.querySelectorAll('body *')].map(element=>{
            const rect=element.getBoundingClientRect();
            return {tag:element.tagName.toLowerCase(),id:element.id||'',className:typeof element.className==='string'?element.className:'',left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width),text:(element.textContent||'').trim().replace(/\s+/g,' ').slice(0,80)};
          }).filter(item=>item.right>viewportWidth+1||item.left<-1).sort((a,b)=>b.right-a.right).slice(0,8);
          return {amount:scrollWidth-viewportWidth,offenders};
        });
        if(overflow.amount>1)fail(`${viewport.name} ${file} horizontal overflow`,`${overflow.amount}px ${JSON.stringify(overflow.offenders)}`);
        const brokenImages=await page.locator('img').evaluateAll(images=>images.filter(img=>(img.currentSrc||img.getAttribute('src'))&&img.loading!=='lazy'&&(!img.complete||img.naturalWidth===0)).map(img=>img.getAttribute('src')));
        if(brokenImages.length)fail(`${viewport.name} ${file} images`,brokenImages.join(', '));
        if(failedAssets.length)fail(`${viewport.name} ${file} asset responses`,failedAssets.join(' | '));
        if(errors.length)fail(`${viewport.name} ${file} runtime`,errors.join(' | '));
        await page.close();
      }
      await context.close();pass(`${viewport.name}: ${pages.length} top-level pages load without browser, image, or overflow failures`);
    }

    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(`${base}/index.html`,{waitUntil:'networkidle'});
    const logo=page.locator('.site-nav img.brand-logo').first();
    if(!await logo.count())fail('approved logo visible in primary navigation');
    else{
      const src=await logo.getAttribute('src'),alt=await logo.getAttribute('alt');
      if(!src.includes('assets/highway38-logo.png?v=20260713-logo2')||alt!=='Highway 38 Solutions')fail('approved logo contract',`${src} | ${alt}`);else pass('approved second logo, cache key, and alt text are visible');
    }
    const menu=page.locator('.eco-menu,.nav-toggle').first();
    if(await menu.count()){await menu.click();const expanded=await menu.getAttribute('aria-expanded');if(expanded!=='true')fail('mobile menu opens');else pass('mobile menu opens');}

    await page.goto(`${base}/products.html`,{waitUntil:'networkidle'});
    if(await page.locator('.product-card').count()!==15)fail('15 approved product cards render');else pass('15 approved product cards render');
    if(await page.locator('.bundle-card').count()!==9)fail('9 approved bundle cards render');else pass('9 approved bundle cards render');
    if(await page.locator('.bundle-value').count()!==9)fail('bundle value and truthful savings render');else pass('bundle value and truthful savings render');

    await page.goto(`${base}/sample-library-now.html`,{waitUntil:'networkidle'});
    const filters=page.locator('[data-sample-filter]');
    if(await filters.count()<6)fail('Sample Library category filters render');
    else{await filters.filter({hasText:'Manufacturing'}).click();const visible=await page.locator('.sample-card:visible').count();if(visible!==6)fail('Sample Library manufacturing filter',String(visible));else pass('Sample Library category filters work');}
    await page.close();
  } finally {await browser.close();await new Promise(resolve=>local.close(resolve));}
  if(failures.length){console.error(JSON.stringify({status:'FAIL',pages:pages.length,failures},null,2));process.exit(1);}
  console.log(JSON.stringify({status:'PASS',pages:pages.length,viewports:['desktop','mobile'],checks:'load + runtime + images + overflow + navigation + catalog + bundles + filters'},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
