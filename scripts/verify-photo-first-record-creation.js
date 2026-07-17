#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const checks=[];
const check=(name,condition,evidence='')=>checks.push({name,condition:Boolean(condition),evidence});

const index=read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const baseClient=read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');
const createClient=read('apps-script/core-engine/owner-portal-next/Portal_Business_Create_Client.html');
const createStyles=read('apps-script/core-engine/owner-portal-next/Portal_Business_Create_Styles.html');
const server=read('apps-script/core-engine/owner-portal-next/Portal_Business.js');

check('creation overlay is loaded after native Business Office client',index.indexOf("Portal_Business_Client")>=0&&index.indexOf("Portal_Business_Create_Client")>index.indexOf("Portal_Business_Client"));
check('creation styles are loaded',index.includes("Portal_Business_Create_Styles"));
check('generated handler arguments are HTML-attribute safe',/function boNativeJs\(value\)\{return attr\(JSON\.stringify/.test(createClient));
check('New record button opens creation chooser',/onclick=\\?"openBusinessCreate/.test(createClient)&&/function openBusinessCreate\(module\)/.test(createClient));
check('creation chooser offers photo or PDF first',/Start with photo or PDF/.test(createClient)&&/startBusinessCreateFromFile/.test(createClient));
check('creation chooser offers blank record',/Start blank/.test(createClient)&&/startBusinessCreateBlank/.test(createClient));
check('photo-first input accepts PDF and supported images',/accept=\\?"application\/pdf,image\/jpeg,image\/png,image\/heic,image\/heif/.test(createClient));
check('photo-first input requests environment camera when available',/capture=\\?"environment/.test(createClient));
check('uploaded original continues into the record form',/boNativeSeedFromDocument/.test(createClient)&&/__sourceDocumentId/.test(createClient));
check('save selects linked-document server endpoint',/h38PortalBusinessSaveFromDocument/.test(createClient));
check('server links source document to saved record',/function h38PortalBusinessSaveFromDocument/.test(server)&&/'Source ID'\s*:\s*savedId/.test(server));
check('server writes proof for linked evidence',/LINK_SOURCE_DOCUMENT/.test(server)&&/externalActionsOccurred:false/.test(server));
check('record creation preserves owner approval language',/Owner Review Required/.test(createClient)&&/No external action occurred/.test(createClient));
check('creation overlay contains no browser network bypass',!/(fetch\(|XMLHttpRequest|sendBeacon)/.test(createClient));
check('base Business Office module still renders record tables',/function boNativeRenderTable/.test(baseClient));
check('photo-first UI has responsive mobile rules',/@media\(max-width:700px\)/.test(createStyles));

const clientFiles=[
  'Portal_Experience_Client_Core.html','Portal_Experience_Client_Views.html','Portal_Experience_Client_Workspace.html','Portal_UX_Client_Shell.html','Portal_Business_Client.html','Portal_Business_Create_Client.html','Portal_UX_Client_Tasks.html','Portal_UX_Client_Workspace.html','Portal_UX_Client_Forms.html','Portal_UX_Client_Boot.html'
];
try{
  new vm.Script(clientFiles.map(name=>read('apps-script/core-engine/owner-portal-next/'+name)).join('\n'),{filename:'assembled-unified-owner-client.js'});
  check('assembled unified client syntax',true);
}catch(error){check('assembled unified client syntax',false,error.message);}
try{new vm.Script(server,{filename:'Portal_Business.js'});check('photo-first server syntax',true);}catch(error){check('photo-first server syntax',false,error.message);}

const failures=checks.filter(item=>!item.condition);
const result={status:failures.length?'HOLD':'PASS',passed:checks.length-failures.length,failed:failures.length,checks,failures};
const out=path.join(root,'artifacts','photo-first-record-creation');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
checks.forEach(item=>console[item.condition?'log':'error'](`${item.condition?'PASS':'FAIL'}: ${item.name}${item.evidence?' — '+item.evidence:''}`));
console.log(`RESULT: ${result.status}`);
process.exit(failures.length?1:0);
