import { createApp, watchEffect } from 'vue';
import App from './App.vue';
import { bootstrap, state } from './store.js';
import '../styles.css';

bootstrap().then(() => {
  // The CSS vibrancy hooks key off body.vibrant — keep it in sync with the
  // platform reported by the main process.
  watchEffect(() => {
    document.body.classList.toggle('vibrant', state.platform === 'darwin');
  });
  createApp(App).mount('#app');
});
