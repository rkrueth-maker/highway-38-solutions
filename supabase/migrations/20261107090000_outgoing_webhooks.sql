-- Outgoing webhooks (gap6, 2026-11-07) — "outgoing webhooks — works with
-- Zapier Catch Hooks and similar tools".
--
-- Owner config lives in business_module_settings, module_key
-- 'outgoing_webhooks', enabled boolean, config:
--   { secret: '<per-business HMAC secret>',
--     endpoints: [ { id, url, events: ['customer.created', ...], enabled } ] }
-- Missing row or enabled !== true means OFF for the business (the default
-- for every tenant). Owner Controls (commercial-app/owner-controls.js)
-- writes exactly this row; nothing else writes it.
--
-- Delivery is server-side and reliable by construction: EVERY event path
-- (Office client saves, the h38-customer-portal sign-quote action, Kit,
-- imports, Stripe) lands its result as a row in public.business_records,
-- so a trigger on that table enqueues one outbox row per subscribed
-- endpoint at the moment the event actually happens. The trigger is
-- exception-safe: a webhook problem can never block or fail the
-- underlying business write.
--
-- The h38-webhooks edge function drains the outbox (pg_cron every minute
-- via pg_net + the x-h38-nightly-key header, the h38-review-scheduler /
-- h38-owner-notify pattern): POSTs the stored JSON payload as-is to the
-- endpoint URL with an HMAC-SHA256 signature header
-- (X-H38-Signature: sha256=<hex of the raw body, keyed by the business's
-- secret>), retries a failed delivery up to 3 attempts with backoff, and
-- keeps the outcome on the outbox row — the outbox IS the owner-visible
-- delivery log (endpoint, event, status, attempts, last HTTP status,
-- last error, delivered time).
--
-- The 'h38-webhooks' internal job secret row is created out-of-band
-- (Supabase Management API) with a generated value, exactly like the
-- 'h38-review-scheduler' / 'h38-owner-notify' rows — never committed.

create table if not exists public.h38_webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null check (event_type in
    ('customer.created', 'quote.accepted', 'job.completed', 'invoice.paid', 'webhook.test')),
  endpoint_url text not null,
  record_collection text not null default '',
  record_key text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'failed')),
  attempts integer not null default 0,
  last_error text,
  last_status_code integer,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists h38_webhook_outbox_drain_idx
  on public.h38_webhook_outbox (status, next_attempt_at, created_at);
create index if not exists h38_webhook_outbox_business_idx
  on public.h38_webhook_outbox (business_id, created_at desc);

alter table public.h38_webhook_outbox enable row level security;
revoke all on table public.h38_webhook_outbox from anon, authenticated;
grant select, insert, update, delete on table public.h38_webhook_outbox to service_role;

comment on table public.h38_webhook_outbox is
  'Outgoing webhook outbox + delivery log (gap6). One row per (event, subscribed endpoint). The h38-webhooks edge function delivers rows; status/attempts/last_error are the owner-visible delivery status.';

-- Enqueue trigger: fires on the canonical record writes. Returns NEW
-- untouched in all paths; any internal error is swallowed so the business
-- write always succeeds.
create or replace function public.h38_webhook_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  is_on boolean;
  ev text := null;
  summ jsonb := null;
  ep jsonb;
  ep_events jsonb;
begin
  if new.record_status is distinct from 'active' then
    return new;
  end if;

  -- ---- Which event is this write? ----
  if tg_op = 'INSERT' and new.collection = 'customers' then
    ev := 'customer.created';
    summ := jsonb_build_object(
      'id', new.record_key,
      'name', coalesce(new.payload->>'Customer Name', ''),
      'email', coalesce(new.payload->>'Email', ''),
      'phone', coalesce(new.payload->>'Phone', ''));
  elsif tg_op = 'UPDATE' and new.collection = 'quotes'
        and coalesce(new.payload->>'Signed By Name', '') <> ''
        and coalesce(old.payload->>'Signed By Name', '') = '' then
    -- The portal sign-quote action stores the typed-name signature on the
    -- exact signed revision; that transition is the acceptance.
    ev := 'quote.accepted';
    summ := jsonb_build_object(
      'id', new.record_key,
      'quoteNumber', coalesce(new.payload->>'Quote Number', ''),
      'customerId', coalesce(new.payload->>'Customer ID', ''),
      'customerName', coalesce(new.payload->>'Customer Name', ''),
      'projectTitle', coalesce(new.payload->>'Project Title', ''),
      'total', coalesce((new.payload->>'Total')::numeric, 0),
      'signedBy', coalesce(new.payload->>'Signed By Name', ''),
      'signedAt', coalesce(new.payload->>'Signed At', ''));
  elsif tg_op = 'UPDATE' and new.collection = 'jobs'
        and lower(coalesce(new.payload->>'Status', '')) in ('complete', 'completed')
        and lower(coalesce(old.payload->>'Status', '')) not in ('complete', 'completed') then
    ev := 'job.completed';
    summ := jsonb_build_object(
      'id', new.record_key,
      'jobNumber', coalesce(new.payload->>'Job Number', ''),
      'projectTitle', coalesce(new.payload->>'Project Title', ''),
      'customerId', coalesce(new.payload->>'Customer ID', ''),
      'status', coalesce(new.payload->>'Status', ''));
  elsif tg_op = 'INSERT' and new.collection = 'payments' then
    ev := 'invoice.paid';
    summ := jsonb_build_object(
      'paymentId', new.record_key,
      'invoiceId', coalesce(new.payload->>'Invoice ID', ''),
      'amount', coalesce((new.payload->>'Amount')::numeric, 0),
      'method', coalesce(new.payload->>'Method', ''),
      'reference', coalesce(new.payload->>'Reference', ''));
  elsif tg_op = 'UPDATE' and new.collection = 'invoices'
        and coalesce(new.payload->>'Status', '') = 'Paid'
        and coalesce(old.payload->>'Status', '') <> 'Paid' then
    ev := 'invoice.paid';
    summ := jsonb_build_object(
      'invoiceId', new.record_key,
      'invoiceNumber', coalesce(new.payload->>'Invoice Number', ''),
      'customerId', coalesce(new.payload->>'Customer ID', ''),
      'total', coalesce((new.payload->>'Total')::numeric, 0),
      'status', 'Paid');
    -- A payment recorded moments ago already announced this invoice:
    -- never announce the same invoice twice for one payment.
    if exists (
      select 1 from public.h38_webhook_outbox o
      where o.business_id = new.business_id
        and o.event_type = 'invoice.paid'
        and o.payload->'record'->>'invoiceId' = new.record_key
        and o.created_at > now() - interval '10 minutes'
    ) then
      return new;
    end if;
  end if;

  if ev is null then
    return new;
  end if;

  -- ---- Owner config gate ----
  select ms.enabled, ms.config into is_on, cfg
  from public.business_module_settings ms
  where ms.business_id = new.business_id and ms.module_key = 'outgoing_webhooks';
  if not found or is_on is distinct from true or cfg is null then
    return new;
  end if;

  for ep in select value from jsonb_array_elements(coalesce(cfg->'endpoints', '[]'::jsonb)) as value loop
    if coalesce((ep->>'enabled')::boolean, false) is not true then
      continue;
    end if;
    if coalesce(ep->>'url', '') not like 'https://%' then
      continue;
    end if;
    ep_events := coalesce(ep->'events', '[]'::jsonb);
    if jsonb_array_length(ep_events) > 0 and not (ep_events @> to_jsonb(ev)) then
      continue;
    end if;
    insert into public.h38_webhook_outbox
      (business_id, event_type, endpoint_url, record_collection, record_key, payload)
    values
      (new.business_id, ev, ep->>'url', new.collection, new.record_key,
       jsonb_build_object(
         'event', ev,
         'timestamp', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'businessId', new.business_id::text,
         'record', summ));
  end loop;

  return new;
exception when others then
  -- A webhook must never break the business action that caused it.
  return new;
end;
$$;

drop trigger if exists h38_webhook_enqueue_trg on public.business_records;
create trigger h38_webhook_enqueue_trg
  after insert or update on public.business_records
  for each row execute function public.h38_webhook_enqueue();

-- Dispatcher schedule (pg_cron + pg_net, guarded like the owner-notify
-- migration: production has pg_cron, the clean-replay stack may not).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('h38-webhooks-1m')
      from (select 1) s where exists (select 1 from cron.job where jobname = 'h38-webhooks-1m');
    perform cron.schedule(
      'h38-webhooks-1m',
      '* * * * *',
      $cmd$
      select net.http_post(
        url := 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-webhooks',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-h38-nightly-key', (select secret_value from public.h38_internal_job_secrets where name = 'h38-webhooks' limit 1)
        ),
        body := '{"action":"drain"}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cmd$
    );
  end if;
end $$;
