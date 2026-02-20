#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALEXA_SH="${SCRIPT_DIR}/alexa.sh"

if [[ ! -x "$ALEXA_SH" ]]; then
  echo "ERROR: alexa.sh not found at ${ALEXA_SH}" >&2
  exit 2
fi

input="${*:-}"
if [[ -z "$input" ]]; then
  echo "NOOP empty-input"
  exit 0
fi

normalized="$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]')"

extract_message() {
  local txt="$1"
  # Supported patterns:
  # - "avisa por alexa: mensaje"
  # - "di por alexa: mensaje"
  # - "alexa: mensaje"
  # - "avisa alexa mensaje"
  if [[ "$txt" =~ ^(avisa|di|habla)[[:space:]]+(por[[:space:]]+)?alexa[[:space:]]*:[[:space:]]*(.+)$ ]]; then
    printf '%s' "${BASH_REMATCH[3]}"
    return 0
  fi
  if [[ "$txt" =~ ^alexa[[:space:]]*:[[:space:]]*(.+)$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$txt" =~ ^(avisa|di|habla)[[:space:]]+alexa[[:space:]]+(.+)$ ]]; then
    printf '%s' "${BASH_REMATCH[2]}"
    return 0
  fi
  return 1
}

msg=""
if msg="$(extract_message "$input")"; then
  msg="$(printf '%s' "$msg" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  if [[ -z "$msg" ]]; then
    echo "NOOP empty-message"
    exit 0
  fi
  "$ALEXA_SH" send "$msg"
  echo "ROUTED alexa-send"
  exit 0
fi

echo "NOOP no-alexa-intent"
