import subprocess
from pathlib import Path


def test_site_visit_wide_acceptance_replay():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["node", "scripts/verify-site-visit-wide-acceptance.js"],
        cwd=root,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    assert "PASS quote machine replay" in result.stdout
    assert "all quotes share bounded automatic repair" in result.stdout
