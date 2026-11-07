-- Scout In-Store Mode: household penny confirmations.
-- STAGING ONLY — coordinator reviews and applies. Do not run against prod
-- without the coordinator's integration step.
--
-- RLS pattern mirrored from public.deal_engine_watch_rules /
-- public.scout_supply_matches (verified live via pg_policies 2026-11-06):
--   household_id IN (SELECT private.current_coupon_household_ids())
-- where private.current_coupon_household_ids() returns the household ids
-- of the signed-in user from public.coupon_household_members.
-- The API (h38-penny-api, actions penny_confirm / penny_confirmations)
-- derives household_id + user_id server-side from the JWT and writes via
-- the service role; these policies protect direct authenticated access.

CREATE TABLE IF NOT EXISTS public.scout_penny_confirmations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL,
  user_id       uuid NOT NULL,
  retailer      text NOT NULL,
  upc           text,
  canonical_key text,
  store_label   text NOT NULL,
  verdict       text NOT NULL CHECK (verdict IN ('found','not_here','pulled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scout_penny_confirmations_household_lookup
  ON public.scout_penny_confirmations (household_id, retailer, upc, created_at DESC);

ALTER TABLE public.scout_penny_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scout_penny_confirmations_read ON public.scout_penny_confirmations;
CREATE POLICY scout_penny_confirmations_read
  ON public.scout_penny_confirmations
  FOR SELECT TO authenticated
  USING (household_id IN (SELECT private.current_coupon_household_ids()));

DROP POLICY IF EXISTS scout_penny_confirmations_insert ON public.scout_penny_confirmations;
CREATE POLICY scout_penny_confirmations_insert
  ON public.scout_penny_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (
    household_id IN (SELECT private.current_coupon_household_ids())
    AND user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS scout_penny_confirmations_update ON public.scout_penny_confirmations;
CREATE POLICY scout_penny_confirmations_update
  ON public.scout_penny_confirmations
  FOR UPDATE TO authenticated
  USING (household_id IN (SELECT private.current_coupon_household_ids()))
  WITH CHECK (household_id IN (SELECT private.current_coupon_household_ids()));

DROP POLICY IF EXISTS scout_penny_confirmations_delete ON public.scout_penny_confirmations;
CREATE POLICY scout_penny_confirmations_delete
  ON public.scout_penny_confirmations
  FOR DELETE TO authenticated
  USING (household_id IN (SELECT private.current_coupon_household_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scout_penny_confirmations TO authenticated;
GRANT ALL ON public.scout_penny_confirmations TO service_role;
