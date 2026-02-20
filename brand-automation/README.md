# Brand Automation (OpenClaw + Telegram + n8n)

Pipeline nocturno para que el bot avance en proyectos y deje contenido de marca personal mientras duermes.

## Qué incluye

- Bloques de trabajo nocturno (03:30, 05:00, 06:30)
- Cambio automático de modelo:
  - 22:00 -> Ollama local (`qwen2.5:7b`)
  - 08:30 -> Gemini (`gemini-2.5-flash-lite`)
- Generación de borradores Twitter (07:45)
- Backlog YouTube + shorts (08:10)
- Resumen final de jornada (08:25)
- Integración base con webhooks n8n
- Sincronización a vault Obsidian versionado en git

## Rutas

- Prompts: `prompts/`
- Scripts: `scripts/`
- Borradores: `drafts/`
- Reportes: `reports/`
- Plantillas n8n: `n8n/workflows/`
- Vault Obsidian: `../obsidian-vault/`

## Activar pipeline nocturno

```bash
cd /Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation/scripts
./setup-night-shift.sh
```

## Pausar / reactivar

```bash
./disable-night-shift.sh
./enable-night-shift.sh
```

## Ejecutar prueba manual ahora

```bash
./run-now.sh
```

## Cambiar modelo manualmente

```bash
./model-mode.sh status
./model-mode.sh night   # Ollama
./model-mode.sh day     # Gemini
```

## Control por texto (intención Telegram)

Script:

```bash
./model-intent.sh "modo gemini"
./model-intent.sh "modo ollama"
./model-intent.sh "modelo actual"
```

## Publicar en X/Twitter sin API (Chrome logueado)

Usa tu sesión ya abierta en Chrome. El script publica solo con `--yes`.
Ahora agrega prefijo de trazabilidad en cada tweet:
- Telegram gatillado: `[pub:telegram|trigger:gatillado] ...`
- OpenClaw automático: `[pub:openclaw|trigger:automatico] ...`

```bash
./twitter-chrome-post.sh --draft 1          # preview
./twitter-chrome-post.sh --draft 1 --yes    # publica
./twitter-chrome-post.sh --text "Hola X"    # preview
./twitter-chrome-post.sh --text "Hola X" --yes
./twitter-chrome-post.sh --text "Hola X" --publisher openclaw --trigger automatico
```

Router para Telegram:

```bash
./twitter-intent.sh "publica draft 1"                 # preview
./twitter-intent.sh "publica draft 1 confirmar"       # publica
./twitter-intent.sh "tweet texto: avance en openclaw" # preview
./twitter-intent.sh "publica texto: avance confirmar safari" # abre Safari prellenado
./twitter-intent.sh "publica texto: avance confirmar brave"  # abre Brave prellenado
./twitter-intent.sh "ciclo proyecto humanloop"               # genera estado (preview)
./twitter-intent.sh "ciclo proyecto humanloop confirmar safari" # genera y publica en Safari
```

Nota:
- En `twitter-intent.sh` el navegador por defecto ya es `safari`.

## Sincronizar en Obsidian

```bash
./sync-obsidian-from-brand.sh
```

Esto actualiza:
- `../obsidian-vault/30-Daily/<fecha>.md`
- `../obsidian-vault/20-Brand/Content-Backlog.md`
- `../obsidian-vault/10-Projects/OpenClaw-HomeAssistant.md`

## Integración n8n (base)

1. Importa workflows de `n8n/workflows/` en n8n.
2. Exporta variables de webhook (ver `n8n/examples/env.example`).
3. Envía último contenido generado a n8n:

```bash
./push-to-n8n.sh
```

## Commit con documentación

```bash
./commit-with-docs.sh "chore: sync brand automation and obsidian notes"
```

## Nota importante

- El sistema está diseñado para producir actividad basada en trabajo real.
- Evita publicar contenido inventado o sensible.
