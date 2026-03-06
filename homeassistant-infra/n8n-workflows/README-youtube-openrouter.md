# n8n - YouTube Summary (OpenRouter + Telegram + OpenClaw)

Base inspirada en la plantilla de n8n:
- https://n8n.io/workflows/2736-summarize-youtube-videos-from-transcript/

## Archivo

- `openclaw-youtube-openrouter-telegram.json`

## Qué hace

1. Recibe un webhook con uno o varios videos de YouTube.
2. Obtiene transcript vía API externa (RapidAPI).
3. Resume con OpenRouter.
4. Envía cada resumen por Telegram.
5. Notifica a OpenClaw (webhook backlog) para trazabilidad.
6. Guarda lote en JSONL: `/data/openclaw/youtube-summaries-log.jsonl`.

## Variables de entorno en n8n

Obligatorias:
- `OPENROUTER_API_KEY`
- `YT_TRANSCRIPT_API_URL`
- `YT_TRANSCRIPT_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Opcionales:
- `YT_TRANSCRIPT_API_HOST` (si tu proveedor RapidAPI lo exige)
- `OPENROUTER_SUMMARY_MODEL` (default: `google/gemini-3-flash-preview`)
- `OPENCLAW_YT_WEBHOOK_URL` (default: `http://127.0.0.1:5678/webhook/openclaw-youtube-backlog`)

## Webhook de entrada

Path:
- `POST /webhook/openclaw-youtube-summarize`

Payload recomendado:

```json
{
  "videos": [
    "https://www.youtube.com/watch?v=VIDEO_ID_1",
    "https://youtu.be/VIDEO_ID_2"
  ],
  "chat_id": "1540433103",
  "max_transcript_chars": 16000,
  "max_tokens": 900
}
```

También acepta:
- `videos_text` (string con URLs separadas por salto de línea o coma)
- `url` (un solo video)

## Integración con OpenClaw

Este flujo manda un `POST` a:
- `OPENCLAW_YT_WEBHOOK_URL`

con payload tipo:
- `kind: youtube_summary`
- `content: <resumen>`
- `meta.url`, `meta.videoId`, `meta.usage`

Así puedes usar el workflow existente `openclaw-youtube-backlog` para dejar historial del resumen.

## Trigger desde OpenClaw (ejemplo)

Desde scripts o cron de OpenClaw, puedes gatillar:

```bash
curl -X POST http://127.0.0.1:5678/webhook/openclaw-youtube-summarize \
  -H 'Content-Type: application/json' \
  -d '{
    "videos": [
      "https://www.youtube.com/watch?v=VIDEO_ID_1",
      "https://www.youtube.com/watch?v=VIDEO_ID_2"
    ],
    "chat_id": "1540433103"
  }'
```

## Nota importante transcript API

La extracción de transcript depende del proveedor RapidAPI que configures.
Si el proveedor falla para un video, el flujo enviará error de ese video a Telegram y seguirá con el resto.
