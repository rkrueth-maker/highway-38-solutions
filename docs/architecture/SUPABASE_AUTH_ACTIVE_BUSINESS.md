# Supabase Auth and Active-Business Resolution

## Scope

This stage extends the canonical Supabase Business Office foundation from PR #540. It does not replace the Business Office shell, create another tenant system, migrate production business records, activate Northern Lakes, or promote the isolated Supabase branch.

The current Google-native Highway 38 Business Office remains the production fallback.

## Stacked delivery

- Base branch: `platform/supabase-multitenant-foundation`
- Stage branch: `platform/supabase-auth-active-business`
- Isolated Supabase project: `uvcqnkjidllhdmjnqshk`
- Production Supabase project: `jqukmwtsgcsaruucnqja`
- Production promotion: not authorized

The Stage 2 branch must be rebased or retargeted after PR #540 is merged. It must not be merged directly into production while its foundation dependency is unmerged.

## Canonical identity boundary

Supabase Auth supplies the user identity and session. Authorization continues to use the existing:

- `businesses`
- `business_memberships`
- `business_module_settings`
- `business_proof_log`
- Row Level Security
- `private.business_access(...)`

No profile, tenant, invitation, membership, role, module-setting, Proof Log, or Error Log replacement table is introduced.

## Auth resolver

The browser calls only:

`public.business_office_auth_state()`

The public function remains `SECURITY INVOKER`. It accepts no tenant identifier and delegates to a private `SECURITY DEFINER` resolver that always filters by `auth.uid()`.

The private exact-email invitation helper:

1. requires `auth.uid()`;
2. resolves the authenticated email;
3. claims only an unbound `invited` membership with the exact normalized email;
4. refuses to create a second non-revoked membership for the same user and business;
5. records the claim in `business_proof_log`;
6. records `external_action_occurred = false`.

The resolver returns active, invited, suspended, and revoked membership states so the shell can fail closed without weakening the underlying business-table RLS policies.

## Existing-shell integration

The implementation preserves the existing top-level `commercial-app/index.html` shell and extends its current seams:

- `commercial-app/bridge.js` remains the Google fallback bridge.
- `commercial-app/supabase-auth.js` replaces `window.H38Bridge` only when the isolated preview configuration passes validation.
- `commercial-app/startup-fix.js` remains present.
- `commercial-app/supabase-startup.js` adapts the existing startup callbacks to Supabase Auth.
- Today remains the first workspace.
- The existing business selector is used only for active memberships returned by the canonical resolver.

A URL or saved `businessId` is a preference only. It never grants access.

## Auth flows

The preview shell supports:

- email and password sign-in;
- persisted and refreshed Supabase sessions;
- password-reset request;
- password-recovery callback and password update;
- invitation claim through the canonical membership resolver;
- sign-out;
- no-membership state;
- invited or provisioning state;
- suspended state;
- revoked or closed state;
- one-business automatic selection;
- multi-business selection.

No browser sign-up path is included.

## Mobile cache isolation

The IndexedDB version is advanced without deleting legacy records. Every tenant record is now physically namespaced by the authenticated Supabase user ID.

Legacy unscoped records are not read by the Supabase Auth path.

Offline startup requires all of the following:

- a locally persisted Supabase session;
- a valid user scope;
- an `active` authorization record for the same user and selected business;
- a recent online authorization check within the configured maximum age;
- a snapshot whose `authUserId`, `businessId`, and authorization status match;
- the device is actually offline.

An online suspended, revoked, invited, or no-membership result replaces the cached authorization state and cannot be bypassed with a URL or saved business ID.

## Current module boundary

This PR is Auth and active-business resolution only. The startup snapshot contains canonical business identity, role, branding, enabled module settings, and safeguard flags. Other permanent module records have not moved from Google yet.

Unsupported module writes fail closed with an explicit message that the current Google production system remains the fallback.

## Isolated database acceptance

Applied only to `uvcqnkjidllhdmjnqshk`:

- `business_office_auth_resolution`
- `harden_business_office_auth_state`

Transactional acceptance passed for:

- anonymous RPC denial;
- public resolver remaining `SECURITY INVOKER`;
- exact-email invitation claim;
- Proof Log entry with no external action;
- two active business memberships;
- Owner and Administrator role resolution;
- module-setting resolution;
- cross-business RLS denial;
- suspended denial;
- revoked denial;
- no-membership denial;
- complete fixture rollback.

Retained acceptance fixtures after rollback:

- test Auth users: `0`
- test businesses: `0`
- test memberships: `0`
- test Proof Log rows: `0`

## Advisor review

The Auth migrations introduced no new public `SECURITY DEFINER` warning. The three pre-existing Customer Portal warnings remain unchanged and separately reviewable.

Existing performance notices remain primarily unindexed foreign keys, unused indexes in the empty preview branch, multiple permissive Customer Portal policies, and Auth connection allocation. No index was removed merely because the preview branch reports it unused.

## Protected boundaries

- No production Supabase migration.
- No merge of the Supabase development branch.
- No service-role key in browser source.
- No authorization from user-editable metadata.
- No duplicate app shell.
- No automatic approval or external action.
- No automatic customer send, publishing, payment, purchase, payroll, tax filing, SMS, ad spending, or deployment.
- No Northern Lakes activation.
- `businesses/northern-lakes/deploy-request.json` remains inactive and unchanged.
- Existing Apps Script projects, deployments, Google files, Proof Log, Error Log, approvals, and records remain the rollback source.

## Remaining acceptance before readiness

- exact-head GitHub Actions;
- browser runtime acceptance against a controlled preview Auth user;
- Android cold start;
- Android resumed session;
- password-reset callback;
- same-device User A to User B cache-isolation test;
- offline startup within the authorization window;
- online suspension overriding prior cache;
- owner review of the complete Auth experience.

Passing source and database checks does not authorize production promotion or merge.
