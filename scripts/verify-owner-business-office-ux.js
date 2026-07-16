#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const owner=path.join(root,'apps-script','core-engine','owner-portal-next');
const office=path.join(root,'apps-script','business-office');
const failures=[],passes=[];
function check(name,condition,detail=''){(condition?passes:failures).push({name,detail});if(!condition)console.error(`FAIL: ${name}${detail?` — ${detail}`:''}`)}
function read(file){return fs.readFileSync(file,'utf8')}
function exists(file){return fs.existsSync(file)}
function syntax(source,label){try{new vm.Script(source,{filename:label});check(`syntax ${label}`,true)}catch(error){check(`syntax ${label}`,false,error.message)}}
function run(script,label){try{const result=cp.spawnSync(process.execPath,[path.join(root,script)],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});check(label,result.status===0,result.status===0?'':(result.stdout||'').slice(-1200)+(result.stderr||'').slice(-1200))}catch(error){check(label,false,error.message)}}
const ownerFiles=['Portal_UX.js','Portal_UX_Styles.html','Portal_UX_Client_Shell.html','Portal_UX_Client_Tasks.html','Portal_UX_Client_Workspace.html','Portal_UX_Client_Forms.html','Portal_UX_Client_Boot.html'];
const officeFiles=['BusinessOffice_UX.gs','BusinessOffice_UX.html'];
ownerFiles.forEach(file=>check(`Owner Portal UX file ${file}`,exists(path.join(owner,file))));
officeFiles.forEach(file=>check(`Business Office UX file ${file}`,exists(path.join(office,file))));
const ownerIndex=read(path.join(owner,'Portal_Index.html'));
const rawIncludes=read(path.join(owner,'Portal_RawIncludes.js'));
const ownerServer=read(path.join(owner,'Portal_UX.js'));
const ownerClient=['Portal_Experience_Client_Core.html','Portal_Experience_Client_Views.html','Portal_Experience_Client_Workspace.html','Portal_UX_Client_Shell.html','Portal_UX_Client_Tasks.html','Portal_UX_Client_Workspace.html','Portal_UX_Client_Forms.html','Portal_UX_Client_Boot.html'].map(file=>read(path.join(owner,file))).join('\n');
const ownerStyles=read(path.join(owner,'Portal_Experience_Styles.html'))+'\n'+read(path.join(owner,'Portal_UX_Styles.html'));
syntax(ownerServer,'Portal_UX.js');
syntax(ownerClient,'assembled Owner Portal client');
check('Owner Portal loads all UX fragments',ownerFiles.filter(file=>file.endsWith('.html')).every(file=>ownerIndex.includes(file.replace(/\.html$/,''))));
check('Owner Portal raw include allowlist',ownerFiles.filter(file=>file.endsWith('.html')).every(file=>rawIncludes.includes(`'${file.replace(/\.html$/,'')}'`)));
check('Owner Portal grouped navigation',['Work','Customers and Jobs','Money','Growth','Control'].every(text=>ownerClient.includes(text)));
check('Owner Portal action dashboard',['What needs attention now?','Owner approval queue','Today and overdue','Financial snapshot','Exceptions'].every(text=>ownerClient.includes(text)));
check('Owner Portal visible review button',/class="btn primary task-open"/.test(ownerClient)&&/>Review<\//.test(ownerClient));
check('Owner Portal unified workspaces',['Related records','Files','History','Proof and errors','Activity timeline'].every(text=>ownerClient.includes(text)));
check('Owner Portal grouped global search',ownerServer.includes('h38PortalUxGroupedSearch')&&ownerClient.includes('matching records grouped by type'));
check('Owner Portal saved operational views',['Due today','Overdue','Waiting on customer','Blocked','No next action','High priority','Recently updated'].every(text=>ownerServer.includes(text)));
check('Owner Portal structured forms',ownerClient.includes('required-mark')&&ownerClient.includes('form.reportValidity()')&&!ownerClient.includes('Paste JSON fields'));
check('Owner Portal safe owner error',ownerClient.includes('The selected record has not been changed')&&ownerClient.includes('Open Error Log'));
check('Owner Portal mobile accessibility',/@media\(max-width:800px\)/.test(ownerStyles)&&ownerClient.includes("event.key==='Escape'")&&ownerClient.includes("event.key==='Enter'"));
check('Owner Portal external locks preserved',ownerClient.includes('External actions locked')&&ownerServer.includes('externalActionsOccurred:false'));
const officeWeb=read(path.join(office,'BusinessOffice_Web.gs'));
const officeServer=read(path.join(office,'BusinessOffice_UX.gs'));
const officeUx=read(path.join(office,'BusinessOffice_UX.html'));
const officeScript=(officeUx.match(/<script>([\s\S]*)<\/script>/)||[])[1]||'';
syntax(officeServer,'BusinessOffice_UX.gs');
syntax(officeScript,'BusinessOffice UX client');
check('Business Office injects UX',officeWeb.includes("boInclude_('BusinessOffice_UX')"));
check('Business Office UX APIs',['uxDashboard','uxWorkspace','uxSearch','uxPipeline'].every(action=>officeWeb.includes(action)));
check('Business Office grouped process navigation',['Sales','Fulfillment','Purchasing','Revenue','Accounting & Tax','Control'].every(text=>officeUx.includes(text)));
check('Business Office action dashboard',['What needs to move next?','Financial snapshot','Exceptions','Recently changed'].every(text=>officeUx.includes(text)));
check('Business Office pipeline and job board',officeUx.includes('Sales Pipeline')&&officeUx.includes('Job Stage Board')&&officeServer.includes('boUxPipeline_'));
check('Business Office unified workspace',['Related records','Money','Files','Approvals','Timeline'].every(text=>officeUx.includes(text))&&officeServer.includes('boUxWorkspace_'));
check('Business Office visible Open control',officeUx.includes('class="ux-open"')&&officeUx.includes('openUxWorkspace'));
check('Business Office accounting health',['Expected cash','Missing receipts','Unreconciled','Unbalanced entries'].every(text=>officeUx.includes(text)));
check('Business Office structured forms',officeUx.includes('uxFormField')&&officeUx.includes('ux-required'));
check('Business Office useful empty states',officeUx.includes('Create an invoice from an approved job')&&officeUx.includes('Upload a PDF or take a picture'));
check('Business Office grouped search',officeUx.includes('Grouped global search')&&officeServer.includes('boUxGlobalSearch_'));
check('Business Office mobile cards',/@media\(max-width:800px\)/.test(officeUx)&&officeUx.includes('data-label'));
check('Business Office approval boundaries preserved',officeUx.includes('remain approval gated')&&officeServer.includes('externalActionsOccurred:false'));
const combined=ownerServer+'\n'+ownerClient+'\n'+officeServer+'\n'+officeUx;
const dangerous=['GmailApp.sendEmail','MailApp.sendEmail','ScriptApp.newTrigger','Stripe','PayPal'];
check('UX release adds no dangerous external execution',dangerous.every(token=>!combined.includes(token)),dangerous.filter(token=>combined.includes(token)).join(','));
run('scripts/verify-owner-portal-next.js','existing Owner Portal verification');
run('scripts/verify-business-office.js','existing Business Office verification');
const result={status:failures.length?'FAIL':'PASS',passed:passes.length,failed:failures.length,failures};
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
