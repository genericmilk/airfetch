<script setup>
import { computed } from 'vue';
import SheetBackdrop from '../SheetBackdrop.vue';
import IconBtn from '../IconBtn.vue';
import SettingsTabs from './SettingsTabs.vue';
import GeneralPane from './GeneralPane.vue';
import CookiesPane from './CookiesPane.vue';
import FormatPane from './FormatPane.vue';
import ProcessingPane from './ProcessingPane.vue';
import NetworkPane from './NetworkPane.vue';
import AboutPane from './AboutPane.vue';
import { ui } from '../../store.js';

const PANES = {
  general: GeneralPane,
  cookies: CookiesPane,
  format: FormatPane,
  processing: ProcessingPane,
  network: NetworkPane,
  about: AboutPane,
};

const ActivePane = computed(() => PANES[ui.activeTab] || GeneralPane);
</script>

<template>
  <div v-if="ui.settingsOpen" class="sheet">
    <SheetBackdrop />
    <div class="sheet-card settings-card">
      <header class="settings-header">
        <SettingsTabs :active="ui.activeTab" @change="ui.activeTab = $event" />
        <IconBtn icon="x" small plain title="Close (Esc)" @click="ui.settingsOpen = false" />
      </header>
      <div class="settings-body">
        <component :is="ActivePane" />
      </div>
    </div>
  </div>
</template>
