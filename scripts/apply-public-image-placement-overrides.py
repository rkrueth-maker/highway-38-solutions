#!/usr/bin/env python3
"""Apply approved public image placement overrides in a disposable build workspace."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_PATH = ROOT / "scripts/config/approved-public-image-placements.json"
OVERRIDE_PATH = ROOT / "scripts/config/approved-public-image-placement-overrides.json"


def main() -> int:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8"))
    override = json.loads(OVERRIDE_PATH.read_text(encoding="utf-8"))

    base["policyVersion"] = override["policyVersion"]
    page_name = override["page"]
    role_updates = override["roles"]
    found: set[str] = set()

    for placement in base.get("pages", {}).get(page_name, []):
        role = placement.get("role")
        if role in role_updates:
            placement.update(role_updates[role])
            found.add(role)

    missing = sorted(set(role_updates) - found)
    if missing:
        raise RuntimeError(f"placement override roles not found: {', '.join(missing)}")

    change = override.get("placementChange")
    changes = base.setdefault("placementChanges", [])
    if change and not any(item.get("reason") == change.get("reason") for item in changes):
        changes.append(change)

    BASE_PATH.write_text(json.dumps(base, indent=2) + "\n", encoding="utf-8")
    print(f"Applied {len(found)} approved placement overrides to {page_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
