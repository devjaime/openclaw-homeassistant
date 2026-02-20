#!/usr/bin/env bash
set -euo pipefail

CONF="/Users/devjaime/.openclaw/openclaw.json"
TZ_NAME="America/Santiago"
TELEGRAM_ID="1540433103"

if [[ ! -f "$CONF" ]]; then
  echo "No existe $CONF" >&2
  exit 1
fi

TOKEN="$(jq -r '.gateway.auth.token' "$CONF")"
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "No se encontró gateway.auth.token" >&2
  exit 1
fi

GATEWAY_PORT="$(jq -r '.gateway.port // 18789' "$CONF")"
GATEWAY_URL="ws://127.0.0.1:${GATEWAY_PORT}"

resolve_gateway_url() {
  local token="$1"
  local candidate
  for candidate in \
    "ws://127.0.0.1:${GATEWAY_PORT}" \
    "ws://127.0.0.1:18789" \
    "ws://127.0.0.1:18889"
  do
    if openclaw cron status --url "$candidate" --token "$token" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  echo "No fue posible conectar al gateway en 18789/18889 ni en puerto configurado (${GATEWAY_PORT})." >&2
  exit 1
}

GATEWAY_URL="$(resolve_gateway_url "$TOKEN")"

cron_list_json() {
  openclaw cron list --url "$GATEWAY_URL" --token "$TOKEN" --json
}

cron_find_id_by_name() {
  local name="$1"
  cron_list_json | jq -r --arg N "$name" '.jobs[]? | select(.name==$N) | .id' | head -n1
}

cron_rm_if_exists() {
  local name="$1"
  local id
  id="$(cron_find_id_by_name "$name")"
  if [[ -n "$id" ]]; then
    openclaw cron rm "$id" --url "$GATEWAY_URL" --token "$TOKEN" >/dev/null
  fi
}

cron_add_agent_job() {
  local name="$1"
  local cron_expr="$2"
  local description="$3"
  local prompt_file="$4"

  if [[ ! -f "$prompt_file" ]]; then
    echo "Prompt no encontrado: $prompt_file" >&2
    exit 1
  fi

  local message
  message="$(cat "$prompt_file")"

  cron_rm_if_exists "$name"

  openclaw cron add \
    --url "$GATEWAY_URL" \
    --token "$TOKEN" \
    --name "$name" \
    --description "$description" \
    --cron "$cron_expr" \
    --tz "$TZ_NAME" \
    --agent main \
    --message "$message" \
    --thinking low \
    --announce \
    --channel telegram \
    --to "$TELEGRAM_ID" \
    --best-effort-deliver \
    --json >/dev/null
}
