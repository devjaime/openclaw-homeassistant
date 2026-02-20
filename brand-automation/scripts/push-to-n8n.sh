#!/usr/bin/env bash
set -euo pipefail

BASE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation"

# Configura en ~/.openclaw/secrets.env o export en shell
N8N_TWITTER_WEBHOOK_URL="${N8N_TWITTER_WEBHOOK_URL:-}"
N8N_YOUTUBE_WEBHOOK_URL="${N8N_YOUTUBE_WEBHOOK_URL:-}"
N8N_REPORT_WEBHOOK_URL="${N8N_REPORT_WEBHOOK_URL:-}"

latest_file() {
  local pattern="$1"
  ls -1t $pattern 2>/dev/null | head -n1 || true
}

twitter_file="$(latest_file "$BASE/drafts/twitter-*.md")"
youtube_file="$(latest_file "$BASE/drafts/youtube-backlog-*.md")"
report_file="$(latest_file "$BASE/reports/night-*.md")"

send_payload() {
  local url="$1"
  local kind="$2"
  local file="$3"

  if [[ -z "$url" || -z "$file" || ! -f "$file" ]]; then
    return 0
  fi

  local content
  content="$(cat "$file")"

  jq -nc \
    --arg kind "$kind" \
    --arg file "$file" \
    --arg content "$content" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{kind:$kind,file:$file,timestamp:$ts,content:$content}' \
  | curl -sS -X POST "$url" -H 'Content-Type: application/json' --data-binary @- >/dev/null

  echo "sent $kind -> $url"
}

send_payload "$N8N_TWITTER_WEBHOOK_URL" "twitter_drafts" "$twitter_file"
send_payload "$N8N_YOUTUBE_WEBHOOK_URL" "youtube_backlog" "$youtube_file"
send_payload "$N8N_REPORT_WEBHOOK_URL" "night_report" "$report_file"
