#!/usr/bin/env bash
set -euo pipefail

BASE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation"
DRAFTS_DIR="$BASE/drafts"
DRY_RUN=1
DRAFT_NUM=""
TEXT=""
BROWSER="chrome"
PUBLISHER="openclaw"
TRIGGER_MODE="manual"

usage() {
  cat <<USAGE
Uso:
  twitter-chrome-post.sh --draft <n> [--yes] [--browser chrome|safari|brave|default] [--publisher <origen>] [--trigger <modo>]
  twitter-chrome-post.sh --text "mensaje" [--yes] [--browser chrome|safari|brave|default] [--publisher <origen>] [--trigger <modo>]

Notas:
  --yes    Publica realmente (intento automático solo en Chrome).
           Si falla, abre tweet prellenado para publicación manual.
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
      if (m[1] == i) { print m[2]; found=1; exit }
    }
    END { if (!found) exit 2 }
  ' "$file"
}

urlencode() {
  jq -rn --arg v "$1" '$v|@uri'
}

open_intent() {
  local msg="$1"
  local enc url
  enc="$(urlencode "$msg")"
  url="https://x.com/intent/tweet?text=${enc}"

  case "$BROWSER" in
    chrome)
      open -a "Google Chrome" "$url"
      ;;
    safari)
      open -a "Safari" "$url"
      ;;
    brave)
      open -a "Brave Browser" "$url"
      ;;
    default)
      open "$url"
      ;;
    *)
      echo "Browser no soportado: $BROWSER" >&2
      exit 1
      ;;
  esac

  echo "OPENED intent_url manual_post_required browser=$BROWSER"
}

prefix_text() {
  printf '[pub:%s|trigger:%s] ' "$PUBLISHER" "$TRIGGER_MODE"
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
    --browser)
      BROWSER="${2:-}"
      shift 2
      ;;
    --publisher)
      PUBLISHER="${2:-}"
      shift 2
      ;;
    --trigger)
      TRIGGER_MODE="${2:-}"
      shift 2
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

PREFIX="$(prefix_text)"
FINAL_TEXT="${PREFIX}${TEXT}"

LEN=$(printf '%s' "$FINAL_TEXT" | wc -m | tr -d ' ')
if [[ "$LEN" -gt 280 ]]; then
  echo "El mensaje con prefijo excede 280 caracteres ($LEN)." >&2
  exit 1
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY_RUN tweet_text=$FINAL_TEXT"
  exit 0
fi

TEXT_JSON="$(printf '%s' "$FINAL_TEXT" | jq -Rs .)"
set +e

if [[ "$BROWSER" == "chrome" ]]; then
OSA_OUT="$(osascript - "$TEXT_JSON" <<'OSA' 2>&1
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

if clickState is not "posted" then
  return "click_failed:" & clickState
end if

set postState to "pending"
repeat 20 times
  delay 0.5
  tell application "Google Chrome"
    set postState to execute active tab of front window javascript "(function(){var hasComposer=!!document.querySelector('div[data-testid=\\\"tweetTextarea_0\\\"][role=\\\"textbox\\\"]'); var inCompose=location.href.indexOf('/compose/post')!==-1; var toast=!!document.querySelector('[data-testid=\\\"toast\\\"]'); if((!hasComposer)&&(!inCompose)) return 'confirmed'; if(toast) return 'toast'; return 'pending';})()"
  end tell
  if postState is "confirmed" then exit repeat
end repeat

return "post_state:" & postState
end run
OSA
)"
elif [[ "$BROWSER" == "safari" ]]; then
OSA_OUT="$(osascript - "$TEXT_JSON" <<'OSA' 2>&1
on run argv
set textJson to item 1 of argv

tell application "Safari"
  activate
  if (count of windows) = 0 then make new document
  set URL of front document to "https://x.com/compose/post"
end tell

delay 3

repeat 20 times
  tell application "Safari"
    tell front document
      set readyState to do JavaScript "(function(){var t=document.querySelector('div[data-testid=\\\"tweetTextarea_0\\\"][role=\\\"textbox\\\"]'); return t ? 'ready' : 'wait';})()"
    end tell
  end tell
  if readyState is "ready" then exit repeat
  delay 0.5
end repeat

tell application "Safari"
  tell front document
    do JavaScript "(function(){var t=document.querySelector('div[data-testid=\\\"tweetTextarea_0\\\"][role=\\\"textbox\\\"]'); if(!t){return 'no_textarea'}; var v=" & textJson & "; t.focus(); t.innerText=v; t.dispatchEvent(new InputEvent('input',{bubbles:true})); return 'ok';})()"
  end tell
end tell

delay 1.2

tell application "Safari"
  tell front document
    set clickState to do JavaScript "(function(){var b=document.querySelector('button[data-testid=\\\"tweetButtonInline\\\"],button[data-testid=\\\"tweetButton\\\"]'); if(!b){return 'no_button'}; b.click(); return 'posted';})()"
  end tell
end tell

if clickState is not "posted" then
  return "click_failed:" & clickState
end if

set postState to "pending"
repeat 20 times
  delay 0.5
  tell application "Safari"
    tell front document
      set postState to do JavaScript "(function(){var hasComposer=!!document.querySelector('div[data-testid=\\\"tweetTextarea_0\\\"][role=\\\"textbox\\\"]'); var inCompose=location.href.indexOf('/compose/post')!==-1; var toast=!!document.querySelector('[data-testid=\\\"toast\\\"]'); if((!hasComposer)&&(!inCompose)) return 'confirmed'; if(toast) return 'toast'; return 'pending';})()"
    end tell
  end tell
  if postState is "confirmed" then exit repeat
end repeat

return "post_state:" & postState
end run
OSA
)"
else
  open_intent "$FINAL_TEXT"
  exit 0
fi

OSA_CODE=$?
set -e

if [[ "$OSA_CODE" -ne 0 ]]; then
  if printf '%s' "$OSA_OUT" | rg -qi "JavaScript.*AppleScript.*desactivada|AppleScript|Apple Events|Allow JavaScript from Apple Events"; then
    open_intent "$FINAL_TEXT"
    exit 0
  fi
  echo "$OSA_OUT" >&2
  exit 1
fi

if printf '%s' "$OSA_OUT" | rg -q "post_state:confirmed"; then
  printf 'POSTED_CONFIRMED ok len=%s\n' "$LEN"
  exit 0
fi

if printf '%s' "$OSA_OUT" | rg -q "post_state:toast"; then
  printf 'POST_CLICK_UNCONFIRMED toast_seen len=%s\n' "$LEN"
  exit 0
fi

printf 'POST_CLICK_UNCONFIRMED pending len=%s\n' "$LEN"
