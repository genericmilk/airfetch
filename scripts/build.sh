#!/usr/bin/env bash
# Close any running Airfetch instances, rebuild, and relaunch.
#
# Usage:
#   scripts/build.sh           # production build
#   scripts/build.sh --dev     # dev build (AIRFETCH_DEV=1)

set -euo pipefail

DEV=0
for arg in "$@"; do
  case "$arg" in
    -d|--dev) DEV=1 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

APP_NAME="Airfetch"

cd "$(dirname "$0")/.."

if pgrep -x "$APP_NAME" >/dev/null 2>&1; then
  echo "Quitting $APP_NAME…"
  osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    pgrep -x "$APP_NAME" >/dev/null 2>&1 || break
    sleep 0.5
  done
  pkill -x "$APP_NAME" 2>/dev/null || true
fi

# Also kill any stray electron processes from this project.
pkill -f "electron .*airfetch" 2>/dev/null || true

if [[ $DEV -eq 1 ]]; then
  AIRFETCH_DEV=1 npm run build
  AIRFETCH_DEV=1 electron . &
else
  npm run build
  electron . &
fi

disown 2>/dev/null || true
echo "Launched $APP_NAME."
