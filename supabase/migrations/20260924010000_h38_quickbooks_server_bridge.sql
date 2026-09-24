-- H38 QuickBooks Online server-side connector state.
-- Provider secrets/tokens are never exposed through browser-facing tables.

create table if not exists public.h38_quickbooks_connections (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  realm_id text,
  company_name text,
  mode text not null default 'production' check (mode in ('sandbox', 'production')),
  status text not null default 'disconnected',
  token_ciphertext text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.h38_quickbooks_mappings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  entity_type text not null check (entity_type in ('customer', 'invoice', 'payment', 'expense')),
  h38_record_key text not null,
  qbo_id text not null,
  qbo_sync_token text,
  provider_updated_at timestamptz,
  h38_updated_at timestamptz,
  last_sync_hash text,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, entity_type, h38_record_key),
  unique (business_id, entity_type, qbo_id)
);

create index if not exists h38_quickbooks_mappings_business_entity_idx
  on public.h38_quickbooks_mappings (business_id, entity_type);

alter table public.h38_quickbooks_connections enable row level security;
alter table public.h38_quickbooks_mappings enable row level security;

-- These are server-owned integration tables. Business Office clients receive only
-- sanitized status from the Edge Function and never query token state directly.
revoke all on table public.h38_quickbooks_connections from anon, authenticated;
revoke all on table public.h38_quickbooks_mappings from anon, authenticated;
grant select, insert, update, delete on table public.h38_quickbooks_connections to service_role;
grant select, insert, update, delete on table public.h38_quickbooks_mappings to service_role;

comment on table public.h38_quickbooks_connections is
  'Server-only QuickBooks connection metadata and encrypted OAuth token envelope per H38 business.';
comment on column public.h38_quickbooks_connections.token_ciphertext is
  'AES-GCM encrypted OAuth token envelope. Never return this column to browser clients.';
comment on table public.h38_quickbooks_mappings is
  'Tenant-bound H38 to QuickBooks identity/sync-token mappings used for idempotent reconciliation.';
