-- Scout Top-5: DG remodel countdown table (coordinator-written from the
-- FEEDS workstream spec; the worker's copy did not land on disk).
-- Source: Crazy4Couponing remodel list. Day 1 = Thursday (CORE 70% off),
-- Day 25 = Sunday = Penny Day; penny_date = remodel_start + 24 days when
-- the source gives a start date.
CREATE TABLE IF NOT EXISTS public.scout_dg_remodels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_label   text NOT NULL,
  city          text,
  state         text,
  address       text,
  remodel_start date,
  penny_date    date,
  source        text NOT NULL DEFAULT 'Crazy4Couponing',
  source_url    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_label, remodel_start)
);

ALTER TABLE public.scout_dg_remodels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scout_dg_remodels_read ON public.scout_dg_remodels;
CREATE POLICY scout_dg_remodels_read
  ON public.scout_dg_remodels
  FOR SELECT TO authenticated
  USING (true);
-- NOTE: remodels are public reference data (no household column), so the
-- read policy is intentionally permissive for authenticated users. The lane
-- writes via the Management API (service role), which bypasses RLS.

GRANT SELECT ON public.scout_dg_remodels TO authenticated;
GRANT ALL ON public.scout_dg_remodels TO service_role;

-- FEEDS workstream note (2026-11-06): the brief asked for a household-read
-- policy mirroring scout_supply_matches / deal_engine_watch_rules, whose
-- policies (verified in pg_policies) scope by
--   household_id IN (SELECT private.current_coupon_household_ids())
-- This table has no household_id (global reference data), so the equivalent
-- gate using the same helper would be:
--   DROP POLICY scout_dg_remodels_read ON public.scout_dg_remodels;
--   CREATE POLICY scout_dg_remodels_read ON public.scout_dg_remodels
--     FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM private.current_coupon_household_ids() AS household_id));
-- The coordinator's USING (true) version above is the one on disk; swap only
-- if the stricter household-membership gate is wanted.
