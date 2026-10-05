#!/bin/bash
# H38 Training Video Recorder - Automated runner
# Records the full office lifecycle at 4 viewport profiles:
#   - Phone portrait (390x844)
#   - Tablet portrait (768x1024)  
#   - Tablet landscape (1024x768)
#   - Desktop (1440x900)
#
# One-time setup: save auth state via:
#   H38_WORKFLOW_RECORDING_AUTHORIZED=true \
#   H38_WORKFLOW_TEST_EMAIL="test@example.com" \
#   H38_WORKFLOW_TEST_PASSWORD="..." \
#   H38_WORKFLOW_AUTH_STATE_OUT="$HOME/.h38-training-auth.json" \
#   node scripts/record-full-office-lifecycle-training.js
#
# Then set H38_TRAINING_AUTH_STATE to the saved file for automated runs.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUTH_STATE="${H38_TRAINING_AUTH_STATE:-$HOME/.h38-training-auth.json}"
OUTPUT_DIR="${H38_FULL_TRAINING_DIR:-$SCRIPT_DIR/../artifacts/full-lifecycle-training}"

if [ ! -f "$AUTH_STATE" ]; then
  echo "ERROR: Auth state not found at $AUTH_STATE"
  echo "Run one-time setup first (see script header)."
  exit 1
fi

export H38_WORKFLOW_RECORDING_AUTHORIZED=true
export H38_WORKFLOW_STORAGE_STATE="$AUTH_STATE"
export H38_FULL_TRAINING_DIR="$OUTPUT_DIR"

echo "Recording training videos to $OUTPUT_DIR..."
node "$SCRIPT_DIR/record-full-office-lifecycle-training.js"

echo ""
echo "Done. Videos in $OUTPUT_DIR/mp4/"
ls -lh "$OUTPUT_DIR/mp4/" 2>/dev/null || echo "(no mp4 output yet)"
