<script setup>
// Real branded browser icons. PNGs are bundled per-id so Vite hashes
// and emits them; an unknown id renders nothing (the slot collapses).

const ICONS = import.meta.glob('../../assets/browsers/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
});

const SRC = Object.fromEntries(
  Object.entries(ICONS).map(([path, url]) => [
    path.match(/([^/]+)\.png$/)[1],
    url,
  ]),
);

defineProps({
  id: { type: String, required: true },
  size: { type: Number, default: 32 },
});
</script>

<template>
  <img
    v-if="SRC[id]"
    class="browser-svg"
    :src="SRC[id]"
    :width="size"
    :height="size"
    alt=""
    aria-hidden="true"
  />
</template>
