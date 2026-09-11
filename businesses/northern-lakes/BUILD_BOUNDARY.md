# Northern Lakes Property Services — Production Build Boundary

## Authority
Build the Northern Lakes Property Services website, Customer Portal, Owner Portal, Business Office, approved image library, and marketing asset system.

## Isolation rule
Northern Lakes may reuse the Highway 38 shared Core only through isolated business configuration and approved shared interfaces. This build must not interrupt or replace the live Highway 38 business system.

Protected Highway 38 production elements:
- production URLs
- Apps Script project and deployment IDs
- authentication and roles
- Highway 38 customer and business data
- external-action approval locks
- customer isolation and proposal security
- production routing and accepted doGet
- rollback and version controls

## Northern Lakes namespace
All Northern Lakes-specific website, configuration, assets, documents, deployment records, and tests belong under `businesses/northern-lakes/` unless a separately reviewed shared-Core change is approved.

## Approved visual source
- Northern Lakes approved logo set
- Northern Lakes approved website page-design sheet
- approved AI Image Library
- owner-approved company photographs

No random stock photography, placeholder substitutions, or unapproved vehicles/equipment.

Approved equipment imagery:
- Chevrolet Duramax trucks
- Boss snow plows

## Current shared Office authority
Northern Lakes is the `northern-lakes` tenant of `/commercial-app/`, using Supabase only.
It inherits the current accepted `main` runtime, grouped desktop navigation (including
late-auth repaint), mobile navigation, permission filtering, and account identity.

Verified production baseline for this parity pass:
`c0fe208c240ef7eb21023a4c0acc0384c78b9703` (PR #932).
The current deployed production baseline is published in `/deployed-main-sha.txt`.
The historical `502de199036e76dfb1fd4eb2c1ede44d78b73b99` build and
`agent/northern-lakes-production-build` branch are not runtime authority.

Owner entry: `owner-login.html` → `owner-access.html` → the shared Office with
`businessKey=northern-lakes`. Only an active server membership can resolve that key.
The legacy PWA index is a redirect, never an alternate Office.

Publication: `.github/workflows/pages-branch-fallback.yml` adds only the approved
`businesses/northern-lakes/` subtree to the H38 Pages target. It preserves the H38 root
and excludes other tenant directories. No separate Office deployment is created.

Verification and current evidence: `OFFICE_PARITY_ACCEPTANCE.md`.
