<script setup>
import { computed } from 'vue';
import IconBtn from './IconBtn.vue';
import SegmentedControl from './SegmentedControl.vue';
import { state, ui, api } from '../store.js';

const MODE_OPTIONS = [
  { value: 'video', label: 'Video', icon: 'film' },
  { value: 'audio', label: 'Audio', icon: 'music' },
];

const isMac = computed(() => state.platform === 'darwin');
const pasteShortcut = computed(() => (isMac.value ? '⌘V' : 'Ctrl+V'));
const prefsShortcut = computed(() => (isMac.value ? '⌘,' : 'Ctrl+,'));

async function paste() {
  const text = await api.readClipboard();
  if (!text) return;
  const urls = text.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
  if (urls.length === 0) return;
  await api.startMultiple(urls);
}

function setMode(mode) {
  api.setDefaults({ mode });
}

function openSettings() {
  ui.settingsOpen = true;
}
</script>

<template>
  <header class="toolbar">
    <div class="toolbar-left">
      <IconBtn
        icon="plus"
        :title="`Download URL from clipboard (${pasteShortcut})`"
        :disabled="!state.ytdlpPath"
        @click="paste"
      />
      <IconBtn icon="folder" title="Open download folder" @click="api.openOutputDir()" />
      <IconBtn icon="gear" :title="`Preferences (${prefsShortcut})`" @click="openSettings" />
    </div>
    <div class="toolbar-title">Airfetch</div>
    <div class="toolbar-right">
      <SegmentedControl
        :model-value="state.prefs.defaults.mode"
        :options="MODE_OPTIONS"
        @update:model-value="setMode"
      />
    </div>
  </header>
</template>
