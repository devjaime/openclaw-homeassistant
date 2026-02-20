#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
stamp="$(date +%Y%m%d-%H%M%S)"
tar -czf "backups/config-${stamp}.tar.gz" -C . config
echo "backups/config-${stamp}.tar.gz"
