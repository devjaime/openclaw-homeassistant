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

extract_command() {
  local txt="$1"
  local lower
  lower="$(printf '%s' "$txt" | tr '[:upper:]' '[:lower:]')"

  # Explicit command wrappers from Telegram
  if [[ "$txt" =~ ^alexa[[:space:]]+(comando|control)[[:space:]]*:[[:space:]]*(.+)$ ]]; then
    printf '%s' "${BASH_REMATCH[2]}"
    return 0
  fi

  # Direct HVAC intents (must mention "aire")
  if [[ "$lower" =~ aire ]]; then
    if [[ "$lower" =~ (enciende|encender|prende|prender|apaga|apagar|sube|subir|baja|bajar|ajusta|ajustar|pon|poner)[[:space:]].* ]] || [[ "$lower" =~ [0-9]{2}[[:space:]]*grados ]]; then
      printf '%s' "$txt"
      return 0
    fi
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

cmd_text=""
if cmd_text="$(extract_command "$input")"; then
  cmd_text="$(printf '%s' "$cmd_text" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  if [[ -z "$cmd_text" ]]; then
    echo "NOOP empty-command"
    exit 0
  fi
  "$ALEXA_SH" command "$cmd_text"
  echo "ROUTED alexa-command"
  exit 0
fi

echo "NOOP no-alexa-intent"
