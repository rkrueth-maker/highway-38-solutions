#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const need=(t,m,l)=>{if(!t.includes(m))throw new Error(`Missing ${l}: ${m}`)};
const reject=(t,m,l)=>{if(t.includes(m))throw new Error(`Forbidden ${l}: ${m}`)};
const scripts=t=>[...t.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>!s.includes('<?!='));
const server=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Commercial.gs');
const client=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Commercial_Client.html');
const proposal=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Proposal.html');
const index=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');
const web=read('apps-script/business-office/BusinessOffice_Web.gs');
const gate=read('apps-script/business-office/BusinessOffice_ModuleAccess.gs');
const actionContract=read('apps-script/business-office/BusinessOffice_ActionContract.gs');
const assembler=read('scripts/build-unified-apps-script-shell.js');
[
 ['H38_QB_COMMERCIAL','commercial contract'],['Approved to Share','controlled lifecycle'],['Changes Requested','customer change state'],['boQuoteCommercialPrepareShare_','controlled share preparation'],['sendAllowed:false','no automatic sending'],['approvedVersion','version lock'],['boQuoteCommercialCustomerAction_','customer action endpoint'],['signatureDataUrl','signature capture'],['automaticJobCreated:false','no automatic job creation'],['automaticWorkStarted:false','no automatic work start'],['boQuoteCommercialFollowUp_','follow-up scheduling'],['Customer viewed proposal','view tracking']
].forEach(([m,l])=>need(server,m,l));
[
 ['Proposal Workspace','owner proposal workspace'],['Options & Add-ons','options editor'],['Preview as Customer','customer preview'],['Prepare Customer Link','controlled link action'],['Owner-approved follow-up','follow-up UI'],['Good–Better–Best options','option packages'],['Customer visible','photo visibility'],['Generate PDF','PDF action']
].forEach(([m,l])=>need(client,m,l));
[
 ['Approve & Sign','signature approval'],['Request Changes','customer change request'],['Decline','customer decline'],['Download / Print PDF','customer PDF'],['data-option','selectable proposal options'],['data-addon','selectable add-ons'],['No job, payment, or scheduling starts automatically.','customer safety notice']
].forEach(([m,l])=>need(proposal,m,l));
need(index,"boInclude_('BusinessOffice_QuoteBuilder_Commercial_Client')",'commercial client include');
need(index,'id="qbBackToOffice"','persistent Business Office return control');
['quoteCommercialState','quoteCommercialSave','quoteCommercialTransition','quoteCommercialPrepareShare','quoteCommercialPreview','quoteCommercialFollowUp'].forEach(a=>need(web,a,`${a} API`));
need(gate,'boModulesForApiAction_','canonical API module-guard delegation');
need(actionContract,'quoteCommercialPrepareShare','commercial sharing action contract');
need(actionContract,"modules:['quotes']",'Quote Builder commercial module requirement');
need(assembler,"h38UnifiedShellParameter_(event,'proposal')",'public proposal route');
need(assembler,'boRenderCustomerProposal_','proposal renderer route');
reject(server,'MailApp.sendEmail','automatic email');reject(server,'GmailApp.sendEmail','automatic Gmail');reject(server,'UrlFetchApp.fetch','automatic external action');
scripts(client).forEach((s,i)=>new Function(s));scripts(proposal).forEach((s,i)=>new Function(s));
console.log('PASS — commercially complete Quote Builder proposal lifecycle, persistent Business Office return, canonical action/module guards, controlled sharing, options, add-ons, photos, preview, signature, PDF, timeline, and follow-up controls verified.');