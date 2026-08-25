from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
RUNTIME=ROOT/'commercial-app'/'web-media-intake-runtime.js'
LOADER=ROOT/'commercial-app'/'assistant-command-runtime.js'
MEDIA_AI=ROOT/'supabase'/'functions'/'h38-media-intake-ai'/'index.ts'
MEASURE=ROOT/'supabase'/'functions'/'h38-web-video-measurements'/'index.ts'

def node_check(path:Path):
    result=subprocess.run(['node','--check',str(path)],cwd=ROOT,text=True,capture_output=True,check=False)
    assert result.returncode==0,result.stderr or result.stdout

def test_web_media_browser_javascript_parses():
    node_check(RUNTIME)
    node_check(LOADER)

def test_web_media_intake_is_large_file_and_video_ready():
    s=RUNTIME.read_text(encoding='utf-8')
    assert 'accept="video/*,audio/*"' in s
    assert '/storage/v1/upload/resumable' in s
    assert '6*1024*1024' in s
    assert 'TUS_RESUMABLE_6MB' in s
    assert 'Media Review Frame' in s
    assert 'Extract audio for transcript' in s
    assert 'h38-media-intake-ai' in s
    assert 'h38-web-video-measurements' in s

def test_uploaded_video_measurements_fail_closed():
    s=RUNTIME.read_text(encoding='utf-8')
    assert 'I confirm this reference dimension is accurate and visible in the uploaded video.' in s
    assert "'Verification Status':'OWNER_CONFIRMED_REFERENCE'" in s
    assert "'Target Measurements Verified':false" in s
    assert 'Camera estimate' in s
    assert 'UNVERIFIED' in s
    assert 'field verification required' in s
    for flag in ('automaticCustomerRelease:false','automaticCustomerSending:false','automaticApproval:false','automaticScheduling:false','automaticFinancialAction:false'):
        assert flag in s

def test_loader_network_loads_web_media_runtime():
    s=LOADER.read_text(encoding='utf-8')
    assert 'loadWebMediaIntakeRuntime' in s
    assert 'web-media-intake-runtime.js?build=20260825-web-media-intake-1' in s
    assert 'webMediaIntake:true' in s

def test_media_ai_contract_is_read_only_and_authenticated():
    s=MEDIA_AI.read_text(encoding='utf-8')
    assert '/auth/v1/user' in s
    assert "business_memberships" in s
    assert "mediaAnalysisSessions" in s
    assert "Media Review Frame" in s
    assert 'audio/transcriptions' in s
    assert 'Never mark a measurement verified.' in s
    assert 'requiresOwnerConfirmation' in s
    assert 'external_action_occurred:false' in s
    for flag in ('automaticCustomerRelease:false','automaticCustomerSending:false','automaticApproval:false','automaticScheduling:false','automaticFinancialAction:false'):
        assert flag in s

def test_web_video_distance_math_stays_reference_scale_only():
    s=MEASURE.read_text(encoding='utf-8')
    assert "ENGINE='web-video-reference-scale-v1'" in s
    assert "mediaMeasurementReferences" in s
    assert "['Owner Confirmed']===true" in s
    assert "samePlane!==true" in s
    assert 'targetSpan' not in s or 'span(o.targetStart' in s
    assert "source:'CAMERA_ESTIMATE'" in s
    assert "verificationStatus:'UNVERIFIED'" in s
    assert "method:'SAME_FRAME_REFERENCE_SCALE'" in s
    assert "Math.min(.72" in s
    assert 'Never return or invent a dimension value' in s
    assert 'external_action_occurred:false' in s
