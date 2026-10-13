# Scope-aware verification plan

- Files changed: 1
- Scopes: publicWebsite, performanceReliability, workflowOnly
- Deployment workflows: .github/workflows/pages-branch-fallback.yml

## Fast checks
- `node scripts/verify-change-governance.js`
- `node scripts/verify-public-website-architecture.js`
- `node scripts/verify-public-ecosystem-tools.js`

## Expensive or live checks
- controlled workflow run with machine-readable PASS/HOLD evidence

## Evidence that may remain reusable
- Public browser and image evidence is not invalidated by this change.
- Authenticated browser and data-coverage evidence is not invalidated by this change.
- Only the affected workflow evidence must be regenerated; unrelated product checks remain reusable when inputs are unchanged.
