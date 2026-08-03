#!/usr/bin/env bash
set -euo pipefail

DEPLOYMENT_URL="https://script.google.com/macros/s/AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow/exec"
PUBLIC_URL="https://highway38solutions.com/commercial-app/"
CREDENTIALS_PATH="${1:-$HOME/.clasprc.json}"
ARTIFACT_PATH="${2:-artifacts/commercial-google-native-beta/startup-acceptance.txt}"
PUBLIC_ARTIFACT_PATH="${3:-artifacts/commercial-google-native-beta/public-shell-acceptance.txt}"

mkdir -p "$(dirname "$ARTIFACT_PATH")"
node scripts/verify-commercial-public-shell.js "$PUBLIC_URL" | tee "$PUBLIC_ARTIFACT_PATH"
node scripts/verify-commercial-webapp-startup.js "$DEPLOYMENT_URL" "$CREDENTIALS_PATH" | tee "$ARTIFACT_PATH"
