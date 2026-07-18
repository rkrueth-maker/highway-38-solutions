# Archived Legacy Business Office Diagnostic Workflows

Archived during issue #180 repository cleanup.

These workflows were removed from `.github/workflows/` because both identified themselves as legacy, manual-only diagnostics and explicitly stated that production authority belongs to the unified Owner Portal deployment workflow. Removing them from the active Actions list reduces deployment ambiguity without changing application code, production URLs, Apps Script project IDs, deployment IDs, data, permissions, or approval controls.

## Legacy Business Office Acceptance

Former path: `.github/workflows/business-office-production-v2.yml`

Purpose: manually run the Business Office verification suite without production writes.

Commands preserved:

```bash
npm install
npm run test:business-office
node scripts/verify-owner-business-office-ux.js
node scripts/verify-business-office-existing-deployment.js
```

The former workflow explicitly prohibited creating or updating production resources.

## Legacy Business Office Repair Diagnostics

Former path: `.github/workflows/business-office-production-repair.yml`

Purpose: manually run source, deployment-contract, and routing diagnostics without production writes.

Commands preserved:

```bash
npm install
npm run test:business-office
node scripts/verify-business-office-existing-deployment.js
node scripts/verify-owner-portal-routing.js
```

The former workflow explicitly prohibited Apps Script project creation, deployment creation or update, trigger creation, and external actions.

## Current rule

Production deployment must continue through the existing protected unified Owner Portal deployment path and must update the existing Apps Script project and deployment IDs in place.
