#!/bin/zsh
set -euo pipefail

ROOT="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/openclaw-config/multi-model-foundation"

cat <<CMD
Ejemplo para crear cron diario (07:30):

openclaw cron add \
  --name "ha-daily-summary" \
  --schedule "30 7 * * *" \
  --command "cd $ROOT && ./scripts/run-daily-summary.sh"
CMD
