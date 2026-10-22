-- Accountant view share links (Phase 1, 2026-10-22).
--
-- A business owner/administrator can mint a long, unguessable token URL that
-- an outside accountant opens with NO login to see a read-only, live
-- spreadsheet workbook of that business's money data (computed at open by
-- the h38-accountant-view edge function from business_records).
--
-- Security model:
--  - Only the SHA-256 hash of the token is stored; the raw token is shown
--    once at creation and can never be recovered from the database.
--  - This table is service-role only: RLS is enabled with NO policies for
--    anon/authenticated, so every access flows through the edge function,
--    which scopes strictly by the business_id stored on the link row.
--  - Revocation is a timestamp; a revoked (or unknown) token serves nothing.
--  - Opens are counted on the row (open_count / last_opened_at) so the owner
--    can see whether the accountant has looked.

create table if not exists public.accountant_share_links (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  token_hash     text not null unique,
  token_prefix   text not null default '',
  label          text not null default '',
  created_by     uuid,
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  last_opened_at timestamptz,
  open_count     integer not null default 0
);

create index if not exists accountant_share_links_business_idx
  on public.accountant_share_links (business_id, created_at desc);
create index if not exists accountant_share_links_token_hash_idx
  on public.accountant_share_links (token_hash);

alter table public.accountant_share_links enable row level security;

-- No anon/authenticated policies on purpose: the edge function uses the
-- service role after validating the token hash or the caller's membership.
comment on table public.accountant_share_links is
  'Read-only accountant workbook share links. token_hash = hex SHA-256 of the raw token; raw token is never stored. Service-role access only (RLS on, no public policies).';
