#!/usr/bin/env bash
set -euo pipefail

CONF="/Users/devjaime/.openclaw/openclaw.json"
MODE="${1:-status}"

NIGHT_MODEL="custom-127-0-0-1-11434/minimax-m2.5:cloud"
DAY_MODEL="openrouter/minimax/minimax-m2.7"
DAY_OLLAMA_MODEL="custom-127-0-0-1-11434/minimax-m2.7:cloud"

if [[ ! -f "$CONF" ]]; then
  echo "No existe $CONF" >&2
  exit 1
fi

current_model() {
  jq -r '.agents.defaults.model.primary // ""' "$CONF"
}

set_model() {
  local model="$1"
  local tmp
  tmp="$(mktemp)"
  jq --arg m "$model" '.agents.defaults.model.primary = $m' "$CONF" > "$tmp"
  mv "$tmp" "$CONF"
}

case "$MODE" in
  night|ollama|local|minimax25|m25)
    set_model "$NIGHT_MODEL"
    echo "OK mode=night model=$NIGHT_MODEL"
    ;;
  day|cloud|gemini|minimax27|m27)
    set_model "$DAY_MODEL"
    echo "OK mode=day model=$DAY_MODEL"
    ;;
  minmax|minimax|potente|power)
    set_model "$DAY_MODEL"
    echo "OK mode=minmax model=$DAY_MODEL"
    ;;
  day-ollama|ollama27|m27-ollama)
    set_model "$DAY_OLLAMA_MODEL"
    echo "OK mode=day-ollama model=$DAY_OLLAMA_MODEL"
    ;;
  status)
    echo "OK mode=status model=$(current_model)"
    ;;
  *)
    echo "Usage: model-mode.sh [night|local|day|cloud|minimax27|m27|day-ollama|minmax|status]" >&2
    exit 1
    ;;
esac
