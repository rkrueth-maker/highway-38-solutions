# Highway 38 Solutions

This repository contains the Highway 38 Solutions public website, exported Core Engine source, and consolidated operator, developer, and transfer documentation.

## Source-of-truth layers

### Reusable Core Engine

- Owner Review Portal queue and status model
- owner-approval and selected-row execution rules
- complete bound Owner Review Portal Apps Script export
- exact immutable H38OSLIB version-1 archive
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

GitHub is authoritative for:

- the complete bound Owner Review Portal project under `apps-script/core-engine/owner-review-portal/`;
- the complete checksum-verifiable immutable H38OSLIB version-1 archive under `apps-script/core-engine/h38oslib/version-1-archive/`.

Selected H38OSLIB files are expanded under `apps-script/core-engine/h38oslib/version-1/` for inspection. The nested `H38OwnerLib` version-9 dependency remains live-only until separately exported.

## Approval rule

Customer-facing email sends, quote approvals, payment requests, social or website publishing, and final delivery remain blocked until **Rick Review Required / Owner Approval Required** is satisfied.

## Cleanup rule

Do not create numbered operating-system phases for routine cleanup. Historical ForgeIQ, RangeRivet Works, Shopify prototypes, tests, and superseded materials are archive/history only.
