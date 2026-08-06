# H38 Site Scanner Android test app

This is the thin Android capture client for the existing Highway 38 Business Office and Quote Builder.

- Opens `https://highway38solutions.com/commercial-app/?nativeScanner=1`.
- Exposes `window.H38NativeScanner` to the deployed Site Scanner.
- Starts a guided ARCore point-to-point measurement screen.
- Uses Depth hit tests when available and falls back to ARCore planes or points.
- Displays and saves length readings in feet and inches, rounded to the nearest 1/8 inch.
- Returns the shared `h38-site-scanner-v1` result to the active scanner session.
- Labels all native values `DEVICE_CAPTURED`.
- Corrects Android status-bar and navigation-bar insets so controls are not covered.
- Does not approve, present, send, charge, purchase, schedule, accept, or authorize work.

## Phone acceptance

1. Install or update Google Play Services for AR.
2. Install the v0.2.0 debug APK over the earlier test version.
3. Sign into the Business Office.
4. Open or save a draft quote.
5. Select **Scan Project**, start an area, and press **Measure with Camera**.
6. Move slowly while showing textured floor and wall areas until the screen says **Tracking ready**.
7. Aim the `+` crosshair and press **Set First Point**.
8. Aim at the other endpoint and press **Set Second Point**.
9. Confirm the reading is shown like `8 ft 3 1/2 in`, then press **Save This Measurement**.
10. Confirm `ARCORE_DEPTH` or `ARCORE_POINT_TO_POINT` and `DEVICE_CAPTURED` in the quote scanner.
11. Compare the result against a tape or laser.
