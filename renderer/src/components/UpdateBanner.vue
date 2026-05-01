<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';
import IconBtn from './IconBtn.vue';
import { state, api } from '../store.js';

const show = computed(() =>
  state.appUpdate?.status === 'available' && !state.appUpdate?.dismissed
);
const latest = computed(() => state.appUpdate?.latestVersion || '');
</script>

<template>
  <div v-if="show" id="update-banner">
    <span class="inline-icon"><Icon name="download" /></span>
    <div class="update-body">
      <div class="update-title">Airfetch v{{ latest }} is available</div>
      <div class="update-sub">A new version is ready to install.</div>
    </div>
    <button class="primary small" @click="api.openReleasePage()">Install now</button>
    <IconBtn icon="x" small plain title="Dismiss" @click="api.dismissAppUpdate()" />
  </div>
</template>
