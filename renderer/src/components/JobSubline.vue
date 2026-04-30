<script setup>
import { computed } from 'vue';
import { preDownloadStatus } from '../utils.js';

const props = defineProps({ job: { type: Object, required: true } });

const hasProgress = computed(() =>
  props.job.percent > 0 || (props.job.speed && props.job.speed !== '—')
);
const playlistLabel = computed(() => {
  if (!props.job.isPlaylist) return '';
  const i = props.job.playlistIndex || 0;
  const n = props.job.playlistCount || 0;
  if (i && n) return `Item ${i} of ${n}`;
  if (i) return `Item ${i}`;
  return 'Playlist';
});
</script>

<template>
  <template v-if="job.status === 'paused'">
    <template v-if="playlistLabel">
      <span>{{ playlistLabel }}</span>
      <span class="dot">·</span>
    </template>
    <span v-if="job.percent > 0">{{ Math.round(job.percent) }}%</span>
    <span v-if="job.percent > 0" class="dot">·</span>
    <span>Paused</span>
  </template>

  <template v-else-if="job.status === 'running'">
    <template v-if="playlistLabel">
      <span>{{ playlistLabel }}</span>
      <span class="dot">·</span>
    </template>
    <template v-if="hasProgress">
      <span>{{ Math.round(job.percent) }}%</span>
      <span class="dot">·</span>
      <span>{{ job.speed || '—' }}</span>
      <span class="dot">·</span>
      <span>ETA {{ job.eta || '—' }}</span>
    </template>
    <span v-else class="log">{{ preDownloadStatus(job) }}</span>
  </template>

  <span v-else-if="job.status === 'merging'" class="log">
    {{ job.lastLog || 'Processing file…' }}
  </span>

  <span v-else-if="job.status === 'queued' && job.lastLog" class="log">
    {{ job.lastLog }}
  </span>

  <span v-else-if="job.errorMessage" class="error">{{ job.errorMessage }}</span>
</template>
