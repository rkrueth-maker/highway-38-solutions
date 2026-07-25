# AGENTS.md

## Repository-wide authority

These rules apply to **every chat, agent, branch, pull request, direct commit, automation, module, application, and public website change** in this repository. A narrower handoff may add restrictions, but it may not silently weaken these rules.

The approved Highway 38 logo is locked. Existing approved website images are also locked to their exact repository files and approved placements. Do not replace, regenerate, restyle, recrop, reorder, or move them unless Rick explicitly approves the change or the current placement is objectively broken or clearly unrelated to the surrounding content.

## Mandatory change intake

Before adding, changing, disabling, deleting, or deploying any website or web-app behavior:

1. Read `docs/architecture/WEBSITE_AND_WEB_APP_CHANGE_GOVERNANCE.md`.
2. Read `docs/architecture/FAST_RELIABLE_CHANGE_PROCESS.md` and use its staged execution path.
3. For any authenticated app, module, route, form, API, shared client, or server change, also read `docs/architecture/MODULE_PERFORMANCE_STANDARD.md` and complete its module intake form.
4. Classify the scope as public website, authenticated web app, Customer Portal/security boundary, shared architecture, performance and reliability, or a combination.
5. Identify the canonical owner for the route, component, module, schema, permission, image placement, data, verifier, workflow, and deployment.
6. Confirm record, role, approval, external-action, image, performance, compatibility, migration, rollback, and evidence impact.
7. Change the canonical source instead of adding a second shell, list, router, runtime, manifest, schema, data owner, cleanup layer, workflow, generator, harness, or verifier.
8. Run `npm run plan:change -- --base <base-ref> --head <head-ref>` and then `node scripts/verify-change-governance.js` before domain-specific verification.

A change is not complete because it looks correct in one browser. It must follow the canonical architecture, pass verification, deploy through the accepted workflow, and be verified live at the exact commit.

## Fast and Reliable Execution Authority

1. Use one workstream, one integrated branch, one pull request, one authoritative deployment workflow per production target, and one final evidence packet.
2. Inspect the existing workflow, harness, generator, verifier, deployment, and evidence before creating another one.
3. Run fast governance, syntax, structural, manifest, and contract checks before browser, image, clean-install, Apps Script, or production work.
4. Reuse successful evidence only when it is tied to the exact commit and the tested inputs did not change.
5. Do not rerun unrelated expensive checks merely because another scope failed.
6. Diagnose the first failing stage before any rerun. Classify the failure as source defect, stale verifier, permission boundary, platform outage, concurrency conflict, or environment/configuration problem.
7. Rerun only the failed job or affected scope when possible. When the same failure occurs twice, stop repeating the pipeline and correct the execution design, permission path, batch size, or authoritative harness.
8. A seeder, migration, backfill, PDF build, import, or generator must be deterministic, idempotent, resumable, version-aware, duplicate-resistant, auditable, rollback-preserving, and safe to rerun.
9. Long-running data work uses stable IDs, upserts, batches of normally two to five logical records, a persisted cursor and version, and exact final record and file counts.
10. Do not run two workflows concurrently when they modify the same Apps Script project, deployment, spreadsheet, Drive folder, production site, or other shared resource.
11. Remove temporary workflows, diagnostics, hosted transfer URLs, and harness-only changes in the same workstream after use.
12. Update authoritative process documents, intake templates, and verification rules in the same pull request when the execution process changes.
13. Preserve the current live system and external-action locks whenever final verification is HOLD.
14. Do not claim PASS while production or live verification is running, missing, stale, or HOLD.

## Unified application authority

1. There is one authenticated product: **Highway 38 Business Office**.
2. Today is a workspace inside it, not a separate Command Center application.
3. Every app/module must be declared once in `apps-script/business-office/BusinessOffice_ModuleContract.gs`.
4. Every Business Office API action-to-module permission rule must be declared once in `apps-script/business-office/BusinessOffice_ActionContract.gs`.
5. `Portal_Module_Registry.js`, Business Office schemas, navigation, access metadata, dependencies, and load behavior must derive from those contracts.
6. Do not add a second navigation tree, shell, router, database, synchronization layer, startup system, loading system, AI launcher, or product catalog page.
7. Deleting a module means disabling or archiving it while preserving records, proof, errors, permissions, and audit history unless Rick explicitly approves destructive migration.
8. Secondary and administrative modules load on demand. They must not delay Today or the requested workspace.

## Performance authority

Performance is a release requirement, not optional polish.

1. The authenticated shell startup budget is one browser-to-server startup RPC.
2. Do not add page-wide `MutationObserver` cleanup layers when the real renderer is owned by this repository.
3. Do not perform duplicate bootstrap, schema, navigation, role, or module-list requests.
4. Use explicit render hooks, cached static contracts, route-level loading, and lazy/deferred optional clients.
5. Public images below the first viewport must use `loading="lazy"` and explicit dimensions or stable aspect-ratio containers.
6. Do not load page-specific CSS or JavaScript when the shared website shell already provides the component.
7. Shared changes belong in shared files. Do not copy a component or utility into multiple pages.
8. Any new dependency must prove that it is smaller or faster than the existing repository-native solution.
9. Performance verifiers may not be weakened to accommodate duplicate code or slower startup.
10. New modules default to `loadStrategy:'on-demand'`; data-heavy secondary work may not be added to startup.
11. Ordinary unfiltered list opens are bounded to 50 visible records or fewer unless a larger limit is justified in the canonical module contract.
12. Full table or sheet scans are reserved for explicit search, filter, export, reconciliation, report, or audit operations.
13. Every cacheable route must declare user/business scope, cache key, epoch/version, TTL, and all invalidating writes.
14. Repeated requests for the same route and options must reuse one in-flight promise or safe request-scoped result.
15. Older responses must not overwrite a newer route selection.
16. Keep the current workspace visible while the next route loads; do not return to blank loading screens.
17. Prefetch is read-only, prioritized, capped, and must populate the same cache used by a direct click.
18. Record cold, warm, and cached route timing for every changed authenticated route.
19. A startup regression greater than 10 percent or 500 milliseconds, whichever is larger, requires a written reason, compensating improvement, rollback plan, and Rick's approval.
20. Use `.github/ISSUE_TEMPLATE/app-module-change.yml` before building a module and `.github/ISSUE_TEMPLATE/performance-regression.yml` when reporting slow behavior.

## Approved Asset Authority

These rules apply whenever Rick approves a logo, image, visual concept, page design, site rebuild, or complete site build.

1. Treat an approved image or logo as a **controlled binary**, not a visual suggestion.
2. Do not redraw, regenerate, restyle, recolor, crop, trace, approximate, screenshot, or replace an approved asset unless Rick explicitly approves that change.
3. Do not use image generation to recreate an approved asset.
4. Do not use another repository image as a loading fallback for an approved logo or approved content image.
5. The filename alone is not proof that the correct asset is installed. Validate the actual bytes.
6. Read `scripts/config/approved-public-assets.json` and `scripts/config/approved-public-image-placements.json` before changing public imagery.
7. The placement manifest is authoritative for the page, section, exact source path, alt text, and intended role of approved website images.
8. An image may be moved without separate approval only when its current placement is objectively broken, inaccessible, duplicated by mistake, or clearly unrelated to the section. Record the exact reason and preserve the same binary.
9. When an approved asset changes, update the binary, manifest, cache key, public references, and verification expectations in the same PR.
10. Preserve visible text branding for accessibility, but never substitute a different image when the approved logo fails to load.

## Approved Asset Fast Path

Use the first available transfer route and stop when the exact bytes are safely committed:

1. current-conversation attachment with a usable local path;
2. connector-native file transfer without re-encoding;
3. temporary hosted-source transfer through a one-time PR workflow.

For a temporary hosted-source transfer:

- download only the exact approved binary;
- validate file signature, size, dimensions, and hash;
- commit only the intended binary to the PR branch;
- confirm the binary commit exists before merge;
- remove the temporary workflow, trigger, hosted URL, and diagnostic files after deployment.

Never solve a binary-transfer problem by substituting another logo or by changing the site design around a missing asset.

## Fast Site Build and Rebuild Rules

1. Start from current `main` and inspect the existing shared shell once.
2. Inventory approved image paths and placements before writing page markup.
3. Preserve exact approved image files and placements unless a verified placement defect is recorded.
4. Use one integrated branch or direct-main workstream for the full approved page set.
5. Reuse:
   - `assets/css/h38-site-v2.css`
   - `assets/js/h38-site-v2.js`
   - the approved shared header, navigation, footer, cards, grids, spacing, and responsive behavior.
6. Make shared improvements in shared files instead of rebuilding slightly different page shells.
7. Use repository-confirmed asset paths only.
8. Use the approved asset manifest cache key on every controlled logo reference.
9. Batch old-reference cleanup across all in-scope pages instead of fixing pages one at a time.
10. Preserve Customer Portal security, authentication, roles, Apps Script IDs, approval gates, no-automatic-charge controls, production URLs, and data isolation unless the approved scope explicitly changes them.
11. A public redesign must not silently become a portal, platform, pricing, or architecture rewrite.
12. Do not reopen approved logo, imagery, pricing, or product decisions without a verified conflict.
13. Public pages must use the shared website registry and components defined by `docs/architecture/PUBLIC_WEBSITE_CHANGE_RULES.md`.
14. Retired pages must redirect to a current page; they may not keep a separate shell or duplicate content system.

## Image Verification Rules

Before opening or merging a visual PR, run:

```bash
python3 scripts/verify-public-images.py
node scripts/verify-public-image-placements.js
```

The permanent gate must verify:

- the canonical logo is a real image;
- the logo Git blob SHA matches `scripts/config/approved-public-assets.json`;
- controlled public references use the manifest cache key;
- exact approved content-image paths match the placement manifest;
- forbidden substitute paths are absent;
- repository-relative image paths resolve;
- content images have descriptive alt text;
- below-fold images are lazy loaded;
- major public pages contain explicit non-logo imagery.

Do not weaken the image gate to accommodate a corrupt primary asset, substitute logo, or unapproved content-image replacement.

## Deployment Safety Rules

These rules apply to any request that mentions deploy, deployment, GitHub Pages, live site verification, or publishing visual/site changes.

1. Separate all findings by scope:
   - `LOCAL`
   - `ORIGIN_MAIN`
   - `LIVE_PAGES`
2. Print both commit IDs before any conclusion:
   - local `HEAD`
   - `origin/main`
3. If local work differs from `origin/main`, do not treat local file absence or local preview differences as evidence that remote or live is broken.
4. Do not deploy from a dirty working tree.
5. Do not deploy from a branch that is not based on the current `origin/main`.
6. Use a clean worktree or clean branch based on `origin/main` for deploy work.
7. Before claiming a deploy is needed, prove the mismatch with cache-busted live checks.
8. If the intended markers already appear in both `ORIGIN_MAIN` and `LIVE_PAGES`, do not deploy again.
9. A merged PR is not deployment proof. Observe the main-branch Pages run and record its run ID, conclusion, and deployed source SHA.
10. When source is correct but live is stale, debug the Pages workflow and artifact source before rewriting the site.
11. Temporary deployment recorders or transfer workflows must be removed after successful verification.
12. End deploy verification with a one-line verdict in this format:
    - `VERDICT: <PASS|BLOCKED|ALREADY_LIVE|UNKNOWN> | Scope Verified: <LOCAL|ORIGIN_MAIN|LIVE_PAGES|ORIGIN_MAIN+LIVE_PAGES|LOCAL+LIVE_PAGES>`

## Required Preflight

Before every website or authenticated web-app addition/change:

```bash
npm run plan:change -- --base <base-ref> --head <head-ref>
node scripts/verify-change-governance.js
```

Before any image-heavy build, rebuild, or deployment:

```bash
python3 scripts/verify-public-images.py
node scripts/verify-public-image-placements.js
node scripts/verify-public-website-architecture.js
```

For the Sample Library, use the manifest-driven wrapper rather than hard-coded historical markers:

```bash
scripts/deploy_sample_library.sh
```

For another page, use page-appropriate markers that are present in the **current** source and intended live result:

```bash
python3 scripts/guard_deploy.py \
  --page <page.html> \
  --live-url "https://rkrueth-maker.github.io/highway-38-solutions/<page.html>" \
  --match "<current unique page marker>" \
  --match "<current approved CTA or heading>"
```

Do not copy retired catalog, sample-count, logo-cache, or navigation markers from historical documentation. Read the approved asset values from the current manifests and inspect the current target page before choosing verification markers.

## Reference Docs

Consult these before application, image-heavy, website, or deployment work:

- `docs/architecture/WEBSITE_AND_WEB_APP_CHANGE_GOVERNANCE.md`
- `docs/architecture/FAST_RELIABLE_CHANGE_PROCESS.md`
- `docs/architecture/UNIFIED_APP_CHANGE_RULES.md`
- `docs/architecture/MODULE_PERFORMANCE_STANDARD.md`
- `docs/architecture/PUBLIC_WEBSITE_CHANGE_RULES.md`
- `docs/public-website/APPROVED_ASSET_FAST_PATH.md`
- `docs/public-website/WEB_IMAGE_DEPLOYMENT_PLAYBOOK.md`
- `docs/brand/HIGHWAY_38_PUBLIC_LOGO_STANDARD.md`
- `docs/CHATGPT_LIVE_DEPLOY_INSTRUCTIONS_2026-07-06.md`
- `docs/CHATGPT_HANDOFF_DEPLOY_PHOTOS_2026-07-06.md`

Treat older docs as process references only. The current contracts, manifests, repository binaries, current `main`, and verified live deployment are the technical source of truth.

## Visual Change Release Gate

- Follow `docs/public-website/VISUAL_RELEASE_STANDARD.md` for every visual, image, layout, or UI change.
- Do not commit visual changes directly to `main`; use one controlled branch and one integrated pull request.
- Photographic project images must be direct PNG, JPEG, or WebP files. SVG photo wrappers are prohibited.
- PR and live checks capture desktop, mobile, and per-image screenshots and reject blank or mismatched pixels.
- Automated deployment status is technical verification only. Never claim Rick accepted the visual result until he explicitly reviews and accepts it.
