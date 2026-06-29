#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
REQUIREMENTS_FILE="$ROOT_DIR/requirements.txt"
REQUIREMENTS_HASH_FILE="$ROOT_DIR/.venv/.forgeiq_requirements.sha256"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Missing Python virtual environment at $ROOT_DIR/.venv"
  echo "Create it and install dependencies with:"
  echo "  cd $ROOT_DIR"
  echo "  python3 -m venv .venv"
  echo "  .venv/bin/python -m pip install -r requirements.txt"
  exit 1
fi

if [[ -f "$REQUIREMENTS_FILE" ]]; then
  current_hash="$(sha256sum "$REQUIREMENTS_FILE" | awk '{print $1}')"
  cached_hash=""
  if [[ -f "$REQUIREMENTS_HASH_FILE" ]]; then
    cached_hash="$(cat "$REQUIREMENTS_HASH_FILE")"
  fi

  if [[ "$current_hash" != "$cached_hash" ]]; then
    echo "Installing Python dependencies (requirements changed)..."
    "$PYTHON_BIN" -m pip install -r "$REQUIREMENTS_FILE"
    printf "%s" "$current_hash" > "$REQUIREMENTS_HASH_FILE"
  fi
fi

exec "$PYTHON_BIN" "$ROOT_DIR/app.py"
