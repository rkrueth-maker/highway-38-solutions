-- Scout Top-5: auction lane + real-cost score columns on reseller_deals
-- (coordinator-written from the AUCTION+SCORE workstream spec; the worker's
-- copy did not land on disk). Each statement is re-runnable.
ALTER TABLE public.reseller_deals ADD COLUMN IF NOT EXISTS closes_at timestamptz;
ALTER TABLE public.reseller_deals ADD COLUMN IF NOT EXISTS max_bid numeric;
ALTER TABLE public.reseller_deals ADD COLUMN IF NOT EXISTS parts_estimate numeric;
ALTER TABLE public.reseller_deals ADD COLUMN IF NOT EXISTS distance_mi double precision;
ALTER TABLE public.reseller_deals ADD COLUMN IF NOT EXISTS comp_source text;

NOTIFY pgrst, 'reload schema';
