create table if not exists public.contractor_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  rule_code text not null,
  category text not null,
  description text not null,
  numeric_value numeric not null default 0,
  unit text not null default 'ratio',
  source_type text not null default 'business' check (source_type = any (array['business'::text,'local_research'::text,'vendor'::text,'historical'::text])),
  source_note text,
  approval_status text not null default 'owner_review_required' check (approval_status = any (array['owner_review_required'::text,'approved'::text,'rejected'::text])),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, rule_code)
);

create table if not exists public.price_book_assemblies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  assembly_code text not null,
  category text not null,
  description text not null,
  output_unit text not null,
  material_waste_pct numeric not null default 0.10 check (material_waste_pct >= 0.10 and material_waste_pct <= 1.00),
  base_material_cost numeric not null default 0 check (base_material_cost >= 0),
  labor_hours_per_unit numeric not null default 0 check (labor_hours_per_unit >= 0),
  labor_cost_per_hour numeric not null default 0 check (labor_cost_per_hour >= 0),
  equipment_cost_per_unit numeric not null default 0 check (equipment_cost_per_unit >= 0),
  consumables_cost_per_unit numeric not null default 0 check (consumables_cost_per_unit >= 0),
  direct_cost_per_unit numeric not null default 0 check (direct_cost_per_unit >= 0),
  sell_rate numeric not null default 0 check (sell_rate >= 0),
  components jsonb not null default '[]'::jsonb check (jsonb_typeof(components) = 'array'),
  pricing_method text not null default 'researched_allowance' check (pricing_method = any (array['recipe'::text,'researched_allowance'::text,'owner_override'::text])),
  source_type text not null default 'local_research' check (source_type = any (array['business'::text,'local_research'::text,'vendor'::text,'historical'::text])),
  source_note text,
  approval_status text not null default 'owner_review_required' check (approval_status = any (array['owner_review_required'::text,'approved'::text,'rejected'::text])),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, assembly_code)
);

create index if not exists contractor_pricing_rules_business_active_idx on public.contractor_pricing_rules (business_id, active, category);
create index if not exists price_book_assemblies_business_active_idx on public.price_book_assemblies (business_id, active, category);
create index if not exists price_book_assemblies_description_idx on public.price_book_assemblies using gin (to_tsvector('english', description));

alter table public.contractor_pricing_rules enable row level security;
alter table public.price_book_assemblies enable row level security;

create policy "members read contractor pricing rules" on public.contractor_pricing_rules for select to authenticated using ((select private.business_access(contractor_pricing_rules.business_id, null::text[])));
create policy "staff propose contractor pricing rules" on public.contractor_pricing_rules for insert to authenticated with check ((select private.business_access(contractor_pricing_rules.business_id, array['owner'::text,'administrator'::text,'staff'::text])) and created_by = (select auth.uid()) and (approval_status = 'owner_review_required' or (select private.business_access(contractor_pricing_rules.business_id, array['owner'::text,'administrator'::text]))));
create policy "administrators update contractor pricing rules" on public.contractor_pricing_rules for update to authenticated using ((select private.business_access(contractor_pricing_rules.business_id, array['owner'::text,'administrator'::text]))) with check ((select private.business_access(contractor_pricing_rules.business_id, array['owner'::text,'administrator'::text])));

create policy "members read price book assemblies" on public.price_book_assemblies for select to authenticated using ((select private.business_access(price_book_assemblies.business_id, null::text[])));
create policy "staff propose price book assemblies" on public.price_book_assemblies for insert to authenticated with check ((select private.business_access(price_book_assemblies.business_id, array['owner'::text,'administrator'::text,'staff'::text])) and created_by = (select auth.uid()) and (approval_status = 'owner_review_required' or (select private.business_access(price_book_assemblies.business_id, array['owner'::text,'administrator'::text]))));
create policy "administrators update price book assemblies" on public.price_book_assemblies for update to authenticated using ((select private.business_access(price_book_assemblies.business_id, array['owner'::text,'administrator'::text]))) with check ((select private.business_access(price_book_assemblies.business_id, array['owner'::text,'administrator'::text])));

revoke all on public.contractor_pricing_rules from anon;
revoke all on public.price_book_assemblies from anon;
grant select, insert, update on public.contractor_pricing_rules to authenticated;
grant select, insert, update on public.price_book_assemblies to authenticated;
grant all on public.contractor_pricing_rules to service_role;
grant all on public.price_book_assemblies to service_role;
