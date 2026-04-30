<script setup>
import { computed } from 'vue';
import Icon from '../Icon.vue';
import { state, ui, api } from '../../store.js';

const upgrade = computed(() => state.upgradeState);
const showSuccess = computed(() =>
  upgrade.value.status === 'success' ||
  (state.ytdlpManagedInstalled && upgrade.value.status === 'idle')
);

async function tryAgain() {
  ui.installKicked = false;
  await api.resetUpgradeState();
}
</script>

<template>
  <div class="install-status" :class="{ error: upgrade.status === 'failed' }">
    <template v-if="upgrade.status === 'running'">
      <div class="big">Installing Downloader Engine</div>
      <div class="progress">
        <div :style="{ width: Math.round((upgrade.progress || 0) * 100) + '%' }"></div>
      </div>
      <div class="label">{{ upgrade.output || '…' }}</div>
    </template>

    <template v-else-if="showSuccess">
      <div class="status-check"><Icon name="check" :size="44" :stroke="2.4" /></div>
      <div class="big">Downloader Engine {{ state.ytdlpVersion || '' }} installed</div>
      <div class="label">Airfetch will use this engine for all downloads.</div>
    </template>

    <template v-else-if="upgrade.status === 'failed'">
      <div class="status-warn"><Icon name="warn" :size="44" :stroke="2.2" /></div>
      <div class="big">Download failed</div>
      <div class="message">{{ upgrade.output || 'Unknown error' }}</div>
      <button @click="tryAgain">Try again</button>
    </template>

    <template v-else>
      <div class="spinner"></div>
      <div class="label">Preparing…</div>
    </template>
  </div>
</template>
