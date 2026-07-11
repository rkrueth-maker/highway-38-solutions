# Highway 38 Commercial System — Deployment Package

Status: **Built on `commercial-overhaul`; not deployed**  
Pull request: **#19 — draft**  
Required gate: **Rick Review Required / Owner Approval Required**

## 1. Build scope

The branch implements the complete approved commercial system:

- 15 controlled products
- 9 outcome bundles
- one authoritative public-safe catalog source
- outcome-first homepage and solution paths
- complete product scope and pricing hierarchy
- one all-product Samples hub
- customer-focused How It Works and FAQ
- Digital Workflow and Manufacturing/Automation specialty pages
- outcome-first intake guide with product and bundle preselection
- controlled Google Form builder
- legacy path redirects
- automated source and privacy checks
- rendered browser checks and screenshot artifacts
- existing Python regression suite

No public deployment or live form replacement is included in the branch.

## 2. Controlled catalog source

`catalog-data.js` is the public-safe authority for:

- product and bundle IDs
- public names and families
- public prices
- summaries and detailed scope
- required inputs
- deliverables and formats
- turnaround and revision allowances
- scope limits and exclusions
- professional boundaries
- payment wording
- upgrade paths
- bundle membership
- sample content
- outcome routing
- public request and Owner Portal URLs

Internal labor and margin data remains in the private Master Product Scope Register in the Product Fulfillment Backend.

## 3. Website file-change list

### Added

- `catalog-data.js`
- `commercial.css`
- `commercial.js`
- `solutions.html`
- `how-it-works.html`
- `apps-script/commercial-intake/FormBuilder.gs`
- `apps-script/commercial-intake/appsscript.json`
- `scripts/verify-commercial-system.js`
- `scripts/browser-commercial-smoke.sh`
- `.github/workflows/commercial-system-check.yml`
- `docs/commercial-system/README.md`
- `docs/commercial-system/DEPLOYMENT_PACKAGE.md`

### Rebuilt

- `index.html`
- `products.html`
- `pricing.html`
- `sample-library-now.html`
- `start-request.html`
- `faq.html`
- `ai-workflow.html`
- `shop-automation.html`

### Controlled redirects

- `packages.html` → `products.html#bundles`
- `examples.html` → `sample-library-now.html`
- `sample-workbooks.html` → `sample-library-now.html`
- `automation-examples.html` → manufacturing section of Samples hub
- `backend-system.html` → `how-it-works.html`

## 4. Product Fulfillment Backend changes

### Active controlled records

- Product Menu — 15 products
- Master Product Scope Register — complete 40-field record for every product
- Outcome Bundles — 9 bundles
- Intake Routing — 8 customer outcomes
- Product Build Sheets CONTROLLED
- Bundle Build Sheets
- QA Matrix — 24 sellable units
- Proof Asset Register — 15 products
- Archive Redirect Map
- Product SOP Register — 15 product SOP records
- Customer Templates — 19 draft-only templates
- Acceptance Tests — 24 sellable units

### Preserved archive

- Archive - Product Menu 2026-07-11
- Archive - Automation Products 2026-07-11

The former separate Automation Products tab is marked superseded and points to the controlled records. Historical records were not deleted.

## 5. Intake implementation

`start-request.html` provides:

- the approved first question: “What would you like to have when this is finished?”
- eight outcome choices
- product and bundle preselection
- conditional planning questions
- conditional implementation and access-boundary questions
- conditional manufacturing questions
- structured request-summary generation
- copy and email handoff
- current approved Google Form as the final live endpoint

`FormBuilder.gs` can create the approved outcome-first Google Form after owner-approved execution. It:

- creates a separate form
- requires an approved response-spreadsheet Script Property
- does not replace the current form automatically
- does not send email
- does not create triggers
- returns the edit and published URLs with owner-review status

## 6. Automated test package

### Commercial source verification

The Node suite checks:

- 15 products and 9 bundles
- unique IDs
- all 24 approved prices
- valid bundle component IDs
- required product scope and sample data
- required files
- internal local links
- removal of legacy catalog language
- targeted public privacy and secret patterns
- Owner Portal location and controlled URL
- outcome-first intake wording
- FormBuilder send and trigger safety

### Rendered browser verification

The browser suite uses a local HTTP server and headless Chrome to check:

- source loading and basic accessibility structure for all active pages
- 15 rendered product details
- 9 rendered product-page bundles
- 15 rendered product samples
- 9 rendered sample-page bundle cards
- 6 rendered manufacturing products
- rendered Owner Portal link
- rendered outcome-first request question
- controlled bundle data in intake
- public quality statement
- desktop and mobile screenshots

### Existing regression suite

The branch continues to run the repository’s Python test suite. The commercial workflow captures the full report as an artifact in addition to the existing test workflow.

## 7. Accessibility checks

Automated checks include:

- one main heading on each active page
- skip link
- main navigation landmark
- keyboard focus styles
- labeled form controls
- responsive navigation
- desktop and mobile rendering screenshots

Final deployment verification must also review text contrast and reading order and menu operation in the deployed GitHub Pages environment.

## 8. Privacy and secret controls

The automated scan checks active public files for:

- known private email and phone examples
- API-key patterns
- private-key blocks
- bearer-token patterns

Public pages must not contain customer names or contact details or private Drive links or Gmail identifiers or credentials or tokens or internal labor and margin data.

The Owner Portal link remains in the existing owner-approved Samples footer location. Portal contents and customer records are not embedded publicly.

## 9. Redirect map

The complete legacy-name and URL map is maintained in the Product Fulfillment Backend Archive Redirect Map. Public redirects preserve compatibility while removing conflicting active catalogs.

## 10. Deployment procedure

1. Confirm both PR workflows are green.
2. Review the commercial verification and browser screenshot artifacts.
3. Confirm Product Menu and Master Product Scope Register match `catalog-data.js`.
4. Confirm the current live intake form remains the approved endpoint or execute and verify the controlled FormBuilder after Rick approval.
5. Confirm response-sheet mapping and owner queue routing.
6. Review the Product Fulfillment Backend timezone before date-sensitive automation changes.
7. Confirm Owner Portal link and access behavior.
8. Confirm no public customer data or secrets.
9. Record Rick deployment approval.
10. Merge PR #19 using the approved merge method.
11. Confirm GitHub Pages build.
12. Run live URL and mobile checks.
13. Record deployment proof in Proof Log.

## 11. Rollback procedure

1. Stop further publishing or intake-link changes.
2. Confirm current deployed commit and failure evidence.
3. Revert the PR merge commit or restore the pre-merge `main` commit.
4. Confirm GitHub Pages rebuilds the prior site.
5. Restore the prior approved form URL when it was changed.
6. Do not alter the preserved backend archive tabs.
7. Verify homepage and current form and Owner Portal link.
8. Record rollback proof and any error record.
9. Do not retry deployment automatically.

## 12. Known limitations

- The site is not deployed from this branch.
- The current live Google Form still uses its earlier response schema until an approved controlled replacement is created and mapped.
- The Product Fulfillment Backend spreadsheet timezone currently reports `Etc/GMT`; review is required before date-sensitive automation changes.
- GitHub Pages live behavior can only be fully confirmed after an approved merge and deployment.

## 13. Go / no-go rule

**Build readiness:** GO when both CI workflows are green and visual artifacts are reviewed.  
**Deployment readiness:** NO-GO until the live intake mapping is confirmed and Rick explicitly approves merge and deployment.

The branch must not be merged or deployed automatically.
