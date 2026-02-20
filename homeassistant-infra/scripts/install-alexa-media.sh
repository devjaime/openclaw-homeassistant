#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${ROOT_DIR}/config"
TMP_DIR="/tmp/alexa_media_install"

mkdir -p "${CONFIG_DIR}/custom_components"
rm -rf "${TMP_DIR}"
git clone --depth 1 https://github.com/alandtse/alexa_media_player.git "${TMP_DIR}/repo"
rsync -a "${TMP_DIR}/repo/custom_components/alexa_media/" "${CONFIG_DIR}/custom_components/alexa_media/"

cd "${ROOT_DIR}"
docker compose restart homeassistant

echo "alexa_media instalado. Ahora termina el login en Home Assistant UI:"
echo "Settings -> Devices & Services -> Add Integration -> Alexa Media Player"
