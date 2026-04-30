# Agent instructions

## Before running the app

Always run `scripts/reset.sh --force` before launching/executing the app. This wipes userData, caches, logs, preferences, and saved state so the app starts from a clean baseline. Skipping this leaves prior runs' state in place and can mask or fake-fix bugs.

## Building and launching

Always use `scripts/build.sh` (or `scripts/build.sh --dev`) to build and launch the app. It quits any running Airfetch instance first, rebuilds, then opens a single fresh instance. Do not invoke `npm start` / `electron .` directly — that stacks up countless open versions over a session.
