# H38 Site Scanner architecture and release standard

## Outcome

H38 Site Scanner is one feature inside the existing Highway 38 Business Office
and Quote Builder. It supports:

- camera-guided photo and narrated walkthrough capture;
- manual and guided laser measurements;
- deterministic geometry, conflict detection, area, perimeter, SVG, PNG, and PDF outputs;
- authenticated AI review of private site photos, narration, and measurement records;
- a native Android ARCore capture bridge;
- a native Apple RoomPlan/LiDAR capture bridge;
- explicit review and attachment of approved outputs to an editable draft quote.

It does not create another product, database, customer system, quote system,
authentication system, approval system, or permanent deployment.

## Canonical owners

| Concern | Canonical owner |
|---|---|
| Business authentication and tenant selection | Supabase Auth and active `business_memberships` |
| Permanent scanner records | Existing `public.business_records` |
| Private capture media and generated files | Existing `business-office-files` bucket |
| Browser feature and Quote Builder integration | `commercial-app/site-scanner.js` |
| Browser presentation | `commercial-app/site-scanner.css` |
| Server-side vision review | `supabase/functions/h38-site-scanner` |
| Module configuration | Existing `measure` entry in `business_module_settings` |
| Android native capture | `native/h38-site-scanner/android/H38SiteScannerBridge.kt` |
| Apple native capture | `native/h38-site-scanner/ios/H38SiteScannerBridge.swift` |
| Release verification | `scripts/verify-h38-site-scanner.js` and existing Supabase operational workflow |
| Web deployment | Existing `.github/workflows/pages.yml` |

The retired Apps Script Office is not a scanner runtime or production authority.

## Record collections

The feature uses tenant-scoped JSON records in `business_records`:

- `siteCaptureSessions`
- `siteSpatialEntities`
- `siteMeasurements`
- `siteGeometryOutputs`
- `siteAiReviews`

Every record includes the active business, quote, capture session, user, timestamps,
and review state as applicable. RLS and the existing membership access function
remain authoritative.

## Measurement model

Required sources:

- `MANUAL_ENTRY`
- `MANUAL_LASER`
- `BLUETOOTH_LASER`
- `ARCORE_DEPTH`
- `ARCORE_POINT_TO_POINT`
- `LIDAR_ROOM`
- `LIDAR_MESH`
- `CALCULATED`
- `IMPORTED`
- `CAMERA_ESTIMATE`

Required verification states:

- `UNVERIFIED`
- `DEVICE_CAPTURED`
- `FIELD_MEASURED`
- `FIELD_MEASURED_AND_CHECKED`
- `CALCULATED_FROM_VERIFIED`
- `CONFLICT_REVIEW_REQUIRED`
- `NEEDS_REMEASUREMENT`

ARCore, LiDAR, and camera estimates cannot be promoted to field-measured merely
because the device returned a value. Conflicting verified readings are displayed
and block quote attachment; they are never silently averaged.

## User workflow

1. Open or save a draft quote.
2. Press **Scan Project** or open **Site Scanner** from Measure.
3. Choose the project type.
4. Start a capture session.
5. Use the best available native capture bridge, or camera-guided capture.
6. Add site photos and record a narrated walkthrough.
7. Tap two photo points and enter a manual or laser reading when needed.
8. Review source, verification status, and confidence for every dimension.
9. Run authenticated AI site review.
10. Add the targeted missing measurements.
11. Generate deterministic geometry and an estimating drawing.
12. Resolve any measurement conflicts.
13. Attach SVG, PNG, or PDF outputs privately.
14. Explicitly attach reviewed output summaries to the editable draft quote.

No step approves, presents, sends, charges, purchases, schedules, accepts, or
authorizes work to begin.

## Offline and native boundary

The browser and native clients may hold temporary interrupted capture data.
Nothing is represented as permanently saved until synchronization to the active
Supabase tenant succeeds.

Native Android and Apple code is a capture client only. It receives the active
tenant/customer/quote/session context and returns shared JSON. It contains no
service-role key and owns no permanent database.

## Performance intake

Module/route: existing `measure` route / H38 Site Scanner  
Requested outcome: site capture, measurements, geometry, drawings, and quote attachment  
Canonical module contract entry: existing `measure` module  
Server owner: `h38-site-scanner` Edge Function  
Client owner: `commercial-app/site-scanner.js`  
Today-critical or on-demand: on-demand  
Normal first-load limit: current quote, 20 sessions, session-linked records  
Data sources and expected reads: current hydrated Supabase snapshot; one Edge Function call for AI review  
Cache key and scope: existing user/business-scoped Business Office snapshot  
Cache TTL: 0 for scanner writes; service worker shell cache for static assets  
Invalidation events: scanner save, upload, AI review, drawing generation, quote attachment  
Prefetch priority: none  
Cold target: 2 seconds after existing Business Office hydration  
Warm/cached target: 1 second  
Startup RPC impact: 0 new startup RPCs  
Startup payload impact: existing generic record hydration only  
Stale-response protection: session ID validation for native and AI results  
Previous-workspace loading behavior: scanner opens inside current shell and returns to Quote/Measure  
External-action impact: private OpenAI analysis only; no customer or financial action  
Migration/rollback plan: additive MIME/module config; remove scanner assets/function and restore prior config if rolled back  
Verification commands: `node --check commercial-app/site-scanner.js` and `node scripts/verify-h38-site-scanner.js`  
Measured before: not applicable; feature absent  
Measured after: recorded in PR and live browser verification

## Acceptance distinction

The web foundation can be technically deployed and verified by automation.
ARCore and RoomPlan source presence is not real-device acceptance. Final native
acceptance requires signed application builds and capture tests on supported
physical Android and Apple LiDAR devices. Those results must be recorded
separately and must not be inferred from source inspection.
