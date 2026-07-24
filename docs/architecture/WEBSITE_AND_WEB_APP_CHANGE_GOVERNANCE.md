# Highway 38 Website and Web App Change Governance

This is the mandatory intake, ownership, implementation, deletion, performance, reliability, and release policy for every public website and authenticated web-application change in this repository.

It applies to every chat, agent, branch, pull request, direct commit, workflow, automation, reusable package, customer installation, public page, private portal, and module. A narrower handoff may add restrictions but may not weaken the protected system invariants below.

The approved Highway 38 logo and approved website image binaries are locked.

## 1. Classify the change before editing

Every change must be classified as one or more of:

- **Public website** — customer-facing GitHub Pages content, navigation, forms, images, redirects, examples, pricing, or shared public components.
- **Authenticated web app** — Highway 38 Business Office, Today, Quote Builder, H38 AI, modules, roles, records, APIs, Apps Script shell, or deployment.
- **Customer Portal/security boundary** — customer authentication, account mapping, RLS, storage, signed downloads, quote approval, messages, or private files.
- **Shared architecture** — code, contracts, components, manifests, or rules used by more than one page, module, business pack, or installation.
- **Performance and reliability** — startup, caching, payload size, repeated reads, duplicate verification, loading behavior, error recovery, workflow scope, or deployment safety.

Do not turn a page change into an application rewrite, or an application change into a public-site redesign, without explicit approval.

## 2. Required change intake

Before writing code, identify:

1. requested outcome;
2. affected route, page, module, workflow, or verifier;
3. canonical source of truth;
4. data owner and record impact;
5. role and permission impact;
6. external-action impact;
7. dependencies and compatibility routes;
8. approved images and logo impact;
9. desktop, tablet, mobile, keyboard, loading, empty, populated, error, disabled, and permission states;
10. performance budget and loading strategy;
11. migration, rollback, and verification plan;
12. exact production workflow that owns deployment.

If a canonical source already owns the concern, change it there. Do not add a second layer.

## 3. Adding to the public website

A new page, section, component, form, or route must:

1. be registered in `scripts/config/public-website-routes.json` when it creates or changes a route;
2. use `assets/js/h38-site-v2.js` and `assets/css/h38-site-v2.css` for the shared shell;
3. keep page-specific content in the page that owns it;
4. use shared components before adding page-specific CSS or JavaScript;
5. use only repository-confirmed image paths;
6. register controlled imagery in `scripts/config/approved-public-image-placements.json`;
7. preserve the exact approved logo and image binaries;
8. include one title, one description, one main landmark, a canonical URL when appropriate, mobile behavior, keyboard access, and accessible labels;
9. lazy-load below-fold images and preserve stable image geometry;
10. preserve request security, no-charge language, Owner review, portal isolation, and production URLs;
11. avoid catalog, tool, proof, branding, navigation, footer, or image-placement runtimes that duplicate the canonical shell;
12. add or update architecture, link, image, accessibility, performance, staging, and live checks in the same change.

A public page is not complete when only desktop markup exists or when it depends on runtime cleanup to correct source markup.

## 4. Adding to the authenticated web app

A new module, capability, route, API action, record type, or workspace must:

1. have exactly one entry in `apps-script/business-office/BusinessOffice_ModuleContract.gs`;
2. declare API action permissions in `apps-script/business-office/BusinessOffice_ActionContract.gs` when applicable;
3. use a unique module key and unique route;
4. declare group, gate, dependencies, data owner, server owner, client owner, permission policy, disable policy, delete policy, load strategy, cache TTL, schema, and external-action policy;
5. derive navigation and access metadata from the canonical contract;
6. use the existing unified shell, product design system, startup bundle, loading system, router, search, H38 AI entry, and role system;
7. load secondary and administrative workspaces on demand;
8. keep startup at one browser-to-server startup RPC;
9. preserve existing Apps Script project IDs, deployment IDs, URLs, records, Proof Log, Error Log, approvals, permissions, backups, audit history, and customer isolation;
10. provide loading, empty, populated, error, mobile, permission-denied, disabled, dependency, archive, and Owner-approval states;
11. keep external actions disabled or explicitly Owner approved;
12. include migration and rollback evidence for schema changes;
13. retire old routes with deterministic redirects and remove obsolete renderers after verification passes.

A module is not complete when only a navigation button, schema, empty page, compatibility name, or API method exists.

## 5. Changing shared behavior

- Shared website navigation and footer behavior changes only in the canonical public shell.
- Shared website styling changes only in the canonical public stylesheet.
- Shared web-app visual behavior changes only in the product design system.
- Shared web-app shell and startup behavior changes only in the product client and unified bootstrap.
- Module identity, route, group, gate, dependency, owner, schema, lifecycle, loading, caching, disable, or delete policy changes only in the module contract.
- API permission requirements change only in the action contract.
- Approved image placement changes only in the canonical placement manifest and the owning page.
- Do not copy a shared component or utility into multiple pages or modules.
- Do not use a page-wide `MutationObserver` to repair a renderer owned by this repository.

## 6. Deleting or retiring

### Public website

1. Confirm the page is not a canonical route for a required workflow.
2. Preserve inbound links with a lightweight redirect.
3. Remove the retired shell, scripts, styles, and duplicate content system.
4. Update the route registry, sitemap, links, tests, and deployment checks in the same change.
5. Do not delete approved binaries without explicit approval and proof that they are unused.

### Authenticated web app

1. Default to soft-disable or archive.
2. Preserve records, IDs, Proof Log, Error Log, permissions, approvals, backups, and audit history.
3. Resolve dependencies before disablement.
4. Require explicit Owner confirmation for cascading disablement.
5. Require a separately approved migration, backup, rollback plan, and evidence report for destructive deletion.
6. Compatibility aliases may redirect but may not restore a retired shell, product page, router, or navigation tree.

## 7. Prohibited additions

Do not add:

- another authenticated application shell;
- another public-site shell;
- another navigation tree, footer system, router, startup system, loading system, global search, AI launcher, product catalog, or image-placement runtime;
- a second database or synchronization layer for an existing module;
- duplicate schemas, module lists, action-permission lists, route lists, or image manifests;
- automatic customer sends, payments, purchases, payroll funding, tax filing, publishing, ad spend, SMS, deployment, destructive deletion, or bulk execution without an approved gate;
- remote image fallbacks or substitute approved assets;
- a new dependency without documented size, security, and performance justification;
- direct production deployment outside the accepted workflow.

## 8. Performance requirements

- Business Office startup budget: one browser-to-server startup RPC.
- Secondary and administrative modules: on-demand loading.
- Public shell: one canonical JavaScript file and one canonical shell stylesheet.
- Request page: one focused options controller and one secure submit owner.
- No duplicate bootstrap, schema, role, navigation, module-list, saved-view, or spreadsheet-open calls in the same request when safe request-scoped reuse is possible.
- No page-wide DOM observers.
- No runtime image insertion or source swapping.
- Below-fold images use lazy loading and stable dimensions or aspect ratios.
- Shared changes replace duplicate code rather than adding another override.
- Performance evidence should include startup phase timing, payload size, read counts, cache behavior, and visible loading behavior when applicable.

### Performance and reliability rule changes

Rules, verifiers, and workflow scopes may be altered when the alteration measurably improves speed or reliability and does not destroy how the system works together.

Such an alteration must:

1. preserve authentication, authorization, customer isolation, records, IDs, approval gates, Proof Log, Error Log, backups, audit history, deployment IDs, and external-action controls;
2. keep the canonical module, action, route, image, shell, and deployment owners intact;
3. remove stale, duplicate, unrelated, or contradictory checks rather than bypassing a real defect;
4. replace any removed check with a source-accurate invariant when the concern still matters;
5. keep security, destructive-action, data-integrity, and deployment checks fail-closed;
6. document the expected speed or reliability benefit and rollback path.

Performance verifiers may not be weakened to permit slower or duplicated architecture. A stale verifier may be corrected so it validates the accepted canonical architecture.

## 9. Mandatory verification

Run governance first:

```bash
node scripts/verify-change-governance.js
```

Verification is scope-aware:

- Public-only checks should not gate an authenticated-only change unless shared public architecture changed.
- Authenticated-only checks should not gate a public-only change unless shared app, security, data, or deployment architecture changed.
- Customer Portal checks must remain focused on the Customer Portal security boundary.
- Shared-architecture changes run the affected domain suites plus governance.
- Fast structural and syntax checks run before expensive browser, image, deployment, or clean-install checks.
- One verifier owns each invariant; historical duplicate verifiers should be retired or aligned.

For public website work:

```bash
python3 scripts/verify-public-images.py
node scripts/verify-public-image-placements.js
node scripts/verify-public-website-architecture.js
node scripts/verify-public-ecosystem-tools.js
```

For authenticated application work:

```bash
node scripts/verify-unified-app-architecture.js
node scripts/verify-product-pack-architecture.js
node scripts/verify-owner-portal-routing.js
node scripts/verify-owner-portal-next.js
node scripts/verify-owner-portal-hard-rule.js
node scripts/verify-business-office.js
node scripts/verify-unified-client-routing-runtime.js
node scripts/verify-task-messaging-hardening.js
node scripts/verify-customer-portal-security.js
```

Do not bypass a failing verifier. Correct the source, or correct a stale verifier so it validates the canonical architecture and protected invariants.

## 10. Deployment authority

- Public website: `.github/workflows/pages.yml`.
- Authenticated application: `.github/workflows/deploy-owner-portal-hard-rule-production.yml`.
- Reusable package checks do not create or modify a production deployment.
- A commit is not live merely because it was merged.
- Record the exact source commit, workflow run, conclusion, deployed SHA or version, and live cache-busted verification.
- Never create another Apps Script project or production deployment to avoid fixing the existing one.

## 11. Definition of done

A website or web-app addition or change is done only when:

- ownership and the canonical source are unambiguous;
- no parallel list, shell, router, runtime, manifest, or data owner was introduced;
- desktop, tablet, mobile, keyboard, loading, empty, populated, error, permission, disabled, dependency, and archive states are handled as applicable;
- approved logo and image binaries are unchanged unless explicitly approved;
- security, records, permissions, approvals, history, and compatibility are preserved;
- performance budgets remain intact or improve with evidence;
- obsolete code, routes, and stale duplicate verification are removed, redirected, or aligned;
- governance and scope-relevant verification pass;
- the accepted workflow deploys the exact commit;
- live verification confirms the intended result.
