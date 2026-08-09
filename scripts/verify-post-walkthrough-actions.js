'use strict';
const fs=require('fs');
const guidance=fs.readFileSync('commercial-app/field-visit-walkthrough-guidance.js','utf8');
const fn=fs.readFileSync('supabase/functions/h38-field-note-transcription/index.ts','utf8');
const must=(c,s)=>{if(!c.includes(s))throw new Error(`missing ${s}`)};
for(const s of ['Next on this Site Visit','Dictate Note','Analyze & Show Next Need','Photos still needed','Measurements still needed','automaticFieldSync:true','visiblePostWalkthroughActions:true','dictatedFieldNoteAudio:true','Dictated Field Note Audio','SAVE_SITE_DICTATED_NOTE_AUDIO','h38-field-note-transcription','syncPendingDictation','setInterval(()=>{if(C.state.open&&navigator.onLine)','H38_FIELD_VISIT_TRANSCRIPTION.ensure','reviewer.run'])must(guidance,s);
for(const s of ['business_memberships','siteCaptureSessions','Dictated Field Note Audio','SITE_DICTATED_FIELD_NOTE_TRANSCRIBED','gpt-4o-mini-transcribe','whisper-1','automaticApproval:false','automaticCustomerSending:false'])must(fn,s);
for(const s of ['automaticApproval:true','automaticCustomerSending:true','SUPABASE_SERVICE_ROLE_KEY'])if(guidance.includes(s))throw new Error(`client runtime must not contain ${s}`);
console.log(JSON.stringify({status:'PASS',visiblePostWalkthroughActions:true,inAppDictation:true,automaticFieldSync:true,targetedNextNeed:true,serverSideTranscription:true,automaticApproval:false,automaticCustomerSending:false},null,2));
