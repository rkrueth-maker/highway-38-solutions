# H38 Field Office and Site Scanner Android test app

This is the thin Android field client for the existing Highway 38 Supabase Business Office and Quote Builder.

- Opens `https://highway38solutions.com/commercial-app/?nativeScanner=1&fieldMode=1`.
- Opens a focused five-tab field visit: Visit, Measure, Photos, Notes, Review.
- Uses the existing user-scoped IndexedDB and Supabase operation queue for offline-first entry.
- Synchronizes queued records and private attachments through the existing tenant/RLS path when service returns.
- Exposes `window.H38NativeScanner` for guided ARCore point-to-point measurement.
- Uses Depth hit tests when available and falls back to ARCore planes or points.
- Displays and saves length readings in feet and inches, rounded to the nearest 1/8 inch.
- Labels all native values `DEVICE_CAPTURED` until checked.
- Enables Android WebView autofill, Web Authentication support, and Digital Asset Links for saved credentials.
- Does not approve, present, send, charge, purchase, schedule, accept, or authorize work.

## Install note

Version 0.2.0 used a different GitHub debug certificate. Uninstall v0.2.0 once before installing v0.3.0. Owner-test APK updates require matching signing certificates; production distribution will use a private release signing key.

## Phone acceptance

1. Install or update Google Play Services for AR.
2. Uninstall the older v0.2.0 H38 Site Scanner test app once.
3. Install the v0.3.0 APK.
4. Sign in using Android or Google Password Manager autofill.
5. Choose the customer, quote/project, work area, title, and scope.
6. Capture measurements, photos, and notes with service on and off.
7. Confirm the status changes between Online, Offline, Waiting, and Synced.
8. Reconnect and confirm queued entries arrive in the same Supabase tenant and draft quote.
9. Compare ARCore readings against a tape or laser.
