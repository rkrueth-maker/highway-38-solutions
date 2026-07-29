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

check_file_contains index.html 'Bring us the problem.' 'Homepage problem-first headline'
check_file_contains index.html 'clear working path.' 'Homepage practical outcome'
check_file_contains index.html 'Choose the kind of help you need' 'Homepage buyer choice'
check_file_contains index.html 'I need better software' 'Homepage software path'
check_file_contains index.html 'I need help solving a project' 'Homepage project-service path'
check_file_contains index.html 'href="software.html"' 'Homepage software route'
check_file_contains index.html 'href="project-services.html"' 'Homepage project services route'
check_file_contains index.html 'href="quote-builder-demo.html"' 'Homepage interactive quote route'
check_file_contains index.html 'href="implementation.html"' 'Homepage implementation route'
check_file_contains index.html 'href="security-reliability.html"' 'Homepage security route'
check_file_contains index.html 'href="start-request.html"' 'Homepage controlled request route'
check_file_contains index.html 'href="pricing.html"' 'Homepage pricing route'
if grep -Eq 'href="business-systems\.html' index.html; then
  echo 'FAIL — homepage directly sells the authenticated Business Office route.' >&2
  exit 1
fi
echo 'PASS — homepage keeps authenticated software behind the software buyer path'
check_file_contains assets/js/h38-site-v2.js "{href:'software.html',label:'Software'}" 'Canonical software path'
check_file_contains assets/js/h38-site-v2.js "{href:'project-services.html',label:'Project Services'}" 'Canonical project services path'
if grep -Fq "{href:'quote-builder.html',label:'Quote Builder'}" assets/js/h38-site-v2.js || grep -Fq "{href:'business-systems.html',label:'Business Office'}" assets/js/h38-site-v2.js; then
  echo 'FAIL — shared navigation directly favors one software product.' >&2
  exit 1
fi
echo 'PASS — shared shell keeps product selection inside the software path'
check_file_contains software.html 'Three software levels' 'Software product structure'
check_file_contains software.html 'AI prepares; people approve' 'Software control boundary'
check_file_contains project-services.html 'Planning support does not replace licensed or field verification.' 'Project-service professional boundary'
check_file_contains quote-builder-demo.html 'Nothing leaves this page' 'Interactive demo privacy boundary'
check_file_contains quote-builder-demo.html 'Not a real customer quote or authorization to proceed.' 'Interactive demo authorization boundary'
check_file_contains implementation.html 'Discover and preserve' 'Implementation preservation phase'
check_file_contains implementation.html 'Acceptance evidence' 'Implementation acceptance evidence'
check_file_contains security-reliability.html 'Controlled external actions' 'Security external-action controls'
check_file_contains security-reliability.html 'Fail-closed boundaries' 'Security fail-closed controls'
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
check_file_contains quote-builder.html 'quote-builder-demo.html' 'Quote Builder interactive demo route'
check_file_contains pricing.html 'Implementation value' 'Pricing implementation explanation'
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
echo 'Current public buyer-path, quote-demo, and quote-and-CAD source verification passed.'
