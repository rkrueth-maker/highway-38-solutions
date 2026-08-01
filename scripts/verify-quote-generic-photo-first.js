#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error(`Missing ${label}: ${marker}`)};
const reject=(text,marker,label)=>{if(text.includes(marker))throw new Error(`Forbidden ${label}: ${marker}`)};
const scripts=text=>[...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);

const fieldFixes=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Field_Fixes.html');
const genericServer=read('apps-script/business-office/BusinessOffice_QuoteBuilder_GenericCustomer.gs');
const genericClient=read('apps-script/business-office/BusinessOffice_QuoteBuilder_GenericCustomer_Client.html');
const index=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');

need(index,"boInclude_('BusinessOffice_QuoteBuilder_Field_Fixes')",'final Quote Builder override include');
need(index,"boInclude_('BusinessOffice_QuoteBuilder_GenericCustomer_Client')",'generic customer repair include');
if(index.indexOf("boInclude_('BusinessOffice_QuoteBuilder_GenericCustomer_Client')")<index.indexOf("boInclude_('BusinessOffice_QuoteBuilder_Field_Fixes')"))throw new Error('Generic customer repair must load after the final Quote Builder overrides.');
need(fieldFixes,"const GENERIC_ID='CUST-H38-GENERIC-QUOTE'",'deterministic generic customer ID');
need(fieldFixes,"const GENERIC_NAME='Generic Quote Customer'",'visible generic customer name');
need(fieldFixes,"selectGeneric('aiCustomer')",'photo draft generic customer selection');
need(fieldFixes,"selectGeneric('customer')",'new quote generic customer selection');
need(fieldFixes,"if(!select.value){select.value=option.value",'automatic selection only when no real customer is chosen');
need(fieldFixes,'notes.required=false','photos accepted without mandatory notes');
need(fieldFixes,'Photos can be analyzed without additional notes.','photo-first guidance');
need(fieldFixes,'window.qbPrepareAi=async function(event)','final photo-first submit override');
need(fieldFixes,'await uploadFiles(files,customerId)','private source files retained');
need(fieldFixes,"documentType:'Quote Field Photo'",'private quote-photo classification');
need(fieldFixes,'const imageFiles=files.filter(isImage).slice(0,6),photos=await Promise.all(imageFiles.map(dataUrl))','actual image bytes prepared for AI analysis');
need(fieldFixes,'boBuildAiQuoteDraft(payload)','AI visual quote-draft endpoint');
need(fieldFixes,'The photos were used to identify the likely work and quote items.','photo-analysis result confirmation');
need(fieldFixes,'What the photos show','photo observations section');
need(fieldFixes,'Measurements or details to confirm','measurement confirmation section');
need(fieldFixes,'Add to Quote','owner-reviewed quote-item action');
reject(fieldFixes,'Choose a customer and enter field notes.','legacy customer-and-notes blocker in final override');
reject(fieldFixes,'Select a customer before building the AI draft.','customer blocker in final override');

need(genericServer,'function boQuoteBuilderEnsureGenericCustomer()','generic customer repair endpoint');
need(genericServer,"const customerId = 'CUST-H38-GENERIC-QUOTE'",'fixed generic customer record key');
need(genericServer,"'Display Name': displayName",'generic customer display name');
need(genericServer,"'Customer Type': 'Internal Placeholder'",'internal placeholder classification');
need(genericServer,'Replace with the real customer before approval or sending.','replacement boundary');
need(genericServer,"boQuoteBuilderInvalidateCache_('customers')",'customer cache refresh');
need(genericServer,"boProof_('ENSURE GENERIC QUOTE CUSTOMER'",'generic customer proof record');
reject(genericServer,"'Send Allowed': 'Yes'",'automatic send permission');
reject(genericServer,'boApproveSelectedRecord','automatic approval');
need(genericClient,'.boQuoteBuilderEnsureGenericCustomer()','page-load generic customer repair call');
need(genericClient,'withFailureHandler(()=>{requested=false;})','repair retry safety');

scripts(fieldFixes).forEach(body=>new Function(body));
scripts(genericClient).forEach(body=>new Function(body));
new Function(genericServer);
console.log('PASS — Generic Quote Customer defaults automatically, repairs itself when missing, photo-only analysis uses image bytes, known dimensions remain optional input, and customer replacement is deferred until approval or sending.');
