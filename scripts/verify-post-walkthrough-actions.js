'use strict';
const fs=require('fs');
const voice=fs.readFileSync('commercial-app/field-visit-voice-capture.js','utf8');
const transcription=fs.readFileSync('commercial-app/field-visit-transcription.js','utf8');
const guidance=fs.readFileSync('commercial-app/field-visit-walkthrough-guidance.js','utf8');
const index=fs.readFileSync('commercial-app/index.html','utf8');
const sw=fs.readFileSync('commercial-app/service-worker.js','utf8');
const server=fs.readFileSync('supabase/functions/h38-walkthrough-transcription/index.ts','utf8');
const must=(content,needle)=>{if(!content.includes(needle))throw new Error(`missing ${needle}`)};
const mustNot=(content,needle)=>{if(content.includes(needle))throw new Error(`unexpected ${needle}`)};
for(const s of [
  'audio:true',
  'stream.getAudioTracks().length<1',
  'new MediaStream(stream.getAudioTracks().map(track=>track.clone()))',
  'walkthroughVoiceAudio:true',
  'workflow.captureFiles([videoFile]',
  'workflow.openRecorder=openRecorder',
  'sameWalkthroughSpeech:true',
  'microphoneRequired:true',
  'videoOnlyFallback:false',
  'The walkthrough was not saved because microphone audio was missing.',
  'H38_FIELD_VISIT_TRANSCRIPTION?.ensure?.(true)'
])must(voice,s);
for(const s of ['audio:false','fieldVideoInput'])mustNot(voice,s);
for(const s of [
  'Professional walkthrough notes ready.',
  'Walkthrough field notes',
  'Work summary',
  'Customer requests',
  'Site conditions',
  'Follow-up / unknowns',
  'Spoken measurements',
  'Original transcript — internal evidence',
  'walkthroughProfessionalNotes',
  'walkthroughVideoToProfessionalNotes:true',
  'typedNotesOverwritten:false',
  'spokenMeasurementsFieldVerified:false'
])must(transcription,s);
for(const s of [
  'ensureVoiceCaptureLoaded',
  'field-visit-voice-capture.js',
  'await window.H38_FIELD_VISIT_VOICE_CAPTURE?.syncPending?.()',
  'await waitForVideoNotes()',
  'microphoneRequired:true',
  'videoOnlyFallback:false',
  'H38 will not continue with video only.',
  'Notes from video',
  'Photos still needed',
  'Measurements still needed',
  'automaticFieldSync:true',
  'targetedNextNeed:true',
  'reviewer.run()'
])must(guidance,s);
for(const s of ['Dictate Note','h38-field-note-transcription','dictatedFieldNoteAudio','syncPendingDictation'])mustNot(guidance,s);
must(index,'field-visit-voice-capture.js?build=20260809-0048');
const voicePos=index.indexOf('field-visit-voice-capture.js?build=20260809-0048');
const transcriptPos=index.indexOf('field-visit-transcription.js?build=20260809-0048');
const guidancePos=index.indexOf('field-visit-walkthrough-guidance.js?build=20260809-0048');
if(!(voicePos>0&&transcriptPos>voicePos&&guidancePos>transcriptPos))throw new Error('walkthrough video-note runtime load order is wrong');
for(const s of ["CACHE_NAME='h38-business-office-20260809-0048'",'field-visit-voice-capture.js','field-visit-transcription.js','field-visit-walkthrough-guidance.js'])must(sw,s);
for(const s of ['business_memberships','siteCaptureSessions','Walkthrough Voice Audio','gpt-4o-mini-transcribe','UNVERIFIED_SPOKEN','automaticApproval: false','automaticCustomerSending: false'])must(server,s);
for(const runtime of [voice,transcription,guidance])for(const s of ['automaticApproval:true','automaticCustomerSending:true','SUPABASE_SERVICE_ROLE_KEY'])mustNot(runtime,s);
console.log(JSON.stringify({status:'PASS',oneWalkthroughVideo:true,speechFromSameRecording:true,microphoneRequired:true,videoOnlyFallback:false,professionalNotes:true,rawTranscriptInternalOnly:true,automaticFieldSync:true,targetedNextNeed:true,separateDictationWorkflow:false,automaticApproval:false,automaticCustomerSending:false},null,2));
