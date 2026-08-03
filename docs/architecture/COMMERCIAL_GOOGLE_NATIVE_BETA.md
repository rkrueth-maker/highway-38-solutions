# Highway 38 Commercial Google-Native Business Office Beta

## Authority and baseline

- Source baseline: `95bce5a837e21140726fd9abe415e13cece35f03`.
- Development branch: `agent/commercial-google-native-beta`.
- The current Highway 38 Owner Portal, Business Office, Quote Builder, deployment IDs, Drive records, approvals, Proof Log, Error Log, and customer controls remain unchanged.
- This beta is a separate Apps Script project, deployment, web-app URL, Drive root, control workbook, tenant roots, tenant spreadsheets, logs, and backups.
- No production records are copied or synchronized merely because the beta is opened.

## Repository audit findings

The accepted repository already contains reusable patterns that should remain the foundation:

1. The neutral Business Office core and shared UI under `apps-script/business-office`, `packages/business-office-core`, `packages/shared-ui`, and `packages/business-office-control-plane`.
2. Clean-install and standalone deployment scripts, including `scripts/assemble-business-office-app.sh` and `scripts/deploy-business-office-standalone.sh`.
3. An idempotent installer-manifest contract in `business-os/installer-manifest.json`.
4. A proven clean-install UI and Google Drive provisioning pattern in the Northern Lakes business pack.
5. Existing user, role, permission, equipment, assignment, maintenance, document, audit, proof, error, backup, and isolation logic.
6. Existing Quote Builder and Outdoor Measure must remain one protected production capability and may later be opened through a controlled link.

The new beta begins as a separate project root so it can be deployed and tested without modifying the production Business Office. Reusable modules will be connected through repository/service adapters after the isolated installer and tenant boundaries are proven.

## Initial architecture

### Control plane

One separate beta Apps Script project owns only beta coordination. It creates a beta Drive root and a control workbook containing:

- Businesses
- Installation Manifests
- Audit Events
- Error Events

The control plane is Owner-only during initial provisioning. All protected actions are checked server-side.

### Tenant data plane

Each test business receives its own:

- Drive root
- Core Data spreadsheet
- Inventory Data spreadsheet
- Asset Data spreadsheet
- document folders
- inventory attachment folders
- asset photo/manual/maintenance folders
- backup folder
- archive folder
- installation manifest JSON file

The tenant resources use stable UUID-style identifiers and do not depend on sheet row numbers.

### Core Data

Core Data contains separate sheets for businesses, settings, users, invitations, roles, locations, departments, crews, customers, properties, jobs, tasks, documents, approvals, offline sync events, audit events, error events, and module entitlements.

### Inventory Data

Inventory is an append-only transaction system. Quantity on hand must be derived from transactions rather than freely overwritten. Initial sheets cover item master, transactions, reservations, purchase orders, purchase-order lines, and vendors.

Every balance-changing transaction must carry a stable transaction ID, business ID, location ID, item ID, quantity, direction, cost, source record, user, timestamp, idempotency key, sync status, record version, and audit metadata.

### Asset Data

Asset Data contains the asset registry, assignments, inspections, maintenance, and append-only asset events. Assets support QR/barcode identity, serialized fields, locations, users, crews, trucks, jobs, availability, meter values, inspections, maintenance intervals, costs, and history.

### Offline synchronization contract

Every offline action must contain:

- stable action UUID
- business ID
- user ID
- device ID
- action type
- local timestamp
- record type and ID
- record version
- idempotency key
- sync status
- retry count
- payload hash
- error status

The server must verify business membership, user permission, current record version, duplicate action ID, allowed action type, inventory or asset availability, and business configuration before applying the action.

### Migration boundary

The UI calls Apps Script API/service functions. Data access is isolated behind repository helpers. A later PostgreSQL or Supabase adapter may replace the Sheets repositories without replacing the user workflows.

## Initial implementation phases

1. Deploy the separate authenticated beta shell.
2. Prove idempotent tenant provisioning and repair behavior.
3. Add inventory operations using locks and idempotency keys.
4. Expand the existing equipment foundation into the commercial asset model.
5. Add invitations, role templates, location restrictions, user deactivation, and audit attribution.
6. Add Inventory Scanner PWA offline queue and synchronization.
7. Add Asset Tracker, Field, and Capture applications.
8. After live beta acceptance, add the separately reviewed Owner-only `Commercial Office Beta` button to production.

## Responsibility split

### 02 — Build & Automation

Owns repository implementation, the separate Apps Script project and deployment, Drive/Sheets provisioning, tenant isolation, installer behavior, inventory, assets, authentication, permissions, offline synchronization, tests, deployment evidence, backup/recovery, and the eventual production Owner-only button.

### 04 — Business & Growth

Must provide implementation-ready decisions for industry-pack defaults, plan/module entitlements, seat and storage limits, setup questions, onboarding language, beta support, trial rules, pricing, upgrade/downgrade behavior, and commercial acceptance criteria.

## Hard stops

- Never overwrite a production deployment ID.
- Never auto-copy Highway 38 production customer or financial records.
- Never use browser-hidden controls as authorization.
- Never allow duplicate inventory transactions.
- Never claim offline synchronization is complete without airplane-mode close/reopen/reconnect testing.
- Never add the production beta button before the separate URL and authentication work.
- Never claim commercial readiness from static source inspection alone.
