#!/usr/bin/env bash
set -euo pipefail
exec bash "${GITHUB_WORKSPACE:?}/scripts/deploy-business-office-web-harness.sh"
