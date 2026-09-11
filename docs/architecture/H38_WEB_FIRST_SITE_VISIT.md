# H38 Web-First Site Visit Authority

Date: 2026-09-11

## Decision

H38 Business Office is the primary Site Visit application for owners, employees, site managers, and foremen.

A separate Site Manager Android application is **not required** for normal Site Visit capture.

The browser Site Visit recorder in `commercial-app/field-visit-video.js` is the supported default capture path. It already supports camera + microphone capture, Stop & Save, local/offline persistence, walkthrough frame extraction, private evidence storage, and private Supabase synchronization.

## Role model

`site-manager` remains a useful access/profile label inside H38 Business Office. It does not identify a separate application or a separate data system.

Owner, administrator, employee, site manager, and foreman users share the same Business Office and Supabase records. Authorization remains permission/role based.

## Native Android status

The native Android Site Scanner / CameraX code may remain available as an optional companion for capabilities that justify native code, such as enhanced recovery, future hardware/sensor integrations, or workflows that browsers cannot reliably support.

Native capture must not be a prerequisite for:

- opening Site Visit,
- recording a normal walkthrough,
- taking site photos,
- saving notes or measurements,
- completing a Site Visit,
- owner review, or
- quote handoff.

The retired `android-camera-direct-fix.js` interceptor must remain non-authoritative. It now exposes the web-first runtime contract without stealing camera, microphone, delete, or navigation authority.

## Runtime contract

`window.H38_SITE_VISIT_CAPTURE_AUTHORITY` declares:

- `primary: 'business-office-web'`
- `siteManagerAppRequired: false`
- `nativeAppRequired: false`
- `nativeCompanionOptional: true`
- `sameOfficeForOwnerEmployeesAndSiteManagers: true`
- `cameraMicrophoneViaBrowser: true`
- `offlineDraftPersistence: true`
- `privateSupabaseSync: true`

The normal browser UI should explicitly tell field users that recording happens in H38 Business Office and no separate Site Manager app is required.

## Acceptance

A browser-only phone/tablet pass is successful when a signed-in authorized user can:

1. Open H38 Business Office.
2. Open the assigned customer/job or Field route.
3. Start Site Visit.
4. Start the walkthrough camera from the browser.
5. Record video and microphone audio when browser permissions allow it.
6. Stop and save the walkthrough.
7. See the walkthrough count/evidence retained with the Site Visit.
8. Continue to detail photos, measurements, review, and quote handoff.

If live `MediaRecorder` is unavailable, H38 may fall back to the browser/device video picker. That fallback still does not require the separate Site Manager app.

## Safety boundaries

This architecture change does not grant broader permissions and does not change approval authority. Site Visit evidence remains private/internal until the existing review and quote workflow explicitly uses it. Automatic approval, customer sending, purchasing, payment, and scheduling remain disabled unless separately authorized by their existing workflows.
