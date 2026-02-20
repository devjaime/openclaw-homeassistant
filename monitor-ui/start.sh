#!/usr/bin/env bash
set -euo pipefail

BASE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/monitor-ui"
PORT="${MONITOR_UI_PORT:-18990}"
LOG="/tmp/openclaw-monitor-ui.log"

pkill -f "node .*monitor-ui/server.mjs" >/dev/null 2>&1 || true
nohup node "$BASE/server.mjs" > "$LOG" 2>&1 &
sleep 1

URL="http://127.0.0.1:${PORT}"
echo "Monitor iniciado en: $URL"
echo "Logs: $LOG"

if command -v open >/dev/null 2>&1; then
  open "$URL" || true
fi
