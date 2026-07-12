# Highway 38 Proof and Evidence System

Release: `proof-evidence-system-2026-07-12`

This package separates private evidence discovery from public proof. It does not contain the original `backup.pst`, extracted email, raw attachments, unreviewed photographs, addresses, customer/vendor/employee records, proprietary employer material, credentials, or payment data.

## Current status

The proof pipeline, classification rules, search plan, photo-review controls, public compiler, public case registry, calculator manifest, downloads, and automated tests are implemented.

The actual `backup.pst` has **not** been processed by repository automation because its private mounted path and source hash are not available to this build. This is an exact blocker, not a waived feature.

## Preserve the original PST

Run locally in a private filesystem that is not synchronized to GitHub:

```bash
node scripts/process-private-proof-evidence.js preserve-pst \
  --source /private/evidence/backup.pst \
  --work-dir /private/proof-work
```

The command:

1. verifies the source exists and is named `backup.pst`;
2. calculates the original SHA-256 hash;
3. creates a working copy in the private work directory;
4. marks the copy read-only;
5. verifies the copy hash against the original;
6. re-hashes the original and checks its size and modification time;
7. writes a preservation manifest in the private work directory.

Extraction must be performed only from the verified working copy. The original is never extracted or modified.

## Extract privately

A PST extraction tool is intentionally not installed or invoked by repository CI. Select and install a reviewed local tool, record its name/version, and extract only the read-only working copy to a private directory such as:

```text
/private/proof-work/extracted/
```

Record the exact extraction command and tool version in the private evidence log. Never commit extracted content.

## Index extracted evidence

```bash
node scripts/process-private-proof-evidence.js index-extracted \
  --source-manifest /private/proof-work/pst-preservation-manifest.json \
  --extracted-dir /private/proof-work/extracted \
  --output /private/proof-work/private-evidence-index.json
```

The index stores source hashes, folder or path digests, dates, subject digests, sender-domain classes, attachment-name digests, extensions, matched evidence groups, status fields, and case-study links. It does not store raw message bodies, raw email addresses, or raw attachment contents.

## Search plan

`config/evidence-search-plan.json` covers:

- FeatureCAM, CADKEY/CKD, KeyCreator/Kubotek, Mastercam, CAD/CAM, posts, macros, APIs;
- CNC, Doosan, lathe, mill, bar feed, toolroom, setup, programs, cycle time;
- robot tending, blanking feeder, press, automation, vision, sensors, conveyors, pneumatics, fixtures, ROI;
- quotes, proposals, estimates, payback, vendors, purchases, projects;
- former-employer locators used only for private discovery;
- residential and shop projects, fireplaces, lake-house work, kitchens, garages, remodeling, landscaping, and concrete.

A match is only a source locator. It never becomes a public claim automatically.

## Review photographs

Create a private JSON manifest with one record per image and run:

```bash
node scripts/process-private-proof-evidence.js review-photos \
  --input /private/proof-work/photo-manifest.json \
  --output /private/proof-work/photo-review.json
```

Each image receives:

- project class;
- before/during/after/reference/unknown stage;
- privacy-risk list;
- people and metadata state;
- owner-approval state;
- `PUBLIC_SAFE`, `REDACT_AND_REVIEW`, `HOLD`, or `REJECT` decision.

People, addresses, family, customers, vendors, employees, proprietary drawings, pricing, plates, screens, mail, and location metadata require redaction or hold. Family, customer, employee, medical, credential, drawing, or pricing risks are never auto-cleared.

## Compile public proof

```bash
node scripts/process-private-proof-evidence.js compile-public \
  --output proof-system/public/public-case-studies.json
```

Only records explicitly marked `PUBLIC_SAFE` are compiled. Verified historical items require at least one corroborating source. Anonymized reconstructions may have zero public source count because they are explicitly not represented as verified historical case studies.

## Quantitative claims

Do not publish a 25,000-plus CNC program claim unless a defensible count, date range, inclusion rule, duplicate treatment, and independent corroboration are documented. Public wording remains non-quantified until then.

## Public assets

- `proof.html` — public classification, methodology, boundaries, and case summaries;
- `proof-data.js` — browser-safe case registry;
- `public/public-case-studies.json` — compiled public-safe proof data;
- `public/tools-manifest.json` — versions, formulas, assumptions, disclaimers, analytics, and related paid paths;
- `downloads/` — clean public CSVs and instructions.

## Verification

```bash
node scripts/verify-proof-evidence-system.js
```

The verifier uses synthetic private fixtures only. It tests original preservation, copy hashes, raw-content exclusion, search indexing, public compilation, privacy rejection, photo classification, calculator inventory and formula regression, download integrity, public page behavior, prohibited private terminology, and the unresolved PST blocker record.
