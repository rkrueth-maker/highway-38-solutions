# Highway 38 Module Performance Standard

This standard applies to every new or changed Highway 38 Business Office module, route, form, dashboard, API action, shared client, server service, workflow, verifier, and reusable business pack.

It supplements `AGENTS.md`, `WEBSITE_AND_WEB_APP_CHANGE_GOVERNANCE.md`, and `UNIFIED_APP_CHANGE_RULES.md`. It may not weaken authentication, authorization, business isolation, records, IDs, approvals, Proof Log, Error Log, backups, audit history, existing deployment IDs, or external-action locks.

## 1. Performance is part of the design

Performance decisions must be made before implementation, not added after the module is complete.

Every module change must identify:

- the requested route and canonical module key;
- whether it is required for Today or is secondary/on-demand;
- its server and client owner;
- its normal first-load record count;
- its data sources and expected read count;
- its cache key, scope, TTL, and invalidation events;
- its prefetch priority, if any;
- its cold-load, warm-load, and cached-load targets;
- its failure, stale-request, and rollback behavior.

## 2. Startup rules

1. The authenticated shell keeps one browser-to-server startup RPC through `h38PortalStartupBundle`.
2. A new module must not add data-heavy work to startup unless the route is required to render Today and the change is explicitly approved.
3. Calendar, reports, logs, configuration details, integrations, Growth, Office administration, and other secondary surfaces load on demand or through nonblocking prefetch.
4. Startup payload fields must be necessary for the first requested workspace. Optional records, full lists, and secondary summaries are deferred.
5. Startup phase time and payload size must be measured before and after a shared-shell or bootstrap change.
6. A startup regression greater than 10 percent or 500 milliseconds, whichever is larger, requires a written reason, compensating improvement, and Rick's approval.

## 3. Module loading rules

1. New modules default to `loadStrategy:'on-demand'`.
2. The current workspace remains visible while another route loads. Do not replace it with a blank page.
3. A route change must use the shared route token or equivalent canonical stale-response guard so an older request cannot overwrite a newer click.
4. Repeated requests for the same route and options must reuse one in-flight promise.
5. Returning to a recently rendered route should use the shared rendered-surface cache when safe.
6. Loading, refresh, empty, error, disabled, permission-denied, and dependency states must use the shared shell and remain usable on desktop and mobile.
7. Page-wide `MutationObserver` cleanup layers are prohibited when the source renderer can be corrected directly.

## 4. Data-read rules

1. Ordinary unfiltered list opens default to no more than 50 visible records unless the module contract documents a smaller or justified larger limit.
2. Do not read an entire sheet or table for an ordinary first render when a bounded range read can provide the requested records.
3. Full scans are reserved for explicit search, filter, export, reconciliation, report, or audit operations that require them.
4. Business ID, void/archive state, role access, and permission filtering must remain correct when reads are bounded or cached.
5. Spreadsheet handles, installation status, schema projections, role lookups, module definitions, and repeated entity reads must be reused within the same Apps Script execution.
6. A server endpoint may not repeat work already present in the startup payload, Today projection, or another safe request-scoped result.

## 5. Cache rules

Every cacheable module must declare and document:

- cache owner;
- cache key inputs;
- user and business scope;
- cache epoch or version;
- TTL in seconds;
- whether rendered HTML, server data, or both are cached;
- all write actions that invalidate it;
- dependent routes that must also be invalidated.

Rules:

1. Cache keys must prevent cross-user and cross-business data exposure.
2. A cache TTL must be declared even when the correct value is zero.
3. Saves, uploads, approvals, task changes, messages, imports, and other writes invalidate affected browser and server caches.
4. Cached data may not bypass current role, module, or business access checks.
5. Cache failures fall back safely to the canonical data source; they do not enable an external action.

## 6. Prefetch rules

1. Prefetch is read-only and must never trigger a customer send, payment, publication, deployment, destructive action, or other external side effect.
2. Prefetch the next three most likely routes individually so a click can join the exact in-flight request.
3. Lower-priority batch prefetch remains capped and must not delay the current route.
4. Do not prefetch every module at startup.
5. Expensive routes must not sit ahead of likely routes in a sequential batch.
6. A prefetched route must populate the same canonical cache used by a direct click.

## 7. Release targets

These are production acceptance targets for repository-controlled work. Apps Script platform cold-start time is recorded separately and may not be hidden inside module timing.

| Interaction | Target |
|---|---:|
| Visible response to a click | 100 ms or less |
| Cached or already-prefetched route | 1 second or less |
| Ordinary first module load | 2 seconds or less |
| Heavy report, audit, or administration route | 4 seconds or less, or progressive results with a documented reason |
| Warm startup regression | No more than 10 percent or 500 ms without approval |
| New browser-to-server startup RPCs | 0 |

A route that misses its target must include the measured cause, mitigation, owner decision, and rollback path in the pull request.

## 8. Required performance evidence

For any authenticated app or module change, record:

1. exact source commit;
2. production or representative data size;
3. startup server elapsed time and payload size when startup is affected;
4. cold first-open timing for each changed route;
5. warm/cached timing for each changed route;
6. read count or endpoint count when data access changed;
7. cache hit/miss and invalidation behavior;
8. rapid-click stale-response test;
9. desktop and mobile results;
10. confirmation that no external action occurred.

Use the shared route timing attributes and `h38NavigationPerformanceSnapshot()` when available. Test one cold open, two warm passes, and a rapid navigation pass through every changed route.

## 9. Required module intake form

Copy this block into the issue, handoff, or pull request before building:

```text
Module/route:
Requested outcome:
Canonical module contract entry:
Server owner:
Client owner:
Today-critical or on-demand:
Normal first-load limit:
Data sources and expected reads:
Cache key and scope:
Cache TTL:
Invalidation events:
Prefetch priority:
Cold target:
Warm/cached target:
Startup RPC impact:
Startup payload impact:
Stale-response protection:
Previous-workspace loading behavior:
External-action impact:
Migration/rollback plan:
Verification commands:
Measured before:
Measured after:
```

No field may be silently omitted. Use `Not applicable` with a reason when a field does not apply.

## 10. Definition of done

A module or shared app change is not complete until:

- the canonical contract declares load strategy and cache TTL;
- startup remains one RPC;
- optional work is deferred;
- ordinary first reads are bounded;
- duplicate and in-flight requests are reused;
- stale requests cannot overwrite the active route;
- the current workspace remains visible while loading;
- cache scope and invalidation are verified;
- cold and warm timings are recorded;
- performance targets pass or an explicit approved exception is documented;
- all existing security, data, approval, proof, error, backup, and deployment controls remain intact;
- scope-relevant automated and browser verification passes.
