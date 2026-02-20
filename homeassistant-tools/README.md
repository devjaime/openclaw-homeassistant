# Home Assistant + OpenClaw (local)

## 1) Abrir Home Assistant
- URL: `http://127.0.0.1:8123`
- Si es primera vez, completa el onboarding.

## 2) Crear token en Home Assistant
- Perfil -> **Security** -> **Long-Lived Access Tokens** -> **Create Token**.

## 3) Guardar token seguro
Agregar en `~/.openclaw/secrets.env`:

```bash
HA_URL="http://127.0.0.1:8123"
HA_TOKEN="TU_TOKEN_AQUI"
```

## 4) Probar API

```bash
./ha.sh ping
./ha.sh entities
```

## 5) Cámara recomendada para OpenClaw
- Entidad: `camera.patio_rtsp_sub`

```bash
./cam.sh list
./cam.sh state camera.patio_rtsp_sub
./cam.sh probe camera.patio_rtsp_sub
./cam.sh snapshot camera.patio_rtsp_sub /tmp/patio.jpg
```

## 6) Controlar dispositivos

```bash
./ha.sh service light turn_on '{"entity_id":"light.sala"}'
./ha.sh service light turn_off '{"entity_id":"light.sala"}'
./ha.sh state climate.living_room
```

## Seguridad
- Mantén HA en red local.
- No subas tokens a git.
- Rota token si se expone.

## 7) Alexa autonoma (notify/media_player)

Usa el script `alexa.sh` para que OpenClaw detecte automaticamente la mejor ruta (`notify.*` o `media_player.*`) y envie mensajes sin tener que ajustar el servicio manualmente.

```bash
./alexa.sh discover
./alexa.sh test
./alexa.sh send "Jaime esta almorzando"
# opcional con target explicito:
./alexa.sh send "Hay movimiento en patio" media_player.echo_dot_sala
./alexa.sh send "Hola" notify.alexa_media_sala
```
