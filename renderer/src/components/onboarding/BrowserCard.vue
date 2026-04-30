<script setup>
import BrowserIcon from './BrowserIcon.vue';

defineProps({
  browser: { type: Object, required: true },
  selected: Boolean,
});
defineEmits(['select']);
</script>

<template>
  <div class="browser-card" :class="{ selected }" @click="$emit('select')">
    <div class="browser-ico">
      <BrowserIcon :id="browser.id" :size="36" />
    </div>
    <div class="name">{{ browser.label }}</div>
  </div>
</template>
