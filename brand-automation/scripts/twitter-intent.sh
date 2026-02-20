#!/usr/bin/env bash
set -euo pipefail

BASE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation/scripts"
MSG="${1:-}"
LC_MSG="$(printf '%s' "$MSG" | tr '[:upper:]' '[:lower:]')"
BROWSER="safari"
PROJECT_STATUS_SCRIPT="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation/scripts/project-status-tweet.sh"

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

run_project_cycle() {
  local project="$1"
  local confirm="$2"
  local tweet_text
  tweet_text="$($PROJECT_STATUS_SCRIPT "$project")"

  if [[ "$confirm" == "yes" ]]; then
    OUT="$($BASE/twitter-chrome-post.sh --text "$tweet_text" --yes --browser "$BROWSER" --publisher telegram --trigger gatillado)"
    run_and_route "$OUT"
  else
    OUT="$($BASE/twitter-chrome-post.sh --text "$tweet_text" --publisher telegram --trigger gatillado)"
    echo "$OUT"
    echo "ROUTED twitter-cycle project=$project mode=preview browser=$BROWSER"
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

# Ciclo de proyecto desde Telegram:
# - ciclo proyecto humanloop
# - ciclo proyecto humanloop confirmar safari
if [[ "$LC_MSG" =~ ^(ciclo|estado)[[:space:]]+(proyecto[[:space:]]+)?([a-z0-9._-]+)(.*)$ ]]; then
  PROJECT_KEY="${BASH_REMATCH[3]}"
  TAIL="${BASH_REMATCH[4]}"
  if [[ "$TAIL" == *"confirmar"* || "$TAIL" == *"publica ahora"* ]]; then
    run_project_cycle "$PROJECT_KEY" "yes"
  else
    run_project_cycle "$PROJECT_KEY" "no"
  fi
  exit 0
fi

echo "NOOP no-twitter-intent"
