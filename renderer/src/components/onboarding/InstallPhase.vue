<script setup>
import { watchEffect } from 'vue';
import InstallStatus from './InstallStatus.vue';
import { state, ui, api } from '../../store.js';
import appIcon from '../../assets/app-icon.png';

const emit = defineEmits(['continue']);

// Auto-kick install whenever install phase is showing without a managed
// binary, mirroring the Swift OnboardingView.onAppear behaviour.
watchEffect(() => {
  if (ui.onboardingPhase !== 'install') return;
  if (state.ytdlpManagedInstalled) return;
  if (state.upgradeState.status !== 'idle') return;
  if (ui.installKicked) return;
  ui.installKicked = true;
  api.install();
});
</script>

<template>
  <section id="install-phase">
    <div class="onboard-hero">
      <img class="app-icon" :src="appIcon" alt="" aria-hidden="true" />
      <h1>Setting up the Downloader Engine</h1>
    </div>
    <InstallStatus />
    <footer class="sheet-footer">
      <button class="primary" :disabled="!state.ytdlpManagedInstalled" @click="emit('continue')">
        Continue
      </button>
    </footer>
  </section>
</template>
