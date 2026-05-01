# Airfetch

Cross-platform port of the Swift/macOS Airfetch app. Same feature set: a
queue-driven downloader front-end with history, settings, and an onboarding
flow that installs the engine on first launch.

## Running

```
npm install
npm start
```

`npm run dev` enables verbose logging to stdout.

## Layout

- `main.js` — main process. Spawns the downloader engine, parses its progress
  markers (`[AFPROG] / [AFMETA] / [AFFILE]`), persists preferences and
  history, and installs/updates the engine binary from GitHub.
- `preload.js` — `contextBridge` shim exposing `window.airfetch` to the
  renderer.
- `renderer/` — HTML/CSS/JS UI mirroring the SwiftUI layout: toolbar,
  download queue, history, onboarding sheet, and settings sheet.

## Parity with the Swift app

Same engine argument builder, same progress markers, same prefs schema,
same on-disk history format (JSON at `<userData>/history.json`). Arc's
macOS-specific keychain cookie extraction is not ported — pick Chrome or
any other browser instead; the engine's `--cookies-from-browser` handles
it on every platform.
