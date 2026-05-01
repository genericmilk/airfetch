#!/usr/bin/env bash
# Cut a GitHub release for Airfetch and upload installer artifacts.
#
# Usage:
#   scripts/release.sh                  # release the version in package.json (vX.Y.Z),
#                                       # using the artifacts already in dist/
#   scripts/release.sh --build          # run electron-builder for all platforms first
#   scripts/release.sh --version 0.2.0  # release a specific version (also rewrites
#                                       # package.json before tagging if it differs)
#   scripts/release.sh --notes-file FILE
#                                       # use custom release notes; defaults to a
#                                       # generated changelog from `git log`
#   scripts/release.sh --draft          # publish as a draft (review on GitHub before
#                                       # going public)
#   scripts/release.sh --dry-run        # show what would happen, don't push or call gh
#
# Notes
# ─────
# • Requires `gh` authenticated against github.com/genericmilk/airfetch.
# • Requires a clean git working tree on `main` (the tag is cut from HEAD).
# • If --build is omitted, dist/ must already contain the per-platform artifacts
#   for the version being released. `npm run dist` produces them.
# • Cross-platform builds: electron-builder can produce Windows artifacts on
#   macOS but the local `npm run dist` script targets all three. If you don't
#   have wine installed for Windows builds, run --build only on macOS where
#   electron-builder has cross-target support, or build per-platform on the
#   matching host. The script doesn't care which subset is in dist/ — it
#   uploads whatever it finds for the version.

set -euo pipefail

cd "$(dirname "$0")/.."

REPO="genericmilk/airfetch"
DO_BUILD=0
DRY_RUN=0
DRAFT=0
VERSION_OVERRIDE=""
NOTES_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--build)        DO_BUILD=1; shift ;;
    -n|--dry-run)      DRY_RUN=1; shift ;;
    -d|--draft)        DRAFT=1; shift ;;
    -v|--version)      VERSION_OVERRIDE="$2"; shift 2 ;;
       --notes-file)   NOTES_FILE="$2"; shift 2 ;;
    -h|--help)         sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ── prerequisites ─────────────────────────────────────────────────────────
if ! command -v gh >/dev/null 2>&1; then
  echo "error: 'gh' (GitHub CLI) not found. Install it first." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "error: 'jq' not found. Install it (brew install jq)." >&2
  exit 1
fi
gh auth status >/dev/null 2>&1 || {
  echo "error: gh is not authenticated. Run 'gh auth login'." >&2
  exit 1
}

# ── resolve version ───────────────────────────────────────────────────────
PKG_VERSION="$(jq -r '.version' package.json)"
if [[ -n "$VERSION_OVERRIDE" ]]; then
  TARGET_VERSION="${VERSION_OVERRIDE#v}"
else
  TARGET_VERSION="$PKG_VERSION"
fi
TAG="v${TARGET_VERSION}"

if [[ "$TARGET_VERSION" != "$PKG_VERSION" ]]; then
  echo "Updating package.json: $PKG_VERSION → $TARGET_VERSION"
  if [[ $DRY_RUN -eq 0 ]]; then
    tmp="$(mktemp)"
    jq --arg v "$TARGET_VERSION" '.version = $v' package.json > "$tmp"
    mv "$tmp" package.json
  fi
fi

# ── refuse dirty trees and existing tags ──────────────────────────────────
# We allow a single dirty file: package.json (because the version bump above
# may have just modified it). Anything else is operator error.
if ! git diff --quiet -- ':!package.json' || ! git diff --cached --quiet -- ':!package.json'; then
  echo "error: working tree has unstaged/staged changes outside package.json." >&2
  echo "Commit or stash them before releasing." >&2
  git status --short >&2
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag $TAG already exists locally. Delete it or pick another version." >&2
  exit 1
fi
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "error: release $TAG already exists on GitHub." >&2
  exit 1
fi

# ── (optional) build ──────────────────────────────────────────────────────
if [[ $DO_BUILD -eq 1 ]]; then
  echo "Running 'npm run dist'…"
  if [[ $DRY_RUN -eq 0 ]]; then npm run dist; fi
fi

# ── collect artifacts ─────────────────────────────────────────────────────
DIST_DIR="dist"
if [[ ! -d "$DIST_DIR" ]]; then
  echo "error: $DIST_DIR not found. Run with --build or run 'npm run dist' first." >&2
  exit 1
fi

# Patterns we recognise as user-facing installers, plus the electron-updater
# manifests/blockmaps in case we wire up auto-update later. Globs use the
# version we're releasing so a stale older build doesn't get attached.
shopt -s nullglob
ARTIFACTS=(
  # macOS
  "$DIST_DIR/Airfetch-${TARGET_VERSION}-arm64.dmg"
  "$DIST_DIR/Airfetch-${TARGET_VERSION}.dmg"
  "$DIST_DIR/Airfetch-${TARGET_VERSION}-arm64-mac.zip"
  "$DIST_DIR/Airfetch-${TARGET_VERSION}-mac.zip"
  # Windows
  "$DIST_DIR/Airfetch Setup ${TARGET_VERSION}.exe"
  "$DIST_DIR/Airfetch ${TARGET_VERSION}.exe"
  # Linux
  "$DIST_DIR/Airfetch-${TARGET_VERSION}.AppImage"
  "$DIST_DIR/airfetch-electron_${TARGET_VERSION}_amd64.deb"
  # electron-updater manifests
  "$DIST_DIR/latest.yml"
  "$DIST_DIR/latest-mac.yml"
  "$DIST_DIR/latest-linux.yml"
)
shopt -u nullglob

EXISTING=()
for f in "${ARTIFACTS[@]}"; do
  [[ -f "$f" ]] && EXISTING+=("$f")
done

if [[ ${#EXISTING[@]} -eq 0 ]]; then
  echo "error: no matching artifacts found in $DIST_DIR for version $TARGET_VERSION." >&2
  echo "Expected names like Airfetch-${TARGET_VERSION}.dmg / Airfetch Setup ${TARGET_VERSION}.exe." >&2
  exit 1
fi

echo "Release artifacts to upload:"
for f in "${EXISTING[@]}"; do echo "  • $f"; done

# ── release notes ─────────────────────────────────────────────────────────
NOTES_PATH=""
if [[ -n "$NOTES_FILE" ]]; then
  if [[ ! -f "$NOTES_FILE" ]]; then
    echo "error: --notes-file $NOTES_FILE not found." >&2
    exit 1
  fi
  NOTES_PATH="$NOTES_FILE"
else
  PREV_TAG="$(git tag --sort=-v:refname | head -n 1 || true)"
  TMP_NOTES="$(mktemp)"
  {
    echo "## Airfetch $TAG"
    echo
    if [[ -n "$PREV_TAG" ]]; then
      echo "### Changes since $PREV_TAG"
      git log "${PREV_TAG}..HEAD" --pretty=format:'- %s' --no-merges || true
    else
      echo "Initial public release."
    fi
    echo
    echo "### Downloads"
    echo
    echo "| Platform | File |"
    echo "| --- | --- |"
    for f in "${EXISTING[@]}"; do
      base="$(basename "$f")"
      case "$base" in
        *arm64.dmg)               echo "| macOS (Apple Silicon) | $base |" ;;
        Airfetch-*.dmg)           echo "| macOS (Intel) | $base |" ;;
        "Airfetch Setup "*)       echo "| Windows installer | $base |" ;;
        Airfetch\ *.exe)          echo "| Windows portable | $base |" ;;
        *.AppImage)               echo "| Linux AppImage | $base |" ;;
        *.deb)                    echo "| Linux .deb | $base |" ;;
        *) ;;
      esac
    done
  } > "$TMP_NOTES"
  NOTES_PATH="$TMP_NOTES"
fi

echo
echo "Release notes:"
echo "──────────────"
cat "$NOTES_PATH"
echo "──────────────"

# ── commit + tag + push ───────────────────────────────────────────────────
COMMIT_NEEDED=0
if ! git diff --quiet -- package.json || ! git diff --cached --quiet -- package.json; then
  COMMIT_NEEDED=1
fi

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY: $*"
  else
    "$@"
  fi
}

if [[ $COMMIT_NEEDED -eq 1 ]]; then
  run git add package.json
  run git commit -m "Release ${TAG}"
fi

run git tag -a "$TAG" -m "Release ${TAG}"
run git push origin HEAD
run git push origin "$TAG"

# ── create release ────────────────────────────────────────────────────────
GH_FLAGS=(--repo "$REPO" --title "Airfetch $TAG" --notes-file "$NOTES_PATH")
if [[ $DRAFT -eq 1 ]]; then GH_FLAGS+=(--draft); fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "DRY: gh release create $TAG ${GH_FLAGS[*]} ${EXISTING[*]}"
else
  gh release create "$TAG" "${GH_FLAGS[@]}" "${EXISTING[@]}"
fi

echo
echo "Done. Release: https://github.com/${REPO}/releases/tag/${TAG}"
