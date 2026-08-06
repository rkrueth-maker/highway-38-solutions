# H38 Site Scanner Android test app

This is the thin Android capture client for the existing Highway 38 Business Office and Quote Builder.

- Opens `https://highway38solutions.com/commercial-app/`.
- Exposes `window.H38NativeScanner` to the deployed Site Scanner.
- Starts an ARCore point-to-point measurement screen.
- Uses Depth hit tests when available and falls back to ARCore planes or points.
- Returns the shared `h38-site-scanner-v1` result to the active scanner session.
- Labels all native values `DEVICE_CAPTURED`.
- Does not approve, present, send, charge, purchase, schedule, accept, or authorize work.

## Phone acceptance

1. Install or update Google Play Services for AR.
2. Install the debug APK.
3. Sign into the Business Office.
4. Open or save a draft quote.
5. Select **Scan Project**, start a session, and press **Start Best Device Scan**.
6. Move slowly while showing textured floor and wall areas.
7. Aim the crosshair, set Point 1, then Point 2.
8. Press **Use Measurement**.
9. Confirm `ARCORE_DEPTH` or `ARCORE_POINT_TO_POINT` and `DEVICE_CAPTURED`.
10. Compare the result against a tape or laser.
