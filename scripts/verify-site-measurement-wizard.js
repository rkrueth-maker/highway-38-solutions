#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8'),exists=rel=>fs.existsSync(path.join(root,rel));
const passes=[],failures=[];
const check=(name,condition,evidence='')=>{(condition?passes:failures).push({name,evidence});console.log(`${condition?'PASS':'FAIL'}: ${name}${evidence?` — ${evidence}`:''}`);};
const files={servers:['apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Part01.gs','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Part02.gs','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Part03.gs','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Part04.gs','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Part05.gs','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Part06.gs','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Part07.gs','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Part08.gs','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Part09.gs'],clients:['apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_Resume_Client.html','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Styles.html','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Client_Core.html','apps-script/business-office/BusinessOffice_SiteMeasurementWizard_Client_Forms.html'],records:'apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_Records.gs'};
files.servers.concat(files.clients).concat([files.records]).forEach(file=>check(`required file ${file}`,exists(file)));
if(failures.length)process.exit(1);
const server=files.servers.map(read).join('\n'),client=files.clients.map(read).join('\n'),records=read(files.records);
try{new Function(server);check('Site Measurement Apps Script source parses',true);}catch(error){check('Site Measurement Apps Script source parses',false,error.message);}
const clientScripts=[...client.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
clientScripts.forEach((script,index)=>{try{new Function(script);check(`Site Measurement client script ${index+1} parses`,true);}catch(error){check(`Site Measurement client script ${index+1} parses`,false,error.message);}});
const functions=['boSiteMeasurementCatalog','boSiteMeasurementGetProject','boSiteMeasurementGetArea','boSiteMeasurementCreateArea','boSiteMeasurementSaveBaseline','boSiteMeasurementSaveShape','boSiteMeasurementSaveRoom','boSiteMeasurementSaveMaterial','boSiteMeasurementVerify','boSiteMeasurementValidateArea','boSiteMeasurementClientBundle','boSiteMeasurementAcceptance'];
functions.forEach(name=>check(`server function ${name}`,new RegExp(`function ${name}\\(`).test(server)));
['OUTDOOR_ZONE','INDOOR_ROOM','INDOOR_GARAGE_OR_SHOP','AR room scan','LiDAR-assisted room capture','Baseline and widths','Simple shapes'].forEach(marker=>check(`catalog marker ${marker}`,server.includes(`'${marker}'`)));
['FIELD_MEASURED','FIELD_MEASURED_AND_CHECKED','AR_CAPTURED','AR_CAPTURED_AND_CHECKED','IMPORTED_VERIFIED','PRELIMINARY_ESTIMATE','NEEDS_REMEASUREMENT'].forEach(marker=>check(`confidence status ${marker}`,server.includes(`'${marker}'`)));
['mulch','paint','flooring','drywall','trim'].forEach(marker=>check(`material calculator ${marker}`,server.includes(`type==='${marker}'`)));
check('uses existing UQB Measurements store',server.includes("boUniversalAppend_('MEASUREMENTS'")&&records.includes("name:'UQB Measurements'"));
check('uses existing UQB Calculations store',server.includes("boUniversalAppend_('CALCULATIONS'")&&records.includes("name:'UQB Calculations'"));
check('areas remain typed UQB sub-quotes',server.includes("boUniversalAppend_('SUBQUOTES'")&&server.includes("'Subquote Type':areaType"));
check('project consistency and approval are invalidated after measurement change',server.includes("'Consistency Status':'Review Required'")&&server.includes("'Approval Status':'Owner Approval Required'"));
check('Proof Log evidence is written',(server.match(/boProof_\(/g)||[]).length>=7,String((server.match(/boProof_\(/g)||[]).length));
check('no external send or new database',!/(MailApp|GmailApp|sendEmail|SupabaseClient|createClient\(|Firebase)/.test(server+client));
check('customer/internal architecture remains authoritative',server.includes('No second app, database, approval')&&server.includes('existing UQB Measurements'));
check('outdoor AR is not primary',server.includes('outdoorPrimary:false'));
check('indoor AR requires critical verification',server.includes('criticalVerificationRequired:true')&&client.includes('quote-critical dimensions remain subject to field verification'));
check('native room capture is not falsely claimed complete',client.includes('Native live room capture is reserved for the approved Phase 2 integration'));
['site-measurements','addOutdoor','addIndoor','baseline','shape','room','material','verify','validate'].forEach(action=>check(`client action ${action}`,client.includes(action)));
check('measurement navigation is installed',client.includes("b.textContent='Measurements'")&&client.includes("window.qbOpen('site-measurements')"));
check('responsive field UI',client.includes('@media(max-width:620px)')&&client.includes('.smw-form'));
check('browser AR capability detection',client.includes("navigator.xr.isSessionSupported('immersive-ar')"));
check('baseline station parser is present',client.includes('distance,width[,recheck]')&&server.includes('boSiteMeasurementBaselineArea_'));
check('indoor room calculations are present',['Indoor floor area','Gross wall area','Net wall area','Room volume','Baseboard path'].every(marker=>server.includes(`'${marker}'`)));
let acceptance=null;
try{
  const sandbox={console,Object,Array,String,Number,Math,JSON,RegExp,Date,isFinite,boAssert_:(condition,message)=>{if(!condition)throw new Error(message);},boQuoteBuilderRequireAction_:()=>({}),boId_:prefix=>`${prefix}-TEST`,boUniversalJson_:(value,fallback)=>{try{return typeof value==='string'?JSON.parse(value):value;}catch(error){return fallback;}}};
  vm.createContext(sandbox);vm.runInContext(server,sandbox);acceptance=sandbox.boSiteMeasurementAcceptance();
  check('deterministic acceptance returns PASS',acceptance&&acceptance.status==='PASS',acceptance?JSON.stringify(acceptance.checks):'no result');
  const baseline=(acceptance.checks||[]).find(item=>item.name==='baseline station example');
  check('baseline example equals 181.9 square feet',baseline&&baseline.actual===181.9,String(baseline&&baseline.actual));
  const floor=(acceptance.checks||[]).find(item=>item.name==='12 × 10 room floor');
  check('12 × 10 room equals 120 square feet',floor&&floor.actual===120,String(floor&&floor.actual));
  const walls=(acceptance.checks||[]).find(item=>item.name==='12 × 10 × 8 gross walls');
  check('12 × 10 × 8 room equals 352 gross wall square feet',walls&&walls.actual===352,String(walls&&walls.actual));
}catch(error){check('deterministic acceptance executes',false,error.stack||error.message);}
const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),version:'2026-07-31-site-measurement-v1',architecture:'existing-UQB-measurements-calculations-subquotes',indoorAr:'assisted-with-required-verification',outdoorAr:'not-primary',externalActionsPerformed:false,passed:passes.length,failed:failures.length,passes,failures,acceptance};
const out=path.join(root,'artifacts','site-measurement-wizard');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));module.exports=result;if(require.main===module)process.exit(failures.length?1:0);if(failures.length)throw new Error('Site Measurement Wizard verification failed with '+failures.length+' failure(s).');
