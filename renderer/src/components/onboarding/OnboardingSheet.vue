<script setup>
import { computed, watch } from 'vue';
import SheetBackdrop from '../SheetBackdrop.vue';
import InstallPhase from './InstallPhase.vue';
import BrowserPhase from './BrowserPhase.vue';
import { state, ui } from '../../store.js';

const visible = computed(() => !state.prefs.onboardingCompleted);

// First time the sheet shows, decide which phase based on whether the
// managed copy is present, mirroring the Swift onboarding bootstrapping.
watch(visible, show => {
  if (!show) {
    ui.onboardingInitialised = false;
    ui.installKicked = false;
    return;
  }
  if (ui.onboardingInitialised) return;
  ui.onboardingInitialised = true;
  ui.onboardingPhase = state.ytdlpManagedInstalled ? 'browser' : 'install';
  if (!ui.onboardingSelection) {
    ui.onboardingSelection = state.prefs.cookiesBrowser || null;
  }
}, { immediate: true });
</script>

<template>
  <div v-if="visible" class="sheet">
    <SheetBackdrop />
    <div class="sheet-card onboarding-card">
      <InstallPhase
        v-if="ui.onboardingPhase === 'install'"
        @continue="ui.onboardingPhase = 'browser'"
      />
      <BrowserPhase v-else />
    </div>
  </div>
</template>
