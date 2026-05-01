<script setup>
import { computed, ref } from 'vue';
import RowThumbnail from './RowThumbnail.vue';
import StatusBadge from './StatusBadge.vue';
import HistoryActions from './HistoryActions.vue';
import ThumbnailBackdrop from './ThumbnailBackdrop.vue';
import { api, openContextMenu } from '../store.js';
import { relativeTime, formatSize } from '../utils.js';
import { useNearViewport } from '../visibility.js';

const props = defineProps({ item: { type: Object, required: true } });

// A finished history row should look identical to the job-row at the
// instant it completed — same blurred colour backdrop, fully revealed.
// Without this, swapping JobRow→HistoryRow caused a visible opacity dip.
const showsBackdrop = computed(() => props.item.status === 'finished');
const cardStyle = { '--progress': '100%' };

// History can grow large; each finished row's backdrop is three blurred
// GPU layers. Defer mounting them until the row enters the viewport so
// scrolling a long history isn't fighting hundreds of compositor layers.
const cardEl = ref(null);
const inView = useNearViewport(cardEl);

const showError = computed(() =>
  (props.item.status === 'failed' || props.item.status === 'cancelled') && !!props.item.errorMessage
);

function openMenu(e) {
  const item = props.item;
  const items = [];
  if (item.filePath) {
    items.push({ label: 'Reveal in Finder', onClick: () => api.revealInFinder(item.filePath) });
    items.push({ label: 'Open', onClick: () => api.openFile(item.filePath) });
    items.push({ separator: true });
  }
  items.push({ label: 'Copy URL', onClick: () => api.writeClipboard(item.url) });
  if (item.filePath) {
    items.push({ label: 'Copy file path', onClick: () => api.writeClipboard(item.filePath) });
  }
  if (item.errorMessage) {
    items.push({
      label: 'Copy error',
      onClick: () => api.writeClipboard(item.consoleLog || item.errorMessage),
    });
  }
  items.push({ label: 'Download again', onClick: () => api.retry(item.id) });
  items.push({ separator: true });
  items.push({ label: 'Remove from history', destructive: true, onClick: () => api.removeHistory(item.id) });
  openContextMenu(e, items);
}
</script>

<template>
  <div
    ref="cardEl"
    class="row-card"
    :class="{ 'has-artwork': showsBackdrop, 'job-finished': showsBackdrop }"
    :style="cardStyle"
    @contextmenu.prevent="openMenu"
  >
    <ThumbnailBackdrop v-if="showsBackdrop && inView" :thumbnail-url="item.thumbnailURL" />
    <RowThumbnail :thumbnail-url="item.thumbnailURL" :mode="item.mode" />
    <div class="row-body">
      <div class="row-title">{{ item.title || item.url }}</div>
      <div v-if="item.uploader" class="uploader row-sub">{{ item.uploader }}</div>
      <div class="row-sub">
        <StatusBadge :status="item.status" />
        <span>{{ relativeTime(item.completedAt) }}</span>
        <template v-if="item.fileSizeBytes">
          <span class="dot">·</span>
          <span>{{ formatSize(item.fileSizeBytes) }}</span>
        </template>
      </div>
      <div v-if="showError" class="row-sub error-line" :title="item.errorMessage">
        <span class="error">{{ item.errorMessage }}</span>
      </div>
    </div>
    <HistoryActions :item="item" @open-menu="openMenu" />
  </div>
</template>
