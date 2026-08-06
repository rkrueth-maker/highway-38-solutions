# H38 Site Scanner native capture clients

These are thin capture clients for the **same H38 Site Scanner** in the shared
Highway 38 Business Office.

They do not create another product, customer system, quote system, approval
system, authentication system, or permanent database.

## Shared bridge contract

The Business Office starts a native capture with:

```json
{
  "version": "h38-site-scanner-v1",
  "businessId": "tenant UUID",
  "customerId": "customer ID",
  "quoteId": "saved draft quote ID",
  "captureSessionId": "scanner session ID",
  "projectType": "Garage or shop",
  "allowedSources": ["ARCORE_DEPTH", "LIDAR_ROOM"]
}
```

The native client returns:

```json
{
  "version": "h38-site-scanner-v1",
  "captureSessionId": "same session ID",
  "captureMode": "ANDROID_DEPTH or LIDAR_PRECISION",
  "device": {},
  "entities": [],
  "measurements": [],
  "status": "CAPTURED"
}
```

Every measurement includes a source, confidence, and verification status.
ARCore and LiDAR values return as `DEVICE_CAPTURED`; they are never promoted to
field-verified by the client.

The web shell accepts the returned result through `window.H38NativeScanner` or
the `h38:native-scan-result` browser event, validates the session, and writes
records through the current authenticated Supabase tenant.

## Android

`android/H38SiteScannerBridge.kt` uses ARCore session, plane/depth support,
point-to-point capture, tracking guidance, and JSON conversion. A signed Android
application shell must expose this class to the Business Office WebView or
Capacitor bridge and complete real-device acceptance.

## Apple

`ios/H38SiteScannerBridge.swift` uses RoomPlan and ARKit scene reconstruction,
converts walls/doors/windows into the shared geometry result, and labels every
measurement `LIDAR_ROOM` / `DEVICE_CAPTURED`. A signed iOS application must
expose the bridge and complete LiDAR-device acceptance.

## Offline boundary

Native clients may temporarily hold an interrupted capture, but the result is
not shown as permanently saved until synchronization to the authenticated
Supabase tenant succeeds. Credentials and service-role keys never belong in the
native client.
