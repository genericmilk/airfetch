// Single reactive store for both IPC-sourced state and renderer-local UI
// state. Components import `state` and `ui` directly; updates flow back
// to main via the `api` proxy on window.airfetch.

import { reactive, computed, toRaw, isProxy } from 'vue';

// Strip Vue reactive proxies before they cross the IPC boundary —
// Electron's structured-clone implementation rejects Proxy objects with
// "An object could not be cloned." Functions (e.g. the onState callback)
// pass through untouched.
function unwrap(v) {
  if (v == null) return v;
  if (typeof v === 'function') return v;
  if (typeof v !== 'object') return v;
  const raw = isProxy(v) ? toRaw(v) : v;
  if (Array.isArray(raw)) return raw.map(unwrap);
  const out = {};
  for (const k of Object.keys(raw)) out[k] = unwrap(raw[k]);
  return out;
}

const rawApi = window.airfetch;
export const api = new Proxy({}, {
  get(_, name) {
    const fn = rawApi[name];
    if (typeof fn !== 'function') return fn;
    return (...args) => fn(...args.map(unwrap));
  },
});

// IPC-sourced state. Shape mirrors Manager.snapshot() in main.js. Default
// values keep templates safe before the first 'state' broadcast lands.
export const state = reactive({
  jobs: [],
  history: [],
  prefs: { defaults: {}, cookiesBrowser: 'safari', cookiesProfile: '', onboardingCompleted: false },
  ytdlpPath: null,
  ytdlpVersion: '',
  ytdlpManagedInstalled: false,
  launchError: null,
  upgradeState: { status: 'idle', progress: 0, output: '', lastTag: '' },
  appUpdate: {
    status: 'idle',
    currentVersion: '',
    latestVersion: '',
    releaseUrl: '',
    releaseNotes: '',
    publishedAt: '',
    error: '',
    checkedAt: '',
    dismissed: false,
  },
  platform: '',
  browsers: [],
});

// Renderer-local UI state. Things that don't belong in prefs because they
// reset on relaunch (search box, which sheet is open, etc).
export const ui = reactive({
  searchText: '',
  settingsOpen: false,
  activeTab: 'general',
  onboardingPhase: 'install',
  onboardingSelection: null,
  onboardingCustomPath: '',
  onboardingInitialised: false,
  installKicked: false,
  contextMenu: { open: false, x: 0, y: 0, items: [] },
});

export async function bootstrap() {
  Object.assign(state, await api.getState());
  // Block-bodied callback so the return value is undefined; an expression
  // body would return the reactive proxy, which Electron's contextBridge
  // can't clone back to the preload context.
  api.onState(s => { Object.assign(state, s); });
}

// Derived collections used in multiple places. Both lists are scoped to
// the current A/V mode in the toolbar — the switcher is the user's "I'm
// looking at videos / I'm looking at audio" filter, so video and audio
// downloads are never mixed in the same view.
export const activeJobs = computed(() => {
  const mode = state.prefs?.defaults?.mode;
  return (state.jobs || []).filter(j =>
    !isTerminal(j.status) && (!mode || j.options?.mode === mode)
  );
});

export const filteredHistory = computed(() => {
  let items = state.history || [];
  const mode = state.prefs?.defaults?.mode;
  if (mode) items = items.filter(i => i.mode === mode);
  const q = ui.searchText.trim().toLowerCase();
  if (q) {
    items = items.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.uploader || '').toLowerCase().includes(q) ||
      (i.url || '').toLowerCase().includes(q)
    );
  }
  return items;
});

export function isTerminal(status) {
  return status === 'finished' || status === 'failed' || status === 'cancelled';
}

// The click that triggers openContextMenu also bubbles to the window
// listener that closes it. Suppress that first close so the menu actually
// shows up.
let suppressNextWindowClick = false;

export function openContextMenu(event, items) {
  suppressNextWindowClick = true;
  setTimeout(() => { suppressNextWindowClick = false; }, 0);
  ui.contextMenu = { open: true, x: event.clientX, y: event.clientY, items };
}

export function closeContextMenu() {
  ui.contextMenu = { ...ui.contextMenu, open: false };
}

export function shouldSuppressOutsideClick() {
  return suppressNextWindowClick;
}
