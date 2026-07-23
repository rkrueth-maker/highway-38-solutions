#!/usr/bin/env python3
"""One-time bounded repair for the verified blank manufacturing image defect."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ["APPROVED_SOURCE_FILE"])
EXPECTED_SHA256 = os.environ["APPROVED_SHA256"]
EXPECTED_BLOB_SHA = os.environ["APPROVED_BLOB_SHA"]
CACHE_KEY = os.environ["APPROVED_CACHE_KEY"]

OLD_PLAIN = "assets/approved-website-images/manufacturing-automation.webp"
OLD_KEYED = OLD_PLAIN + "?v=8d23576d"
NEW_PLAIN = "assets/approved-website-images/manufacturing-automation.jpg"
NEW_KEYED = f"{NEW_PLAIN}?v={CACHE_KEY}"


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode("ascii") + data).hexdigest()


def validate_source() -> bytes:
    data = SOURCE.read_bytes()
    actual_sha256 = hashlib.sha256(data).hexdigest()
    actual_blob = git_blob_sha(data)
    if actual_sha256 != EXPECTED_SHA256:
        raise SystemExit(f"Approved source SHA-256 mismatch: {actual_sha256}")
    if actual_blob != EXPECTED_BLOB_SHA:
        raise SystemExit(f"Approved source Git blob mismatch: {actual_blob}")
    with Image.open(SOURCE) as image:
        image.load()
        if image.format != "JPEG" or image.size != (1600, 900):
            raise SystemExit(
                f"Unexpected approved source format/dimensions: {image.format} {image.size}"
            )
        if max(ImageStat.Stat(image.convert("RGB")).stddev) < 20:
            raise SystemExit("Approved source appears visually blank.")
    return data


def repair_pages() -> None:
    expected_counts = {
        "solutions.html": 2,
        "about.html": 1,
        "robotics-automation.html": 2,
    }
    for page_name, expected in expected_counts.items():
        page = ROOT / page_name
        text = page.read_text(encoding="utf-8")
        old_count = text.count(OLD_KEYED) + text.replace(OLD_KEYED, "").count(OLD_PLAIN)
        if old_count != expected:
            raise SystemExit(
                f"{page_name}: expected {expected} broken references, found {old_count}"
            )
        text = text.replace(OLD_KEYED, NEW_KEYED).replace(OLD_PLAIN, NEW_KEYED)
        if text.count(NEW_KEYED) != expected:
            raise SystemExit(f"{page_name}: repaired reference count mismatch")
        page.write_text(text, encoding="utf-8")


def repair_architecture_verifier() -> None:
    path = ROOT / "scripts/verify-public-website-architecture.js"
    text = path.read_text(encoding="utf-8")
    old = "'assets/approved-website-images/manufacturing-automation.webp',"
    new = "'assets/approved-website-images/manufacturing-automation.jpg',"
    if text.count(old) != 1:
        raise SystemExit("Architecture verifier manufacturing-image marker changed.")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def repair_placement_manifest() -> None:
    path = ROOT / "scripts/config/approved-public-image-placements.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["policyVersion"] = "2026-07-23-exact-placement-v3"

    for page_name, expected in (("solutions.html", 2), ("about.html", 1)):
        found = 0
        for item in manifest["pages"][page_name]:
            if item.get("src") == OLD_PLAIN:
                item["src"] = NEW_PLAIN
                item["cacheKey"] = CACHE_KEY
                found += 1
        if found != expected:
            raise SystemExit(
                f"{page_name}: expected {expected} manifest entries, found {found}"
            )

    manifest["pages"]["robotics-automation.html"] = [
        {
            "role": "hero",
            "src": NEW_PLAIN,
            "cacheKey": CACHE_KEY,
            "alt": "Industrial robot automation cell",
        },
        {
            "role": "automation-planning",
            "src": NEW_PLAIN,
            "cacheKey": CACHE_KEY,
            "alt": "Automation planning and robot cell",
        },
    ]

    record = {
        "date": "2026-07-23",
        "page": "solutions.html, about.html, robotics-automation.html",
        "section": "manufacturing and automation imagery",
        "oldPlacement": OLD_PLAIN,
        "newPlacement": NEW_PLAIN,
        "reason": (
            "Verified ChromeOS live-render defect: the approved WebP displayed as blank. "
            "Restored the exact owner-approved 1600x900 JPEG source without visual alteration."
        ),
        "binaryPolicy": (
            "Exact approved JPEG source bytes preserved; SHA-256 "
            "e311000da5b001aab8c57716f709404f6685b4c433410babb30c3cbbc17f6d0c; "
            "Git blob 460bf2eac1f2f63bce343c388dd85867e639e498. "
            "The prior WebP remains only for rollback history."
        ),
    }
    changes = manifest.setdefault("placementChanges", [])
    if not any(
        item.get("newPlacement") == NEW_PLAIN
        and "ChromeOS live-render defect" in item.get("reason", "")
        for item in changes
    ):
        changes.append(record)

    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def repair_asset_manifest() -> None:
    path = ROOT / "scripts/config/approved-public-assets.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    assets = manifest.setdefault("approved_content_assets", {})
    assets["manufacturing_automation"] = {
        "description": "Exact owner-approved manufacturing and automation image",
        "path": NEW_PLAIN,
        "git_blob_sha": EXPECTED_BLOB_SHA,
        "sha256": EXPECTED_SHA256,
        "width": 1600,
        "height": 900,
        "cache_key": CACHE_KEY,
        "public_reference": NEW_KEYED,
    }
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def repair_placement_verifier() -> None:
    path = ROOT / "scripts/verify-public-image-placements.js"
    text = path.read_text(encoding="utf-8")
    old = (
        "    check(`${page} ${item.role} exact source`,html.includes(item.src),item.src);\n"
        "    check(`${page} ${item.role} exact alt`,html.includes(`alt=\"${item.alt}\"`)"
        "||html.includes(`alt='${item.alt}'`),item.alt);"
    )
    new = (
        "    check(`${page} ${item.role} exact source`,html.includes(item.src),item.src);\n"
        "    if(item.cacheKey)check(`${page} ${item.role} exact cache key`,"
        "html.includes(`${item.src}?v=${item.cacheKey}`),"
        "`${item.src}?v=${item.cacheKey}`);\n"
        "    check(`${page} ${item.role} exact alt`,html.includes(`alt=\"${item.alt}\"`)"
        "||html.includes(`alt='${item.alt}'`),item.alt);"
    )
    if text.count(old) != 1:
        raise SystemExit("Placement verifier insertion marker changed.")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def repair_image_verifier() -> None:
    path = ROOT / "scripts/verify-public-images.py"
    text = path.read_text(encoding="utf-8")

    required_old = '        "approved_logo",\n        "shared_public_css",'
    required_new = (
        '        "approved_logo",\n'
        '        "approved_content_assets",\n'
        '        "shared_public_css",'
    )
    if text.count(required_old) != 1:
        raise SystemExit("Public-image verifier required-key marker changed.")
    text = text.replace(required_old, required_new, 1)

    call_marker = (
        '    if bool(logo.get("allow_image_substitute")):\n'
        '        errors.append("APPROVED LOGO POLICY ERROR: image substitution must remain disabled")\n\n'
    )
    validation_block = "\n".join(
        [
            '    for asset_key, item in assets.get("approved_content_assets", {}).items():',
            '        relative_path = str(item.get("path", ""))',
            '        approved_path = ROOT / relative_path',
            '        if not image_file_is_valid(approved_path):',
            '            errors.append(f"INVALID APPROVED CONTENT IMAGE: {asset_key} -> {relative_path}")',
            '            continue',
            '        actual_blob = git_blob_sha(approved_path)',
            '        expected_blob = str(item.get("git_blob_sha", "")).lower()',
            '        if actual_blob != expected_blob:',
            '            errors.append(f"APPROVED CONTENT IMAGE BINARY MISMATCH: {asset_key} expected {expected_blob}, got {actual_blob}")',
            '        actual_sha256 = hashlib.sha256(approved_path.read_bytes()).hexdigest()',
            '        expected_sha256 = str(item.get("sha256", "")).lower()',
            '        if actual_sha256 != expected_sha256:',
            '            errors.append(f"APPROVED CONTENT IMAGE SHA-256 MISMATCH: {asset_key} expected {expected_sha256}, got {actual_sha256}")',
            '',
        ]
    )
    if text.count(call_marker) != 1:
        raise SystemExit("Public-image verifier validation call marker changed.")
    text = text.replace(call_marker, call_marker + validation_block + "\n", 1)
    path.write_text(text, encoding="utf-8")


def final_checks() -> None:
    expected_counts = {
        "solutions.html": 2,
        "about.html": 1,
        "robotics-automation.html": 2,
    }
    for page_name, expected in expected_counts.items():
        text = (ROOT / page_name).read_text(encoding="utf-8")
        if text.count(NEW_KEYED) != expected:
            raise SystemExit(f"{page_name}: final approved JPEG reference mismatch")


def main() -> int:
    data = validate_source()
    target = ROOT / NEW_PLAIN
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    if git_blob_sha(target.read_bytes()) != EXPECTED_BLOB_SHA:
        raise SystemExit("Exact approved JPEG bytes were not preserved.")

    repair_pages()
    repair_architecture_verifier()
    repair_placement_manifest()
    repair_asset_manifest()
    repair_placement_verifier()
    repair_image_verifier()
    final_checks()
    print("Canonical manufacturing image repair prepared.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
