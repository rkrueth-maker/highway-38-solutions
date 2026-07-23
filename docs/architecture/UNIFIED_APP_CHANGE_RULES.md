# Highway 38 Unified Application Change Rules

These rules govern every change or addition to the Highway 38 Business Office, Today/Command Center, Quote Builder integration, module navigation, H38 AI, and shared portal shell.

The approved Highway 38 logo is locked. It may not be redrawn, regenerated, recolored, cropped, replaced, approximated, or moved to a substitute asset without Rick’s explicit approval.

## 1. Product architecture

1. There is one authenticated application: **Highway 38 Business Office**.
2. **Today / Command Center is a workspace inside that application**, not a second app.
3. The existing Apps Script project, production deployment IDs, URLs, records, roles, permissions, approvals, proof, and customer isolation must be preserved unless Rick explicitly approves a migration.
4. A new route may not create another application shell, another database, or another synchronization requirement.
5. Specialized experiences such as Quote Builder remain workspaces or capability owners inside the unified application.

## 2. Single sources of truth

| Concern | Required source of truth |
|---|---|
| Visible modules, labels, icons, groups, route type, feature gate, command keywords | `apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js` |
| Shared shell and component styling | `apps-script/core-engine/owner-portal-next/Portal_Product_Styles.html` |
| Shared chrome, navigation decoration, loading states, and contextual AI entry | `apps-script/core-engine/owner-portal-next/Portal_Product_Client.html` |
| Unified server bootstrap, access filtering, and module index | `apps-script/core-engine/owner-portal-next/Portal_Unified.js` |
| Module-specific data and operations | The module’s server/client implementation |
| Approved logo bytes and cache authority | `scripts/config/approved-public-assets.json` and the approved repository binary |
| Production deployment | `.github/workflows/deploy-owner-portal-hard-rule-production.yml` |

Do not duplicate any of these concerns in another file.

## 3. Adding a module

A module addition must be delivered as one complete change:

1. Add exactly one registry entry in `Portal_Module_Registry.js`.
2. Provide a unique route key and module key.
3. Declare `type` as `native` or `business`.
4. Declare the correct access `gate`.
5. Add a concise label, icon, and command-search keywords.
6. Mark rarely used administrative modules with `secondary:true`.
7. Add or extend the module service and client renderer.
8. Use shared components and tokens from `Portal_Product_Styles.html`.
9. Add contextual H38 AI prompts only through `Portal_Product_Client.html` when the shared defaults are not sufficient.
10. Add verification for loading, empty, error, populated, mobile, permission-denied, and owner-approval states.
11. Confirm the module performs no external action unless an existing approval-gated workflow explicitly permits it.
12. Deploy only through **Deploy Unified Owner Portal**.

A module is not complete when only its navigation button or empty screen exists.

## 4. Changing a module

1. Change module-specific behavior in the module implementation.
2. Change the visible label, location, icon, or search terms only in the registry.
3. Change shared visual behavior only in the product design system.
4. Change shared shell behavior only in the product client.
5. Do not add page-specific global CSS overrides to fix a shared component.
6. Do not use a MutationObserver as a substitute for changing the real renderer when the renderer is owned by this repository.
7. Do not create a second toolbar, search box, AI launcher, loading system, or navigation tree.
8. Preserve record IDs, audit history, approvals, and backwards-compatible links.
9. Retire old routes with deterministic redirects to the current workspace.
10. Remove obsolete files and references in the same change after verification passes.

## 5. Visual and interaction rules

1. One top bar: Search, New, relevant quick action, refresh, system status, and H38 AI.
2. One left navigation generated from the registry.
3. One shared dark product language across all workspaces.
4. Every workspace must support desktop and mobile without a separate mobile application.
5. Loading states use the shared skeleton system.
6. Empty states explain what belongs there and offer one useful next action.
7. Errors state that no record or external system was changed.
8. Forms use shared fields, validation, button hierarchy, and approval language.
9. Tables use shared headers, row actions, responsive cards, and accessible labels.
10. H38 AI is contextual to the current workspace and may prepare actions, but external execution remains approval gated.
11. Avoid decorative clutter, repeated warnings, duplicated headings, and large unused blank areas.
12. The approved logo is never altered by a UI rebuild.

## 6. Data and safety rules

1. External actions remain disabled or explicitly owner approved.
2. No automatic customer send, payment, purchase, payroll funding, tax filing, publishing, ad spend, SMS, deployment, or destructive action may be introduced silently.
3. Role and customer isolation checks are mandatory.
4. Selected-record actions may not become bulk actions without an explicit design and approval gate.
5. New fields require a migration/default strategy and must not corrupt existing rows.
6. Deletion defaults to archive or soft-delete behavior when records have audit value.
7. AI output is advisory or draft output until approved through the appropriate workflow.
8. Proof Log and Error Log behavior must remain available.

## 7. Required verification

Before production deployment, the change must pass:

```bash
node scripts/verify-unified-app-architecture.js
node scripts/verify-owner-portal-routing.js
node scripts/verify-owner-portal-next.js
node scripts/verify-owner-portal-hard-rule.js
node scripts/verify-business-office.js
node scripts/verify-unified-client-routing-runtime.js
node scripts/verify-customer-portal-security.js
```

Visual changes that touch public assets must also pass:

```bash
python3 scripts/verify-public-images.py
```

Production is not complete until the **Deploy Unified Owner Portal** workflow reports PASS for the exact source commit and confirms the existing Apps Script deployment was updated in place.

## 8. Definition of done

A change is done only when:

- the registry and implementation agree;
- the module is usable from the unified shell;
- desktop and mobile states are polished;
- contextual AI is present without duplicate launchers;
- loading, empty, populated, error, and permission states work;
- external actions remain locked or approval gated;
- obsolete routes/files are removed or redirected;
- automated verification passes;
- the exact commit is deployed and recorded;
- the approved logo is unchanged.
