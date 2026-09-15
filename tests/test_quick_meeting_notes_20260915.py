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
    for marker in ['h38Qm2Today','Start meeting','h38-qm2-customer','function capture(e){if(!mobile())return;','siteVisitEvidenceUntouched:true']:
        assert marker in RUNTIME

def test_edge_function_processes_audio_without_retaining_it():
    for marker in ['audioSaved:false','transcriptSaved:false','notesOnly:true','Return only useful meeting notes, not a transcript.','business_memberships']:
        assert marker in FN
    assert 'from("business_records")' not in FN
    assert 'storage.from' not in FN

def test_runtime_is_versioned_and_bootstrapped():
    assert 'quick-meeting-notes-v2.js?build=' in BOOT
