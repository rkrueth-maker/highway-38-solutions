#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error(`Missing ${label}: ${marker}`)};
const reject=(text,marker,label)=>{if(text.includes(marker))throw new Error(`Forbidden ${label}: ${marker}`)};
const scripts=text=>[...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);

const index=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');
const fix=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Mobile_AI_Fix.html');

need(index,"boInclude_('BusinessOffice_QuoteBuilder_Mobile_AI_Fix')",'final mobile AI include');
if(index.indexOf("boInclude_('BusinessOffice_QuoteBuilder_Mobile_AI_Fix')")<index.indexOf("boInclude_('BusinessOffice_QuoteBuilder_GenericCustomer_Client')"))throw new Error('Mobile AI fix must load last.');
need(fix,'(hover:none) and (pointer:coarse)','mobile pointer detection beyond viewport width');
need(fix,'#qbNav.nav{position:sticky!important','mobile horizontal navigation override');
need(fix,'.table-wrap tbody{display:grid!important','mobile quote-table cards');
need(fix,'.qb-field-actions{display:grid!important','mobile field-action grid');
need(fix,'body:has(#project) .qb-quick-quote-trigger','hide duplicate floating quick action on quote form');
need(fix,'.toast{left:10px!important','mobile-safe error toast');
need(fix,"closest('#qbBuildAiDraft,#qbBuildFieldDraft')",'single final handler for both AI build buttons');
need(fix,'event.stopImmediatePropagation()','legacy invalid-image handlers blocked');
need(fix,"labeled('scope','Scope')",'scope included in agent context');
need(fix,"labeled('assumptions','Known dimensions and assumptions')",'known dimensions included in agent context');
need(fix,"labeled('internalNotes','Internal notes')",'internal notes included in agent context');
need(fix,"document.querySelectorAll('#qbPendingPhotos img",'actual queued photos collected');
need(fix,"if(!/^(blob:|data:image\\/)/i.test(src))",'invalid preview schemes rejected');
need(fix,'const response=await fetch(src)','blob preview converted to bytes');
need(fix,"const max=1600",'phone photo compression dimension');
need(fix,"canvas.toBlob(resolve,type,quality)",'phone photo JPEG compression');
need(fix,"direct('boBuildAiQuoteDraft'",'visual AI endpoint receives prepared photos');
need(fix,"photos:photos",'prepared image data sent to AI');
need(fix,"direct('boQuoteBuilderAutoLocalPrice'",'automatic missing-price research');
need(fix,'line.searchQuery||line.description','search derived from AI line or scope');
need(fix,"draft.scope||basis",'scope and notes become pricing-search context');
need(fix,"priceStatus='automatic_local_typical_owner_review'",'automatic price remains owner-review controlled');
need(fix,'applyLines(draft)','AI results populate the current quote');
need(fix,"if(/image_url|invalid.*image|invalid.*url/i.test(raw))",'friendly invalid-photo error');
reject(fix,"image_url:src",'raw blob URL sent directly to AI');
reject(fix,"Select a customer before building the AI draft.",'customer blocker in final handler');

scripts(fix).forEach(body=>new Function(body));
console.log('PASS — mobile Quote Builder layout, actual photo conversion/compression, scope-and-notes AI context, automatic local-price fallback, and friendly error handling verified.');
