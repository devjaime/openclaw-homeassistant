#!/usr/bin/env bash
set -euo pipefail

# Auto-load local secrets when present.
SECRETS_FILE="${HOME}/.openclaw/secrets.env"
if [[ -f "$SECRETS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
fi

HA_URL="${HA_URL:-http://127.0.0.1:8123}"
if [[ -z "${HA_TOKEN:-}" ]]; then
  echo "Missing HA_TOKEN (set it in ~/.openclaw/secrets.env or export HA_TOKEN)" >&2
  exit 1
fi

cmd="${1:-}"
shift || true

api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  if [[ -n "$data" ]]; then
    curl -sS -X "$method" \
      -H "Authorization: Bearer ${HA_TOKEN}" \
      -H "Content-Type: application/json" \
      "${HA_URL}${path}" \
      -d "$data"
  else
    curl -sS -X "$method" \
      -H "Authorization: Bearer ${HA_TOKEN}" \
      -H "Content-Type: application/json" \
      "${HA_URL}${path}"
  fi
}

case "$cmd" in
  ping)
    api GET "/api/"
    ;;
  entities)
    api GET "/api/states"
    ;;
  state)
    entity_id="${1:?Usage: state <entity_id>}"
    api GET "/api/states/${entity_id}"
    ;;
  service)
    domain="${1:?Usage: service <domain> <service> [json_payload>}"
    service="${2:?Usage: service <domain> <service> [json_payload>}"
    payload="${3:-{}}"
    api POST "/api/services/${domain}/${service}" "$payload"
    ;;
  *)
    cat <<USAGE
Usage:
  ha.sh ping
  ha.sh entities
  ha.sh state light.living_room
  ha.sh service light turn_on '{"entity_id":"light.living_room"}'

Env:
  HA_URL   (default: http://127.0.0.1:8123)
  HA_TOKEN (required)
USAGE
    exit 1
    ;;
esac
