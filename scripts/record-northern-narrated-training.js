'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const scenarios=JSON.parse(fs.readFileSync(path.join(__dirname,'northern-training-scenarios.json'),'utf8'));
const out=path.resolve(process.env.NORTHERN_TRAINING_DIR||path.join(root,'artifacts/northern-narrated-training'));
const officeUrl=process.env.H38_OFFICE_URL||'https://highway38solutions.com/commercial-app/';
const suppliedState=process.env.H38_WORKFLOW_STORAGE_STATE;
const email=String(process.env.H38_WORKFLOW_TEST_EMAIL||'').trim().toLowerCase();
const password=String(process.env.H38_WORKFLOW_TEST_PASSWORD||'');
const generatedState=process.env.H38_WORKFLOW_AUTH_STATE_OUT||path.join(os.tmpdir(),'northern-training-auth.json');
const piperModel=String(process.env.NORTHERN_NARRATOR_MODEL||'').trim();
const sourceSha=process.env.GITHUB_SHA||'local';
const now=()=>new Date().toISOString(),clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
fs.mkdirSync(path.join(out,'audio'),{recursive:true});fs.mkdirSync(path.join(out,'videos'),{recursive:true});
if(process.env.H38_WORKFLOW_RECORDING_AUTHORIZED!=='true')throw new Error('Controlled TEST-record training authorization is required.');
if(!suppliedState&&!email&&!password)throw new Error('Recorder storage state or secure TEST credentials are required.');
if(!piperModel||!fs.existsSync(piperModel))throw new Error('Approved local Northern narrator model is required.');
function writeJson(name,value){fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');}
function tenantUrl(){const u=new URL(officeUrl);u.searchParams.set('businessKey','northern-lakes');return u.toString();}
function probeMs(file){const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'});const n=Number(String(r.stdout||'').trim());return Number.isFinite(n)&&n>0?Math.ceil(n*1000):0;}
function synth(text,file){const r=spawnSync('piper',['--model',piperModel,'--output_file',file],{input:text+'\n',encoding:'utf8',maxBuffer:4*1024*1024});if(r.status!==0||!fs.existsSync(file))throw new Error('Local narrator synthesis failed: '+clean(r.stderr||r.stdout));}
function mux(raw,target,events){
  const a=['-y','-i',raw];events.forEach(e=>a.push('-i',e.wav));
  const f=[];events.forEach((e,i)=>f.push(`[${i+1}:a]adelay=${Math.max(0,e.offsetMs)}:all=1[a${i}]`));
  f.push(`${events.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${events.length}:duration=longest:dropout_transition=0:normalize=0,volume=0.90,apad[aout]`);
  a.push('-filter_complex',f.join(';'),'-map','0:v:0','-map','[aout]','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-shortest',target);
  const r=spawnSync('ffmpeg',a,{encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw new Error('Narration mux failed: '+clean((r.stderr||r.stdout||'').slice(-1800)));
}
async function authenticate(browser){
  if(suppliedState&&fs.existsSync(suppliedState))return suppliedState;
  const c=await browser.newContext({viewport:{width:1420,height:900}}),p=await c.newPage();
  try{await p.goto(tenantUrl(),{waitUntil:'domcontentloaded',timeout:45000});await p.locator('#h38AuthForm').waitFor({state:'visible',timeout:20000});await p.locator('#h38AuthEmail').fill(email);await p.locator('#h38AuthPassword').fill(password);await p.getByRole('button',{name:'Sign in securely',exact:true}).click();await p.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='northern-lakes'&&!!window.state?.snapshot?.user,null,{timeout:35000});await c.storageState({path:generatedState});fs.chmodSync(generatedState,0o600);return generatedState;}finally{try{await p.locator('#h38AuthPassword').fill('');}catch(_){}await c.close();}
}
async function style(page){await page.addStyleTag({content:`#nlNarrationCaption{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:min(940px,calc(100vw - 24px));padding:13px 18px;border-radius:12px;background:rgba(9,31,43,.96);color:#fff;font:700 18px/1.35 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35);text-align:center;pointer-events:none}@media(max-width:600px){#nlNarrationCaption{font-size:14px;bottom:84px;padding:9px 11px;max-width:calc(100vw - 20px)}}.nl-training-focus{outline:5px solid #ffbf47!important;outline-offset:4px!important;scroll-margin:110px!important}.nl-training-private{filter:blur(9px)!important;user-select:none!important}[href^="mailto:"],[href^="tel:"],input[type="email"],input[type="tel"]{filter:blur(8px)!important;user-select:none!important}`}).catch(()=>{});}
async function clearCaption(page){await page.evaluate(()=>document.getElementById('nlNarrationCaption')?.remove()).catch(()=>{});}
async function mask(page){await page.evaluate(()=>{
  const s=window.state?.snapshot||{},rows=[...(Array.isArray(s.customers)?s.customers:[]),...(Array.isArray(s.properties)?s.properties:[])],tokens=[];
  for(const row of rows){if(/TEST/i.test(JSON.stringify(row)))continue;for(const [k,v] of Object.entries(row||{})){if(!/(name|address|street|email|phone|company|property)/i.test(k))continue;const t=String(v||'').trim();if(t.length>=4&&t.length<140)tokens.push(t.toLowerCase());}}
  const u=Array.from(new Set(tokens)).slice(0,2500),nodes=document.querySelectorAll('#mainContent tr,#mainContent article,#mainContent .card,#mainContent .row,#mainContent [data-h38-customer-card],#mainContent li');
  for(const n of nodes){const t=String(n.innerText||'').toLowerCase();if(/\btest\b/i.test(t))continue;if(u.some(x=>t.includes(x)))n.classList.add('nl-training-private');}
}).catch(()=>{});}
async function ready(page){
  await page.goto(tenantUrl(),{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#h38AuthForm:visible').count()){await page.locator('#h38AuthEmail').fill(email);await page.locator('#h38AuthPassword').fill(password);await page.getByRole('button',{name:'Sign in securely',exact:true}).click();}
  await page.waitForFunction(()=>String(window.state?.snapshot?.business?.businessKey||'').toLowerCase()==='northern-lakes'&&!!window.state?.snapshot?.user&&!!window.state?.bridgeReady,null,{timeout:40000});await page.waitForTimeout(900);await style(page);await mask(page);
}
async function pages(page){return page.evaluate(()=>{try{if(typeof window.allowedPages==='function')return Array.from(new Set(window.allowedPages()));}catch(_){}return Object.keys(window.PAGE_DEFS||{});});}
async function open(page,key,required=true){
  await clearCaption(page);const p=await pages(page);if(!p.includes(key)){if(required)throw new Error('Required Northern Office page unavailable: '+key);return false;}
  const b=page.locator(`[data-page="${key}"]:visible`).first();if(await b.count())await b.click();else await page.evaluate(k=>window.openPage(k),key);
  await page.waitForFunction(k=>window.state?.page===k,key,{timeout:10000});await page.waitForTimeout(550);await mask(page);return true;
}
async function highlight(page,pattern){return page.evaluate(p=>{document.querySelectorAll('.nl-training-focus').forEach(n=>n.classList.remove('nl-training-focus'));const r=new RegExp(p,'i'),nodes=Array.from(document.querySelectorAll('#mainContent tr,#mainContent article,#mainContent section,#mainContent .card,#mainContent .row,#mainContent [data-h38-customer-card],#mainContent details'));const n=nodes.find(x=>x.getClientRects().length&&r.test(String(x.innerText||''))&&!x.classList.contains('nl-training-private'));if(!n)return false;n.classList.add('nl-training-focus');n.scrollIntoView({block:'center'});return true;},pattern).catch(()=>false);}
async function fixture(page,kind){return page.evaluate(k=>{const rows=Array.isArray(window.state?.snapshot?.jobs)?window.state.snapshot.jobs:[],r=k==='snow'?/snow|plow/i:/lawn|mow/i,row=rows.find(x=>/TEST/i.test(JSON.stringify(x))&&r.test(JSON.stringify(x)));return row?{jobId:String(row['Job ID']||row.jobId||''),status:String(row.Status||row.status||'')}:null;},kind);}
async function narrate(page,result,text){
  const i=result.narration.length,offsetMs=Math.max(0,Date.now()-result.recordingStartedMs);await page.evaluate(t=>{let n=document.getElementById('nlNarrationCaption');if(!n){n=document.createElement('div');n.id='nlNarrationCaption';document.body.appendChild(n);}n.textContent=t;},text);
  const wav=path.join(out,'audio',`${result.id}-${String(i+1).padStart(2,'0')}.wav`);synth(text,wav);const durationMs=probeMs(wav)||Math.max(1800,Math.ceil(text.split(/\s+/).length/2.25*1000));result.narration.push({text,offsetMs,durationMs,wav});await page.waitForTimeout(durationMs+220);
}
async function runTour(page,result,scenario){
  if(!scenario.publicOnly){await ready(page);if(scenario.fixture){const f=await fixture(page,scenario.fixture);if(!f)throw new Error(`No controlled TEST ${scenario.fixture} fixture exists in Northern Lakes.`);result.fixture=f;}}else await style(page);
  await narrate(page,result,scenario.title);
  for(const step of scenario.steps){
    if(step.url){await clearCaption(page);await page.goto(step.url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(650);await style(page);}
    else{let ok=await open(page,step.page,!step.fallback);if(!ok&&step.fallback)await open(page,step.fallback,true);if(step.pattern)await highlight(page,step.pattern);}
    await narrate(page,result,step.text);result.steps.push({page:step.page||null,url:step.url||null,status:'PASS'});
  }
}
async function record(browser,statePath,scenario){
  const mobile=scenario.kind==='mobile',c=await browser.newContext({storageState:scenario.publicOnly?undefined:statePath,viewport:mobile?{width:430,height:860}:{width:1420,height:900},recordVideo:{dir:path.join(out,'videos'),size:mobile?{width:430,height:860}:{width:1420,height:900}}}),p=await c.newPage();
  const result={id:scenario.id,title:scenario.title,tenant:'northern-lakes',viewport:mobile?'phone':'desktop',status:'HOLD',steps:[],narration:[],voiceProfile:'deep calm warm cinematic male system narrator',externalActionsOccurred:false,startedAt:now(),recordingStartedMs:Date.now()};let raw='';
  try{await runTour(p,result,scenario);result.status='PASS';result.completedAt=now();}catch(e){result.error=clean(e?.message||e);result.completedAt=now();}
  finally{await clearCaption(p).catch(()=>{});const v=p.video();await p.close().catch(()=>{});await c.close().catch(()=>{});if(v)raw=await v.path().catch(()=> '');if(raw&&fs.existsSync(raw)){const webm=path.join(out,'videos',`${result.id}-${result.status.toLowerCase()}.webm`);fs.renameSync(raw,webm);result.rawVideo=path.relative(out,webm);const mp4=path.join(out,'videos',`${result.id}-${result.status.toLowerCase()}-NARRATED.mp4`);try{mux(webm,mp4,result.narration);result.trainingVideo=path.relative(out,mp4);}catch(e){result.status='HOLD';result.muxError=clean(e.message);}}else{result.status='HOLD';result.error=result.error||'No video produced.';}}
  result.narration=result.narration.map(x=>({...x,wav:path.relative(out,x.wav)}));writeJson(`${scenario.id}.json`,result);return result;
}
function index(manifest){const lines=['# Northern Lakes Narrated Training Library','',`Source: ${manifest.sourceSha}`,`Status: ${manifest.status}`,'','Narrator: generic deep, calm, warm male system voice.','',...manifest.videos.map(v=>`- ${v.status}: ${v.title} — ${v.trainingVideo||v.rawVideo||'no video'}`),'','Safety: real deployed Northern pages; controlled TEST records where records are shown; detected live customer/property rows are blurred; no customer send, payment, purchase, or external scheduling action is executed.',''];fs.writeFileSync(path.join(out,'README.md'),lines.join('\n'));}
(async()=>{const browser=await chromium.launch({headless:true}),manifest={kind:'northern-lakes-narrated-training',version:'20260925-v1',sourceSha,startedAt:now(),status:'HOLD',voiceProfile:'deep calm warm cinematic male system narrator',videos:[],externalActionsOccurred:false};try{const statePath=await authenticate(browser);for(const s of scenarios)manifest.videos.push(await record(browser,statePath,s));const failed=manifest.videos.filter(v=>v.status!=='PASS');manifest.status=failed.length?'HOLD':'PASS';manifest.completedAt=now();writeJson('manifest.json',manifest);writeJson('results.json',{status:manifest.status,passed:manifest.videos.filter(v=>v.status==='PASS').map(v=>v.id),failed:failed.map(v=>({id:v.id,error:v.error||v.muxError||'HOLD'})),externalActionsOccurred:false});index(manifest);if(failed.length){console.error(JSON.stringify({status:'HOLD',failed:failed.map(v=>({id:v.id,error:v.error||v.muxError}))},null,2));process.exitCode=1;}else console.log(JSON.stringify({status:'PASS',videos:manifest.videos.length,externalActionsOccurred:false},null,2));}finally{await browser.close().catch(()=>{});}})().catch(e=>{writeJson('fatal.json',{status:'HOLD',error:clean(e?.message||e),capturedAt:now(),sourceSha});console.error(e);process.exitCode=1;});
