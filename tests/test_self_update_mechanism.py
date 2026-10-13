from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
SW = (APP / 'service-worker.js').read_text(encoding='utf-8')
INDEX = (APP / 'index.html').read_text(encoding='utf-8')
MANIFEST = json.loads((APP / 'version.json').read_text(encoding='utf-8'))


def test_self_update_verifier_passes():
    result = subprocess.run(
        ['node', str(ROOT / 'scripts/verify-self-update.js')],
        capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


def test_version_json_advances_in_lockstep_with_sw_cache_name():
    # The 2026-10-13 recurrence: ~10 builds rolled CACHE_NAME while
    # version.json stayed at the 2026-10-12 stamp, so the startup version
    # check saw "no change" forever and installed clients never healed.
    version = MANIFEST['version']
    assert version
    assert MANIFEST.get('deployed')
    assert f"const CACHE_NAME='h38-business-office-{version}';" in SW


def test_shell_precache_has_no_duplicate_entries():
    # Round-2 root cause (2026-10-13, proven in Chromium): SHELL carried
    # './job-lifecycle.css', './personal-assistant.css' and
    # './office-polish.css' twice each since ~2026-09-30. cache.addAll
    # rejects the whole batch on a duplicate, so the canonical worker's
    # install failed on every Chromium client and it never activated —
    # the version.json heal had no working worker to land on.
    import re
    shell = SW.split('const SHELL=[', 1)[1].split('];', 1)[0]
    entries = re.findall(r"'([^']+)'", shell)
    assert len(entries) >= 100
    dupes = sorted({e for e in entries if entries.count(e) > 1})
    assert not dupes, f'duplicate SHELL entries: {dupes}'


def test_shell_entries_exist_on_disk():
    import re
    shell = SW.split('const SHELL=[', 1)[1].split('];', 1)[0]
    entries = re.findall(r"'([^']+)'", shell)
    missing = [e for e in entries
               if (e.startswith('./') or e.startswith('../'))
               and not (APP / e).resolve().exists()]
    assert not missing, f'SHELL entries missing on disk: {missing}'


def test_install_precache_cannot_be_killed_by_one_bad_entry():
    # The precache must dedupe and cache entries independently; a single
    # atomic cache.addAll(SHELL) lets one duplicate/404 entry brick the
    # worker's install for every client.
    assert 'addAll(SHELL)' not in SW
    assert 'new Set(SHELL)' in SW
    assert 'cache.add(url)' in SW


def test_version_probe_is_never_served_from_sw_cache():
    # If version.json is not LIVE_FIRST, the SW answers the timestamped
    # probe from cache (ignoreSearch) and the check can never fire.
    live_first = SW.split('const LIVE_FIRST=new Set([', 1)[1].split('])', 1)[0]
    assert "'version.json'" in live_first


def test_startup_check_is_first_inline_script_with_foreground_recheck():
    head = INDEX.split('</head>', 1)[0]
    block_at = head.index('H38 Auto-Update')
    first_external = head.index('<script src=')
    assert block_at < first_external
    block = head[head.rindex('<script', 0, block_at):head.index('</script>', block_at)]
    assert './version.json?_=' in block
    assert "'h38-app-version'" in block
    assert 'location.replace' in block
    assert '_refresh=' in block
    # Long-lived app instances (resumed PWA / restored tab) may never
    # navigate again; the check must re-run on foregrounding, loop-capped.
    assert 'pageshow' in block
    assert 'visibilitychange' in block
    assert 'h38-app-version-heal' in block
