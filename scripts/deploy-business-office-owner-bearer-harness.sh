#!/usr/bin/env bash
set -euo pipefail

SOURCE="${GITHUB_WORKSPACE:?}/scripts/deploy-business-office-owner-web-harness.sh"
PATCHED="$RUNNER_TEMP/deploy-business-office-owner-web-harness-bearer.sh"

python3 - "$SOURCE" "$PATCHED" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1])
patched = Path(sys.argv[2])
text = source.read_text()

old_post = '''  curl --silent --show-error --location \\
    --header 'Content-Type: application/json' \\
    --data-binary @"$body" \\
    "${url}&access_token=${token}" > "$output"
'''
new_post = '''  curl --silent --show-error --location-trusted \\
    --header 'Content-Type: application/json' \\
    --header "Authorization: Bearer ${token}" \\
    --data-binary @"$body" \\
    "$url" > "$output"
'''

old_get = '''curl --silent --show-error --location \\
  "${APP_DEV_URL}?bo_token=${TOKEN}&phase=ui&access_token=${ACCESS_TOKEN}" > "$EVIDENCE/deployed-ui.html"
'''
new_get = '''curl --silent --show-error --location-trusted \\
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \\
  "${APP_DEV_URL}?bo_token=${TOKEN}&phase=ui" > "$EVIDENCE/deployed-ui.html"
'''

if old_post not in text:
    raise SystemExit('Expected owner-web POST block was not found; refusing an unverified patch.')
if old_get not in text:
    raise SystemExit('Expected owner-web GET block was not found; refusing an unverified patch.')

text = text.replace(old_post, new_post, 1).replace(old_get, new_get, 1)
patched.write_text(text)
PY

chmod 700 "$PATCHED"
exec bash "$PATCHED"
