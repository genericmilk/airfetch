<script setup>
import SettingsRow from './SettingsRow.vue';
import Toggle from '../Toggle.vue';
import { state, api } from '../../store.js';
import { bindDefault } from '../../bindings.js';

const outputTemplate = bindDefault('outputTemplate');
const restrictFilenames = bindDefault('restrictFilenames');
const downloadPlaylist = bindDefault('downloadPlaylist');
const playlistItems = bindDefault('playlistItems');

async function chooseFolder() {
  const p = await api.chooseFolder(state.prefs.defaults.outputDirectory);
  if (p) api.setDefaults({ outputDirectory: p });
}
</script>

<template>
  <section>
    <h3>Downloads</h3>
    <SettingsRow label="Folder">
      <code>{{ state.prefs.defaults.outputDirectory || '—' }}</code>
      <button @click="chooseFolder">Choose…</button>
    </SettingsRow>
    <SettingsRow label="Template">
      <input v-model="outputTemplate" type="text" class="mono" />
    </SettingsRow>
    <SettingsRow>
      <Toggle v-model="restrictFilenames" label="Restrict filenames to ASCII" />
    </SettingsRow>

    <h3>Playlists</h3>
    <SettingsRow>
      <Toggle v-model="downloadPlaylist" label="Download entire playlist when URL has one" />
    </SettingsRow>
    <SettingsRow label="Items">
      <input
        v-model="playlistItems"
        type="text"
        placeholder="1-3,7 or -5::"
        :disabled="!state.prefs.defaults.downloadPlaylist"
      />
    </SettingsRow>
    <p class="hint">When off, only the single video referenced by the URL is downloaded — the playlist is ignored.</p>
  </section>
</template>
