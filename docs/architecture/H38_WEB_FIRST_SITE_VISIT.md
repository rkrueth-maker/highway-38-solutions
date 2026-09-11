# H38 Web-First Site Visit Authority

Date: 2026-09-11

## Decision

H38 Business Office is the primary Site Visit application for owners, employees, site managers, and foremen.

A separate Site Manager Android application is **not required** for normal Site Visit capture.

The browser Site Visit recorder in `commercial-app/field-visit-video.js` is the supported default capture path. It already supports camera + microphone capture, Stop & Save, local/offline persistence, walkthrough frame extraction, private evidence storage, and private Supabase synchronization.

## Office setup stays authoritative

This change does **not** replace or restructure the canonical Business Office. Desktop Office navigation, owner/admin setup, permissions, records, and normal Office pages remain authoritative.

`commercial-app/mobile-field-view.js` is only a phone presentation layer over the existing Business Office and existing `Field & Crew` shell. It does not create a second data system or a second application.

Default phone behavior is intentionally role-sensitive:

- Staff employees, site managers, and foremen default to **Field View** on a phone.
- Owners and administrators keep the accepted **Full Business Office** phone view by default.
- Any authorized field-capable user may explicitly switch between **Field View** and **Full Office**.
- An explicit user choice is remembered on that device.
- Desktop remains the normal full Business Office.

## Role model

`site-manager` remains a useful access/profile label inside H38 Business Office. It does not identify a separate application or a separate data system.

Owner, administrator, employee, site manager, and foreman users share the same Business Office and Supabase records. Authorization remains permission/role based.

## Field View

Field View is optimized for phone use and keeps the common field actions immediately available:

- Today
- Jobs
- Site Visit
- Schedule
- More

The **More** control exposes other permitted field tools plus an explicit **Open Full Business Office** action. The top bar also provides a Field View / Full Office switch for field-capable users.

Field View never expands a user's permissions. It only changes which already-authorized Office routes are emphasized on the phone.

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

The retired `android-camera-direct-fix.js` interceptor must remain non-authoritative. It now exposes the web-first runtime contract and loads the isolated mobile presentation without stealing camera, microphone, delete, Office navigation, or approval authority.

## Runtime contract

`window.H38_SITE_VISIT_CAPTURE_AUTHORITY` declares:

- `primary: 'business-office-web'`
- `officeSetupUntouched: true`
- `siteManagerAppRequired: false`
- `nativeAppRequired: false`
- `nativeCompanionOptional: true`
- `sameOfficeForOwnerEmployeesAndSiteManagers: true`
- `mobileFieldViewDefaultForStaff: true`
- `mobileFullOfficeDefaultForOwnerAdmin: true`
- `fullOfficeChoiceAlwaysAvailable: true`
- `cameraMicrophoneViaBrowser: true`
- `offlineDraftPersistence: true`
- `privateSupabaseSync: true`

The normal browser UI should explicitly tell field users that recording happens in H38 Business Office and no separate Site Manager app is required.

## Acceptance

A browser-only staff/site-manager phone pass is successful when an authorized user can:

1. Open H38 Business Office and land in the simplified Field View.
2. Open the assigned job or Site Visit route.
3. Start Site Visit.
4. Start the walkthrough camera from the browser.
5. Record video and microphone audio when browser permissions allow it.
6. Stop and save the walkthrough.
7. See the walkthrough evidence retained with the Site Visit.
8. Continue to detail photos, measurements, review, and quote handoff.
9. Choose Full Office and return to the normal permission-filtered Business Office when needed.

Owner/admin phone acceptance additionally requires that the existing normal mobile Office remains the default unless that user explicitly selected Field View.

If live `MediaRecorder` is unavailable, H38 may fall back to the browser/device video picker. That fallback still does not require the separate Site Manager app.

## Safety boundaries

This architecture change does not grant broader permissions and does not change approval authority. Site Visit evidence remains private/internal until the existing review and quote workflow explicitly uses it. Automatic approval, customer sending, purchasing, payment, and scheduling remain disabled unless separately authorized by their existing workflows.
