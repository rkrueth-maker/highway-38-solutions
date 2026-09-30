#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),failures=[];
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function check(name,ok){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failures.push(name);}
const data=read('commercial-app/supabase-data.js'),app=read('commercial-app/communications-native-receptionist.js'),messages=read('commercial-app/app-08.js'),customer=read('commercial-app/customer-360-authority.js'),timeline=read('commercial-app/customer-360-browser-integration-v3.js'),aiClient=read('commercial-app/supabase-ai-fallback.js'),aiServer=read('supabase/functions/h38-assistant-ai/index.ts'),sw=read('commercial-app/service-worker.js'),commands=read('commercial-app/assistant-command-bus.js');
for(const [name,src] of [['communications module',app],['communications view',messages],['customer workspace',customer],['customer history',timeline],['tenant record hydration',data],['mobile actions',read('commercial-app/mobile-field-view.js')],['global home actions',read('commercial-app/customer-readiness-polish.js')],['AI client',aiClient],['assistant command bus',commands]]){try{new vm.Script(src);check(`${name} parses`,true);}catch(e){check(`${name} parses: ${e.message}`,false);}}
check('calls use native dialer only and preserve unconfirmed outcome',app.includes('tel:${phone.replace')&&app.includes('Dialer opened — outcome unconfirmed'));
check('texts open native messages or copy a draft without sending',app.includes('sms:${phone.replace')&&app.includes('Copied — not sent')&&!/messages\/send|twilio|telnyx/i.test(app));
check('a user action is required before call completion or sent status is recorded',app.includes('data-save-call')&&app.includes('data-confirm-text-sent')&&app.includes('User confirmed sent'));
check('AI receptionist tests call the existing aiAsk route',app.includes("state().bridge.request('aiAsk'")&&app.includes("experienceMode:'receptionist_test'"));
check('test input and response are persisted as tenant-scoped Office records',app.includes("save('conversations'")&&app.includes("save('messages'")&&app.includes("'Business ID':state().businessId"));
check('new communication and follow-up records hydrate by stable IDs',data.includes("communicationLogs:['Communication Log ID','communicationLogId']")&&data.includes("followUps:['Follow-up ID','followUpId']"));
check('quote intake creates only an explicit internal request',app.includes('saveQuoteRequest')&&app.includes('Request Type')&&app.includes('No quote, price or customer message was created')&&app.includes('saveFollowUp')&&app.includes("save('followUps'"));
check('receptionist settings are per business and owner/admin only',app.includes("['owner','administrator'].includes(role())")&&app.includes("module_key:MODULE_KEY")&&app.includes("onConflict:'business_id,module_key'"));
check('Northern does not receive an enabled default',app.includes("enabled:/highway\\s*38|h38/i.test(businessName())"));
check('live voice provider and conditional forwarding remain off',app.includes('liveVoiceProviderEnabled:false')&&app.includes('conditionalForwardingEnabled:false'));
check('AI endpoint has explicit receptionist safety instructions',aiServer.includes('simulating an AI receptionist for staff training')&&aiServer.includes('Never promise a refund, cancellation, discount or price change'));
check('communications logs are included in Customer 360 history',customer.includes("'communicationLogs'")&&timeline.includes("communicationLogs:'Call / text'"));
check('global quick actions and Communications tab are wired',messages.includes("'receptionist'")&&commands.includes("window.H38_COMMUNICATIONS.open({tab:'receptionist'})"));
check('new client is delivered fresh and precached',sw.includes("'communications-native-receptionist.js'")&&sw.includes('20260930-0001'));
const total=22,result={status:failures.length?'HOLD':'PASS',checks:total,failures};
console.log(`\nRESULT: ${result.status} (${total-failures.length}/${total} checks passed)`);
if(failures.length)process.exit(1);
