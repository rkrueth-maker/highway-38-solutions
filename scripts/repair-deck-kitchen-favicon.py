#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance
import json

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets' / 'demo-workthroughs'


def repaired(src_name: str, dst_name: str, top_ratio: float, centering: tuple[float, float]) -> None:
    src = ASSETS / src_name
    dst = ASSETS / dst_name
    image = Image.open(src).convert('RGB')
    width, height = image.size
    top = max(0, min(height - 2, round(height * top_ratio)))
    image = image.crop((0, top, width, height))
    image = ImageOps.fit(
        image,
        (1200, 675),
        method=Image.Resampling.LANCZOS,
        centering=centering,
    )
    image = ImageEnhance.Contrast(image).enhance(1.03)
    image = ImageEnhance.Sharpness(image).enhance(1.08)
    image.save(dst, 'WEBP', quality=91, method=6)
    print(f'{src.relative_to(ROOT)} -> {dst.relative_to(ROOT)} ({dst.stat().st_size} bytes)')


def replace_text_files() -> None:
    replacements = {
        'deck-before.webp': 'deck-existing-condition.webp',
        'deck-after.webp': 'deck-finished-concept.webp',
        'kitchen-before.webp': 'kitchen-existing-condition.webp',
        'kitchen-after.webp': 'kitchen-remodel-concept.webp',
        'irrigation-before.webp?v=20260724-repaired-v1': 'irrigation-before.webp?v=20260722-direct-v2',
        'irrigation-after.webp?v=20260724-repaired-v1': 'irrigation-after.webp?v=20260722-direct-v2',
    }
    suffixes = {'.html', '.js', '.json', '.md', '.txt', '.sh', '.py'}
    for path in ROOT.rglob('*'):
        if not path.is_file() or '.git' in path.parts or path.suffix.lower() not in suffixes:
            continue
        if '.github' in path.parts and 'workflows' in path.parts:
            continue
        if path.name == 'repair-deck-kitchen-favicon.py':
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        updated = text
        for old, new in replacements.items():
            updated = updated.replace(old, new)
        updated = updated.replace(
            '<link rel="icon" href="favicon.svg">',
            '<link rel="icon" type="image/png" href="assets/highway38-logo.png?v=20260720-exact-0cbc4514">',
        )
        if updated != text:
            path.write_text(updated, encoding='utf-8')


def update_sample_library() -> None:
    path = ROOT / 'sample-library-now.html'
    text = path.read_text(encoding='utf-8')
    old_deck = '<article class="project-card"><div class="project-visual"><figure><span>Before</span><img src="assets/demo-workthroughs/deck-existing-condition.webp?v=20260724-repaired-v1" alt="Deck before"></figure><figure><span>After</span><img src="assets/demo-workthroughs/deck-finished-concept.webp?v=20260724-repaired-v1" alt="Deck after"></figure>'
    new_deck = '<article class="project-card" data-project="deck"><div class="project-visual"><figure><span>Existing Site</span><img src="assets/demo-workthroughs/deck-existing-condition.webp?v=20260724-repaired-v1" width="1200" height="675" loading="lazy" alt="Existing rear entry before deck construction"></figure><figure><span>Finished Concept</span><img src="assets/demo-workthroughs/deck-finished-concept.webp?v=20260724-repaired-v1" width="1200" height="675" loading="lazy" alt="Finished 8 by 12 pressure-treated deck concept"></figure>'
    old_kitchen = '<article class="project-card"><div class="project-visual"><figure><span>Before</span><img src="assets/demo-workthroughs/kitchen-existing-condition.webp?v=20260724-repaired-v1" alt="Kitchen before"></figure><figure><span>After</span><img src="assets/demo-workthroughs/kitchen-remodel-concept.webp?v=20260724-repaired-v1" alt="Kitchen after"></figure>'
    new_kitchen = '<article class="project-card" data-project="kitchen"><div class="project-visual"><figure><span>Existing Kitchen</span><img src="assets/demo-workthroughs/kitchen-existing-condition.webp?v=20260724-repaired-v1" width="1200" height="675" loading="lazy" alt="Existing dated kitchen before renovation"></figure><figure><span>Remodel Concept</span><img src="assets/demo-workthroughs/kitchen-remodel-concept.webp?v=20260724-repaired-v1" width="1200" height="675" loading="lazy" alt="Mid-range kitchen remodel concept"></figure>'
    if old_deck in text:
        text = text.replace(old_deck, new_deck)
    if old_kitchen in text:
        text = text.replace(old_kitchen, new_kitchen)
    if new_deck not in text or new_kitchen not in text:
        raise RuntimeError('Sample Library repaired deck or kitchen markup is missing.')
    path.write_text(text, encoding='utf-8')


def update_quote_demo() -> None:
    path = ROOT / 'contractor-quote-complete.html'
    text = path.read_text(encoding='utf-8')
    text = text.replace('.photos figure{margin:0;', '.photos figure{position:relative;margin:0;')
    text = text.replace('.badge{position:absolute;margin:10px;', '.badge{position:absolute;top:0;left:0;z-index:2;margin:10px;')
    text = text.replace(
        '<span class="badge">Before</span><img id="before" alt="Before example">',
        '<span class="badge" id="beforeBadge">Before</span><img id="before" alt="Before example">',
    )
    text = text.replace(
        '<span class="badge">After</span><img id="after" alt="After example">',
        '<span class="badge" id="afterBadge">After</span><img id="after" alt="After example">',
    )
    text = text.replace("deck:{n:'Q-DEMO-005'", "deck:{bl:'Existing site',al:'Finished concept',n:'Q-DEMO-005'")
    text = text.replace("kitchen:{n:'Q-DEMO-007'", "kitchen:{bl:'Existing kitchen',al:'Remodel concept',n:'Q-DEMO-007'")
    text = text.replace(
        'before.src=x.before;after.src=x.after;beforeCap.textContent=x.bc;afterCap.textContent=x.ac;',
        "before.src=x.before;after.src=x.after;before.alt=x.bc;after.alt=x.ac;beforeBadge.textContent=x.bl||'Before';afterBadge.textContent=x.al||'After';beforeCap.textContent=x.bc;afterCap.textContent=x.ac;",
    )
    path.write_text(text, encoding='utf-8')


def update_manifest() -> None:
    path = ROOT / 'scripts' / 'config' / 'approved-public-image-placements.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    data['policyVersion'] = '2026-07-24-deck-kitchen-favicon-repair-v1'
    changes = data.setdefault('placementChanges', [])
    entry = {
        'date': '2026-07-24',
        'page': 'sample-library-now.html and contractor-quote-complete.html',
        'section': 'Deck and kitchen existing-condition / finished-concept visuals and browser favicon',
        'oldPlacement': 'Source WebP files with embedded BEFORE/AFTER graphics and generic H38 path favicon',
        'newPlacement': 'Label-free normalized WebP derivatives with page-owned honest labels; public pages use the exact approved mountain-and-road logo as the favicon',
        'reason': 'Owner-directed repair after live review identified duplicate image labels, inconsistent concept presentation, and the wrong browser-tab icon',
        'binaryPolicy': 'Original source images remain for rollback. New derivatives preserve the underlying scenes and remove only the labeled top edge. The favicon references the exact approved assets/highway38-logo.png binary.',
    }
    if entry not in changes:
        changes.append(entry)
    sample_entries = {item['role']: item for item in data['pages']['sample-library-now.html']}
    sample_entries['example-05-before']['alt'] = 'Existing rear entry before deck construction'
    sample_entries['example-05-after']['alt'] = 'Finished 8 by 12 pressure-treated deck concept'
    sample_entries['example-07-before']['alt'] = 'Existing dated kitchen before renovation'
    sample_entries['example-07-after']['alt'] = 'Mid-range kitchen remodel concept'
    path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')


def verify() -> None:
    sample = (ROOT / 'sample-library-now.html').read_text(encoding='utf-8')
    quote = (ROOT / 'contractor-quote-complete.html').read_text(encoding='utf-8')
    manifest = (ROOT / 'scripts' / 'config' / 'approved-public-image-placements.json').read_text(encoding='utf-8')
    required = {
        'sample deck label': 'Existing Site' in sample,
        'sample kitchen label': 'Remodel Concept' in sample,
        'sample approved favicon': 'assets/highway38-logo.png?v=20260720-exact-0cbc4514' in sample,
        'irrigation cache unchanged': 'irrigation-before.webp?v=20260722-direct-v2' in sample and 'irrigation-after.webp?v=20260722-direct-v2' in sample,
        'quote deck label': "bl:'Existing site'" in quote,
        'quote kitchen label': "bl:'Existing kitchen'" in quote,
        'quote badge positioning': '.badge{position:absolute;top:0;left:0;z-index:2;' in quote,
        'manifest deck alt': 'Existing rear entry before deck construction' in manifest,
        'manifest kitchen alt': 'Mid-range kitchen remodel concept' in manifest,
    }
    for name in (
        'deck-existing-condition.webp',
        'deck-finished-concept.webp',
        'kitchen-existing-condition.webp',
        'kitchen-remodel-concept.webp',
    ):
        required[f'asset {name}'] = (ASSETS / name).exists() and (ASSETS / name).stat().st_size > 10_000
    failures = [name for name, ok in required.items() if not ok]
    if failures:
        raise RuntimeError('Repair verification failed: ' + ', '.join(failures))
    print(json.dumps(required, indent=2))


def main() -> None:
    repaired('deck-before.webp', 'deck-existing-condition.webp', 0.14, (0.50, 0.54))
    repaired('deck-after.webp', 'deck-finished-concept.webp', 0.14, (0.50, 0.52))
    repaired('kitchen-before.webp', 'kitchen-existing-condition.webp', 0.14, (0.50, 0.54))
    repaired('kitchen-after.webp', 'kitchen-remodel-concept.webp', 0.14, (0.50, 0.52))
    replace_text_files()
    update_sample_library()
    update_quote_demo()
    update_manifest()
    verify()


if __name__ == '__main__':
    main()
