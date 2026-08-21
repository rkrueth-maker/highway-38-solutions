# Site Visit identity authority — 2026-08-21

Physical Android recording `1000009608.mp4` failed acceptance before Quote AI could be fairly exercised.

## Proven failure

The Jobs page rendered both the authoritative Amanda Site Visit and a detached `LOCAL_DRAFT`. Opening the detached row produced `Set up the job first` / `No quote yet — build after visit` even though Amanda already had an attached quote and server capture session.

## Repair boundary

This change stays in the Business Office web runtime. It does not modify CameraX/native walkthrough capture, Quote AI transport, or server evidence.

The final Site Visit identity authority now:

1. Resolves exact Capture Session ID first.
2. Falls back to Site Visit ID.
3. Uses Quote ID only when it identifies one unambiguous server session.
4. Uses Customer ID + exact normalized Project Title only when unambiguous.
5. Uses exact Project Title alone only when exactly one compatible server session exists.
6. Rejects fallback matches when supplied identifiers conflict.
7. Canonicalizes the visit before `H38_FIELD_VISIT.open()` restores local state.
8. Reconciles duplicate Jobs aliases with a persistent main-content observer so late async hydration cannot reintroduce the detached local row.
9. Groups only by canonical Capture Session ID, preserving genuinely different server sessions.
10. Does not delete local/server sessions, quotes, customers, measurements, documents, photos, walkthroughs, or other evidence.

## Physical acceptance still required

After deployment, the Android phone must prove:

- one logical Amanda Site Visit representation;
- opening Amanda lands on the authoritative customer/quote/session;
- 21 in and 71 in remain field-verified while 58 in stays unresolved;
- Finish / Build waits for the actual quote build;
- the same Amanda quote receives editable lines;
- quote directions render with pricing and missing-quantity input where required;
- Action Picture visual generation works without customer-photo selection;
- no repeating five-second Quote AI/auth request storm for at least 60 seconds.
