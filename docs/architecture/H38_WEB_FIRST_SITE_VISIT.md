# H38 Web-First Site Visit Authority

Date: 2026-09-18

## Decision

H38 Business Office is the primary Site Visit application for owners, employees, site managers, and foremen.

A separate Site Manager Android application is **not required** for normal Site Visit capture.

The browser Site Visit recorder in `commercial-app/field-visit-video.js` is the supported default capture path. It supports camera + microphone capture, Stop & Save, local/offline persistence, walkthrough frame extraction, private evidence storage, and private Supabase synchronization.

## One responsive Business Office

Highway 38 Business Office uses one responsive, role-aware application shell. Owners and office users receive the Office-oriented experience. Field roles receive a simplified My Day and job-centered experience using the same records, permissions, routes, authentication, synchronization, and Business Office.

There is no ordinary user-facing Field View / Full Business Office mode switch.

- Owner/admin phone navigation remains `Today | Customers | Schedule | Messages | More`.
- Field-role phone navigation is `Today | Jobs | Schedule | Messages | More`.
- Field-role Today presents My Day: Current Work, Next Assignment, Required Before Leaving, and Remaining Today.
- Site Visit is a contextual work action launched from a job, customer, schedule item, assignment, or approved create flow; it is not a permanent field primary-navigation destination.
- Authorized secondary Office capabilities appear naturally under More and remain permission-filtered.
- Desktop remains the canonical responsive Business Office, with the same authorization model.

`commercial-app/mobile-field-view.js` is retained only as a compatibility and field-experience enhancer. It does not own a second shell. It clears or ignores the retired `h38:mobile-workspace-view:v1` preference, normalizes legacy field-mode entry into the Office shell, and applies field-role My Day/job presentation without changing data or permissions.

Legacy query parameters or installed-device state that request a field shell must recover into the one Business Office experience rather than recreate the retired mode.

## Role model

`site-manager` remains a useful access/profile label inside H38 Business Office. It does not identify a separate application or data system.

Owner, administrator, employee, site manager, and foreman users share the same Business Office and Supabase records. Authorization remains permission/role based and server enforcement remains authoritative.

Field-role presentation never expands permissions. It only emphasizes already-authorized work.

## Field workflow

The intended worker flow is:

`My Day → Current / Next Assignment → Open Job → Required Work → Proof → Complete → Next Job`

A field job is the work hub. It presents:

- customer/job context,
- status and one next action,
- Overview,
- Work,
- Proof,
- Files,
- Activity,
- job-linked time controls supported by the existing employee workspace RPCs, and
- contextual Start / Continue Site Visit.

Required proof is read from the existing task/job work requirements and existing Business Office evidence records. No separate field proof database is introduced.

Job/task labor time and whole-shift attendance remain separate concepts even when the phone experience presents related controls together.

## Site Visit

Site Visit remains a focused temporary workspace launched from work context.

The supported flow is:

`Open Job → Start / Continue Site Visit → capture evidence → Finish & Organize → durable Visit Report → return to job/customer context`

The existing Site Visit architecture remains authoritative for photos, voice/audio, notes, measurements, video where applicable, offline persistence, evidence organization, and reporting.

The native Android Site Scanner / CameraX code may remain an optional companion for capabilities that justify native code, such as enhanced recovery, hardware/sensor integrations, or workflows that browsers cannot reliably support.

Native capture must not be a prerequisite for:

- opening Site Visit,
- recording a normal walkthrough,
- taking site photos,
- saving notes or measurements,
- completing a Site Visit,
- owner review, or
- quote handoff.

The retired `android-camera-direct-fix.js` interceptor remains non-authoritative. It exposes the web-first runtime contract and loads the compatibility/role-aware phone enhancer without taking camera, microphone, delete, Office navigation, authentication, approval, or data authority.

## Runtime contract

`window.H38_SITE_VISIT_CAPTURE_AUTHORITY` declares the web-first, one-shell contract, including:

- `primary: 'business-office-web'`
- `oneBusinessOfficeShell: true`
- `fieldStaffMyDayInSameOffice: true`
- `ownerAdminOfficeNavigationPreserved: true`
- `fieldViewModeRetired: true`
- `officeSetupUntouched: true`
- `siteManagerAppRequired: false`
- `nativeAppRequired: false`
- `nativeCompanionOptional: true`
- `sameOfficeForOwnerEmployeesAndSiteManagers: true`
- `cameraMicrophoneViaBrowser: true`
- `offlineDraftPersistence: true`
- `privateSupabaseSync: true`

`window.H38_MOBILE_FIELD_VIEW` remains a compatibility API name only. Its implementation must keep `state.shell` on Office, remove retired mode toggles/preferences, and preserve one Business Office.

## Acceptance

A browser-only field-role phone pass is successful when an authorized user can:

1. Open H38 Business Office and land in My Day without choosing a mode.
2. See `Today | Jobs | Schedule | Messages | More`.
3. Open the current/next assignment and job.
4. Clock into assigned work using the existing staff time RPC.
5. Review instructions and required proof.
6. Start or continue Site Visit contextually when required.
7. Capture supported camera, audio, notes, measurements, and video evidence.
8. Finish & Organize the Site Visit and return to the originating work context.
9. Complete required proof/checklist work.
10. Clock out / complete using existing bounded staff operations.
11. Move to the next assignment without switching shells.

Owner/admin phone acceptance additionally requires that the accepted `Today | Customers | Schedule | Messages | More` navigation remains unchanged and no retired Field View toggle appears.

Old installed devices with a saved `h38:mobile-workspace-view:v1=field` preference must recover into the one Office shell. The compatibility file and owner phone authority are live-first/offline-cached so an installed PWA can migrate safely.

If live `MediaRecorder` is unavailable, H38 may fall back to the browser/device video picker. That fallback still does not require a separate Site Manager app.

## Safety boundaries

This architecture change does not grant broader permissions and does not change approval authority. Site Visit evidence remains private/internal until the existing review and quote workflow explicitly uses it. Automatic approval, customer sending, purchasing, payment, and scheduling remain disabled unless separately authorized by their existing workflows.
