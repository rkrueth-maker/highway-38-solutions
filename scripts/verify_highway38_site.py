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

STALE_PUBLIC_TEXT = [
    "Shop / CNC Concept",
    "Digital Setup",
    "Custom Work Build",
    "AI Workflow",
]

STALE_PUBLIC_LINKS = [
    "sample-workbooks.html#project-packet",
    "sample-workbooks.html#shop-flow",
    "sample-workbooks.html#business-cleanup",
    "sample-workbooks.html#cleanup-rescue",
    "sample-workbooks.html#ai-workflow",
    "sample-workbooks.html#custom-work",
    "sample-workbooks.html#digital-setup",
    "sample-workbooks.html#shop-cnc",
]

LOCKED_PRODUCTS = [
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

    for stale_text in STALE_PUBLIC_TEXT:
        if stale_text in text:
            issues.append(f"{rel}:{line_no(text,stale_text)} stale removed catalog text: {stale_text}")

    for stale_link in STALE_PUBLIC_LINKS:
        if stale_link in text:
            issues.append(f"{rel}:{line_no(text,stale_link)} stale sample-workbook anchor: {stale_link}")

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

examples_path = ROOT / "examples.html"
if examples_path.exists():
    examples_text = examples_path.read_text(errors="ignore")
    for product in LOCKED_PRODUCTS:
        if product not in examples_text:
            issues.append(f"examples.html: missing locked catalog product: {product}")
else:
    issues.append("examples.html: missing file")

if issues:
    print("VERIFY FAILED")
    print("=" * 60)
    for item in issues:
        print(item)
    sys.exit(1)

print("VERIFY PASSED")
print(f"Checked {len(files)} public files.")
print("Live form:", GOOD_FORM)
print("Locked catalog:", ", ".join(LOCKED_PRODUCTS))
