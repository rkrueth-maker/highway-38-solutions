# Highway 38 Public Examples Change Ledger

Purpose: preserve the accepted public/private examples architecture, compatibility requirements, test expectations, and release history so future changes do not repeat discovery work.

## Current accepted architecture

### Public customer-facing Examples
- Canonical route: `sample-library-now.html`
- Legacy route: `examples.html` redirects to `sample-library-now.html`
- Purpose: explain the customer journey from project information through planning, price, approval, instructions, tasks, and proof.
- Public actions: `Start a Similar Project` and `See Pricing`.
- Pricing buttons must link directly to `pricing.html`.
- Must not expose `contractor-demo.html` or `contractor-demo-quote.html` routes.
- Uses representative/hypothetical project information and clear verification disclosures.

### Private contractor demonstration
- Route: `contractor-demo.html`
- Search policy: `noindex,nofollow`
- Purpose: reusable live demonstration workspace for running contractor examples with prospects.
- Keeps interactive quote, options, approval, instructions, task, print, PDF, and copy controls.
- Pricing navigation and CTAs must link directly to `pricing.html`.

## Shared project records

The current four project examples are:
1. Flower Garden Installation
2. Class 5 Driveway
3. Premium Small Backyard Pond
4. Residential Lot Clearing

Shared source remains `assets/js/h38-contractor-demo-data.js` for the interactive contractor demo. Public examples may use explicit static HTML derived from that accepted source when repository verification requires literal image paths and content.

## Required public compatibility hooks

Until the broader public-site verification suite is deliberately redesigned, preserve these markers in `sample-library-now.html`:
- `data-page="samples"`
- `data-owner-link="true"`
- `data-image-classification="hypothetical-demonstration"`
- `data-samples="all"`
- `data-bundles`
- `data-system-scenarios`
- `data-sample-toc`

These hooks may remain hidden when they support legacy verification or routing and are not part of the visible customer experience.

## Image rules

- Use the exact eight repository-controlled project images in `assets/contractor-demo/`.
- Do not substitute stock garage photos, SVG illustrations, generated collages, or placeholder pixels.
- Every visible `<img>` must have valid alt text and a repository-resolvable path.
- Change cache keys whenever image mappings or image files change.

## Pricing-link rule

A visible button or navigation item labeled `Pricing`, `See Pricing`, or `Capabilities & Pricing` must go directly to `pricing.html` unless the owner explicitly approves a different destination. Do not route customers through an intermediate capabilities page.

## Approval and external-action boundary

- Demonstration controls do not assign workers, schedule jobs, purchase materials, contact customers, accept payments, or approve external work.
- Real project scope and price must be confirmed before work or charges begin.
- Existing owner-confirmed external-action controls remain unchanged.

## Verification expectations

Before merge, verify the exact PR head for:
- Repository tests
- Complete ecosystem hard-rule verification
- Public image verification
- Commercial system verification
- Integrated public expansion verification
- Final polish static verification
- Desktop/mobile browser verification
- Raster proof verification, or an explicitly updated replacement contract when the visible Samples architecture changes

When a visible architecture intentionally replaces a legacy page, update the stale verification contract in the same PR rather than restoring obsolete visible UI solely to satisfy old tests.

## Release history

### PR #265
Added quote-to-job instructions and task handoff to all four contractor examples.

### PR #266
Repaired damaged image binaries.

### PR #267
Mapped the correct eight project-specific before-and-after images.

### PR #268
Removed substitute SVG illustrations, imported the exact uploaded image files, and refreshed cache keys.

### PR #269
Replaced the old Contractor Demo gallery with the full Project Workflow Demo.
Merge commit: `26b863c97ae0ad01963c9dec28e9ece595e31fe8`.

### PR #270 — in progress
Objective:
- Replace the existing public Sample Library presentation with a customer-facing Project Examples workflow.
- Preserve the private Contractor Demo for direct sales demonstrations.
- Route all pricing actions directly to `pricing.html`.
- Update stale verification contracts to the new accepted architecture.

Affected files currently include:
- `sample-library-now.html`
- `contractor-demo.html`
- `scripts/verify-issue83-source.sh`
- `scripts/verify-highway38-final-polish.js`
- `scripts/verify-commercial-browser.js`
- Other verification files only when required to describe the new accepted contract.

## Required entry for every future change

Append a dated entry containing:
- Owner request
- Accepted behavior
- Files changed
- Compatibility hooks preserved or intentionally retired
- Test failures encountered and exact cause
- Verification results
- PR number
- Exact head SHA
- Merge commit
- Live URL and cache key
- Any known follow-up
