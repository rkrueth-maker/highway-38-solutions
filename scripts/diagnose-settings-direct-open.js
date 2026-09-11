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
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  await stub(context);
  const page=await context.newPage();
  page.on('console',m=>console.error('BROWSER',m.text()));
  await page.addInitScript(()=>{
    const Native=window.MutationObserver;const registry=[];const origins=new Map();let nextId=0;
    const name=node=>{if(!node)return'';if(node.nodeType===3)return'#text';const tag=String(node.nodeName||'').toLowerCase();const id=node.id?`#${node.id}`:'';const cls=typeof node.className==='string'&&node.className.trim()?'.'+node.className.trim().split(/\s+/).slice(0,2).join('.') : '';return`${tag}${id}${cls}`.slice(0,160);};
    const nodePath=node=>{const out=[];let cur=node;for(let i=0;cur&&i<5;i++,cur=cur.parentElement)out.push(name(cur));return out.join(' <- ');};
    const sig=record=>record.type==='childList'?`childList|${nodePath(record.target)}|+${[...record.addedNodes].slice(0,3).map(name).join(',')}|-${[...record.removedNodes].slice(0,3).map(name).join(',')}`:`${record.type}|${nodePath(record.target)}|${record.attributeName||''}`;
    window.__h38SettingsMutationTrace={active:false,total:0,signatures:new Map(),counts:new Map(),reported:false,report:null};
    function Wrapped(callback){
      const id=++nextId;
      origins.set(id,String(new Error(`observer-${id}`).stack||'').replace(/\s+/g,' ').slice(0,1200));
      const native=new Native((records,observer)=>{
        const t=window.__h38SettingsMutationTrace;
        if(t?.active){
          t.total++;t.counts.set(id,(t.counts.get(id)||0)+1);
          for(const record of records){const key=sig(record);t.signatures.set(key,(t.signatures.get(key)||0)+1);}
          if(t.total>=500&&!t.reported){
            t.reported=true;
            t.report={
              total:t.total,
              top:[...t.signatures.entries()].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([signature,count])=>({count,signature})),
              observers:[...t.counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([observerId,count])=>({observerId,count,origin:origins.get(observerId)}))
            };
            console.error('SETTINGS_MUTATION_LOOP '+JSON.stringify(t.report));
            registry.forEach(item=>item.disconnect());t.active=false;
          }
        }
        return callback(records,observer);
      });
      registry.push(native);return native;
    }
    Wrapped.prototype=Native.prototype;try{Object.setPrototypeOf(Wrapped,Native);}catch(_){}window.MutationObserver=Wrapped;
  });
  const base=`http://127.0.0.1:${local.address().port}`;
  await page.goto(`${base}/commercial-app/index.html`,{waitUntil:'load',timeout:20000});
  await page.waitForFunction(()=>document.readyState==='complete'&&typeof window.openPage==='function'&&window.H38_DESKTOP_NAVIGATION_AUTHORITY,{timeout:12000});
  await page.evaluate(s=>{window.state.shell='office';window.state.page='today';window.state.businessId='B-H38';window.state.businessKey='highway38';window.state.snapshot=s;window.state.bridgeReady=true;window.h38SetAuthorizedChrome?.(true);window.H38_DESKTOP_NAVIGATION_AUTHORITY?.installAsFinalAuthority?.();window.renderNav?.();window.openPage?.('today',false);},snap());
  await page.waitForTimeout(300);
  await page.evaluate(()=>{const t=window.__h38SettingsMutationTrace;t.active=true;t.total=0;t.signatures.clear();t.counts.clear();t.reported=false;t.report=null;setTimeout(()=>window.openPage('settings',false),0);});
  await page.waitForTimeout(2500);
  const result=await page.evaluate(()=>({page:window.state?.page,heading:document.querySelector('#mainContent h1')?.textContent||'',traceActive:window.__h38SettingsMutationTrace?.active,total:window.__h38SettingsMutationTrace?.total||0,report:window.__h38SettingsMutationTrace?.report||null}));
  fs.writeFileSync(path.join(root,'settings-diagnostic.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  await browser.close();await new Promise(r=>local.close(r));
})().catch(e=>{try{fs.writeFileSync(path.join(root,'settings-diagnostic.json'),JSON.stringify({error:String(e&&e.stack||e)},null,2));}catch(_){}console.error(e);process.exit(1);});