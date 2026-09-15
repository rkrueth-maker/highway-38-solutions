'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
function server(){return http.createServer((req,res)=>{let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/')pathname='/business-office-review-demo.html';const file=path.resolve(ROOT,`.${pathname}`);if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'content-type':mime[path.extname(file).toLowerCase()]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});}
(async()=>{
 const local=server();await new Promise(resolve=>local.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${local.address().port}`;
 const browser=await chromium.launch({headless:true});
 try{
  const mobile=await browser.newContext({viewport:{width:390,height:844}});const page=await mobile.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e.message)));
  await page.goto(`${base}/business-office-review-demo.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.H38_PUBLIC_DEMO_POLISH?.build==='20260915-public-demo-phone-parity-1');
  const visibleLabels=await page.locator('#mainNav button').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none').map(n=>(n.textContent||'').trim()));
  assert.deepEqual(visibleLabels,['🏠Today','👥Customers','📅Schedule','💬Messages','•••More']);
  assert.equal(await page.locator('#mainContent > .notice.warn').count(),1,'page still contains the safety notice in DOM');
  assert.equal(await page.locator('#mainContent > .notice.warn').evaluate(n=>getComputedStyle(n).display),'none','duplicate page-level warning should be visually suppressed');
  assert.notEqual(await page.locator('.demo-banner').evaluate(n=>getComputedStyle(n).display),'none','single persistent public-demo warning must remain visible');
  await page.click('#h38DemoMoreButton');await page.waitForSelector('#h38DemoMoreDialog[open]');
  assert.deepEqual(await page.locator('#h38DemoMoreDialog .h38-demo-more-group h3').allTextContents(),['Work & Sales','Money','Records & Equipment','Office']);
  await page.click('#h38DemoMoreDialog [data-demo-more-page="quotes"]');await page.waitForFunction(()=>document.querySelector('#mainContent h1')?.textContent==='Quotes');
  assert.equal(await page.locator('#h38DemoMoreButton').getAttribute('aria-current'),'page');
  await page.click('#mainNav [data-page="customers"]');await page.waitForFunction(()=>document.querySelector('#mainContent h1')?.textContent==='Customers');
  const table=page.locator('.demo-table').first();assert.equal(await table.getAttribute('data-h38-mobile-cards'),'1');
  assert.equal(await table.locator('thead').evaluate(n=>getComputedStyle(n).display),'none');
  assert.equal(await table.locator('tbody tr').first().evaluate(n=>getComputedStyle(n).display),'block');
  const labels=await table.locator('tbody tr').first().locator('td').evaluateAll(nodes=>nodes.map(n=>n.dataset.label));assert.ok(labels.every(Boolean),'mobile record cells should carry readable labels');
  const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);assert.ok(overflow<=1,`mobile page overflow ${overflow}px`);
  assert.deepEqual(errors,[]);
  await mobile.close();
  const desktop=await browser.newContext({viewport:{width:1440,height:1000}});const desk=await desktop.newPage();await desk.goto(`${base}/business-office-review-demo.html`,{waitUntil:'networkidle'});
  assert.equal(await desk.locator('#h38DemoMoreButton').count(),0,'desktop keeps the existing full navigation');
  assert.ok(await desk.locator('#mainNav [data-page]').count()>5,'desktop should retain the full demo navigation');
  await desktop.close();
  console.log(JSON.stringify({status:'PASS',mobilePrimary:['Today','Customers','Schedule','Messages','More'],groupedMore:true,mobileRecordCards:true,singleDemoWarning:true,desktopUnchanged:true}));
 }finally{await browser.close();await new Promise(resolve=>local.close(resolve));}
})().catch(error=>{console.error(error);process.exit(1);});
