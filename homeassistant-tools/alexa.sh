#!/usr/bin/env bash
set -euo pipefail

SECRETS_FILE="${HOME}/.openclaw/secrets.env"
if [[ -f "$SECRETS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
fi

HA_URL="${HA_URL:-http://127.0.0.1:8123}"
HA_TOKEN="${HA_TOKEN:-}"

if [[ -z "$HA_TOKEN" ]]; then
  echo "Missing HA_TOKEN in ~/.openclaw/secrets.env" >&2
  exit 1
fi

cmd="${1:-help}"
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

validate_service_response() {
  local response="$1"
  if [[ "$response" == 500* ]] || [[ "$response" == *"Internal Server Error"* ]]; then
    echo "Service call failed: ${response}" >&2
    return 1
  fi

  if echo "$response" | jq -e 'type=="object" and has("message")' >/dev/null 2>&1; then
    local msg
    msg="$(echo "$response" | jq -r '.message // empty')"
    if [[ -n "$msg" ]]; then
      echo "Service call failed: ${msg}" >&2
      return 1
    fi
  fi
  return 0
}

require_up() {
  curl -sS -m 4 "${HA_URL}/api/" \
    -H "Authorization: Bearer ${HA_TOKEN}" >/dev/null
}

discover_notify_services() {
  api GET "/api/services" | jq -r '.[] | select(.domain=="notify") | .services | keys[]'
}

discover_alexa_notify_services() {
  api GET "/api/services" \
    | jq -r '.[] | select(.domain=="notify") | .services | keys[]' \
    | rg -i 'alexa|echo|media' || true
}

pick_preferred_alexa_notify_service() {
  local services
  services="$(discover_alexa_notify_services || true)"
  if [[ -z "$services" ]]; then
    return 1
  fi

  # Best: explicit device-scoped services (e.g. alexa_media_echo_dot_de_jaime)
  local preferred
  preferred="$(printf '%s\n' "$services" | rg '^alexa_media_' | rg -v '^(alexa_media|alexa_media_last_called|alexa_media_this_device)$' | head -n 1 || true)"
  if [[ -n "$preferred" ]]; then
    printf '%s' "$preferred"
    return 0
  fi

  # Next: this_device / last_called (when explicit device alias isn't available)
  preferred="$(printf '%s\n' "$services" | rg '^(alexa_media_this_device|alexa_media_last_called)$' | head -n 1 || true)"
  if [[ -n "$preferred" ]]; then
    printf '%s' "$preferred"
    return 0
  fi

  # Last: generic alexa_media
  preferred="$(printf '%s\n' "$services" | rg '^alexa_media$' | head -n 1 || true)"
  if [[ -n "$preferred" ]]; then
    printf '%s' "$preferred"
    return 0
  fi

  # Any remaining match
  printf '%s\n' "$services" | head -n 1
}

discover_alexa_media_players() {
  api GET "/api/states" | jq -r '.[] | .entity_id' | rg -i '^media_player\..*(alexa|echo)|^media_player\..*$' | head -n 30 || true
}

has_alexa_media_notify() {
  api GET "/api/services" | jq -e '.[] | select(.domain=="alexa_media" and (.services.notify != null))' >/dev/null 2>&1
}

has_nabu_alexa_component() {
  api GET "/api/config" | jq -e '.components[] | select(.=="alexa")' >/dev/null 2>&1
}

diagnose_routes() {
  local notify_total
  local notify_alexa
  local media_count
  notify_total="$(discover_notify_services | wc -l | tr -d ' ')"
  notify_alexa="$(discover_alexa_notify_services | wc -l | tr -d ' ')"
  media_count="$(discover_alexa_media_players | wc -l | tr -d ' ')"

  echo
  echo "== Diagnostico =="
  echo "notify_services_total=${notify_total}"
  echo "notify_services_alexa=${notify_alexa}"
  echo "media_players_detectados=${media_count}"

  if has_alexa_media_notify; then
    echo "route_alexa_media_notify=OK"
    return 0
  fi

  if [[ "${notify_alexa}" -gt 0 ]]; then
    echo "route_notify_alexa=OK"
    return 0
  fi

  if has_nabu_alexa_component; then
    echo "Sin ruta de voz a Echo desde HA."
    echo "Tienes Alexa Smart Home (controlar dispositivos HA desde Alexa), pero no Alexa Media Player/notify para hablar por voz."
    echo "Accion: instala Alexa Media Player (HACS) y re-vincula Amazon."
  else
    echo "No se detecta integracion Alexa activa en HA."
  fi
}

send_notify_service() {
  local service_name="$1"
  local message="$2"
  local target_media_player="${3:-}"
  local payload

  if [[ -n "$target_media_player" ]]; then
    payload="$(jq -nc --arg m "$message" --arg t "$target_media_player" '{message:$m,data:{type:"tts",target:[$t]}}')"
  else
    payload="$(jq -nc --arg m "$message" '{message:$m}')"
  fi

  local response
  response="$(api POST "/api/services/notify/${service_name}" "$payload")"
  validate_service_response "$response"
}

send_alexa_media_notify() {
  local target_media_player="$1"
  local message="$2"
  local payload
  payload="$(jq -nc --arg m "$message" --arg t "$target_media_player" '{target:[$t],message:$m,data:{type:"tts"}}')"
  local response
  response="$(api POST "/api/services/alexa_media/notify" "$payload")"
  validate_service_response "$response"
}

send_media_player_custom_command() {
  local target_media_player="$1"
  local command_text="$2"
  local payload
  payload="$(jq -nc --arg eid "$target_media_player" --arg txt "$command_text" '{entity_id:$eid,media_content_type:"custom",media_content_id:$txt}')"
  local response
  response="$(api POST "/api/services/media_player/play_media" "$payload")"
  validate_service_response "$response"
}

resolve_mode_and_send() {
  local message="$1"
  local target="${2:-}"

  if [[ "$target" == notify.* ]]; then
    local service_name="${target#notify.}"
    send_notify_service "$service_name" "$message"
    echo "OK notify.${service_name}"
    return 0
  fi

  if [[ "$target" == media_player.* ]]; then
    # Prefer alexa_media/notify if present
    if has_alexa_media_notify; then
      send_alexa_media_notify "$target" "$message"
      echo "OK alexa_media.notify -> ${target}"
      return 0
    fi

    # Fallback: best notify service that looks like Alexa
    local notify_service
    notify_service="$(pick_preferred_alexa_notify_service || true)"
    if [[ -n "$notify_service" ]]; then
      send_notify_service "$notify_service" "$message" "$target"
      echo "OK notify.${notify_service} -> ${target}"
      return 0
    fi

    echo "No Alexa notify service found for target ${target}" >&2
    return 2
  fi

  if [[ -n "$target" ]]; then
    echo "Target must be notify.* or media_player.* (got: ${target})" >&2
    return 2
  fi

  # Auto mode with no explicit target
  local auto_notify
  auto_notify="$(pick_preferred_alexa_notify_service || true)"
  if [[ -n "$auto_notify" ]]; then
    send_notify_service "$auto_notify" "$message"
    echo "OK auto notify.${auto_notify}"
    return 0
  fi

  # Fallback: if alexa_media domain exists and at least one media_player, target first player
  if has_alexa_media_notify; then
    local mp
    mp="$(discover_alexa_media_players | head -n 1 || true)"
    if [[ -n "$mp" ]]; then
      send_alexa_media_notify "$mp" "$message"
      echo "OK auto alexa_media.notify -> ${mp}"
      return 0
    fi
  fi

  echo "No Alexa route found. Run: alexa.sh discover" >&2
  if has_nabu_alexa_component; then
    echo "Tip: tienes Alexa Smart Home, pero falta Alexa Media Player/notify para TTS hacia Echo." >&2
  fi
  return 2
}

resolve_command_and_send() {
  local command_text="$1"
  local target="${2:-media_player.echo_dot_de_jaime}"

  if [[ "$target" != media_player.* ]]; then
    echo "Target must be media_player.* for command mode (got: ${target})" >&2
    return 2
  fi

  send_media_player_custom_command "$target" "$command_text"
  echo "OK command ${target}: ${command_text}"
}

case "$cmd" in
  ping)
    require_up
    echo "OK HA reachable"
    ;;
  discover)
    require_up
    echo "== Notify services =="
    discover_notify_services || true
    echo
    echo "== Alexa-like notify services =="
    discover_alexa_notify_services || true
    echo
    echo "== Media players (candidates) =="
    discover_alexa_media_players || true
    diagnose_routes
    ;;
  send)
    require_up
    msg="${1:-}"
    target="${2:-}"
    if [[ -z "$msg" ]]; then
      echo "Usage: alexa.sh send \"mensaje\" [notify.xxx|media_player.xxx]" >&2
      exit 1
    fi
    resolve_mode_and_send "$msg" "$target"
    ;;
  command)
    require_up
    msg="${1:-}"
    target="${2:-}"
    if [[ -z "$msg" ]]; then
      echo "Usage: alexa.sh command \"orden\" [media_player.xxx]" >&2
      exit 1
    fi
    resolve_command_and_send "$msg" "$target"
    ;;
  test)
    require_up
    target="${1:-}"
    resolve_mode_and_send "Prueba OpenClaw Alexa OK" "$target"
    ;;
  help|*)
    cat <<USAGE
Usage:
  alexa.sh ping
  alexa.sh discover
  alexa.sh send "mensaje" [notify.xxx|media_player.xxx]
  alexa.sh command "orden" [media_player.xxx]
  alexa.sh test [notify.xxx|media_player.xxx]

Examples:
  ./alexa.sh discover
  ./alexa.sh send "Jaime esta almorzando"
  ./alexa.sh command "enciende aire dormitorio"
  ./alexa.sh send "Abre la puerta" notify.alexa_media_sala
  ./alexa.sh send "Hay movimiento en patio" media_player.echo_dot_sala
USAGE
    ;;
esac
