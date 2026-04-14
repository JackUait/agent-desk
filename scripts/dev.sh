#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CYAN=$'\033[36m'
MAGENTA=$'\033[35m'
RESET=$'\033[0m'

prefix() {
  local label="$1" color="$2"
  while IFS= read -r line; do
    printf '%s[%s]%s %s\n' "$color" "$label" "$RESET" "$line"
  done
}

cleanup() {
  trap - EXIT INT TERM
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(
  cd "$ROOT/backend"
  go run ./cmd/server 2>&1 | prefix backend "$CYAN"
) &

(
  cd "$ROOT/frontend"
  yarn dev 2>&1 | prefix frontend "$MAGENTA"
) &

wait
