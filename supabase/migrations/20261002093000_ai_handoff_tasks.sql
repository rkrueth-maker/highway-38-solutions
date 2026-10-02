-- AI handoff queue: async work routed from the Office to Kit (Muse).
--
-- Split: the in-app OpenAI layer keeps ONLY real-time interactive work
-- (live assistant chat, live transcription, live quote building).
-- Everything async is written here as a pending task; Kit polls, claims,
-- does the work, and writes the result back for the app to pick up.
-- No trigger, schedule, or policy executes anything automatically.

create table if not exists public.ai_handoff_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  task_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','claimed','done','failed','cancelled')),
  result jsonb,
  last_error text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  claimed_by text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists ai_handoff_tasks_business_status_idx
  on public.ai_handoff_tasks (business_id, status, created_at desc);

alter table public.ai_handoff_tasks enable row level security;

drop policy if exists "members read ai handoff tasks" on public.ai_handoff_tasks;
create policy "members read ai handoff tasks"
on public.ai_handoff_tasks for select
to authenticated
using ((select private.business_access(business_id, null)));

drop policy if exists "staff create ai handoff tasks" on public.ai_handoff_tasks;
create policy "staff create ai handoff tasks"
on public.ai_handoff_tasks for insert
to authenticated
with check (
  status = 'pending'
  and (select private.business_access(business_id, array['owner','administrator','staff']))
);

drop policy if exists "administrators manage ai handoff tasks" on public.ai_handoff_tasks;
create policy "administrators manage ai handoff tasks"
on public.ai_handoff_tasks for update
to authenticated
using ((select private.business_access(business_id, array['owner','administrator'])))
with check ((select private.business_access(business_id, array['owner','administrator'])));

comment on table public.ai_handoff_tasks is
'Async AI work routed from the Office to Kit (Muse). In-app OpenAI writes pending rows; Kit claims and completes them. Nothing executes automatically.';
