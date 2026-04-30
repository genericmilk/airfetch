<script setup>
import { computed } from 'vue';
import SettingsRow from './SettingsRow.vue';
import Toggle from '../Toggle.vue';
import { bindDefault } from '../../bindings.js';
import { state } from '../../store.js';

const writeSubtitles = bindDefault('writeSubtitles');
const autoSubtitles = bindDefault('autoSubtitles');
const embedSubtitles = bindDefault('embedSubtitles');
const subtitleLanguages = bindDefault('subtitleLanguages');
const embedThumbnail = bindDefault('embedThumbnail');
const embedMetadata = bindDefault('embedMetadata');
const embedChapters = bindDefault('embedChapters');
const sponsorBlockRemove = bindDefault('sponsorBlockRemove');
const splitByChapters = bindDefault('splitByChapters');
const writeThumbnail = bindDefault('writeThumbnail');
const writeDescription = bindDefault('writeDescription');
const writeInfoJSON = bindDefault('writeInfoJSON');

const subsLangsDisabled = computed(() => {
  const d = state.prefs.defaults;
  return !(d.writeSubtitles || d.autoSubtitles || d.embedSubtitles);
});
</script>

<template>
  <section>
    <h3>Subtitles</h3>
    <SettingsRow><Toggle v-model="writeSubtitles" label="Write subtitle files" /></SettingsRow>
    <SettingsRow><Toggle v-model="autoSubtitles" label="Include auto-generated" /></SettingsRow>
    <SettingsRow><Toggle v-model="embedSubtitles" label="Embed into video" /></SettingsRow>
    <SettingsRow label="Languages">
      <input v-model="subtitleLanguages" type="text" placeholder="en,en-US,fr" :disabled="subsLangsDisabled" />
    </SettingsRow>

    <h3>Metadata</h3>
    <SettingsRow><Toggle v-model="embedThumbnail" label="Embed thumbnail" /></SettingsRow>
    <SettingsRow><Toggle v-model="embedMetadata" label="Embed metadata" /></SettingsRow>
    <SettingsRow><Toggle v-model="embedChapters" label="Embed chapter markers" /></SettingsRow>
    <SettingsRow><Toggle v-model="sponsorBlockRemove" label="Remove sponsors (SponsorBlock)" /></SettingsRow>
    <SettingsRow><Toggle v-model="splitByChapters" label="Split output by chapters" /></SettingsRow>

    <h3>Save alongside</h3>
    <SettingsRow><Toggle v-model="writeThumbnail" label="Keep raw thumbnail file" /></SettingsRow>
    <SettingsRow><Toggle v-model="writeDescription" label="Save description" /></SettingsRow>
    <SettingsRow><Toggle v-model="writeInfoJSON" label="Save .info.json" /></SettingsRow>
  </section>
</template>
