# Highway 38 Operating System — Technical Appendix

## Runtime architecture

The current system spans multiple Google and GitHub resources:

- Google Form intake
- Intake Responses spreadsheet (`Form Responses 5`)
- Owner Review Portal spreadsheet
- container-bound Apps Script project
- Apps Script library identifier `H38OSLIB`
- private Owner Portal Web App
- Gmail draft/send path
- Drive job folders and documents
- GitHub Pages public website
- GitHub Core Engine source and documentation

## Confirmed live Apps Script components

Known from current menu/reference code, system verification, error stacks, and the synced GitHub module:

- `H38OwnerApprovedEmailSend.gs`
- `H38_OS_Library_Core.gs`
- `H38_OS_Bound_Wrappers.gs`
- Owner Portal menu/bound-menu file
- Web App server file containing `doGet`
- one or more Web App HTML files
- Apps Script manifest (`appsscript.json`)

Only exported files in GitHub are code-source-controlled. Files not yet exported are live-only dependencies and must not be deleted or rewritten from inference.

## Core safety model

- Selected-row execution only.
- Default state is blocked.
- External action requires exact Rick decision and queue allow field.
- Duplicate locks use sent time, proof ID, locked status, and/or explicit lock fields.
- Important approved actions create Proof Log records.
- Unsafe, failed, missing, or uncertain actions create Error Log records.
- No trigger, bulk processing, payment, final delivery, social publishing, or website deployment is implicit.

## Known cleanup findings

- Historical `h38MenuV6*` wrappers are compatibility names, not the preferred productized naming convention.
- `h38MenuV6ProcessSelectedIntakeRow` and `h38MenuV6SyncLatestFormResponse` are HOLD stubs and should remain deprecated until a tested replacement exists.
- The standalone approved-send module uses generic helper names that could conflict with larger live projects; avoid adding another helper with the same name.
- The active sheet header is `Gmail Draft Reference`; older code also searched abbreviated forms. New implementations must support the canonical header.
- Proof Log and Error Log writes must match the current 16-column and 14-column schemas exactly.
- Historical test proof/error records may contain old names or shifted values. They belong in archive tabs and are not templates for new writes.

## Public/private boundary

Public repository and website may contain:

- public brand copy
- sample/hypothetical assets
- public form link
- documented Owner Portal link as expressly retained by the owner
- non-secret IDs needed for deployment documentation

They must not contain:

- customer intake data
- customer emails, phone numbers, or private files
- Gmail draft/message identifiers tied to customer work
- API secrets, OAuth secrets, access tokens, passwords, private keys, or session cookies
- private Drive job-folder links

## Source-of-truth rule

- GitHub is authoritative for files actually exported and committed.
- The live Apps Script project remains authoritative for unexported runtime files.
- The Owner Review Portal spreadsheet is authoritative for queue schemas and status controls.
- The Drive Source-of-Truth Index is authoritative for navigation and ownership.