#!/usr/bin/env bash
set -euo pipefail

CONF="/Users/devjaime/.openclaw/openclaw.json"
TOKEN="$(jq -r '.gateway.auth.token' "$CONF")"

openclaw browser start --url ws://127.0.0.1:18789 --token "$TOKEN"
openclaw browser open https://x.com --url ws://127.0.0.1:18789 --token "$TOKEN"

echo "Abierto X en el navegador de OpenClaw."
echo "Inicia sesión manualmente una sola vez (sin compartir contraseña con el bot)."
echo "Luego puedes ejecutar: ./setup-twitter-cron.sh"
