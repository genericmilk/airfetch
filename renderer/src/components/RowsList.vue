<script setup>
import { computed } from 'vue';
import JobRow from './JobRow.vue';
import HistoryRow from './HistoryRow.vue';
import { activeJobs, filteredHistory, ui } from '../store.js';

const showNoSearchResults = computed(() =>
  ui.searchText && filteredHistory.value.length === 0 && activeJobs.value.length === 0
);
</script>

<template>
  <div class="rows">
    <JobRow v-for="job in activeJobs" :key="job.id" :job="job" />

    <HistoryRow
      v-for="item in filteredHistory"
      :key="item.id"
      :item="item"
    />

    <div v-if="showNoSearchResults" class="empty-state">
      <h3>No results for "{{ ui.searchText }}"</h3>
    </div>
  </div>
</template>
