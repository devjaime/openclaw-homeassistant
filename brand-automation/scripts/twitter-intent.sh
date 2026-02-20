#!/usr/bin/env bash
set -euo pipefail

BASE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation/scripts"
MSG="${1:-}"
LC_MSG="$(printf '%s' "$MSG" | tr '[:upper:]' '[:lower:]')"

# Seguridad: solo publica real si el texto incluye "confirmar" o "publica ahora"
if [[ "$LC_MSG" =~ ^(publica|tweet|x)[[:space:]]+(draft|borrador)[[:space:]]+([0-9]+)(.*)$ ]]; then
  N="${BASH_REMATCH[3]}"
  if [[ "$LC_MSG" == *"confirmar"* || "$LC_MSG" == *"publica ahora"* ]]; then
    "$BASE/twitter-chrome-post.sh" --draft "$N" --yes
    echo "ROUTED twitter-post draft=$N mode=publish"
  else
    "$BASE/twitter-chrome-post.sh" --draft "$N"
    echo "ROUTED twitter-post draft=$N mode=preview"
  fi
  exit 0
fi

if [[ "$LC_MSG" =~ ^(publica|tweet|x)[[:space:]]+texto:[[:space:]]+(.+)$ ]]; then
  TXT="${BASH_REMATCH[2]}"
  if [[ "$LC_MSG" == *"confirmar"* || "$LC_MSG" == *"publica ahora"* ]]; then
    "$BASE/twitter-chrome-post.sh" --text "$TXT" --yes
    echo "ROUTED twitter-post mode=publish"
  else
    "$BASE/twitter-chrome-post.sh" --text "$TXT"
    echo "ROUTED twitter-post mode=preview"
  fi
  exit 0
fi

echo "NOOP no-twitter-intent"
