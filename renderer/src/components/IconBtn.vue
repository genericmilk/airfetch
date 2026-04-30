<script setup>
import Icon from './Icon.vue';

defineProps({
  icon: { type: String, required: true },
  title: { type: String, default: '' },
  small: Boolean,
  plain: Boolean,
  iconSize: { type: Number, default: 16 },
  disabled: Boolean,
});
</script>

<template>
  <button
    class="icon-btn"
    :class="{ small, plain }"
    :title="title"
    :disabled="disabled"
  >
    <span class="ico-slot"><Icon :name="icon" :size="iconSize" /></span>
    <slot />
  </button>
</template>
