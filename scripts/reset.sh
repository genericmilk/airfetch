#!/usr/bin/env bash
# Full reset for the Electron Airfetch app on macOS.
# Wipes userData, caches, logs, preferences, and (optionally) the default
# download output directory. Quits the app first if it is running.
#
# Usage:
#   scripts/reset.sh             # prompts for confirmation, keeps downloads
#   scripts/reset.sh --force     # no prompt
#   scripts/reset.sh --downloads # also delete ~/Downloads/Airfetch
#   scripts/reset.sh --force --downloads

set -euo pipefail

FORCE=0
WIPE_DOWNLOADS=0
for arg in "$@"; do
  case "$arg" in
    -f|--force) FORCE=1 ;;
    -d|--downloads) WIPE_DOWNLOADS=1 ;;
    -h|--help)
      sed -n '2,11p' "$0"
      exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "reset.sh currently supports macOS only" >&2
  exit 1
fi

APP_NAME="Airfetch"
BUNDLE_ID="com.airfetch.app"

TARGETS=(
  "$HOME/Library/Application Support/$APP_NAME"
  "$HOME/Library/Caches/$APP_NAME"
  "$HOME/Library/Caches/$BUNDLE_ID"
  "$HOME/Library/Logs/$APP_NAME"
  "$HOME/Library/Preferences/$APP_NAME.plist"
  "$HOME/Library/Preferences/$BUNDLE_ID.plist"
  "$HOME/Library/Saved Application State/$BUNDLE_ID.savedState"
  "$HOME/Library/HTTPStorages/$BUNDLE_ID"
  "$HOME/Library/HTTPStorages/$BUNDLE_ID.binarycookies"
  "$HOME/Library/WebKit/$BUNDLE_ID"
)

if [[ $WIPE_DOWNLOADS -eq 1 ]]; then
  TARGETS+=("$HOME/Downloads/$APP_NAME")
fi

echo "About to delete:"
for t in "${TARGETS[@]}"; do
  if [[ -e "$t" ]]; then
    size=$(du -sh "$t" 2>/dev/null | awk '{print $1}')
    printf "  %s  (%s)\n" "$t" "${size:-?}"
  fi
done

any=0
for t in "${TARGETS[@]}"; do [[ -e "$t" ]] && any=1; done
if [[ $any -eq 0 ]]; then
  echo "Nothing to delete — already clean."
  exit 0
fi

if [[ $FORCE -ne 1 ]]; then
  read -r -p "Proceed? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "aborted"; exit 1; }
fi

# Quit the app if it is running so it doesn't rewrite files on exit.
if pgrep -x "$APP_NAME" >/dev/null 2>&1; then
  echo "Quitting $APP_NAME…"
  osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    pgrep -x "$APP_NAME" >/dev/null 2>&1 || break
    sleep 0.5
  done
  pkill -x "$APP_NAME" 2>/dev/null || true
fi

# Flush any cached plist values Preferences daemon is holding.
defaults delete "$BUNDLE_ID" 2>/dev/null || true
defaults delete "$APP_NAME" 2>/dev/null || true
killall cfprefsd 2>/dev/null || true

for t in "${TARGETS[@]}"; do
  if [[ -e "$t" ]]; then
    rm -rf -- "$t"
    echo "  removed: $t"
  fi
done

echo "Reset complete."
