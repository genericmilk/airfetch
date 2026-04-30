<script setup>
defineProps({ label: { type: String, default: '' } });
</script>

<template>
  <div class="row">
    <label>{{ label }}</label>
    <slot />
  </div>
</template>
