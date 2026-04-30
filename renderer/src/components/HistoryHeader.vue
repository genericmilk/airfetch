<script setup>
import Icon from './Icon.vue';
import IconBtn from './IconBtn.vue';
import { computed } from 'vue';
import { state, ui, api, isTerminal, openContextMenu, filteredHistory, activeJobs } from '../store.js';

const totalCount = computed(() => filteredHistory.value.length + activeJobs.value.length);

function openMenu(e) {
  const items = [
    {
      label: 'Clear history',
      destructive: true,
      disabled: (state.history || []).length === 0,
      onClick: () => api.clearHistory(),
    },
    {
      label: 'Remove finished jobs',
      disabled: !(state.jobs || []).some(j => isTerminal(j.status)),
      onClick: () => api.clearFinishedJobs(),
    },
  ];
  // Position relative to the button — context menu positions to clientX/Y.
  const rect = e.currentTarget.getBoundingClientRect();
  openContextMenu({ clientX: rect.right - 180, clientY: rect.bottom + 4 }, items);
}
</script>

<template>
  <div id="history-header">
    <div class="title-row">
      <h2>History</h2>
      <span class="count">{{ totalCount }}</span>
    </div>
    <div class="history-controls">
      <div class="search">
        <span class="inline-icon"><Icon name="search" /></span>
        <input v-model="ui.searchText" type="text" placeholder="Search" />
      </div>
      <IconBtn icon="more" small title="More" @click="openMenu" />
    </div>
  </div>
</template>
