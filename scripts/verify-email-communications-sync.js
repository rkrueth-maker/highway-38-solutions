#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const failures=[];
const passes=[];
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function check(name,condition,evidence=''){(condition?passes:failures).push({name,evidence});console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${evidence?' — '+evidence:''}`);}
function hasAll(source,markers){return markers.every(marker=>source.includes(marker));}
function parses(name,source){try{new vm.Script(source,{filename:name});check(`${name} parses`,true);}catch(error){check(`${name} parses`,false,error.message);}}

const files={
 sync:'apps-script/business-office/BusinessOffice_EmailMessagingSync.gs',
 actions:'apps-script/business-office/ZZZ_BusinessOffice_EmailMessagingActions.gs',
 web:'apps-script/business-office/ZZZ_BusinessOffice_EmailMessagingWeb.gs',
 assistant:'apps-script/business-office/BusinessOffice_AI_Assistant.gs',
 api:'apps-script/business-office/BusinessOffice_Web.gs',
 client:'apps-script/core-engine/owner-portal-next/Portal_TaskMessaging_Client.html',
 taskCore:'apps-script/business-office/BusinessOffice_TaskMessaging_10_Core.gs',
 sms:'apps-script/business-office/BusinessOffice_TaskMessaging_20_SMS.gs',
 manifest:'apps-script/business-office/appsscript.json'
};
Object.values(files).forEach(file=>check(`required ${file}`,fs.existsSync(path.join(root,file))));
if(failures.length)process.exit(1);
const sync=read(files.sync),actions=read(files.actions),web=read(files.web),assistant=read(files.assistant),api=read(files.api),client=read(files.client),taskCore=read(files.taskCore),sms=read(files.sms),manifest=read(files.manifest);
parses('BusinessOffice_EmailMessagingSync.gs',sync);
parses('ZZZ_BusinessOffice_EmailMessagingActions.gs',actions);
parses('ZZZ_BusinessOffice_EmailMessagingWeb.gs',web);
parses('BusinessOffice_AI_Assistant.gs',assistant);
parses('BusinessOffice_Web.gs',api);
parses('Portal_TaskMessaging_Client.html',client);

check('existing Communications schema supports Email',hasAll(taskCore,["MESSAGES: \"BO Messages\"",'"Channel"','"Provider Message ID"','"Conversation Key"','"Document ID"']));
check('Gmail send returns provider identifiers',hasAll(assistant,["const result=JSON.parse(response.getContentText()||'{}')","boAssert_(result.id","threadId:String(result.threadId","rawMime:mime"]));
check('email action retains record context',hasAll(actions,['linkContext: boEmailActionLinkContext_(context)','quoteId: String(args.quoteId','invoiceId: String(args.invoiceId','paymentId: String(args.paymentId']));
check('send-time capture is mandatory but cannot duplicate a successful send',hasAll(actions,['boEmailCaptureSentActionSafe_(payload, gmail)','gmailMessageId: gmail.id','officeMessageId: capture.message','captureStatus: capture.status']));
check('Communications row uses Email and Gmail',hasAll(sync,["Channel: 'Email'","Provider: 'Gmail'","'Provider Message ID': spec.providerMessageId","'Conversation Key': spec.threadId"]));
check('captured email is read-only and retry locked',hasAll(sync,["'Send Allowed': 'No'","'Retry Locked': 'Yes'","Status: outbound ? 'Sent' : 'Received'"]));
check('evidence file is real RFC822 content',hasAll(sync,["Utilities.newBlob(raw, 'message/rfc822'","'.eml'","'MIME Type': 'message/rfc822'","'Document Type': 'Email Evidence'"]));
check('evidence file is linked through BO Documents',hasAll(sync,["H38_BO_SHEETS.DOCUMENTS","'Source Type': 'Gmail'","'Source ID': spec.providerMessageId","'Document ID': 'EMAIL-DOC-'","'Document ID': documentId"]));
check('duplicate protection uses Gmail identity',hasAll(sync,['boEmailExistingMessage_(spec.providerMessageId)','boEmailExistingDocument_(spec.providerMessageId)',"'Duplicate Key': 'GMAIL|' + spec.providerMessageId"]));
check('message event records Gmail ID and evidence',hasAll(sync,["'Provider Message ID': message['Provider Message ID']","EMAIL_SENT_CAPTURED","EMAIL_RECEIVED_CAPTURED","boEmailMessageEvent_"]));
check('audit and proof remain active',hasAll(sync,['h38TmAppend_(\'MESSAGES\'',"boProof_('EMAIL CAPTURE'","boError_('Gmail Communications capture'"]));
check('demo evidence backfill uses existing Gmail label',hasAll(sync,["H38_EMAIL_DEMO_LABEL = 'H38 Business Office Demo Evidence'","label:\"' + H38_EMAIL_DEMO_LABEL","boEmailSyncDemoEvidence_"]));
check('recent inbox and sent sync are bounded',hasAll(sync,["in:sent newer_than:30d","in:inbox newer_than:30d","Math.min(Number(options.sentLimit) || 15, 50)"]));
check('recent sync classifies each Gmail message by actual sender',hasAll(web,["function boEmailSyncRecent_(options)","GmailApp.search('in:sent newer_than:30d'", "), '', sentLimit)","per-message direction"]));
check('startup sync is owner-only and non-blocking',hasAll(sync,["h38TmUserRole_(user) !== 'Owner'","boEmailSyncStartupSafe_","return { status: 'HOLD'","externalActionOccurred: false"]));
check('standalone Business Office bootstrap runs safe sync',api.includes('emailSync:boEmailSyncStartupSafe_()'));
check('standalone Business Office exposes manual sync and status',hasAll(api,['emailSync:function()','boEmailSyncRecent_(args)','boEmailSyncDemoEvidence_()','emailSyncStatus:function()']));
check('unified app exposes guarded email sync',hasAll(web,['function h38PortalMessagingSyncEmail','boRequireOwner_()','function h38PortalMessagingEmailStatus']));
check('server blocks SMS decisions and sends for Email evidence',hasAll(web,["existing.Channel !== 'Email'","message.Channel === 'SMS'","Captured email cannot be released through the SMS provider"]));
check('client labels workspace Communications',hasAll(client,["data.definition.title='Communications'","messaging:'Review captured Gmail evidence","Task and Communications access"]));
check('client offers Gmail and evidence actions',hasAll(client,["Sync demo email evidence","Sync recent Gmail","Open Gmail","Open evidence file","h38PortalMessagingSyncEmail"]));
check('client separates Email from SMS controls',hasAll(client,["if(row.Channel==='Email')","Send selected SMS","Email evidence is read-only"]));
check('existing SMS consent and STOP controls remain present',hasAll(sms,['Documented SMS consent is required','h38TmStopWord_','SMS_INBOUND_SYNC']));
const manifestJson=JSON.parse(manifest);
const scopes=manifestJson.oauthScopes||[];
check('Gmail read and send scopes remain explicit',scopes.includes('https://www.googleapis.com/auth/gmail.readonly')&&scopes.includes('https://www.googleapis.com/auth/gmail.send'));
check('Drive scope supports evidence files',scopes.includes('https://www.googleapis.com/auth/drive'));
check('sync never sends or deletes email',!/messages\/send|GmailApp\.sendEmail|moveToTrash|setTrashed\(true\).*Gmail/.test(sync));
check('protected money payroll and tax actions are absent',!/recordPayment|fundPayroll|fileTax|finalizeTax|postJournal/.test(sync+web));

try{
 const changed=cp.execSync('git diff --name-only origin/main...HEAD',{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 const publicTouched=changed.filter(file=>/^(?!apps-script\/|scripts\/|package\.json|\.github\/workflows\/deploy-email-communications-office-only\.yml)/.test(file));
 check('branch changes stay inside Business Office, shared app client, tests, and Office-only deployment workflow',publicTouched.length===0,publicTouched.join(', '));
}catch(error){console.log('INFO: git boundary comparison unavailable in this environment.');}

const result={status:failures.length?'HOLD':'PASS',passes:passes.length,failures};
const out=path.join(root,'artifacts','email-communications-sync');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`\nRESULT: ${result.status} (${passes.length} pass, ${failures.length} fail)`);
process.exit(failures.length?1:0);
