#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const patch=fs.readFileSync(path.join(root,'commercial-app/quote-mobile-stabilization.js'),'utf8');
const index=fs.readFileSync(path.join(root,'commercial-app/index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'commercial-app/service-worker.js'),'utf8');
const checks=[
 ['Build Quote is explicit',patch.includes("textContent='✨ Build Quote'")],
 ['camera and gallery are separate',patch.includes("textContent='📷 Take Picture'")&&patch.includes("textContent='🖼️ Choose Photos'")],
 ['gallery does not force camera',patch.includes("else i.multiple=true")],
 ['picker permission remains held',patch.includes('h38QuotePickerPermissionHolder')&&patch.includes('permission held until upload finishes')],
 ['original File uploads directly',patch.includes("storage.from(BUCKET).upload(path,item.file")],
 ['stabilized path avoids FileReader',!patch.includes('FileReader')],
 ['stabilized path avoids canvas',!patch.includes("createElement('canvas')")&&!patch.includes('createImageBitmap')],
 ['draft is saved before upload',patch.indexOf('saveDraft(true,false)')<patch.indexOf("uploadAll(r['Quote ID'])")],
 ['saved draft visibly reopens',patch.includes('Draft opened for editing.')&&patch.includes('scrollIntoView')],
 ['editable line values are restored',patch.includes('data-field="quantity"')&&patch.includes('data-field="unitPrice"')],
 ['presented quotes require manual revision unlock',patch.includes("REVISABLE=new Set(['PRESENTED'])")&&patch.includes('h38UnlockQuoteRevision')&&patch.includes('revisionEditUnlocked')],
 ['revision lineage is retained',patch.includes("'Previous Revision'")&&patch.includes("'Previous Status'")],
 ['non-revisable locked quotes stay protected',patch.includes('is locked and cannot be changed from this screen.')],
 ['revision unlock preserves external-action locks',patch.includes('Nothing is approved or sent automatically.')&&patch.includes('automaticSend:false')],
 ['Proof Log records private photo save',patch.includes("action_type:'SAVE_QUOTE_PHOTO'")&&patch.includes('external_action_occurred:false')],
 ['patch loads after app-20',index.indexOf('app-20.js')<index.indexOf('quote-mobile-stabilization.js')],
 ['new asset is in service worker cache',sw.includes("'./quote-mobile-stabilization.js'")],
 ['retired Apps Script not restored',!patch.includes('google.script.run')&&!patch.includes('script.google.com')]
];
let failures=0;for(const[name,pass]of checks){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(!pass)failures++;}
if(failures){console.error(`${failures} mobile Quote Builder checks failed.`);process.exit(1);}console.log('Supabase Quote Builder mobile stabilization checks passed.');
