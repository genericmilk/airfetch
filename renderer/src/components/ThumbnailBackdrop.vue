<script setup>
import { computed } from 'vue';

const props = defineProps({
  thumbnailUrl: { type: String, default: null },
});

const layerStyle = computed(() => (
  props.thumbnailUrl ? { backgroundImage: `url('${props.thumbnailUrl}')` } : null
));
const fallback = computed(() => !props.thumbnailUrl);
</script>

<template>
  <div class="backdrop backdrop-grey" :class="{ 'backdrop-fallback': fallback }" :style="layerStyle" />
  <div class="backdrop backdrop-color" :class="{ 'backdrop-fallback': fallback }" :style="layerStyle" />
  <div class="backdrop backdrop-pill" :class="{ 'backdrop-fallback': fallback }" :style="layerStyle" />
</template>
