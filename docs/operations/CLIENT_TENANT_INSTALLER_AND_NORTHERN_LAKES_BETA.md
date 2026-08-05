# Client Tenant Installer and Northern Lakes Closed Beta

Date: August 5, 2026  
System of record: Supabase  
Legacy Google Office: explicit rollback only

## Release structure

Highway 38 uses one shared Business Office application with isolated Supabase businesses.

Each client receives:

- A unique `businesses` row and business key.
- Supabase Auth memberships for Owner, Administrator, Staff, and Viewer roles.
- Tenant-scoped operational records protected by Row Level Security.
- A user-scoped offline queue and authorization snapshot.
- Private Supabase file storage by default.
- Optional client-owned Google Drive storage after separate OAuth onboarding.
- A customer-visible, revocable Highway 38 support membership during implementation.
- Proof and Error Log records scoped to that client.

The installer does not create another application, Supabase project, or Apps Script project.

## Controlled installer sequence

1. The authenticated Highway 38 Owner opens **Settings → Client tenant installer**.
2. Provision the client business.
3. The installer creates the business in `provisioning` state.
4. It prepares the exact-email Owner invitation and support memberships.
5. It enables the approved modules and Supabase private storage.
6. It seeds Generic Quote Customer, the business profile, onboarding checklist, and support-access record.
7. Database and browser acceptance are completed.
8. The Highway 38 Owner explicitly activates the closed beta.
9. The invited client enters the exact invited email on the branded owner-login page.
10. The client requests the secure Supabase invitation email.
11. The client opens only the newest email on the same device, chooses a password, and signs in.

Provisioning does not send the invitation or activate the client automatically.

## Northern Lakes tenant

- Business key: `northern-lakes`
- Legal/display name: Northern Lakes Property Maintenance LLC
- Owner invitation: `northernlakesproperty@gmail.com`
- Implementation support: `highway38solutions@gmail.com`
- Additional invited support: `mandakw55@gmail.com`
- Timezone: America/Chicago
- Default storage: private Supabase Storage
- Optional later storage: client-owned Google Drive
- Release stage: closed beta

Northern Lakes uses its approved diamond branding in the Office and customer quote preview.

## Northern Lakes activation page

`https://highway38solutions.com/businesses/northern-lakes/owner-login.html`

The owner enters the exact invited email and presses **Send secure activation email**. The response is intentionally non-enumerating. It does not reveal whether an address is registered or invited.

## Closed-beta workflow acceptance

Complete one real job through:

1. Create or select the customer and property.
2. Create the job.
3. Assign a task to the real staff user.
4. Add the schedule.
5. Capture a field photo and daily log.
6. Record time.
7. Build a Price Book-first quote.
8. Review all quantities, measurements, taxes, pricing, terms, and exclusions.
9. Save an invoice draft.
10. Refresh and verify the records from a second device.
11. Sign out and verify visible tenant data is cleared.
12. Confirm an online suspension overrides cached authorization.

## External-action boundary

The closed beta does not automatically:

- Send customer email or SMS.
- Deliver or approve a quote.
- Schedule work externally.
- Process payments or deposits.
- Place purchases or vendor orders.
- Fund payroll.
- File taxes.
- Publish social content or advertising.
- Release files to a customer portal.

Every such action remains disabled, draft-only, manually recorded, or separately owner-confirmed.

## Google Drive

Supabase remains authoritative even when a client later selects Google Drive.

Supabase retains:

- The document record.
- Customer and job links.
- Access classification.
- Membership and tenant authorization.
- Proof and error history.

Google OAuth credentials remain server-side and are never placed in browser code. Northern Lakes starts on private Supabase storage so Drive onboarding cannot delay the beta.

## Rollback

The former Northern Lakes Google Office deployment remains unchanged at its existing deployment ID. It is not opened automatically and must not be updated during this rollout. It appears only behind an explicit **Emergency rollback only** control on the owner-login page.
