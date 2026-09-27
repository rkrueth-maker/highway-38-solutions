-- Shared quote lifecycle owner-role routing.
-- Internal tasks only. No quote send, payment, scheduling, purchasing, or work start occurs here.

create or replace function private.business_office_quote_owner_task_upsert(
  p_business_id uuid,
  p_quote_record_key text,
  p_quote_payload jsonb,
  p_event text,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_revision text:=coalesce(nullif(trim(coalesce(p_quote_payload->>'Revision',p_quote_payload->>'revision','')),''),'1');
  v_quote_label text:=coalesce(
    nullif(trim(coalesce(p_quote_payload->>'Quote Number',p_quote_payload->>'quoteNumber','')),''),
    nullif(trim(coalesce(p_quote_payload->>'Project Title',p_quote_payload->>'projectTitle','')),''),
    p_quote_record_key
  );
  v_task_key text;
  v_title text;
  v_task_type text;
  v_priority text;
  v_due_days integer:=0;
  v_instructions text;
  v_due timestamptz;
begin
  if p_business_id is null or nullif(trim(coalesce(p_quote_record_key,'')),'') is null then return; end if;

  select membership.auth_user_id into v_actor
  from public.business_memberships membership
  where membership.business_id=p_business_id
    and membership.status='active'
    and membership.role='owner'
    and membership.auth_user_id is not null
  order by membership.accepted_at nulls last,membership.created_at
  limit 1;
  v_actor:=coalesce(v_actor,p_actor,(select auth.uid()));
  if v_actor is null then return; end if;

  case p_event
    when 'quote.created' then
      v_title:='Review new quote: '||v_quote_label; v_task_type:='Quote Review'; v_priority:='High'; v_instructions:='Review scope, pricing, customer/property context, measurements, exclusions, and missing information. Move the quote forward when it is ready.';
    when 'quote.review_required' then
      v_title:='Finish owner review: '||v_quote_label; v_task_type:='Quote Review'; v_priority:='High'; v_instructions:='Complete the owner review. Resolve missing pricing, scope, measurements, assumptions, and approval items before customer delivery.';
    when 'quote.ready_to_send' then
      v_title:='Approve and send quote: '||v_quote_label; v_task_type:='Quote Delivery'; v_priority:='High'; v_instructions:='Review the final customer copy and use the approved quote-delivery action when ready. Do not send automatically.';
    when 'quote.sent' then
      v_title:='Follow up on quote: '||v_quote_label; v_task_type:='Quote Follow-up'; v_priority:='Normal'; v_due_days:=3; v_instructions:='If the customer has not responded by the due time, review the quote and prepare the appropriate follow-up. Do not contact the customer automatically.';
    when 'quote.revision_requested' then
      v_title:='Revise customer quote: '||v_quote_label; v_task_type:='Quote Revision'; v_priority:='Urgent'; v_instructions:='Review the customer revision request, update the quote without losing the accepted baseline, and return it to owner review before sending.';
    when 'quote.approved' then
      v_title:='Turn accepted quote into work: '||v_quote_label; v_task_type:='Quote Handoff'; v_priority:='High'; v_instructions:='Confirm the accepted scope and create or verify the job/work-order handoff, schedule requirements, materials, and customer commitments. Do not start work automatically.';
    when 'quote.declined' then
      v_title:='Close declined quote: '||v_quote_label; v_task_type:='Quote Closeout'; v_priority:='Normal'; v_due_days:=1; v_instructions:='Review the decline reason, record useful follow-up notes, and close the opportunity or prepare an owner-approved next step.';
    when 'quote.expired' then
      v_title:='Review expired quote: '||v_quote_label; v_task_type:='Quote Closeout'; v_priority:='Normal'; v_instructions:='Review whether the quote should be closed, revised, or followed up. Any customer contact still requires an owner action.';
    else return;
  end case;

  v_task_key:='QUOTE-OWNER-'||substr(md5(p_business_id::text||'|'||p_quote_record_key||'|'||p_event||'|'||v_revision),1,32);
  v_due:=now()+make_interval(days=>v_due_days);

  update public.business_records task_record
  set payload=task_record.payload||jsonb_build_object(
        'Status','Completed','Completed Time',now()::text,
        'Completion Reason','Superseded by quote lifecycle stage '||p_event,
        'Updated Time',now()::text
      ),updated_by=v_actor
  where task_record.business_id=p_business_id
    and task_record.collection='tasks'
    and task_record.record_status='active'
    and task_record.record_key<>v_task_key
    and coalesce(task_record.payload->>'Quote ID',task_record.payload->>'quoteId','')=p_quote_record_key
    and coalesce(task_record.payload->>'Auto Managed','')='true'
    and lower(coalesce(task_record.payload->>'Status','Open')) not in ('complete','completed','done','cancelled','closed','void','voided');

  insert into public.business_records(
    business_id,collection,record_key,payload,record_status,created_by,updated_by
  ) values(
    p_business_id,'tasks',v_task_key,
    jsonb_build_object(
      'Task ID',v_task_key,'Business ID',p_business_id::text,'Task Title',v_title,
      'Task Type',v_task_type,'Task Domain','quote.lifecycle','Assigned User ID','',
      'Assigned Role','Owner','Priority',v_priority,'Status','Open',
      'Due Date',v_due::date::text,'Due Time',v_due::text,'Instructions',v_instructions,
      'Quote ID',p_quote_record_key,
      'Customer ID',coalesce(p_quote_payload->>'Customer ID',p_quote_payload->>'customerId',''),
      'Linked Record Type','Quote','Linked Record ID',p_quote_record_key,
      'Source Event',p_event,'Source Record ID',p_quote_record_key,'Quote Revision',v_revision,
      'Auto Managed',true,'External Action Occurred',false,
      'Created Time',now()::text,'Updated Time',now()::text,'Record Version',1
    ),'active',v_actor,v_actor
  )
  on conflict (business_id,collection,record_key) do update
  set payload=(excluded.payload-'Created Time')||jsonb_build_object(
        'Created Time',coalesce(public.business_records.payload->>'Created Time',excluded.payload->>'Created Time'),
        'Record Version',greatest(1,coalesce((public.business_records.payload->>'Record Version')::int,0)+1)
      ),record_status='active',updated_by=v_actor;
end
$$;

revoke all on function private.business_office_quote_owner_task_upsert(uuid,text,jsonb,text,uuid) from public, anon, authenticated;

create or replace function private.business_office_quote_owner_task_from_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text;
  v_new_status text; v_old_status text;
  v_new_review text; v_old_review text;
  v_new_delivery text; v_old_delivery text;
  v_new_customer text; v_old_customer text;
begin
  if new.collection<>'quotes' or new.record_status<>'active' then return new; end if;
  if tg_op='INSERT' then
    perform private.business_office_quote_owner_task_upsert(new.business_id,new.record_key,new.payload,'quote.created',coalesce(new.updated_by,new.created_by));
    return new;
  end if;

  v_new_status:=lower(trim(coalesce(new.payload->>'Status',new.payload->>'status','')));
  v_old_status:=lower(trim(coalesce(old.payload->>'Status',old.payload->>'status','')));
  v_new_review:=lower(trim(coalesce(new.payload->>'Approval Status',new.payload->>'approvalStatus',new.payload->>'Review Status',new.payload->>'reviewStatus','')));
  v_old_review:=lower(trim(coalesce(old.payload->>'Approval Status',old.payload->>'approvalStatus',old.payload->>'Review Status',old.payload->>'reviewStatus','')));
  v_new_delivery:=lower(trim(coalesce(new.payload->>'Delivery Status',new.payload->>'deliveryStatus',v_new_status,'')));
  v_old_delivery:=lower(trim(coalesce(old.payload->>'Delivery Status',old.payload->>'deliveryStatus',v_old_status,'')));
  v_new_customer:=lower(trim(coalesce(new.payload->>'Customer Action',new.payload->>'customerAction',new.payload->>'Customer Decision',new.payload->>'customerDecision','')));
  v_old_customer:=lower(trim(coalesce(old.payload->>'Customer Action',old.payload->>'customerAction',old.payload->>'Customer Decision',old.payload->>'customerDecision','')));

  if v_new_status~'^(accepted|approved)$' and v_old_status!~'^(accepted|approved)$' then v_event:='quote.approved';
  elsif v_new_status~'^(declined|rejected|lost)$' and v_old_status!~'^(declined|rejected|lost)$' then v_event:='quote.declined';
  elsif v_new_status~'^expired$' and v_old_status!~'^expired$' then v_event:='quote.expired';
  elsif (v_new_customer~'revision|changes requested|revise' or v_new_status~'revision|changes requested|revise') and not (v_old_customer~'revision|changes requested|revise' or v_old_status~'revision|changes requested|revise') then v_event:='quote.revision_requested';
  elsif (v_new_status~'^(presented|sent|delivered)$' or v_new_delivery~'^(presented|sent|delivered)$') and not (v_old_status~'^(presented|sent|delivered)$' or v_old_delivery~'^(presented|sent|delivered)$') then v_event:='quote.sent';
  elsif (v_new_status~'ready[ _-]*to[ _-]*send' or v_new_review~'ready[ _-]*to[ _-]*send|approved[ _-]*to[ _-]*send') and not (v_old_status~'ready[ _-]*to[ _-]*send' or v_old_review~'ready[ _-]*to[ _-]*send|approved[ _-]*to[ _-]*send') then v_event:='quote.ready_to_send';
  elsif (v_new_status~'owner[ _-]*review[ _-]*required|needs[ _-]*review|review[ _-]*required' or v_new_review~'owner[ _-]*review[ _-]*required|needs[ _-]*review|review[ _-]*required') and not (v_old_status~'owner[ _-]*review[ _-]*required|needs[ _-]*review|review[ _-]*required' or v_old_review~'owner[ _-]*review[ _-]*required|needs[ _-]*review|review[ _-]*required') then v_event:='quote.review_required';
  end if;

  if v_event is not null then
    perform private.business_office_quote_owner_task_upsert(new.business_id,new.record_key,new.payload,v_event,coalesce(new.updated_by,new.created_by));
  end if;
  return new;
end
$$;

revoke all on function private.business_office_quote_owner_task_from_record() from public, anon, authenticated;

drop trigger if exists business_records_quote_owner_tasks on public.business_records;
create trigger business_records_quote_owner_tasks
after insert or update of payload,record_status on public.business_records
for each row when (new.collection='quotes')
execute function private.business_office_quote_owner_task_from_record();

create or replace function private.business_office_quote_owner_task_from_customer_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text; v_quote_record_key text; v_quote_payload jsonb;
begin
  if tg_op<>'UPDATE' then return new; end if;
  if coalesce(new.customer_decision,'')=coalesce(old.customer_decision,'') and coalesce(new.status,'')=coalesce(old.status,'') then return new; end if;
  if new.customer_decision='approved' or new.status='accepted' then v_event:='quote.approved';
  elsif new.customer_decision='revision_requested' then v_event:='quote.revision_requested';
  elsif new.customer_decision='declined' or new.status='rejected' then v_event:='quote.declined';
  else return new; end if;

  select quote_record.record_key,quote_record.payload into v_quote_record_key,v_quote_payload
  from public.business_records quote_record
  where quote_record.business_id=new.business_id and quote_record.collection='quotes' and quote_record.record_status='active'
    and (coalesce(quote_record.payload->>'Customer Portal Quote ID','')=new.id::text or coalesce(quote_record.payload->>'Quote Number',quote_record.payload->>'quoteNumber','')=new.quote_number)
  order by case when coalesce(quote_record.payload->>'Customer Portal Quote ID','')=new.id::text then 0 else 1 end,quote_record.updated_at desc
  limit 1;

  if v_quote_record_key is not null then
    perform private.business_office_quote_owner_task_upsert(new.business_id,v_quote_record_key,v_quote_payload,v_event,(select auth.uid()));
  end if;
  return new;
end
$$;

revoke all on function private.business_office_quote_owner_task_from_customer_decision() from public, anon, authenticated;

drop trigger if exists customer_quotes_owner_tasks on public.customer_quotes;
create trigger customer_quotes_owner_tasks
after update of customer_decision,status on public.customer_quotes
for each row execute function private.business_office_quote_owner_task_from_customer_decision();

-- Existing automatic quote lifecycle tasks belong to the Owner role, not one arbitrary owner account.
update public.business_records task_record
set payload=task_record.payload||jsonb_build_object('Assigned User ID','','Assigned Role','Owner','Task Domain',coalesce(nullif(task_record.payload->>'Task Domain',''),'quote.lifecycle'),'Updated Time',now()::text)
where task_record.collection='tasks' and task_record.record_status='active'
  and coalesce(task_record.payload->>'Auto Managed','false')='true'
  and coalesce(task_record.payload->>'Quote ID','')<>'';

-- Existing quote line work remains internal and starts in the owner queue until a human assigns it.
update public.business_records task_record
set payload=task_record.payload||jsonb_build_object('Assigned Role','Owner','Updated Time',now()::text)
where task_record.collection='tasks' and task_record.record_status='active'
  and coalesce(task_record.payload->>'Task Type','')='Quote Work'
  and coalesce(task_record.payload->>'Assigned User ID','')=''
  and coalesce(task_record.payload->>'Assigned Role','')='';

comment on function private.business_office_quote_owner_task_upsert(uuid,text,jsonb,text,uuid) is 'Shared tenant-safe internal quote lifecycle task routing. Role-assigned to Owner so every active owner sees the same work queue; never performs an external action.';
