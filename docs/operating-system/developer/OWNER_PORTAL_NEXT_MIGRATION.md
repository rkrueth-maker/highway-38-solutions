# Owner Portal Next — Migration, Deployment, and Rollback

## Migration

1. Preserve the existing bound project and pinned libraries as immutable evidence.
2. Create a separate Apps Script candidate project and spreadsheet copy.
3. Copy the Owner Portal Next files into the candidate project.
4. Run the installer with the exact confirmation phrase.
5. Import and verify the approved 15-product/9-bundle catalog.
6. Load synthetic records and validate every normalized module.
7. Validate legacy queue projection and selected-record decisions.
8. Reconcile operating procedures with 03 – Operations & Documentation.
9. Only after regression approval, create a candidate version and deliberately change deployment configuration.

## Deployment

Deployment is intentionally excluded from this build. A future approved deployment must start from current `main`, remain owner-only, keep external actions disabled for first production validation, use non-customer test data, and require separate Rick approval for each live adapter.

## Rollback

Retain the existing private Web App deployment and queues until cutover approval. Candidate sheets use `Portal` prefixes. Rollback disables the candidate deployment and returns to the prior deployment without deleting candidate evidence. Record commit, deployment, verification, rollback, and owner-decision proof.

## Exact approvals required

- candidate project and spreadsheet copy
- candidate sheet installation
- approved catalog import
- non-customer integration tests
- new Apps Script version
- Web App deployment
- each external adapter
- every customer-facing send, payment request, final delivery, publication, ad spend, or website deployment workflow
