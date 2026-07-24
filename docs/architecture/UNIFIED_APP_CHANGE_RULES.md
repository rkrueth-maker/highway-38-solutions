# Highway 38 Unified Application Change Rules

These rules govern every change or addition to the Highway 38 Business Office, Today workspace, Quote Builder integration, module navigation, H38 AI, shared portal shell, and module API.

They operate under `docs/architecture/WEBSITE_AND_WEB_APP_CHANGE_GOVERNANCE.md`. Complete the combined change intake, complete the module performance intake in `docs/architecture/MODULE_PERFORMANCE_STANDARD.md`, and run `node scripts/verify-change-governance.js` before applying these application-specific rules.

The approved Highway 38 logo is locked. It may not be redrawn, regenerated, recolored, cropped, replaced, approximated, or moved to a substitute asset without Rick’s explicit approval.

## 1. Product architecture

1. There is one authenticated application: **Highway 38 Business Office**.
2. **Today is a workspace inside that application**, not a second Command Center app.
3. The existing Apps Script project, production deployment IDs, URLs, records, roles, permissions, approvals, proof, and customer isolation must be preserved unless Rick explicitly approves a migration.
4. A new route may not create another application shell, another database, or another synchronization requirement.
5. Specialized experiences such as Quote Builder remain workspaces or capability owners inside the unified application.
6. A compatibility product name may remain for migration and packaging, but it may not create another visible product page or navigation system.

## 2. Single sources of truth

| Concern | Required source of truth |
|---|---|
| All module identities, visible routes, labels, icons, groups, gates, dependencies, owners, lifecycle, load strategy, cache policy, schemas, and disable/delete policy | `apps-script/business-office/BusinessOffice_ModuleContract.gs` |
| Business Office API action-to-module permission requirements | `apps-script/business-office/BusinessOffice_ActionContract.gs` |
| Visible navigation generated from the module contract | `apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js` |
| Shared shell and component styling | `apps-script/core-engine/owner-portal-next/Portal_Product_Styles.html` |
| Shared chrome, startup lifecycle, navigation decoration, loading states, and contextual AI entry | `apps-script/core-engine/owner-portal-next/Portal_Product_Client.html` |
| Unified server bootstrap, access filtering, module index, and one-request startup bundle | `apps-script/core-engine/owner-portal-next/Portal_Unified.js` |
| Module-specific data and operations | The declared `serverOwner` and `clientOwner` in the module contract |
| Module performance intake, targets, cache rules, prefetch rules, and evidence | `docs/architecture/MODULE_PERFORMANCE_STANDARD.md` |
| Approved logo bytes and cache authority | `scripts/config/approved-public-assets.json` and the approved repository binary |
| Production deployment | `.github/workflows/deploy-owner-portal-hard-rule-production.yml` |

Do not duplicate any of these concerns in another file.

## 3. Module contract requirements

Every module or capability must declare exactly one contract entry with:

- `module`
- `label`
- `group`
- `type`
- `route` or `visible:false`
- `gate`
- `icon`
- `keywords`
- `dependencies`
- `dataOwner`
- `serverOwner`
- `clientOwner`
- `permissionPolicy`
- `disablePolicy`
- `deletePolicy`
- `loadStrategy`
- `cacheTtlSeconds`
- external-action policy
- record schema when the module owns a Business Office table

No module may be inferred from a filename, hidden hard-coded route, standalone client, or product-pack list.

## 4. Adding a module

A module addition must be delivered as one complete change:

1. Add exactly one entry to `BusinessOffice_ModuleContract.gs`.
2. Add the API action rule to `BusinessOffice_ActionContract.gs` only when the module exposes Business Office API actions.
3. Provide a unique module key and unique visible route.
4. Declare the correct access gate, owners, dependencies, lifecycle, disable policy, load strategy, cache policy, and external-action policy.
5. Complete the performance intake with normal first-load limit, data-read plan, cache key and scope, invalidation events, prefetch priority, cold target, warm/cached target, startup impact, stale-response protection, and rollback plan.
6. Add or extend the declared server and client implementation.
7. Use shared components and tokens from `Portal_Product_Styles.html`.
8. Add contextual H38 AI prompts only through `Portal_Product_Client.html` when shared defaults are insufficient.
9. Add verification for startup, on-demand loading, empty, error, populated, mobile, permission-denied, disabled, dependency, archive, owner-approval, cold-load, warm-load, cache-hit, invalidation, and rapid-click states.
10. Confirm the module performs no external action unless an existing approval-gated workflow explicitly permits it.
11. Deploy only through **Deploy Unified Owner Portal**.

A module is not complete when only its navigation button, schema, empty screen, compatibility name, or API method exists.

## 5. Changing a module

1. Change identity, route, label, location, icon, gate, dependency, owner, schema, lifecycle, or load policy only in the canonical module contract.
2. Change API permission requirements only in the action contract.
3. Change module-specific behavior in the declared module implementation.
4. Change shared visual behavior only in the product design system.
5. Change shared shell/startup behavior only in the product client and unified bootstrap.
6. Do not add page-specific global CSS overrides to fix a shared component.
7. Do not use a `MutationObserver` as a substitute for changing the real renderer when the renderer is owned by this repository.
8. Do not create a second toolbar, search box, AI launcher, loading system, router, startup system, or navigation tree.
9. Preserve record IDs, audit history, approvals, permissions, and backwards-compatible links.
10. Retire old routes with deterministic redirects to the current workspace.
11. Remove obsolete files and references in the same change after verification passes.
12. Re-measure every changed route and record cold, warm, and cached timing when rendering, data reads, startup, caching, prefetch, or shared clients change.

## 6. Disabling or deleting a module

1. Default behavior is **soft-disable and preserve records**.
2. Essential modules marked `disablePolicy:'required'` may not be disabled.
3. Dependencies must be resolved before disabling a module; automatic cascade requires explicit owner confirmation.
4. Navigation and new-record creation may stop, but existing records, Proof Log, Error Log, audit history, backups, and permissions remain available.
5. Destructive deletion requires a separately approved migration, backup, evidence report, and rollback plan.
6. Compatibility aliases may redirect to a current workspace but may not restore a retired shell or product page.

## 7. Performance rules

1. The shell startup budget is **one browser-to-server startup RPC** through `h38PortalStartupBundle`.
2. Static module contracts, schema projections, spreadsheet handles, role results, installation status, and repeated safe reads must be reused within the Apps Script execution.
3. Secondary and administrative modules use `loadStrategy:'on-demand'` and must not block Today or the requested route.
4. H38 AI loads after the shell and must not block the initial workspace.
5. Do not perform duplicate bootstrap, schema, navigation, role, module, saved-view, spreadsheet-open, or entity-list requests.
6. Use explicit render lifecycle hooks and `requestAnimationFrame`, not page-wide DOM observers.
7. A module must declare a cache TTL even when the correct value is zero.
8. Ordinary unfiltered list opens are bounded to 50 visible records or fewer unless a larger limit is justified and verified.
9. Full sheet or table scans are reserved for explicit search, filter, export, reconciliation, report, or audit work.
10. Cache keys for private data must be scoped by user, business, and epoch/version; every affected write must invalidate browser and server caches.
11. Repeated requests for the same route and options reuse one in-flight promise or safe request-scoped result.
12. Older responses may not overwrite a newer route selection.
13. The previous workspace remains visible while the requested route loads; blank loading screens are not accepted.
14. Prefetch is read-only, prioritizes the next three likely routes, remains capped, and populates the same cache used by a direct click.
15. Do not prefetch every route at startup or place expensive routes ahead of likely routes in one sequential batch.
16. Performance evidence must record startup time and payload when affected, cold route timing, warm/cached timing, endpoint/read counts, cache behavior, rapid-click behavior, desktop, and mobile.
17. Cached or already-prefetched routes target one second or less; ordinary first loads target two seconds or less; heavy report or administration routes target four seconds or less or must use progressive results with a documented reason.
18. A startup regression greater than 10 percent or 500 milliseconds, whichever is larger, requires a written reason, compensating improvement, rollback plan, and Rick's approval.
19. A performance change is incomplete unless verification confirms one startup RPC, deferred secondary modules, bounded first reads, in-flight reuse, scoped cache invalidation, stale-response protection, and no external action.

## 8. Visual and interaction rules

1. One top bar: Search, New, relevant quick action, refresh, system status, and H38 AI.
2. One left navigation generated from the contract.
3. One shared dark product language across all workspaces.
4. Every workspace supports desktop and mobile without a separate mobile application.
5. Loading states use the shared skeleton system while preserving the previous workspace during route transitions.
6. Empty states explain what belongs there and offer one useful next action.
7. Errors state that no record or external system was changed.
8. Forms use shared fields, validation, button hierarchy, and approval language.
9. Tables use shared headers, row actions, responsive cards, and accessible labels.
10. H38 AI is contextual to the current workspace and may prepare actions, but external execution remains approval gated.
11. Avoid decorative clutter, repeated warnings, duplicated headings, and large unused blank areas.
12. The approved logo is never altered by a UI rebuild.
13. A click must show visible feedback immediately without clearing usable content.

## 9. Data and safety rules

1. External actions remain disabled or explicitly owner approved.
2. No automatic customer send, payment, purchase, payroll funding, tax filing, publishing, ad spend, SMS, deployment, or destructive action may be introduced silently.
3. Role and customer isolation checks are mandatory.
4. Selected-record actions may not become bulk actions without an explicit design and approval gate.
5. New fields require a migration/default strategy and must not corrupt existing rows.
6. Deletion defaults to archive or soft-delete behavior when records have audit value.
7. AI output is advisory or draft output until approved through the appropriate workflow.
8. Proof Log and Error Log behavior must remain available.
9. Cached or prefetched data may not bypass current role, module, user, or business access checks.

## 10. Required verification

Before production deployment, the change must pass:

```bash
node scripts/verify-change-governance.js
node scripts/verify-unified-app-architecture.js
node scripts/verify-product-pack-architecture.js
node scripts/verify-owner-portal-routing.js
node scripts/verify-owner-portal-next.js
node scripts/verify-owner-portal-hard-rule.js
node scripts/verify-business-office.js
node scripts/verify-unified-client-routing-runtime.js
node scripts/verify-navigation-cache-performance.js
node scripts/verify-whole-navigation-performance.js
node scripts/verify-cold-load-cache-prefetch.js
node scripts/verify-task-messaging-hardening.js
node scripts/verify-customer-portal-security.js
```

Visual changes that touch public assets must also pass:

```bash
python3 scripts/verify-public-images.py
node scripts/verify-public-image-placements.js
```

Production is not complete until **Deploy Unified Owner Portal** reports PASS for the exact source commit and confirms the existing Apps Script deployment was updated in place.

## 11. Definition of done

A change is done only when:

- the combined governance and module performance intake are complete;
- the canonical contract, action contract, packs, permissions, route, schema, and implementation agree;
- the module is usable from the unified shell;
- startup remains one RPC and secondary modules remain on demand;
- ordinary first reads are bounded and duplicate requests are reused;
- cache scope, TTL, epoch, and invalidation are correct;
- stale responses cannot overwrite the active route;
- the previous workspace remains visible while another route loads;
- cold, warm, and cached timings are recorded and meet targets or have an explicitly approved exception;
- desktop and mobile states are polished;
- contextual AI is present without duplicate launchers;
- loading, empty, populated, error, permission, dependency, disabled, and archive states work;
- external actions remain locked or approval gated;
- obsolete routes/files are removed or redirected;
- automated verification passes;
- the exact commit is deployed and recorded;
- the approved logo is unchanged.
