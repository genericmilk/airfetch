<script setup>
import SettingsRow from './SettingsRow.vue';
import { state, ui, api } from '../../store.js';
import { bindPref, bindDefault } from '../../bindings.js';
import { SELECTABLE_BROWSERS } from '../../constants.js';

const cookiesBrowser = bindPref('cookiesBrowser');
const cookiesProfile = bindPref('cookiesProfile');
const cookiesFile = bindDefault('cookiesFile');

async function pickProfile() {
  const p = await api.chooseFolder();
  if (p) api.setPrefs({ cookiesProfile: p });
}
async function pickFile() {
  const p = await api.chooseFile();
  if (p) api.setDefaults({ cookiesFile: p });
}
function rerunOnboarding() {
  ui.onboardingPhase = state.ytdlpManagedInstalled ? 'browser' : 'install';
  ui.onboardingSelection = state.prefs.cookiesBrowser;
  ui.settingsOpen = false;
  api.setPrefs({ onboardingCompleted: false });
}

const browserLabel = id => state.browsers.find(b => b.id === id)?.label || id;
</script>

<template>
  <section>
    <p class="hint">
      Airfetch always sends cookies so logged-in sites work. Pick once here — every browser
      goes through the Downloader Engine's <code>--cookies-from-browser</code>.
    </p>
    <SettingsRow label="Browser">
      <select v-model="cookiesBrowser">
        <option v-for="id in SELECTABLE_BROWSERS" :key="id" :value="id">
          {{ browserLabel(id) }}
        </option>
      </select>
    </SettingsRow>
    <SettingsRow label="Profile">
      <input v-model="cookiesProfile" type="text" placeholder="Profile name or full path" />
      <button @click="pickProfile">Choose…</button>
    </SettingsRow>
    <SettingsRow>
      <button @click="rerunOnboarding">Re-run onboarding…</button>
    </SettingsRow>

    <h3>Cookies file (optional)</h3>
    <SettingsRow label="File">
      <code>{{ state.prefs.defaults.cookiesFile || '—' }}</code>
      <button v-if="state.prefs.defaults.cookiesFile" @click="cookiesFile = null">Clear</button>
      <button @click="pickFile">Choose…</button>
    </SettingsRow>
    <p class="hint">Layered on top of the browser selection. Handy for exported cookies.txt files.</p>
  </section>
</template>
