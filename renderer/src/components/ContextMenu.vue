<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { ui, closeContextMenu, shouldSuppressOutsideClick } from '../store.js';

const menuEl = ref(null);
const position = ref({ left: 0, top: 0 });

// Recompute position after the menu paints so we know its real size and
// can clamp it inside the viewport (matches the old DOM-based logic).
watch(() => ui.contextMenu.open, async open => {
  if (!open) return;
  await nextTick();
  const el = menuEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.min(ui.contextMenu.x, vw - rect.width - 8);
  const y = Math.min(ui.contextMenu.y, vh - rect.height - 8);
  position.value = { left: Math.max(4, x), top: Math.max(4, y) };
});

function onItemClick(item) {
  if (item.disabled) return;
  item.onClick?.();
  closeContextMenu();
}

function onWindowClick(e) {
  if (!ui.contextMenu.open) return;
  if (shouldSuppressOutsideClick()) return;
  if (menuEl.value && menuEl.value.contains(e.target)) return;
  closeContextMenu();
}

window.addEventListener('click', onWindowClick);
</script>

<template>
  <div
    v-show="ui.contextMenu.open"
    ref="menuEl"
    class="context-menu"
    :style="{ left: position.left + 'px', top: position.top + 'px' }"
  >
    <template v-for="(item, i) in ui.contextMenu.items" :key="i">
      <hr v-if="item.separator" />
      <button
        v-else
        :class="{ destructive: item.destructive }"
        :disabled="item.disabled"
        @click="onItemClick(item)"
      >
        {{ item.label }}
      </button>
    </template>
  </div>
</template>
