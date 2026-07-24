## Requested outcome

Describe the user-visible result and why this change is needed.

## Scope classification

- [ ] Public website
- [ ] Authenticated Business Office
- [ ] Customer Portal/security boundary
- [ ] Shared architecture
- [ ] Performance and reliability

## Canonical ownership

- Module/route/page:
- Canonical contract or registry:
- Server owner:
- Client owner:
- Data owner:
- Deployment workflow:

## Architecture and safety

- [ ] I changed the canonical source instead of adding a second shell, router, navigation tree, startup system, loading system, schema, module list, action list, data owner, or synchronization layer.
- [ ] Existing authentication, roles, permissions, business/customer isolation, records, IDs, approvals, Proof Log, Error Log, backups, and audit history are preserved.
- [ ] External actions remain disabled or use an existing explicit Owner-approval gate.
- [ ] Existing Apps Script project and deployment IDs are preserved.
- [ ] Migration and rollback behavior is documented where data or schema changed.

## Performance design

Complete this section for every authenticated app, module, route, form, API, shared client, or server change. Use `Not applicable` with a reason rather than leaving a field blank.

- Today-critical or on-demand:
- Normal first-load limit:
- Data sources and expected reads:
- Cache key and user/business scope:
- Cache TTL:
- Cache invalidation events:
- Prefetch priority:
- Startup RPC impact:
- Startup payload impact:
- Cold-load target:
- Warm/cached target:
- Stale-response protection:
- Previous-workspace loading behavior:

### Required performance checks

- [ ] No new browser-to-server startup RPC was added.
- [ ] Secondary or administrative data is deferred from startup.
- [ ] Ordinary unfiltered list opens are bounded, normally to 50 visible records or fewer.
- [ ] Full scans occur only for explicit search, filter, export, reconciliation, report, or audit work.
- [ ] Repeated requests reuse request-scoped data or one in-flight promise.
- [ ] Cache keys are scoped by user and business where private data is involved.
- [ ] All affected writes invalidate browser and server caches.
- [ ] A stale response cannot overwrite a newer route selection.
- [ ] The previous workspace remains visible while the new route loads.
- [ ] Prefetch is read-only, capped, prioritized, and uses the same cache as a direct click.
- [ ] No page-wide `MutationObserver` was added to repair repository-owned rendering.

## Measured evidence

- Exact tested commit:
- Representative data size:
- Startup before/after:
- Startup payload before/after:
- Cold route timings:
- Warm/cached route timings:
- Endpoint/read counts before/after:
- Cache hit/miss and invalidation result:
- Rapid-click stale-response result:
- Desktop result:
- Mobile result:
- External actions observed: None / explain

Any missed target must include the cause, mitigation, Rick's decision, and rollback path.

## Verification

- [ ] `node scripts/verify-change-governance.js`
- [ ] Scope-relevant structural and syntax checks
- [ ] Scope-relevant Business Office, Owner Portal, Customer Portal, or public-site checks
- [ ] Desktop and mobile browser verification when UI behavior changed
- [ ] Exact production workflow verified the merged commit when deployment is required

## Files and obsolete behavior

List important files changed, old routes or duplicate logic removed, compatibility redirects retained, and any intentionally deferred work.
