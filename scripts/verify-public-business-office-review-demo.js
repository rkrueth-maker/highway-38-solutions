#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const failures=[];
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const check=(name,condition)=>{if(!condition)failures.push(name);};
const hasAll=(source,markers)=>markers.every(marker=>source.includes(marker));

const html=read('business-office-review-demo.html');
const css=read('business-office-review-demo.css');
const js=read('business-office-review-demo.js');
const siteShell=read('assets/js/h38-site-v2.js');

try{new Function(js);}catch(error){failures.push(`demo JavaScript syntax: ${error.message}`);}
try{new Function(siteShell);}catch(error){failures.push(`public site shell JavaScript syntax: ${error.message}`);}
check('current Business Office stylesheet reused',html.includes('commercial-app/styles.css?build='));
check('H38 branding is active',hasAll(html,['Highway 38 Solutions','assets/highway38-logo.png','Business Office · Public Review Demo']));
check('public read-only disclosure',hasAll(html,['PUBLIC REVIEW DEMO','no private data','no permanent actions']));
check('current module set',hasAll(js,["today:['🏠','Today']","customers:['👥','Customers']","work:['🧰','Work']","quotes:['🧾','Quotes']","schedule:['📅','Schedule']","messages:['💬','Messages']","field:['📷','Field']","inventory:['📦','Inventory']","fleet:['🚚','Fleet']","money:['💵','Money']","documents:['📁','Documents']","social:['📣','Social']","ai:['✨','H38 AI']","settings:['⚙️','Settings']"]));
check('old legacy demo shell removed',!hasAll(html,['Dashboard','New Requests','Purchase Orders','Setup / Controls']));
check('realistic sample modules rendered',hasAll(js,['renderToday','renderCustomers','renderWork','renderQuotes','renderSchedule','renderMessages','renderField','renderInventory','renderFleet','renderMoney','renderDocuments','renderSocial','renderAi','renderSettings']));
check('read-only actions are explicit',hasAll(js,['data-demo-action','permanent actions are disabled','Live charging disabled']));
check('no backend or legacy runtime calls',!/(script\.google\.com|supabase\.co|fetch\s*\(|XMLHttpRequest|WebSocket)/i.test(js+html));
check('responsive demo rules exist',hasAll(css,['@media(max-width:760px)','demo-ai-panel','demo-split','demo-table-wrap']));
check('H38 sample records only',hasAll(js,['Miller Garage','Northwoods Repair','Pine Ridge Homeowner','No private Highway 38 or customer data']));
check('public site navigation includes Office Demo',hasAll(siteShell,["{href:OFFICE_DEMO,label:'Office Demo'}","['Public Business Office Demo',OFFICE_DEMO]","mountOfficeDemoLinks"]));
check('homepage Software and Business Office direct links configured',hasAll(siteShell,["page==='index.html'","page==='software.html'||page==='business-systems.html'",'View the Public Business Office Demo','View Public Office Demo','Explore Read-Only Demo']));

async function renderCheck(){
 const {chromium}=require('playwright');
 const artifactDir=path.join(root,'artifacts','public-office-demo');
 fs.mkdirSync(artifactDir,{recursive:true});
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const errors=[];const external=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('request',request=>{const url=request.url();if(!url.startsWith('http://127.0.0.1:4173/')&&!url.startsWith('data:'))external.push(url);});
 await page.goto('http://127.0.0.1:4173/business-office-review-demo.html',{waitUntil:'networkidle'});
 check('rendered H38 title',await page.title()==='Highway 38 Business Office — Public Review Demo');
 check('rendered H38 logo',await page.locator('.brand-logo').getAttribute('src')==='assets/highway38-logo.png?v=20260720-exact-0cbc4514');
 const expected=[['today','Today'],['customers','Customers'],['work','Work'],['quotes','Quotes'],['schedule','Schedule'],['messages','Messages'],['field','Field'],['inventory','Inventory'],['fleet','Fleet'],['money','Money'],['documents','Documents'],['social','Social'],['ai','H38 AI'],['settings','Settings']];
 const labels=await page.locator('#mainNav button span:last-child').allTextContents();
 check('rendered current navigation',JSON.stringify(labels)===JSON.stringify(expected.map(item=>item[1])));
 for(const [key,label] of expected){
  await page.locator(`#mainNav button[data-page="${key}"]`).click();
  await page.waitForTimeout(25);
  const heading=await page.locator('#mainContent h1').first().textContent();
  check(`rendered page ${label}`,String(heading||'').trim()===label);
 }
 await page.goto('http://127.0.0.1:4173/business-office-review-demo.html#today',{waitUntil:'networkidle'});
 await page.screenshot({path:path.join(artifactDir,'desktop.png'),fullPage:true});
 check('desktop no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));

 const linkedPages=[
  ['index.html','homepage',3],
  ['software.html','Software page',3],
  ['business-systems.html','Business Office page',4]
 ];
 for(const [pathname,label,minimum] of linkedPages){
  await page.goto(`http://127.0.0.1:4173/${pathname}`,{waitUntil:'networkidle'});
  const links=page.locator('a[href="business-office-review-demo.html"]');
  check(`${label} exposes public Office demo`,await links.count()>=minimum);
  check(`${label} navigation includes Office Demo`,await page.locator('#h38-main-navigation a',{hasText:'Office Demo'}).count()===1);
 }

 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 mobile.on('pageerror',error=>errors.push(`mobile: ${error.message}`));
 mobile.on('console',message=>{if(message.type()==='error')errors.push(`mobile: ${message.text()}`);});
 await mobile.goto('http://127.0.0.1:4173/business-office-review-demo.html#today',{waitUntil:'networkidle'});
 await mobile.screenshot({path:path.join(artifactDir,'mobile.png'),fullPage:true});
 check('mobile bottom navigation visible',await mobile.locator('#mainNav').isVisible());
 check('mobile current Today heading',String(await mobile.locator('#mainContent h1').first().textContent()).trim()==='Today');
 check('mobile no horizontal overflow',await mobile.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
 await mobile.goto('http://127.0.0.1:4173/index.html',{waitUntil:'networkidle'});
 await mobile.locator('.pi-menu').click();
 check('mobile H38 navigation exposes Office Demo',await mobile.locator('#h38-main-navigation a',{hasText:'Office Demo'}).isVisible());
 check('mobile homepage direct demo link visible',await mobile.locator('[data-public-office-demo-home]').isVisible());
 check('no browser errors',errors.length===0);
 check('no external runtime requests',external.length===0);
 await browser.close();
}

(async()=>{
 if(process.argv.includes('--render'))await renderCheck();
 if(failures.length){console.error('Public Business Office review demo verification failed:');failures.forEach(item=>console.error(`- ${item}`));process.exit(1);}
 console.log('PASS — Public H38 Business Office demo and website links match the current read-only office format.');
})().catch(error=>{console.error(error.stack||error.message);process.exit(1);});
