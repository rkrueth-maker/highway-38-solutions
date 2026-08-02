#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error(`Missing ${label}: ${marker}`)};
const reject=(text,marker,label)=>{if(text.includes(marker))throw new Error(`Forbidden ${label}: ${marker}`)};
const scripts=text=>[...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);

const visual=read('apps-script/business-office/BusinessOffice_QuoteBuilder_AI_Visual_Client.html');
const mobile=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Mobile_AI_Fix.html');
const index=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');
const aiPublic=read('apps-script/business-office/BusinessOffice_QuoteBuilder_AI_Public.gs');

need(index,"boInclude_('BusinessOffice_QuoteBuilder_AI_Visual_Client')",'AI visual client include');
need(index,"boInclude_('BusinessOffice_QuoteBuilder_Mobile_AI_Fix')",'mobile Quote Builder include');
if(index.indexOf('BusinessOffice_QuoteBuilder_AI_Visual_Client')>index.indexOf('BusinessOffice_QuoteBuilder_Mobile_AI_Fix'))throw new Error('AI visual client must load before the final mobile simplification layer.');

need(mobile,"document.querySelectorAll('.qb-ai-panel').forEach",'duplicate mobile AI panels remain hidden');
need(visual,'id="qbMobileCreateAiVisual"','single mobile Generate AI Image button');
if((visual.match(/id="qbMobileCreateAiVisual"/g)||[]).length!==1)throw new Error('The mobile workflow must render exactly one Generate AI Image button.');
need(visual,'🖼️ Generate AI Image','mobile AI image label');
need(visual,"const result=document.getElementById('qbAiResult')",'completed quote result dependency');
need(visual,"result.insertAdjacentElement('afterend',action)",'button placed beneath the completed quote result');
need(visual,"prepareVisualImage(photos[0])",'bounded first-photo preparation');
need(visual,"canvas.toDataURL('image/jpeg',.74)",'bounded visual input encoding');
need(visual,"runner.boCreateAiCompletionVisual(payload)",'existing AI image backend call');
need(visual,"call('createAiCompletionVisual'",'mobile AI image request');
need(visual,"document.getElementById('qbMobileAiVisual')||document.getElementById('qbAiVisual')",'mobile-first rendered image host');
need(visual,'AI PROPOSED COMPLETION CONCEPT — NOT PROOF OF COMPLETION','non-proof visual label');
need(visual,'It is not included in the customer proposal until explicitly approved.','owner approval boundary');
reject(visual,'fetch(','browser fetch for local photo conversion');
reject(visual,'response.blob','browser blob conversion');
need(aiPublic,'function boCreateAiCompletionVisual(payload)','public AI image endpoint');
need(aiPublic,'boCreateAiCompletionVisual_(payload||{})','existing protected AI image implementation');

scripts(visual).forEach(body=>new Function(body));
console.log('PASS — one mobile Generate AI Image action appears beneath the completed Quote Builder result, uses the existing protected backend, prepares one bounded photo without browser fetch, and preserves owner-review labeling.');
