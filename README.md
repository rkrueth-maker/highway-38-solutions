# Highway 38 Solutions

This repository contains the Highway 38 Solutions public website, exported Core Engine source, and consolidated operator/developer/transfer documentation.

## Source-of-truth split

### Reusable Core Engine

- Owner Review Portal queue and status model
- owner-approval and selected-row execution rules
- exported Apps Script modules
- Gmail draft/send controls
- Proof Log and Error Log requirements
- installation, maintenance, recovery, and transfer documentation

### Highway 38 Business Pack

- Highway 38 brand and website copy
- service catalog and pricing
- Google Form intake wording
- customer templates and samples
- product-specific fulfillment content

### Customer Configuration Layer

- customer owner/account values
- Drive, Form, Sheet, Script, Web App, Gmail, GitHub, and website IDs
- time zone, permissions, and deployment settings

## Documentation

### Operator

- [Queue Map](docs/operating-system/operator/QUEUE_MAP.md)
- [Status Dictionary](docs/operating-system/operator/STATUS_DICTIONARY.md)
- [Maintenance Checklist](docs/operating-system/operator/MAINTENANCE_CHECKLIST.md)

### Developer

- [Technical Appendix](docs/operating-system/developer/TECHNICAL_APPENDIX.md)
- [Function Map](docs/operating-system/developer/FUNCTION_MAP.md)
- [Menu Map](docs/operating-system/developer/MENU_MAP.md)
- [File Map](docs/operating-system/developer/FILE_MAP.md)
- [Installation Guide](docs/operating-system/developer/INSTALLATION_GUIDE.md)
- [Recovery Guide](docs/operating-system/developer/RECOVERY_GUIDE.md)

### Transfer and productization

- [Customer Configuration](docs/operating-system/transfer/CUSTOMER_CONFIGURATION.md)
- [Transfer Guide](docs/operating-system/transfer/TRANSFER_GUIDE.md)
- [Product Packaging Guide](docs/operating-system/transfer/PRODUCT_PACKAGING_GUIDE.md)
- [Transfer Checklist](docs/operating-system/transfer/TRANSFER_CHECKLIST.md)

## Active links

- Public website: https://rkrueth-maker.github.io/highway-38-solutions/
- Product and sample page: https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html
- Private Owner Portal link retained by owner: https://script.google.com/macros/s/AKfycbzr0hoImRF4iQ1gR90Cr17juP8PODkEWRorXxW6qralEYTGLhOU33E1wYEPU_3duQKpQg/exec

## Apps Script source scope

GitHub is authoritative for files actually exported and committed. The live Apps Script project remains authoritative for runtime files not yet exported, including the library, bound wrappers, complete menu source, Web App server/UI files, and manifest. Do not delete or replace live-only files based on inferred documentation.

## Approval rule

Customer-facing email sends, quote approvals, payment requests, social or website publishing, and final delivery remain blocked until **Rick Review Required / Owner Approval Required** is satisfied.

## Cleanup rule

Do not create numbered system versions or additional phases for routine cleanup. Historical ForgeIQ, RangeRivet Works, Shopify-prototype, test, and superseded materials are archive/history only.