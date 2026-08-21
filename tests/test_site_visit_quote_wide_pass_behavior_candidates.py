from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = (ROOT / 'supabase' / 'functions' / 'h38-quote-options' / 'index.ts').read_text(encoding='utf-8')


def test_garage_behavior_only_varies_supported_scope():
    start = EDGE.index('GARAGE behavior:')
    end = EDGE.index('RETAINING WALL behavior:')
    garage = EDGE[start:end]
    assert 'preserve the actual garage scope' in garage
    assert 'never inject drywall, insulation, doors, electrical, storage' in garage
    assert 'unless the project scope/evidence supports it' in garage


def test_retaining_wall_behavior_keeps_structural_unknowns_visible():
    start = EDGE.index('RETAINING WALL behavior:')
    retaining = EDGE[start:]
    assert 'preserving the requested wall purpose and known geometry' in retaining
    assert 'Drainage, base preparation and structural/engineering unknowns must remain visible' in retaining
    assert 'never invent wall height, loading or reinforcement' in retaining


def test_behavior_classification_checks_retaining_before_general_garage_landscape():
    block = EDGE[EDGE.index('function behaviorClass'):EDGE.index('function words')]
    retaining = block.index('retaining-wall')
    garage = block.index('garage')
    landscape = block.index('landscape-border')
    assert retaining < garage < landscape
