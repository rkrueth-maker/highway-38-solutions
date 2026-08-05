# Supabase Business Office — Week-One App Parity

Date: August 5, 2026 UTC  
Production baseline at start: `806a57ec8026776aa125df08ecfbf805450a64d9`

## Product decision

The Highway 38 Business Office remains one application and one interface.

- Supabase is the system of record for authentication, memberships, tenant authorization, modules, operational records, approvals, Price Book data, Proof Log, Error Log, and file metadata.
- Supabase private Storage is the default file provider.
- A client may connect its own Google Drive during controlled onboarding. Only original file bytes move to that business-owned Drive; Supabase retains the authoritative metadata, record links, assignments, access classification, proof, and error history.
- Google Drive OAuth credentials must remain server-side. They may not enter browser code or another business tenant.
- The legacy Google Apps Script Office remains rollback only. This release does not import its customer, quote, file, or operational records.

## Competitor parity reviewed

The parity audit used current official product information from:

- Jobber features and mobile app: https://www.getjobber.com/features/ and https://www.getjobber.com/features/field-service-management-app/
- Jobber Client Hub: https://www.getjobber.com/features/client-hub/
- CompanyCam photo documentation and onboarding: https://companycam.com/photo-documentation and https://companycam.com/resources/classes/companycam-demo-class
- Housecall Pro product updates: https://www.housecallpro.com/resources/may-2026-product-updates/
- ServiceTitan field-service features: https://www.servicetitan.com/market/field-service-management-software

The consistent mobile workflow patterns are:

1. One customer and property history.
2. Requests converted into jobs.
3. Jobs assigned to people and schedules.
4. Tasks, checklists, forms, notes, photos, and time completed from the field.
5. Estimates and invoices built from a controlled Price Book.
6. Customer-facing release kept separate from internal work.
7. A clear daily view of assigned work and exceptions.

## Required in the week-one H38 app

- Supabase email/password Auth and active-business resolution.
- Tenant-scoped user roles and invitations.
- Today workspace with assigned tasks and upcoming work.
- Customers and properties.
- Requests, jobs, task assignment, task status, punch lists, and change-request drafts.
- Schedule and crew assignment.
- Quote Builder, measurements, Price Book, and owner-review pricing safeguards.
- Field notes, daily logs, photos, documents, and time entries.
- Inventory transactions, material requests, fleet assignments, inspections, and maintenance.
- Internal communications plus unsent email, SMS, and portal drafts.
- Invoice, payment-record, expense, accounting, payroll-preparation, and tax-preparation records without money movement or filing.
- People, Controls, Reports, H38 AI help, and product feedback.
- User-scoped offline queue and verified offline startup window.
- Installable Android and Chromebook PWA shell.
- Private Supabase file storage by default.
- Optional client-owned Google Drive provider boundary.
- Proof Log and Error Log entries with `external_action_occurred = false`.

## Deliberately not enabled in the week-one release

- Automatic customer email or SMS.
- Automatic reminders or on-my-way messages.
- Quote approval or customer delivery without owner action.
- Payment processing or deposits.
- Purchases or vendor ordering.
- Payroll funding or direct deposit.
- Tax filing.
- Automatic social publishing or advertising.
- Route optimization and GPS employee tracking.
- Public photo galleries.
- Google Drive connection without explicit per-business OAuth onboarding.
- Google Apps Script record migration.
- Northern Lakes activation.

## File-provider contract

Every business has one selected file provider:

- `supabase`: private `business-office-files` bucket, tenant folder prefix, RLS-protected.
- `google_drive`: client-owned root folder, explicit connection status, server-side OAuth, no public sharing permission created by H38.

The browser stores no Google refresh token, OAuth client secret, Supabase service-role key, or cross-business credential.

A failed provider upload remains in the user-scoped offline queue and writes an Error Log record. H38 does not silently move a Google Drive business file into Supabase Storage after that business selected Drive.

## Release acceptance gates

1. All migration and JavaScript syntax verification passes.
2. Cross-business RLS denial passes for operational records and file settings.
3. Owner, Administrator, Staff, and Viewer behavior is verified.
4. Task assignment survives refresh and cross-device sign-in.
5. Offline task, field note, daily log, time entry, and photo queues reconnect safely.
6. Sign-out removes visible tenant state and user-scoped cache access.
7. No external action occurs during the complete workflow test.
8. Android installation and cold-start acceptance passes.
9. Chromebook installation and resumed-session acceptance passes.
10. Google rollback opens only through the explicit rollback choice.
