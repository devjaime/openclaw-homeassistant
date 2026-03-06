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

DEFAULT_ENTITY="camera.yoosee_patio_sub"
MEDIA_DIR="${HOME}/.openclaw/workspace/projects/homeassistant/media"
HA_WWW_CLIPS_DIR="${HOME}/.openclaw/workspace/projects/openclaw-homeassistant/homeassistant-infra/config/www/clips"
HA_CONFIG_DIR="${HOME}/.openclaw/workspace/projects/openclaw-homeassistant/homeassistant-infra/config"
DEFAULT_PROMPT="Describe la imagen en espanol (escena, objetos, personas, riesgos visibles y accion recomendada en maximo 6 lineas)."
cmd="${1:-help}"
shift || true

api_get() {
  local path="$1"
  curl -sS \
    -H "Authorization: Bearer ${HA_TOKEN}" \
    -H "Content-Type: application/json" \
    "${HA_URL}${path}"
}

api_post() {
  local path="$1"
  local data="$2"
  curl -sS -X POST \
    -H "Authorization: Bearer ${HA_TOKEN}" \
    -H "Content-Type: application/json" \
    "${HA_URL}${path}" \
    -d "$data"
}

resolve_entity() {
  local entity="${1:-$DEFAULT_ENTITY}"
  case "$entity" in
    sub|patio|yoosee|yoosee_sub) printf "camera.yoosee_patio_sub\n" ;;
    main|yoosee_main) printf "camera.yoosee_patio_main\n" ;;
    camera.*) printf "%s\n" "$entity" ;;
    *) printf "%s\n" "$DEFAULT_ENTITY" ;;
  esac
}

default_target() {
  local from_env="${TELEGRAM_CHAT_ID:-}"
  if [[ -n "$from_env" ]]; then
    printf "%s\n" "$from_env"
    return
  fi
  local sessions_file="${HOME}/.openclaw/agents/main/sessions/sessions.json"
  if [[ -f "$sessions_file" ]]; then
    local maybe
    maybe="$(jq -r '.["agent:main:main"].lastTo // empty' "$sessions_file" 2>/dev/null | sed -E 's/^telegram://')"
    if [[ -n "$maybe" ]]; then
      printf "%s\n" "$maybe"
      return
    fi
  fi
  printf "1540433103\n"
}

is_jpeg() {
  local file_path="$1"
  file "$file_path" 2>/dev/null | rg -qi 'JPEG image data'
}

latest_valid_snapshot() {
  local found
  found="$(ls -t "$MEDIA_DIR"/*.jpg 2>/dev/null | while read -r f; do if is_jpeg "$f"; then echo "$f"; break; fi; done)"
  if [[ -n "$found" ]]; then
    printf "%s\n" "$found"
    return 0
  fi
  return 1
}

rtsp_from_entity() {
  local entity="$1"
  local key=""
  case "$entity" in
    camera.yoosee_patio_main) key="cam_yoosee_rtsp_main" ;;
    *) key="cam_yoosee_rtsp_sub" ;;
  esac
  local secrets_yaml="${HA_CONFIG_DIR}/secrets.yaml"
  if [[ ! -f "$secrets_yaml" ]]; then
    return 1
  fi
  local line
  line="$(rg "^${key}:[[:space:]]*" "$secrets_yaml" -S | head -n1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  local value
  value="$(printf '%s' "$line" | sed -E "s/^${key}:[[:space:]]*//; s/[[:space:]]+$//; s/^['\"]//; s/['\"]$//")"
  if [[ -z "$value" ]]; then
    return 1
  fi
  printf '%s\n' "$value"
}

snapshot_via_rtsp_ffmpeg() {
  local entity="$1"
  local out="$2"
  local rtsp
  rtsp="$(rtsp_from_entity "$entity" || true)"
  if [[ -z "$rtsp" ]]; then
    return 1
  fi
  timeout 20 ffmpeg -y -hide_banner -loglevel error \
    -rtsp_transport udp \
    -i "$rtsp" \
    -frames:v 1 \
    "$out" >/dev/null 2>&1 || true
  is_jpeg "$out"
}

clip_via_rtsp_ffmpeg() {
  local entity="$1"
  local duration="$2"
  local out="$3"
  local rtsp
  rtsp="$(rtsp_from_entity "$entity" || true)"
  if [[ -z "$rtsp" ]]; then
    return 1
  fi
  timeout $((duration + 20)) ffmpeg -y -hide_banner -loglevel error \
    -rtsp_transport udp \
    -fflags +genpts \
    -analyzeduration 10M \
    -probesize 10M \
    -i "$rtsp" \
    -t "$duration" \
    -an \
    -c:v libx264 \
    -preset veryfast \
    -crf 28 \
    -pix_fmt yuv420p \
    "$out" >/dev/null 2>&1 || true
  [[ -s "$out" ]]
}

snapshot_to_file() {
  local entity="$1"
  local out="$2"
  mkdir -p "$MEDIA_DIR"
  curl -sS -m 20 -o "$out" \
    -H "Authorization: Bearer ${HA_TOKEN}" \
    "${HA_URL}/api/camera_proxy/${entity}"

  if ! is_jpeg "$out"; then
    if snapshot_via_rtsp_ffmpeg "$entity" "$out"; then
      return 0
    fi
    local body
    body="$(cat "$out" 2>/dev/null || true)"
    echo "Snapshot invalido para ${entity}. Respuesta HA: ${body:-sin contenido}" >&2
    return 2
  fi
}

gemini_analyze_file() {
  local file_path="$1"
  local prompt_text="${2:-$DEFAULT_PROMPT}"
  local model="${GEMINI_MODEL:-gemini-2.5-flash-lite}"

  if [[ -z "${GEMINI_API_KEY:-}" ]]; then
    echo "Missing GEMINI_API_KEY in ~/.openclaw/secrets.env" >&2
    return 1
  fi

  local b64
  b64="$(base64 < "$file_path" | tr -d '\n')"

  curl -sS -X POST \
    -H "Content-Type: application/json" \
    "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}" \
    -d "{\"contents\":[{\"parts\":[{\"text\":\"${prompt_text}\"},{\"inline_data\":{\"mime_type\":\"image/jpeg\",\"data\":\"${b64}\"}}]}]}" \
    | jq -r 'if .error then "ERROR: " + (.error.message // "Gemini error") else ([.candidates[0].content.parts[]?.text] | map(select(length>0)) | join("\\n")) end'
}

case "$cmd" in
  list)
    api_get "/api/states" | jq -r '.[] | select(.entity_id|startswith("camera.")) | [.entity_id,.state,(.attributes.friendly_name//"")] | @tsv'
    ;;
  state)
    entity="$(resolve_entity "${1:-$DEFAULT_ENTITY}")"
    api_get "/api/states/${entity}"
    ;;
  probe)
    entity="$(resolve_entity "${1:-$DEFAULT_ENTITY}")"
    code="$(curl -m 8 -sS -o /dev/null -w '%{http_code}' \
      -H "Authorization: Bearer ${HA_TOKEN}" \
      "${HA_URL}/api/camera_proxy_stream/${entity}" 2>/dev/null || true)"
    printf "%s\tstream_http:%s\n" "${entity}" "${code}"
    ;;
  snapshot)
    entity="$(resolve_entity "${1:-$DEFAULT_ENTITY}")"
    ts="$(date +%Y%m%d-%H%M%S)"
    out="${2:-${MEDIA_DIR}/${entity//./_}-${ts}.jpg}"
    if snapshot_to_file "$entity" "$out"; then
      echo "$out"
    else
      if fallback="$(latest_valid_snapshot)"; then
        echo "WARN: usando snapshot previo valido: $fallback" >&2
        echo "$fallback"
      else
        exit 2
      fi
    fi
    ;;
  send)
    entity="$(resolve_entity "${1:-$DEFAULT_ENTITY}")"
    target="${2:-$(default_target)}"
    ts="$(date +%Y%m%d-%H%M%S)"
    out="${MEDIA_DIR}/${entity//./_}-${ts}.jpg"
    if ! snapshot_to_file "$entity" "$out"; then
      openclaw message send --channel telegram --target "$target" --message "No pude obtener snapshot real de ${entity}. Revisa camara/red o Home Assistant snapshot." >/dev/null
      exit 2
    fi
    openclaw message send --channel telegram --target "$target" --media "$out" --message "Snapshot ${entity} (${ts})" >/dev/null
    echo "$out"
    ;;
  analyze)
    entity="$(resolve_entity "${1:-$DEFAULT_ENTITY}")"
    prompt_text="${2:-$DEFAULT_PROMPT}"
    ts="$(date +%Y%m%d-%H%M%S)"
    out="${MEDIA_DIR}/${entity//./_}-${ts}.jpg"
    if ! snapshot_to_file "$entity" "$out"; then
      echo "ERROR: snapshot no disponible para ${entity}" >&2
      exit 2
    fi
    gemini_analyze_file "$out" "$prompt_text"
    ;;
  send-analyze)
    entity="$(resolve_entity "${1:-$DEFAULT_ENTITY}")"
    target="${2:-$(default_target)}"
    prompt_text="${3:-$DEFAULT_PROMPT}"
    ts="$(date +%Y%m%d-%H%M%S)"
    out="${MEDIA_DIR}/${entity//./_}-${ts}.jpg"
    if ! snapshot_to_file "$entity" "$out"; then
      openclaw message send --channel telegram --target "$target" --message "No pude sacar snapshot real de ${entity}. En este momento Home Assistant devuelve error de imagen." >/dev/null
      exit 2
    fi
    openclaw message send --channel telegram --target "$target" --media "$out" --message "Snapshot ${entity} (${ts})" >/dev/null
    analysis="$(gemini_analyze_file "$out" "$prompt_text")"
    openclaw message send --channel telegram --target "$target" --message "Analisis de camara (${entity}):\n${analysis}" >/dev/null
    echo "$out"
    ;;
  clip)
    entity="$(resolve_entity "${1:-$DEFAULT_ENTITY}")"
    duration="${2:-8}"
    if ! [[ "$duration" =~ ^[0-9]+$ ]]; then
      echo "Duracion invalida: $duration (usa segundos enteros)" >&2
      exit 2
    fi
    mkdir -p "$HA_WWW_CLIPS_DIR"
    ts="$(date +%Y%m%d-%H%M%S)"
    clip_name="${entity//./_}-${ts}-${duration}s.mp4"
    clip_host_path="${HA_WWW_CLIPS_DIR}/${clip_name}"
    clip_ha_path="/config/www/clips/${clip_name}"
    payload="$(jq -cn --arg e "$entity" --arg f "$clip_ha_path" --argjson d "$duration" '{entity_id:$e,filename:$f,duration:$d,lookback:0}')"
    api_post "/api/services/camera/record" "$payload" >/dev/null
    # camera.record is async; wait up to ~25s for file to appear.
    for _ in {1..25}; do
      if [[ -s "$clip_host_path" ]]; then
        echo "$clip_host_path"
        exit 0
      fi
      sleep 1
    done
    if clip_via_rtsp_ffmpeg "$entity" "$duration" "$clip_host_path"; then
      echo "$clip_host_path"
      exit 0
    fi
    echo "No se genero clip en tiempo esperado: ${clip_host_path}" >&2
    exit 3
    ;;
  send-clip)
    entity="$(resolve_entity "${1:-$DEFAULT_ENTITY}")"
    duration="${2:-8}"
    target="${3:-$(default_target)}"
    clip_path="$("$0" clip "$entity" "$duration")"
    openclaw message send --channel telegram --target "$target" --media "$clip_path" --message "Clip ${entity} (${duration}s)" >/dev/null
    echo "$clip_path"
    ;;
  help|*)
    cat <<USAGE
Usage:
  cam.sh list
  cam.sh state [camera.entity_id]
  cam.sh probe [camera.entity_id]
  cam.sh snapshot [camera.entity_id] [output.jpg]
  cam.sh send [camera.entity_id] [telegram_chat_id]
  cam.sh analyze [camera.entity_id] [prompt]
  cam.sh send-analyze [camera.entity_id] [telegram_chat_id] [prompt]
  cam.sh clip [camera.entity_id|sub|main] [segundos]
  cam.sh send-clip [camera.entity_id|sub|main] [segundos] [telegram_chat_id]

Defaults:
  entity: ${DEFAULT_ENTITY}
  target: TELEGRAM_CHAT_ID or last Telegram session target
USAGE
    ;;
esac
