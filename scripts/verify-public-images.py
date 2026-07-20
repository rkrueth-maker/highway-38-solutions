#!/usr/bin/env python3
"""Verify public website images and the approved Highway 38 logo."""

from __future__ import annotations

import re
import struct
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_PAGES = [
    "index.html", "solutions.html", "how-it-works.html", "sample-library-now.html",
    "for-contractors.html", "business-systems.html", "pricing.html", "specials.html",
    "about.html", "contact.html", "faq.html", "proof.html",
]
IMG_RE = re.compile(r'<img\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>', re.I)
ALT_RE = re.compile(r'\balt=["\']([^"\']*)["\']', re.I)
CSS_URL_RE = re.compile(r'url\(["\']?([^"\')]+)["\']?\)', re.I)
IGNORED_PREFIXES = ("http://", "https://", "data:", "mailto:", "tel:", "#")
LOGO_PATH = "assets/highway38-logo.png"
LOGO_CACHE_MARKER = "20260720-exact-0cbc4514"
MIN_IMAGE_BYTES = 128
MIN_LOGO_BYTES = 1_000_000
MIN_LOGO_DIMENSION = 1000


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


def validate_approved_logo(errors: list[str]) -> None:
    logo = ROOT / LOGO_PATH
    if not image_file_is_valid(logo):
        errors.append(f"INVALID APPROVED LOGO: {LOGO_PATH}")
        return
    data = logo.read_bytes()
    if len(data) < MIN_LOGO_BYTES:
        errors.append(f"APPROVED LOGO TOO SMALL: {len(data)} bytes")
        return
    width, height = struct.unpack(">II", data[16:24])
    if width < MIN_LOGO_DIMENSION or height < MIN_LOGO_DIMENSION:
        errors.append(f"APPROVED LOGO DIMENSIONS TOO SMALL: {width}x{height}")


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    checked_assets: set[Path] = set()
    validate_approved_logo(errors)

    site_js = (ROOT / "assets/js/h38-site-v2.js").read_text(encoding="utf-8", errors="replace")
    if "cc-42.webp" in site_js or "logo-fallback" in site_js:
        errors.append("OBSOLETE SUBSTITUTE LOGO FALLBACK REMAINS IN assets/js/h38-site-v2.js")

    for page_name in PUBLIC_PAGES:
        page = ROOT / page_name
        if not page.exists():
            errors.append(f"MISSING PAGE: {page_name}")
            continue
        text = page.read_text(encoding="utf-8", errors="replace")
        content_images = 0
        logo_seen = False

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
            if current_repo_path == LOGO_PATH:
                logo_seen = True
                if LOGO_CACHE_MARKER not in src:
                    errors.append(f"STALE LOGO CACHE MARKER: {page_name} -> {src}")
            else:
                content_images += 1

        if not logo_seen:
            errors.append(f"MISSING APPROVED LOGO: {page_name}")
        if content_images < 1:
            errors.append(f"IMAGE-POOR PAGE: {page_name} has no explicit non-logo content image")
        if "assets/css/h38-site-v2.css" in text and "?v=" not in text:
            warnings.append(f"NO CSS CACHE BUSTER: {page_name}")

    css = ROOT / "assets/css/h38-site-v2.css"
    if css.exists():
        css_text = css.read_text(encoding="utf-8", errors="replace")
        for raw in CSS_URL_RE.findall(css_text):
            if raw.startswith(IGNORED_PREFIXES):
                continue
            candidate = resolve_local_asset(raw, css)
            if candidate is None or not candidate.exists():
                errors.append(f"BROKEN CSS IMAGE: assets/css/h38-site-v2.css -> {raw}")
            elif candidate not in checked_assets:
                checked_assets.add(candidate)
                if not image_file_is_valid(candidate):
                    errors.append(f"INVALID CSS IMAGE FILE: {candidate.relative_to(ROOT)}")

    print("Highway 38 public image verification")
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
