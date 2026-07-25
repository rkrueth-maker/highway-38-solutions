#!/usr/bin/env python3
"""Apply final visual coordination fixes after rebuilding the ground-up house CAD set."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAD = ROOT / "assets" / "quote-builder" / "whole-house-cad"


def replace_exact(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"Missing {label} source marker in {path.name}")
    path.write_text(text.replace(old, new), encoding="utf-8")


hvac = CAD / "M-101.svg"
replace_exact(
    hvac,
    '<rect x="1105" y="671.0" width="60" height="60" rx="0" class="filllight"/>',
    '<rect x="1075" y="671.0" width="30" height="60" rx="0" class="filllight"/>',
    "HVAC exterior condenser box",
)
replace_exact(
    hvac,
    '<text x="1135" y="705.0" class="tiny" text-anchor="middle">CU-1</text>',
    '<text x="1090" y="705.0" class="tiny" text-anchor="middle">CU-1</text>',
    "HVAC condenser label",
)
replace_exact(
    hvac,
    '<path d="M1000.0 600.0 H1105 V701.0" class="hidden"/>',
    '<path d="M1000.0 600.0 H1075 V701.0" class="hidden"/>',
    "HVAC condenser connection",
)

plumbing = CAD / "P-101.svg"
replace_exact(
    plumbing,
    '<circle cx="1070" cy="711.0" r="7" class="fixture"/>',
    '<circle cx="1070" cy="740.0" r="7" class="fixture"/>',
    "plumbing service-entry symbol",
)
replace_exact(
    plumbing,
    '<text x="1060" y="699.0" class="tiny" text-anchor="end">WATER / SANITARY SERVICE ENTRY</text>',
    '<text x="1060" y="728.0" class="tiny" text-anchor="end">WATER / SANITARY SERVICE ENTRY</text>',
    "plumbing service-entry label",
)
replace_exact(
    plumbing,
    '<path d="M1070 711.0 H930.0 V615.0" class="cold"/>',
    '<path d="M1070 740.0 H930.0 V615.0" class="cold"/>',
    "plumbing service-entry connection",
)

print("Applied Revision F CAD visual polish: condenser and service-entry clearances.")
