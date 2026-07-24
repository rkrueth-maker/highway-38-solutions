# Complete Navigation, Settings, and Quote Boundary

Source baseline: `f79d659bcf655216424f59463a7501a7e8b2a202`

Purpose: define and verify every visible Business Office heading and option, the Settings/System Health boundary, and the separation between reviewing quote records and building a quote.

## Canonical headings and visible options

### Today

1. Overview
2. My Work
3. Approvals
4. Calendar

### Customers

1. New Requests
2. Customers
3. Quotes
4. Communications
5. SMS Consent

### Work

1. Work Orders
2. Jobs
3. Time Tracking
4. Equipment

### Money

1. Invoices
2. Payments
3. Expenses
4. Vendors
5. Purchase Orders
6. Vendor Bills
7. Receipts
8. Accounting Prep
9. Payroll Prep
10. Tax Prep
11. Reports

### Documents

1. Files & OCR
2. Templates

### Growth

1. Growth Center
2. Website
3. Social
4. Advertising

### Office

1. Apps & Modules
2. Business Setup
3. Users & Roles
4. Employees
5. Contractors & W-9
6. Backups
7. Proof Log
8. Error Log
9. System Health
10. Settings & Safety
11. Help & SOPs

## Quotes versus Quote Builder

### Quotes

**Quotes** is the visible customer-record workspace under **Customers**. It is used to:

- browse and search quote records;
- review quote number, customer, project, status, totals, and approval state;
- open a quote in a read/review workspace;
- inspect related records and timeline history;
- return to the quote list without entering an editing tool.

Opening **Quotes** or selecting an existing quote does not launch Quote Builder.

### Quote Builder

**Quote Builder** remains a hidden capability rather than a second navigation destination. It is used only when the user explicitly chooses to:

- create a new quote;
- edit an existing quote;
- open the focused Quote Builder dashboard;
- start a quote from customer or job context;
- use Quick Create or a create-quote command.

Quote Builder shares the same quote records, IDs, customers, documents, approvals, Proof Log, Error Log, permissions, and external-action locks. Returning from the integrated Quote Builder goes back to **Customers → Quotes**.

## Settings & Safety versus System Health

### Settings & Safety

Settings & Safety owns stable configuration and operating boundaries:

- application/package and role context;
- external-action and approval locks;
- data-protection guarantees;
- links to Apps & Modules, Business Setup, Users & Roles, Backups, and System Health.

It does not duplicate installation diagnostics, integration status, or financial exports.

### System Health

System Health owns live operating evidence:

- installation state;
- catalog state;
- integration health and blockers;
- hard-rule safety state;
- non-destructive self-test;
- direct access to Error Log and Proof Log.

### Accounting export

Accounting CSV export belongs to **Money** and is available from **Accounting Prep** and **Reports**, not Settings.

## Hidden capabilities

Quote Builder, Customer Portal, H38 AI, message-template services, approval-data services, and other internal capabilities remain hidden unless an approved visible route is added to the canonical module contract.

## Preserved controls

- One unified Business Office and one navigation tree.
- One canonical module contract and one action contract.
- Existing records, IDs, permissions, approvals, Proof Log, Error Log, backups, and audit history.
- Existing Apps Script project and deployment IDs.
- No automatic customer sends, payments, posting, payroll funding, tax filing, publishing, ad spend, deployment, or destructive action.

Automated audit: `node scripts/audit-complete-navigation-and-settings.js`
