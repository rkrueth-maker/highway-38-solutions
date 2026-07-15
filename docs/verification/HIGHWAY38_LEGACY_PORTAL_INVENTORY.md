# Highway 38 Legacy Portal Inventory

## Retention rule

No legacy Owner Portal, Command Center, deployment, workbook, backup, or rollback resource is deleted during final polish. Retirement requires separate Command Center approval after the new portal covers all workflows, counts and approvals match, and rollback is verified.

## Current classifications

| Legacy component | Classification | Current use | Retirement condition |
|---|---|---|---|
| Existing Operations & Social Apps Script workspace | Active and retained | Embedded in `portal.html#operations` for daily operations, social, website, approvals, and system control | Replace only after every operating workflow has a verified Business Office or successor destination |
| Highway 38 Business Office Apps Script workspace | Active and retained | Embedded in `portal.html#business-office` for records, documents, accounting, payroll preparation, tax preparation, reports, approvals, and backups | Remains active; not a retirement candidate |
| `apps-script/core-engine/owner-portal-next/` | Rollback and technical reference | Source, test runbook, and recovery evidence for the prior Owner Portal implementation | Retain until Command Center approves archival after sustained production acceptance |
| Owner Review Portal rollback workbook | Rollback only | Pre-Business-Office state and comparison point | Retain until counts, approvals, backup, and recovery remain verified after final acceptance |
| Product Fulfillment Backend CURRENT workbook | Administrative only | Legacy fulfillment and source-data reference where still required | Mark safe to retire only after every active field and workflow is mapped into the Business Office |
| Direct Business Office spreadsheet | Administrative only | Diagnosis, controlled correction, export, and recovery | Never a normal operating route; retain as an authorized administrative fallback |
| Direct Apps Script deployment URLs | Administrative and implementation only | Embedded application destinations and recovery checks | Do not present as normal public or owner shareable URLs |
| Acceptance backups and North Star evidence | Rollback and proof only | Regression, installer, recovery, and separation evidence | Preserve indefinitely under the evidence-retention policy |

## Normal operating path

- Public owner entry: `portal.html`
- Operations workspace: `portal.html#operations`
- Business Office and uploads: `portal.html#business-office`

Ordinary operation must not require manually editing Google Sheets. Any spreadsheet link exposed inside the Business Office must remain explicitly labeled **Administrative spreadsheet**, require confirmation, and stay restricted by the existing role and Google-account controls.

## Current disposition

The legacy portal is preserved. No component is approved for deletion in this workstream. The portal architecture remains closed to redesign; only verified routing, usability, branding, and deployment defects may be corrected.
