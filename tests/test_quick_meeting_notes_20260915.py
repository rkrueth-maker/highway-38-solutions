from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RUNTIME=(ROOT/'commercial-app/quick-meeting-notes-v2.js').read_text()
BOOT=(ROOT/'commercial-app/runtime-rowid-fix.js').read_text()
FN=(ROOT/'supabase/functions/h38-quick-meeting-notes/index.ts').read_text()

def test_quick_meeting_is_notes_only_and_customer_optional():
    for marker in ['customerOptional:true','temporaryAudioOnly:true','recordingPersisted:false','transcriptPersisted:false','meetingReportDocument:false',"storagePolicy:'NOTES_ONLY'",'noteSections:n']:
        assert marker in RUNTIME
    assert "collection:'documents'" not in RUNTIME
    assert 'audioAttachmentId' not in RUNTIME

def test_quick_meeting_has_one_simple_phone_entry_and_customer_layout_repair():
    for marker in ['h38Qm2Today','Start recording','h38-qm2-customer','function capture(e){if(!mobile())return;','siteVisitEvidenceUntouched:true']:
        assert marker in RUNTIME

def test_edge_function_processes_audio_without_retaining_it():
    for marker in ['audioSaved:false','transcriptSaved:false','notesOnly:true','Return only useful meeting notes, not a transcript.','business_memberships']:
        assert marker in FN
    # True intent: the edge function must never persist MEETING content
    # (audio / transcript / notes / meeting-source collections or payloads).
    # The one permitted business_records write is the shared AI usage-cap
    # bookkeeping inside aiUsageAlert75(): an ai_config row keyed
    # ai_usage_alert_75 whose payload is only {month, level, count, sentAt}.
    import re
    writes = list(re.finditer(r'from\("business_records"\)\.(insert|update|upsert|delete)\(', FN))
    assert writes, 'expected the ai_usage_alert_75 bookkeeping write to exist'
    for match in writes:
        assert match.group(1) in ('insert', 'update'), f'business_records {match.group(1)} is never permitted here'
        window = FN[max(0, match.start() - 1200):match.end() + 500]
        assert 'collection:"ai_config"' in window or 'collection: "ai_config"' in window, 'business_records write must target only the ai_config collection'
        assert 'ai_usage_alert_75' in window, 'business_records write must be only the ai_usage_alert_75 bookkeeping row'
        for forbidden in ('collection:"meetings"', "collection:'meetings'", 'collection:"meeting', 'transcript:', 'audioBase64', 'notes:'):
            assert forbidden not in window, f'business_records write must not persist meeting content ({forbidden})'
    # Positive assertion: no meeting-content write exists anywhere in the function.
    assert 'ai_usage_alert_75' in FN and 'collection:"ai_config",record_key:"ai_usage_alert_75"' in FN
    assert not re.search(r'from\("business_records"\)\.(insert|update|upsert|delete)\([^)]*(meeting|transcript|audio)', FN), 'no business_records write may carry meeting content'
    assert 'from("business_records").select("payload")' in FN, 'read-only ai_config cap check selects payload from business_records'
    assert 'storage.from' not in FN

def test_runtime_is_versioned_and_bootstrapped():
    assert 'quick-meeting-notes-v2.js?build=' in BOOT
