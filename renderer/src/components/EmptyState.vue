<script setup>
import Icon from './Icon.vue';
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon"><Icon name="download" :size="48" /></div>
    <h3>No downloads yet</h3>
    <p>Copy a video URL, then press ⌘V or click the paste button in the toolbar.</p>
  </div>
</template>
