'use strict';
const fs=require('fs');
const http=require('http');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
function server(){return http.createServer((req,res)=>{let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/')pathname='/index.html';const file=path.resolve(root,`.${pathname}`);if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'content-type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);});}
function snap(){const x={business:{businessId:'B-H38',businessKey:'highway38',businessName:'Highway 38 Solutions'},user:{userId:'U-OWNER',roleId:'owner',roleName:'Owner',owner:true,email:'owner@example.test',permissions:{all:true}},users:[],roles:[{'Role ID':'owner','Role Name':'Owner'}],providers:[],modules:[],storageSettings:{provider:'supabase',connectionStatus:'connected'},cachedAt:new Date().toISOString(),authorizationStatus:'active',authUserId:'U-OWNER'};for(const n of ['customers','properties','requests','jobs','tasks','quotes','quoteRevisions','scheduleEvents','conversations','messages','emailThreads','emailMessages','smsThreads','smsMessages','portalThreads','portalMessages','measurements','inventoryTransactions','materialRequests','assets','assignments','maintenance','inspections','timeEntries','jobNotes','dailyLogs','checklists','changeOrders','payments','invoices','expenses','documents','socialPosts','socialMetrics','campaigns','featureRequests','aiRecommendations','usageLogs','accountingReviews','payrollPrep','taxPrep','taxPeriods','employees','priceBook'])x[n]=[];return x;}
async function stub(context){await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:`window.supabase={createClient(){const q={select(){return this},eq(){return this},in(){return this},order(){return this},range(){return Promise.resolve({data:[],error:null})},limit(){return Promise.resolve({data:[],error:null})},maybeSingle(){return Promise.resolve({data:null,error:null})},update(){return this},insert(){return Promise.resolve({data:null,error:null})}};return{auth:{getSession:async()=>({data:{session:{user:{id:'U-OWNER',email:'owner@example.test'}}},error:null}),getUser:async()=>({data:{user:{id:'U-OWNER',email:'owner@example.test'}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>Object.create(q),functions:{invoke:async()=>({data:{status:'PASS'},error:null})},rpc:async()=>({data:{status:'PASS'},error:null}),storage:{from:()=>({upload:async()=>({data:null,error:null}),createSignedUrl:async()=>({data:{signedUrl:''},error:null})})}}}};window.PDFLib={};`}));}
(async()=>{
 const local=server();await new Promise(r=>local.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});await stub(context);
 const page=await context.newPage();
 await page.addInitScript(()=>{
   const events=[];let active=false;const LIMIT=16;
   const stack=label=>String(new Error(label).stack||'').replace(/\s+/g,' ').slice(0,2200);
   const target=node=>node?.id==='h38AgentStatusSettings'||node?.querySelector?.('#h38AgentStatusSettings');
   const record=(op)=>{if(!active)return false;if(events.length<LIMIT)events.push({op,stack:stack(op)});return events.length>=LIMIT;};
   const ap=Node.prototype.appendChild,ib=Node.prototype.insertBefore,rc=Node.prototype.removeChild,rep=Node.prototype.replaceChild,rm=Element.prototype.remove,iah=Element.prototype.insertAdjacentHTML,iae=Element.prototype.insertAdjacentElement;
   Node.prototype.appendChild=function(node){if(target(node)&&record('agent-card-append'))return node;return ap.call(this,node);};
   Node.prototype.insertBefore=function(node,ref){if(target(node)&&record('agent-card-insert-before'))return node;return ib.call(this,node,ref);};
   Node.prototype.removeChild=function(node){if(target(node)&&record('agent-card-remove-child'))return node;return rc.call(this,node);};
   Node.prototype.replaceChild=function(node,old){if((target(node)||target(old))&&record('agent-card-replace'))return old;return rep.call(this,node,old);};
   Element.prototype.remove=function(){if(target(this)&&record('agent-card-remove'))return;return rm.call(this);};
   Element.prototype.insertAdjacentElement=function(pos,node){if(target(node)&&record('agent-card-adjacent-element'))return node;return iae.call(this,pos,node);};
   Element.prototype.insertAdjacentHTML=function(pos,html){if(String(html).includes('h38AgentStatusSettings')&&record('agent-card-adjacent-html'))return;return iah.call(this,pos,html);};
   window.__h38AgentCardTrace={events,setActive(v){active=!!v;}};
 });
 const base=`http://127.0.0.1:${local.address().port}`;
 await page.goto(`${base}/commercial-app/index.html`,{waitUntil:'load',timeout:20000});
 await page.waitForFunction(()=>document.readyState==='complete'&&typeof window.openPage==='function'&&window.H38_DESKTOP_NAVIGATION_AUTHORITY,{timeout:12000});
 await page.evaluate(s=>{window.state.shell='office';window.state.page='today';window.state.businessId='B-H38';window.state.businessKey='highway38';window.state.snapshot=s;window.state.bridgeReady=true;window.h38SetAuthorizedChrome?.(true);window.H38_DESKTOP_NAVIGATION_AUTHORITY?.installAsFinalAuthority?.();window.renderNav?.();window.openPage?.('today',false);},snap());
 await page.waitForTimeout(250);await page.evaluate(()=>{window.__h38AgentCardTrace.setActive(true);setTimeout(()=>window.openPage('settings',false),0);});
 await page.waitForTimeout(800);
 const result=await page.evaluate(()=>({page:window.state?.page,heading:document.querySelector('#mainContent h1')?.textContent||'',events:window.__h38AgentCardTrace?.events||[]}));
 fs.writeFileSync(path.join(root,'settings-diagnostic.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 await browser.close();await new Promise(r=>local.close(r));
})().catch(e=>{try{fs.writeFileSync(path.join(root,'settings-diagnostic.json'),JSON.stringify({error:String(e&&e.stack||e)},null,2));}catch(_){}console.error(e);process.exit(1);});