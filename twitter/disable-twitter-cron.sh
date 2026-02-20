#!/usr/bin/env bash
set -euo pipefail

CONF="/Users/devjaime/.openclaw/openclaw.json"
TOKEN="$(jq -r '.gateway.auth.token' "$CONF")"
JOB_NAME="twitter-nightly"

JOB_ID="$(openclaw cron list --url ws://127.0.0.1:18789 --token "$TOKEN" --json | jq -r --arg N "$JOB_NAME" '.jobs[]? | select(.name==$N) | .id' | head -n1)"
if [[ -z "${JOB_ID:-}" ]]; then
  echo "No existe job $JOB_NAME"
  exit 0
fi

openclaw cron disable "$JOB_ID" --url ws://127.0.0.1:18789 --token "$TOKEN" --json | jq .
echo "Deshabilitado: $JOB_NAME ($JOB_ID)"
