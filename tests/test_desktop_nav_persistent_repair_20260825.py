from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW = (ROOT / 'commercial-app' / 'flow-tightening.js').read_text(encoding='utf-8')
RUNTIME_GLOBALS = (ROOT / 'commercial-app' / 'supabase-runtime-globals.js').read_text(encoding='utf-8')
MEETINGS = (ROOT / 'commercial-app' / 'conversation-meeting-assistant.js').read_text(encoding='utf-8')
AUTH = (ROOT / 'commercial-app' / 'auth-cache-guard.js').read_text(encoding='utf-8')


def test_desktop_nav_uses_business_office_native_click_path():
    assert "nav.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>window.openPage(button.dataset.page))" in FLOW
    assert "window.renderNav=function(){return compactRenderNav(base);}" in FLOW
    assert "desktop-navigation-core.js?build=" not in RUNTIME_GLOBALS
    assert "loadDesktopNavigationCore();" not in RUNTIME_GLOBALS
    assert "button.onclick=()=>window.openPage('meetings')" in MEETINGS
    assert 'desktopNavigationCacheBridge' not in AUTH
    assert 'desktopNavigationWindowCapture' not in AUTH


def test_desktop_nav_preserves_owner_safety_and_mobile_separation():
    assert "@media(max-width:760px)" in FLOW
    assert 'primaryNavDelegatedToFinalMobileRuntime:true' in FLOW
    assert 'automaticApproval:false' in FLOW
    assert 'automaticCustomerSending:false' in FLOW
    assert 'automaticPurchasing:false' in FLOW
    assert 'automaticPayment:false' in FLOW
