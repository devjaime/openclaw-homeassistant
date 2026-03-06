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

## 5) Camara (Yoosee)
Entidad por defecto del script: `camera.yoosee_patio_sub`

```bash
./cam.sh list
./cam.sh probe sub
./cam.sh snapshot sub
./cam.sh send sub
./cam.sh clip sub 8
./cam.sh send-clip sub 8
```

Alias soportados:
- `sub`, `patio`, `yoosee`, `yoosee_sub`
- `main`, `yoosee_main`

## 6) Telegram intents para camara

```bash
./cam-intent.sh "manda captura de la camara patio"
./cam-intent.sh "manda clip de 10 segundos de la camara patio"
```

## 7) Alexa autonoma (notify/media_player)

```bash
./alexa.sh discover
./alexa.sh test
./alexa.sh send "Jaime esta almorzando"
```

## Seguridad
- Mantener HA en red local.
- No subir tokens ni credenciales a git.
- Rotar token si se expone.
