# Business Office Platform

Private, role-aware operations platform for customers, vendors, quotes, work orders, jobs, purchasing, billing, payments, receipts, expenses, document intake, OCR-assisted review, accounting preparation, payroll preparation, tax-preparation support, approvals, reports, backups, proof logs, and error logs.

## Business pack

Every deployment must assemble exactly one business pack. The pack supplies business identity, branding, contacts, URLs, enabled modules, roles, approval language, catalog requirements, tax settings, document labels, property-key names, deployment mode, and isolation rules. The reusable core contains no live business resource IDs.

## Storage and deployment isolation

Each installation requires a dedicated Apps Script project, deployment, spreadsheet, root folder, document folder, PDF folder, export folder, backup folder, user records, audit log, proof log, and error log. Resource IDs are stored in Script Properties or encrypted deployment inputs, never public source.

## Safety boundaries

External actions default to disabled. The platform does not directly process payments, fund payroll, initiate direct deposit, file tax returns, or bypass selected-record approval controls. Original uploads are preserved and duplicate hashes are blocked.

## Deployment modes

- Combined: configured website, owner portal, and Business Office.
- Standalone: private Business Office with separate authentication, configuration, storage, and deployment.

Use the repository assembly and installation scripts with a selected business pack. Do not copy another installation's data or resource IDs.
