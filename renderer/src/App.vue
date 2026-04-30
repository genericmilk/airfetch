<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue';
import ToolBar from './components/ToolBar.vue';
import ErrorBanner from './components/ErrorBanner.vue';
import HistoryHeader from './components/HistoryHeader.vue';
import RowsList from './components/RowsList.vue';
import EmptyState from './components/EmptyState.vue';
import ContextMenu from './components/ContextMenu.vue';
import OnboardingSheet from './components/onboarding/OnboardingSheet.vue';
import SettingsSheet from './components/settings/SettingsSheet.vue';
import { state, ui, api, activeJobs, filteredHistory, closeContextMenu } from './store.js';

const hasAny = computed(() =>
  activeJobs.value.length > 0 || filteredHistory.value.length > 0
);

async function pasteAndDownload() {
  const text = await api.readClipboard();
  if (!text) return;
  const urls = text.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
  if (urls.length === 0) return;
  await api.startMultiple(urls);
}

function onKeyDown(e) {
  const cmd = e.metaKey || e.ctrlKey;
  if (cmd && e.key.toLowerCase() === 'v') {
    const t = e.target;
    if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable)) {
      e.preventDefault();
      pasteAndDownload();
    }
  }
  if (cmd && e.key === ',') {
    e.preventDefault();
    ui.settingsOpen = true;
  }
  if (e.key === 'Escape') {
    if (ui.settingsOpen) ui.settingsOpen = false;
    closeContextMenu();
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
</script>

<template>
  <div>
    <ToolBar />
    <main id="page">
      <ErrorBanner />
      <HistoryHeader v-if="hasAny" />
      <RowsList v-if="hasAny" />
      <EmptyState v-else />
    </main>
    <OnboardingSheet />
    <SettingsSheet />
    <ContextMenu />
  </div>
</template>
