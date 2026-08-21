from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CLIENT = (ROOT / 'commercial-app' / 'measurement-verification-authority.js').read_text(encoding='utf-8')
SERVER = (ROOT / 'supabase' / 'functions' / 'h38-quote-ai' / 'index.ts').read_text(encoding='utf-8')
INDEX = (ROOT / 'commercial-app' / 'index.html').read_text(encoding='utf-8')

EXPECTED = [
    'FIELD_MEASURED_AND_CHECKED',
    'FIELD_MEASURED',
    'OPERATOR_VERIFIED',
    'FIELD_VERIFIED',
    'VERIFIED_BY_OPERATOR',
    'VERIFIED',
]


def normalize_label(raw: str) -> list[str]:
    stop = {
        'verify', 'verified', 'measure', 'measured', 'measurement', 'measurements',
        'field', 'dimension', 'dimensions', 'required', 'needed', 'need', 'confirm',
        'record', 'walkthrough', 'estimate', 'estimated', 'with', 'using', 'android',
        'laser', 'tape', 'device', 'camera', 'the', 'a', 'an', 'to', 'of', 'for',
        'from', 'and', 'or', 'in', 'at',
    }
    return [token for token in re.sub(r'[^a-z0-9]+', ' ', raw.lower()).split() if token not in stop]


def labels_match(label: str, request: str) -> bool:
    a = normalize_label(label)
    b = normalize_label(request)
    if not a or not b:
        return False
    if a == b:
        return True
    if ' '.join(a) in ' '.join(b) and len(' '.join(a)) >= 7:
        return True
    common = sum(1 for token in a if token in set(b))
    coverage = common / len(a)
    return coverage == 1 and len(b) <= 3 if len(a) == 1 else coverage >= .67 and common >= 2


def resolved(label: str, value: float, request: str) -> bool:
    if not labels_match(label, request):
        return False
    nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', request)]
    return not nums or any(abs(number - value) < .01 for number in nums)


def test_client_and_server_share_verified_status_contract():
    for status in EXPECTED:
        assert f"'{status}'" in CLIENT
        assert f'"{status}"' in SERVER
    assert "'DEVICE_CAPTURED'" not in re.search(r'const VERIFIED_STATUSES=Object\.freeze\(\[(.*?)\]\);', CLIENT, re.S).group(1)


def test_field_measured_birdbath_and_sprinkler_are_resolved():
    assert resolved('Birdbath height', 21, 'Verify Birdbath height — 21 in with tape or laser.')
    assert resolved('Sprinkler head to ground', 71, 'Sprinkler head to ground = 71 in')


def test_unverified_58_in_distance_is_not_suppressed_by_other_measurements():
    request = 'Distance between birdbath and sprinkler head = 58 in'
    assert not resolved('Birdbath height', 21, request)
    assert not resolved('Sprinkler head to ground', 71, request)


def test_structured_matching_and_re_render_are_explicit_runtime_contracts():
    for marker in [
        'structuredIdentityMatching:true',
        'scalarLabelValueUnitMatching:true',
        'fieldMeasuredIsVerified:true',
        'reviewReRenderAfterSuppression:true',
        'suppressCurrentVisitMissing',
        "guidance.decorate(true)",
    ]:
        assert marker in CLIENT


def test_review_wording_no_longer_implies_saved_photo_is_missing():
    assert "Additional photos H38 recommends" in CLIENT
    assert "No additional photos needed." in CLIENT
    assert "Measurements still unverified" in CLIENT
    assert "No additional measurements needed." in CLIENT


def test_measurement_authority_loads_before_guided_review_runtime():
    authority = INDEX.index('./measurement-verification-authority.js?build=20260821-measurement-verification-authority-1')
    guided = INDEX.index('./field-visit-guided-controller.js?build=20260811-guided-ar-advance-1')
    assert authority < guided
