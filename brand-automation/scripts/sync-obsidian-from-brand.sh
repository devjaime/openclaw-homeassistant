#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant"
BASE="$REPO_ROOT/brand-automation"
VAULT="$REPO_ROOT/obsidian-vault"

mkdir -p "$VAULT/30-Daily" "$VAULT/20-Brand" "$VAULT/10-Projects"

today="$(date +%Y-%m-%d)"
ts="$(date +%Y-%m-%dT%H:%M:%S%z)"

daily="$VAULT/30-Daily/${today}.md"
brand_backlog="$VAULT/20-Brand/Content-Backlog.md"
project_log="$VAULT/10-Projects/OpenClaw-HomeAssistant.md"

latest_report="$(ls -1t "$BASE"/reports/night-*.md 2>/dev/null | head -n1 || true)"
latest_twitter="$(ls -1t "$BASE"/drafts/twitter-*.md 2>/dev/null | head -n1 || true)"
latest_youtube="$(ls -1t "$BASE"/drafts/youtube-backlog-*.md 2>/dev/null | head -n1 || true)"

if [[ ! -f "$daily" ]]; then
  cat > "$daily" <<EOD
# Daily ${today}

## Night Shift

## Brand Content

## Notes
EOD
fi

{
  echo
  echo "---"
  echo "### Sync ${ts}"
  if [[ -n "$latest_report" && -f "$latest_report" ]]; then
    echo
    echo "#### Night Report"
    cat "$latest_report"
  fi
  if [[ -n "$latest_twitter" && -f "$latest_twitter" ]]; then
    echo
    echo "#### Twitter Drafts"
    cat "$latest_twitter"
  fi
  if [[ -n "$latest_youtube" && -f "$latest_youtube" ]]; then
    echo
    echo "#### YouTube Backlog"
    cat "$latest_youtube"
  fi
} >> "$daily"

{
  echo
  echo "## Sync ${ts}"
  if [[ -n "$latest_twitter" && -f "$latest_twitter" ]]; then
    echo
    echo "### Twitter/X"
    cat "$latest_twitter"
  fi
  if [[ -n "$latest_youtube" && -f "$latest_youtube" ]]; then
    echo
    echo "### YouTube + Shorts"
    cat "$latest_youtube"
  fi
} >> "$brand_backlog"

{
  echo
  echo "## Update ${ts}"
  if [[ -n "$latest_report" && -f "$latest_report" ]]; then
    cat "$latest_report"
  else
    echo "Sin reporte nocturno nuevo."
  fi
} >> "$project_log"

echo "Synced to Obsidian vault:"
echo "- $daily"
echo "- $brand_backlog"
echo "- $project_log"
