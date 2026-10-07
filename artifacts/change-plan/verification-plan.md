# Scope-aware verification plan

- Files changed: 2416
- Scopes: publicWebsite, authenticatedApp, customerPortal, sharedArchitecture, performanceReliability
- Deployment workflows: .github/workflows/pages-branch-fallback.yml, .github/workflows/deploy-owner-portal-hard-rule-production.yml

## Fast checks
- `node scripts/verify-change-governance.js`
- `node scripts/verify-public-website-architecture.js`
- `node scripts/verify-public-ecosystem-tools.js`
- `python3 scripts/verify-public-images.py`
- `node scripts/verify-public-image-placements.js`
- `node scripts/verify-unified-app-architecture.js`
- `node scripts/verify-business-office.js`
- `node scripts/verify-customer-portal-security.js`
- `node scripts/verify-h38-office-access.js`

## Expensive or live checks
- desktop and mobile public browser verification for affected routes
- desktop and mobile authenticated route verification for affected workspaces
- rendered pixel and direct-image verification
- exact record-count, idempotency, duplicate, backup, and rollback verification
- resumable small-batch generation with cursor and exact final counts
- controlled workflow run with machine-readable PASS/HOLD evidence

## Evidence that may remain reusable
- Re-evaluate evidence after the fast checks.
