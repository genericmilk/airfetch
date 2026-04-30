<script setup>
import Icon from '../Icon.vue';

defineProps({ active: { type: String, required: true } });
defineEmits(['change']);

const TABS = [
  { id: 'general', label: 'General', icon: 'gear' },
  { id: 'cookies', label: 'Cookies', icon: 'key' },
  { id: 'format', label: 'Format', icon: 'film' },
  { id: 'processing', label: 'Processing', icon: 'tag' },
  { id: 'network', label: 'Network', icon: 'globe' },
  { id: 'about', label: 'About', icon: 'info' },
];
</script>

<template>
  <div class="tabs">
    <button
      v-for="t in TABS"
      :key="t.id"
      :class="{ active: active === t.id }"
      @click="$emit('change', t.id)"
    >
      <span class="ico-slot"><Icon :name="t.icon" /></span>
      <span>{{ t.label }}</span>
    </button>
  </div>
</template>
