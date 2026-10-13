# Scope-aware verification plan

- Files changed: 2
- Scopes: performanceReliability, workflowOnly
- Deployment workflows: none

## Fast checks
- `node scripts/verify-change-governance.js`

## Expensive or live checks
- None identified.

## Evidence that may remain reusable
- Public browser and image evidence is not invalidated by this change.
- Authenticated browser and data-coverage evidence is not invalidated by this change.
- Only the affected workflow evidence must be regenerated; unrelated product checks remain reusable when inputs are unchanged.
