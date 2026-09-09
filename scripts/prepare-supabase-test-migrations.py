#!/usr/bin/env python3
"""Prepare a disposable Supabase migration tree for clean-replay tests.

Historical H38 migrations predate the current 14-digit Supabase migration
version convention and one historical tenant-provisioning migration depended
on a real production owner account. Production history must not be rewritten,
so CI fixes those constraints only inside a throw-away copy.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "supabase" / "acceptance" / "production-policy.json"
VERSION_RE = re.compile(r"^(\d+)_")
CANONICAL_RE = re.compile(r"^\d{14}$")


def fail(message: str) -> None:
    print(f"FAIL  {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--directory",
        type=Path,
        required=True,
        help="Disposable migrations directory to canonicalize. Never point this at production.",
    )
    args = parser.parse_args()
    migrations = args.directory.resolve()

    if not migrations.is_dir():
        fail(f"migration directory does not exist: {migrations}")

    policy = json.loads(POLICY.read_text("utf-8"))
    mapping: dict[str, str] = policy.get("legacy_migration_replay_versions", {})
    fixtures: list[dict[str, str]] = policy.get("legacy_replay_fixtures", [])
    files = sorted(migrations.glob("*.sql"))
    names = {p.name for p in files}

    missing = sorted(set(mapping) - names)
    if missing:
        fail("legacy replay map references missing file(s): " + ", ".join(missing))

    noncanonical: list[str] = []
    for p in files:
        match = VERSION_RE.match(p.name)
        if not match or not CANONICAL_RE.fullmatch(match.group(1)):
            noncanonical.append(p.name)

    unmapped = sorted(set(noncanonical) - set(mapping))
    if unmapped:
        fail("noncanonical migration(s) are not approved for CI replay: " + ", ".join(unmapped))

    planned: dict[Path, Path] = {}
    resulting_versions: dict[str, str] = {}
    for p in files:
        match = VERSION_RE.match(p.name)
        if not match:
            fail(f"migration has no numeric version prefix: {p.name}")
        original_version = match.group(1)
        replay_version = mapping.get(p.name, original_version)
        if not CANONICAL_RE.fullmatch(replay_version):
            fail(f"replay version for {p.name} is not 14 digits: {replay_version}")
        prior = resulting_versions.get(replay_version)
        if prior:
            fail(f"replay version collision {replay_version}: {prior}, {p.name}")
        resulting_versions[replay_version] = p.name
        if replay_version != original_version:
            suffix = p.name[len(original_version):]
            planned[p] = p.with_name(replay_version + suffix)

    targets = [p.name for p in planned.values()]
    if len(targets) != len(set(targets)):
        fail("canonicalization produced duplicate target filenames")
    for source, target in planned.items():
        if target.exists() and target != source:
            fail(f"canonicalization target already exists: {target.name}")

    for source, target in planned.items():
        print(f"REPLAY {source.name} -> {target.name}")
        source.rename(target)

    for fixture in fixtures:
        source_rel = fixture.get("source", "")
        filename = fixture.get("filename", "")
        source = (ROOT / source_rel).resolve()
        target = migrations / filename
        match = VERSION_RE.match(filename)
        if not source.is_file():
            fail(f"CI replay fixture source is missing: {source_rel}")
        if not match or not CANONICAL_RE.fullmatch(match.group(1)):
            fail(f"CI replay fixture filename must use a 14-digit version: {filename}")
        if target.exists():
            fail(f"CI replay fixture target already exists: {filename}")
        print(f"FIXTURE {source_rel} -> {filename}")
        shutil.copyfile(source, target)

    final_files = sorted(migrations.glob("*.sql"))
    versions: dict[str, str] = {}
    for p in final_files:
        match = VERSION_RE.match(p.name)
        if not match or not CANONICAL_RE.fullmatch(match.group(1)):
            fail(f"noncanonical migration remains after preparation: {p.name}")
        prior = versions.get(match.group(1))
        if prior:
            fail(f"duplicate migration version remains after preparation: {prior}, {p.name}")
        versions[match.group(1)] = p.name

    print(
        f"PASS  prepared {len(final_files)} migration(s); "
        f"remapped {len(planned)} legacy filename(s); injected {len(fixtures)} CI fixture(s)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
