-- AI usage tracking per tenant (Muse Spark migration)
-- Tracks actual token usage and cost per business per month.
-- Cap: $20/month per business. Alert at $15 (75%). Hard block at $20.

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_estimate NUMERIC(10,6) NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT 'muse-spark-1.1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_log_business_created
  ON ai_usage_log (business_id, created_at DESC);

-- RLS: service_role bypasses; owners/admins can read their own business usage
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_log_owner_read ON ai_usage_log;
CREATE POLICY ai_usage_log_owner_read ON ai_usage_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_memberships m
      WHERE m.business_id = ai_usage_log.business_id
        AND m.auth_user_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('owner','administrator')
    )
  );

-- Service role full access (for edge functions)
DROP POLICY IF EXISTS ai_usage_log_service_all ON ai_usage_log;
CREATE POLICY ai_usage_log_service_all ON ai_usage_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
