from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOBILE = (ROOT / "commercial-app" / "mobile-runtime-stability.js").read_text(encoding="utf-8")
JOB_CENTERED = (ROOT / "commercial-app" / "job-centered-flow.js").read_text(encoding="utf-8")


def test_production_mobile_polish_keeps_records_before_admin_tools():
    assert "20260819-production-mobile-polish-3" in MOBILE
    assert "moveCardsFirst(grid,[requests,jobs,tasks])" in MOBILE
    assert "moveCardsFirst(grid,[start,customers,properties])" in MOBILE
    assert "wrapToolCard(byName('New request'),'New request')" in MOBILE
    assert "wrapToolCard(byName('New job'),'New job')" in MOBILE
    assert "wrapToolCard(byName('Assign task'),'Assign task')" in MOBILE
    assert "mobileJobsCreationToolsCollapsed:true" in MOBILE
    assert "mobileRecordCardsFirst:true" in MOBILE


def test_customer_mobile_collapse_is_full_width_not_one_grid_column():
    assert "customerGridCollapseRegressionFixed:true" in MOBILE
    assert "grid-column:1/-1!important" in MOBILE
    assert "width:100%!important;min-width:0!important" in MOBILE
    assert "Add or edit customer" in MOBILE
    assert "Add property" in MOBILE


def test_production_header_and_messages_use_customer_facing_copy():
    assert "productionHeaderCompact:true" in MOBILE
    assert "brand.textContent='H38 Office'" in MOBILE
    assert "h1.textContent='Messages'" in MOBILE
    assert "Team conversations" in MOBILE
    assert "Start a conversation" in MOBILE
    assert "Tools, money, records and settings" in MOBILE


def test_old_job_centered_runtime_does_not_periodically_rewrite_primary_nav():
    assert "20260819-job-centered-event-driven-2" in JOB_CENTERED
    assert "primaryNavDelegatedToFinalMobileRuntime:true" in JOB_CENTERED
    assert "periodicPrimaryNavWrites:false" in JOB_CENTERED
    assert "window.H38_MOBILE_RUNTIME_STABILITY?.mobilePrimaryNavigationSingleAuthority" in JOB_CENTERED
    assert "setInterval(apply,850)" not in JOB_CENTERED


def test_polish_does_not_add_automatic_commercial_actions():
    for source in (MOBILE, JOB_CENTERED):
        assert "automaticApproval:false" in source
        assert "automaticPurchasing:false" in source
        assert "automaticPayment:false" in source
    assert "automaticCustomerSending:false" in MOBILE
    assert "automaticSending:false" in JOB_CENTERED
