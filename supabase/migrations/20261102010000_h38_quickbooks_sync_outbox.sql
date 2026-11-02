-- H38 QuickBooks Online two-way sync core (Wave 3 tail #1, 2026-11-01).
-- Outbox of pending Office -> QuickBooks changes plus the owner-visible error
-- queue: every failed sync attempt lands here with its reason and can be
-- retried. Inbound QuickBooks -> Office payments are recorded as synced
-- direction='in' rows for audit. Server-owned like the connection/mapping
-- tables: browser clients only ever see sanitized queue state from the
-- h38-quickbooks-bridge Edge Function.

create table if not exists public.h38_quickbooks_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  entity_type text not null check (entity_type in ('customer', 'invoice', 'payment')),
  h38_record_key text not null,
  direction text not null default 'out' check (direction in ('out', 'in')),
  operation text not null default 'upsert' check (operation in ('upsert', 'delete')),
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'synced', 'failed')),
  attempts integer not null default 0,
  last_error text,
  qbo_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  unique (business_id, entity_type, h38_record_key, direction)
);

create index if not exists h38_quickbooks_sync_outbox_business_status_idx
  on public.h38_quickbooks_sync_outbox (business_id, status, direction);

alter table public.h38_quickbooks_sync_outbox enable row level security;
revoke all on table public.h38_quickbooks_sync_outbox from anon, authenticated;
grant select, insert, update, delete on table public.h38_quickbooks_sync_outbox to service_role;

comment on table public.h38_quickbooks_sync_outbox is
  'QuickBooks two-way sync outbox + error queue. Failed rows carry last_error for the owner and are reset to pending by the retry action.';

-- Inbound pull cursor: newest QuickBooks payment already pulled per business.
alter table public.h38_quickbooks_connections
  add column if not exists last_inbound_at timestamptz;
