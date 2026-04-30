<script setup>
defineProps({ title: { type: String, required: true }, count: Number });
</script>

<template>
  <div class="section-header">
    <h3>{{ title }}</h3>
    <span v-if="count != null" class="count">{{ count }}</span>
  </div>
</template>
