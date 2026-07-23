#!/usr/bin/env python3
"""Build the staged public site without changing approved content or image sources."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

REQUEST_STYLES = [
    "commercial.css",
    "commercial-public.css",
    "brand-global.css",
    "public-expansion.css",
    "ux-unified-public.css",
    "contact-options.css",
    "platform-unified.css",
]

CACHE_PATTERNS = {
    r"contractor-demo\.css\?v=[A-Za-z0-9._-]+": "contractor-demo.css?v={version}",
    r"assets/js/h38-site-v2\.js\?v=[A-Za-z0-9._-]+": "assets/js/h38-site-v2.js?v={version}",
    r"assets/js/h38-request-options\.js\?v=[A-Za-z0-9._-]+": "assets/js/h38-request-options.js?v={version}",
    r"request-flow\.js\?v=[A-Za-z0-9._-]+": "request-flow.js?v={version}",
}


def bundle_request_css(site: Path, version: str) -> None:
    request_page = site / "start-request.html"
    if not request_page.exists():
        raise RuntimeError("staged request page is missing")

    parts: list[str] = []
    for relative in REQUEST_STYLES:
        source = site / relative
        if not source.exists():
            raise RuntimeError(f"request stylesheet is missing: {relative}")
        parts.append(f"/* {relative} */\n{source.read_text(encoding='utf-8')}")

    bundle = site / "assets/css/h38-request-v2.css"
    bundle.parent.mkdir(parents=True, exist_ok=True)
    bundle.write_text("\n\n".join(parts) + "\n", encoding="utf-8")

    html = request_page.read_text(encoding="utf-8")
    first_position: int | None = None
    for relative in REQUEST_STYLES:
        pattern = re.compile(
            rf'<link\s+rel=["\']stylesheet["\']\s+href=["\']{re.escape(relative)}(?:\?v=[^"\']+)?["\']\s*/?>',
            re.I,
        )
        match = pattern.search(html)
        if not match:
            raise RuntimeError(f"request page does not load expected stylesheet: {relative}")
        if first_position is None:
            first_position = match.start()
        html = pattern.sub("", html, count=1)

    link = f'<link rel="stylesheet" href="assets/css/h38-request-v2.css?v={version}">' 
    if first_position is None:
        raise RuntimeError("request stylesheet insertion point was not found")
    html = html[:first_position] + link + html[first_position:]
    request_page.write_text(html, encoding="utf-8")


def rewrite_cache_keys(site: Path, version: str) -> None:
    for page in site.glob("*.html"):
        text = page.read_text(encoding="utf-8")
        for pattern, replacement in CACHE_PATTERNS.items():
            text = re.sub(pattern, replacement.format(version=version), text)
        page.write_text(text, encoding="utf-8")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: build-public-site.py <staged-site-directory>", file=sys.stderr)
        return 2
    site = Path(sys.argv[1]).resolve()
    version = os.environ.get("SHA", "").strip()
    if not site.is_dir():
        print(f"staged site directory is missing: {site}", file=sys.stderr)
        return 2
    if not version:
        print("SHA environment variable is required", file=sys.stderr)
        return 2

    try:
        bundle_request_css(site, version)
        rewrite_cache_keys(site, version)
    except RuntimeError as exc:
        print(f"public site build failed: {exc}", file=sys.stderr)
        return 1

    print(f"Built public site for {version}: one request CSS bundle, deterministic cache keys.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
