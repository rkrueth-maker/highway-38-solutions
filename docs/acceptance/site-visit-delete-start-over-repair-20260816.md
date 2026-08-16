# Site Visit delete / start-over repair — 2026-08-16

Physical Android observation: the active Site Visit showed **Delete Site Visit**, but using it did not produce a clean restart. Reopening could surface the previous walkthrough/session/measurement state again.

## Root cause

The existing delete path removed the local draft and server records, but loaded Business Office snapshot arrays could still retain the current Site Visit session, measurements, notes, AI review and related document rows for the rest of the running app session. The operator Site Visit manager can rebuild from those loaded rows, making a deleted visit appear to come back.

The active header delete also depended on a browser confirm dialog. The phone needs an explicit, reliable owner confirmation path.

## Repair

`commercial-app/site-visit-delete-reset-fix.js`:

- replaces the active **Delete Site Visit** click with a two-tap owner confirmation;
- delegates the actual secure delete to the existing owner-controlled delete path;
- keeps linked customer and quote records;
- clears residual local draft, attachment and pending-operation state for the deleted visit/session;
- removes the deleted visit identity from loaded `siteCaptureSessions`, `siteMeasurements`, `jobNotes`, `siteAiReviews`, `siteVisits` and related document snapshot rows;
- resets the active Site Visit state and closes the Site Visit workspace after deletion;
- reopening Site Visit therefore starts a fresh capture instead of rehydrating the deleted walkthrough/session.

No CameraX, ARCore, Quote AI, pricing, approval, sending, purchasing, payment or scheduling logic changes.

Physical Android behavior remains final acceptance authority.
