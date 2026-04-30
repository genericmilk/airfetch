<script setup>
import { computed } from 'vue';
import SettingsRow from './SettingsRow.vue';
import SegmentedControl from '../SegmentedControl.vue';
import { bindDefault } from '../../bindings.js';
import { state } from '../../store.js';
import { VIDEO_QUALITIES, VIDEO_CONTAINERS, RECODE_FORMATS, AUDIO_FORMATS } from '../../constants.js';

const MODE_OPTIONS = [
  { value: 'video', label: 'Video', icon: 'film' },
  { value: 'audio', label: 'Audio', icon: 'music' },
];

const mode = bindDefault('mode');
const videoQuality = bindDefault('videoQuality');
const videoContainer = bindDefault('videoContainer');
const recodeFormat = bindDefault('recodeFormat');
const audioFormat = bindDefault('audioFormat');
const audioQuality = bindDefault('audioQuality', v => Math.max(0, Math.min(10, parseInt(v, 10) || 0)));

const audioHint = computed(() => {
  const q = state.prefs.defaults.audioQuality;
  if (q === 0) return '(best)';
  if (q === 10) return '(worst)';
  return '';
});

const containers = VIDEO_CONTAINERS.map(c => [c, c.toUpperCase()]);
</script>

<template>
  <section>
    <h3>Default mode</h3>
    <SettingsRow label="Mode">
      <SegmentedControl v-model="mode" :options="MODE_OPTIONS" small />
    </SettingsRow>

    <h3>Video</h3>
    <SettingsRow label="Quality">
      <select v-model="videoQuality">
        <option v-for="[v, l] in VIDEO_QUALITIES" :key="v" :value="v">{{ l }}</option>
      </select>
    </SettingsRow>
    <SettingsRow label="Container">
      <select v-model="videoContainer">
        <option v-for="[v, l] in containers" :key="v" :value="v">{{ l }}</option>
      </select>
    </SettingsRow>
    <SettingsRow label="Re-encode">
      <select v-model="recodeFormat">
        <option v-for="[v, l] in RECODE_FORMATS" :key="v" :value="v">{{ l }}</option>
      </select>
    </SettingsRow>

    <h3>Audio</h3>
    <SettingsRow label="Format">
      <select v-model="audioFormat">
        <option v-for="[v, l] in AUDIO_FORMATS" :key="v" :value="v">{{ l }}</option>
      </select>
    </SettingsRow>
    <SettingsRow label="Quality">
      <input v-model="audioQuality" type="number" min="0" max="10" />
      <span class="hint">{{ audioHint }}</span>
    </SettingsRow>
  </section>
</template>
