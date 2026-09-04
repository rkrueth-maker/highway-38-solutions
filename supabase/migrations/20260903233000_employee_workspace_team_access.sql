-- H38 employee workspace + team access.
-- One identity/data path serves the Android Business Office shell and the responsive web app.
-- Employees are exact-email Staff memberships. Owners/administrators invite; employees create/sign in
-- with the same email and receive only their assigned operational context.
-- No invitation email, customer message, approval, purchase, payment, schedule change, or other external action is sent automatically.

create index if not exists business_data_import_rows_business_id_idx
  on public.business_data_import_rows (business_id);

create table if not exists public.business_employee_profiles (
  membership_id uuid primary key references public.business_memberships(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  display_name text not null default '',
  job_title text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, membership_id)
);

create index if not exists business_employee_profiles_business_idx
  on public.business_employee_profiles (business_id, active, display_name);

alter table public.business_employee_profiles enable row level security;

drop policy if exists "employees read own profile" on public.business_employee_profiles;
create policy "employees read own profile"
on public.business_employee_profiles for select
to authenticated
using (
  exists (
    select 1
    from public.business_memberships membership
    where membership.id = business_employee_profiles.membership_id
      and membership.auth_user_id = (select auth.uid())
      and membership.status = 'active'
  )
  or (select private.business_access(business_id,array['owner','administrator']::text[]))
);

drop policy if exists "administrators manage employee profiles" on public.business_employee_profiles;
create policy "administrators manage employee profiles"
on public.business_employee_profiles for all
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])))
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop trigger if exists business_employee_profiles_touch_updated_at on public.business_employee_profiles;
create trigger business_employee_profiles_touch_updated_at
before update on public.business_employee_profiles
for each row execute function private.touch_updated_at();

revoke all on table public.business_employee_profiles from anon;
grant select, insert, update on table public.business_employee_profiles to authenticated;

create or replace function private.employee_assignment_identity(p_business_id uuid)
returns table(membership_id uuid,auth_user_id uuid,email text,role text)
language sql
stable
security definer
set search_path='pg_catalog','public','private'
as $$
  select membership.id,membership.auth_user_id,lower(btrim(membership.invited_email)),membership.role
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.auth_user_id=(select auth.uid())
    and membership.status='active'
  limit 1
$$;
revoke all on function private.employee_assignment_identity(uuid) from public,anon;
grant execute on function private.employee_assignment_identity(uuid) to authenticated;

create or replace function private.employee_task_assigned(p_business_id uuid,p_payload jsonb)
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','private'
as $$
  select exists (
    select 1
    from private.employee_assignment_identity(p_business_id) identity
    where identity.role='staff'
      and (
        coalesce(p_payload->>'Assigned User ID','')=identity.auth_user_id::text
        or coalesce(p_payload->>'Assigned User ID','')=identity.membership_id::text
        or lower(btrim(coalesce(p_payload->>'Assigned Email','')))=identity.email
      )
  )
$$;
revoke all on function private.employee_task_assigned(uuid,jsonb) from public,anon;
grant execute on function private.employee_task_assigned(uuid,jsonb) to authenticated;

create or replace function private.employee_job_assigned(p_business_id uuid,p_job_id text)
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
      and private.employee_task_assigned(p_business_id,task.payload)
  )
$$;
revoke all on function private.employee_job_assigned(uuid,text) from public,anon;
grant execute on function private.employee_job_assigned(uuid,text) to authenticated;

-- Retire collection-only Staff authorization. Staff business_records access is row-aware below.
create or replace function private.business_record_access(p_business_id uuid,p_collection text,p_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','private'
as $$
  select exists (
    select 1
    from public.business_memberships membership
    where membership.business_id=p_business_id
      and membership.auth_user_id=(select auth.uid())
      and membership.status='active'
      and (
        (
          membership.role in ('owner','administrator')
          and not (p_write=true and p_collection='timeEntries')
        )
        or (
          membership.role='viewer'
          and p_write=false
          and p_collection in (
            'customers','contacts','properties','requests','jobs','workOrders','tasks','scheduleEvents','jobNotes',
            'quotes','measurements','documents','attachments','invoices','portalThreads','portalMessages'
          )
        )
      )
  )
$$;

create or replace function private.business_record_row_access(
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
  v_uid uuid := auth.uid();
  v_role text;
  v_job_id text := coalesce(p_payload->>'Job ID','');
begin
  select membership.role into v_role
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.auth_user_id=v_uid
    and membership.status='active'
  limit 1;

  if v_role in ('owner','administrator') then
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
    return p_write=false and private.employee_task_assigned(p_business_id,p_payload);
  end if;

  if p_collection='jobs' then
    return p_write=false and private.employee_job_assigned(p_business_id,coalesce(p_payload->>'Job ID',p_payload->>'jobId',''));
  end if;

  if p_collection='scheduleEvents' then
    return p_write=false and (
      private.employee_task_assigned(p_business_id,p_payload)
      or private.employee_job_assigned(p_business_id,v_job_id)
    );
  end if;

  if p_collection in ('workOrders','jobNotes','dailyLogs','checklists','measurements','documents','attachments') then
    return private.employee_job_assigned(p_business_id,v_job_id)
      and (p_write=false or p_created_by=v_uid);
  end if;

  -- Time writes and reads use the self-scoped audited RPCs. All other ERP/customer/financial
  -- collections stay outside the employee record surface.
  return false;
end
$$;
revoke all on function private.business_record_row_access(uuid,text,jsonb,uuid,boolean) from public,anon;
grant execute on function private.business_record_row_access(uuid,text,jsonb,uuid,boolean) to authenticated;

drop policy if exists "members read business records" on public.business_records;
create policy "members read business records"
on public.business_records for select
to authenticated
using ((select private.business_record_row_access(business_id,collection,payload,created_by,false)));

drop policy if exists "staff create business records" on public.business_records;
create policy "staff create business records"
on public.business_records for insert
to authenticated
with check (
  (select private.business_record_row_access(business_id,collection,payload,created_by,true))
  and created_by=(select auth.uid())
  and updated_by=(select auth.uid())
  and record_status='active'
);

drop policy if exists "staff update business records" on public.business_records;
create policy "staff update business records"
on public.business_records for update
to authenticated
using ((select private.business_record_row_access(business_id,collection,payload,created_by,true)))
with check (
  (select private.business_record_row_access(business_id,collection,payload,created_by,true))
  and updated_by=(select auth.uid())
);

-- Staff is now an employee role, not a quoting/finance/customer-administration role.
drop policy if exists "members read price book" on public.price_book_items;
create policy "members read price book"
on public.price_book_items for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff propose price book items" on public.price_book_items;
create policy "staff propose price book items"
on public.price_book_items for insert
to authenticated
with check (
  (select private.business_access(business_id,array['owner','administrator']::text[]))
  and created_by=(select auth.uid())
);

drop policy if exists "members read quote items" on public.quote_items;
create policy "members read quote items"
on public.quote_items for select
to authenticated
using (
  (select private.business_access(business_id,array['owner','administrator']::text[]))
  or exists (
    select 1
    from public.customer_quotes q
    join public.customer_accounts ca on ca.id=q.customer_id
    where q.id=quote_items.quote_id
      and ca.auth_user_id=(select auth.uid())
      and ca.status='active'
      and q.status in ('presented','accepted')
  )
);

drop policy if exists "staff create unapproved quote items" on public.quote_items;
create policy "staff create unapproved quote items"
on public.quote_items for insert
to authenticated
with check (
  (select private.business_access(business_id,array['owner','administrator']::text[]))
  and created_by=(select auth.uid())
  and approved=false
  and owner_review_required=true
);

drop policy if exists "members read approvals" on public.business_approvals;
create policy "members read approvals"
on public.business_approvals for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "members read proof log" on public.business_proof_log;
create policy "members read proof log"
on public.business_proof_log for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));

-- Keep customer-portal policies separate, but remove broad Staff access to administrative customer records.
drop policy if exists "staff read business customers" on public.customer_accounts;
create policy "staff read business customers"
on public.customer_accounts for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff create business customers" on public.customer_accounts;
create policy "staff create business customers"
on public.customer_accounts for insert
to authenticated
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff update business customers" on public.customer_accounts;
create policy "staff update business customers"
on public.customer_accounts for update
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])))
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff read business jobs" on public.customer_jobs;
create policy "staff read business jobs"
on public.customer_jobs for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff create business jobs" on public.customer_jobs;
create policy "staff create business jobs"
on public.customer_jobs for insert
to authenticated
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff update business jobs" on public.customer_jobs;
create policy "staff update business jobs"
on public.customer_jobs for update
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])))
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff read business quotes" on public.customer_quotes;
create policy "staff read business quotes"
on public.customer_quotes for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff create draft business quotes" on public.customer_quotes;
create policy "staff create draft business quotes"
on public.customer_quotes for insert
to authenticated
with check ((select private.business_access(business_id,array['owner','administrator']::text[])));

drop policy if exists "staff read business invoices" on public.customer_invoices;
create policy "staff read business invoices"
on public.customer_invoices for select
to authenticated
using ((select private.business_access(business_id,array['owner','administrator']::text[])));

create or replace function public.business_office_invite_employee(
  p_business_id uuid,
  p_email text,
  p_display_name text default null,
  p_job_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_actor_role text;
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_membership public.business_memberships%rowtype;
  v_name text:=left(btrim(coalesce(p_display_name,'')),160);
  v_title text:=left(btrim(coalesce(p_job_title,'')),160);
begin
  select membership.role into v_actor_role
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.auth_user_id=v_uid
    and membership.status='active'
  limit 1;
  if v_actor_role not in ('owner','administrator') then raise exception 'Owner or administrator access required'; end if;
  if v_email='' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid employee email is required'; end if;

  select * into v_membership
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and lower(btrim(membership.invited_email))=v_email
    and membership.status in ('invited','active','suspended')
  order by membership.created_at desc
  limit 1;

  if v_membership.id is not null and v_membership.role in ('owner','administrator') then
    raise exception 'That email already has management access';
  end if;
  if v_membership.id is not null and v_membership.status='suspended' then
    raise exception 'That employee is suspended and must be reactivated intentionally';
  end if;

  if v_membership.id is null then
    insert into public.business_memberships(business_id,auth_user_id,invited_email,role,status,invited_by)
    values(p_business_id,null,v_email,'staff','invited',v_uid)
    returning * into v_membership;
  else
    update public.business_memberships
    set role='staff',invited_by=v_uid,updated_at=now()
    where id=v_membership.id
    returning * into v_membership;
  end if;

  insert into public.business_employee_profiles(membership_id,business_id,display_name,job_title,active,created_by)
  values(v_membership.id,p_business_id,coalesce(nullif(v_name,''),split_part(v_email,'@',1)),v_title,true,v_uid)
  on conflict(membership_id) do update
  set display_name=excluded.display_name,
      job_title=excluded.job_title,
      active=true,
      updated_at=now();

  insert into public.business_proof_log(
    business_id,actor_user_id,action_type,entity_type,entity_id,result,details,external_action_occurred
  ) values(
    p_business_id,v_uid,'employee_access_prepared','business_membership',v_membership.id,'PASS',
    jsonb_build_object('email',v_email,'role','staff','membershipStatus',v_membership.status,'automaticEmailSent',false,'exactEmailClaim',true),false
  );

  return jsonb_build_object(
    'membershipId',v_membership.id,
    'email',v_email,
    'displayName',coalesce(nullif(v_name,''),split_part(v_email,'@',1)),
    'jobTitle',v_title,
    'role','staff',
    'status',v_membership.status,
    'automaticEmailSent',false,
    'employeeCreatesOrSignsIntoAccount',true,
    'exactEmailClaim',true
  );
end
$$;
revoke all on function public.business_office_invite_employee(uuid,text,text,text) from public,anon;
grant execute on function public.business_office_invite_employee(uuid,text,text,text) to authenticated;

create or replace function public.business_office_team_directory(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_rows jsonb;
begin
  select membership.role into v_role
  from public.business_memberships membership
  where membership.business_id=p_business_id and membership.auth_user_id=v_uid and membership.status='active'
  limit 1;
  if v_role not in ('owner','administrator') then raise exception 'Owner or administrator access required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId',membership.id,
    'authUserId',coalesce(membership.auth_user_id::text,''),
    'email',membership.invited_email,
    'role',membership.role,
    'status',membership.status,
    'acceptedAt',membership.accepted_at,
    'displayName',coalesce(nullif(profile.display_name,''),split_part(membership.invited_email,'@',1)),
    'jobTitle',coalesce(profile.job_title,'')
  ) order by coalesce(nullif(profile.display_name,''),membership.invited_email)),'[]'::jsonb)
  into v_rows
  from public.business_memberships membership
  left join public.business_employee_profiles profile on profile.membership_id=membership.id
  where membership.business_id=p_business_id
    and membership.role='staff'
    and membership.status in ('invited','active','suspended');

  return jsonb_build_object('employees',v_rows,'automaticEmailSending',false,'taskManagerAssignmentAuthority',true);
end
$$;
revoke all on function public.business_office_team_directory(uuid) from public,anon;
grant execute on function public.business_office_team_directory(uuid) to authenticated;

create or replace function public.business_office_employee_workspace(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_membership public.business_memberships%rowtype;
  v_profile jsonb;
  v_tasks jsonb;
  v_jobs jsonb;
  v_customers jsonb;
  v_schedule jsonb;
  v_time jsonb;
begin
  select * into v_membership
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.auth_user_id=v_uid
    and membership.status='active'
  limit 1;
  if v_membership.id is null then raise exception 'Active business membership required'; end if;
  if v_membership.role<>'staff' then raise exception 'Employee workspace requires a Staff membership'; end if;

  select jsonb_build_object(
    'membershipId',v_membership.id,
    'authUserId',v_uid,
    'email',v_membership.invited_email,
    'displayName',coalesce(nullif(profile.display_name,''),split_part(v_membership.invited_email,'@',1)),
    'jobTitle',coalesce(profile.job_title,''),
    'role','staff'
  ) into v_profile
  from (select 1) seed
  left join public.business_employee_profiles profile on profile.membership_id=v_membership.id;

  select coalesce(jsonb_agg(task.payload order by
    case lower(coalesce(task.payload->>'Status','')) when 'started' then 0 when 'accepted' then 1 when 'open' then 2 else 3 end,
    nullif(task.payload->>'Due Time','') nulls last,
    task.updated_at desc
  ),'[]'::jsonb) into v_tasks
  from public.business_records task
  where task.business_id=p_business_id
    and task.collection='tasks'
    and task.record_status='active'
    and private.employee_task_assigned(p_business_id,task.payload);

  select coalesce(jsonb_agg(job.payload order by job.updated_at desc),'[]'::jsonb) into v_jobs
  from public.business_records job
  where job.business_id=p_business_id
    and job.collection='jobs'
    and job.record_status='active'
    and private.employee_job_assigned(p_business_id,coalesce(job.payload->>'Job ID',job.payload->>'jobId',''));

  select coalesce(jsonb_agg(customer.payload order by customer.updated_at desc),'[]'::jsonb) into v_customers
  from public.business_records customer
  where customer.business_id=p_business_id
    and customer.collection='customers'
    and customer.record_status='active'
    and coalesce(customer.payload->>'Customer ID','') in (
      select distinct coalesce(job.payload->>'Customer ID','')
      from public.business_records job
      where job.business_id=p_business_id
        and job.collection='jobs'
        and job.record_status='active'
        and private.employee_job_assigned(p_business_id,coalesce(job.payload->>'Job ID',job.payload->>'jobId',''))
        and coalesce(job.payload->>'Customer ID','')<>''
    );

  select coalesce(jsonb_agg(event.payload order by nullif(event.payload->>'Start Time','') nulls last,event.updated_at desc),'[]'::jsonb) into v_schedule
  from public.business_records event
  where event.business_id=p_business_id
    and event.collection='scheduleEvents'
    and event.record_status='active'
    and (
      private.employee_task_assigned(p_business_id,event.payload)
      or private.employee_job_assigned(p_business_id,coalesce(event.payload->>'Job ID',''))
    );

  v_time:=public.business_office_time_state(p_business_id);

  return jsonb_build_object(
    'profile',v_profile,
    'time',v_time,
    'tasks',v_tasks,
    'jobs',v_jobs,
    'customers',v_customers,
    'schedule',v_schedule,
    'androidAndWebSameAccount',true,
    'assignedWorkOnly',true,
    'taskManagerAssignmentAuthority',true,
    'automaticExternalActions',false
  );
end
$$;
revoke all on function public.business_office_employee_workspace(uuid) from public,anon;
grant execute on function public.business_office_employee_workspace(uuid) to authenticated;

create or replace function public.business_office_employee_update_task(
  p_business_id uuid,
  p_task_id text,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_membership public.business_memberships%rowtype;
  v_task public.business_records%rowtype;
  v_status text:=initcap(lower(btrim(coalesce(p_status,''))));
  v_note text:=left(btrim(coalesce(p_note,'')),2000);
  v_payload jsonb;
  v_now timestamptz:=now();
begin
  select * into v_membership
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.auth_user_id=v_uid
    and membership.status='active'
  limit 1;
  if v_membership.id is null or v_membership.role<>'staff' then raise exception 'Employee task access requires an active Staff membership'; end if;
  if v_status not in ('Accepted','Started','Waiting','Blocked','Completed') then raise exception 'Unsupported employee task status'; end if;

  select * into v_task
  from public.business_records task
  where task.business_id=p_business_id
    and task.collection='tasks'
    and task.record_status='active'
    and task.record_key=p_task_id
    and private.employee_task_assigned(p_business_id,task.payload)
  limit 1
  for update;
  if v_task.id is null then raise exception 'Assigned task not found'; end if;

  v_payload:=v_task.payload || jsonb_build_object(
    'Status',v_status,
    'Employee Updated Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'Employee Updated By',v_uid::text,
    'Record Version',coalesce((v_task.payload->>'Record Version')::int,1)+1
  );
  if v_note<>'' then v_payload:=v_payload || jsonb_build_object('Employee Note',v_note); end if;
  if v_status='Completed' then
    v_payload:=v_payload || jsonb_build_object('Completed Time',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  update public.business_records
  set payload=v_payload,updated_by=v_uid,updated_at=v_now
  where id=v_task.id;

  insert into public.business_proof_log(
    business_id,actor_user_id,action_type,entity_type,result,details,external_action_occurred
  ) values(
    p_business_id,v_uid,'employee_task_status_updated','task','PASS',
    jsonb_build_object('taskId',p_task_id,'status',v_status,'employeeSelfService',true),false
  );

  return v_payload;
end
$$;
revoke all on function public.business_office_employee_update_task(uuid,text,text,text) from public,anon;
grant execute on function public.business_office_employee_update_task(uuid,text,text,text) to authenticated;
