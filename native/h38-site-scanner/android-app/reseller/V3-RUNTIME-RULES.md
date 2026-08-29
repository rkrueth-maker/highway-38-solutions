# H38 Reseller Scout V3 Runtime Rules

This document is the maintenance contract for Scout v3.0.0 and later.

## Authority

All Reseller Scout work stays on `agent/private-reseller-scout`. Do not merge, retarget, reset, or write Scout changes to `main`.

## Single-owner runtime rule

`src/main/assets/reseller/v266-actionable-intake.js` is the one owner-level runtime for V3. `v264-wide-repair.js` and `v265-facebook-acquisition-repair.js` are permanent legacy stubs. Do not add behavior back into those files.

The stable v200/v210/v220 modules remain the base implementation. V3 may replace a base function only from the single V3 owner runtime. Do not wrap the same function in multiple later patch files.

For every override, keep exactly one saved base reference when needed, for example `const renderDiscoverBase=renderDiscover`, then assign one V3 implementation. Never make a second recovery layer to repair the first recovery layer.

## Facebook rules

Facebook collection is session-assisted and automatic when Discover runs. The native collector owns browser/session acquisition. JavaScript owns truthful display and ranking.

Never hide captured Facebook cards solely because location proof is incomplete. Show the captured card with `LOCATION NEEDS PROOF`; only promote it into local ranked opportunities when location proof passes.

Authentication may appear only for `AUTH_REQUIRED` or `CHECKPOINT`. After successful authentication, return to Scout and resume collection automatically.

`COMPLETE_EMPTY` means parser/source failure to capture cards, not proof that Marketplace has zero local inventory. Do not display an endless collecting state. The UI must leave collecting state after the V3 timeout.

Do not implement anti-bot evasion, CAPTCHA bypass, security-checkpoint bypass, or cookie theft.

## Image rules

All cards use one image candidate pipeline. Preserve legitimate `data:image/*` and HTTPS candidates from product/listing fields. Reject obvious logos, placeholders, tracking pixels, banners and promo art.

Try the direct HTTPS image first. If WebView loading fails, use the native `fetchImageData` bridge. Do not remove or invalidate the whole product/listing because its image is missing.

Never fabricate a product image.

## Penny Hunt rules

Penny Hunt is evidence discovery, not local inventory truth. Community/crawler evidence may identify a candidate worth checking. Physical UPC/register scan remains final local penny truth.

Never invent exact penny price, local availability, or penny date. Unknown values stay unknown.

Provider failures are isolated with `Promise.allSettled`. One failed provider must not erase rows from another provider. If live providers fail, preserve recent sourced evidence rather than replacing the list with zero.

## Release gate

Every release must pass JavaScript syntax checks, V3 architecture tests, existing profit/penny/auction tests, Android owner APK build, package/version inspection, APK signature verification, ZIP integrity, zipalign, exact packaged-runtime marker inspection, and SHA-256 generation.

Physical Android phone behavior remains final acceptance. CI/build success is not physical PASS.
