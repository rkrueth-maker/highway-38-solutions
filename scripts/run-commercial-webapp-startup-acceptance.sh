#!/usr/bin/env bash
set -euo pipefail

DEPLOYMENT_URL="https://script.google.com/macros/s/AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow/exec"
CREDENTIALS_PATH="${1:-$HOME/.clasprc.json}"
ARTIFACT_PATH="${2:-artifacts/commercial-google-native-beta/startup-acceptance.txt}"

mkdir -p "$(dirname "$ARTIFACT_PATH")"
node scripts/verify-commercial-webapp-startup.js "$DEPLOYMENT_URL" "$CREDENTIALS_PATH" | tee "$ARTIFACT_PATH"
