#!/usr/bin/env bash
set -euo pipefail

check_file_contains() {
  local file="$1"
  local marker="$2"
  local label="$3"
  if ! grep -Fq "$marker" "$file"; then
    echo "FAIL — $label: $file is missing marker: $marker" >&2
    exit 1
  fi
  echo "PASS — $label"
}

check_file_contains index.html 'Big problems.' 'Homepage headline start'
check_file_contains index.html 'Clear plans.' 'Homepage headline completion'
check_file_contains index.html 'h38-outcome-grid' 'Homepage outcome routing'
check_file_contains index.html 'href="start-request.html">Start a Request' 'Homepage primary CTA'
check_file_contains products.html 'Choose the smallest service that produces a useful result.' 'Solutions and Pricing customer-first headline'
check_file_contains products.html '15 fixed-price services. 9 approved bundles. 4 scoped systems.' 'Approved catalog preservation'
check_file_contains product.html 'data-product-detail-single' 'Product detail route'
check_file_contains sample-library-now.html 'See the kind of finished result before choosing a service.' 'Sample Library headline'
check_file_contains start-request.html 'What would you like to have when this is finished?' 'Request outcome prompt'
check_file_contains start-request.html 'data-request-step="1"' 'Three-step request start'
check_file_contains start-request.html 'data-request-step="3"' 'Three-step request review'
check_file_contains problem-starter.html 'The Highway 38 Problem Starter' 'Problem Starter resource'
check_file_contains sample-library-now.html 'data-owner-link="true"' 'Owner Portal location control'
check_file_contains product-detail.js 'product_detail_view' 'Product detail analytics marker'

service_pages=(
  automation-opportunity-planning.html
  digital-file-cleanup-planning.html
  fixture-jig-concept-review.html
  garage-layout-planning.html
  manufacturing-bottleneck-analysis.html
  project-planning-packets.html
  robot-tending-concept-planning.html
  shop-layout-flow-review.html
  small-business-workflow-cleanup.html
  vision-inspection-concept-planning.html
)

for page in "${service_pages[@]}"; do
  check_file_contains "$page" '<title>' "$page title"
  slug="${page%.html}"
  check_file_contains "$page" "data-service=\"$slug\"" "$page service binding"
done

claim_matches=$(grep -Fl '25,000+ CNC programs' ./*.html || true)
if [[ -n "$claim_matches" ]]; then
  echo 'FAIL — prohibited 25,000+ CNC programs claim found in public HTML:' >&2
  echo "$claim_matches" >&2
  exit 1
fi
echo 'PASS — prohibited CNC claim absent from public HTML'

echo 'Issue #83 source verification passed.'
