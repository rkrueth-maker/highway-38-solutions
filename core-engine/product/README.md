# Transferable Business OS Product

This directory contains the provider-neutral, multi-business product layer for the Business OS. Business-specific terminology, branding, catalog data, privacy classes, and defaults belong in a separate Business Pack.

## Separation

- `core-engine/product/` — generic engine configuration, installer, licensing controls, tenant isolation, provider slots, release channels, backup, restore, and migration.
- `business-packs/<business>/` — branding, catalog reference, enabled modules, provider selections, privacy rules, and support defaults for one business.
- `launch-control/evidence/` — generated verification and sample-package evidence. Evidence is created by CI and is not permission to activate external actions.

The Core Engine configuration must not contain Highway 38-specific terminology.

## Install

```bash
node core-engine/product/installer/install-business-os.js install \
  --pack business-packs/highway-38/business-pack.json \
  --output /tmp/highway-38-os \
  --tenant highway-38 \
  --name "Highway 38 Solutions" \
  --tier Control \
  --channel stable \
  --license core-engine/product/licenses/example-evaluation-license.json \
  --environment test
```

The installer creates:

- an installation manifest;
- an effective tenant configuration;
- isolated tenant data stores;
- tenant-specific private-file storage;
- Proof and Error Logs;
- a backup directory;
- a safety README.

It does not create accounts, send email, request or process payment, publish social content, spend advertising money, deploy a website, or deliver customer files.

## Backup and restore

```bash
node core-engine/product/installer/install-business-os.js backup \
  --source /tmp/highway-38-os \
  --output /tmp/highway-38-os-backup.json

node core-engine/product/installer/install-business-os.js restore \
  --source /tmp/highway-38-os-backup.json \
  --output /tmp/highway-38-os-restored
```

Backups contain a SHA-256 integrity envelope. Restore rejects altered payloads and unsafe paths.

## Tenant isolation

Every installation receives an explicit tenant key and namespace. Cross-tenant reads and writes are disabled in the Core Engine configuration. Customer permissions are limited to `customer.own.*` capabilities. Provider activation cannot bypass tenant isolation.

## Licensing

The included license file is a non-secret example. License validation enforces:

- active status;
- optional expiration;
- tenant count;
- assigned tenants;
- permitted tiers.

Commercial signing, entitlement service, billing, and license revocation infrastructure remain commercialization work and are not represented as complete.

## Release channels

Supported channels are `stable`, `candidate`, and `development`. The installer records the selected channel. A release channel does not enable external actions.

## Provider adapters

The registry defines neutral slots for catalog, payment, email, accounting, social, website, storage, and calendar providers. Each live adapter requires credentials, selected-record execution, duplicate protection, owner approval, regression testing, Proof Log, and Error Log behavior.

## Verification

```bash
node scripts/verify-business-os-productization.js
```

The verifier tests:

- generic Core Engine separation;
- Highway 38 Business Pack loading;
- module and role configuration;
- tenant isolation;
- production/test environment labeling;
- external-action locks;
- provider lock state;
- installation output;
- backup integrity;
- restore behavior;
- schema migration;
- license tenant and tier limits;
- unsafe tenant-key rejection.
