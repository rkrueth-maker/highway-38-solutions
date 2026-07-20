#!/usr/bin/env python3
"""Verify public-page image paths and minimum visible imagery.

Run from the repository root:
    python scripts/verify-public-images.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]

PUBLIC_PAGES = [
    "index.html",
    "solutions.html",
    "how-it-works.html",
    "sample-library-now.html",
    "for-contractors.html",
    "business-systems.html",
    "pricing.html",
    "specials.html",
    "about.html",
    "contact.html",
    "faq.html",
    "proof.html",
    "start-request.html",
    "sign-in.html",
    "customer-portal.html",
    "quote-builder.html",
]

IMG_RE = re.compile(r'<img\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>', re.I)
ALT_RE = re.compile(r'\balt=["\']([^"\']*)["\']', re.I)
CSS_URL_RE = re.compile(r'url\(["\']?([^"\')]+)["\']?\)', re.I)

IGNORED_PREFIXES = ("http://", "https://", "data:", "mailto:", "tel:", "#")
LOGO_PATH = "assets/highway38-logo.png"


def clean_path(raw: str) -> str:
    return urlsplit(raw).path.lstrip("./")


def local_asset_exists(raw: str, base_file: Path) -> bool:
    if raw.startswith(IGNORED_PREFIXES):
        return True
    clean = clean_path(raw)
    candidate = (base_file.parent / clean).resolve()
    try:
        candidate.relative_to(ROOT.resolve())
    except ValueError:
        return False
    return candidate.exists()


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    for page_name in PUBLIC_PAGES:
        page = ROOT / page_name
        if not page.exists():
            errors.append(f"MISSING PAGE: {page_name}")
            continue

        text = page.read_text(encoding="utf-8", errors="replace")
        matches = list(IMG_RE.finditer(text))
        content_images = 0

        for match in matches:
            src = match.group(1)
            tag = match.group(0)
            if not local_asset_exists(src, page):
                errors.append(f"BROKEN IMAGE: {page_name} -> {src}")
            alt_match = ALT_RE.search(tag)
            if alt_match is None or not alt_match.group(1).strip():
                errors.append(f"MISSING ALT: {page_name} -> {src}")
            if clean_path(src) != LOGO_PATH:
                content_images += 1

        if page_name not in {"sign-in.html", "customer-portal.html", "quote-builder.html"} and content_images < 1:
            errors.append(f"IMAGE-POOR PAGE: {page_name} has no explicit non-logo content image")

        if "assets/css/h38-site-v2.css" in text and "?v=" not in text:
            warnings.append(f"NO CSS CACHE BUSTER: {page_name}")

    css = ROOT / "assets/css/h38-site-v2.css"
    if css.exists():
        css_text = css.read_text(encoding="utf-8", errors="replace")
        for raw in CSS_URL_RE.findall(css_text):
            if raw.startswith(IGNORED_PREFIXES):
                continue
            if not local_asset_exists(raw, css):
                errors.append(f"BROKEN CSS IMAGE: assets/css/h38-site-v2.css -> {raw}")

    print("Highway 38 public image verification")
    print(f"Pages checked: {len(PUBLIC_PAGES)}")
    print(f"Errors: {len(errors)}")
    print(f"Warnings: {len(warnings)}")

    for item in errors:
        print(f"ERROR: {item}")
    for item in warnings:
        print(f"WARNING: {item}")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
