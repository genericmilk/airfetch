<script setup>
import { state } from '../../store.js';
import appIcon from '../../assets/app-icon.png';
</script>

<template>
  <section>
    <div class="about">
      <img class="app-icon" :src="appIcon" alt="" aria-hidden="true" />
      <h1>Airfetch</h1>
      <p class="hint">Cross-platform Electron port — yt-dlp front-end.</p>
      <div class="kv"><span>Engine</span><code>{{ state.ytdlpPath || '—' }}</code></div>
      <div class="kv"><span>Version</span><code>{{ state.ytdlpVersion || '—' }}</code></div>
      <div class="kv"><span>Data</span><code>Application data in userData dir</code></div>
      <div class="kv"><span>Platform</span><code>{{ state.platform }} · electron</code></div>
    </div>
  </section>
</template>
