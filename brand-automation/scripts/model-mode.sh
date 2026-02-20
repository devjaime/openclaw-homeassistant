#!/usr/bin/env bash
set -euo pipefail

CONF="/Users/devjaime/.openclaw/openclaw.json"
MODE="${1:-status}"

OLLAMA_MODEL="custom-127-0-0-1-11434/qwen2.5vl:7b"
GEMINI_MODEL="google/gemini-2.5-flash-lite"
MINMAX_MODEL="minimax-portal/MiniMax-M2.5"

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
  night|ollama|local)
    set_model "$OLLAMA_MODEL"
    echo "OK mode=night model=$OLLAMA_MODEL"
    ;;
  day|gemini)
    set_model "$GEMINI_MODEL"
    echo "OK mode=day model=$GEMINI_MODEL"
    ;;
  minmax|minimax|potente|power)
    set_model "$MINMAX_MODEL"
    echo "OK mode=minmax model=$MINMAX_MODEL"
    ;;
  status)
    echo "OK mode=status model=$(current_model)"
    ;;
  *)
    echo "Usage: model-mode.sh [night|day|ollama|gemini|minmax|status]" >&2
    exit 1
    ;;
esac
