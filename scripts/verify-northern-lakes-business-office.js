#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(process.argv[2]||'dist/northern-lakes-business-office');
const repoRoot=path.resolve(__dirname,'..');
function fail(message){console.error('FAIL — '+message);process.exitCode=1;}
function requireFile(name){const file=path.join(root,name);if(!fs.existsSync(file)){fail('missing '+name);return '';}return fs.readFileSync(file,'utf8');}
function verifyScriptSyntax(name){const source=requireFile(name);if(!source)return;try{new vm.Script(source,{filename:name});}catch(error){fail('syntax error in '+name+': '+error.message);}}
const pack=requireFile('BusinessOffice_00_Pack.gs');
const setup=requireFile('BusinessOffice_NorthernLakesSetup.gs');
const existingStatus=requireFile('BusinessOffice_NorthernLakesExistingOfficeStatus.gs');
const fast=requireFile('BusinessOffice_NorthernLakesFastProvisioning.gs');
const setupPage=requireFile('BusinessOffice_Installation.html');
const unified=requireFile('Unified_AppShell.gs');
const auth=requireFile('BusinessOffice_Auth.gs');
const portalIndex=requireFile('Portal_Index.html');
const quote=requireFile('BusinessOffice_QuoteBuilder.gs');
const quoteIndex=requireFile('BusinessOffice_QuoteBuilder_Index.html');
const aiClient=requireFile('BusinessOffice_QuoteBuilder_AI_Visual_Client.html');
const aiServer=requireFile('BusinessOffice_QuoteBuilder_AI_Visual.gs');
const previewPath=path.join(repoRoot,'businesses','northern-lakes','business-office-preview.html');
const preview=fs.existsSync(previewPath)?fs.readFileSync(previewPath,'utf8'):'';
const linkedPath=path.join(repoRoot,'business-packs','highway38','apps-script','BusinessOffice_LinkedOffices.gs');
const linked=fs.existsSync(linkedPath)?fs.readFileSync(linkedPath,'utf8'):'';
const templatePackPath=path.join(repoRoot,'business-packs','template-business','business-pack.json');
const templatePack=fs.existsSync(templatePackPath)?fs.readFileSync(templatePackPath,'utf8'):'';
const required=[
  [pack,/packId:'northern-lakes'/,'Northern Lakes pack ID'],
  [pack,/business:\s*Object\.freeze\(\{id:'NLPS'/,'NLPS business ID'],
  [pack,/publicEmail:'northernlakesproperty@gmail\.com'/,'Northern Lakes system email'],
  [pack,/systemOwnerEmail:'northernlakesproperty@gmail\.com'/,'Drive setup owner'],
  [pack,/cleanInstallGeneration:'clean-core-v1'/,'clean installation generation'],
  [pack,/support:Object\.freeze\(\{enabled:true/,'controlled H38 support contract'],
  [pack,/rkrueth@gmail\.com/,'Rick support principal'],
  [pack,/mandakw55@gmail\.com/,'Amanda support principal'],
  [pack,/customerVisible:true/,'visible support access'],
  [pack,/revocable:true/,'revocable support access'],
  [pack,/NLPS_BUSINESS_OFFICE_SPREADSHEET_ID/,'dedicated spreadsheet key'],
  [pack,/NLPS_BUSINESS_OFFICE_DEPLOYMENT_ID/,'dedicated deployment key'],
  [pack,/namespace:'NLPS'/,'NLPS namespace'],
  [setup,/SCHEMA_GZIP_B64:'(?!__BO_NEUTRAL_SCHEMA_GZIP_B64__)[A-Za-z0-9+/=]+'/,'embedded neutral schema'],
  [setup,/sheets\.length===81/,'81-sheet clean workbook contract'],
  [setup,/Northern Lakes Business Office/,'Northern Lakes Drive root'],
  [setup,/00 — System/,'system folder'],
  [setup,/05 — Payroll and Tax — Restricted/,'restricted payroll and tax folder'],
  [setup,/08 — Examples and Training/,'examples folder'],
  [setup,/99 — Archived Old Office/,'old office archive folder'],
  [setup,/nlpsExampleDefinitions_/,'example sheet definitions'],
  [setup,/SAMPLE — Customer and Request/,'customer example'],
  [setup,/SAMPLE — Employee Task Assignment/,'task example'],
  [setup,/USER-H38-IMPLEMENTATION-OWNER/,'Rick implementation owner'],
  [setup,/boAfterBusinessRecordSave_/,'automatic record-folder hook'],
  [setup,/Drive Folder ID/,'job folder ID writeback'],
  [setup,/previousInstallationPreserved:true/,'old office preservation proof'],
  [setup,/nlpsFastCreateCoreWorkbook_/,'fast core workbook connected'],
  [setup,/nlpsFastCreateExamples_/,'fast examples connected'],
  [existingStatus,/function boNorthernLakesExistingOfficeStatus\(/,'existing-office status endpoint'],
  [existingStatus,/sheetCount >= result\.minimumSheetCount/,'upgraded workbook minimum-sheet acceptance'],
  [existingStatus,/missingRequiredSheets\.length === 0/,'required-sheet validation'],
  [existingStatus,/existing_files_connected/,'existing file connection status'],
  [existingStatus,/function boNorthernLakesExistingOfficeAcceptance\(/,'live existing-office acceptance endpoint'],
  [fast,/Sheets\.Spreadsheets\.create/,'Sheets API workbook creation'],
  [fast,/Sheets\.Spreadsheets\.Values\.batchUpdate/,'batched sheet values'],
  [fast,/schema\.sheets\.length===81/,'fast 81-sheet validation'],
  [fast,/definitions\.length===13/,'13 example tabs validation'],
  [fast,/Northern Lakes — Examples and Training/,'single examples workbook'],
  [setupPage,/Create Clean Northern Lakes Office/,'owner setup action'],
  [setupPage,/Parent Google Drive folder/,'Drive folder selection'],
  [setupPage,/northernlakesproperty@gmail\.com/,'required signed-in setup account'],
  [setupPage,/boNorthernLakesExistingOfficeStatus/,'setup page reads upgraded existing-office status'],
  [setupPage,/show\('installCard',!status\.configured\)/,'configured office hides clean installer'],
  [setupPage,/Existing office connected/,'existing office recovery action'],
  [unified,/typeof boSetupEntryAllowed_==='function'/,'pack-controlled setup route'],
  [unified,/boRenderInstallationPage_/,'setup page renderer'],
  [unified,/function getSupportAccount\(email\)/,'unified support authentication'],
  [unified,/supportAccess:user\['__Support Access'\]==='Yes'/,'support status in unified context'],
  [auth,/function boSupportAccount_\(email\)/,'standalone support authentication'],
  [auth,/supportProvider:user\['__Support Provider'\]/,'support status in Business Office context'],
  [portalIndex,/Portal_LinkedOffices_Client/,'linked office client included'],
  [preview,/H38 owner preview/i,'owner preview identity'],
  [preview,/Sample data only/i,'sample-only preview boundary'],
  [preview,/Open Live Office/,'live office control from preview'],
  [linked,/business-office-preview\.html/,'H38 button opens owner preview'],
  [linked,/liveUrl:/,'linked office keeps separate live URL'],
  [templatePack,/"support"\s*:\s*\{"enabled"\s*:\s*true/,'future customer pack support default'],
  [templatePack,/mandakw55@gmail\.com/,'future Amanda support principal'],
  [quote,/boPrepareAiQuoteDraft_/,'shared AI draft staging'],
  [quoteIndex,/BusinessOffice_QuoteBuilder_AI_Visual_Client/,'AI client included in direct Quote Builder'],
  [aiClient,/Take Picture/,'camera-only control'],
  [aiClient,/Upload Photos/,'upload-only control'],
  [aiClient,/Build Quote with AI/,'AI quote action'],
  [aiClient,/Create Completion Visual/,'AI visual action'],
  [aiClient,/Owner review required\./i,'owner review notice'],
  [aiServer,/boBuildAiQuoteDraft_/,'shared AI quote engine'],
  [aiServer,/boCreateAiCompletionVisual_/,'shared AI completion visual engine'],
  [aiServer,/Owner Review Required/,'owner review gate']
];
required.forEach(([source,pattern,label])=>{if(!pattern.test(source))fail('missing '+label);});
const assembledFiles=fs.readdirSync(root);
assembledFiles.filter(name=>/\.(?:gs|js)$/.test(name)).forEach(verifyScriptSyntax);
if(/H38_BUSINESS_OFFICE_SPREADSHEET_ID|H38_BUSINESS_OFFICE_DEPLOYMENT_ID/.test(pack))fail('Highway 38 storage or deployment key leaked into Northern Lakes pack');
if(/1QBG_2j-CSOpo00nkK1-K9VQGGBNv5N7v|1bHxwdvoy8PwQ5_wDhnNOuohmLzaOt6z2HnefytM0bY4/.test(pack+setup+existingStatus))fail('Retired or live Northern Lakes storage was hard-coded into source');
if((setup.match(/name:'SAMPLE —/g)||[]).length!==13)fail('expected exactly 13 training example sheet definitions');

try{
  const requiredSheets=['BO Businesses','BO Users','BO Customers','BO Quotes','BO Quote Lines','BO Jobs','BO Documents','BO Settings','BO Proof Log','BO Error Log','BO Products & Services','BO Setup Checklist'];
  const upgradedNames=requiredSheets.concat(Array.from({length:76},(_,index)=>'Upgrade Sheet '+(index+1)));
  const sandbox={
    SpreadsheetApp:{openById:()=>({getSheets:()=>upgradedNames.map(name=>({getName:()=>name}))})},
    DriveApp:{getFolderById:()=>({getName:()=>'Northern Lakes Business Office'})},
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(existingStatus,sandbox,{filename:'BusinessOffice_NorthernLakesExistingOfficeStatus.gs'});
  const health=sandbox.nlpsExistingOfficeHealth_('existing-sheet','existing-folder','clean-core-v1');
  if(!health.configured)fail('88-sheet upgraded Northern Lakes workbook was not recognized as configured');
  if(health.sheetCount!==88)fail('upgraded workbook sheet count was not retained');
  if(health.missingRequiredSheets.length)fail('required upgraded workbook sheets were reported missing');
  const missingSandbox={
    SpreadsheetApp:{openById:()=>({getSheets:()=>Array.from({length:88},(_,index)=>({getName:()=>index===0?'BO Businesses':'Other '+index}))})},
    DriveApp:{getFolderById:()=>({getName:()=>'Northern Lakes Business Office'})},
    console
  };
  vm.createContext(missingSandbox);
  vm.runInContext(existingStatus,missingSandbox,{filename:'BusinessOffice_NorthernLakesExistingOfficeStatus.gs'});
  const missing=missingSandbox.nlpsExistingOfficeHealth_('existing-sheet','existing-folder','clean-core-v1');
  if(missing.configured||!missing.missingRequiredSheets.length)fail('missing required sheets did not block existing-office status');
}catch(error){fail('existing-office compatibility regression failed: '+error.message);}

if(!process.exitCode)console.log(JSON.stringify({status:'PASS',installation:'Northern Lakes Unified Business Office',businessId:'NLPS',isolated:true,coreEngine:'unified',driveOwnerSetupAccount:'northernlakesproperty@gmail.com',cleanWorkbookSheets:81,upgradedWorkbookSheetsSupported:true,liveObservedWorkbookSheets:88,trainingWorkbookCount:1,trainingSheets:13,oldOfficePreserved:true,automaticRecordFolders:true,quoteBuilder:'shared engine',ownerApprovalRequired:true,ownerPreview:true,supportAccess:{provider:'Highway 38 Solutions',accounts:['rkrueth@gmail.com','mandakw55@gmail.com'],signedInRequired:true,customerVisible:true,revocable:true},syntaxCheckedScripts:assembledFiles.filter(name=>/\.(?:gs|js)$/.test(name)).length,assembledFiles:assembledFiles.length},null,2));