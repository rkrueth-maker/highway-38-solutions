/* Wider connections (gap6) — contract verifier.
 * Pins the invariants of ITEM 6 on their canonical sources:
 *
 * HALF A — outgoing webhooks ("outgoing webhooks — works with Zapier
 * Catch Hooks and similar tools"):
 *  - owner config is the business_module_settings row
 *    module_key='outgoing_webhooks' written only by owner-controls.js
 *    (server-mirrored canonical toggle shape), with a per-business
 *    secret the owner can view/regenerate and endpoints carrying
 *    url + subscribed events + enabled;
 *  - enqueue is SERVER-SIDE: the h38_webhook_enqueue trigger on
 *    business_records in the migration covers all four events on the
 *    paths that own them (customers INSERT; quotes UPDATE storing
 *    'Signed By Name' — the portal sign-quote write; jobs UPDATE
 *    transitioning to Complete/Completed; payments INSERT, plus
 *    invoices UPDATE to Paid with a 10-minute payment dedupe) and is
 *    exception-safe so a webhook can never block the business write;
 *  - delivery is the h38-webhooks edge function draining
 *    h38_webhook_outbox: HMAC-SHA256 signature header keyed by the
 *    per-business secret, at most 3 attempts, cron drain gated by the
 *    x-h38-nightly-key internal secret, owner actions gated by an
 *    active owner/administrator membership;
 *  - the migration schedules the per-minute pg_cron drain and keeps
 *    the outbox service-role only.
 *
 * HALF B — catalog / price-book search inside the quote builder
 * (commercial-app/app-06.js, the canonical builder):
 *  - the single-price editor carries an in-editor price-book search
 *    (#catalogSearch / #catalogResults) fed by the existing
 *    h38PriceBookFilter (partial name or SKU match over the snapshot);
 *  - one tap adds the line: h38AddCatalogLine builds the exact
 *    price-book line shape (h38ApplyPriceBookPricing pull, priceSource
 *    'Price Book', inventoryItemId set) and re-renders lines + total;
 *    the price-book rail results use the same one-tap add;
 *  - manual line entry is untouched (addQuoteLine unchanged shape).
 *
 * Wiring: loader pins for app-06.js + owner-controls.js and the
 * version.json stamp are checked dynamically (no stale hard-coded
 * stamp), and owner-controls' BUILD matches the stamp. */
const fs = require('fs');
const read = p => fs.readFileSync(p, 'utf8');
const oc = read('commercial-app/owner-controls.js');
const bundle = read('commercial-app/bundle-features.js');
const app06 = read('commercial-app/app-06.js');
const loader = read('commercial-app/h38-script-loader.js');
const version = JSON.parse(read('commercial-app/version.json'));
const fn = read('supabase/functions/h38-webhooks/index.ts');
const mig = read('supabase/migrations/20261107090000_outgoing_webhooks.sql');
const failures = [];
const check = (c, m) => { if (!c) failures.push(m); };

// ---- Half A: owner config (canonical module_settings shape) ----
check(oc.includes("const OUTGOING_WEBHOOKS_KEY='outgoing_webhooks';"), 'owner-controls must use module_key outgoing_webhooks');
check(oc.includes("module_key:OUTGOING_WEBHOOKS_KEY"), 'webhook config must be written to business_module_settings');
check(oc.includes('works with Zapier Catch Hooks and similar tools'), 'UI copy must name the Zapier Catch Hook route exactly');
check(oc.includes("id:'customer.created'") && oc.includes("id:'quote.accepted'") && oc.includes("id:'job.completed'") && oc.includes("id:'invoice.paid'"), 'owner UI must offer all four events');
check(oc.includes('data-webhook-secret') && oc.includes('newWebhookSecret()'), 'owner UI must show the signing secret and support regenerate');
check(oc.includes("invokeWebhooks('test')") && oc.includes("invokeWebhooks('deliveries')"), 'owner UI must wire the test send and the delivery log to the dispatcher');
check(oc.includes('renderOutgoingWebhooksCard') && oc.includes('bindOutgoingWebhooks'), 'webhook card must be rendered and bound in Owner Controls');
check(bundle.includes('renderOutgoingWebhooksCard') && bundle.includes('bindOutgoingWebhooks'), 'bundle-features mirror must carry the webhook card');

// ---- Half A: server-side enqueue (migration + trigger) ----
check(mig.includes('create table if not exists public.h38_webhook_outbox'), 'migration must create the webhook outbox');
check(mig.includes('revoke all on table public.h38_webhook_outbox from anon, authenticated'), 'outbox must be service-role only');
check(mig.includes('create trigger h38_webhook_enqueue_trg'), 'migration must install the enqueue trigger on business_records');
check(mig.includes("new.collection = 'customers'") && mig.includes("'customer.created'"), 'trigger must fire customer.created on customers INSERT');
check(mig.includes("new.payload->>'Signed By Name'") && mig.includes("'quote.accepted'"), 'trigger must fire quote.accepted when a signature is stored (portal sign path)');
check(mig.includes("new.collection = 'jobs'") && mig.includes("'job.completed'"), 'trigger must fire job.completed on the completion transition');
check(mig.includes("new.collection = 'payments'") && mig.includes("new.collection = 'invoices'") && mig.includes("'invoice.paid'"), 'trigger must fire invoice.paid on payment INSERT and on the Paid transition');
check(mig.includes("interval '10 minutes'"), 'invoice.paid must dedupe the Paid transition against a just-recorded payment');
check(mig.includes('exception when others'), 'enqueue trigger must be exception-safe (never blocks the business write)');
check(mig.includes("cron.schedule(") && mig.includes("'h38-webhooks-1m'") && mig.includes('x-h38-nightly-key'), 'migration must schedule the per-minute dispatcher drain with the internal key');

// ---- Half A: dispatcher (edge function) ----
check(fn.includes('X-H38-Signature') && fn.includes('sha256=') && fn.includes('HMAC'), 'dispatcher must send the HMAC-SHA256 signature header');
check(fn.includes('MAX_ATTEMPTS = 3'), 'dispatcher must cap delivery attempts at 3');
check(fn.includes('validSecret') && fn.includes('h38_internal_job_secrets'), 'drain must be gated by the internal job secret');
check(fn.includes('activeOwner') && fn.includes('business_memberships'), 'owner actions must require an active owner/administrator membership');
check(fn.includes('"deliveries"') && fn.includes('"test"') && fn.includes('"drain"'), 'dispatcher must expose drain, test and deliveries actions');
check(fn.includes('webhook.test'), 'test action must send a webhook.test event');
check(!fn.includes('hooks.zapier.com'), 'dispatcher must post only to owner-configured URLs (no hard-coded Zapier endpoint)');
check(fn.includes('access-control-allow-origin') && fn.includes('req.method === "OPTIONS"'), 'dispatcher must answer CORS preflights so the Owner Controls card can call it from the Office origin');

// ---- Half B: catalog search in the quote builder ----
check(app06.includes('id="catalogSearch"') && app06.includes('id="catalogResults"'), 'single-price editor must carry the in-editor catalog search');
check(app06.includes('function renderCatalogResults()'), 'builder must render catalog search results');
check(app06.includes('function h38AddCatalogLine(itemId)'), 'builder must define the one-tap catalog add');
check(app06.includes("priceSource:'Price Book'") && app06.includes('h38ApplyPriceBookPricing'), 'catalog add must build the canonical price-book line with its pricing pull');
check(app06.includes('state.quote.lines.push(line)') && app06.includes('renderQuoteLines();'), 'catalog add must push the line and re-render lines + total');
check(app06.includes('renderCatalogResults();') && app06.includes('h38CatalogSearch.oninput=renderCatalogResults'), 'builder must wire and initially render the catalog search');
check(app06.includes('h38AddCatalogLine(button.dataset.usePrice)'), 'price-book rail results must use the same one-tap add');
check(app06.includes('function addQuoteLine()'), 'manual line entry must remain (no regression)');

// ---- Wiring / stamps (dynamic) ----
check(loader.includes("'./app-06.js?build=" + version.version + "'"), 'loader pin for app-06.js must match the version.json stamp');
check(loader.includes("'./owner-controls.js?build=" + version.version + "'"), 'loader pin for owner-controls.js must match the version.json stamp');
check(oc.includes("const BUILD='" + version.version + "';"), 'owner-controls BUILD must match the version.json stamp');

if (failures.length) { console.error(failures.map(x => 'FAIL: ' + x).join('\n')); process.exit(1); }
console.log('Gap6 connections contract verified (stamp ' + version.version + ').');
