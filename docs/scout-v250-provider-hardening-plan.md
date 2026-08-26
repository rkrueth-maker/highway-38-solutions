# H38 Reseller Scout v2.5.0 — Provider hardening

Authority base: agent/private-reseller-scout @ 93d241e9aefd8755f25791445f4962d374c610b0

Goals:
- Keep paid external provider adapters optional, never required for truthful operation.
- Promote existing Android device-bound Home Depot / Dollar General checks as automatic fallback.
- Persist Facebook WebView cookies/session state and report session readiness without exposing cookie values.
- Preserve penny/remodel truth boundaries: web/device signals are evidence; register scan remains final penny truth.
- Do not reopen accepted Auctions behavior.
