<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';
import { state } from '../store.js';

const pasteShortcut = computed(() => (state.platform === 'darwin' ? '⌘V' : 'Ctrl+V'));
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon"><Icon name="download" :size="48" /></div>
    <h3>No downloads yet</h3>
    <p>Copy a video URL, then press {{ pasteShortcut }} or click the paste button in the toolbar.</p>
  </div>
</template>
