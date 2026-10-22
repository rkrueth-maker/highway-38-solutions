"""F9 (Rick, 2026-10-13): top-level Messages entry + customer inbox.

The Messages page (page key 'messages', already registered in PAGE_DEFS,
the desktop Daily work group, and Owner Controls MODULES) gains a
"Customer inbox" tab that aggregates the existing per-customer threads
(portal / text / email / customer-linked conversations) from the same
snapshot collections the customer record uses — no new message store.
The phone owner More sheet gains the Messages tile it was missing.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
APP01 = (APP / "app-01.js").read_text(encoding="utf-8")
APP08 = (APP / "app-08.js").read_text(encoding="utf-8")
APP09 = (APP / "app-09.js").read_text(encoding="utf-8")
MOBILE = (APP / "mobile-runtime-stability.js").read_text(encoding="utf-8")
FLOW = (APP / "job-centered-flow.js").read_text(encoding="utf-8")
DESKTOP_NAV = (APP / "desktop-navigation-authority.js").read_text(encoding="utf-8")
OWNER_CONTROLS = (APP / "owner-controls.js").read_text(encoding="utf-8")
INDEX = (APP / "index.html").read_text(encoding="utf-8")
SW = (APP / "service-worker.js").read_text(encoding="utf-8")
BUILD = "20261013-messages-entry-3"


def test_messages_page_registered_everywhere():
    assert "messages:['💬','Messages']" in APP01
    assert "'Daily work',Object.freeze(['today','customers','work','meetings','quotes','schedule','messages','field'])" in DESKTOP_NAV
    assert "{id:'messages',title:'Messages'" in OWNER_CONTROLS


def test_phone_owner_more_sheet_has_messages_tile():
    assert "['Work',['work','quotes','field','meetings','messages']]" in MOBILE
    assert "const MORE_ORDER=['quotes','field','schedule','messages','documents'" in FLOW


def test_inbox_is_the_default_messages_tab():
    assert "messageTab:'inbox'" in APP01
    assert "const tabs=['inbox','internal','email','sms','portal'" in APP08
    assert "tab==='inbox'?'Customer inbox'" in APP08
    assert "state.messageTab==='inbox'?customerInboxView()" in APP08
    assert "if(state.messageTab==='inbox'){bindCustomerInbox();}" in APP08
    assert "purpose:'Talk to customers in one place. Nothing sends until you approve it.'" in APP08


def test_inbox_aggregates_existing_customer_threads_only():
    for needle in [
        "function customerInboxThreads()",
        "records('portalThreads')",
        "records('portalMessages')",
        "records('smsThreads')",
        "records('smsMessages')",
        "records('emailThreads')",
        "records('emailMessages')",
        "records('conversations')",
        "records('messages')",
        "function customerInboxView()",
        "function bindCustomerInbox()",
        "function inboxQueryMatches(haystack,query)",
        'No conversations match',
    ]:
        assert needle in APP09, needle
    # The inbox never writes or sends: it only navigates to existing views.
    assert "queueOperation(" not in APP09.split("function customerInboxThreads()")[1]
    assert "data-inbox-open" in APP09
    assert "data-inbox-customer" in APP09
    assert "window.H38_CUSTOMER_360.selectedCustomerId" in APP09
    assert "H38_OWNER_CUSTOMER_WORKFLOW_POLISH.setContext" in APP09
    assert "H38ScriptLoader.loadPageScripts('customers')" in APP09
    assert "openPage('customers')" in APP09


def test_build_roll_pins():
    # SW cache rolled past BUILD by the 2026-10-13 card-top band pass; the
    # app-09 script stamp below still carries this PR's BUILD value.
    assert "const CACHE_NAME='h38-business-office-20261022-acct-tabs-2'" in SW
    assert f"./app-09.js?build={BUILD}" in INDEX
    for script in ["app-08.js", "job-centered-flow.js"]:
        assert f"./{script}?build=20261020-myhank-settings-1" in INDEX, script
    # mobile-runtime-stability.js rolled with the 20261022-acct-tabs-2 build
    # (Books added to the mobile More-sheet Money group).
    assert "./mobile-runtime-stability.js?build=20261022-acct-tabs-2" in INDEX
    # app-01.js rolled with the 2026-10-22 Phase 2 Books spreadsheet build
    # (new 'books' page def); the other myhank-settings pins stay.
    assert "./app-01.js?build=20261022-acct-tabs-1" in INDEX
