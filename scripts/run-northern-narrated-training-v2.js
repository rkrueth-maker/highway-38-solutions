'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const scripts=__dirname;
const sourcePath=path.join(scripts,'record-northern-narrated-training.js');
const scenarioPath=path.join(scripts,'northern-training-scenarios.json');
const extraScenarioPath=path.join(scripts,'northern-training-scenarios-extra.json');
const runtimePath=path.join(scripts,'.northern-narrated-training-v2-runtime.js');
const runtimeScenarioPath=path.join(scripts,'.northern-training-scenarios-v2-runtime.json');

const scenarios=[
  ...JSON.parse(fs.readFileSync(scenarioPath,'utf8')),
  ...JSON.parse(fs.readFileSync(extraScenarioPath,'utf8'))
];
for(const scenario of scenarios){
  if(scenario.id==='NL-TRAIN-LAWN-FULL-SERVICE-PHONE'){
    for(const step of scenario.steps){if(step.pattern)step.pattern=step.pattern.replace(/\|TEST/g,'');}
  }
  if(scenario.id==='NL-TRAIN-SNOW-FULL-SERVICE-PHONE'){
    for(const step of scenario.steps){if(step.pattern)step.pattern=step.pattern.replace(/\|TEST/g,'');}
  }
}
fs.writeFileSync(runtimeScenarioPath,JSON.stringify(scenarios,null,2)+'\n');

let source=fs.readFileSync(sourcePath,'utf8');
source=source.replace("northern-training-scenarios.json",".northern-training-scenarios-v2-runtime.json");
source=source.replace("version:'20260925-v1'","version:'20260925-v3'");

source=source.replace(
  'async function ready(page){',
  `async function scrubEmails(page){await page.evaluate(()=>{const root=document.querySelector('#mainContent');if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const node of nodes){if(/\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/i.test(String(node.nodeValue||'')))node.nodeValue=String(node.nodeValue||'').replace(/\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/gi,'Staff user');}}).catch(()=>{});}\nasync function maskOppositeService(page,kind){await page.evaluate(k=>{const opposite=k==='lawn'?/snow|plow/i:/lawn|mow/i;const target=k==='lawn'?/lawn|mow/i:/snow|plow/i;const nodes=Array.from(document.querySelectorAll('#mainContent tr,#mainContent article,#mainContent section,#mainContent .card,#mainContent .row,#mainContent details'));for(const node of nodes){if(!node.getClientRects().length)continue;const text=String(node.innerText||'');if(opposite.test(text)&&!target.test(text))node.classList.add('nl-training-private');}},kind).catch(()=>{});}\nasync function focusServiceFixture(page,kind,jobId){return page.evaluate(({kind,jobId})=>{document.querySelectorAll('.nl-training-focus').forEach(n=>n.classList.remove('nl-training-focus'));const target=kind==='lawn'?/lawn|mow/i:/snow|plow/i,opposite=kind==='lawn'?/snow|plow/i:/lawn|mow/i;const nodes=Array.from(document.querySelectorAll('#mainContent tr,#mainContent article,#mainContent .card,#mainContent .row,#mainContent details,#mainContent [data-job-id],#mainContent [data-record-id]')).filter(n=>n.getClientRects().length&&!n.classList.contains('nl-training-private'));const eligible=n=>{const text=String(n.innerText||'');return target.test(text)&&!opposite.test(text);};let candidates=jobId?nodes.filter(n=>String(n.innerText||'').includes(jobId)&&eligible(n)):[];if(!candidates.length)candidates=nodes.filter(n=>/\\bTEST\\b/i.test(String(n.innerText||''))&&eligible(n));candidates.sort((a,b)=>String(a.innerText||'').length-String(b.innerText||'').length);const node=candidates[0];if(!node)return{ok:false,text:''};node.classList.add('nl-training-focus');node.scrollIntoView({block:'center',behavior:'auto'});return{ok:true,text:String(node.innerText||'')};},{kind,jobId}).catch(()=>({ok:false,text:''}));}\nasync function assertServiceFocus(page,kind){const text=await page.locator('.nl-training-focus').first().innerText().catch(()=> '');if(!text)throw new Error('Focused TEST '+kind+' service record is not visible in Work.');if(kind==='lawn'&&/snow|plow/i.test(text))throw new Error('Lawn training focused a snow/plow record.');if(kind==='snow'&&/lawn|mow/i.test(text))throw new Error('Snow training focused a lawn/mow record.');return text;}\nasync function waitForPortalLogin(page){await page.locator('#portalLogin').waitFor({state:'visible',timeout:20000});}\nasync function ready(page){`
);
source=source.replace('await style(page);await mask(page);','await style(page);await mask(page);await scrubEmails(page);');
source=source.replace('await page.waitForTimeout(550);await mask(page);return true;','await page.waitForTimeout(550);await mask(page);await scrubEmails(page);return true;');

const oldRun=`async function runTour(page,result,scenario){\n  if(!scenario.publicOnly){await ready(page);if(scenario.fixture){const f=await fixture(page,scenario.fixture);if(!f)throw new Error(\`No controlled TEST \${scenario.fixture} fixture exists in Northern Lakes.\`);result.fixture=f;}}else await style(page);\n  await narrate(page,result,scenario.title);\n  for(const step of scenario.steps){\n    if(step.url){await clearCaption(page);await page.goto(step.url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(650);await style(page);}\n    else{let ok=await open(page,step.page,!step.fallback);if(!ok&&step.fallback)await open(page,step.fallback,true);if(step.pattern)await highlight(page,step.pattern);}\n    await narrate(page,result,step.text);result.steps.push({page:step.page||null,url:step.url||null,status:'PASS'});\n  }\n}`;
const newRun=`async function runTour(page,result,scenario){\n  if(!scenario.publicOnly){\n    await ready(page);\n    if(scenario.fixture){const f=await fixture(page,scenario.fixture);if(!f)throw new Error(\`No controlled TEST \${scenario.fixture} fixture exists in Northern Lakes.\`);result.fixture=f;}\n  }else{\n    const firstUrl=scenario.steps.find(step=>step.url)?.url;\n    if(firstUrl){await page.goto(firstUrl,{waitUntil:'domcontentloaded',timeout:45000});if(firstUrl.includes('/customer-portal.html'))await waitForPortalLogin(page);await page.waitForTimeout(450);await style(page);}\n    else await style(page);\n  }\n  await narrate(page,result,scenario.title);\n  for(const step of scenario.steps){\n    if(step.url){\n      await clearCaption(page);\n      if(page.url()!==step.url)await page.goto(step.url,{waitUntil:'domcontentloaded',timeout:45000});\n      if(step.url.includes('/customer-portal.html'))await waitForPortalLogin(page);\n      await page.waitForTimeout(450);await style(page);\n    }else{\n      let ok=await open(page,step.page,!step.fallback);if(!ok&&step.fallback)await open(page,step.fallback,true);\n      if(scenario.fixture)await maskOppositeService(page,scenario.fixture);\n      let focused=false;\n      if(step.pattern){\n        if(scenario.fixture)focused=(await focusServiceFixture(page,scenario.fixture,result.fixture?.jobId||'')).ok;\n        else focused=await highlight(page,step.pattern);\n      }\n      if(scenario.fixture&&step.page==='work'){if(!focused)throw new Error('Controlled TEST '+scenario.fixture+' service fixture is not visible in Work.');await assertServiceFocus(page,scenario.fixture);}\n    }\n    await narrate(page,result,step.text);result.steps.push({page:step.page||null,url:step.url||null,status:'PASS'});\n  }\n}`;
if(!source.includes(oldRun))throw new Error('Northern recorder runTour source drifted; review patch before recording.');
source=source.replace(oldRun,newRun);
fs.writeFileSync(runtimePath,source);

try{
  const run=spawnSync(process.execPath,[runtimePath],{stdio:'inherit',env:process.env});
  process.exitCode=run.status===null?1:run.status;
}finally{
  for(const file of [runtimePath,runtimeScenarioPath]){try{fs.unlinkSync(file);}catch(_){} }
}
