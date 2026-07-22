# H38 Product Center and Upgrade Advisor — Phases 2 and 3

## Release scope

This release completes Phase 2 and Phase 3 on top of the accepted Phase 1 pack catalog and legacy alias foundation.

## Phase 2 — Owner Product Center

The existing `moduleManager` owner route now renders an Owner-only Product Center with:

- Installed packs
- Available packs
- Specialist add-ons
- Included modules and capabilities
- Dependencies
- Roles with access
- Record counts
- Last-used information
- Existing-record preservation warnings
- Upgrade Advisor recommendations
- Advanced module-level controls

Pack actions are enable-only. A pack cannot silently disable an existing module. Before a pack is enabled, the server returns a migration preview with dependency packs, modules, roles, record counts, permission impact, data impact, migration steps, and possible cost impact. The Owner must type `ENABLE PACK` before the change is applied.

The Product Center does not purchase anything, change licensing, change roles or permissions, alter credentials, deploy code, move money, fund payroll, file taxes, or execute an external action.

## Phase 3 — H38 AI Upgrade Advisor

The Advisor creates recommendations from deterministic operating signals before AI explanation is allowed. Signals include:

- Repeated workflow errors
- Overdue work
- Calendar conflicts
- Active jobs
- Active employees
- Quote volume
- Invoice volume and aging
- Receipt review backlog
- Equipment count
- Repeated H38 AI coaching requests
- High module usage
- Disabled modules whose prerequisites are already active
- Future growth thresholds

Each stored recommendation includes:

- Title
- Recommendation type
- Evidence from current system data
- Business problem
- Expected benefit
- Effort level
- Possible cost impact
- Dependencies
- Permission and data impact
- Migration steps
- Owner-approval requirement
- Status

Statuses are `New`, `Reviewed`, `Postponed`, `Dismissed`, and `Accepted`.

Accepting a recommendation is planning-only. It does not install or enable a pack or module. H38 AI may explain the deterministic recommendation, but it cannot modify source code, deploy, purchase, change permissions or credentials, move money, fund payroll, file taxes, or execute an external action.

## Existing AI integration

`boAiRecommendations_()` now uses the deterministic Upgrade Advisor for the Owner. The previous telemetry-only recommendation logic remains as a fallback for non-owner or unavailable Advisor contexts. Existing H38 AI approval controls remain unchanged.

## Files

- `apps-script/core-engine/owner-portal-next/Portal_ProductCenter.js`
- `apps-script/core-engine/owner-portal-next/Portal_UpgradeAdvisor.js`
- `apps-script/core-engine/owner-portal-next/Portal_ProductCenter_Client.html`
- `apps-script/core-engine/owner-portal-next/Portal_ProductCenter_Styles.html`
- `apps-script/core-engine/owner-portal-next/Portal_Index.html`
- `apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js`
- `apps-script/business-office/BusinessOffice_AI_Assistant.gs`
- `scripts/verify-product-center-upgrade-advisor.js`
- `package.json`

## Verification

The dedicated verifier covers static parsing, owner-only access, pack grouping, migration previews, exact confirmation, record and permission preservation, no automatic disable, no purchase, all required recommendation fields and statuses, deterministic signal coverage, existing H38 AI integration, responsive client rendering, protected actions, and runtime state transitions.
