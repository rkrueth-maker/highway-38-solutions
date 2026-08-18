# Private Reseller Scout — Owner Test Build

Date: 2026-08-18

## Authority

Repository: `rkrueth-maker/highway-38-solutions`

Branch: `agent/private-reseller-scout`

Current production/main base incorporated: `906dfaced9f6940fb8f6bade3bd0e5a7a40b240b`

This branch is intentionally not merged into `main` and does not publish the Reseller Scout into the normal Highway 38 production navigation.

## Requested outcome

Build a hidden Highway 38 reseller/deal-sourcing workspace for only the two approved H38 owner accounts.

## Access boundary

Runtime access is restricted to the two approved Supabase Auth user IDs in three independent places:

1. H38 commercial shell navigation and route gating.
2. Supabase Row Level Security for `reseller_deals` and `reseller_watch_rules`.
3. JWT-authenticated `reseller-deal-feed` Edge Function allowlist.

The legacy Apps Script application shell fails closed and never surfaces this module.

The Google Play review/staff account is not on the allowlist.

## Functional build

- Reseller Scout navigation for approved users only.
- On-demand module loading; no Reseller Scout JavaScript or CSS in normal Business Office startup.
- Live current deal feed with source links.
- Barcode/UPC camera scan when `BarcodeDetector` is supported, with manual UPC fallback.
- Shared saved finds for the two approved accounts.
- Shared watch rules.
- Buy price, retail price, expected resale, fees, shipping and other-cost inputs.
- Estimated profit, ROI, margin, discount, Flip Score and BUY/WATCH/SKIP recommendation.
- Bought and Sold states.
- No automatic purchase, listing, customer send, payment, publication, ad spend or other external action.

## Data boundary

Production Supabase contains two additive private tables:

- `public.reseller_deals`
- `public.reseller_watch_rules`

Both have RLS enabled. Anonymous access is revoked. Authenticated table grants are limited to SELECT, INSERT, UPDATE and DELETE; RLS then restricts all rows to the two approved user IDs.

The Edge Function `reseller-deal-feed` is deployed with JWT verification enabled and independently checks the same two-user allowlist.

## Performance boundary

The module is declared `loadStrategy:'on-demand'` with bounded first reads (`limit(50)`). It is not included in `commercial-app/index.html`, so normal H38 startup does not download the private module.

## Verification

Permanent source verifier: `node scripts/verify-private-reseller-scout.js`

Build-only workflow: `.github/workflows/private-reseller-scout-build.yml`

The workflow verifies that current `main` is an ancestor, runs the private security/architecture verifier, runs JavaScript syntax checks, and packages an owner-test artifact. It does not deploy GitHub Pages and does not alter production.

## Acceptance status

Source and backend implementation: BUILT

Production H38 navigation: UNCHANGED

Main branch: UNCHANGED

Physical owner/browser acceptance: REQUIRED before any decision to merge or publish.
