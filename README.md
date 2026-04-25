# Airfetch — Electron

Cross-platform port of the Swift/macOS Airfetch app. Same feature set: a
queue-driven `yt-dlp` front-end with history, settings, and an onboarding
flow that installs the engine on first launch.

## Running

```
cd electron
npm install
npm start
```

`npm run dev` enables verbose logging to stdout.

## Layout

- `main.js` — Electron main process. Spawns `yt-dlp`, parses its progress
  markers (`[AFPROG] / [AFMETA] / [AFFILE]`), persists preferences and
  history, and installs/updates the `yt-dlp` binary from GitHub.
- `preload.js` — `contextBridge` shim exposing `window.airfetch` to the
  renderer.
- `renderer/` — HTML/CSS/JS UI mirroring the SwiftUI layout: toolbar,
  download queue, history, onboarding sheet, and settings sheet.

## Parity with the Swift app

Same yt-dlp argument builder, same progress markers, same prefs schema,
same on-disk history format (JSON at `<userData>/history.json`). Arc's
macOS-specific keychain cookie extraction is not ported — pick Chrome or
any other browser instead; yt-dlp's `--cookies-from-browser` handles it
on every platform.
