from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / 'commercial-app' / 'index.html').read_text(encoding='utf-8')


def test_office_shell_never_renders_literal_newline_escape_between_scripts():
    assert '</script>\\n  <script' not in INDEX
    tenant = INDEX.index('./assistant-tenant-actions.js')
    command = INDEX.index('./assistant-command-runtime.js')
    assert tenant < command


def test_assistant_runtime_scripts_remain_real_script_elements():
    assert '<script defer src="./assistant-tenant-actions.js?build=20260929-readable-action-preview-8' in INDEX
    assert '<script defer src="./assistant-command-runtime.js?build=20260824-assistant-command-runtime-1' in INDEX
