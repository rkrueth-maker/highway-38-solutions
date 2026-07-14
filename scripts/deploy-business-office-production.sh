#!/usr/bin/env bash
set -euo pipefail
# Production runner: authorized Owner Portal web-runtime acceptance, followed by a separate signed-in-user Business Office deployment.
exec bash "${GITHUB_WORKSPACE:?}/scripts/deploy-business-office-owner-web-harness.sh"
