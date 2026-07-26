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
check_file_contains index.html 'href="sample-library-now.html"' 'Homepage project examples route'
check_file_contains solutions.html 'Five connected capabilities' 'What We Do five-capability structure'
check_file_contains solutions.html 'Automation & Robotics' 'Automation capability'
check_file_contains solutions.html 'CNC Machining & Process Planning' 'CNC capability'
check_file_contains solutions.html 'AI-Assisted Quote Builder' 'Quote Builder capability'
check_file_contains sample-library-now.html 'Complete project demonstrations' 'Project Examples headline'
check_file_contains sample-library-now.html 'Open-ended example library' 'Open-ended Project Examples architecture'
check_file_contains sample-library-now.html 'universal-quote-builder.html' 'Universal Quote Builder example route'
check_file_contains sample-library-now.html 'Representative demonstrations.' 'Project Examples disclosure'
check_file_contains sample-library-now.html 'data-samples="all"' 'Public examples compatibility marker'
check_file_contains universal-quote-builder.html 'One project inside Office.' 'Office-first Universal Quote Builder promise'
check_file_contains universal-quote-builder.html 'Office-generated public demonstration' 'Office-generated result source'
check_file_contains universal-quote-builder.html '14</strong>complete phase quotes' 'Fourteen complete phase quotes'
check_file_contains universal-quote-builder.html '10</strong>attached CAD sheets' 'Ten attached CAD sheets'
check_file_contains universal-quote-builder.html '?publicUqbDemo=1' 'Sanitized Business Office result route'
check_file_contains quote-builder.html 'universal-quote-builder.html' 'Quote Builder universal demonstration route'
check_file_contains start-request.html 'What result do you need?' 'Request outcome prompt'
check_file_contains start-request.html 'data-request-step="1"' 'Three-step request start'
check_file_contains start-request.html 'data-request-step="3"' 'Three-step request review'
check_file_contains portal.html 'Opening Highway 38 Business Office' 'Unified Owner gateway'
check_file_contains assets/js/h38-site-v2.js "['Contact','contact.html']" 'Canonical contact route'
check_file_contains assets/js/h38-site-v2.js "['Owner Access','portal.html']" 'Canonical Owner route'

if grep -Fq 'Whole-House Renovation and Property Improvement' universal-quote-builder.html; then
  echo 'FAIL — stale renovation scope remains on Universal Quote Builder demonstration.' >&2
  exit 1
fi
if grep -Fq '$342,815' universal-quote-builder.html; then
  echo 'FAIL — stale renovation total remains on Universal Quote Builder demonstration.' >&2
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
echo 'Current Office-generated project-first public source verification passed.'
