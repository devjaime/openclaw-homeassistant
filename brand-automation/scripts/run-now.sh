#!/usr/bin/env bash
set -euo pipefail

CONF="/Users/devjaime/.openclaw/openclaw.json"
TOKEN="$(jq -r '.gateway.auth.token' "$CONF")"
URL="ws://127.0.0.1:18789"
BASE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation/prompts"

run_prompt() {
  local label="$1"
  local file="$2"
  echo "== $label =="
  openclaw agent \
    --url "$URL" \
    --token "$TOKEN" \
    --message "$(cat "$file")" \
    --thinking low \
    --channel telegram \
    --reply-channel telegram \
    --reply-to 1540433103 \
    --deliver >/dev/null || true
  echo "ok: $label"
}

run_prompt "work-block" "$BASE/night_work_block.md"
run_prompt "twitter-drafts" "$BASE/twitter_drafts.md"
run_prompt "youtube-backlog" "$BASE/youtube_backlog.md"

echo "Pipeline manual lanzado."
