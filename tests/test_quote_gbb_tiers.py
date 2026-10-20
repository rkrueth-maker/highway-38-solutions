"""WS1 Good-Better-Best completion — string-pin contract tests (spec §8.1).

Pins the canonical-owner changes: tier ids, tier-aware send gates in all
three client files, the revision-authority tier fingerprint (R1), the
§3.1 acceptance snapshot in both runtimes, the tiers PDF branch, the
Portal A option-capture migration, and the tiered-preview regression
guard (no single-price add-ons decoration targets in the tier preview).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP06 = (ROOT / "commercial-app" / "app-06.js").read_text(encoding="utf-8")
APP07 = (ROOT / "commercial-app" / "app-07.js").read_text(encoding="utf-8")
APP20 = (ROOT / "commercial-app" / "app-20.js").read_text(encoding="utf-8")
REVISION = (ROOT / "commercial-app" / "quote-revision-authority.js").read_text(encoding="utf-8")
TOTAL_LOCK = (ROOT / "commercial-app" / "quote-total-lock.js").read_text(encoding="utf-8")
DELIVERY_CLIENT = (ROOT / "commercial-app" / "supabase-quote-delivery.js").read_text(encoding="utf-8")
FINAL_FIX = (ROOT / "commercial-app" / "quote-delivery-final-fix.js").read_text(encoding="utf-8")
PDF_FIX = (ROOT / "commercial-app" / "quote-pdf-send-live-fix.js").read_text(encoding="utf-8")
OWNER = (ROOT / "commercial-app" / "owner-customer-workflow-polish.js").read_text(encoding="utf-8")
HYDRATION = (ROOT / "commercial-app" / "supabase-portal-hydration.js").read_text(encoding="utf-8")
PORTAL_EDGE = (ROOT / "supabase" / "functions" / "h38-customer-portal" / "index.ts").read_text(encoding="utf-8")
DELIVERY_EDGE = (ROOT / "supabase" / "functions" / "h38-quote-delivery" / "index.ts").read_text(encoding="utf-8")
PORTAL_A = (ROOT / "customer-portal-supabase.js").read_text(encoding="utf-8")
MIGRATION = (ROOT / "supabase" / "migrations" / "20261020120000_quote_gbb_portal_options.sql").read_text(encoding="utf-8")
GBB_CSS = (ROOT / "commercial-app" / "good-better-best.css").read_text(encoding="utf-8")


def test_save_quote_writes_tier_ids_and_tier_mode():
    assert "id:t.id||['good','better','best'][ti]" in APP06
    assert "'Tier Mode':tierMode?'Good-Better-Best':'Single'" in APP06
    assert "{id:'good',name:'Good'" in APP06
    assert "{id:'better',name:'Better'" in APP06
    assert "{id:'best',name:'Best'" in APP06
    # openQuote hydrates ids for pre-existing records without them
    assert "id:String((t&&t.id)||['good','better','best'][ti])" in APP07


def test_single_price_record_construction_unchanged():
    assert "lines=tierMode?[]:(state.quote.lines||[])" in APP06
    assert "'Subtotal':total,'Tax':0,'Total':total" in APP06


def test_tier_editor_completions():
    assert 'data-tier-search="' in APP06
    assert 'data-tier-add-unit="' in APP06
    assert 'data-tier-line-field="description"' in APP06
    assert 'data-tier-line-field="unitPrice"' in APP06
    assert 'data-tier-copy-source="' in APP06
    assert "h38TierSummary" in APP06
    assert "Quote total shows Better until the customer chooses" in APP06
    assert "h38PriceBookFilter" in APP06
    assert ".h38-tier-summary" in GBB_CSS
    assert ".h38-tier-picker-results" in GBB_CSS


def test_revision_authority_fingerprints_tiers():
    assert "tierMode:text(val(src,'Tier Mode','tierMode'))" in REVISION
    assert "tiers:(Array.isArray(rawTiers)?rawTiers:[])" in REVISION
    assert "payload.tiers=record.tiers" in REVISION
    assert "payload.tierMode=" in REVISION


def test_total_lock_guard_is_tier_aware():
    assert "function guardTotal(q)" in TOTAL_LOCK
    assert "q.tiers[1].items" in TOTAL_LOCK


def test_all_three_send_gates_are_tier_aware():
    for source in (DELIVERY_CLIENT, FINAL_FIX, PDF_FIX):
        assert "Good-Better-Best" in source
        assert "Every Good / Better / Best option needs at least one reviewed line before sending." in source
        assert "Customer picks one in the portal; the quote total updates to their choice." in source
    assert "function hasLines(details)" in DELIVERY_CLIENT
    assert "button.disabled=!details.quoteId||!hasLines(details);" in DELIVERY_CLIENT
    # popup printers style tier cards
    assert "good-better-best.css" in FINAL_FIX
    assert "good-better-best.css" in PDF_FIX


def test_portal_b_approve_applies_section_31_snapshot():
    assert "function applyAcceptedOption(" in PORTAL_EDGE
    assert "'Accepted Option ID'" in PORTAL_EDGE.replace('"', "'")
    assert '"Accepted Option ID"' in PORTAL_EDGE
    assert '"Accepted Option Index"' in PORTAL_EDGE
    assert '"Accepted Option Name"' in PORTAL_EDGE
    assert '"Accepted Option Total"' in PORTAL_EDGE
    assert '"Accepted At Revision"' in PORTAL_EDGE
    # chosen total is recomputed from items, never the stored tier total
    assert "function tierTotalOf(tier: JsonObject)" in PORTAL_EDGE
    assert "chosenTotal = tierTotalOf(tier)" in PORTAL_EDGE
    # revision check with 409
    assert "expectedRevision !== currentRevision" in PORTAL_EDGE
    assert 'reply(req, 409' in PORTAL_EDGE
    # approvals record carries id + name + chosen total (not name-only, not Better total)
    assert '"Tier": approvalTierId' in PORTAL_EDGE
    assert '"Tier Name": approvalTierName' in PORTAL_EDGE
    assert '"Total": approvalTotal' in PORTAL_EDGE
    # legacy name-based write is gone
    assert '"Approved Tier"' not in PORTAL_EDGE
    # bundle passes revision, tier id, item unit
    assert 'revision: numberValue(pick(p, "Locked Revision", "lockedRevision"))' in PORTAL_EDGE
    assert 'id: clean(pick(t, "id"), 20) || TIER_IDS[ti]' in PORTAL_EDGE
    assert 'unit: clean(pick(l, "unit", "Unit"), 30)' in PORTAL_EDGE


def test_delivery_edge_tiers_pdf_and_validation():
    assert "function isTieredQuote(" in DELIVERY_EDGE
    assert "Every Good / Better / Best option needs at least one reviewed line before sending." in DELIVERY_EDGE
    assert "Choose one option when you approve in the portal. Your total is the option you choose." in DELIVERY_EDGE
    assert "options: tiered ? quoteOptions(quote) : null" in DELIVERY_EDGE
    assert "tiers: tiered ? quoteTiers(quote) : undefined" in DELIVERY_EDGE


def test_owner_recorded_acceptance_snapshots_chosen_option():
    assert "function applyAcceptedOptionSnapshot(" in OWNER
    assert "'Accepted Option ID':" in OWNER
    assert "'Accepted Option Index':optionIndex" in OWNER
    assert "h38OptionPickerDialog" in OWNER
    assert "data-quote-portal-accept" in OWNER
    assert "recordPortalAcceptance" in OWNER


def test_portal_a_option_capture():
    assert "add column if not exists options jsonb" in MIGRATION
    assert "add column if not exists selected_option text" in MIGRATION
    assert "p_option_index integer default null" in MIGRATION
    assert "Choose which option you are approving" in MIGRATION
    assert "data-approve-option" in PORTAL_A
    assert "p_option_index:optionIndex" in PORTAL_A
    assert "'Selected Option':row.selected_option" in HYDRATION


def test_tier_preview_has_no_single_price_decoration_targets():
    start = APP20.index("function renderTierQuotePreview(){")
    end = APP20.index("function renderQuotePreview(){")
    tier_preview = APP20[start:end]
    assert "quote-table" not in tier_preview
    assert "quote-totals" not in tier_preview
    assert "h38-tier-presentation" in tier_preview
    # tier preview prints through the safe in-page printer
    assert "H38_SAFE_QUOTE_PRINT" in tier_preview
