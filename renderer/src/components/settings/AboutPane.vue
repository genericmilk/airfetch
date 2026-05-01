<script setup>
import { computed } from 'vue';
import { state, api } from '../../store.js';
import appIcon from '../../assets/app-icon.png';

const upd = computed(() => state.appUpdate || {});
const checking = computed(() => upd.value.status === 'checking');
const available = computed(() => upd.value.status === 'available');
const upToDate = computed(() => upd.value.status === 'up-to-date');
const errored = computed(() => upd.value.status === 'error');

const statusLabel = computed(() => {
  if (checking.value) return 'Checking…';
  if (available.value) return `New version v${upd.value.latestVersion} available`;
  if (upToDate.value) return `You're on the latest version`;
  if (errored.value) return `Couldn't check: ${upd.value.error}`;
  return '';
});

</script>

<template>
  <section>
    <div class="about">
      <img class="app-icon" :src="appIcon" alt="" aria-hidden="true" />
      <h1>Airfetch</h1>
      <p class="hint">Cross-platform video & audio downloader.</p>
      <div class="kv"><span>App version</span><code>{{ upd.currentVersion || '—' }}</code></div>
      <div class="kv"><span>Engine</span><code>{{ state.ytdlpPath || '—' }}</code></div>
      <div class="kv"><span>Engine version</span><code>{{ state.ytdlpVersion || '—' }}</code></div>
      <div class="kv"><span>Platform</span><code>{{ state.platform }}</code></div>

      <div class="update-row">
        <button :disabled="checking" @click="api.checkAppUpdate()">
          {{ checking ? 'Checking…' : 'Check for updates' }}
        </button>
        <button v-if="available" class="primary" @click="api.openReleasePage()">
          Download v{{ upd.latestVersion }}
        </button>
        <span
          v-if="statusLabel"
          class="update-status"
          :class="{ 'is-available': available, 'is-error': errored }"
        >{{ statusLabel }}</span>
      </div>

    </div>
  </section>
</template>
