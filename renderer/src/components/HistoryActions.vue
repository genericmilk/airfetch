<script setup>
import IconBtn from './IconBtn.vue';
import { api, openContextMenu } from '../store.js';

const props = defineProps({ item: { type: Object, required: true } });
const emit = defineEmits(['openMenu']);

function reveal() { if (props.item.filePath) api.revealInFinder(props.item.filePath); }
function open() { if (props.item.filePath) api.openFile(props.item.filePath); }
function menu(e) { emit('openMenu', e); }
</script>

<template>
  <div class="row-actions" @click.stop>
    <IconBtn v-if="item.filePath" icon="folder" small title="Reveal in Finder" @click="reveal" />
    <IconBtn v-if="item.filePath" icon="play" small title="Open" @click="open" />
    <IconBtn icon="more" small title="More" @click="menu" />
  </div>
</template>
