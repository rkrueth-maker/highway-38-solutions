-- Customer Portal UX refinement: project selection, project-bound messages, and complete quote review.
-- This migration only adds customer-owned fields. Existing RLS policies remain in force.

alter table public.customer_jobs
  add column if not exists expected_update_date date;

alter table public.customer_quotes
  add column if not exists job_id uuid references public.customer_jobs(id) on delete set null,
  add column if not exists deliverables text,
  add column if not exists timing text,
  add column if not exists revision_allowance text,
  add column if not exists exclusions text,
  add column if not exists approval_consequence text;

create index if not exists customer_quotes_job_idx on public.customer_quotes(job_id);
create index if not exists customer_messages_job_idx on public.customer_messages(job_id);
create index if not exists customer_files_job_idx on public.customer_files(job_id);

comment on column public.customer_jobs.expected_update_date is
  'Customer-visible date for the next expected Highway 38 project update.';
comment on column public.customer_quotes.deliverables is
  'Complete customer-visible deliverables required before quote approval.';
comment on column public.customer_quotes.timing is
  'Customer-visible timing and turnaround terms.';
comment on column public.customer_quotes.revision_allowance is
  'Customer-visible revision allowance and limits.';
comment on column public.customer_quotes.exclusions is
  'Customer-visible exclusions and out-of-scope items.';
comment on column public.customer_quotes.approval_consequence is
  'Plain-language explanation of exactly what quote approval records and does not trigger.';
