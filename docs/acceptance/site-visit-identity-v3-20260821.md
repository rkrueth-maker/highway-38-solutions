# Site Visit identity v3 — 2026-08-21

Physical Android recording `1000009610.mp4` proved the prior identity repair was insufficient. Jobs still showed both Amanda's detached `LOCAL_DRAFT` and the authoritative attached Site Visit. Opening the local alias restored 0 walkthroughs / 0 photos and allowed stale local identity to overwrite the linked quote title.

## Production data repair

Amanda's authoritative completed capture session remains `SCAN-E8B07254-932B-4442-9ACF-ED1F51EF4E39`, Site Visit `VISIT-53536424-F4E0-4EEC-A25D-61562C4BD0A3`, quote `QUOTE-5F18EFD4-EA8D-4935-ADF0-30C8374B3F1B`.

The quote title was restored from `Site visit` to `Amanda's flower garden border` directly from that authoritative session. Customer ID remains `GENERIC-QUOTE-CUSTOMER`; scope and linked Site Visit/session identity were also reaffirmed from the same session. No quote, customer, capture session, walkthrough, measurement, photo, document, or other evidence record was deleted.

## Runtime repair

`site-visit-identity-write-fence-final.js` adds a final defense after the prior dedupe layer:

1. Capture Session ID / Site Visit ID / unique Quote ID / unique exact project title resolve to one server session.
2. Open/Edit is intercepted before a detached local alias can own the field screen.
3. The active Site Visit is rebuilt from server session evidence, including measurements, images, walkthrough frames, video, audio and transcript metadata.
4. If a quote is already linked to a server capture session, a sessionless or different-session Site Visit cannot save over that quote.
5. Valid same-session quote saves have customer/title/scope/Site Visit/session identity rewritten from the authoritative capture session before queueing.
6. Matching `LOCAL_DRAFT` aliases are suppressed in Jobs; genuinely different server capture sessions stay separate.
7. No automatic approval, customer send, purchasing, payment or evidence deletion is added.

Physical Android behavior remains final acceptance authority.
