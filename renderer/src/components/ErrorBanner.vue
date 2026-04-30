<script setup>
import Icon from './Icon.vue';
import IconBtn from './IconBtn.vue';
import { state, api } from '../store.js';
</script>

<template>
  <div v-if="state.launchError" id="error-banner">
    <span class="inline-icon warn"><Icon name="warn" /></span>
    <div class="error-body">
      <div>{{ state.launchError }}</div>
    </div>
    <IconBtn icon="x" small plain @click="api.dismissLaunchError()" />
  </div>
</template>
