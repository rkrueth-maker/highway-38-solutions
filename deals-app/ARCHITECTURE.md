# H38 Deals — Three Product Architecture

Android shell: **3.1.0 / code 340**.

The installed Android package is a thin mobile WebView shell. Product behavior is hosted so Penny, Resale, and Couponing can be changed independently without replacing the APK.

## Splash / shell
- Hosted UI: `h38-deals-shell`
- Android owner package continuity: `com.highway38.resellerscout.owner`
- Android label: `H38 Deals`
- Shell URL: `https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-deals-shell`
- Shared concerns only: Supabase sign-in/session, product entitlements, phone location, barcode, voice, camera/file capture, navigation.

## Product 1 — Penny Deals
- Hosted UI: `h38-penny-web`
- Protected API: `h38-penny-api`
- Entitlement key: `penny`
- Scope: penny items, deep-clearance retail deals, nearby stores, UPC/SKU checks.
- Does not call Resale or Couponing APIs.

## Product 2 — Resale
- Hosted UI: `h38-resale-web`
- Protected API: `h38-resale-api`
- Entitlement key: `resale`
- Scope: profit-ranked opportunities, Facebook Marketplace acquisition, auctions, proven store-price opportunities, garage/estate sources.
- Does not call Penny or Couponing APIs.

## Product 3 — Couponing / Savings Copilot
- Hosted UI: `h38-coupon-web`
- Protected optimizer API: `h38-coupon-api`
- Entitlement key: `coupon`
- Tables: `coupon_shopping_lists`, `coupon_list_items`, `coupon_price_observations`, `coupon_receipts`, `coupon_watch_rules`.
- Scope: shopping lists, voice/list input, handwritten list OCR, recipe/list import, one/two/max-store optimization, travel-cost penalty, effective-price stack math, barcode comparison, receipt OCR, personal price history, deal confidence, unit price, watch rules and store-mode checklist.
- Does not call Penny or Resale APIs.

## Authorization
`public.h38_product_entitlements` grants access by `auth.uid()` and product key. The splash can show all three products while only active, unexpired entitlements open. This supports selling one product, any two, or all three from the same APK.

Highway 38 owner/admin accounts are seeded with all three entitlements for owner testing.

## Native shell rule
No Penny, Resale, Facebook, auction, coupon, price-source, optimizer or ranking logic belongs in the APK. If it can be implemented safely on the hosted side, it stays hosted. APK rebuilds are reserved for native capabilities or Android platform changes.

## Live function authority at initial split
- `h38-deals-shell` v1 — `834e753fcc83a7c77ab9e9a5bd4499fd72eb45b6b4f3b8d3acd143b2224ec2ad`
- `h38-penny-api` v1 — `447a889043a4f2b63a40898b53c3fc6b44e2676b966bf3f14d7dfd031585b468`
- `h38-resale-api` v1 — `19b2806e0186c6fa150a18799c690ee2f63cfad0ae641b38b3e97d46b36bc699`
- `h38-coupon-api` v1 — `88b01c19c33a3a4e1d23332598d17b49b84b0fd0f42d12c0589fc4556610dfa5`
- `h38-penny-web` v1 — `b4a1b9fca0f227080f827d421ea2950855fd10c4d6dc82bbdf7c7c89abd6ca78`
- `h38-resale-web` v1 — `3a416cac17c9494f03c465027388715c2375318ce5b33470bdc25abb08380f84`
- `h38-coupon-web` v1 — `98229a4d7862270117a7de64e4ce54499c4dc64be040b1d65f4178aa50f08082`
