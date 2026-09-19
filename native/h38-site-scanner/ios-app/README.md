# H38 Site Scanner — iPhone / iPad preparation

This folder is the native Apple shell for the existing H38 Business Office and Site Scanner.

## Capture policy

The app uses runtime capability detection instead of assuming a model name.

1. If `RoomCaptureSession.isSupported` is true, H38 offers a native RoomPlan/LiDAR room scan.
2. LiDAR measurements are returned as `LIDAR_ROOM` with `DEVICE_CAPTURED` verification.
3. Wall/opening widths include RoomPlan X/Z endpoints so they can feed the existing H38 geometry and drawing pipeline.
4. Critical dimensions still require owner review or field verification.
5. If RoomPlan/LiDAR is unavailable, the Business Office stays fully usable and falls back to the existing camera-guided/manual/laser workflow.

Apple documents `RoomCaptureSession.isSupported` as true only when the device contains a LiDAR Scanner. Do not maintain a hard-coded iPhone model list.

## App shell

- Minimum OS: iOS 16.
- Bundle ID: `com.highway38.sitescanner`.
- Web authority: `https://highway38solutions.com/commercial-app/`.
- Native user-agent suffix: `H38SiteScannerIOS/0.1.0`.
- Persistent WebKit data store keeps the same Business Office session model.
- The web shell owns authentication, tenant isolation, offline queueing, documents, quotes, and Supabase writes.
- Native Swift owns only Apple hardware capture and returns the existing H38 scanner JSON contract.
- Camera/microphone WebKit permission is granted only to the H38 production origin.
- The native cover waits for the same final mobile-layout readiness contract as Android.

## Generate and build locally

This project uses XcodeGen so the committed source stays small and reviewable.

```bash
brew install xcodegen
cd native/h38-site-scanner/ios-app
xcodegen generate
xcodebuild \
  -project H38SiteScannerIOS.xcodeproj \
  -scheme H38SiteScannerIOS \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

RoomPlan cannot be accepted in the Simulator. Simulator CI is compile/startup-contract validation only.

## Physical-device acceptance

Run on at least:

- one LiDAR-equipped iPhone or iPad;
- one supported non-LiDAR iPhone.

LiDAR device checks:

- cold launch has no header/business-bar jump;
- Today / Customers / Schedule / Messages / More is stable before native cover release;
- Site Visit opens normally;
- Site Scanner reports `roomPlan=true` and `lidar=true`;
- RoomPlan coaching/preview is visible;
- Finish Scan returns walls, doors, windows, and openings;
- returned widths have non-empty RoomPlan X/Z endpoints;
- values stay `DEVICE_CAPTURED` until reviewed;
- drawing/quote attachment uses the existing tenant and does not create a second database;
- camera, microphone, photos, Site Visit, documents, and offline recovery remain functional.

Non-LiDAR checks:

- app launches and signs in normally;
- Site Scanner reports `roomPlan=false`;
- no RoomPlan session is started;
- camera-guided/manual/laser measurement remains available;
- no feature falsely labels a camera-only value as LiDAR.

## TestFlight / App Store preparation

Do not create or upload a release until physical acceptance is green.

Expected release credentials for the later deployment workflow:

- `H38_IOS_DISTRIBUTION_P12_B64`
- `H38_IOS_DISTRIBUTION_P12_PASSWORD`
- `H38_IOS_PROVISIONING_PROFILE_B64`
- `H38_IOS_TEAM_ID`
- `H38_APPSTORE_CONNECT_KEY_ID`
- `H38_APPSTORE_CONNECT_ISSUER_ID`
- `H38_APPSTORE_CONNECT_PRIVATE_KEY_B64`

The approved H38 logo remains the only app-icon source. App Store icon assets should be generated from the approved `assets/highway38-logo.png`; do not redraw or substitute it.

## Release gate

Automated source/Simulator acceptance can prove the iOS app compiles and the bridge contract is wired. It cannot prove LiDAR accuracy, RoomPlan runtime behavior, camera/microphone behavior, or App Store signing. A real Apple device is the final gate.
