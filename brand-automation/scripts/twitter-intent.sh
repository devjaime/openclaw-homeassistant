#!/usr/bin/env bash
set -euo pipefail

BASE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation/scripts"
MSG="${1:-}"
LC_MSG="$(printf '%s' "$MSG" | tr '[:upper:]' '[:lower:]')"
BROWSER="chrome"

if [[ "$LC_MSG" == *"safari"* ]]; then
  BROWSER="safari"
elif [[ "$LC_MSG" == *"brave"* ]]; then
  BROWSER="brave"
elif [[ "$LC_MSG" == *"default"* ]]; then
  BROWSER="default"
fi

run_and_route() {
  local out="$1"
  if printf '%s' "$out" | rg -q '^OPENED intent_url manual_post_required'; then
    echo "$out"
    echo "ROUTED twitter-post mode=manual-open browser=$BROWSER"
  elif printf '%s' "$out" | rg -q '^POSTED_CONFIRMED'; then
    echo "$out"
    echo "ROUTED twitter-post mode=publish browser=$BROWSER"
  elif printf '%s' "$out" | rg -q '^POST_CLICK_UNCONFIRMED'; then
    echo "$out"
    echo "ROUTED twitter-post mode=unconfirmed browser=$BROWSER"
  else
    echo "$out"
  fi
}

# Seguridad: solo publica real si incluye confirmar/publica ahora
if [[ "$LC_MSG" =~ ^(publica|tweet|x)[[:space:]]+(draft|borrador)[[:space:]]+([0-9]+)(.*)$ ]]; then
  N="${BASH_REMATCH[3]}"
  if [[ "$LC_MSG" == *"confirmar"* || "$LC_MSG" == *"publica ahora"* ]]; then
    OUT="$($BASE/twitter-chrome-post.sh --draft "$N" --yes --browser "$BROWSER" --publisher telegram --trigger gatillado)"
    run_and_route "$OUT"
  else
    OUT="$($BASE/twitter-chrome-post.sh --draft "$N" --publisher telegram --trigger gatillado)"
    echo "$OUT"
    echo "ROUTED twitter-post draft=$N mode=preview browser=$BROWSER"
  fi
  exit 0
fi

if [[ "$LC_MSG" =~ ^(publica|tweet|x)[[:space:]]+texto:[[:space:]]+(.+)$ ]]; then
  TXT="${BASH_REMATCH[2]}"
  if [[ "$LC_MSG" == *"confirmar"* || "$LC_MSG" == *"publica ahora"* ]]; then
    OUT="$($BASE/twitter-chrome-post.sh --text "$TXT" --yes --browser "$BROWSER" --publisher telegram --trigger gatillado)"
    run_and_route "$OUT"
  else
    OUT="$($BASE/twitter-chrome-post.sh --text "$TXT" --publisher telegram --trigger gatillado)"
    echo "$OUT"
    echo "ROUTED twitter-post mode=preview browser=$BROWSER"
  fi
  exit 0
fi

echo "NOOP no-twitter-intent"
