<script setup>
import { computed } from 'vue';
import ThumbnailBackdrop from './ThumbnailBackdrop.vue';
import RowThumbnail from './RowThumbnail.vue';
import StatusBadge from './StatusBadge.vue';
import JobSubline from './JobSubline.vue';
import JobActions from './JobActions.vue';
import { jobPhase, progressValue } from '../utils.js';

const props = defineProps({ job: { type: Object, required: true } });

const phase = computed(() => jobPhase(props.job));
const showsBackdrop = computed(() =>
  ['pending', 'downloading', 'merging'].includes(phase.value)
);
const cardStyle = computed(() => ({
  '--progress': `${Math.round(progressValue(props.job) * 100)}%`,
}));
</script>

<template>
  <div
    class="row-card"
    :class="[`job-${phase}`, { 'has-artwork': showsBackdrop }]"
    :data-job-id="job.id"
    :data-phase="phase"
    :style="cardStyle"
  >
    <ThumbnailBackdrop v-if="showsBackdrop" :thumbnail-url="job.thumbnailURL" />
    <RowThumbnail :thumbnail-url="job.thumbnailURL" :mode="job.options.mode" />
    <div class="row-body">
      <div class="row-title">{{ job.title || job.url }}</div>
      <div class="row-sub">
        <StatusBadge :status="job.status" />
        <JobSubline :job="job" />
      </div>
    </div>
    <JobActions :job="job" />
  </div>
</template>
