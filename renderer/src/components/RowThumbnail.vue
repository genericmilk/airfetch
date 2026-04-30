<script setup>
import { ref, watch } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  thumbnailUrl: { type: String, default: null },
  mode: { type: String, default: 'video' },
});

const broken = ref(false);
watch(() => props.thumbnailUrl, () => { broken.value = false; });
</script>

<template>
  <div class="thumb">
    <img
      v-if="thumbnailUrl && !broken"
      :src="thumbnailUrl"
      alt=""
      @error="broken = true"
    />
    <Icon v-else :name="mode === 'audio' ? 'music' : 'film'" :size="28" />
  </div>
</template>
