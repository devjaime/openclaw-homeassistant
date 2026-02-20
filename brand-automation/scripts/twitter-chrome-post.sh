#!/usr/bin/env bash
set -euo pipefail

BASE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation"
DRAFTS_DIR="$BASE/drafts"
DRY_RUN=1
DRAFT_NUM=""
TEXT=""

usage() {
  cat <<USAGE
Uso:
  twitter-chrome-post.sh --draft <n> [--yes]
  twitter-chrome-post.sh --text "mensaje" [--yes]

Notas:
  --yes    Publica realmente. Sin --yes solo muestra preview.
USAGE
}

latest_draft_file() {
  local f
  f="$(ls -1t "$DRAFTS_DIR"/twitter-*.md 2>/dev/null | head -n1 || true)"
  printf '%s' "$f"
}

extract_draft_text() {
  local file="$1"
  local idx="$2"
  awk -v i="$idx" '
    match($0,/^- *Draft *([0-9]+): *(.*)$/,m) {
      if (m[1] == i) {
        print m[2]
        found=1
        exit
      }
    }
    END { if (!found) exit 2 }
  ' "$file"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --draft)
      DRAFT_NUM="${2:-}"
      shift 2
      ;;
    --text)
      TEXT="${2:-}"
      shift 2
      ;;
    --yes)
      DRY_RUN=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Argumento no soportado: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$TEXT" ]]; then
  if [[ -z "$DRAFT_NUM" ]]; then
    echo "Debes indicar --draft <n> o --text \"...\"." >&2
    usage
    exit 1
  fi

  if ! [[ "$DRAFT_NUM" =~ ^[0-9]+$ ]]; then
    echo "--draft debe ser numérico." >&2
    exit 1
  fi

  LATEST="$(latest_draft_file)"
  if [[ -z "$LATEST" || ! -f "$LATEST" ]]; then
    echo "No hay archivos de drafts en $DRAFTS_DIR." >&2
    exit 1
  fi

  TEXT="$(extract_draft_text "$LATEST" "$DRAFT_NUM")" || {
    echo "No se encontró Draft $DRAFT_NUM en $LATEST." >&2
    exit 1
  }
fi

if [[ -z "$TEXT" ]]; then
  echo "Mensaje vacío." >&2
  exit 1
fi

LEN=$(printf '%s' "$TEXT" | wc -m | tr -d ' ')
if [[ "$LEN" -gt 280 ]]; then
  echo "El mensaje excede 280 caracteres ($LEN)." >&2
  exit 1
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY_RUN tweet_text=$TEXT"
  exit 0
fi

TEXT_JSON="$(printf '%s' "$TEXT" | jq -Rs .)"

osascript - "$TEXT_JSON" <<'OSA'
on run argv
set textJson to item 1 of argv

tell application "Google Chrome"
  activate
  if (count of windows) = 0 then make new window
  set URL of active tab of front window to "https://x.com/compose/post"
end tell

delay 3

repeat 20 times
  tell application "Google Chrome"
    set readyState to execute active tab of front window javascript "(function(){var t=document.querySelector('div[data-testid=\\\"tweetTextarea_0\\\"][role=\\\"textbox\\\"]'); return t ? 'ready' : 'wait';})()"
  end tell
  if readyState is "ready" then exit repeat
  delay 0.5
end repeat

tell application "Google Chrome"
  execute active tab of front window javascript "(function(){var t=document.querySelector('div[data-testid=\\\"tweetTextarea_0\\\"][role=\\\"textbox\\\"]'); if(!t){return 'no_textarea'}; var v=" & textJson & "; t.focus(); t.innerText=v; t.dispatchEvent(new InputEvent('input',{bubbles:true})); return 'ok';})()"
end tell

delay 1.2

tell application "Google Chrome"
  set clickState to execute active tab of front window javascript "(function(){var b=document.querySelector('button[data-testid=\\\"tweetButtonInline\\\"],button[data-testid=\\\"tweetButton\\\"]'); if(!b){return 'no_button'}; b.click(); return 'posted';})()"
end tell

return clickState
end run
OSA

printf 'POSTED ok len=%s\n' "$LEN"
