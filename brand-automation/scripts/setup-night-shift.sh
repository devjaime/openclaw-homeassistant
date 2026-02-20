#!/usr/bin/env bash
set -euo pipefail

BASE="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation"
# shellcheck disable=SC1091
source "$BASE/scripts/_cron_lib.sh"

WORK_PROMPT="$BASE/prompts/night_work_block.md"
TW_PROMPT="$BASE/prompts/twitter_drafts.md"
YT_PROMPT="$BASE/prompts/youtube_backlog.md"

# Bloques de trabajo visibles entre 03:30 y 08:30
cron_add_agent_job "night-work-0330" "30 3 * * *" "Bloque trabajo nocturno 03:30" "$WORK_PROMPT"
cron_add_agent_job "night-work-0500" "0 5 * * *" "Bloque trabajo nocturno 05:00" "$WORK_PROMPT"
cron_add_agent_job "night-work-0630" "30 6 * * *" "Bloque trabajo nocturno 06:30" "$WORK_PROMPT"

# Cambio de modelo por horario:
# 22:00 -> Ollama (gratis/local), 08:30 -> Gemini
cat > /tmp/openclaw_model_night_prompt.txt <<'PROMPT'
Ejecuta este comando exactamente y reporta el resultado:
/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation/scripts/model-mode.sh night
PROMPT
cron_add_agent_job "model-night-2200" "0 22 * * *" "Switch modelo a Ollama por horario nocturno" "/tmp/openclaw_model_night_prompt.txt"
rm -f /tmp/openclaw_model_night_prompt.txt

cat > /tmp/openclaw_model_day_prompt.txt <<'PROMPT'
Ejecuta este comando exactamente y reporta el resultado:
/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation/scripts/model-mode.sh day
PROMPT
cron_add_agent_job "model-day-0830" "30 8 * * *" "Switch modelo a Gemini por horario diurno" "/tmp/openclaw_model_day_prompt.txt"
rm -f /tmp/openclaw_model_day_prompt.txt

# Contenido marca personal antes de cierre de jornada
cron_add_agent_job "brand-twitter-drafts-0745" "45 7 * * *" "Genera borradores de Twitter" "$TW_PROMPT"
cron_add_agent_job "brand-youtube-backlog-0810" "10 8 * * *" "Genera backlog YouTube + shorts" "$YT_PROMPT"

# Cierre final 08:25
cat > /tmp/openclaw_brand_final_prompt.txt <<'PROMPT'
Genera cierre de jornada nocturna en español:
1) resumen de avances reales (máximo 10 líneas),
2) top 3 próximos pasos para el día,
3) estado de borradores Twitter y backlog YouTube.
No inventar información.
PROMPT
cron_add_agent_job "night-final-report-0825" "25 8 * * *" "Resumen final jornada nocturna" "/tmp/openclaw_brand_final_prompt.txt"
rm -f /tmp/openclaw_brand_final_prompt.txt

echo "Jobs nocturnos configurados."
cron_list_json | jq '.jobs[] | select(.name|test("night-|brand-")) | {id,name,enabled,schedule:(.schedule // .cron),nextRunAtMs:(.state.nextRunAtMs // null)}'
