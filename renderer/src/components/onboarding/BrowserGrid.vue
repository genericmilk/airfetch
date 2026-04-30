<script setup>
import { computed } from 'vue';
import BrowserCard from './BrowserCard.vue';
import { state, ui } from '../../store.js';
import { SELECTABLE_BROWSERS } from '../../constants.js';

const browsers = computed(() => SELECTABLE_BROWSERS.map(id =>
  state.browsers.find(b => b.id === id) || { id, label: id }
));

function select(id) { ui.onboardingSelection = id; }
</script>

<template>
  <div id="browser-grid" class="browser-grid">
    <BrowserCard
      v-for="b in browsers"
      :key="b.id"
      :browser="b"
      :selected="ui.onboardingSelection === b.id"
      @select="select(b.id)"
    />
  </div>
</template>
