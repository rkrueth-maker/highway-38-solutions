# Highway 38 Business Office

Highway 38 Business Office is a private, multi-business Google Apps Script application backed by Google Sheets and Google Drive. It adds connected customer, vendor, quoting, job, purchasing, accounting-preparation, payroll-preparation, tax-preparation, document-review, OCR-assistance, PDF, approval, proof, error, and audit workflows without replacing the existing Highway 38 intake and Owner Portal.

## Deployment model

Deploy this folder as a **separate Apps Script project**. Do not paste it into a mixed bound project until function-name collisions and manifest scopes have been reviewed.

Required Script Properties:

- `H38_BUSINESS_OFFICE_SPREADSHEET_ID`
- `H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID`
- `H38_BUSINESS_OFFICE_ROOT_FOLDER_ID`
- `H38_BUSINESS_OFFICE_DOCUMENT_FOLDER_ID`
- `H38_BUSINESS_OFFICE_PDF_FOLDER_ID`
- `H38_BUSINESS_OFFICE_EXPORT_FOLDER_ID`
- `H38_BUSINESS_OFFICE_BACKUP_FOLDER_ID`

The installer functions can write these values when run by the Owner. Credentials for outside providers must remain in Script Properties and are not required for the core build.

## Safety boundaries

- External customer actions are disabled in source.
- A quote or invoice cannot be prepared for sending unless `Send Allowed` explicitly equals `Yes`.
- A deliverable cannot be prepared for delivery unless its delivery flag explicitly equals `Yes`.
- A journal entry cannot post unless it is balanced, approved, allowed for posting, and assigned to an open accounting period.
- Payroll export requires Owner approval and `Export Allowed = Yes`; no funds move.
- Tax report finalization requires Owner approval and `Finalization Allowed = Yes`; no direct filing occurs.
- OCR suggestions remain separate from original files and official records until reviewed and approved.
- Documents are soft-voided; Drive originals are preserved.
- Duplicate record keys and document hashes are rejected.
- Every write creates audit, proof, or error evidence.

## User roles

Owner, Administrator, Staff, Bookkeeper, Payroll, and Viewer are supported. Role permissions are stored per business and checked on every server action. Payroll, restricted tax, posting, sending, export, configuration, and user access are separately restricted.

## Main source files

- `BusinessOffice_Config.gs` — system configuration, module map, and hard boundaries.
- `BusinessOffice_Auth.gs` — active-user and role authorization.
- `BusinessOffice_Core.gs` — record storage, search, saved views, numbering, audit, proof, and errors.
- `BusinessOffice_Workflows.gs` — customer, quote, work-order, job, purchasing, expense, invoice, and payment workflows.
- `BusinessOffice_Accounting.gs` — double-entry preparation, posting, reversal, period locks, and reports.
- `BusinessOffice_PayrollTax.gs` — payroll-provider export preparation and tax-preparation reports.
- `BusinessOffice_DocumentsPDF.gs` — private uploads, OCR review, corrections, and branded PDFs.
- `BusinessOffice_Installer.gs` — setup validation, backup, restore preparation, and migration controls.
- `BusinessOffice_Web.gs` and `BusinessOffice_Index.html` — private role-aware web application.
- `BusinessOffice_Test.gs` — controlled self-test.
- `BusinessOffice_LiveAcceptance.gs` — live receipt, camera, OCR, PDF, role, ledger, payroll, tax, proof, error, and rollback acceptance.

## Existing intake sync

`../business-office-sync/BusinessOffice_Sync.gs` mirrors accepted requests to the separate Business Office workbook using a separate additive project. The sync is idempotent and records a controlled hold instead of blocking the existing intake path when the Business Office is unavailable.

## Boundaries

This is an accounting-preparation system and is not represented as certified accounting software until formal accounting validation is complete. Tax features provide preparation support only, not tax advice, representation, or direct filing. Payment and payroll provider integrations remain controlled connection points and do not perform money movement in this build.

## Live acceptance

The production workflow creates or reuses a separate Apps Script project, installs non-secret IDs as Script Properties, runs `boRunSelfTest`, uploads real PNG/PDF fixtures through `boUploadDocument`, runs Drive OCR and human-review gates, generates nine branded PDFs, verifies role and approval controls, and captures authenticated desktop/mobile evidence.
