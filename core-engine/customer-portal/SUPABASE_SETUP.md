# Supabase Customer Portal Setup

The existing Highway 38 customer portal now uses Supabase as the selected identity, database, and private-storage platform.

## Repository state

The implementation is fail-closed. `customer-portal-config.js` keeps `enabled: false` and contains placeholders only. The public page does not expose customer data until a Supabase project is configured and the switch is deliberately enabled.

## One-time connection steps

1. Create or select the Highway 38 Supabase project.
2. Run `supabase/migrations/20260716_customer_portal.sql`.
3. In Supabase Auth, add the deployed `customer-portal.html` URL to the allowed redirect URLs.
4. Copy the project URL and **publishable/anon key** into `customer-portal-config.js`.
5. Never place the `service_role` key in this repository or any browser file.
6. Create or invite the customer in Supabase Auth.
7. Insert one matching `public.customer_accounts` row with `auth_user_id` equal to that Auth user's UUID and `status = 'active'`.
8. Load customer-visible jobs, quotes, invoices, and file metadata with the matching `customer_id`.
9. Store portal files in the private `customer-portal` bucket under `{customer_id}/deliverables/...` or `{customer_id}/uploads/...`.
10. Run `npm run test:customer-portal-supabase`, then set `enabled: true` only after cross-customer tests pass.

## Security boundaries

- Browser code uses only the Supabase publishable key.
- Every customer-facing table has Row Level Security enabled.
- Each authenticated user maps to one active customer account.
- Quote approval is a selected-record RPC with version and duplicate-decision locks.
- Customer messages are recorded for owner review and do not trigger automatic email or SMS.
- Storage remains private; downloads use short-lived signed URLs.
- Raw payment-card data is never accepted. Invoice links may point only to HTTPS provider-hosted payment pages.
- Owner and Business Office data remain separate from this customer-facing schema.
