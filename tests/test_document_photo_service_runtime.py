from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "commercial-app" / "document-photo-service-runtime-v2.js"
LOADER = ROOT / "commercial-app" / "assistant-command-runtime.js"


def node_check(path: Path) -> None:
    result = subprocess.run(
        ["node", "--check", str(path)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_document_runtime_javascript_parses():
    node_check(RUNTIME)
    node_check(LOADER)


def test_document_runtime_preserves_owner_authority():
    source = RUNTIME.read_text(encoding="utf-8")
    assert "automaticCustomerRelease:false" in source
    assert "automaticSend:false" in source
    assert "photoAutoAssignment:false" in source
    assert "aiMeasurementsVerified:false" in source
    assert "assignmentRequiresConfirmation:true" in source
    assert "measurementsVerified:false" in source
    assert "available_to_customer:true" in source
    assert "RELEASE_DOCUMENT_TO_CUSTOMER" in source
    assert "Ready for owner release" in source
    assert "Automatic Send':false" in source


def test_document_runtime_is_loaded_by_network_first_assistant_runtime():
    loader = LOADER.read_text(encoding="utf-8")
    assert "document-photo-service-runtime-v2.js?build=20260825-document-photo-service-2" in loader
    assert "loadDocumentServiceRuntime" in loader
    assert "smartDocumentRuntime:true" in loader


def test_document_runtime_exposes_product_and_cost_seams():
    source = RUNTIME.read_text(encoding="utf-8")
    assert "H38_PRODUCT_CAPABILITIES" in source
    assert "H38_PRODUCT_PACKAGING" in source
    for meter in ("ai_tokens", "storage_bytes", "portal_release", "service_release"):
        assert meter in source
    for candidate in ("site-visit", "quote-visual", "reseller-scout", "meeting-assistant", "recurring-service-manager"):
        assert candidate in source
