#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant"
cd "$REPO_ROOT"

msg="${1:-chore: update automation + obsidian docs}"

# Sin cambios, salir limpio
if [[ -z "$(git status --porcelain)" ]]; then
  echo "No changes to commit"
  exit 0
fi

# Reglas mínimas: si tocamos scripts, debe existir al menos un README/documento cambiado
changed="$(git status --porcelain)"
if echo "$changed" | rg -q 'brand-automation/scripts|obsidian-vault' ; then
  if ! echo "$changed" | rg -q 'README\.md|\.md$' ; then
    echo "Bloqueado: hay cambios técnicos sin documentación .md"
    exit 1
  fi
fi

git add -A
git commit -m "$msg"

echo "Committed: $msg"
git --no-pager log -1 --oneline
