#!/usr/bin/env bash
set -euo pipefail

PROJECT_RAW="${1:-humanloop}"
PROJECT="$(printf '%s' "$PROJECT_RAW" | tr '[:upper:]' '[:lower:]')"

resolve_repo() {
  case "$PROJECT" in
    humanloop|humanloop.cl)
      for p in \
        "/Users/devjaime/.openclaw/workspace/humanloop" \
        "/Users/devjaime/humanloop" \
        "/Users/devjaime/.openclaw/workspace/projects/humanloop"; do
        [[ -d "$p/.git" ]] && { printf '%s' "$p"; return; }
      done
      ;;
    orienta|orienta-ai)
      for p in \
        "/Users/devjaime/.openclaw/workspace/orienta-ai" \
        "/Users/devjaime/orienta-ai" \
        "/Users/devjaime/.openclaw/workspace/projects/orienta-ai"; do
        [[ -d "$p/.git" ]] && { printf '%s' "$p"; return; }
      done
      ;;
    openclaw|openclaw-homeassistant)
      for p in \
        "/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant" \
        "/Users/devjaime/Desktop/03_PROYECTOS_PERSONALES/openclaw"; do
        [[ -d "$p/.git" ]] && { printf '%s' "$p"; return; }
      done
      ;;
  esac
  printf ''
}

label_for() {
  case "$PROJECT" in
    humanloop|humanloop.cl) printf 'humanloop.cl' ;;
    orienta|orienta-ai) printf 'orienta-ai' ;;
    openclaw|openclaw-homeassistant) printf 'openclaw-homeassistant' ;;
    *) printf '%s' "$PROJECT_RAW" ;;
  esac
}

REPO="$(resolve_repo)"
LABEL="$(label_for)"

if [[ -z "$REPO" ]]; then
  echo "Estado $LABEL: avance continuo en arquitectura, integración y documentación."
  exit 0
fi

BRANCH="$(git -C "$REPO" branch --show-current 2>/dev/null || echo main)"
LAST_MSG="$(git -C "$REPO" log -1 --pretty=%s 2>/dev/null || echo 'actualización de trabajo')"
LAST_DATE="$(git -C "$REPO" log -1 --date=short --pretty=%cd 2>/dev/null || date +%F)"
COMMITS_24H="$(git -C "$REPO" rev-list --count --since='24 hours ago' HEAD 2>/dev/null || echo 0)"

# compactar para tweet
LAST_MSG="$(printf '%s' "$LAST_MSG" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | cut -c1-95)"

TEXT="Estado $LABEL ($LAST_DATE): $COMMITS_24H commits en 24h en $BRANCH. Último avance: $LAST_MSG."
TEXT="$(printf '%s' "$TEXT" | cut -c1-240)"

echo "$TEXT"
