from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'supabase' / 'functions' / 'h38-quote-ai' / 'index.ts').read_text(encoding='utf-8')

FLOWER_SCOPE = (
    'Install a border/edging around the existing flower garden to dress it up; '
    'add black dirt to the garden; remove some trees; remove weeds and detritus.'
)


def trade_required(text: str, target: str) -> bool:
    if target == 'insulation':
        return bool(re.search(r'\binsulat(?:e|ed|ing|ion)\b', text, re.I))
    return bool(re.search(r'\b(?:drywall|sheet\s*rock|sheetrock)\b', text, re.I))


def test_flower_garden_scope_is_not_drywall_or_insulation():
    assert not trade_required(FLOWER_SCOPE, 'insulation')
    assert not trade_required(FLOWER_SCOPE, 'drywall')


def test_actual_trade_scopes_still_require_their_trade():
    assert trade_required('Install R19 insulation in the garage walls.', 'insulation')
    assert trade_required('Hang and finish drywall on the garage ceiling.', 'drywall')


def test_scope_requires_uses_project_work_not_policy_text():
    start = SOURCE.index('function projectWorkText(')
    end = SOURCE.index('function targetLine(', start)
    block = SOURCE[start:end]
    assert 'context.projectTitle' in block
    assert 'context.scope' in block
    assert 'context.ownerInstructions' not in block
    assert 'context.systemQuotePolicy' not in block


def test_model_contract_explicitly_keeps_policy_out_of_scope_detection():
    assert 'SYSTEM QUOTE POLICY is rules only and MUST NEVER add a trade, material, or work item to project scope.' in SOURCE
    assert 'Actual requested project work comes only from PROJECT TITLE, CURRENT SCOPE' in SOURCE


def test_server_accepts_separate_owner_work_and_system_policy_fields():
    assert 'ownerWorkRequest: clean(body.ownerWorkRequest, 8000)' in SOURCE
    assert 'systemQuotePolicy: clean(body.systemQuotePolicy, 12000)' in SOURCE
    assert 'userProjectContext:' in SOURCE
