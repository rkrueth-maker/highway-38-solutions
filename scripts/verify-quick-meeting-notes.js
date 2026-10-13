'use strict';
const fs=require('fs');const assert=require('assert');
assert(!fs.existsSync('commercial-app/quick-meeting-notes.js'),'retired broken Quick Meeting v1 runtime must stay removed');
const runtime=fs.readFileSync('commercial-app/quick-meeting-notes-v2.js','utf8');
const bootstrap=fs.readFileSync('commercial-app/runtime-rowid-fix.js','utf8');
const fn=fs.readFileSync('supabase/functions/h38-quick-meeting-notes/index.ts','utf8');
function has(source,needle,message){assert(source.includes(needle),message||`missing ${needle}`);}
has(runtime,"const BUILD='20261002-notes-handoff-fallback-4'",'quick meeting runtime build marker');
has(runtime,"customerOptional:true",'customer must be optional');
has(runtime,"temporaryAudioOnly:true",'audio must be temporary');
has(runtime,"recordingPersisted:false",'recording must not be persisted');
has(runtime,"transcriptPersisted:false",'transcript must not be persisted');
has(runtime,"meetingReportDocument:false",'quick meetings must not generate a meeting report document');
has(runtime,"queueOperation('MEETING_CREATED'",'notes must use canonical Office save queue');
has(runtime,"storagePolicy:'NOTES_ONLY'",'saved meeting must declare notes-only storage');
has(runtime,"noteSections:n",'saved meeting must contain structured notes');
has(runtime,"h38Qm2Today",'Today must expose a meeting button');
has(runtime,"h38-qm2-customer",'phone customer width cleanup must be included');
has(runtime,"function capture(e){if(!mobile())return;",'Quick Meeting must not take over desktop Meeting controls');
has(runtime,"siteVisitEvidenceUntouched:true",'Site Visit evidence flow must remain separate');
assert(!/collection:\s*['"]documents['"]/.test(runtime),'quick meeting runtime must not create document records');
assert(!/audioAttachmentId/.test(runtime),'quick meeting runtime must not persist an audio attachment id');
has(fn,'audioSaved:false','edge function must report no retained audio');
has(fn,'transcriptSaved:false','edge function must report no retained transcript');
has(fn,'notesOnly:true','edge function must report notes-only retention');
has(fn,'Return only useful meeting notes, not a transcript.','edge function prompt must prohibit transcript output');
/* True intent: forbid persisting MEETING content, not all business_records writes.
   The only permitted writes are the shared AI usage-cap bookkeeping in
   aiUsageAlert75(): an ai_config row keyed ai_usage_alert_75 whose payload is
   only {month, level, count, sentAt} — no audio/transcript/notes content. */
{const writeRe=/from\(["']business_records["']\)\s*\.\s*(insert|update|upsert|delete)\b/g;let m;let writes=0;while((m=writeRe.exec(fn))!==null){writes++;assert(m[1]==='insert'||m[1]==='update',`business_records ${m[1]} is never permitted here`);const window=fn.slice(Math.max(0,m.index-1200),m.index+500);assert(window.includes('ai_config'),'business_records write must target only the ai_config collection');assert(window.includes('ai_usage_alert_75'),'business_records write must be only the ai_usage_alert_75 bookkeeping row');assert(!/(meeting|transcript|audio)/i.test(fn.slice(m.index,m.index+300)),'business_records write must not carry meeting content');}assert(writes>0,'expected the ai_usage_alert_75 bookkeeping write to exist');}
has(fn,'collection:"ai_config",record_key:"ai_usage_alert_75"','usage bookkeeping insert must be the ai_config ai_usage_alert_75 row');
assert(/from\(["']business_records["']\)\s*\.\s*select\(["']payload["']\)/.test(fn),'read-only ai_config cap check must select payload from business_records');
assert(!/storage\.from/.test(fn),'edge function must not store temporary audio');
has(bootstrap,"quick-meeting-notes-v2.js?build=",'runtime bootstrap must load clean versioned Quick Meeting runtime');
console.log(JSON.stringify({status:'PASS',checks:['retired v1 absent','notes-only persistence','temporary audio','no transcript retention','optional customer','Today meeting button','customer mobile width cleanup','desktop Meeting preserved','Site Visit untouched','versioned runtime bootstrap']},null,2));
