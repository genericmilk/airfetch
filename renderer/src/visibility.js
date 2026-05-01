// Lazy-render helper for long row lists. Each .row-card stacks up to
// three absolutely-positioned, heavily-blurred backdrop layers — every
// one becomes its own GPU compositor layer because of `will-change:
// transform`. With 100+ rows on screen, that's 300+ layers fighting for
// the compositor and scroll dies. We defer mounting those backdrop
// layers until the row is near the viewport, then leave them mounted so
// scrolling back doesn't pop them out.
//
// All rows share one IntersectionObserver — IO scales well with many
// targets but creating 100 instances of it does not.

import { ref, onMounted, onBeforeUnmount } from 'vue';

const ROOT_MARGIN = '400px'; // pre-mount one viewport ahead/behind
const callbacks = new WeakMap(); // Element → onIntersect()
let observer = null;

function getObserver() {
  if (observer) return observer;
  if (typeof IntersectionObserver === 'undefined') return null;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const cb = callbacks.get(entry.target);
      if (!cb) continue;
      cb();
      observer.unobserve(entry.target);
      callbacks.delete(entry.target);
    }
  }, { rootMargin: ROOT_MARGIN, threshold: 0 });
  return observer;
}

export function useNearViewport(elRef) {
  const inView = ref(false);
  onMounted(() => {
    const obs = getObserver();
    const el = elRef.value;
    if (!obs || !el) { inView.value = true; return; }
    callbacks.set(el, () => { inView.value = true; });
    obs.observe(el);
  });
  onBeforeUnmount(() => {
    const el = elRef.value;
    if (observer && el) {
      observer.unobserve(el);
      callbacks.delete(el);
    }
  });
  return inView;
}
