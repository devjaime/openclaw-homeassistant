#!/bin/zsh
set -euo pipefail

set -a
source /Users/devjaime/.openclaw/secrets.env
set +a

ROOT="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/openclaw-config/multi-model-foundation"
node "$ROOT/scripts/daily-ha-summary.mjs"
