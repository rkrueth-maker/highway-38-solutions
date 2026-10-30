-- Price book structure (Swivl-refinement, Fix Round 1, 2026-10-30):
--   1) Per-item price tiers (Premium / Standard / Economy) with one flagged
--      default tier, plus separate invoice vs estimate descriptions.
--   2) Per-category default markups table (Labor, Material, Tools and
--      Equipment, Vehicle, Subcontractor, Other).
-- STRUCTURE ONLY: every new value ships NULL / owner_review_required.
-- Swivl's published seeded defaults were reference material only and are
-- NOT entered here as anyone's prices; the owner enters real values.

ALTER TABLE public.price_book_items
  ADD COLUMN IF NOT EXISTS price_tier_premium numeric,
  ADD COLUMN IF NOT EXISTS price_tier_standard numeric,
  ADD COLUMN IF NOT EXISTS price_tier_economy numeric,
  ADD COLUMN IF NOT EXISTS default_tier text,
  ADD COLUMN IF NOT EXISTS invoice_description text,
  ADD COLUMN IF NOT EXISTS estimate_description text;

CREATE TABLE IF NOT EXISTS public.price_book_category_markups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  category text NOT NULL,
  markup_pct numeric,
  approval_status text NOT NULL DEFAULT 'owner_review_required',
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, category)
);

ALTER TABLE public.price_book_category_markups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read price book category markups" ON public.price_book_category_markups;
CREATE POLICY "members read price book category markups" ON public.price_book_category_markups
  FOR SELECT USING ((SELECT private.business_access(business_id, ARRAY['owner'::text, 'administrator'::text])));

DROP POLICY IF EXISTS "staff propose price book category markups" ON public.price_book_category_markups;
CREATE POLICY "staff propose price book category markups" ON public.price_book_category_markups
  FOR INSERT WITH CHECK (((SELECT private.business_access(business_id, ARRAY['owner'::text, 'administrator'::text])) AND (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "administrators update price book category markups" ON public.price_book_category_markups;
CREATE POLICY "administrators update price book category markups" ON public.price_book_category_markups
  FOR UPDATE USING ((SELECT private.business_access(business_id, ARRAY['owner'::text, 'administrator'::text])))
  WITH CHECK ((SELECT private.business_access(business_id, ARRAY['owner'::text, 'administrator'::text])));

-- Blank structure rows for the two tenants this round touches (H38 +
-- Clearwater demo). markup_pct stays NULL until the owner enters a value.
INSERT INTO public.price_book_category_markups (business_id, category, markup_pct, approval_status)
SELECT b.business_id, c.category, NULL, 'owner_review_required'
FROM (VALUES ('10b85a89-5834-436d-95b0-c6ee2eb335ad'::uuid), ('00028c9b-84a2-420f-895e-1ef9ec4c7c5b'::uuid)) AS b(business_id)
CROSS JOIN (VALUES ('labor'), ('material'), ('tools_equipment'), ('vehicle'), ('subcontractor'), ('other')) AS c(category)
ON CONFLICT (business_id, category) DO NOTHING;
