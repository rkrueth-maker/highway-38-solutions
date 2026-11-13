-- Household sharing for the Our Kitchen recipe app (recipes.html).
-- One shared shopping list ('list') + future-purchase watch list ('watch')
-- per household. A household is identified only by an unguessable token
-- carried in the app's share link. RLS is enabled with NO public policies:
-- the only access path is the household-list edge function (service role),
-- which validates the token format before touching the table.
-- Applied live 2026-11-13 before the function deploy.
CREATE TABLE IF NOT EXISTS public.household_items (
  household_token text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('list','watch')),
  item_key text NOT NULL,
  label text NOT NULL,
  detail text,
  checked boolean NOT NULL DEFAULT false,
  target_price numeric,
  touched_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_token, kind, item_key)
);
ALTER TABLE public.household_items ENABLE ROW LEVEL SECURITY;
