# PR: SMS provider picker — all three providers + phone-bridge active sender

## Summary
Ricky's decisions (2026-10-04): (1) offer ALL THREE SMS providers (Telnyx,
Twilio, Plivo) in Office SMS settings, each prompting for its own account
credentials; (2) the ACTIVE sender for now is his personal cell phone —
providers stay set-up-ready options.

## What changed (5 files, +481/−10)
- **New `commercial-app/sms-provider-setup.js`** — provider catalog with
  per-message cost notes (Telnyx ~$0.007–0.009, Twilio ~$0.011–0.015, Plivo
  ~$0.011–0.013); active-sender selection persisted to
  `business_module_settings` (module_key=`sms_sender`), default
  `phone-bridge`; provider setup card for the Messages SMS tab.
- **`commercial-app/sms-provider.js`** — `sendSms()` records the active
  sender on queued threads so the approved executor routes phone-bridge
  sends to the paired phone and provider sends to h38-send-sms; trigger/UI
  drafts still queue for owner approval (Kit-through preserved); `smsReady()`
  now reports `activeSender`.
- **`commercial-app/app-09.js`** — setup card + ACTIVE sender banner on the
  Messages SMS tab; binds setup UI.
- **`commercial-app/index.html`** — script tag for sms-provider-setup.js.
- **`scripts/verify-sms-provider-setup.js`** — 40/40 pass.

## Credential security (hard rule, enforced)
- NO credential `<input>` fields anywhere in the client.
- NO secret values in `business_records`, localStorage, or client code.
- "Set up with Kit" submits `ai_handoff_tasks` (`sms_provider_setup`) with
  key NAMES only. Kit collects credentials via the secure entry flow and
  stores them as `h38-send-sms` edge-function secrets via the Management API.
- Full flow documented in code comments at the top of sms-provider-setup.js.

## Module intake (existing module — Messages/Owner Controls, no new route)
- Module/route: Messages → Customer texting (existing); Settings → Owner Controls (existing)
- Requested outcome: provider picker + active sender selection
- Canonical module contract entry: n/a (no new module)
- Server owner: h38-send-sms edge function (unchanged); Client owner: H38SmsSetup
- Today-critical or on-demand: on-demand (Messages page)
- Data sources: business_module_settings (1 row read), providers collection (existing read), ai_handoff_tasks (1 insert on setup request)
- Cache: snapshot.moduleSettings (existing); localStorage offline fallback
- Invalidation: setActiveSender upsert
- No external action: nothing sends without owner approval (unchanged)

## Verification
- `node scripts/verify-sms-provider-setup.js` — 40/40 pass
- `node scripts/verify-business-office.js` — 225/225 pass
- `node scripts/verify-unified-app-architecture.js` — 0 failures
- `npm run plan:change` — PASS; `verify-change-governance.js` — 0 failures
- `node --check` clean on all touched JS

## Manual check (owner)
1. Messages → SMS tab → "Texting provider" card shows ACTIVE: My cell phone (interim).
2. Click "Set up with Kit" on Telnyx → toast confirms; ai_handoff_tasks row created (no secrets).
3. After Kit connects a provider, its card offers "Make active".

## Do NOT merge
Ricky approves all merges.
