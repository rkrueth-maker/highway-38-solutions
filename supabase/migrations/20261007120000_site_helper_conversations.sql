-- Site helper conversation log: every typed question asked of the public
-- website helper (assets/js/h38-helper.js) is answered by the guarded
-- h38-site-helper edge function and logged here for owner review and for
-- enforcing the per-session / per-IP / daily answer caps.
--
-- Service-role access only: row level security is enabled with no public
-- policies, so the log is never readable from the public website or with
-- the anon key. The edge function writes with the service role.
--
-- Apply with the other Supabase migrations, then run:
--   notify pgrst, 'reload schema';

create table if not exists public.site_helper_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  ip_hash text,
  page text,
  question text not null,
  answer text,
  outcome text not null check (outcome in (
    'answered', 'routed', 'declined_offtopic',
    'capped_session', 'capped_ip', 'capped_daily',
    'not_configured', 'error', 'rejected'
  )),
  model text,
  input_tokens integer,
  output_tokens integer
);

create index if not exists site_helper_conversations_created_idx
  on public.site_helper_conversations (created_at desc);

create index if not exists site_helper_conversations_session_idx
  on public.site_helper_conversations (session_id, created_at desc);

create index if not exists site_helper_conversations_ip_idx
  on public.site_helper_conversations (ip_hash, created_at desc);

alter table public.site_helper_conversations enable row level security;
