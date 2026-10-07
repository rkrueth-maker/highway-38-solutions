-- Helper question counters (Ricky, 2026-10-07): one counted event per
-- website-helper interaction (chip tap or typed question) so we can see
-- what visitors ask about most. Counts-only by design: matched questions
-- store no text; unmatched typed questions store PII-scrubbed text so new
-- topics can be discovered. Written only by the h38-site-helper edge
-- function (service role); no public access.
create table if not exists public.helper_interactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  intent text not null,
  matched boolean not null,
  source text not null check (source in ('chip', 'typed')),
  question_text text,
  page text,
  session_id text,
  ip_hash text
);

alter table public.helper_interactions enable row level security;

create index if not exists helper_interactions_created_at_idx
  on public.helper_interactions (created_at desc);
create index if not exists helper_interactions_intent_idx
  on public.helper_interactions (intent);
