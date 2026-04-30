<script setup>
defineProps({
  modelValue: Boolean,
  label: { type: String, required: true },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <label class="toggle">
    <input
      type="checkbox"
      :checked="modelValue"
      @change="$emit('update:modelValue', $event.target.checked)"
    />
    {{ label }}
  </label>
</template>
