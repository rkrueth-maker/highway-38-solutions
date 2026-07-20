#!/usr/bin/env python3
"""Verify Highway 38 public marketing-page images.

Run from the repository root:
    python scripts/verify-public-images.py

Portal and application routes are intentionally covered by their existing
protected workflows instead of this public-marketing image gate.
"""

from __future__ import annotations

import re
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
FALLBACK_LOGO_PATH = "assets/command-center/cc-42.webp"
MIN_IMAGE_BYTES = 128


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


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    checked_assets: set[Path] = set()
    fallback_logo = ROOT / FALLBACK_LOGO_PATH
    fallback_js = (ROOT / "assets/js/h38-site-v2.js").read_text(encoding="utf-8", errors="replace")
    fallback_ready = image_file_is_valid(fallback_logo) and FALLBACK_LOGO_PATH in fallback_js

    for page_name in PUBLIC_PAGES:
        page = ROOT / page_name
        if not page.exists():
            errors.append(f"MISSING PAGE: {page_name}")
            continue

        text = page.read_text(encoding="utf-8", errors="replace")
        content_images = 0

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
                    if current_repo_path == LOGO_PATH and fallback_ready:
                        warnings.append(f"CORRUPT PRIMARY LOGO USING VALID FALLBACK: {LOGO_PATH} -> {FALLBACK_LOGO_PATH}")
                    else:
                        errors.append(f"INVALID IMAGE FILE: {candidate.relative_to(ROOT)}")

            alt_match = ALT_RE.search(tag)
            if alt_match is None or not alt_match.group(1).strip():
                errors.append(f"MISSING ALT: {page_name} -> {src}")
            if current_repo_path != LOGO_PATH:
                content_images += 1

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
