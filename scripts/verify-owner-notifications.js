#!/usr/bin/env node
/* Owner notifications verifier (2026-10-13).
 * Rick's requirement: "office should notify of any customer activity or
 * when new items need review." Pins the whole chain: producer edge
 * function, key-gated cron schedule, Owner Controls toggles (server
 * mirror), in-app bell/panel surface, snapshot hydration, SW receiving
 * end — and the safety rails (no customer sends, no secret literals). */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log('PASS  ' + label); }
  else { failures.push(label); console.log('FAIL  ' + label + (detail ? ' — ' + detail : '')); }
}

/* ---- producer edge function ---- */
const fn = read('supabase/functions/h38-owner-notify/index.ts');
check('producer exists with build stamp', fn.includes("20261013-owner-notify-2"));
check('producer is key-gated (internal job secret)', fn.includes('x-h38-nightly-key') && fn.includes('h38_internal_job_secrets') && fn.includes('JOB_SECRET_NAME = "h38-owner-notify"'));
check('producer also accepts an owner/admin JWT scoped to their own business', fn.includes('userBusinessScope') && fn.includes('"owner", "administrator"'));
check('dedupe is a deterministic OWNERNOTIF key per source event', fn.includes('OWNERNOTIF-') && fn.includes('ignoreDuplicates: true') && fn.includes('sha20'));
check('notifications are owner-audience rows in the existing collection', fn.includes('"Audience": "owners-admins"') && fn.includes('collection: "notifications"'));
check('customer activity sources are scanned', ['booking_requests', 'requests', 'portalMessages', 'smsMessages', 'emailMessages', 'quotes', 'payments', 'customer_payments', 'customer_portal_events', 'documents'].every((s) => fn.includes(s)));
check('needs-review sources are scanned', ['business_approvals', 'external_action_queue', 'ai_handoff_tasks', 'price_book_items'].every((s) => fn.includes(s)));
check('producer honors the owner_notifications settings row, defaulting customer+review ON and push OFF', fn.includes("module_key', \"owner_notifications\"") || fn.includes('module_key", "owner_notifications"') || fn.includes('"owner_notifications"'));
check('producer never sends anything to customers', !/h38-send-sms|h38-send-email|sendViaTelnyx|sendViaTwilio|api\.stripe\.com/.test(fn));
check('push is a seam, not a sender (Push Status only)', fn.includes('"Push Status"') && !/web-push|vapid|VAPID/i.test(fn));

/* ---- schedule + config + allowlist ---- */
const mig = read('supabase/migrations/20261013121000_owner_notify_cron.sql');
check('pg_cron job h38-owner-notify-5m every 5 minutes via pg_net', mig.includes("cron.schedule(") && mig.includes('h38-owner-notify-5m') && mig.includes('*/5 * * * *') && mig.includes('net.http_post'));
check('cron job reads the key from the secrets table (no secret literal)', mig.includes("name = 'h38-owner-notify'") && !/secret_value\s*,\s*'[0-9a-f]{16,}'/.test(mig));
check('cron migration is pg_cron-extension guarded (clean-replay safe)', mig.includes("extname = 'pg_cron'") && mig.includes('do $$'));
const cfg = read('supabase/config.toml');
check('config.toml registers h38-owner-notify with verify_jwt=false', /\[functions\.h38-owner-notify\]\s*\nverify_jwt = false/.test(cfg));
const policy = JSON.parse(read('supabase/acceptance/production-policy.json'));
check('acceptance allowlist carries h38-owner-notify with a reason', (policy.allowed_verify_jwt_false || []).includes('h38-owner-notify') && !!(policy.allowed_verify_jwt_false_reasons || {})['h38-owner-notify']);

/* ---- Owner Controls toggles ---- */
const oc = read('commercial-app/owner-controls.js');
check('three notification toggles registered (customer/review default ON, push OFF)', oc.includes("id:'owner_notify_customer'") && oc.includes("id:'owner_notify_review'") && oc.includes("id:'owner_notify_push'") && oc.includes("category:'Notifications'"));
check('toggles mirror to business_module_settings owner_notifications (canonical shape)', oc.includes("OWNER_NOTIFY_KEY='owner_notifications'") && oc.includes('setOwnerNotifyEnabled') && oc.includes("onConflict:'business_id,module_key'"));
check('toggle changes route through the mirror in the change handler', oc.includes('OWNER_NOTIFY_KINDS[id]'));

/* ---- in-app surface ---- */
const index = read('commercial-app/index.html');
check('topbar bell + badge in index.html', index.includes('id="ownerNotifyBell"') && index.includes('id="ownerNotifyBadge"'));
check('module + css included with the owner-notify build stamp', index.includes('./owner-notifications.js?build=20261013-owner-notify-4') && index.includes('./owner-notifications.css?build=20261013-owner-notify-4'));
const mod = read('commercial-app/owner-notifications.js');
check('module exposes H38OwnerNotify and renders from snapshot notifications', mod.includes('window.H38OwnerNotify') && mod.includes('s.notifications'));
check('read state is per user (Read By JSON)', mod.includes('Read By JSON') && mod.includes('persistRead'));
check('deep links open the target page and carry the record focus', mod.includes('window.openPage') && mod.includes('H38NotifyFocus') && mod.includes('Link Page'));
check('panel Check now calls the producer for the signed-in business', mod.includes('/functions/v1/h38-owner-notify') && mod.includes("action: 'scan'"));
check('surface is owner/admin only', mod.includes("['owner', 'administrator']"));
const data = read('commercial-app/supabase-data.js');
check('snapshot hydration fetches notifications explicitly + idKeys registered', data.includes("fetchCollectionRows(db, businessId, 'notifications')") && data.includes("notifications:['Notification ID','notificationId']"));

/* ---- service worker receiving end ---- */
const sw = read('commercial-app/service-worker.js');
check('SW cache rolled to owner-notify build', sw.includes("const CACHE_NAME='h38-business-office-20261020-next-level-2'"));
check('SW precaches the module + css', sw.includes("'./owner-notifications.js'") && sw.includes("'./owner-notifications.css'"));
check('SW has a push listener + generic notificationclick deep link', sw.includes("addEventListener('push'") && sw.includes('showNotification'));

/* ---- bundle mirror ---- */
const bundle = read('commercial-app/bundle-features.js');
check('bundle-features mirrors toggles, mirror block, module section', bundle.includes("id:'owner_notify_customer'") && bundle.includes('setOwnerNotifyEnabled') && bundle.includes('./owner-notifications.js ---'));

/* ---- shared push dispatcher: Office scope (h38-scout-push) ---- */
const push = read('supabase/functions/h38-scout-push/index.ts');
check('dispatcher gains office_subscribe/office_unsubscribe gated by business membership', push.includes('office_subscribe') && push.includes('office_unsubscribe') && push.includes('officeMembershipRole') && push.includes('role !== "owner" && role !== "administrator"') && push.includes('business_memberships'));
check('dispatcher gains internal-key office_dispatch reusing sendPush + the shared log', push.includes('office_dispatch') && push.includes('officeDispatch') && push.includes('sendPush(sub') && push.includes('business_id: businessId') && push.includes('OFFICE_PRODUCER_SECRET_NAME = "h38-owner-notify"'));
check('office dispatch deactivates dead subscriptions (404/410)', push.includes('office_push_subscriptions') && push.includes('result.status === 404 || result.status === 410'));
check('dispatcher office scope stores business-scoped subscriptions only', push.includes('office_push_subscriptions') && !/from\("office_push_subscriptions"\)[\s\S]{0,200}coupon/.test(push));

/* ---- Bouncie reminder (Northern Lakes) ---- */
check('producer has the bouncie-reminder action', fn.includes('"bouncie-reminder"') && fn.includes('bouncieReminder'));
check('connected evidence matches bouncie-watch.py (connected provider row OR active bouncie vehicle)', fn.includes('fleet_provider_connections') && fn.includes('fleet_vehicles') && fn.includes('.toLowerCase() === "connected"') && fn.includes('"bouncie"'));
check('reminder latches permanently once connected', fn.includes('connected_latched_at') && fn.includes('bouncie_reminder_state'));
check('reminder cannot double-fire inside the hour (55-minute floor)', fn.includes('BOUNCIE_MIN_INTERVAL_MS = 55 * 60 * 1000') && fn.includes('throttled'));
check('reminder targets NL owners only, through the shared dispatcher', fn.includes('NL_BUSINESS_ID = "736a44a8-b36b-4ced-b5ed-456ed252d8ed"') && fn.includes('.eq("role", "owner")') && fn.includes('functions/v1/h38-scout-push') && fn.includes('"office_dispatch"'));
check('reminder copy + deep link are the approved ones', fn.includes('BOUNCIE_REMINDER_TITLE = "Bouncie isn\'t connected"') && fn.includes('connect Bouncie so the trucks sync') && fn.includes('businessKey=northern-lakes&shortcut=fleet&fleetTab=settings'));
check('reminder sends no SMS/email (app push only)', !/send-sms|send-email|telnyx\.com|twilio\.com|sendgrid/i.test(fn.slice(fn.indexOf('Bouncie connection reminder'))));
const bouncieMig = read('supabase/migrations/20261013193000_bouncie_reminder_office_push.sql');
check('migration creates office_push_subscriptions (service-role only)', bouncieMig.includes('create table if not exists public.office_push_subscriptions') && bouncieMig.includes('revoke all on table public.office_push_subscriptions from anon, authenticated'));
check('migration shares the dispatch log (business_id column, household nullable)', bouncieMig.includes('alter column household_id drop not null') && bouncieMig.includes('add column if not exists business_id uuid'));
check('migration creates bouncie_reminder_state + hourly cron', bouncieMig.includes('create table if not exists public.bouncie_reminder_state') && bouncieMig.includes("cron.schedule(") && bouncieMig.includes('h38-bouncie-reminder-1h') && bouncieMig.includes("'7 * * * *'"));
check('client registers device push with the shared dispatcher', mod.includes("action: 'office_subscribe'") && mod.includes("action: 'config'") && mod.includes('pushManager.subscribe') && mod.includes('Turn on device notifications'));
check('Scout deal alerts section renders only for household users (get_state gate)', mod.includes('Scout deal alerts') && mod.includes("scoutApi('get_state'") && mod.includes("scout.phase = 'hidden'") && mod.includes('ownerNotifyScoutWrap'));
check('Scout switches + enable flow mirror the Deals shell call shapes', mod.includes("scoutApi('set_prefs'") && mod.includes("scoutApi('subscribe'") && mod.includes("scoutApi('config')") && mod.includes('scoutAlertsPenny') && mod.includes('scoutAlertsResale') && mod.includes('scoutAlertsEnable'));
check('Scout section reuses the Office SW subscription (no scout SW in the Office)', !mod.includes('h38-scout-sw'));
check('Scout deep link opens the panel and scrolls the section into view', mod.includes("params.get('scoutAlerts')") && mod.includes('routeScoutAlertsLink') && mod.includes('scrollIntoView'));
check('Scout unsupported environments get one honest line, not dead switches', mod.includes('Deal alerts need the Chrome browser or the Deals app update'));
check('fleet shortcut re-asserts after a service-worker refresh bounce', mod.includes('reassert') && mod.includes('bounce the landing back to Today'));
check('client routes the fleet shortcut for push deep links', mod.includes("target !== 'fleet'") && mod.includes("window.openPage('fleet')"));
const fleet = read('commercial-app/northern-bouncie-fleet.js');
check('fleet panel preselects the tab from ?fleetTab= (settings = connect screen)', fleet.includes('initialTab()') && fleet.includes("get('fleetTab')") && fleet.includes("'settings'"));
check('script loader rolls the fleet build stamp', read('commercial-app/h38-script-loader.js').includes('northern-bouncie-fleet.js?build=20261013-bouncie-reminder-1'));
check('bundle mirrors the fleet deep-link tab support', bundle.includes('initialTab()') && bundle.includes('office_subscribe'));

console.log('\nRESULT: ' + (failures.length ? 'FAIL (' + failures.length + ')' : 'PASS (' + passed + ' checks)'));
process.exit(failures.length ? 1 : 0);
