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
if(index.indexOf("BusinessOffice_QuoteBuilder_AI_Visual_Client")>index.indexOf("BusinessOffice_QuoteBuilder_Mobile_AI_Fix"))throw new Error('AI visual client must load before the final mobile simplification layer.');
need(mobile,"document.querySelectorAll('.qb-ai-panel').forEach",'duplicate mobile AI panels remain hidden');
need(visual,'id="qbMobileCreateAiVisual"','single mobile Generate AI Image button');
need(visual,'🖼️ Generate AI Image','mobile AI image label');
need(visual,"result.insertAdjacentElement('afterend',action)",'button placed after completed quote result');
need(visual,"directly",'placeholder marker');
