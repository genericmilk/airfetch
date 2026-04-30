import { computed } from 'vue';
import { state, api } from './store.js';

// Two-way computed for a single key on prefs.defaults — use as v-model
// target. Writes go straight to main via setDefaults.
export function bindDefault(key, transform = v => v) {
  return computed({
    get: () => state.prefs.defaults[key],
    set: v => api.setDefaults({ [key]: transform(v) }),
  });
}

// Same shape but for top-level prefs (cookiesBrowser, cookiesProfile, …).
export function bindPref(key, transform = v => v) {
  return computed({
    get: () => state.prefs[key],
    set: v => api.setPrefs({ [key]: transform(v) }),
  });
}
