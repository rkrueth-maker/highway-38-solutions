# Scope-aware verification plan

- Files changed: 9
- Scopes: publicWebsite, customerPortal, performanceReliability
- Deployment workflows: .github/workflows/pages-branch-fallback.yml, .github/workflows/deploy-owner-portal-hard-rule-production.yml

## Fast checks
- `node scripts/verify-change-governance.js`
- `node scripts/verify-public-website-architecture.js`
- `node scripts/verify-public-ecosystem-tools.js`
- `node scripts/verify-customer-portal-security.js`

## Expensive or live checks
- desktop and mobile public browser verification for affected routes
- resumable small-batch generation with cursor and exact final counts

## Evidence that may remain reusable
- Authenticated browser and data-coverage evidence is not invalidated by this change.
