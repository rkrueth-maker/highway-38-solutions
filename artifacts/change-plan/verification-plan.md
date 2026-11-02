# Scope-aware verification plan

- Files changed: 1
- Scopes: customerPortal
- Deployment workflows: .github/workflows/deploy-owner-portal-hard-rule-production.yml

## Fast checks
- `node scripts/verify-change-governance.js`
- `node scripts/verify-customer-portal-security.js`

## Expensive or live checks
- None identified.

## Evidence that may remain reusable
- Public browser and image evidence is not invalidated by this change.
- Authenticated browser and data-coverage evidence is not invalidated by this change.
