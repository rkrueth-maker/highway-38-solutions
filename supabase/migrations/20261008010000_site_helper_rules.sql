-- Website-helper auto-answer rules (Ricky, 2026-10-08): approved question/
-- answer pairs learned from repeated unmatched helper questions. Rules are
-- DATA, not code: the h38-site-helper edge function serves enabled rules to
-- the widget, so an approved rule goes live with no redeploy. A rule row is
-- created only after Ricky approves its exact answer text in chat; nothing
-- auto-creates or auto-enables a rule. Read/written only by the edge
-- function (service role); no public access. created_from records the
-- normalized unmatched-question cluster the rule was promoted from, which
-- also stops the same cluster being suggested twice.
create table if not exists public.site_helper_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  patterns jsonb not null default '[]'::jsonb,
  answer_text text not null,
  enabled boolean not null default true,
  created_from text,
  hit_count integer not null default 0
);

alter table public.site_helper_rules enable row level security;

create index if not exists site_helper_rules_enabled_idx
  on public.site_helper_rules (enabled);
