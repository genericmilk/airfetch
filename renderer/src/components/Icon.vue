<script setup>
import { computed } from 'vue';
import { ICONS } from '../icons.js';

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 16 },
  stroke: { type: Number, default: 1.8 },
});

const body = computed(() => ICONS[props.name] || '');
</script>

<template>
  <svg
    class="ico"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="body"
  />
</template>
