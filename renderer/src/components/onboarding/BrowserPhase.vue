<script setup>
import { computed } from 'vue';
import BrowserGrid from './BrowserGrid.vue';
import { state, ui, api } from '../../store.js';
import appIcon from '../../assets/app-icon.png';

const selectedLabel = computed(() => {
  const meta = state.browsers.find(b => b.id === ui.onboardingSelection);
  return meta ? `Using ${meta.label}` : 'Select a browser above';
});

function finish() {
  if (!ui.onboardingSelection) return;
  api.setPrefs({
    cookiesBrowser: ui.onboardingSelection,
    cookiesProfile: ui.onboardingCustomPath || '',
    onboardingCompleted: true,
  });
}
</script>

<template>
  <section id="browser-phase">
    <div class="onboard-hero">
      <img class="app-icon" :src="appIcon" alt="" aria-hidden="true" />
      <h1>Welcome to Airfetch</h1>
      <p>Pick the browser you're signed in with. Airfetch uses its cookies so logged-in videos download without friction.</p>
    </div>
    <BrowserGrid />
    <footer class="sheet-footer">
      <div class="footer-status">{{ selectedLabel }}</div>
      <button class="primary" :disabled="!ui.onboardingSelection" @click="finish">
        Continue
      </button>
    </footer>
  </section>
</template>
