#!/usr/bin/env bash
set -euo pipefail

CONF="/Users/devjaime/.openclaw/openclaw.json"
PROMPT_FILE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/twitter/nightly_prompt.md"
TOKEN="$(jq -r '.gateway.auth.token' "$CONF")"
PROMPT="$(cat "$PROMPT_FILE")"

openclaw agent \
  --url ws://127.0.0.1:18789 \
  --token "$TOKEN" \
  --message "$PROMPT" \
  --thinking low \
  --channel telegram \
  --reply-channel telegram \
  --reply-to 1540433103 \
  --deliver \
  --json
