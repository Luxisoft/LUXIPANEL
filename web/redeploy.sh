#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2026 LUXISOFT
# LUXIPANEL — build + pm2 restart helper.
#
# Usage:
#   bash redeploy.sh                # build + restart both backend and frontend
#   bash redeploy.sh backend        # only backend
#   bash redeploy.sh frontend       # only frontend
#
# Why: each `astro build` rewrites server chunks with new content-hashed
# filenames. The running pm2 process keeps the old import graph in memory
# and 500s on every route until it is restarted. This script makes sure
# the restart always follows the build.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-all}"

# pm2 app names (PM2_BACKEND/PM2_FRONTEND) + `build_project` — shared with
# .claude/scripts/build.sh. SSOT for the names is ecosystem.config.cjs.
source "${ROOT}/scripts/lib/build-flow.sh"

case "$TARGET" in
  backend) required_apps=("$PM2_BACKEND") ;;
  frontend) required_apps=("$PM2_FRONTEND") ;;
  all|both|"") required_apps=("$PM2_BACKEND" "$PM2_FRONTEND") ;;
  *) echo "Uso: $0 [backend|frontend|all]" >&2; exit 2 ;;
esac
for app in "${required_apps[@]}"; do
  if ! systemctl --user is-enabled "backend-demand-${app}.socket" >/dev/null 2>&1 && ! command -v pm2 >/dev/null 2>&1; then
    echo "No hay un socket habilitado para ${app} y pm2 no está en PATH." >&2
    exit 1
  fi
done

build_backend() {
  echo "==> backend: npm run build"
  build_project "$ROOT" backend
  echo "==> backend: pm2 restart ${PM2_BACKEND}"
  if systemctl --user is-enabled "backend-demand-${PM2_BACKEND}.socket" >/dev/null 2>&1; then
    systemctl --user try-restart "backend-demand-${PM2_BACKEND}.service"
  else
    pm2 restart "${PM2_BACKEND}" --update-env
  fi
}

build_frontend() {
  echo "==> frontend: npm run build"
  build_project "$ROOT" frontend
  echo "==> frontend: pm2 restart ${PM2_FRONTEND}"
  if systemctl --user is-enabled "backend-demand-${PM2_FRONTEND}.socket" >/dev/null 2>&1; then
    systemctl --user try-restart "backend-demand-${PM2_FRONTEND}.service"
  else
    pm2 restart "${PM2_FRONTEND}" --update-env
  fi
}

case "$TARGET" in
  backend)  build_backend ;;
  frontend) build_frontend ;;
  all|both|"") build_backend; build_frontend ;;
  *)
    echo "Destino desconocido: $TARGET" >&2
    echo "Uso: $0 [backend|frontend|all]" >&2
    exit 2
    ;;
esac

if command -v pm2 >/dev/null 2>&1; then
  pm2 list
else
  systemctl --user list-units 'backend-demand-luxipanel-*' --no-pager
fi
