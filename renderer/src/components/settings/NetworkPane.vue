<script setup>
import SettingsRow from './SettingsRow.vue';
import { bindDefault } from '../../bindings.js';
import { clamp } from '../../utils.js';

const concurrent = bindDefault('concurrentFragments', v => clamp(parseInt(v, 10) || 1, 1, 16));
const rateLimit = bindDefault('rateLimit');
const retries = bindDefault('retries', v => clamp(parseInt(v, 10) || 0, 0, 50));
const proxy = bindDefault('proxy');
const minSize = bindDefault('minFilesize');
const maxSize = bindDefault('maxFilesize');
const dateAfter = bindDefault('dateAfter');
const dateBefore = bindDefault('dateBefore');
const ageLimit = bindDefault('ageLimit');
const limitStart = bindDefault('limitStart');
const limitEnd = bindDefault('limitEnd');
</script>

<template>
  <section>
    <h3>Speed &amp; reliability</h3>
    <SettingsRow label="Concurrent fragments"><input v-model="concurrent" type="number" min="1" max="16" /></SettingsRow>
    <SettingsRow label="Rate limit"><input v-model="rateLimit" type="text" placeholder="4M" /></SettingsRow>
    <SettingsRow label="Retries"><input v-model="retries" type="number" min="0" max="50" /></SettingsRow>
    <SettingsRow label="Proxy"><input v-model="proxy" type="text" placeholder="socks5://user:pass@host:port" /></SettingsRow>

    <h3>Filters</h3>
    <SettingsRow label="Min filesize"><input v-model="minSize" type="text" placeholder="50M" /></SettingsRow>
    <SettingsRow label="Max filesize"><input v-model="maxSize" type="text" placeholder="500M" /></SettingsRow>
    <SettingsRow label="Date after"><input v-model="dateAfter" type="text" placeholder="YYYYMMDD" /></SettingsRow>
    <SettingsRow label="Date before"><input v-model="dateBefore" type="text" placeholder="YYYYMMDD" /></SettingsRow>
    <SettingsRow label="Age limit"><input v-model="ageLimit" type="text" /></SettingsRow>

    <h3>Time range (clip)</h3>
    <SettingsRow label="Start"><input v-model="limitStart" type="text" placeholder="00:01:30" /></SettingsRow>
    <SettingsRow label="End"><input v-model="limitEnd" type="text" placeholder="00:03:00 or inf" /></SettingsRow>
    <p class="hint">Uses <code>--download-sections</code> to download only the specified range.</p>
  </section>
</template>
