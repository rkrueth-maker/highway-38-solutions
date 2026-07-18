# Highway 38 Business System — Product Packaging Guide

## Packaging objective

Package the current system for repeatable deployment to another business from one shared codebase without copying Highway 38 production, customer data, secrets, or live resource IDs.

The packaged system has three required layers:

1. **Reusable Business System Core**
   - Business Office runtime
   - customers, contacts, quotes, proposals, documents, tasks, and controlled messaging
   - direct Quote Builder routing, grouped writes, Price Book, templates, and quote camera
   - authentication, roles, owner approval, duplicate controls, Proof Log, Error Log, and timing logs
   - customer portal foundations, deployment tooling, verification scripts, recovery procedures, and source maps

2. **Business Pack**
   - business identity, logo, colors, language, catalog, pricing, templates, intake wording, public website content, samples, module choices, workflow defaults, and customer-facing terms

3. **Customer Installation Configuration**
   - customer-owned accounts, Drive folders, Forms, Sheets, Apps Script projects, web app deployments, Gmail/Workspace sender, repository, website, time zone, permissions, feature flags, and approval wording

Core logic must not depend on Highway 38 branding or live IDs. Business Packs must not contain customer records or secrets. Customer configuration must be validated before deployment.

## Required distributable

### Source package
- complete exported Apps Script `.gs`, `.html`, and `appsscript.json` source
- public website and gateway source required by the selected product
- canonical schemas and configuration definitions
- tests, verification scripts, and accepted baseline commit

### Setup package
- prerequisites and supported account types
- customer-owned Google resource creation procedure
- configuration template and validator
- deployment procedure that creates or updates only the target customer's resources
- blocked-action test procedure
- rollback and recovery procedure

### Business Pack
- business manifest
- logo and brand assets
- service/product catalog and Price Book seed
- quote, proposal, email, follow-up, document, and website templates
- intake questions and workflow defaults
- enabled modules and navigation choices

### Operator and administrator package
- Operations Manual
- Queue Map and Status Dictionary
- user, role, document, approval, and external-action guidance
- maintenance, backup, recovery, and audit procedures
- first-run checklist and training record

### Transfer package
- ownership and access inventory
- release manifest
- configuration record with secrets excluded
- acceptance-test record
- open defects, limitations, and rollback baseline

## Supported product packages

### Quote Builder
A focused standalone package for customers, estimates, proposals, approvals, Price Book, templates, quote documents, field photos, and controlled sharing.

### Business System with Quotes & Proposals
The full Business Office installation with the Quote Builder enabled as a module. It preserves shared customer, document, approval, logging, and role records.

Both packages must come from the same source tree. Product selection changes the Business Pack, enabled modules, navigation, setup defaults, and acceptance scope—not the underlying control model.

## Packaging rules

- Never include Highway 38 customer data, Rick's private files, secrets, tokens, live account credentials, or production-only IDs.
- Never point a pilot installer at the Highway 38 Apps Script project, deployment, Drive folders, Sheets, Forms, Gmail account, or public repository configuration.
- Keep Core logic separate from business branding, pricing, and customer-specific workflow language.
- Preserve direct `quoteBuilder=1` routing and the integrated one-tap camera workflow when Quote Builder is enabled.
- Preserve private Drive storage and Quote Field Photo classification for captured quote pictures.
- Preserve owner approval, no-automatic-send, no-money-movement, no-automatic-work-start, and no-AI-approval controls.
- Store secrets outside GitHub. Commit only sanitized examples and non-secret schema definitions.
- Use stable product and file names rather than numbered phases.
- Generate a release manifest for every customer installation.
- Verify the target production deployment before reporting PASS.

## Commercial readiness

- **Documentation-ready:** achieved.
- **Source-export ready:** achieved for the accepted repository baseline.
- **Manual clean-install ready:** supported by the existing separation and clean-install verification lanes, subject to a customer-specific acceptance run.
- **Repeatable pilot-install ready:** target of issue #145; requires the refreshed configuration template, Business Pack manifest, preflight validator, installer workflow, and second-business acceptance record.
- **One-click installer ready:** not yet accepted. Installer automation must be proven against a separate customer-owned test installation before this designation is used.

## Second-business release gate

A second-business pilot is accepted only when:

- customer-owned resources are separately created and deployed
- configuration and secret scans pass
- login and role tests pass
- customers, quotes, documents, Quote Builder, and camera tests pass for the selected package
- approval and external-action locks pass
- Proof Log, Error Log, and timing evidence are present
- backup and recovery are verified
- no Highway 38 customer/private material is included
- real-device acceptance is recorded
