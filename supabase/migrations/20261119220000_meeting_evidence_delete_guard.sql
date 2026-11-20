-- Meeting evidence delete guard: stop silent bulk soft-deletes of meeting
-- recordings (2026-11-19; fix approved by Rick, forward-looking only — the
-- rows killed in the incident below stay deleted by his decision).
--
-- THE INCIDENT: on 2026-10-07 between 06:41:49 and 06:42:04 UTC, 1,577
-- business_records rows on the Highway 38 tenant were flipped to
-- record_status='deleted' in ~100-row statements stamped with the owner's
-- auth UUID — including all 9 meeting-audio documents rows, whose payloads
-- still said "Available — Private" and whose audio files still sit in the
-- business-office-files bucket. Both transcription consumers require an
-- ACTIVE documents row — h38-conversation-transcription's evidence() lookup
-- and the meeting-transcription repair sweep — so every one of those
-- recordings became permanently untranscribable while looking saved, and
-- the sweep has reported "audio not in private storage yet" ever since.
--
-- WRITE-PATH TRACE (why the guard is a table trigger, not app code): every
-- client write to business_records is a DIRECT PostgREST call under RLS —
-- there is no edge function or RPC in between (same trace as the
-- 2026-10-31 tombstone migration). Meeting evidence rows are written by
-- commercial-app/conversation-meeting-assistant.js uploadMeetingAttachment()
-- via a direct REST upsert, outside the operation queue and the app's local
-- snapshot, so no client-side ownership list can protect them: any present
-- or future client path that bulk-updates record_status (a stale build, a
-- snapshot-replace sync, a generic delete helper) can kill them again. A
-- BEFORE INSERT/UPDATE trigger on the table is the single choke point that
-- covers ALL of those paths.
--
-- DESIGN:
--   For collection='documents' rows whose payload Source Type is 'Meeting'
--   (spaced or camelCase key):
--     1. An UPDATE that flips record_status from 'active' to 'deleted' is
--        REJECTED unless the same update stamps the app's deliberate-delete
--        markers into the payload — 'Status'='Deleted' plus a non-empty
--        'Deleted Time' — the convention the Files delete
--        (commercial-app/office-scale-workflow.js deleteDocument) already
--        uses. A bulk flip that only touches record_status therefore fails
--        loudly instead of silently orphaning the audio.
--     2. An INSERT that lands a meeting evidence row directly in 'deleted'
--        is REJECTED (no legitimate path creates evidence pre-deleted).
--   Deliberate deletes keep working by stamping the markers
--   (commercial-app/customer-360-photo-stream.js softDelete/deleteMedia
--   updated in the same change to stamp them for documents rows).
--   Hard deletes are DELETE operations (site-visit evidence cascades,
--   admin SQL) and are unaffected. Soft-delete/restore of every other
--   collection, and of non-Meeting documents, is unaffected. The
--   tombstone guard (20261031120000) is untouched.
--
-- ROLLBACK: drop trigger business_records_meeting_evidence_delete_guard on
-- public.business_records; drop function public.guard_meeting_evidence_delete();

create or replace function public.guard_meeting_evidence_delete()
returns trigger
language plpgsql
as $$
declare
  src text;
  marked boolean;
begin
  if new.collection is distinct from 'documents' then
    return new;
  end if;
  src := lower(coalesce(new.payload->>'Source Type', new.payload->>'sourceType', ''));
  if src <> 'meeting' then
    return new;
  end if;
  if new.record_status = 'deleted' then
    if tg_op = 'INSERT' then
      raise exception 'Meeting evidence cannot be created in a deleted state (record_key %)', new.record_key;
    end if;
    marked := coalesce(new.payload->>'Status', '') = 'Deleted'
              and coalesce(new.payload->>'Deleted Time', '') <> '';
    if old.record_status = 'active' and not marked then
      raise exception 'Meeting evidence rows cannot be soft-deleted without the deliberate-delete markers (Status=Deleted and Deleted Time) in the payload (record_key %)', new.record_key;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists business_records_meeting_evidence_delete_guard on public.business_records;
create trigger business_records_meeting_evidence_delete_guard
  before insert or update of record_status, payload, collection on public.business_records
  for each row execute function public.guard_meeting_evidence_delete();
