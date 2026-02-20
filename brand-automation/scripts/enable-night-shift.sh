#!/usr/bin/env bash
set -euo pipefail

BASE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation"
# shellcheck disable=SC1091
source "$BASE/scripts/_cron_lib.sh"

for name in \
  night-work-0330 \
  night-work-0500 \
  night-work-0630 \
  brand-twitter-drafts-0745 \
  brand-youtube-backlog-0810 \
  night-final-report-0825
 do
  id="$(cron_find_id_by_name "$name")"
  if [[ -n "$id" ]]; then
    openclaw cron enable "$id" --url "$GATEWAY_URL" --token "$TOKEN" >/dev/null || true
    echo "enabled $name ($id)"
  fi
 done
