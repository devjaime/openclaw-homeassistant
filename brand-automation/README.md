# Brand Automation (OpenClaw + Telegram + n8n)

Pipeline nocturno para que el bot avance en proyectos y deje contenido de marca personal mientras duermes.

## Qué incluye

- Bloques de trabajo nocturno (03:30, 05:00, 06:30)
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
