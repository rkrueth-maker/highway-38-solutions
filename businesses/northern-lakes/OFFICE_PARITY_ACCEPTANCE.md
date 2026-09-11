# Shared Office parity — 2026-09-11

Status: Local targeted technical verification PASS; PR CI, production delivery, and physical acceptance pending.
Baseline: `c0fe208c240ef7eb21023a4c0acc0384c78b9703`.

Requested outcome: Preserve H38 Office and bring Northern Lakes through the same current tenant-isolated runtime.
Primary scope: Authenticated web app, shared architecture, reliability, tenant login presentation.
Canonical source owner: commercial-app/supabase-auth.js (membership selection), supabase-startup.js (accepted snapshots), supabase-client-branding.js (branding), customer-readiness-polish.js (Today enhancements), desktop-navigation-authority.js (unchanged navigation).
Data or record impact: No production writes, migration, import, or record deletion.
Security or permission impact: Explicit tenant key must resolve to an active server membership; stale responses and signed-out enhancements must not display another tenant.
External-action impact: None; invitation, sends, payments, activation remain manual and unchanged.
Existing workflow or verifier owner: existing auth runtime, complete Office access, customer readiness, Northern Lakes Business Office and commercial package verifiers; pages-branch-fallback.yml deploys.
Fast checks: plan:change, verify-change-governance, syntax, auth runtime, tenant installer, commercial package, source security.
Expensive or live checks: complete Office access, late auth, warm delivery, employee, quote/document, final polish, desktop/mobile, disposable database isolation; exact merged commit workflows and live delivery.
Rollback boundary: Revert this integrated PR; no data rollback needed.

## Module performance intake
Module/route: shared Office startup, Today, tenant login.
Requested outcome: requested tenant selection, authoritative branding, signed-out state and role-safe polish.
Canonical module contract entry: existing today and shared shell; no module added.
Server owner: existing Supabase business_office_auth_state and RLS, unchanged.
Client owner: canonical sources listed above.
Today-critical or on-demand: startup selection; nonblocking public branding configuration.
Normal first-load limit: unchanged, existing bounded collections.
Data sources and expected reads: existing authentication RPC; one optional static pack fetch for tenant login, no additional RPC.
Cache key and scope: existing authenticated user/business snapshot keys; public branding contains no records or authorization.
Cache TTL: existing authorization TTL unchanged; public pack fetch uses browser revalidation.
Invalidation events: accepted snapshot, auth clear, business switch.
Prefetch priority: no new business-data prefetch.
Cold target: no additional blocking startup work; ordinary route target 2 seconds.
Warm/cached target: existing target 1 second; no stale tenant paint.
Startup RPC impact: zero additional RPCs.
Startup payload impact: zero additional server fields.
Stale-response protection: current user/business snapshot guard; branding only from accepted state.
Previous-workspace loading behavior: retain same-tenant workspace on refresh; clear previous tenant on switch.
External-action impact: none.
Migration/rollback plan: no migration; revert integrated PR.
Verification commands: existing verification scripts listed above and expanded parity regression.
Measured before: live tenant URL rendered Highway 38 login branding; auth source ignores businessKey; readiness renderer inserts Today without user.
Measured after: full shared Office browser regression passes for H38 Owner/Staff and Northern Lakes Owner at 1440, 390, and 320 pixels. Isolated complete-access regression covers Northern Lakes Owner/Administrator/Staff/Viewer. No extra startup RPC; public tenant branding is nonblocking. Production route latency remains unmeasured.

## Demonstrated repairs

- Resolve explicit businessKey only against active server memberships before first snapshot; reject an unassigned key instead of opening saved H38.
- Remove the obsolete listBusinesses selection wrapper from invitation controls.
- Reject cached snapshots for a different explicit tenant.
- Clear prior tenant records while switching; ignore late snapshots after switch/sign-out.
- Brand only accepted snapshots and public entry configuration; preserve diamond logo and Northern Lakes mobile name.
- Remove Today/Quick Create polish while signed out; hide financial summaries from nonfinancial roles and New from viewers.
- Prevent delayed mobile navigation from returning after sign-out.
- Wrap mobile account identity without truncating email/role.
- Restore only Northern Lakes as an additive Pages subtree. Before repair, live owner-access returned HTTP 404 because the workflow deleted all businesses.
- Replace obsolete Apps Script package acceptance with current shared Supabase Office acceptance. Historical source remains retained; no obsolete Office is rebuilt or deployed.

## Local verification

PASS: governance and scoped plan, approved images and placements, unified architecture,
Business Office, H38 access, Supabase auth/source-security/operational contracts,
complete Office access, late-auth navigation, warm-delivery/account identity,
customer readiness, full desktop/mobile navigation at 1440/390/320, employee workspace,
front-to-back quote/document visibility, profitability, commercial system,
Northern Lakes shared Office/commercial package/site-portal/photo-link contracts,
client tenant installer and customer portal security.

The local all-page and Northern Lakes photo sweeps encountered external CDN
ERR_EMPTY_RESPONSE failures. The all-page sweep also reported 26px overflow on
unchanged universal-quote-builder-example.html at 390px. These are not recorded as
PASS. Full PR CI must resolve whether the runner reproduces them; do not weaken checks.
Disposable database RLS verification remains required in PR and merged-main CI.

Current screenshots are generated under artifacts/final-polish/northern-lakes-*.png
by the existing full Office browser verifier; they use fixture data and are not
physical-device acceptance. GitHub workflow artifacts preserve these screenshots.
No production Supabase records, activations, invitations, sends, or payments changed.
