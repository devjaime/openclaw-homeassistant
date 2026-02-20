#!/usr/bin/env bash
set -euo pipefail

CONF="/Users/devjaime/.openclaw/openclaw.json"
PROMPT_FILE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/twitter/nightly_prompt.md"
JOB_NAME="twitter-nightly"
TZ="America/Santiago"
CRON_EXPR="20 3 * * *"

if [[ ! -f "$CONF" ]]; then
  echo "No existe $CONF"
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "No existe $PROMPT_FILE"
  exit 1
fi

TOKEN="$(jq -r '.gateway.auth.token' "$CONF")"
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "No se encontró gateway.auth.token en $CONF"
  exit 1
fi

PROMPT="$(cat "$PROMPT_FILE")"

# Elimina job previo con el mismo nombre si existe
EXISTING_ID="$(openclaw cron list --url ws://127.0.0.1:18789 --token "$TOKEN" --json | jq -r --arg N "$JOB_NAME" '.jobs[]? | select(.name==$N) | .id' | head -n1)"
if [[ -n "${EXISTING_ID:-}" ]]; then
  openclaw cron rm "$EXISTING_ID" --url ws://127.0.0.1:18789 --token "$TOKEN" >/dev/null
fi

openclaw cron add \
  --url ws://127.0.0.1:18789 \
  --token "$TOKEN" \
  --name "$JOB_NAME" \
  --description "Publica updates nocturnos en X de forma ordenada" \
  --cron "$CRON_EXPR" \
  --tz "$TZ" \
  --agent main \
  --message "$PROMPT" \
  --thinking low \
  --announce \
  --channel telegram \
  --to 1540433103 \
  --best-effort-deliver \
  --json | jq .

echo
echo "Job creado: $JOB_NAME"
echo "Horario: $CRON_EXPR ($TZ)"
openclaw cron list --url ws://127.0.0.1:18789 --token "$TOKEN" --json | jq '.jobs[] | {id,name,enabled,schedule:(.schedule // .cron // null)}'
