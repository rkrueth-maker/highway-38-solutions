# H38 Reseller Scout — Build & Physical Acceptance Authority

This file is the standing build/release authority for H38 Reseller Scout. It exists so a future build cannot rely on chat memory or a green CI badge alone.

## Branch safety
- Work only on `agent/private-reseller-scout` for Scout production changes.
- Never modify, merge, retarget, or otherwise use `main` for Scout unless the owner explicitly authorizes it.
- CI-only child branches/PRs are temporary build gates only. Never merge a CI-only PR.
- Promote to `agent/private-reseller-scout` only after the exact tested source SHA is known.

## Product/location authority
- Default test and owner location is ZIP `55744` / Grand Rapids, Minnesota.
- Scout remains multi-retailer and broad resale; it must not become Home Depot-only, Dollar General-only, or tool-only.
- Desired lifecycle is FIND → VERIFY → BUY → SELL → LEARN.
- Keep navigation/flows centered on Discover, Hunt, Scan, Auctions, Watch, Inventory/More without forcing the user to manually browse every source.

## Penny Hunt authority
- Preserve the retailer-grouped Penny Hunt layout unless the owner explicitly asks to redesign it.
- One physical product must render as one Scout card even when many evidence sources report it.
- Canonical merge order is strong identity first: UPC/GTIN/barcode, retailer SKU/model/internet number, exact retailer product URL, then cautious title fallback only when no strong identity conflicts.
- A bridge row that contains both UPC and SKU must collapse previously separate UPC-only and SKU-only clusters.
- Different strong identities must never auto-merge just because titles look similar.
- Multiple pages from one domain count as one independent evidence source.
- Crawler/community evidence is discovery/corroboration evidence. Store/web checks must never erase a crawler penny signal.
- Physical in-store UPC/register scan is final local penny truth.
- Unknown penny-start date stays unknown; relative posted dates must not become fabricated penny-start dates.

## Image authority
- Prefer exact-identity image recovery: exact retailer + UPC/SKU first, then approved exact-barcode fallbacks.
- A failed image lookup must never remove a valid penny item or change its penny/store/resale truth.
- Never show an unrelated placeholder as if it were the product. Genuine unresolved items may show `No photo`.
- Keep last-known-good verified image caching/retry behavior.

## Physical Android acceptance authority
A release is NOT accepted because source looks correct, Node fixtures pass, Supabase deploys, Gradle compiles, CI is green, an APK is signed, or packaged markers exist.

The owner's actual Android phone behavior is final acceptance authority.

At minimum, every candidate must exercise the following interactive path on the exact installed build:
1. Launch and authenticate.
2. Confirm installed version/code/build SHA is visible.
3. Confirm default/search area resolves to 55744 / Grand Rapids, MN and radius controls work.
4. Discover: search and render broad resale opportunities.
5. Retail Hunt: switch Useful/Penny/Near/New 48h filters.
6. Retail Hunt: TAP EACH visible retailer header / `+` and prove it expands; tap again and prove it collapses. This is a release-blocking interaction.
7. Open at least one expanded penny card; verify title, UPC/SKU, date labels, source count, image/no-photo truth, Check Item, Source, and Watch controls.
8. Scan: barcode/manual research path and Scan → Inventory handoff.
9. Facebook Marketplace: correct 55744/Grand Rapids area, capture rendered cards, no stale `Next search`/`Capture visible` UI.
10. Auctions: radius/distance/fee unknowns remain truthful.
11. Watch: create/update/delete and shared sync.
12. Inventory: buy, offline retry/shared sync, mark sold, fees/actual profit, delete/dedupe.
13. Maintenance/Self-Test: run after the interactive checks; it supplements physical acceptance and cannot replace it.

If a physical recording shows a control receiving a tap highlight but not performing its action, the build FAILS regardless of CI status.

## Automated gates required before physical test
- JavaScript syntax checks.
- Canonical multi-source dedupe fixtures.
- A Hunt interaction fixture that simulates pointerdown/pointerup and click fallback against the actual bundled touch code and proves expand does not immediately double-toggle closed.
- Android compile.
- Exact APK package/version check.
- APK signature verification and zipalign.
- Packaged asset/Dex checks for expected current runtime and absence of stale UI strings.
- Supabase function deployment/readback for changed backend functions.

## Release/version discipline
- Never reuse a versionName/versionCode after source changes.
- Every physical candidate gets a new versionName + versionCode.
- The app must expose version, versionCode, Git SHA and CI run so phone behavior can be tied to exact bytes.
- Do not upload an earlier candidate after later repairs.

## Distribution authority
- The final exact CI-tested APK must be saved to Google Drive `/Shared with Amanda` after all automated gates pass.
- Download/materialize the Drive copy and compare SHA-256 to the CI-tested APK before calling distribution complete.
- Keep `main` untouched for Scout unless explicitly authorized.
