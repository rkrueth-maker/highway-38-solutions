#!/usr/bin/env python3
"""Verify public website images and the controlled Highway 38 logo."""

from __future__ import annotations

import hashlib
import json
import re
import struct
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "scripts/config/approved-public-assets.json"
PUBLIC_PAGES = [
    "index.html", "solutions.html", "how-it-works.html", "sample-library-now.html",
    "for-contractors.html", "business-systems.html", "pricing.html", "specials.html",
    "about.html", "contact.html", "faq.html", "proof.html",
]
IMG_RE = re.compile(r'<img\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>', re.I)
ALT_RE = re.compile(r'\balt=["\']([^"\']*)["\']', re.I)
CSS_URL_RE = re.compile(r'url\(["\']?([^"\')]+)["\']?\)', re.I)
LOGO_REF_RE = re.compile(r'assets/highway38-logo\.png(?:\?v=[^"\'\s<>]+)?', re.I)
IGNORED_PREFIXES = ("http://", "https://", "data:", "mailto:", "tel:", "#")
MIN_IMAGE_BYTES = 128
MIN_LOGO_BYTES = 1_000_000
MIN_LOGO_DIMENSION = 1000


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        raise RuntimeError(f"missing approved asset manifest: {MANIFEST_PATH.relative_to(ROOT)}")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    required_top_level = {
        "approved_logo",
        "approved_public_image_directory",
        "shared_public_css",
        "shared_public_js",
        "business_office_config",
        "production_branch",
        "production_url",
        "forbidden_logo_substitutes",
    }
    missing = sorted(required_top_level - set(manifest))
    if missing:
        raise RuntimeError(f"approved asset manifest missing keys: {', '.join(missing)}")
    required_logo = {
        "path",
        "git_blob_sha",
        "cache_key",
        "public_reference",
        "alt_text",
        "visible_text_fallback",
        "allow_image_substitute",
    }
    missing_logo = sorted(required_logo - set(manifest["approved_logo"]))
    if missing_logo:
        raise RuntimeError(f"approved logo manifest missing keys: {', '.join(missing_logo)}")
    return manifest


def raw_path(raw: str) -> str:
    return urlsplit(raw).path


def resolve_local_asset(raw: str, base_file: Path) -> Path | None:
    if raw.startswith(IGNORED_PREFIXES):
        return None
    path_text = raw_path(raw)
    candidate = ((ROOT / path_text.lstrip("/")) if path_text.startswith("/") else (base_file.parent / path_text)).resolve()
    try:
        candidate.relative_to(ROOT.resolve())
    except ValueError:
        return None
    return candidate


def repo_path(raw: str, base_file: Path) -> str | None:
    candidate = resolve_local_asset(raw, base_file)
    return None if candidate is None else candidate.relative_to(ROOT.resolve()).as_posix()


def image_file_is_valid(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < MIN_IMAGE_BYTES:
        return False
    head = path.read_bytes()[:16]
    suffix = path.suffix.lower()
    if suffix == ".png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if suffix in {".jpg", ".jpeg"}:
        return head.startswith(b"\xff\xd8\xff")
    if suffix == ".webp":
        return head.startswith(b"RIFF") and head[8:12] == b"WEBP"
    if suffix == ".gif":
        return head.startswith((b"GIF87a", b"GIF89a"))
    if suffix == ".svg":
        return b"<svg" in path.read_bytes()[:512].lower()
    return True


def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def validate_approved_logo(
    logo_file: Path,
    logo_path: str,
    expected_blob_sha: str,
    errors: list[str],
) -> str:
    if not image_file_is_valid(logo_file):
        errors.append(f"INVALID APPROVED LOGO: {logo_path}")
        return "MISSING_OR_INVALID"
    data = logo_file.read_bytes()
    if len(data) < MIN_LOGO_BYTES:
        errors.append(f"APPROVED LOGO TOO SMALL: {len(data)} bytes")
    width, height = struct.unpack(">II", data[16:24])
    if width < MIN_LOGO_DIMENSION or height < MIN_LOGO_DIMENSION:
        errors.append(f"APPROVED LOGO DIMENSIONS TOO SMALL: {width}x{height}")
    actual_blob_sha = git_blob_sha(logo_file)
    if actual_blob_sha != expected_blob_sha:
        errors.append(
            f"APPROVED LOGO BINARY MISMATCH: expected Git blob {expected_blob_sha}, got {actual_blob_sha}"
        )
    return actual_blob_sha


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    checked_assets: set[Path] = set()

    try:
        manifest = load_manifest()
    except (OSError, ValueError, RuntimeError) as exc:
        print("Highway 38 public image verification")
        print(f"ERROR: {exc}")
        return 1

    approved_logo = manifest["approved_logo"]
    logo_path = approved_logo["path"]
    logo_file = ROOT / logo_path
    expected_blob_sha = approved_logo["git_blob_sha"].lower()
    expected_logo_reference = approved_logo["public_reference"]
    expected_logo_alt = approved_logo["alt_text"]
    forbidden_substitutes = tuple(manifest.get("forbidden_logo_substitutes", []))
    shared_js_path = ROOT / manifest["shared_public_js"]
    shared_css_path = ROOT / manifest["shared_public_css"]
    business_office_config_path = ROOT / manifest["business_office_config"]

    actual_logo_blob = validate_approved_logo(
        logo_file,
        logo_path,
        expected_blob_sha,
        errors,
    )
    if bool(approved_logo["allow_image_substitute"]):
        errors.append("APPROVED LOGO POLICY ERROR: image substitution must remain disabled")

    expected_absolute_logo_url = (
        manifest["production_url"].rstrip("/") + "/" + expected_logo_reference
    )
    if not business_office_config_path.exists():
        errors.append(
            f"MISSING BUSINESS OFFICE CONFIG: {business_office_config_path.relative_to(ROOT)}"
        )
    else:
        try:
            business_office_config = json.loads(
                business_office_config_path.read_text(encoding="utf-8")
            )
            branding = business_office_config.get("branding", {})
            if branding.get("logoPath") != logo_path:
                errors.append(
                    f"BUSINESS OFFICE LOGO PATH MISMATCH: {branding.get('logoPath')!r}; expected {logo_path!r}"
                )
            if branding.get("logoUrl") != expected_absolute_logo_url:
                errors.append(
                    f"BUSINESS OFFICE LOGO URL MISMATCH: {branding.get('logoUrl')!r}; "
                    f"expected {expected_absolute_logo_url!r}"
                )
        except (OSError, ValueError) as exc:
            errors.append(f"INVALID BUSINESS OFFICE CONFIG: {exc}")

    scanned_text: dict[str, str] = {}

    if not shared_js_path.exists():
        errors.append(f"MISSING SHARED PUBLIC JS: {shared_js_path.relative_to(ROOT)}")
    else:
        scanned_text[manifest["shared_public_js"]] = shared_js_path.read_text(
            encoding="utf-8", errors="replace"
        )

    for page_name in PUBLIC_PAGES:
        page = ROOT / page_name
        if not page.exists():
            errors.append(f"MISSING PAGE: {page_name}")
            continue

        text = page.read_text(encoding="utf-8", errors="replace")
        scanned_text[page_name] = text
        content_images = 0
        logo_seen = False

        for logo_ref in LOGO_REF_RE.findall(text):
            if logo_ref != expected_logo_reference:
                errors.append(
                    f"STALE OR UNCONTROLLED LOGO REFERENCE: {page_name} -> {logo_ref}; "
                    f"expected {expected_logo_reference}"
                )

        for match in IMG_RE.finditer(text):
            src = match.group(1)
            tag = match.group(0)
            candidate = resolve_local_asset(src, page)
            current_repo_path = repo_path(src, page)

            if candidate is None or not candidate.exists():
                errors.append(f"BROKEN IMAGE: {page_name} -> {src}")
            elif candidate not in checked_assets:
                checked_assets.add(candidate)
                if not image_file_is_valid(candidate):
                    errors.append(f"INVALID IMAGE FILE: {candidate.relative_to(ROOT)}")

            alt_match = ALT_RE.search(tag)
            if alt_match is None or not alt_match.group(1).strip():
                errors.append(f"MISSING ALT: {page_name} -> {src}")

            if current_repo_path == logo_path:
                logo_seen = True
                if src != expected_logo_reference:
                    errors.append(
                        f"UNCONTROLLED LOGO SRC: {page_name} -> {src}; expected {expected_logo_reference}"
                    )
                if alt_match is not None and alt_match.group(1).strip() != expected_logo_alt:
                    errors.append(
                        f"UNCONTROLLED LOGO ALT: {page_name} -> {alt_match.group(1).strip()!r}; "
                        f"expected {expected_logo_alt!r}"
                    )
            else:
                content_images += 1

        if not logo_seen:
            errors.append(f"MISSING APPROVED LOGO: {page_name}")
        if content_images < 1:
            errors.append(f"IMAGE-POOR PAGE: {page_name} has no explicit non-logo content image")
        if "assets/css/h38-site-v2.css" in text and "?v=" not in text:
            warnings.append(f"NO CSS CACHE BUSTER: {page_name}")

    for target_name, text in scanned_text.items():
        for forbidden in forbidden_substitutes:
            if forbidden in text:
                errors.append(f"FORBIDDEN LOGO SUBSTITUTE: {target_name} -> {forbidden}")

    if shared_css_path.exists():
        css_text = shared_css_path.read_text(encoding="utf-8", errors="replace")
        for forbidden in forbidden_substitutes:
            if forbidden in css_text:
                errors.append(
                    f"FORBIDDEN LOGO SUBSTITUTE: {shared_css_path.relative_to(ROOT)} -> {forbidden}"
                )
        for raw in CSS_URL_RE.findall(css_text):
            if raw.startswith(IGNORED_PREFIXES):
                continue
            candidate = resolve_local_asset(raw, shared_css_path)
            if candidate is None or not candidate.exists():
                errors.append(f"BROKEN CSS IMAGE: {shared_css_path.relative_to(ROOT)} -> {raw}")
            elif candidate not in checked_assets:
                checked_assets.add(candidate)
                if not image_file_is_valid(candidate):
                    errors.append(f"INVALID CSS IMAGE FILE: {candidate.relative_to(ROOT)}")
    else:
        errors.append(f"MISSING SHARED PUBLIC CSS: {shared_css_path.relative_to(ROOT)}")

    print("Highway 38 public image verification")
    print(f"Manifest: {MANIFEST_PATH.relative_to(ROOT)}")
    print(f"Approved logo Git blob: {actual_logo_blob}")
    print(f"Marketing pages checked: {len(PUBLIC_PAGES)}")
    print(f"Image files checked: {len(checked_assets)}")
    print(f"Errors: {len(errors)}")
    print(f"Warnings: {len(warnings)}")
    for item in errors:
        print(f"ERROR: {item}")
    for item in warnings:
        print(f"WARNING: {item}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
