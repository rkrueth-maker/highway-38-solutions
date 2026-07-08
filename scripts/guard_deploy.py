#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def run(*args: str) -> str:
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        cmd = " ".join(args)
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"command failed: {cmd}")
    return result.stdout.strip()


def fetch_text(url: str) -> str:
    request = Request(url, headers={"Cache-Control": "no-cache", "Pragma": "no-cache"})
    with urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def verdict(status: str, scope: str, details: list[str], exit_code: int) -> int:
    for line in details:
        print(line)
    print(f"VERDICT: {status} | Scope Verified: {scope}")
    return exit_code


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Guard deploys by checking repo state and live markers before publishing."
    )
    parser.add_argument(
        "--page",
        required=True,
        help="Repo-relative page to compare against the live page, e.g. sample-library-now.html",
    )
    parser.add_argument("--live-url", required=True, help="Live URL for the page being checked")
    parser.add_argument(
        "--match",
        action="append",
        default=[],
        help="Marker string that must appear in the candidate page and helps detect already-live deploys",
    )
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="Allow dirty working trees and local divergence checks (useful for explicit diagnostics)",
    )
    parser.add_argument("--skip-fetch", action="store_true", help="Skip git fetch origin")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    details: list[str] = []

    try:
        if not args.skip_fetch:
            run("git", "fetch", "origin")

        head = run("git", "rev-parse", "--short", "HEAD")
        origin_main = run("git", "rev-parse", "--short", "origin/main")
        merge_base = run("git", "merge-base", "HEAD", "origin/main")
        origin_main_full = run("git", "rev-parse", "origin/main")
        status = run("git", "status", "--short", "--branch")

        details.append(f"LOCAL HEAD: {head}")
        details.append(f"ORIGIN_MAIN: {origin_main}")
        details.append(f"LOCAL status: {status or 'clean'}")

        page_path = ROOT / args.page
        if not page_path.exists():
            return verdict("BLOCKED", "LOCAL", details + [f"Missing local page: {args.page}"], 1)

        if not args.allow_dirty and any(line and not line.startswith("##") for line in status.splitlines()):
            return verdict(
                "BLOCKED",
                "LOCAL",
                details + ["Working tree is dirty. Deploy from a clean worktree or clean branch only."],
                1,
            )

        if not args.allow_dirty and merge_base != origin_main_full:
            return verdict(
                "BLOCKED",
                "LOCAL+ORIGIN_MAIN",
                details
                + [
                    "Current branch is not based on the latest origin/main. Rebase or use a clean worktree from origin/main before deploy."
                ],
                1,
            )

        local_text = page_path.read_text(encoding="utf-8", errors="replace")
        try:
            origin_text = run("git", "show", f"origin/main:{args.page}")
        except RuntimeError as exc:
            return verdict("UNKNOWN", "ORIGIN_MAIN", details + [str(exc)], 1)

        try:
            live_text = fetch_text(args.live_url)
        except URLError as exc:
            return verdict("UNKNOWN", "LIVE_PAGES", details + [f"Failed to fetch live URL: {exc}"], 1)

        if args.match:
            missing_local = [marker for marker in args.match if marker not in local_text]
            if missing_local:
                return verdict(
                    "BLOCKED",
                    "LOCAL",
                    details + ["Candidate page is missing expected marker(s):"] + [f"- {marker}" for marker in missing_local],
                    1,
                )

            local_has_all = all(marker in local_text for marker in args.match)
            origin_has_all = all(marker in origin_text for marker in args.match)
            live_has_all = all(marker in live_text for marker in args.match)

            details.append(f"Marker check LOCAL: {'PASS' if local_has_all else 'FAIL'}")
            details.append(f"Marker check ORIGIN_MAIN: {'PASS' if origin_has_all else 'FAIL'}")
            details.append(f"Marker check LIVE_PAGES: {'PASS' if live_has_all else 'FAIL'}")

            if origin_has_all and live_has_all:
                return verdict(
                    "ALREADY_LIVE",
                    "ORIGIN_MAIN+LIVE_PAGES",
                    details
                    + [
                        "The intended markers are already present in origin/main and the live page. Do not deploy again."
                    ],
                    2,
                )

            if local_has_all and live_has_all and not origin_has_all:
                return verdict(
                    "BLOCKED",
                    "LOCAL+LIVE_PAGES",
                    details
                    + [
                        "Live already shows the intended markers, but origin/main does not. Investigate remote state before deploying."
                    ],
                    1,
                )

        return verdict(
            "PASS",
            "LOCAL+ORIGIN_MAIN+LIVE_PAGES",
            details
            + [
                "Preflight passed. If you deploy, use a clean worktree/branch based on origin/main and rerun live verification after push."
            ],
            0,
        )
    except RuntimeError as exc:
        return verdict("UNKNOWN", "LOCAL", details + [str(exc)], 1)


if __name__ == "__main__":
    sys.exit(main())
