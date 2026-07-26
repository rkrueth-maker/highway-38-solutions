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

check_file_contains index.html 'Bring us the problem.' 'Homepage project-first headline'
check_file_contains index.html 'complete project plan.' 'Homepage project-first completion'
check_file_contains index.html 'See it. Scope it. Run it.' 'Homepage connected workflow'
check_file_contains index.html 'href="start-request.html"' 'Homepage primary project request route'
check_file_contains index.html 'href="solutions.html"' 'Homepage neutral capability route'
check_file_contains index.html 'href="pricing.html"' 'Homepage neutral pricing route'
if grep -Eq 'href="(quote-builder|business-systems|sample-library-now|universal-quote-builder)\.html' index.html; then
  echo 'FAIL — homepage directly promotes an individual software product.' >&2
  exit 1
fi
echo 'PASS — homepage keeps software products behind neutral discovery paths'
if grep -Fq "{href:'quote-builder.html',label:'Quote Builder'}" assets/js/h38-site-v2.js || grep -Fq "['Quote Builder','quote-builder.html']" assets/js/h38-site-v2.js || grep -Fq "{href:'business-systems.html',label:'Business Office'}" assets/js/h38-site-v2.js || grep -Fq "['Business Office','business-systems.html']" assets/js/h38-site-v2.js; then
  echo 'FAIL — shared navigation or footer directly promotes one software product.' >&2
  exit 1
fi
echo 'PASS — shared shell gives Quote Builder and Business Office equal paths'
check_file_contains solutions.html 'Five connected capabilities' 'What We Do five-capability structure'
check_file_contains solutions.html 'Automation & Robotics' 'Automation capability'
check_file_contains solutions.html 'CNC Machining & Process Planning' 'CNC capability'
check_file_contains solutions.html 'AI-Assisted Quote Builder' 'Quote Builder capability'
check_file_contains solutions.html 'Highway 38 Business Office' 'Business Office capability'
check_file_contains sample-library-now.html 'Complete project demonstrations' 'Project Examples headline'
check_file_contains sample-library-now.html 'Open-ended example library' 'Open-ended Project Examples architecture'
check_file_contains sample-library-now.html 'data-project="cabin"' 'Whole-building house example'
check_file_contains sample-library-now.html 'id="universal-quote-builder-examples"' 'Universal Quote Builder directly beneath house'
check_file_contains sample-library-now.html 'Universal Quote Builder overview' 'Universal Quote Builder overview'
check_file_contains sample-library-now.html 'Complete quote examples matched to their CAD drawings' 'Matched quote and CAD examples'
check_file_contains sample-library-now.html 'View full quote' 'Full quote action'
check_file_contains sample-library-now.html 'View full-size CAD sheets' 'Full-size CAD action'
check_file_contains sample-library-now.html 'Print / save complete package' 'Complete package action'
check_file_contains sample-library-now.html 'Public examples only:' 'Public-only record boundary'
check_file_contains sample-library-now.html 'Representative demonstrations.' 'Project Examples disclosure'
check_file_contains sample-library-now.html 'data-samples="all"' 'Public examples compatibility marker'
check_file_contains universal-quote-builder.html 'sample-library-now.html#universal-quote-builder-examples' 'Legacy Universal Quote Builder redirect'
check_file_contains quote-builder.html 'universal-quote-builder.html' 'Quote Builder compatibility route'
check_file_contains start-request.html 'What result do you need?' 'Request outcome prompt'
check_file_contains start-request.html 'data-request-step="1"' 'Three-step request start'
check_file_contains start-request.html 'data-request-step="3"' 'Three-step request review'
check_file_contains portal.html 'Opening Highway 38 Business Office' 'Unified Owner gateway'
check_file_contains assets/js/h38-site-v2.js "['Contact','contact.html']" 'Canonical contact route'
check_file_contains assets/js/h38-site-v2.js "['Owner Access','portal.html']" 'Canonical Owner route'

house_line=$(grep -n 'data-project="cabin"' sample-library-now.html | head -1 | cut -d: -f1)
examples_line=$(grep -n 'id="universal-quote-builder-examples"' sample-library-now.html | head -1 | cut -d: -f1)
if [[ ! "$house_line" =~ ^[0-9]+$ || ! "$examples_line" =~ ^[0-9]+$ || "$examples_line" -lt "$house_line" ]]; then
  echo 'FAIL — Universal Quote Builder examples are not positioned directly beneath the house example.' >&2
  exit 1
fi
echo 'PASS — Universal Quote Builder examples follow the house example'

if grep -Fq 'class="universal-card"' sample-library-now.html || grep -Fq 'See What It Produced' sample-library-now.html; then
  echo 'FAIL — separate Universal Quote Builder result-board showcase remains above the house example.' >&2
  exit 1
fi
echo 'PASS — separate Universal Quote Builder showcase removed'

if grep -Fq 'What Office creates' sample-library-now.html || grep -Fq 'What Quote Builder produced' sample-library-now.html; then
  echo 'FAIL — tangent result-board language remains on the embedded Universal Quote Builder demonstration.' >&2
  exit 1
fi
if grep -Fq 'Whole-House Renovation and Property Improvement' sample-library-now.html; then
  echo 'FAIL — stale renovation scope remains on the embedded Universal Quote Builder demonstration.' >&2
  exit 1
fi
if grep -Fq '$342,815' sample-library-now.html; then
  echo 'FAIL — stale renovation total remains on the embedded Universal Quote Builder demonstration.' >&2
  exit 1
fi
if grep -Fq 'script.google.com' sample-library-now.html || grep -Fq '<iframe' sample-library-now.html; then
  echo 'FAIL — embedded public UQB examples depend on an authenticated or framed service.' >&2
  exit 1
fi
if grep -Eqi 'Eight complete|Explore the Eight|current eight-project' sample-library-now.html examples.html; then
  echo 'FAIL — fixed eight-example language remains in current public source.' >&2
  exit 1
fi
echo 'PASS — project-example library is open-ended'

claim_matches=$(grep -Fl '25,000+ CNC programs' ./*.html || true)
if [[ -n "$claim_matches" ]]; then
  echo 'FAIL — prohibited 25,000+ CNC programs claim found in public HTML:' >&2
  echo "$claim_matches" >&2
  exit 1
fi
echo 'PASS — prohibited CNC claim absent from public HTML'
echo 'Current embedded public quote-and-CAD source verification passed.'
