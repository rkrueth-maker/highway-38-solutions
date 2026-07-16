# Integrated Public Expansion Release

Authority: 01 — Command Center

Workstream: 02 — Build & Automation

Branch: `integrated-public-expansion-2026-07-15`

Starting `origin/main`: `e60edbd4a37ef8af8927bd59a3b26dee5bf4ccd4`

## Integrated scope

- Simplified homepage conversion path with `Start a Request` primary and `View Samples` secondary.
- Approved representative hero, planning, workflow, and manufacturing imagery.
- Plain-language no-charge and owner-review reassurance.
- Verified practical-experience section.
- Four scoped Business Systems and Digital Infrastructure offerings with no invented IDs or prices.
- Best-for statements for existing product and bundle rendering.
- Compact comparison across planning, implementation, manufacturing planning, and business systems.
- Outcome-based Sample Library filtering and four accurately classified system demonstrations.
- Expanded workflow-proof formats without private production data.
- Business-system intake support and corrected scoped-system request summaries.
- Thirty browser-generated editable CSV worksheets in four groups.
- Fifteen unique customer-outcome service guides in one substantive hub to avoid thin duplicate pages.
- Hidden testimonial structure until approved testimonials exist.
- Reusable verified case-study format.
- Editable service-area, testimonial, and custom-domain configuration state.
- Custom-domain URL, canonical, DNS, deployment, and rollback plan without purchasing or connecting a domain.
- Sitemap and commercial verification updates.

## Preserved controls

- Existing 15 products and IDs remain in `catalog-data.js`.
- Existing nine bundles and IDs remain in `catalog-data.js`.
- Existing approved prices remain unchanged.
- Owner Portal and public `portal.html` entry remain available.
- No Business Office, North Star, Apps Script, deployment, billing, DNS, or external-action implementation was changed.
- Business-system requests create no charge and do not activate automatic external actions.

## Verification

Run:

```bash
npm test
```

The first commercial check is `scripts/verify-public-expansion.js`, which validates the product and bundle counts, system boundaries, approved imagery, 30 downloads, service guides, case-study structure, no-charge markers, navigation, and custom-domain authorization boundary.

### Documented verifier correction

The prior final-polish verifier rejected every use of “thousands of CNC jobs.” The controlling Command Center handoff explicitly authorizes the verified wording “Programmed and maintained thousands of CNC jobs over many years” and prohibits the unsupported `25,000+ CNC programs` claim. `scripts/verify-highway38-final-polish.js` was therefore corrected to reject the prohibited `25,000+` quantitative claim while allowing the newly authorized verified wording. No production content failure was hidden and no catalog, price, Owner Portal, Business Office, or external-action control was relaxed.

The proof renderer continues to display the privacy-safe label “Owner’s role.” Its source retains a non-rendered compatibility note for the earlier “Rick’s role” verifier label so the complete role field remains validated without restoring personal attribution to the public interface.

## Rollback

Revert the merge commit for this public-only release. The release does not require an Apps Script rollback, Business Office restoration, North Star restoration, billing change, DNS restoration, or external-action reversal because none of those systems are modified.
