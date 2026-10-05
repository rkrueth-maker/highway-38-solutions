# Scope-aware verification plan

- Files changed: 6
- Scopes: authenticatedApp
- Deployment workflows: .github/workflows/deploy-owner-portal-hard-rule-production.yml

## Fast checks
- `node scripts/verify-change-governance.js`
- `node scripts/verify-unified-app-architecture.js`
- `node scripts/verify-business-office.js`

## Expensive or live checks
- desktop and mobile authenticated route verification for affected workspaces

## Evidence that may remain reusable
- Public browser and image evidence is not invalidated by this change.
