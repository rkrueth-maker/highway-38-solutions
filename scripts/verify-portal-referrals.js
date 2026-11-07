/* Portal referrals (gap3) — contract verifier.
 * Pins the invariants of the feature:
 *  - a referral lands in the SAME booking_requests collection as portal
 *    service requests (no parallel leads store), marked Source
 *    "Portal referral" + Lead Source "Referral", Status new;
 *  - the referring customer comes from the portal SESSION only (the
 *    record's tenant + referrer can never be supplied by the body);
 *  - the referred person is not a customer record ("Customer ID" empty)
 *    and NOTHING is sent to them (no send/invite calls in the action);
 *  - double-submit safe: the record key derives from the client's
 *    one-per-form referral_key and a repeat returns the original;
 *  - portal form + owner inbox labeling + loader pin + version stamp. */
const fs = require('fs');
const edge = fs.readFileSync('supabase/functions/h38-customer-portal/index.ts', 'utf8');
const portal = fs.readFileSync('commercial-app/customer-portal.html', 'utf8');
const inbox = fs.readFileSync('commercial-app/portal-requests.js', 'utf8');
const loader = fs.readFileSync('commercial-app/h38-script-loader.js', 'utf8');
const version = fs.readFileSync('commercial-app/version.json', 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

// Server: the referral action exists behind the session gate.
const actionStart = edge.indexOf('postAction === "submit-referral"');
check(actionStart > edge.indexOf('Session-authenticated customer actions'), 'submit-referral must sit behind the portal session gate');
const action = edge.slice(actionStart, edge.indexOf('postAction === "booking-slots"', actionStart));
// Server: lands in booking_requests with the referral marking.
check(action.includes('collection: "booking_requests"'), 'referral must land in booking_requests (the existing lead/request collection)');
check(edge.includes('const REFERRAL_SOURCE = "Portal referral";'), 'referral source constant missing');
check(action.includes('"Source": REFERRAL_SOURCE'), 'referral record must carry Source = Portal referral');
check(action.includes('"Lead Source": "Referral"'), 'referral record must carry Lead Source = Referral');
check(action.includes('"Status": "New — needs owner review"'), 'referral must arrive as a new request needing owner review');
// Server: referrer + tenant come from the session, never the body.
check(action.includes('"Referred By Customer ID": session.customerKey'), 'referrer must be the session customer');
check(action.includes('business_id: session.businessId'), 'referral tenant must be the session tenant');
check(!/body\.(customer|business)/i.test(action), 'referral action must not read customer/business ids from the body');
check(action.includes('"Customer ID": ""'), 'referred person must not be recorded as an existing customer');
// Server: nothing is sent to the referred person.
check(!action.includes('INVITE_COLLECTION') && !/send-email|send-sms|twilio|resend|mailgun/i.test(action), 'referral action must not send anything to the referred person');
// Server: validation + dedupe.
check(action.includes('Add a phone number or an email'), 'referral must require a phone or an email');
check(action.includes('Tell us what they need done.'), 'referral must require what they need done');
check(action.includes('`REF-${keyRaw.slice(0, 60)}`'), 'record key must derive from the client referral_key');
check(action.includes('duplicate: true'), 'a repeat submit must return the original record as a duplicate');
check(action.includes('PORTAL_REFERRAL_SUBMITTED'), 'referral must write the proof-log entry');
// Portal UI: entry, form, what-happens-next copy, one key per form.
check(portal.includes('Refer a friend'), 'portal must offer a clear Refer a friend entry');
check(portal.includes('id="refName"') && portal.includes('id="refPhone"') && portal.includes('id="refEmail"'), 'referral form must ask for name and phone/email');
check(portal.includes('id="refNeed"'), 'referral form must ask what they need done');
check(portal.includes('id="refNotes"'), 'referral form must offer an optional note');
check(portal.includes('What happens next:'), 'referral form must tell the customer what happens next');
check(portal.includes("api('submit-referral'"), 'portal must submit through the submit-referral action');
check(portal.includes('referral_key:referralKey'), 'portal must send its one-per-form referral key');
check(portal.includes('newReferralKey();') && portal.includes('btn.disabled=true'), 'portal must guard double-taps and rotate the key after success');
// Owner inbox: referral is distinguishable at a glance.
check(inbox.includes('Referred By Customer Name'), 'owner inbox must read the referring customer from the record');
check(inbox.includes('Referral</strong>'), 'owner inbox must label referrals distinctly');
check(inbox.includes("var BUILD = '20261107-gap3-referrals-1';"), 'owner inbox build stamp must be bumped');
// Wiring: loader pin + version stamp.
check(loader.includes("'./portal-requests.js?build=20261107-gap3-referrals-1'"), 'loader pin for portal-requests must be bumped');
check(version.includes('"version": "20261107-polish-a4-portal-1"'), 'version.json stamp must be bumped');

if (failures.length) { console.error(failures.map(x => 'FAIL: ' + x).join('\n')); process.exit(1); }
console.log('Portal referrals contract verified.');
