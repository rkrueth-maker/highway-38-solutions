#!/usr/bin/env bash
set -euo pipefail

PAGE="sample-library-now.html"
LIVE_URL="https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html"
ALLOW_DIRTY="false"
LOGO_REFERENCE="$(python3 - <<'PY'
import json
from pathlib import Path
manifest = json.loads(Path('scripts/config/approved-public-assets.json').read_text(encoding='utf-8'))
print(manifest['approved_logo']['public_reference'])
PY
)"
MATCHES=(
  "$LOGO_REFERENCE"
  "Six solution tracks. One connected workflow."
  "id=\"examples\""
)
CUSTOM_MATCHES="false"

usage() {
  cat <<'EOF'
Usage: scripts/deploy_sample_library.sh [options]

Options:
  --allow-dirty          Skip clean-tree/divergence checks in guard_deploy.py
  --page <path>          Repo-relative page path (default: sample-library-now.html)
  --live-url <url>       Live page URL to verify
  --match <marker>       Marker required in local/origin/live (repeatable)
  --help                 Show this help text

If one or more --match options are provided, default markers are replaced.
The default approved-logo marker is read from scripts/config/approved-public-assets.json.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-dirty)
      ALLOW_DIRTY="true"
      shift
      ;;
    --page)
      PAGE="${2:-}"
      shift 2
      ;;
    --live-url)
      LIVE_URL="${2:-}"
      shift 2
      ;;
    --match)
      if [[ "$CUSTOM_MATCHES" != "true" ]]; then
        MATCHES=()
        CUSTOM_MATCHES="true"
      fi
      MATCHES+=("${2:-}")
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

CMD=(python3 scripts/guard_deploy.py --page "$PAGE" --live-url "$LIVE_URL")
if [[ "$ALLOW_DIRTY" == "true" ]]; then
  CMD+=(--allow-dirty)
fi
for marker in "${MATCHES[@]}"; do
  CMD+=(--match "$marker")
done

"${CMD[@]}"
