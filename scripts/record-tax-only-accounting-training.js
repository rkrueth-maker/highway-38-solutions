'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawnSync}=require('child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.H38_TAX_TRAINING_DIR||path.join(root,'artifacts/tax-only-accounting-training'));
const officeUrl=process.env.H38_OFFICE_URL||'https://highway38solutions.com/commercial-app/';
const suppliedState=process.env.H38_WORKFLOW_STORAGE_STATE;
const email=String(process.env.H38_WORKFLOW_TEST_EMAIL||'').trim().toLowerCase();
const password=String(process.env.H38_WORKFLOW_TEST_PASSWORD||'');
const generatedState=process.env.H38_WORKFLOW_AUTH_STATE_OUT||path.join(os.tmpdir(),'h38-tax-training-auth.json');
const now=()=>new Date().toISOString();
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const fail=(code,detail)=>{fs.mkdirSync(out,{recursive:true});write('manifest.json',{status:'HOLD',code,detail,capturedAt:now()});throw Error(`${code}: ${detail}`)};

if(process.env.H38_WORKFLOW_RECORDING_AUTHORIZED!=='true')fail('AUTHORIZATION_REQUIRED','Authorize controlled TEST-record training before recording.');
if(!suppliedState&&!email&&!password)fail('AUTH_MATERIAL_REQUIRED','Supply recorder storage state or the TEST login credential pair.');

function tenantUrl(key){const u=new URL(officeUrl);u.searchParams.set('businessKey',key);return u.toString();}
function ffmpegAvailable(){return spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;}
function convert(source,target){const r=spawnSync('ffmpeg',['-y','-i',source,'-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',target],{encoding:'utf8'});if(r.status!==0)throw Error(clean((r.stderr||r.stdout||'MP4 conversion failed').slice(-1200)));}
async function storageState(browser){
  if(suppliedState&&fs.existsSync(suppliedState))return suppliedState;
  const ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage();
  try{
    await page.goto(tenantUrl('highway38'),{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#h38AuthForm').waitFor({timeout:20000});
    await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
    await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='highway38'&&!!window.state?.snapshot?.user,null,{timeout:30000});
    await ctx.storageState({path:generatedState});fs.chmodSync(generatedState,0o600);return generatedState;
  }finally{try{await page.locator('#h38AuthPassword').fill('');}catch(_){}await ctx.close();}
}
async function ready(page){
  await page.goto(tenantUrl('highway38'),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(700);
  if(await page.locator('#h38AuthForm:visible').count()){
    if(!email||!password)throw Error('The refreshed training context requires the secure TEST login credential pair.');
    await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);
    await page.getByRole('button',{name:'Sign in securely',exact:true}).click();
  }
  await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='highway38'&&!!window.state?.snapshot?.user&&!!window.state?.bridgeReady,null,{timeout:40000});
  await page.waitForFunction(()=>!!window.H38_TAX_CENTER,null,{timeout:20000});
  await page.addStyleTag({content:'#h38TrainingCaption{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:min(780px,calc(100vw - 24px));padding:12px 18px;border-radius:12px;background:rgba(5,35,52,.96);color:#fff;font:700 18px/1.3 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35);text-align:center;pointer-events:none}@media(max-width:600px){#h38TrainingCaption{font-size:14px;bottom:84px;padding:9px 11px;max-width:calc(100vw - 20px)}}input:focus,button:focus{outline:4px solid #ffbf47!important;outline-offset:3px!important}'});
}
async function caption(page,text,ms=1500){await page.evaluate(v=>{let n=document.getElementById('h38TrainingCaption');if(!n){n=document.createElement('div');n.id='h38TrainingCaption';document.body.appendChild(n);}n.textContent=v;},text);await page.waitForTimeout(ms);}
async function openPage(page,key){const target=page.locator(`[data-page="${key}"]:visible`).first();if(await target.count())await target.click();else await page.evaluate(pageKey=>{if(typeof window.openPage!=='function')throw Error(`Navigation unavailable for ${pageKey}.`);window.openPage(pageKey);},key);await page.waitForFunction(pageKey=>window.state?.page===pageKey,key,{timeout:10000});await page.waitForTimeout(850);}
async function record(page,kind,result){
  await caption(page,'TRAINING: H38 Office runs the business. QuickBooks is only an optional tax handoff.',2200);
  await openPage(page,'money');
  const nativeCounts=await page.evaluate(()=>({invoices:(window.state?.snapshot?.invoices||[]).length,payments:(window.state?.snapshot?.payments||[]).length,expenses:(window.state?.snapshot?.expenses||[]).length}));
  result.nativeCounts=nativeCounts;
  await caption(page,'Daily bookkeeping stays in H38: invoices, payments, expenses, balances and job-cost records are handled here.',2300);
  await caption(page,'Recording a manual payment updates H38 bookkeeping only. It does not move money and it does not require QuickBooks.',2300);
  await openPage(page,'accounting');
  const taxCard=page.locator('#h38QuickBooksBridge[data-h38-tax-center-ready]');
  await taxCard.waitFor({state:'visible',timeout:15000});
  await page.getByRole('heading',{name:'Office runs the business. QuickBooks is tax-only.',exact:true}).waitFor({timeout:10000});
  await caption(page,'The Accounting page is now the H38 Tax Center. QuickBooks is not part of the daily operating workflow.',2300);
  const form=taxCard.locator('[data-h38-tax-form]');
  await form.getByRole('button',{name:'Build tax package',exact:true}).click();
  await page.waitForFunction(()=>{const text=String(document.querySelector('[data-h38-tax-counts]')?.textContent||'');return /invoices.*payments.*expenses/i.test(text)&&!/No tax package built yet/i.test(text);},null,{timeout:10000});
  const summary=await page.evaluate(()=>({counts:String(document.querySelector('[data-h38-tax-counts]')?.textContent||''),metrics:Array.from(document.querySelectorAll('[data-h38-tax-summary] strong')).map(n=>String(n.textContent||'')),quickBooks:String(document.querySelector('[data-h38-tax-qbo]')?.textContent||'')}));
  result.taxSummary=summary;
  await caption(page,'Build the tax package from H38 records. Invoiced revenue, recorded payments, expenses and open AR stay separate for the accountant.',2600);
  const downloadButton=taxCard.locator('[data-h38-tax-download]');
  await downloadButton.waitFor({state:'visible',timeout:10000});
  const downloadPromise=page.waitForEvent('download',{timeout:10000});
  await downloadButton.click();
  const downloaded=await downloadPromise;
  const downloads=path.join(out,'downloads');fs.mkdirSync(downloads,{recursive:true});
  await downloaded.saveAs(path.join(downloads,`${result.id}-tax-package.csv`));
  result.taxCsv=`downloads/${result.id}-tax-package.csv`;
  await caption(page,'Download the tax CSV when you need to hand records to an accountant. Nothing is posted to QuickBooks by this step.',2600);
  await caption(page,'QuickBooks connection is optional and tax-only. Customers, quotes, jobs, scheduling, receipts, invoices, payments, AR and profitability remain in H38.',3000);
  result.status='PASS';
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});const raw=path.join(out,'raw'),mp4=path.join(out,'mp4'),shots=path.join(out,'screenshots');for(const p of [raw,mp4,shots])fs.mkdirSync(p,{recursive:true});
  const browser=await chromium.launch({headless:true}),auth=await storageState(browser),runs=[];
  try{
    for(const spec of [{id:'H38-TAX-ONLY-ACCOUNTING-DESKTOP',viewport:{width:1440,height:900},kind:'desktop'},{id:'H38-TAX-ONLY-ACCOUNTING-PHONE',viewport:{width:390,height:844},kind:'mobile'}]){
      const ctx=await browser.newContext({storageState:auth,viewport:spec.viewport,acceptDownloads:true,recordVideo:{dir:raw,size:spec.viewport}}),page=await ctx.newPage(),video=page.video();
      const result={id:spec.id,title:`Native H38 accounting and QuickBooks tax-only handoff — ${spec.kind}`,viewport:`${spec.viewport.width}x${spec.viewport.height}`,testDataOnly:true,status:'HOLD',capturedAt:now()};
      try{await ready(page);await record(page,spec.kind,result);await page.screenshot({path:path.join(shots,`${spec.id}-pass.png`),fullPage:false});}catch(error){result.detail=error.stack||error.message;try{await page.screenshot({path:path.join(shots,`${spec.id}-hold.png`),fullPage:false});}catch(_){}}
      await page.close();await ctx.close();
      const source=await video.path(),webm=path.join(raw,`${spec.id}-${result.status.toLowerCase()}.webm`);if(fs.existsSync(source))fs.renameSync(source,webm);result.rawEvidence=path.relative(out,webm);
      if(ffmpegAvailable()&&fs.existsSync(webm)){const target=path.join(mp4,`${spec.id}-${result.status.toLowerCase()}.mp4`);convert(webm,target);result.mp4Evidence=path.relative(out,target);}
      runs.push(result);
    }
  }finally{await browser.close();}
  const status=runs.every(r=>r.status==='PASS')?'PASS':'HOLD';write('manifest.json',{status,build:'20260924-tax-training-1',source:'real-deployed-office',quickBooksRole:'tax-only',capturedAt:now(),runs});
  if(status!=='PASS')process.exitCode=1;
})().catch(error=>fail('RECORDER_FAILED',error.stack||error.message));
