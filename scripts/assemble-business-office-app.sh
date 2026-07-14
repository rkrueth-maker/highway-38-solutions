#!/usr/bin/env bash
set -euo pipefail

DESTINATION="${1:?destination directory is required}"
PACK_SOURCE="${2:?business pack Apps Script file is required}"
REPO_ROOT="${3:-${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}}"

[[ -f "$PACK_SOURCE" ]] || { echo "HOLD — business pack not found: $PACK_SOURCE"; exit 2; }
mkdir -p "$DESTINATION"
find "$DESTINATION" -maxdepth 1 -type f \( -name 'BusinessOffice_*' -o -name 'BusinessOffice_Index.html' \) -delete
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$DESTINATION/"
rm -f "$DESTINATION/BusinessOffice_00_Pack.gs" "$DESTINATION/BusinessOffice_Pack.gs"
cp "$PACK_SOURCE" "$DESTINATION/BusinessOffice_00_Pack.gs"
cp "$REPO_ROOT/apps-script/business-office/BusinessOffice_Index.html" "$DESTINATION/"
cp "$REPO_ROOT/apps-script/business-office/appsscript.json" "$DESTINATION/"

# Neutralize legacy compatibility text in the assembled application. The source
# modules keep stable function names during migration, while every deployed copy
# receives identity, branding, boundaries, and footer text from its selected pack.
python3 - "$DESTINATION/BusinessOffice_DocumentsPDF.gs" "$DESTINATION/BusinessOffice_Index.html" <<'PY'
from pathlib import Path
import sys

doc = Path(sys.argv[1])
ui = Path(sys.argv[2])
text = doc.read_text()
replacements = {
    '/** Highway 38 Business Office — private document storage, OCR-assisted review, and branded PDF generation. */': '/** Business Office — private document storage, OCR-assisted review, and branded PDF generation. */',
    "file.setDescription('Private Highway 38 Business Office original. Document ID: ' + documentId);": "file.setDescription('Private ' + boBusinessOfficeTitle_() + ' original. Document ID: ' + documentId);",
    "const title = body.appendParagraph(source.businessName || 'Highway 38 Solutions');": "const title = body.appendParagraph(source.businessName || boBusinessName_());",
    "body.appendParagraph('Generated: ' + boNow_() + ' CT');": "body.appendParagraph('Generated: ' + boNow_() + ' ' + boTimeZone_());",
    "body.appendParagraph(documentType === 'Tax Preparation Packet' ? H38_BO.TAX_BOUNDARY : H38_BO.ACCOUNTING_BOUNDARY).setItalic(true);": "body.appendParagraph(documentType === 'Tax Preparation Packet' ? boTaxBoundary_() : boAccountingBoundary_()).setItalic(true);",
    "footer.appendParagraph('Highway 38 Business Office · Private preparation document').setAlignment(DocumentApp.HorizontalAlignment.CENTER);": "footer.appendParagraph(boDocumentFooterLabel_()).setAlignment(DocumentApp.HorizontalAlignment.CENTER);",
    "businessName: business['Public Name'] || business['Legal Name'] || 'Highway 38 Solutions',": "businessName: business['Public Name'] || business['Legal Name'] || boBusinessName_(),"
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'Expected document/PDF compatibility marker not found: {old}')
    text = text.replace(old, new, 1)
doc.write_text(text)

html = ui.read_text()
html = html.replace('<h1>Highway 38 Business Office</h1>', '<h1>Business Office</h1>', 1)
html = html.replace(':root { --navy:#173a5e; --blue:#326a9e;', ':root { --navy:#243447; --blue:#52677d;', 1)
html = html.replace('Highway 38 Business Office', 'Business Office')
ui.write_text(html)
PY

[[ -f "$DESTINATION/BusinessOffice_00_Pack.gs" ]] || { echo "HOLD — generated business pack is missing"; exit 3; }
PACK_DECLARATIONS="$(grep -R -l 'var BO_EMBEDDED_BUSINESS_PACK\|const BO_EMBEDDED_BUSINESS_PACK' "$DESTINATION"/BusinessOffice_*.gs | wc -l | tr -d ' ')"
[[ "$PACK_DECLARATIONS" = "1" ]] || { echo "HOLD — assembled source must declare exactly one embedded business pack, found $PACK_DECLARATIONS"; exit 3; }
grep -F 'BO_EMBEDDED_BUSINESS_PACK' "$DESTINATION/BusinessOffice_00_Pack.gs" >/dev/null

if grep -F "packId:'template-business'" "$DESTINATION/BusinessOffice_00_Pack.gs" >/dev/null; then
  ! grep -R -E 'Highway 38 Solutions|rkrueth|AKfyc|1kDDKW|1Vq8Uj|11ak4Q|1Jn2vW5|1rjl_m8u' \
    "$DESTINATION"/BusinessOffice_*.gs "$DESTINATION/BusinessOffice_Index.html"
fi

printf 'Assembled Business Office with pack %s in %s\n' "$PACK_SOURCE" "$DESTINATION"
