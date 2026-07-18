# Authoritative Source Boundaries

This document records the source ownership enforced by `scripts/verify-source-boundaries.js`.

## Highway 38 production deployment

The existing protected unified deployment assembles production from:

- `apps-script/core-engine/owner-portal-next/`
- `apps-script/business-office/`
- `apps-script/business-office-sync/`
- `apps-script/unified-shell/`
- `business-packs/highway38/`

Production deployment is executed only by `.github/workflows/deploy-owner-portal-hard-rule-production.yml` through `scripts/deploy-unified-owner-portal-web.sh`.

The deployment must update the existing Apps Script project and existing deployment IDs. It may not create a replacement project or deployment.

## Reusable Business Office installer

Transferable and clean-install packages are assembled from:

- `packages/`
- `apps/business-office/`
- `business-packs/`

These reusable installer sources are separate from the Highway 38 production assembly source.

## Generated outputs

The following are generated evidence or installation outputs, not production source inputs:

- `artifacts/business-office-separation/builds/`
- `artifacts/separate-business-office-platform/builds/`
- `dist/business-office/`

Generated outputs must not be copied into the production Apps Script project.

## Safety boundaries

The source-boundary verification also confirms:

- exactly one workflow executes the production deployment script;
- production uses the deterministic unified shell;
- generated artifacts are not deployment inputs;
- no `clasp create-script` or `clasp create-deployment` command is present in the protected production workflow;
- external actions remain disabled and approval gated.
