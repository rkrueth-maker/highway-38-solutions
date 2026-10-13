-- AI usage counting for Kit handoff actions (2026-10-13)
--
-- Problem: the Settings "AI usage this month" card counts rows in
-- ai_usage_log, but only direct edge-function calls ever wrote those rows.
-- Actions routed through the Kit handoff queue (ai_handoff_tasks:
-- assistant_qa, organize_notes, quote_build, meeting_notes, ...) completed
-- without adding any usage row, so the Office's primary AI path was
-- invisible to the 5,000-actions/month meter.
--
-- Canonical counting point: this trigger. Many executors can complete a
-- handoff task (the workspace ai-handoff pollers, Kit acting directly via
-- the REST API, future edge/server workers). The one transition they all
-- share is ai_handoff_tasks.status -> 'done' in this database, so counting
-- lives here instead of in any single poller/worker.
--
-- Rule: one completed handoff task = one AI action.
--   * status transitions INTO 'done' insert exactly one ai_usage_log row
--     (function_name = the handoff task_type, model 'kit-handoff').
--   * 'failed' / 'cancelled' transitions never insert.
--   * Idempotent: ai_usage_log.handoff_task_id is UNIQUE (partial, where
--     not null) and the insert is ON CONFLICT DO NOTHING, so retries,
--     replays, done->done updates, and even a later pending->done cycle
--     for the same task can never double-count it.
--
-- No backfill: tasks completed before this migration are not retroactively
-- counted (that would rewrite every tenant's current-month meter).

ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS handoff_task_id uuid
    REFERENCES public.ai_handoff_tasks(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_log_handoff_task_uidx
  ON public.ai_usage_log (handoff_task_id)
  WHERE handoff_task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.log_ai_handoff_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_usage_log
    (business_id, function_name, tokens_in, tokens_out, cost_estimate,
     model, handoff_task_id)
  VALUES
    (NEW.business_id, NEW.task_type, 0, 0, 0, 'kit-handoff', NEW.id)
  ON CONFLICT (handoff_task_id) WHERE handoff_task_id IS NOT NULL
  DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_handoff_tasks_count_usage_insert
  ON public.ai_handoff_tasks;
CREATE TRIGGER ai_handoff_tasks_count_usage_insert
  AFTER INSERT ON public.ai_handoff_tasks
  FOR EACH ROW
  WHEN (NEW.status = 'done')
  EXECUTE FUNCTION public.log_ai_handoff_usage();

DROP TRIGGER IF EXISTS ai_handoff_tasks_count_usage_update
  ON public.ai_handoff_tasks;
CREATE TRIGGER ai_handoff_tasks_count_usage_update
  AFTER UPDATE OF status ON public.ai_handoff_tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'done' AND NEW.status = 'done')
  EXECUTE FUNCTION public.log_ai_handoff_usage();

NOTIFY pgrst, 'reload schema';
