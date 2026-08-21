from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_site_visit_quote_landscape_replay_executes_real_final_runtime_contract():
    result = subprocess.run(
        ["node", str(ROOT / "scripts" / "verify-site-visit-quote-landscape-replay.js")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    assert result.returncode == 0, f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    assert "PASS site-visit-quote-landscape-replay" in result.stdout
