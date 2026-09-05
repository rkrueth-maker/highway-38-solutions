-- Highway 38 Business Office Supabase traffic-efficiency repair.
--
-- Goals:
--   * Preserve Supabase RLS and tenant isolation.
--   * Resolve the current user's active business memberships once per SQL statement
--     instead of once per candidate business_records / audit-log row.
--   * Preserve Staff assigned-work row scoping without repeated membership lookups.
--   * Keep real production errors while collapsing identical rapid repeats into an
--     occurrence counter.
--   * Add only the missing error-log hot-path index.
--
-- Client-side caches remain convenience/performance only. These functions and RLS
-- policies remain the independent database authorization boundary. No service-role
-- credentials or public-data bypass is introduced.

create or replace function private.current_business_access_context()
returns jsonb
language sql
stable
security definer
set search_path='pg_catalog','auth','public','private'
as $$
  select coalesce(
    jsonb_object_agg(
      membership.business_id::text,
      jsonb_build_object(
        'role',membership.role,
        'membershipId',membership.id::text,
        'authUserId',membership.auth_user_id::text,
        'email',lower(btrim(coalesce(membership.invited_email,'')))
      )
    ),
    '{}'::jsonb
  )
  from public.business_memberships membership
  where membership.auth_user_id=(select auth.uid())
    and membership.status='active'
$$;
revoke all on function private.current_business_access_context() from public,anon;
grant execute on function private.current_business_access_context() to authenticated;

create or replace function private.business_context_allows(
  p_context jsonb,
  p_business_id uuid,
  p_allowed_roles text[] default null
)
returns boolean
language sql
immutable
set search_path='pg_catalog'
as $$
  select case
    when p_context is null or p_business_id is null then false
    when not (p_context ? p_business_id::text) then false
    when p_allowed_roles is null then true
    else coalesce(p_context->p_business_id::text->>'role','')=any(p_allowed_roles)
  end
$$;
revoke all on function private.business_context_allows(jsonb,uuid,text[]) from public,anon;
grant execute on function private.business_context_allows(jsonb,uuid,text[]) to authenticated;

create or replace function private.employee_task_assigned_context(
  p_context jsonb,
  p_business_id uuid,
  p_payload jsonb
)
returns boolean
language sql
immutable
set search_path='pg_catalog'
as $$
  select coalesce(p_context->p_business_id::text->>'role','')='staff'
    and (
      coalesce(p_payload->>'Assigned User ID','')=coalesce(p_context->p_business_id::text->>'authUserId','')
      or coalesce(p_payload->>'Assigned User ID','')=coalesce(p_context->p_business_id::text->>'membershipId','')
      or lower(btrim(coalesce(p_payload->>'Assigned Email','')))=coalesce(p_context->p_business_id::text->>'email','')
    )
$$;
revoke all on function private.employee_task_assigned_context(jsonb,uuid,jsonb) from public,anon;
grant execute on function private.employee_task_assigned_context(jsonb,uuid,jsonb) to authenticated;

create or replace function private.employee_job_assigned_context(
  p_context jsonb,
  p_business_id uuid,
  p_job_id text
)
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','private'
as $$
  select coalesce(nullif(btrim(p_job_id),''),'')<>'' and exists (
    select 1
    from public.business_records task
    where task.business_id=p_business_id
      and task.collection='tasks'
      and task.record_status='active'
      and coalesce(task.payload->>'Job ID','')=p_job_id
      and private.employee_task_assigned_context(p_context,p_business_id,task.payload)
  )
$$;
revoke all on function private.employee_job_assigned_context(jsonb,uuid,text) from public,anon;
grant execute on function private.employee_job_assigned_context(jsonb,uuid,text) to authenticated;

create or replace function private.business_record_row_access_context(
  p_context jsonb,
  p_business_id uuid,
  p_collection text,
  p_payload jsonb,
  p_created_by uuid,
  p_write boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_entry jsonb:=coalesce(p_context->p_business_id::text,'{}'::jsonb);
  v_role text:=coalesce(v_entry->>'role','');
  v_uid uuid:=nullif(v_entry->>'authUserId','')::uuid;
  v_job_id text:=coalesce(p_payload->>'Job ID','');
begin
  if v_role in ('owner','administrator') then
    -- Generic business_records writes remain prohibited for time entries. The
    -- audited time RPCs remain the only time-write authority.
    return not (p_write=true and p_collection='timeEntries');
  end if;

  if v_role='viewer' then
    return p_write=false and p_collection in (
      'customers','contacts','properties','requests','jobs','workOrders','tasks','scheduleEvents','jobNotes',
      'quotes','measurements','documents','attachments','invoices','portalThreads','portalMessages'
    );
  end if;

  if v_role<>'staff' then return false; end if;

  if p_collection='tasks' then
    return p_write=false and private.employee_task_assigned_context(p_context,p_business_id,p_payload);
  end if;

  if p_collection='jobs' then
    return p_write=false and private.employee_job_assigned_context(
      p_context,p_business_id,coalesce(p_payload->>'Job ID',p_payload->>'jobId','')
    );
  end if;

  if p_collection='scheduleEvents' then
    return p_write=false and (
      private.employee_task_assigned_context(p_context,p_business_id,p_payload)
      or private.employee_job_assigned_context(p_context,p_business_id,v_job_id)
    );
  end if;

  if p_collection in ('workOrders','jobNotes','dailyLogs','checklists','measurements','documents','attachments') then
    return private.employee_job_assigned_context(p_context,p_business_id,v_job_id)
      and (p_write=false or p_created_by=v_uid);
  end if;

  return false;
end
$$;
revoke all on function private.business_record_row_access_context(jsonb,uuid,text,jsonb,uuid,boolean) from public,anon;
grant execute on function private.business_record_row_access_context(jsonb,uuid,text,jsonb,uuid,boolean) to authenticated;

-- The scalar SELECT around current_business_access_context() is intentional: it is
-- row-invariant for a request and allows PostgreSQL to evaluate it as an initPlan
-- once per statement, while the row-aware helper still checks every candidate row.
drop policy if exists "members read business records" on public.business_records;
create policy "members read business records"
on public.business_records for select
to authenticated
using (
  private.business_record_row_access_context(
    (select private.current_business_access_context()),
    business_id,collection,payload,created_by,false
  )
);

drop policy if exists "staff create business records" on public.business_records;
create policy "staff create business records"
on public.business_records for insert
to authenticated
with check (
  private.business_record_row_access_context(
    (select private.current_business_access_context()),
    business_id,collection,payload,created_by,true
  )
  and created_by=(select auth.uid())
  and updated_by=(select auth.uid())
  and record_status='active'
);

drop policy if exists "staff update business records" on public.business_records;
create policy "staff update business records"
on public.business_records for update
to authenticated
using (
  private.business_record_row_access_context(
    (select private.current_business_access_context()),
    business_id,collection,payload,created_by,true
  )
)
with check (
  private.business_record_row_access_context(
    (select private.current_business_access_context()),
    business_id,collection,payload,created_by,true
  )
  and updated_by=(select auth.uid())
);

-- Audit history stays management-only. It is still available for reports/on-demand
-- review; the authorization lookup is simply statement-scoped instead of row-scoped.
drop policy if exists "members read proof log" on public.business_proof_log;
create policy "members read proof log"
on public.business_proof_log for select
to authenticated
using (
  private.business_context_allows(
    (select private.current_business_access_context()),
    business_id,array['owner','administrator']::text[]
  )
);

drop policy if exists "administrators read error log" on public.business_error_log;
create policy "administrators read error log"
on public.business_error_log for select
to authenticated
using (
  private.business_context_allows(
    (select private.current_business_access_context()),
    business_id,array['owner','administrator']::text[]
  )
);

-- Error history remains durable. Repeated identical errors in a short loop are
-- counted on the first row instead of creating hundreds of indistinguishable rows.
alter table public.business_error_log
  add column if not exists occurrence_count integer not null default 1,
  add column if not exists last_seen_at timestamptz;

update public.business_error_log
set last_seen_at=coalesce(last_seen_at,created_at)
where last_seen_at is null;

alter table public.business_error_log
  drop constraint if exists business_error_log_occurrence_count_check;
alter table public.business_error_log
  add constraint business_error_log_occurrence_count_check check (occurrence_count>=1);

-- Existing business_error_log_business_status_idx cannot serve the hot
-- business_id + created_at ordering because status is the middle key.
create index if not exists business_error_log_business_created_idx
  on public.business_error_log (business_id,created_at desc);

create index if not exists business_error_log_dedupe_idx
  on public.business_error_log (business_id,source,error_code,severity,status,last_seen_at desc);

create or replace function private.dedupe_business_error_log()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_existing_id uuid;
begin
  new.last_seen_at:=coalesce(new.last_seen_at,new.created_at,now());
  new.occurrence_count:=greatest(coalesce(new.occurrence_count,1),1);

  select log.id into v_existing_id
  from public.business_error_log log
  where log.business_id=new.business_id
    and log.source=new.source
    and coalesce(log.error_code,'')=coalesce(new.error_code,'')
    and log.message=new.message
    and log.severity=new.severity
    and log.status=new.status
    and coalesce(log.last_seen_at,log.created_at)>=now()-interval '5 minutes'
  order by coalesce(log.last_seen_at,log.created_at) desc
  limit 1
  for update;

  if v_existing_id is not null then
    update public.business_error_log
       set occurrence_count=occurrence_count+new.occurrence_count,
           last_seen_at=greatest(coalesce(last_seen_at,created_at),new.last_seen_at)
     where id=v_existing_id;
    return null;
  end if;

  return new;
end
$$;
revoke all on function private.dedupe_business_error_log() from public,anon,authenticated;

drop trigger if exists business_error_log_dedupe_repeats on public.business_error_log;
create trigger business_error_log_dedupe_repeats
before insert on public.business_error_log
for each row execute function private.dedupe_business_error_log();

comment on function private.current_business_access_context() is
  'Statement-scoped active membership context for RLS. Client caches are not authorization; this database function remains authoritative.';
comment on function private.business_record_row_access_context(jsonb,uuid,text,jsonb,uuid,boolean) is
  'Row-aware Business Office access using a statement-scoped membership context; preserves owner/admin/viewer/staff and audited-time boundaries.';
comment on function private.dedupe_business_error_log() is
  'Collapses identical error-loop inserts within five minutes into occurrence_count while preserving the first context and recurrence timestamp.';
