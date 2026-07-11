#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
out="h38-os-library-core-v1-export.zip"
cat h38-os-library-core-v1-export.zip.b64.part* | tr -d '\n\r' | base64 -d > "$out"
echo "acaf97d9f2aeaf3a78e435c88cb7cd700d5255322cf365e8d89c842399db705c  $out" | sha256sum -c -
test "$(wc -c < "$out" | tr -d ' ')" = "45581"
unzip -t "$out"
unzip -l "$out"
