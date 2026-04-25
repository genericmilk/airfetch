// Inline SVG icons — stroke-based, sized via CSS. Each SVG uses
// currentColor so the surrounding text colour drives it.

const base = (body, { size = 16, stroke = 1.8 } = {}) =>
  `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
  `fill="none" stroke="currentColor" stroke-width="${stroke}" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  plus:     '<path d="M12 5v14M5 12h14"/>',
  folder:   '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  gear:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  film:     '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  music:    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  search:   '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  filter:   '<path d="M3 5h18M6 12h12M10 19h4"/>',
  more:     '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  x:        '<path d="M6 6l12 12M18 6L6 18"/>',
  warn:     '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  download: '<path d="M12 3v13M7 11l5 5 5-5M5 21h14"/>',
  sparkle:  '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"/>',
  key:      '<circle cx="8" cy="14" r="4"/><path d="m11 11 10-10M18 4l2 2M15 7l2 2"/>',
  tag:      '<path d="M20 11.5 12.5 4H4v8.5L11.5 20a2 2 0 0 0 2.8 0l5.7-5.7a2 2 0 0 0 0-2.8z"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/>',
  globe:    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  play:     '<path d="M7 5v14l12-7z" fill="currentColor" stroke="none"/>',
  pause:    '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  stop:     '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  folderOpen: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V7z"/><path d="M3 10h18l-2 8a2 2 0 0 1-2 1.5H5A2 2 0 0 1 3 17V10z"/>',
  copy:     '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:    '<path d="m5 12 5 5 9-11"/>',
  retry:    '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
};

export function icon(name, opts) {
  return base(ICONS[name] || '', opts);
}

/** Replace every element with [data-icon] by injecting its SVG. Idempotent:
 *  on re-run, the previous slot is stripped first. Preserves label spans. */
export function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    // Strip ALL existing slots / stray icons so repeated renders don't stack.
    el.querySelectorAll(':scope > .ico-slot, :scope > .ico').forEach(n => n.remove());
    const wrap = document.createElement('span');
    wrap.className = 'ico-slot';
    wrap.innerHTML = icon(name, sizeFor(el));
    el.prepend(wrap);
  });
}

function sizeFor(el) {
  if (el.classList.contains('big-icon')) return { size: 34, stroke: 1.8 };
  if (el.classList.contains('status-check')) return { size: 40, stroke: 2 };
  if (el.classList.contains('status-warn')) return { size: 40, stroke: 2 };
  if (el.tagName === 'H1' || el.classList.contains('hero')) return { size: 28 };
  return { size: 16 };
}
