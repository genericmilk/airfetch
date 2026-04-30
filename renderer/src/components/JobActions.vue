<script setup>
import IconBtn from './IconBtn.vue';
import { api, isTerminal } from '../store.js';

const props = defineProps({ job: { type: Object, required: true } });
</script>

<template>
  <div v-if="!isTerminal(job.status)" class="row-actions" :data-status="job.status">
    <IconBtn
      v-if="job.status === 'paused'"
      icon="play"
      small
      title="Resume download"
      class="resume"
      @click="api.resume(job.id)"
    />
    <IconBtn
      v-else
      icon="pause"
      small
      title="Pause download"
      class="pause"
      @click="api.pause(job.id)"
    />
    <IconBtn
      icon="stop"
      small
      title="Cancel download"
      class="cancel"
      @click="api.cancel(job.id)"
    />
  </div>
</template>
