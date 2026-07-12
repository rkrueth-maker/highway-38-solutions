# Business Concept Builder

Version: `2.0.0`

The Business Concept Builder is a provider-neutral Core Engine module. It accepts a rough business concept and generates a structured owner-review operating package. It does not contain Highway 38-specific catalog language, provider credentials, customer data, or live execution code.

## Inputs

The builder accepts:

- working business name and idea;
- owner skills and experience;
- customer groups;
- service area;
- assets and equipment;
- time available and hours per week;
- launch budget;
- preferred customer contact;
- revenue goals;
- physical, digital, local, and online business models;
- restrictions and non-negotiable boundaries;
- known risks;
- current files, accounts, websites, and systems;
- expansion ideas;
- primary customer problem and finished outcome;
- optional confirmed facts.

The formal contract is `schema/business-concept-input.schema.json`.

## Generated owner-review package

Every successful run creates structured drafts for:

- business summary;
- customer/problem segments;
- free, starter, core, premium, and recurring offers;
- product ladder and product records;
- capacity/revenue/scope pricing logic;
- free lead magnet;
- add-ons;
- recurring contracts and cancellation boundaries;
- sitemap and page outlines;
- intake questions;
- SOP records;
- Business OS tenant, module, role, provider, feature-flag, theme, privacy, and control configuration;
- installer-compatible Business Pack draft;
- 30-day launch plan;
- social themes and channel-neutral drafts;
- expense categories and planning allocations;
- risks and mitigations;
- missing information;
- open owner decisions;
- 25 selected-record Tasks with dependencies;
- commercialization blockers.

The formal package contract is `schema/business-concept-package.schema.json`.

## Browser module

`business-concept-builder.html` loads the same provider-neutral core used by Node. Browser inputs remain local unless the user downloads or saves them in browser storage. The page can download:

- complete JSON package;
- Markdown owner-review brief;
- created Tasks CSV;
- Business Pack draft JSON;
- Business OS configuration draft JSON.

Sensitive-looking strings are redacted before they enter the generated package. This is a defensive control, not permission to enter credentials or private records.

## Command line

```bash
node scripts/generate-business-concept-package.js \
  --input core-engine/product/business-concept-builder/examples/synthetic-workshop-planning.input.json \
  --output /tmp/business-concept-output \
  --generated-at 2026-07-12T12:00:00.000Z
```

The CLI writes the same five owner-review files plus a generation manifest.

## Business OS installation path

The generated `businessPackDraft` is shaped for the existing transferable installer. It preserves:

- isolated tenant namespace;
- no cross-tenant reads or writes;
- selected-record execution;
- no bulk execution;
- no automatic retry;
- duplicate protection;
- Proof Log and Error Log requirements;
- owner approval for external actions;
- locked email, payment, accounting, social, website, storage, calendar, customer-portal, upload, and deployment features.

A draft may be installed only in a test or demo environment until the business owner approves the configuration, license, providers, privacy rules, catalog, and rollback plan.

## No self-approval or external action

Generation never:

- creates a legal entity or account;
- sends customer communication;
- sends a quote or invoice;
- requests or processes payment;
- activates a contract or subscription;
- publishes social content;
- spends advertising money;
- deploys a website;
- activates a provider;
- delivers customer files;
- makes engineering, guarding, safety, legal, tax, insurance, licensing, permit, or compliance conclusions.

All generated outputs use `OWNER_REVIEW_REQUIRED`, `DRAFT`, or equivalent hold states.

## Verification

```bash
node scripts/verify-business-concept-builder.js
```

Verification covers input completeness, generated section coverage, data-dependent output, price calculations, secret redaction, unique records, task dependencies, tenant separation, locked feature flags and providers, Business Pack validation, test installation, backup, tamper rejection, restore, CLI output, browser wiring, schemas, and absence of Highway 38 terminology from the transferable core.
