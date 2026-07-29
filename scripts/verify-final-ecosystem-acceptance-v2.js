#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const childProcess=require('child_process');
const crypto=require('crypto');

const ROOT=path.resolve(__dirname,'..');
const EVIDENCE_DIR=path.join(ROOT,'launch-control','evidence');
fs.mkdirSync(EVIDENCE_DIR,{recursive:true});
const passes=[];
const failures=[];
const check=(name,condition,detail='')=>(condition?passes:failures).push({name,detail});
const exists=rel=>fs.existsSync(path.join(ROOT,rel));
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const json=rel=>JSON.parse(read(rel));
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');

function localTarget(url){
  const base='https://rkrueth-maker.github.io/highway-38-solutions/';
  if(!String(url).startsWith(base))return null;
  return String(url).slice(base.length).split(/[?#]/)[0]||'index.html';
}

function runVerifier(file){
  const full=path.join(ROOT,file);
  if(!fs.existsSync(full))return {file,status:'MISSING',exitCode:null,detail:'missing'};
  const result=childProcess.spawnSync(process.execPath,[full],{cwd:ROOT,encoding:'utf8',env:process.env,maxBuffer:25*1024*1024});
  return {file,status:result.status===0?'PASS':'FAIL',exitCode:result.status,detail:(result.stderr||result.stdout||'').slice(-3000)};
}

function main(){
  const required=[
    'launch-control/final-acceptance-package.json','launch-control/FINAL_ACCEPTANCE.md','final-acceptance.html','ecosystem-status.html',
    'revenue-operations-status.html','customer-portal.html','business-concept-builder.html','proof.html','free-tools.html','products.html','sitemap.xml','catalog-data.js',
    'core-engine/product/config/core-engine.default.json','core-engine/product/business-concept-builder/business-concept-core.js','core-engine/customer-portal/README.md',
    'core-engine/revenue-operations/config/provider-activation.json','core-engine/revenue-operations/config/social-content-plan-30-day.json','proof-system/status.json',
    'scripts/verify-proof-evidence-current.js'
  ];
  required.forEach(file=>check(`required artifact: ${file}`,exists(file)));

  const pkg=json('launch-control/final-acceptance-package.json');
  check('acceptance package identity',pkg.schemaVersion===1&&pkg.release==='complete-ecosystem-acceptance-2026-07-12'&&pkg.masterIssue===31&&pkg.integrationIssue===37);
  check('overall conditional decision',pkg.overallDecision==='CONDITIONAL_GO'&&String(pkg.decisionMeaning).includes('HOLD'));
  check('no scope reduction or fake completion',pkg.scopeAccounting?.scopeReduced===false&&pkg.scopeAccounting?.silentOmissions===false&&pkg.scopeAccounting?.fakeCompletion===false&&pkg.scopeAccounting?.criticalControlsWaived===false&&pkg.scopeAccounting?.exactBlockersRetained===true);
  check('six workstreams exact',JSON.stringify((pkg.workstreams||[]).map(item=>item.issue))===JSON.stringify([32,33,34,35,36,37]));
  check('all workstreams record decisions and rollback',pkg.workstreams.every(item=>item.decision&&item.rollback));

  const components=new Map(pkg.componentDecisions.map(item=>[item.component,item.decision]));
  const expected={
    'Public website and customer path':'GO','Owner Portal':'GO','Customer Portal production activation':'HOLD','Business Concept Builder':'GO',
    'Transferable Business OS':'GO','Private PST and photo source processing':'HOLD','Revenue and contract records':'GO','Accounting':'GO',
    'Social content bank':'GO','Production payment links and processing':'HOLD','Advertising spend':'HOLD'
  };
  Object.entries(expected).forEach(([name,decision])=>check(`component decision: ${name}`,components.get(name)===decision,components.get(name)||'missing'));
  check('complete component matrix',pkg.componentDecisions.length>=20,String(pkg.componentDecisions.length));

  const portal=pkg.workstreams.find(item=>item.issue===33)?.ownerPortal;
  check('Owner Portal evidence recorded',portal&&typeof portal.boundScriptId==='string'&&portal.boundScriptId.length>20&&typeof portal.deploymentId==='string'&&portal.deploymentId.length>20);
  check('Owner Portal remains existing private deployment',portal?.deploymentVersion===9&&portal?.selfTest==='PASS'&&portal?.externalActionsEnabled===false&&portal?.standaloneProjectCreated===false&&portal?.secondDeploymentCreated===false);
  const customerPortal=pkg.workstreams.find(item=>item.issue===33)?.customerPortal;
  check('customer portal remains fail closed',customerPortal?.recordsExposed===false&&String(customerPortal?.status).startsWith('HOLD'));

  check('public URL inventory recorded',pkg.livePublicUrls.length>=16,String(pkg.livePublicUrls.length));
  pkg.livePublicUrls.forEach(url=>{const target=localTarget(url);check(`public URL target: ${url}`,target&&exists(target),target||'invalid site URL');});
  check('final acceptance route published in sitemap',exists('final-acceptance.html')&&read('sitemap.xml').includes('<loc>https://rkrueth-maker.github.io/highway-38-solutions/final-acceptance.html</loc>'));

  const blockerIds=pkg.exactRemainingBlockers.map(item=>item.id);
  check('blockers numerous and unique',blockerIds.length>=15&&new Set(blockerIds).size===blockerIds.length,String(blockerIds.length));
  check('every blocker has exact next step',pkg.exactRemainingBlockers.every(item=>item.id&&item.component&&item.blocker&&String(item.nextStep).length>20));
  ['CUSTOMER-','PST-','PHOTO-','PROOF-','EMAIL-','PAYMENT-','ACCOUNTING-','SOCIAL-','COMMERCIAL-','OWNER-'].forEach(prefix=>check(`blocker class ${prefix}`,blockerIds.some(id=>String(id).startsWith(prefix))));

  check('external action matrix locked',Object.values(pkg.externalActionState).every(value=>['LOCKED','DISABLED'].includes(value)));
  check('bulk and automatic retry disabled',pkg.externalActionState.bulkExecution==='DISABLED'&&pkg.externalActionState.automaticRetry==='DISABLED');
  check('privacy decision PASS',pkg.privacyDecision?.status==='PASS'&&Object.entries(pkg.privacyDecision).filter(([key])=>key!=='status').every(([,value])=>value===false));
  check('no external action occurred',pkg.externalActionsOccurred===false);
  check('rollback register complete',pkg.rollbackRegister.length>=6&&pkg.rollbackRegister.every(item=>item.component&&item.reference&&item.method));
  check('public rollback baseline recorded',pkg.rollbackRegister.some(item=>item.reference==='3bd325f'));
  check('acceptance requirements all recorded',Object.values(pkg.acceptanceRequirements).every(Boolean));

  const catalog=read('catalog-data.js');
  const products=new Set(catalog.match(/H38-P\d{3}/g)||[]);
  const bundles=new Set(catalog.match(/H38-B\d{3}/g)||[]);
  check('exact 15 products',products.size===15,[...products].sort().join(','));
  check('exact 9 bundles',bundles.size===9,[...bundles].sort().join(','));
  check('contiguous product IDs',Array.from({length:15},(_,index)=>`H38-P${String(index+1).padStart(3,'0')}`).every(id=>products.has(id)));
  check('contiguous bundle IDs',Array.from({length:9},(_,index)=>`H38-B${String(index+1).padStart(3,'0')}`).every(id=>bundles.has(id)));

  const provider=json('core-engine/revenue-operations/config/provider-activation.json');
  check('provider configuration fail closed',provider.controls.externalActionsEnabled===false&&provider.controls.selectedRecordOnly===true&&provider.controls.bulkExecution===false&&provider.controls.automaticRetry===false);
  check('six non-live provider slots with exact steps',provider.providers.length===6&&provider.providers.every(item=>item.liveExecution===false&&String(item.exactConnectionStep).length>20));
  check('provider-hosted payment security',provider.paymentSecurity.providerHostedCardEntryRequired===true&&provider.paymentSecurity.rawCardDataAllowed===false);

  const social=json('core-engine/revenue-operations/config/social-content-plan-30-day.json');
  check('30-day content bank',social.days.length===30&&new Set(social.days.map(item=>item.day)).size===30);
  check('five social platforms',JSON.stringify(social.approvedPlatforms)===JSON.stringify(['facebook','instagram','linkedin','google-business-profile','youtube']));
  check('social publishing disabled',social.publishingControls.externalPublishingEnabled===false&&social.externalActionsOccurred===false);

  const proof=json('proof-system/status.json');
  const proofBlockers=new Map((proof.blockers||[]).map(item=>[item.id,item]));
  check('Drive proof pass recorded with private-source holds retained',
    proof.status==='DRIVE_EVIDENCE_PASS_COMPLETE_OWNER_SOURCES_PENDING'&&
    proof.privateSourcePublished===false&&proof.publicRawPhotoPublished===false&&proof.externalActionsOccurred===false&&
    proof.privateEvidencePass?.privateSourceRecordsIndexed===12&&proof.privateEvidencePass?.stillImagesClassified===18&&
    ['BLOCK-PST-001','BLOCK-PHOTO-001','BLOCK-CAD-001'].every(id=>proofBlockers.get(id)?.status==='OWNER_SOURCE_UNAVAILABLE'&&String(proofBlockers.get(id)?.exactNextStep||'').length>40)
  );

  const page=read('final-acceptance.html');
  check('final page metadata',/<title>[^<]+<\/title>/i.test(page)&&/<meta[^>]+name="viewport"/i.test(page));
  check('final page states conditional decision and external lock',page.includes('conditional GO')&&page.includes('External actions locked'));
  check('final public page excludes Owner Portal identifiers',!page.includes(portal.boundScriptId)&&!page.includes(portal.deploymentId));
  check('final public page excludes private-source identifiers',!/(?:\bClow\b|\bCSC\b|backup\.pst|rkrueth@gmail\.com)/i.test(page));
  check('final public page has no submit or network execution',!/<form\b/i.test(page)&&!/(fetch\(|XMLHttpRequest|sendBeacon)/.test(page));
  [...page.matchAll(/href="([^"]+)"/g)].forEach(match=>{const href=match[1];if(/^(?:https?:|mailto:|tel:|#)/.test(href))return;const target=href.split(/[?#]/)[0];if(target)check(`final page local link: ${target}`,exists(target));});

  const verifierFiles=[
    'scripts/verify-complete-ecosystem-launch.js','scripts/verify-public-ecosystem-tools.js','scripts/verify-business-os-productization.js',
    'scripts/verify-business-concept-builder.js','scripts/verify-proof-evidence-current.js','scripts/verify-revenue-operations-core.js','scripts/verify-revenue-growth-activation.js'
  ];
  const verifierRuns=verifierFiles.map(runVerifier);
  verifierRuns.forEach(result=>check(`integrated verifier: ${result.file}`,result.status==='PASS',result.detail));

  const evidence={
    release:pkg.release,status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),sourceBaseline:pkg.sourceBaseline,
    overallDecision:pkg.overallDecision,passed:passes.length,failed:failures.length,
    workstreams:pkg.workstreams.map(item=>({issue:item.issue,name:item.name,decision:item.decision})),
    components:{total:pkg.componentDecisions.length,go:pkg.componentDecisions.filter(item=>item.decision==='GO').length,hold:pkg.componentDecisions.filter(item=>item.decision==='HOLD').length},
    blockers:pkg.exactRemainingBlockers.length,livePublicUrls:pkg.livePublicUrls.length,rollbackPoints:pkg.rollbackRegister.length,
    integratedVerifierRuns:verifierRuns.map(result=>({file:result.file,status:result.status,exitCode:result.exitCode})),
    packageDigest:hash(pkg),externalActionsOccurred:false,passes,failures
  };
  fs.writeFileSync(path.join(EVIDENCE_DIR,'final-ecosystem-acceptance-verification.json'),JSON.stringify(evidence,null,2)+'\n');
  fs.writeFileSync(path.join(EVIDENCE_DIR,'final-ecosystem-acceptance-package.json'),JSON.stringify(pkg,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
  process.exit(failures.length?1:0);
}

try{main();}catch(error){
  const crash={status:'CRASH',generatedAt:new Date().toISOString(),error:error.message,stack:error.stack,externalActionsOccurred:false};
  fs.writeFileSync(path.join(EVIDENCE_DIR,'final-ecosystem-acceptance-verification.json'),JSON.stringify(crash,null,2)+'\n');
  console.error(JSON.stringify(crash,null,2));
  process.exit(1);
}
