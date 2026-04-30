<script setup>
import Icon from './Icon.vue';

defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true },
  small: Boolean,
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="segmented" :class="{ small }">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="icon-only"
      :class="{ active: modelValue === opt.value }"
      :title="opt.label"
      @click="$emit('update:modelValue', opt.value)"
    >
      <Icon v-if="opt.icon" :name="opt.icon" />
    </button>
  </div>
</template>
