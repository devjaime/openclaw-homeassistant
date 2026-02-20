#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE_SH="$SCRIPT_DIR/model-mode.sh"
TEXT="${1:-}"
TXT="$(echo "$TEXT" | tr '[:upper:]' '[:lower:]')"

if [[ -z "$TXT" ]]; then
  echo "NOOP no-model-intent"
  exit 0
fi

if [[ "$TXT" =~ ^(modo|usar|cambiar[[:space:]]+a)[[:space:]]+gemini$ ]] || [[ "$TXT" =~ ^gemini$ ]]; then
  "$MODE_SH" day >/dev/null
  echo "ROUTED model-day"
  exit 0
fi

if [[ "$TXT" =~ ^(modo|usar|cambiar[[:space:]]+a)[[:space:]]+(ollama|local|noche)$ ]] || [[ "$TXT" =~ ^(ollama|local)$ ]]; then
  "$MODE_SH" night >/dev/null
  echo "ROUTED model-night"
  exit 0
fi

if [[ "$TXT" =~ ^(estado[[:space:]]+modelo|modelo[[:space:]]+actual)$ ]]; then
  out="$($MODE_SH status)"
  echo "ROUTED model-status $out"
  exit 0
fi

echo "NOOP no-model-intent"
