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
- Keep navigation/flows centered on Discover, Hunt, Scan, Auctions, Track, with Inventory/More and Maintenance reachable without forcing the user to manually browse every source.

## Shared profitability/evidence authority — v2.2+
- Discover, Scan, Auctions and Track must use the same shared opportunity evaluation model. Do not create competing profit math per screen.
- Acquisition price, sold resale evidence, asking-market context, marketplace fees, payment fees, shipping, tax allowance, travel, buyer premium and other acquisition costs remain separate evidence inputs.
- Unknown inputs stay unknown. Never manufacture a zero to make a calculation complete.
- Active asking prices never silently become sold value. Asking-only evidence must show `ASKING MARKET ONLY` / `NEEDS COMP`, not a fabricated expected resale.
- Recommended actions are decision-first: BUY, MAYBE, PASS, NEEDS COMP, NEEDS PRICE, NEEDS LOCATION or NEEDS VERIFICATION.
- Deal Score is 0–100 only when enough evidence exists to score. It must expose reasons rather than act as an unexplained magic number.
- Provider failure is not zero results. Normalize failures to states such as SOURCE UNAVAILABLE, AUTHENTICATION REQUIRED, NOT CHECKED, PARTIAL RESULTS or NO VERIFIED RESULTS.

## Track authority — v2.2+
- Track configuration stays separate from ordinary opportunity records.
- Supported watch dimensions include exact UPC/SKU, keywords/item, category, brand/category, retailer, radius, maximum buy price, minimum expected profit, minimum ROI and minimum Deal Score.
- Repeated Track actions for the same exact item must update/dedupe rather than create duplicate rules.
- A repeated unchanged match must not create a duplicate alert. Alert identity includes the tracked rule, opportunity identity and meaningful economic state.
- BUY / TRACK / PASS decisions retain an evidence snapshot for later learning without turning Scout into full accounting software.

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
- A differing retailer-web price is displayed alongside the penny candidate; it does not delete the original penny evidence or replace its signal/post date.

## Image authority
- Prefer exact-identity image recovery: exact retailer + UPC/SKU first, then approved exact-barcode fallbacks.
- A failed image lookup must never remove a valid penny item or change its penny/store/resale truth.
- Never show an unrelated placeholder as if it were the product. Genuine unresolved items may show `No photo`.
- Keep last-known-good verified image caching/retry behavior.

## Store-location authority
- Aisle, bay, department or store-area guidance may display only when sourced.
- Never fabricate aisle/bay values.
- If specific evidence is absent, display `Store location unknown`.

## Auction authority — v2.2+
- Auctions use the shared sold-comp/profitability engine.
- Max bid must account for quantity, sold-based resale, selling costs, buyer premium, tax/payment fees, travel/freight, other acquisition costs, minimum desired profit, minimum ROI and risk buffer when known.
- Buyer premium unknown means `MAX BID NOT YET PROVEN` / `Buyer premium unknown`. Do not fake a precise maximum.
- The owner may enter missing premium/tax/travel/risk inputs and recalculate.

## Physical Android acceptance authority
A release is NOT accepted because source looks correct, Node fixtures pass, Supabase deploys, Gradle compiles, CI is green, an APK is signed, or packaged markers exist.

The owner's actual Android phone behavior is final acceptance authority.

At minimum, every candidate must exercise the following interactive path on the exact installed build:
1. Launch and authenticate.
2. Confirm installed version/code/build SHA is visible.
3. Confirm default/search area resolves to 55744 / Grand Rapids, MN and radius controls work.
4. Discover: search and render broad resale opportunities; verify the decision-first Opportunity Feed does not hide unscored candidates.
5. Retail Hunt: switch Useful/Penny/Near/New 48h filters.
6. Retail Hunt: TAP EACH visible retailer header / `+` and prove it expands; tap again and prove it collapses. This is a release-blocking interaction.
7. Open at least one expanded penny card; verify title, UPC/SKU, date labels, source count, image/no-photo truth, Check Item, Source, Watch/Track, and separated penny/web/register truth.
8. Scan: barcode/manual product identification; enter actual acquisition price; verify BUY/MAYBE/PASS or explicit NEEDS state is readable without horizontal scrolling.
9. Scan: open sold-comp detail and Why this score; return without losing the identified item or purchase price.
10. Scan: Track the item and confirm the same item appears under the primary Track destination.
11. Facebook Marketplace: correct 55744/Grand Rapids area, capture rendered cards, automated return to Scout, no stale `Next search`/`Capture visible` UI.
12. Discover exact radius: known distance 50.0 miles is included and 50.1 miles is excluded for a 50-mile selection.
13. Auctions: existing lot discovery works; research a relevant lot; premium-known case calculates max hammer bid; premium-unknown case refuses false precision.
14. Track: create exact-item watch and category/price watch; pause/resume; edit; delete; display matches; repeated unchanged match does not repeatedly alert.
15. More / Settings: Profitability Settings remains reachable.
16. Inventory: buy, offline retry/shared sync, mark sold, fees/actual profit, delete/dedupe.
17. Maintenance/Self-Test: remains reachable from Account/More and runs after the interactive checks; it supplements physical acceptance and cannot replace it.

If a physical recording shows a control receiving a tap highlight but not performing its action, the build FAILS regardless of CI status.
If a physical recording shows a runtime error before retailer disclosures render, the build FAILS even if the native disclosure contract itself passed.

## Automated gates required before physical test
- JavaScript syntax checks for the complete bundled v2 runtime.
- Canonical multi-source dedupe fixtures.
- Deterministic shared-profitability fixtures: strong BUY, marginal MAYBE/PASS, asking-only NEEDS COMP, missing price NEEDS PRICE, missing required costs NEEDS VERIFICATION, source unavailable truth, Deal Score burden ordering, glitch-candidate truth.
- Deterministic Track fixtures: 50.0/50.1 exact-radius boundary, max-buy threshold, repeated Track dedupe, unchanged-match alert dedupe.
- Deterministic auction fixtures: buyer-premium unknown refuses precision; premium-known case produces a positive responsible max hammer bid.
- A Hunt interaction fixture that proves native `<details>/<summary>` disclosure is packaged and rejects the legacy `data-hunt-group` / custom touch override.
- A cross-layer runtime dependency gate for Hunt rendering. Any helper referenced by a loaded layer, including `strictImageRetailer`, must be defined in the bundled runtime before app bootstrap can render Hunt.
- Facebook v2 automated-capture markers and exact-radius behavior retained.
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
- Keep the clean v2 architecture; do not casually resurrect the old v0.x runtime-injection stack.

## Distribution authority
- The final exact CI-tested APK must be saved to Google Drive `/Shared with Amanda` after all automated gates pass.
- Download/materialize the Drive copy and compare SHA-256 to the CI-tested APK before calling distribution complete.
- Keep `main` untouched for Scout unless explicitly authorized.
