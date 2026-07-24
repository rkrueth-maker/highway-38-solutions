from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'scripts/verify-unified-app-shell.js',
    "assert('server navigation labels installed quote capability Quote Builder',quoteNavigationItem(enabledBootstrap).label==='Quote Builder');",
    "assert('server navigation keeps Quotes label while Quote Builder owns editing',quoteNavigationItem(enabledBootstrap).label==='Quotes');",
    'unified shell quote label'
)
