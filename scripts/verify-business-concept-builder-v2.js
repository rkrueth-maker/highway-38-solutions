#!/usr/bin/env node
'use strict';

const fs=require('fs');
const osModule=require('os');
const path=require('path');
const vm=require('vm');
const childProcess=require('child_process');
const core=require('../core-engine/product/business-concept-builder/business-concept-core.js');
const product=require('../core-engine/product/lib/business-os-product.js');

const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'launch-control','evidence');
fs.mkdirSync(OUT,{recursive:true});
const passes=[];
const failures=[];
const check=(name,condition,detail='')=>(condition?passes:failures).push({name,detail});
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const json=rel=>JSON.parse(read(rel));
const exists=rel=>fs.existsSync(path.join(ROOT,rel));
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n','utf8');};
function expectThrow(name,fn,contains){try{fn();failures.push({name,detail:'Expected an error but none was thrown.'});}catch(error){check(name,!contains||String(error.message).includes(contains),error.message);}}

function main(){
  const required=[
    'business-concept-builder.html','business-concept-builder.js',
    'core-engine/product/business-concept-builder/README.md',
    'core-engine/product/business-concept-builder/business-concept-core.js',
    'core-engine/product/business-concept-builder/schema/business-concept-input.schema.json',
    'core-engine/product/business-concept-builder/schema/business-concept-package.schema.json',
    'core-engine/product/business-concept-builder/examples/synthetic-workshop-planning.input.json',
    'scripts/generate-business-concept-package.js'
  ];
  required.forEach(file=>check(`required artifact: ${file}`,exists(file)));

  const inputSchema=json('core-engine/product/business-concept-builder/schema/business-concept-input.schema.json');
  const packageSchema=json('core-engine/product/business-concept-builder/schema/business-concept-package.schema.json');
  const sample=json('core-engine/product/business-concept-builder/examples/synthetic-workshop-planning.input.json');
  check('input schema covers every required concept field',core.REQUIRED_INPUT_FIELDS.every(field=>inputSchema.required.includes(field)));
  check('package schema covers every required generated section',['businessSummary','customerProblemSegments','offers','productLadder','pricingLogic','freeLeadMagnet','addOns','recurringContracts','sitemap','pageOutlines','intakeQuestions','productRecords','sopList','businessOSConfiguration','businessPackDraft','launchPlan30Days','socialThemes','socialDrafts','expenseCategories','risks','missingInformation','decisions','tasks','records'].every(field=>packageSchema.required.includes(field)));

  const fixedTime='2026-07-12T12:00:00.000Z';
  const built=core.generatePackage(sample,{generatedAt:fixedTime});
  check('package validates',core.validatePackage(built).length===0,core.validatePackage(built).join(' '));
  check('package is owner-review only',built.metadata.status===core.OWNER_REVIEW&&built.metadata.selfApproved===false&&built.metadata.automaticExternalActions===false&&built.metadata.externalActionsOccurred===false);
  check('all input domains survive normalization',built.businessSummary.ownerSkills.length===5&&built.businessSummary.customers.length===3&&built.businessSummary.assetsEquipment.length===5&&built.businessSummary.businessModels.length===3&&built.businessSummary.currentSystems.length===1&&built.businessSummary.expansionIdeas.length===1);
  check('segments are generated from customer inputs',built.customerProblemSegments.length===3&&built.customerProblemSegments.every(item=>item.primaryProblem===sample.primaryProblem));
  check('five-level offer and product ladder generated',built.offers.length===5&&built.productLadder.length===5&&['Free','Starter','Core','Premium','Recurring'].every(level=>built.offers.some(item=>item.level===level)));
  check('pricing model uses time and revenue goal',built.pricingLogic.assumptions.hoursPerWeek===20&&built.pricingLogic.assumptions.monthlyRevenueGoal===6000&&built.pricingLogic.ranges.starter[0]===150&&built.pricingLogic.ranges.core[0]===600);
  check('lead magnet, add-ons, and contracts generated',built.freeLeadMagnet.conversionPath.includes('starter snapshot')&&built.addOns.length===6&&built.recurringContracts.length===2);
  check('website package adapts to models',built.sitemap.includes('Service Area')&&built.sitemap.includes('Online Delivery')&&built.sitemap.includes('Downloads and Tools')&&built.pageOutlines['Online Delivery']);
  check('intake covers model-specific questions',built.intakeQuestions.length>=14&&built.intakeQuestions.some(item=>item.includes('file formats'))&&built.intakeQuestions.some(item=>item.includes('service-area')));
  check('five unique draft product records generated',built.productRecords.length===5&&new Set(built.productRecords.map(item=>item.id)).size===5&&built.productRecords.every(item=>item.status==='DRAFT'&&item.ownerApprovalRequired===true&&item.externalActionsEnabled===false));
  check('20 selected-record SOP drafts generated',built.sopList.length===20&&built.sopList.every(item=>item.selectedRecordOnly===true&&item.externalActionsEnabled===false));
  check('complete 30-day plan and 25 Tasks generated',built.launchPlan30Days.length===5&&built.launchPlan30Days.flatMap(item=>item.taskIds).length===25&&built.tasks.length===25);
  check('all Tasks preserve controls and dependencies',built.tasks.every(task=>task.status==='NEEDS_OWNER_REVIEW'&&task.selectedRecordOnly===true&&task.bulkExecution===false&&task.externalActionsEnabled===false)&&built.tasks.every(task=>(task.dependencies||[]).every(id=>built.tasks.some(candidate=>candidate.id===id))));
  check('social, expenses, risk, decisions, and record aggregation generated',built.socialThemes.length===6&&built.socialDrafts.length===6&&built.expenseCategories.length===16&&built.risks.length>=10&&built.decisions.length===10&&built.records.tasks.length===25);

  const alternate={...sample,businessName:'South Shore Digital Operations',customers:['independent service businesses'],primaryProblem:'Leads and jobs are disconnected',primaryOutcome:'A controlled lead-to-delivery workflow',businessModels:['digital','online']};
  const alternateBuilt=core.generatePackage(alternate,{generatedAt:fixedTime});
  check('generator is data-dependent rather than static',alternateBuilt.metadata.inputDigest!==built.metadata.inputDigest&&alternateBuilt.productRecords[0].id!==built.productRecords[0].id&&alternateBuilt.customerProblemSegments.length===1&&alternateBuilt.offers[2].name===alternate.primaryOutcome);

  const secretLabel=['password','synthetic-secret'].join('=');
  const providerKey=['sk','live','SYNTHETIC123456'].join('_');
  const cardCandidate=['4111','1111','1111','1112'].join('');
  const sensitive={...sample,currentSystems:`${sample.currentSystems} ${secretLabel} ${providerKey} ${cardCandidate}`};
  const scrubbed=core.generatePackage(sensitive,{generatedAt:fixedTime});
  const scrubbedText=JSON.stringify(scrubbed);
  check('sensitive-looking inputs are redacted',scrubbed.metadata.redactionsApplied>=3&&!scrubbedText.includes('synthetic-secret')&&!scrubbedText.includes(providerKey)&&!scrubbedText.includes(cardCandidate)&&scrubbedText.includes('REDACTED-SENSITIVE'));
  expectThrow('incomplete concept is held',()=>core.generatePackage({businessName:'X',idea:'tiny'},{generatedAt:fixedTime}),'Working business name');

  const os=built.businessOSConfiguration;
  check('tenant isolation remains enforced',os.tenant.mode==='isolated'&&os.tenant.crossTenantReads===false&&os.tenant.crossTenantWrites===false);
  check('selected-record, duplicate, log, and retry controls remain enforced',os.controls.selectedRecordOnly===true&&os.controls.bulkExecution===false&&os.controls.automaticRetry===false&&os.controls.duplicateProtection===true&&os.controls.proofLogRequired===true&&os.controls.errorLogRequired===true);
  check('all provider slots are locked',['catalog','payment','email','accounting','social','website','storage','calendar'].every(slot=>os.providers.some(provider=>provider.slot===slot&&provider.credentialState==='NOT_CONFIGURED'&&provider.executionState==='LOCKED')));
  check('all external feature flags are disabled',core.EXTERNAL_FLAGS.every(flag=>built.businessPackDraft.featureFlags[flag]===false));
  check('Business Pack cannot self-enable execution',built.businessPackDraft.externalActionsEnabled===false&&built.businessPackDraft.support.selectedRecordOnly===true&&built.businessPackDraft.support.customerFacingApprovalRequired===true);

  const engine=json('core-engine/product/config/core-engine.default.json');
  const license=json('core-engine/product/licenses/example-evaluation-license.json');
  check('generated Business Pack validates',product.validateBusinessPack(built.businessPackDraft).length===0,product.validateBusinessPack(built.businessPackDraft).join(' '));
  const effective=product.compileInstallation(engine,built.businessPackDraft,{license,tenantKey:built.businessPackDraft.defaultTenantKey,tenantName:built.businessSummary.name,tier:built.businessPackDraft.defaultTier,releaseChannel:'development',environment:'test'});
  check('Business Pack compiles as isolated test installation',effective.environment==='test'&&effective.tenant.mode==='isolated'&&effective.externalActionsEnabled===false&&core.EXTERNAL_FLAGS.every(flag=>effective.featureFlags[flag]===false)&&Object.values(effective.providers).every(provider=>provider.executionState==='LOCKED'));

  const temp=fs.mkdtempSync(path.join(osModuleTmp(),'bcb-'));
  const installDir=path.join(temp,'install');
  const installed=product.installBusinessOs({engineConfig:engine,businessPack:built.businessPackDraft,license,outputDir:installDir,tenantKey:built.businessPackDraft.defaultTenantKey,tenantName:built.businessSummary.name,tier:built.businessPackDraft.defaultTier,releaseChannel:'development',environment:'test'});
  const tenantData=path.join(installDir,installed.effective.tenant.namespace,'data');
  fs.writeFileSync(path.join(tenantData,'tasks.json'),JSON.stringify(built.tasks,null,2)+'\n');
  fs.writeFileSync(path.join(tenantData,'products.json'),JSON.stringify(built.productRecords,null,2)+'\n');
  fs.writeFileSync(path.join(tenantData,'contracts.json'),JSON.stringify(built.recurringContracts,null,2)+'\n');
  check('installer creates isolated data, private storage, Proof Log, and Error Log',fs.existsSync(path.join(installDir,'effective-config.json'))&&fs.existsSync(path.join(installDir,installed.effective.tenant.namespace,'private-files'))&&fs.existsSync(path.join(installDir,installed.effective.tenant.namespace,'logs','proof-log.jsonl'))&&fs.existsSync(path.join(installDir,installed.effective.tenant.namespace,'logs','error-log.jsonl')));
  check('generated records materialize only in selected test tenant',JSON.parse(fs.readFileSync(path.join(tenantData,'tasks.json'))).length===25&&JSON.parse(fs.readFileSync(path.join(tenantData,'products.json'))).length===5&&path.resolve(tenantData).startsWith(path.resolve(installDir,installed.effective.tenant.namespace)));
  const backup=path.join(temp,'backup.json');
  product.createBackup(installDir,backup);
  const restored=product.restoreBackup(backup,path.join(temp,'restored'));
  check('backup and restore preserve tenant and records',restored.effective.tenant.key===effective.tenant.key&&JSON.parse(fs.readFileSync(path.join(temp,'restored',effective.tenant.namespace,'data','tasks.json'))).length===25);
  const tampered=JSON.parse(fs.readFileSync(backup,'utf8'));tampered.payload.effective.tenant.key='tampered';const tamperedFile=path.join(temp,'tampered.json');writeJson(tamperedFile,tampered);
  expectThrow('backup tampering is rejected',()=>product.restoreBackup(tamperedFile,path.join(temp,'bad-restore')),'integrity');

  const cliDir=path.join(temp,'cli');
  const cli=childProcess.spawnSync(process.execPath,[path.join(ROOT,'scripts/generate-business-concept-package.js'),'--input',path.join(ROOT,'core-engine/product/business-concept-builder/examples/synthetic-workshop-planning.input.json'),'--output',cliDir,'--generated-at',fixedTime],{encoding:'utf8'});
  check('CLI exits successfully',cli.status===0,cli.stderr||cli.stdout);
  const base='north-ridge-workshop-planning';
  const cliFiles=[`${base}-business-concept-package.json`,`${base}-owner-review-brief.md`,`${base}-created-tasks.csv`,`${base}-business-pack.draft.json`,`${base}-business-os-config.draft.json`,'generation-manifest.json'];
  check('CLI writes complete owner-review file set',cliFiles.every(file=>fs.existsSync(path.join(cliDir,file))),cliFiles.filter(file=>!fs.existsSync(path.join(cliDir,file))).join(', '));
  const cliPackage=JSON.parse(fs.readFileSync(path.join(cliDir,`${base}-business-concept-package.json`),'utf8'));
  check('CLI output matches shared core',cliPackage.metadata.inputDigest===built.metadata.inputDigest&&cliPackage.tasks.length===25&&cliPackage.productRecords.length===5);

  const coreSource=read('core-engine/product/business-concept-builder/business-concept-core.js');
  check('transferable core has no Highway 38-specific terminology',!/Highway 38|H38-/i.test(coreSource));
  check('transferable core has no network execution',!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|https\.request\s*\(|axios\s*\(/.test(coreSource));
  check('shared core parses in browser context',browserParse(coreSource));
  const html=read('business-concept-builder.html');
  const browser=read('business-concept-builder.js');
  check('browser exposes every required input',core.REQUIRED_INPUT_FIELDS.every(field=>html.includes(`name="${field}"`)));
  check('browser loads shared core before wrapper',html.indexOf('business-concept-core.js')<html.indexOf('business-concept-builder.js'));
  check('browser exports JSON, Markdown, Tasks, Business Pack, and OS config',['download-json','download-md','download-tasks','download-pack','download-config'].every(id=>browser.includes(id)));
  check('browser generation remains local',!/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(browser)&&!/<form[^>]+action=/i.test(html));

  writeJson(path.join(OUT,'business-concept-builder-sample-package.json'),{status:'OWNER_REVIEW_REQUIRED',generatedAt:fixedTime,package:built,materializedRecords:{products:built.productRecords.length,tasks:built.tasks.length,contracts:built.recurringContracts.length,sops:built.sopList.length,socialDrafts:built.socialDrafts.length,risks:built.risks.length,decisions:built.decisions.length},installer:{tenant:effective.tenant,environment:effective.environment,tier:effective.tier,releaseChannel:effective.releaseChannel,externalActionsEnabled:effective.externalActionsEnabled},externalActionsOccurred:false});
  fs.writeFileSync(path.join(OUT,'business-concept-builder-created-tasks.csv'),core.tasksCsv(built),'utf8');
  const evidence={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),version:core.VERSION,passed:passes.length,failed:failures.length,outputs:{segments:built.customerProblemSegments.length,offers:built.offers.length,products:built.productRecords.length,addOns:built.addOns.length,contracts:built.recurringContracts.length,sitemapPages:built.sitemap.length,intakeQuestions:built.intakeQuestions.length,sops:built.sopList.length,tasks:built.tasks.length,socialDrafts:built.socialDrafts.length,expenseCategories:built.expenseCategories.length,risks:built.risks.length,decisions:built.decisions.length},controls:{ownerReviewRequired:true,selectedRecordOnly:true,bulkExecution:false,automaticRetry:false,tenantIsolation:true,duplicateProtection:true,proofLogRequired:true,errorLogRequired:true,externalActionsEnabled:false,selfApproval:false},externalActionsOccurred:false,passes,failures};
  writeJson(path.join(OUT,'business-concept-builder-verification.json'),evidence);
  fs.rmSync(temp,{recursive:true,force:true});
  console.log(JSON.stringify(evidence,null,2));
  process.exit(failures.length?1:0);

  function osModuleTmp(){return osModule.tmpdir();}
  function browserParse(source){try{const context={globalThis:{}};vm.createContext(context);vm.runInContext(source,context,{filename:'business-concept-core.js'});return Boolean(context.globalThis.BusinessConceptCore);}catch(error){failures.push({name:'browser parse error',detail:error.message});return false;}}
}

try{main();}catch(error){console.error(error);process.exit(1);}
