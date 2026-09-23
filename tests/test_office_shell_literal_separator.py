from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / 'commercial-app' / 'index.html').read_text(encoding='utf-8')


def test_office_shell_never_renders_literal_newline_escape_between_scripts():
    assert '</script>\\n  <script' not in INDEX
    tenant = INDEX.index('./assistant-tenant-actions.js')
    command = INDEX.index('./assistant-command-runtime.js')
    assert tenant < command


def test_assistant_runtime_scripts_remain_real_script_elements():
    assert '<script src="./assistant-tenant-actions.js' in INDEX
    assert '<script src="./assistant-command-runtime.js' in INDEX
