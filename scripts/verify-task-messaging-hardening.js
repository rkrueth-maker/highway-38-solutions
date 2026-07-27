#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=relativePath=>fs.readFileSync(path.join(root,relativePath),'utf8');
const checks=[];
const check=(name,condition,evidence='')=>{checks.push({name,condition:Boolean(condition),evidence});console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${evidence?` — ${evidence}`:''}`);};

const webPath='apps-script/business-office/BusinessOffice_TaskMessaging_30_Web.gs';
const emailWebPath='apps-script/business-office/ZZZ_BusinessOffice_EmailMessagingWeb.gs';
const emailSyncPath='apps-script/business-office/BusinessOffice_EmailMessagingSync.gs';
const webBase=read(webPath);
const emailWeb=read(emailWebPath);
const emailSync=read(emailSyncPath);
const web=webBase+'\n'+emailWeb;
const client=read('apps-script/core-engine/owner-portal-next/Portal_TaskMessaging_Client.html');
const unified=read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');
const contractSource=read('apps-script/business-office/BusinessOffice_ModuleContract.gs');
const moduleRegistrySource=read('apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js');
const registryContext={boAssert_:(condition,message)=>{if(!condition)throw new Error(message||'assertion failed');}};
let groups=[];

for(const [name,source] of [[webPath,webBase],[emailWebPath,emailWeb],[emailSyncPath,emailSync],["Portal_TaskMessaging_Client.html",client]]){
  try{new vm.Script(source,{filename:name});check(`${name} syntax`,true);}catch(error){check(`${name} syntax`,false,error.message);}
}
try{
  vm.createContext(registryContext);
  new vm.Script(contractSource,{filename:'BusinessOffice_ModuleContract.gs'}).runInContext(registryContext);
  new vm.Script(moduleRegistrySource,{filename:'Portal_Module_Registry.js'}).runInContext(registryContext);
  groups=registryContext.h38PortalModuleRegistry_('quoteBuilder');
  check('task messaging contract and registry syntax',true);
}catch(error){check('task messaging contract and registry syntax',false,error.message);}

check('consented SMS records require source scope and evidence',/moduleKey === ["']smsConsent["']/.test(web)&&/["']Consent Scope["'], ["']Consent Source["'], ["']Consent Evidence["']/.test(web)&&/required before consent can be marked Consented/.test(web));
check('SMS approval rechecks complete documented consent',/function h38TmRequireDocumentedConsent_/.test(web)&&/["']Consent Scope["'], ["']Consent Source["'], ["']Consent Date["'], ["']Consent Evidence["']/.test(web)&&/decision\) === ["']Approve["'][\s\S]*h38TmRequireDocumentedConsent_/.test(web));
check('SMS send rechecks complete documented consent',/function h38PortalMessagingSend\(messageId\)[\s\S]*message\.Channel === ["']SMS["'][\s\S]*h38TmRequireDocumentedConsent_/.test(web));
check('Email rows cannot use SMS approval or send',/Email evidence does not use SMS approval controls/.test(web)&&/Captured email cannot be released through the SMS provider/.test(web));
check('linked task references repeat task access control',/function h38TmRequireLinkedTaskReferenceAccess_/.test(web)&&/h38TmRequireTaskAccess_\(linkedTask, user, false\)/.test(web)&&/h38TmValidateWebSave_/.test(web));
check('task transition repeats package and role gates',/function h38PortalTaskTransition[\s\S]*boAssertModuleEnabled_\(["']assignedTasks["']\)[\s\S]*h38TmRequireModule_\(["']assignedTasks["'], ["']Edit["']\)/.test(web));
[
  'h38PortalMessagingDecision','h38PortalMessagingSend','h38PortalMessagingSyncInbound','h38PortalMessagingSyncStatus','h38PortalMessagingConvertReplyToTask','h38PortalMessagingProviderStatus','h38PortalMessagingSubmitReview','h38PortalMessagingUsage','h38PortalMessagingSyncEmail','h38PortalMessagingEmailStatus'
].forEach(name=>{
  const matches=[...web.matchAll(new RegExp(`function ${name}\\b`,'g'))],start=matches.length?matches[matches.length-1].index:-1,end=start<0?-1:web.indexOf('\nfunction ',start+10),block=start<0?'':web.slice(start,end<0?web.length:end);
  check(`${name} repeats package gate`,block.includes("boAssertModuleEnabled_('messaging')")||block.includes('boAssertModuleEnabled_("messaging")'));
  check(`${name} repeats role gate`,block.includes("h38TmRequireModule_('messaging'")||block.includes('h38TmRequireModule_("messaging"'));
});
check('Gmail sync is owner-only',/function h38PortalMessagingSyncEmail[\s\S]*boRequireOwner_\(\)/.test(web));
check('Gmail evidence is idempotent and linked to a document',/boEmailExistingMessage_/.test(emailSync)&&/["']Duplicate Key["']:\s*["']GMAIL\|["']/.test(emailSync)&&/["']Document ID["']:\s*documentId/.test(emailSync));
check('Gmail evidence capture is read-only',/["']Send Allowed["']:\s*["']No["']/.test(emailSync)&&/["']Retry Locked["']:\s*["']Yes["']/.test(emailSync));
check('Gmail sync never sends deletes or replies',!/(GmailApp\.sendEmail|messages\/send|moveToTrash|deleteMessage|reply\()/.test(emailSync));
check('assignee endpoint repeats assigned-task gate',/function h38PortalTaskMessagingAssignees[\s\S]*boAssertModuleEnabled_\(["']assignedTasks["']\)[\s\S]*h38TmRequireModule_\(["']assignedTasks["'], ["']View["']\)/.test(web));
check('non-owner client uses role-safe bootstrap',/if\(H38_UNIFIED\.ownerMode\)return h38OwnerRefreshBase\(\)/.test(client)&&/H38_UNIFIED\.defaultModule\|\|'bo:assignedTasks'/.test(client)&&/Task and Communications access is limited server-side/.test(client));
const today=groups.find(group=>group.id==='command');
const customers=groups.find(group=>group.id==='sales');
const taskItem=today&&today.items.find(item=>item.key==='bo:assignedTasks');
const messagingItem=customers&&customers.items.find(item=>item.key==='bo:messaging');
const taskContract=registryContext.boGetUnifiedModule_&&registryContext.boGetUnifiedModule_('assignedTasks');
const messageContract=registryContext.boGetUnifiedModule_&&registryContext.boGetUnifiedModule_('messaging');
check('non-owner navigation keeps My Work and Communications separate',Boolean(taskItem&&messagingItem&&taskItem.module==='assignedTasks'&&messagingItem.module==='messaging'&&taskItem.key!==messagingItem.key)&&Boolean(taskContract&&messageContract&&taskContract.group==='command'&&messageContract.group==='sales')&&/var defaultModule = access\.ownerMode \? 'today' : 'bo:assignedTasks'/.test(unified),`${taskItem&&taskItem.label||'missing task'} | ${messagingItem&&messagingItem.label||'missing messaging'}`);
check('task and messaging load on demand',taskContract&&messageContract&&taskContract.loadStrategy==='on-demand'&&messageContract.loadStrategy==='on-demand');
check('client contains no direct provider request',!/(fetch\(|XMLHttpRequest|sendBeacon|api\.twilio\.com)/.test(client));
check('client exposes explicit Email evidence actions',client.includes('Sync demo email evidence')&&client.includes('Sync recent Gmail')&&client.includes('Open Gmail')&&client.includes('Open evidence file'));
check('client keeps SMS-only actions behind Channel check',client.includes("if(row.Channel==='Email')")&&client.includes('Send selected SMS'));

const failures=checks.filter(item=>!item.condition);
const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),passed:checks.length-failures.length,failed:failures.length,checks,failures};
const out=path.join(root,'artifacts','task-messaging');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'hardening-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`RESULT: ${result.status} (${result.passed} pass, ${result.failed} fail)`);process.exit(failures.length?1:0);
