'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const files={index:read('commercial-app/index.html'),customer:read('commercial-app/customer-readiness-polish.js'),phone:read('commercial-app/phone-first-office.js'),meeting:read('commercial-app/conversation-meeting-assistant.js'),upload:read('commercial-app/smart-upload.js'),workflow:read('.github/workflows/highway38-final-polish.yml'),docs:read('docs/acceptance/H38_FINAL_REAL_LIFE_ACCEPTANCE.md')};
const checks={
 'Customer 360 only':files.customer.includes('customer360Only:true')&&!files.customer.includes('customerCardsPinnedBottom:true'),
 'no customer layout observer':!files.customer.includes('new MutationObserver'),
 'phone safe zone':files.phone.includes('--h38-bottom-ui-clearance:calc(172px')&&files.phone.includes('@media(max-width:340px)')&&files.phone.includes('font-size:11px!important')&&files.phone.includes('universalBottomSafeZone:true')&&files.phone.includes('floatingCreateAvoidsCaptureControls:true'),
 'Smart Upload loaded':files.index.includes('smart-upload.js?build=20260920-final-real-office-1')&&files.index.includes('smart-upload.css?build=20260920-final-real-office-1'),
 'Smart Upload confirms ambiguity':files.upload.includes('requiresConfirmation')&&files.upload.includes('Confirm & save privately')&&files.upload.includes('retainsOriginal:true')&&files.upload.includes('contentAwareClassification:true'),
 'Meeting Report standard':files.meeting.includes('meetingReportHtmlV2')&&['Meeting Summary','Customer Information','Property / Job Information','Work Requested','Measurements / Details','Decisions','Additional Work Discussed','Customer Commitments','H38 Commitments','Open Questions','Follow-Up','Quote / Change Requirements','Attached Evidence'].every(x=>files.meeting.includes(x)),
 'context continuity in final gate':files.workflow.includes('verify-context-continuity.js')&&files.workflow.includes('verify-context-continuity-browser.js'),
 'visual matrix in final gate':files.workflow.includes('verify-final-95-acceptance-browser.js')&&files.workflow.includes('artifacts/final-95'),
 'durable playbook':files.docs.includes('Pine Ridge Test Customer')&&files.docs.includes('Cleanup')
};
const failed=Object.entries(checks).filter(([,ok])=>!ok);console.log(JSON.stringify({status:failed.length?'HOLD':'PASS',checks,failed:failed.map(([name])=>name)},null,2));process.exit(failed.length?1:0);
