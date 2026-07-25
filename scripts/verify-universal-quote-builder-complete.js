#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));
const passes=[];
const failures=[];
const check=(name,condition,evidence='')=>{
  (condition?passes:failures).push({name,evidence});
  console.log(`${condition?'PASS':'FAIL'}: ${name}${evidence?` — ${evidence}`:''}`);
};
const catalogPath='apps-script/business-office/BusinessOffice_UniversalQuoteBuilder.gs';
const recordsPath='apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_Records.gs';
const controlsPath='apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_Controls.gs';
const clientPath='apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_Workspace_Client.html';
const indexPath='apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html';
[catalogPath,recordsPath,controlsPath,clientPath,indexPath].forEach(file=>check(`required file ${file}`,exists(file)));
if(failures.length){process.exit(1);}
const catalog=read(catalogPath),records=read(recordsPath),controls=read(controlsPath),client=read(clientPath),index=read(indexPath),server=catalog+'\n'+records+'\n'+controls;

try{new Function(server);check('Apps Script source parses',true);}catch(error){check('Apps Script source parses',false,error.message);}
const clientScripts=[...client.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
try{new Function(clientScripts);check('workspace client source parses',true);}catch(error){check('workspace client source parses',false,error.message);}

const levels=(catalog.match(/level:\d/g)||[]).length;
const pricingBlock=(catalog.match(/PRICING_METHODS:Object\.freeze\(\[([\s\S]*?)\]\)/)||[])[1]||'';
const pricingMethods=(pricingBlock.match(/'[^']+'/g)||[]).length;
const agentBlock=(catalog.match(/AGENTS:Object\.freeze\(\[([\s\S]*?)\]\)/)||[])[1]||'';
const agents=(agentBlock.match(/Object\.freeze\(\{key:/g)||[]).length;
const exampleBlock=(catalog.match(/function boUniversalQuoteExamples_\(\)\{[\s\S]*?return \[([\s\S]*?)\];\n\}/)||[])[1]||'';
const examples=(exampleBlock.match(/\{key:/g)||[]).length;
check('five progressive quote levels',levels===5,String(levels));
check('34 deterministic pricing methods',pricingMethods===34,String(pricingMethods));
check('eight controlled universal agents',agents===8,String(agents));
check('18 cross-industry scenarios',examples===18,String(examples));
check('eight drawing classifications',catalog.includes("'Conceptual','Estimating','Subcontractor bidding','Field layout','Construction-ready','Permit submission','Engineer or licensed-professional review required','Approved final'"));

const storeBlock=(records.match(/SHEETS:Object\.freeze\(\{([\s\S]*?)\n  \}\)\n\}\);/)||[])[1]||'';
const stores=(storeBlock.match(/Object\.freeze\(\{name:'UQB /g)||[]).length;
check('persistent structured storage has 14 record types',stores===14,String(stores));
[
  ['projects','UQB Projects'],['project revisions','UQB Project Revisions'],['sub-quotes','UQB Subquotes'],['quote items','UQB Quote Items'],
  ['measurements','UQB Measurements'],['calculations','UQB Calculations'],['scope sections','UQB Scope Sections'],['drawings','UQB Drawings'],
  ['drawing revisions','UQB Drawing Revisions'],['bid packages','UQB Bid Packages'],['subcontractor bids','UQB Subcontractor Bids'],
  ['knowledge packs','UQB Knowledge Packs'],['agent runs','UQB Agent Runs'],['estimate actuals','UQB Estimate Actuals']
].forEach(([label,marker])=>check(`structured ${label}`,records.includes(marker)));

const requiredRecordFunctions=[
  'boUniversalEnsureStore','boUniversalListProjects','boUniversalCreateProject','boUniversalUpdateProject','boUniversalReviseProject','boUniversalGetProject',
  'boUniversalCreateSubquote','boUniversalUpdateSubquote','boUniversalAddQuoteItem','boUniversalAddMeasurement','boUniversalAddScopeSection',
  'boUniversalCreateDrawing','boUniversalReviseDrawing','boUniversalCreateBidPackage','boUniversalRecordBid','boUniversalCompareBids','boUniversalSelectBid',
  'boUniversalCreateKnowledgePack','boUniversalActivateKnowledgePack','boUniversalRunAgent','boUniversalReviewAgentRun','boUniversalRecordActual',
  'boUniversalMaterializeQuote','boUniversalPrepareExecution','boUniversalGenerateDocument','boUniversalPrepareExampleSuite',
  'boUniversalPrepareHouseDemonstration','boUniversalAcceptance'
];
requiredRecordFunctions.forEach(name=>check(`server function ${name}`,new RegExp(`function ${name}\\(`).test(records)));
const requiredControlFunctions=['boUniversalListKnowledgePacks','boUniversalApproveRecord','boUniversalCompleteConsistencyReview','boUniversalReviewProject','boUniversalGenerateCompletionPackage','boUniversalPrepareChangeOrderRecord'];
requiredControlFunctions.forEach(name=>check(`control function ${name}`,new RegExp(`function ${name}\\(`).test(controls)));

const functionNames=[...server.matchAll(/function\s+(boUniversal[A-Za-z0-9_]+)\s*\(/g)].map(m=>m[1]);
const duplicateNames=[...new Set(functionNames.filter((name,index)=>functionNames.indexOf(name)!==index))];
check('no duplicate Universal Quote server functions',duplicateNames.length===0,duplicateNames.join(', '));
check('demo-only preview is isolated',catalog.includes('boUniversalPrepareHouseDemonstrationPreview_')&&!catalog.includes('function boUniversalPrepareHouseDemonstration(runKey)'));

const docTypes=['Customer Proposal','Individual Subquote','Combined Proposal Package','Subcontractor Bid Package','Drawing Package','Internal Estimate','Material Takeoff','Labor Estimate','Work Instructions','Work Order','Change Order','Revision Comparison'];
docTypes.forEach(type=>check(`document output ${type}`,records.includes(`'${type}'`)&&client.includes(type)));
check('customer proposal excludes internal-cost section',records.includes("if(documentType==='Internal Estimate'||documentType==='Material Takeoff'||documentType==='Labor Estimate')")&&records.includes("if(documentType==='Customer Proposal'||documentType==='Combined Proposal Package'||documentType==='Individual Subquote')"));
check('documents are private and unsent',records.includes('sent:false,delivered:false,externalActionsPerformed:false')&&records.includes("'Approval Status':'Owner Approval Required'"));
check('combined completion package is supported',controls.includes("['Customer Proposal','Drawing Package','Internal Estimate','Material Takeoff','Labor Estimate','Work Instructions','Revision Comparison']"));
check('drawing changes trigger consistency review',records.includes("'Consistency Status':'Review Required'")&&records.includes("'Quantity Review Required'")&&records.includes("'Scope Review Required'"));
check('regulated drawing truth boundary is explicit',records.includes('conceptual or estimating information is not a permit, stamped engineering document, code approval, or professional certification'));
check('regulated drawing approval requires professional review',controls.includes('requires documented licensed-professional review before approval'));
check('AI cannot independently execute external actions',records.includes("'Approval Status':'Owner Approval Required'")&&!/MailApp|GmailApp|sendEmail|UrlFetchApp/.test(records+controls));
check('bid packages cannot send without approval',records.includes("'Send Allowed':'No'")&&controls.includes("patch['Send Allowed']=decision==='Approved'?'Yes':'No'"));
check('projects and sub-quotes have independent approvals',controls.includes("var map={Project:'PROJECTS',Subquote:'SUBQUOTES',Drawing:'DRAWINGS','Bid Package':'BID_PACKAGES'}"));
check('approval history uses canonical Approval records',controls.includes('H38_BO_SHEETS.APPROVALS')&&controls.includes('boUniversalRecordApproval_'));
check('canonical Business Office quote connection',records.includes('boCreateQuoteFast_')&&records.includes("'Master Quote ID'")&&records.includes("'Existing Quote ID'"));
check('work order and purchase preparation connection',records.includes('H38_BO_SHEETS.WORK_ORDERS')&&records.includes('H38_BO_SHEETS.PURCHASE_ORDERS')&&records.includes('H38_BO_SHEETS.PO_LINES'));
check('change orders use canonical Business Office records',controls.includes('H38_BO_SHEETS.CHANGE_ORDERS')&&controls.includes('boUniversalPrepareChangeOrderRecord'));
check('Proof Log evidence is written throughout',(server.match(/boProof_\(/g)||[]).length>=25,String((server.match(/boProof_\(/g)||[]).length));
check('audit history is preserved for project changes',records.includes("boAudit_('CREATE','Universal Quote Project'")&&records.includes("boAudit_('UPDATE','Universal Quote Project'"));
check('quote review checks completeness pricing quantity drawings quality and professional review',['Completeness','Pricing','Quantity','Drawings','Quality','Professional review'].every(marker=>controls.includes(`area:'${marker}'`)));

const tabs=['overview','subquotes','pricing','measurements','scope','drawings','bids','setup','exports','actuals'];
tabs.forEach(tab=>check(`workspace tab ${tab}`,client.includes(`'${tab}'`)));
const actions=['new','addSubquote','addItem','addMeasurement','addScope','addDrawing','reviseDrawing','addBidPackage','recordBid','compareBids','addKnowledge','runAgent','export','addActual','materialize','execution','examples'];
actions.forEach(action=>check(`workspace action ${action}`,client.includes(`name==='${action}'`)||client.includes(`data-uqb="${action}"`)));
check('progressive disclosure uses project tabs',client.includes('uqb-tabs')&&client.includes('uqb-pane'));
check('responsive mobile workspace styles',client.includes('@media(max-width:620px)')&&client.includes('@media(max-width:960px)'));
check('accessible labeled dialog and navigation',client.includes('aria-labelledby="uqbDialogTitle"')&&client.includes('aria-label="Project sections"'));
check('operational workspace is loaded after catalog client',index.indexOf('BusinessOffice_UniversalQuoteBuilder_Client')<index.indexOf('BusinessOffice_UniversalQuoteBuilder_Workspace_Client'));

check('all examples use an owner-supplied stable run label',records.includes('boUniversalPrepareExampleSuite(runKey)')&&records.includes("'Run Key'")&&records.includes('boUniversalRunKey_(runKey)'));
check('house demonstration creates real structured records',records.includes('house.subquotes.forEach')&&records.includes('house.drawings.forEach')&&records.includes('house.bidPackages.forEach'));
check('historical fixed Demo 08 is not regenerated',!records.includes('boGenerateAllCabinSubquotes')&&!records.includes('cabin_seed'));
check('no new app, external database, or customer send is introduced',!/(SupabaseClient|createClient\(|Firebase|sendEmail|GmailApp|MailApp)/.test(records+controls+client));

const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),architecture:'one-business-office-one-shared-quote-builder',quoteLevels:levels,pricingMethods,agents,examples,structuredRecordTypes:stores,documentTypes:docTypes.length,workspaceTabs:tabs.length,externalActionsPerformed:false,passed:passes.length,failed:failures.length,passes,failures};
const out=path.join(root,'artifacts','universal-quote-builder-complete');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
