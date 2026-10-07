# Scope-aware verification plan

- Files changed: 3
- Scopes: publicWebsite, performanceReliability
- Deployment workflows: .github/workflows/pages-branch-fallback.yml

## Fast checks
- `node scripts/verify-change-governance.js`
- `node scripts/verify-public-website-architecture.js`
- `node scripts/verify-public-ecosystem-tools.js`

## Expensive or live checks
- desktop and mobile public browser verification for affected routes

## Evidence that may remain reusable
- Authenticated browser and data-coverage evidence is not invalidated by this change.
