from pathlib import Path
import re
import sys

ROOT = Path.cwd()

GOOD_FORM = "https://docs.google.com/forms/d/e/1FAIpQLScTWaK40mNNaf1ek3w4gC3VYwvpNT9fnXlHodKeOZl7lPfCyQ/viewform"

BAD_FORM_IDS = [
    "1FAIpQLSfVpB7zVAh-F59413ImSK4cECntqSNJjv58ipVZcdejp9ur-g",
    "122E4VFOClZ90HoiWjWz-7VWLHC0HH0aN4jvxPIXJq9w",
]

OLD_BRANDS = [
    "ForgeIQ",
    "Northwoods Problem Solvers",
    "RangeRivet",
    "Industrial Logic Solutions",
    "GarageOS",
    "WrenchIQ",
    "Highway 38 Solutions LLC",
]

BAD_PATHS = [
    "rkrueth-maker.github.io/ForgeIQ",
    "/ForgeIQ",
    "products.html#static-index",
]

BAD_PUBLIC_STRINGS = [
    "Shop / CNC Concept",
    "Digital Setup",
    "Custom Work Build",
    "AI Workflow",
]

BAD_PUBLIC_REGEXES = [
    r'sample-workbooks\.html#project-packet(?=["\'?#\s>]|$)',
    r'sample-workbooks\.html#shop-flow(?=["\'?#\s>]|$)',
    r'sample-workbooks\.html#business-cleanup(?=["\'?#\s>]|$)',
    r'sample-workbooks\.html#cleanup-rescue(?=["\'?#\s>]|$)',
    r'sample-workbooks\.html#ai-workflow(?=["\'?#\s>]|$)',
    r'sample-workbooks\.html#custom-work(?=["\'?#\s>]|$)',
    r'sample-workbooks\.html#digital-setup(?=["\'?#\s>]|$)',
    r'sample-workbooks\.html#shop-cnc(?=["\'?#\s>]|$)',
]

EXAMPLES_REQUIRED_STRINGS = [
    "Problem Snapshot",
    "Basic Layout Snapshot",
    "Shop Flow Review",
    "Project Packet Lite",
    "Business Cleanup Starter",
    "Cleanup Rescue Pack",
    "Workflow Opportunity Snapshot",
]

SKIP_DIRS = {".git", "node_modules", "docs", "tests", "shopify", "__pycache__"}
PUBLIC_EXTS = {".html", ".js", ".css"}

issues = []


def should_scan(path: Path) -> bool:
    if path.suffix.lower() not in PUBLIC_EXTS:
        return False
    return not any(part in SKIP_DIRS for part in path.parts)


def line_no(text: str, needle: str) -> int:
    idx = text.find(needle)
    return text[:idx].count("\n") + 1 if idx >= 0 else 0


files = [p for p in ROOT.rglob("*") if p.is_file() and should_scan(p)]

for path in files:
    text = path.read_text(errors="ignore")
    rel = path.relative_to(ROOT)

    if path.name == "examples.html":
        for required in EXAMPLES_REQUIRED_STRINGS:
            if required not in text:
                issues.append(f"{rel}:{line_no(text,required)} missing required examples text: {required}")

    for bad_text in BAD_PUBLIC_STRINGS:
        if bad_text in text:
            issues.append(f"{rel}:{line_no(text,bad_text)} stale public text: {bad_text}")

    for bad_pattern in BAD_PUBLIC_REGEXES:
        if re.search(bad_pattern, text):
            issues.append(f"{rel}:{line_no(text,bad_pattern)} stale public anchor: {bad_pattern}")

    for bad_id in BAD_FORM_IDS:
        if bad_id in text:
            issues.append(f"{rel}:{line_no(text,bad_id)} old/wrong form id: {bad_id}")

    form_links = re.findall(r"https://docs\.google\.com/forms/[^\"'<>\s]+", text)
    for link in form_links:
        if link != GOOD_FORM:
            issues.append(f"{rel}:{line_no(text,link)} Google Form link is not the LIVE public form: {link}")

    for brand in OLD_BRANDS:
        if brand in text:
            issues.append(f"{rel}:{line_no(text,brand)} old/public brand text: {brand}")

    for bad_path in BAD_PATHS:
        if bad_path in text:
            issues.append(f"{rel}:{line_no(text,bad_path)} old/broken path reference: {bad_path}")

    # Check local href/src file targets and anchors.
    for attr, raw in re.findall(r'(href|src)=["\']([^"\']+)["\']', text):
        if raw.startswith(("http://", "https://", "mailto:", "tel:", "data:", "javascript:")):
            continue
        if raw.startswith("#"):
            anchor = raw[1:]
            if anchor and not re.search(rf'id=["\']{re.escape(anchor)}["\']|name=["\']{re.escape(anchor)}["\']', text):
                issues.append(f"{rel}:{line_no(text,raw)} missing same-page anchor: #{anchor}")
            continue

        clean = raw.split("#", 1)[0].split("?", 1)[0]
        anchor = raw.split("#", 1)[1].split("?", 1)[0] if "#" in raw else ""
        if clean in ("", "./", "/"):
            continue

        target = (path.parent / clean).resolve()
        try:
            target.relative_to(ROOT.resolve())
        except ValueError:
            continue

        if not target.exists():
            issues.append(f"{rel}:{line_no(text,raw)} broken local {attr}: {raw}")
            continue

        if anchor and target.suffix.lower() == ".html":
            target_text = target.read_text(errors="ignore")
            if not re.search(rf'id=["\']{re.escape(anchor)}["\']|name=["\']{re.escape(anchor)}["\']', target_text):
                issues.append(f"{rel}:{line_no(text,raw)} target file exists but anchor missing: {raw}")

if issues:
    print("VERIFY FAILED")
    print("=" * 60)
    for item in issues:
        print(item)
    sys.exit(1)

print("VERIFY PASSED")
print(f"Checked {len(files)} public files.")
print("Live form:", GOOD_FORM)
