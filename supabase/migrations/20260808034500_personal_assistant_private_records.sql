create table if not exists public.personal_assistant_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('inbox','task','reminder','note','routine','memory')),
  title text not null default '',
  body text not null default '',
  status text not null default 'open' check (status in ('open','done','archived')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  remind_at timestamptz,
  recurrence jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  source text not null default 'assistant',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_assistant_items_user_status_idx
  on public.personal_assistant_items (user_id, status, due_at);

create index if not exists personal_assistant_items_user_remind_idx
  on public.personal_assistant_items (user_id, remind_at)
  where status = 'open';

alter table public.personal_assistant_items enable row level security;

revoke all on table public.personal_assistant_items from anon;
grant select, insert, update, delete on table public.personal_assistant_items to authenticated;

create policy "personal assistant select own"
  on public.personal_assistant_items for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "personal assistant insert own"
  on public.personal_assistant_items for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "personal assistant update own"
  on public.personal_assistant_items for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "personal assistant delete own"
  on public.personal_assistant_items for delete
  to authenticated
  using ((select auth.uid()) = user_id);
