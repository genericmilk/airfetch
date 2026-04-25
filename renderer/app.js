// Airfetch renderer — single-file ES module.

import { icon, applyIcons } from './icons.js';

const api = window.airfetch;

// ───────────────────────────────────────────────────────── state ──────────
let state = null;
let ui = {
  searchText: '',
  modeFilter: '',
  settingsOpen: false,
  activeTab: 'general',
  // onboarding: local picks before committing to prefs
  onboardingPhase: 'install',
  onboardingSelection: null,
  onboardingCustomPath: '',
  onboardingInitialised: false,
  installKicked: false,
};

// ───────────────────────────────────────────────────── static data ────────
const VIDEO_QUALITIES = [
  ['best',  'Best available'],
  ['q2160', '2160p (4K)'],
  ['q1440', '1440p (2K)'],
  ['q1080', '1080p (Full HD)'],
  ['q720',  '720p (HD)'],
  ['q480',  '480p'],
  ['q360',  '360p'],
  ['worst', 'Worst (smallest)'],
];
const VIDEO_CONTAINERS = ['mp4', 'mkv', 'webm', 'mov'];
const AUDIO_FORMATS = [
  ['best', 'Best (no re-encode)'],
  ['mp3', 'MP3'], ['m4a', 'M4A'], ['aac', 'AAC'],
  ['opus', 'OPUS'], ['flac', 'FLAC'], ['wav', 'WAV'],
  ['vorbis', 'VORBIS'], ['alac', 'ALAC'],
];
const RECODE_FORMATS = [
  ['none', 'No re-encoding'],
  ['mp4', 'MP4'], ['mkv', 'MKV'], ['mov', 'MOV'],
  ['avi', 'AVI'], ['webm', 'WEBM'], ['flv', 'FLV'], ['gif', 'GIF'],
];
const BROWSER_ICON = {
  safari: 'globe', chrome: 'globe', chromeCanary: 'globe', firefox: 'globe',
  edge: 'globe', brave: 'globe', chromium: 'globe', opera: 'globe', vivaldi: 'globe',
};
const SELECTABLE_BROWSERS = ['safari', 'chrome', 'chromeCanary', 'firefox', 'edge', 'brave', 'vivaldi', 'opera', 'chromium'];
const STATUS_LABELS = {
  queued: 'Queued', running: 'Downloading', merging: 'Processing',
  paused: 'Paused',
  finished: 'Finished', failed: 'Failed', cancelled: 'Cancelled',
};

// ─────────────────────────────────────────────────── bootstrap ────────────
async function init() {
  state = await api.getState();
  api.onState(s => { state = s; render(); });
  wireEvents();
  render();
}

// ────────────────────────────────────────────────── rendering ─────────────
function render() {
  if (!state) return;
  document.body.classList.toggle('vibrant', state.platform === 'darwin');
  renderToolbar();
  renderPage();
  renderOnboarding();
  renderSettings();
  applyIcons(document);
}

function renderToolbar() {
  // Mode segmented picker reflects current default mode
  document.querySelectorAll('#mode-picker button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.prefs.defaults.mode);
  });
  // Disable paste when yt-dlp is missing
  document.getElementById('btn-paste').disabled = !state.ytdlpPath;
}

function renderPage() {
  // Error banner
  const banner = document.getElementById('error-banner');
  if (state.launchError) {
    banner.hidden = false;
    document.getElementById('error-message').textContent = state.launchError;
  } else {
    banner.hidden = true;
  }

  const activeJobs = (state.jobs || []).filter(j => !isTerminal(j.status));
  const history = filteredHistory();
  const hasAny = activeJobs.length > 0 || (state.history || []).length > 0;

  document.getElementById('history-header').hidden = (state.history || []).length === 0;
  document.getElementById('history-count').textContent = String(state.history.length);
  document.getElementById('empty-state').hidden = hasAny;

  const rows = document.getElementById('rows');
  // Collect existing job rows so we can reuse them — otherwise every
  // state broadcast rebuilds the DOM and restarts the ping-pong /
  // colour-wipe keyframes before they can advance, making the
  // animations look frozen.
  const prevJobEls = new Map();
  rows.querySelectorAll('.row-card[data-job-id]').forEach(el => {
    prevJobEls.set(el.getAttribute('data-job-id'), el);
  });
  rows.innerHTML = '';

  if (activeJobs.length > 0) {
    rows.appendChild(sectionHeader('In Progress', activeJobs.length));
    for (const job of activeJobs) {
      const reused = prevJobEls.get(job.id);
      if (reused) {
        // Reuse across phase changes so --progress can transition
        // smoothly out of the pending sweep into the real progress
        // value instead of the DOM being recreated mid-hand-off.
        updateJobRow(reused, job);
        rows.appendChild(reused);
      } else {
        rows.appendChild(renderJob(job));
      }
    }
  }
  if (history.length > 0) {
    for (const item of history) rows.appendChild(renderHistoryItem(item));
  } else if (ui.searchText && activeJobs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<h3>No results for "${escapeHTML(ui.searchText)}"</h3>`;
    rows.appendChild(empty);
  }
}

function sectionHeader(title, count) {
  const el = document.createElement('div');
  el.className = 'section-header';
  el.innerHTML = `<h3>${title}</h3><span class="count">${count}</span>`;
  return el;
}

function filteredHistory() {
  let items = state.history || [];
  if (ui.modeFilter) items = items.filter(i => i.mode === ui.modeFilter);
  const q = ui.searchText.trim().toLowerCase();
  if (q) {
    items = items.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.uploader || '').toLowerCase().includes(q) ||
      (i.url || '').toLowerCase().includes(q)
    );
  }
  return items;
}

function renderJob(job) {
  const el = document.createElement('div');
  const phase = jobPhase(job);
  // Active jobs always get a backdrop — real artwork when available, a
  // gradient fallback otherwise — so the ping-pong / wipe has something
  // to animate regardless of whether the thumbnail metadata has arrived.
  const showsBackdrop = phase === 'pending' || phase === 'downloading' || phase === 'merging';
  el.className = `row-card job-${phase}${showsBackdrop ? ' has-artwork' : ''}`;
  el.dataset.jobId = job.id;
  el.dataset.phase = phase;
  const progress = progressValue(job);
  // --progress drives the feathered left-to-right colour wipe in CSS.
  el.style.setProperty('--progress', `${Math.round(progress * 100)}%`);
  const modeIco = icon(job.options.mode === 'audio' ? 'music' : 'film', { size: 28 });

  el.innerHTML = `
    ${jobBackdropLayers(job.thumbnailURL)}
    <div class="thumb">
      ${job.thumbnailURL ? `<img src="${escapeAttr(job.thumbnailURL)}" alt="">` : modeIco}
    </div>
    <div class="row-body">
      <div class="row-title">${escapeHTML(job.title || job.url)}</div>
      <div class="row-sub">
        <span class="badge ${job.status}">${STATUS_LABELS[job.status]}</span>
        ${jobSubline(job)}
      </div>
    </div>
    <div class="row-actions">
      ${jobActionsHTML(job)}
    </div>
  `;
  const img = el.querySelector('.thumb img');
  if (img) img.addEventListener('error', () => { img.outerHTML = modeIco; }, { once: true });
  wireJobActions(el, job);
  return el;
}

function jobActionsHTML(job) {
  if (isTerminal(job.status)) return '';
  const toggle = job.status === 'paused'
    ? `<button class="resume icon-btn small" title="Resume download" data-icon="play"></button>`
    : `<button class="pause icon-btn small" title="Pause download" data-icon="pause"></button>`;
  return `
    ${toggle}
    <button class="cancel icon-btn small" title="Cancel download" data-icon="stop"></button>
  `;
}

function wireJobActions(el, job) {
  const cancelBtn = el.querySelector('.cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => api.cancel(job.id));
  const pauseBtn = el.querySelector('.pause');
  if (pauseBtn) pauseBtn.addEventListener('click', () => api.pause(job.id));
  const resumeBtn = el.querySelector('.resume');
  if (resumeBtn) resumeBtn.addEventListener('click', () => api.resume(job.id));
}

// Light diff: when a job row is reused across renders, only touch the
// dynamic bits (progress CSS var, subline, title, phase class) so the
// backdrop animations/transitions keep running instead of restarting.
function updateJobRow(el, job) {
  const phase = jobPhase(job);
  // Swap the job-* class only when the phase actually changes, so the
  // transition on --progress can smooth the hand-off from the pending
  // sweep animation to the real download progress value.
  if (el.dataset.phase !== phase) {
    el.classList.remove(`job-${el.dataset.phase}`);
    el.classList.add(`job-${phase}`);
    el.dataset.phase = phase;
  }
  const progress = progressValue(job);
  el.style.setProperty('--progress', `${Math.round(progress * 100)}%`);
  const title = el.querySelector('.row-title');
  if (title) title.textContent = job.title || job.url;
  const sub = el.querySelector('.row-sub');
  if (sub) {
    sub.innerHTML = `
      <span class="badge ${job.status}">${STATUS_LABELS[job.status]}</span>
      ${jobSubline(job)}
    `;
  }
  // Refresh action buttons whenever the status changes — the pause button
  // becomes a resume button on pause, and disappears entirely on terminal.
  const actions = el.querySelector('.row-actions');
  if (actions && actions.dataset.status !== job.status) {
    actions.dataset.status = job.status;
    actions.innerHTML = jobActionsHTML(job);
    wireJobActions(el, job);
  }
  // If the thumbnail resolved mid-flight, swap the backdrop fallback
  // for the real artwork (and the thumb icon for the real <img>).
  const thumb = el.querySelector('.thumb');
  const hasRealImg = thumb && thumb.querySelector('img');
  if (job.thumbnailURL && !hasRealImg) {
    thumb.innerHTML = `<img src="${escapeAttr(job.thumbnailURL)}" alt="">`;
    const modeIco = icon(job.options.mode === 'audio' ? 'music' : 'film', { size: 28 });
    const img = thumb.querySelector('img');
    if (img) img.addEventListener('error', () => { img.outerHTML = modeIco; }, { once: true });
    const url = `url('${escapeAttr(job.thumbnailURL)}')`;
    el.querySelectorAll('.backdrop-grey, .backdrop-color, .backdrop-pill').forEach(layer => {
      layer.classList.remove('backdrop-fallback');
      layer.style.backgroundImage = url;
    });
  }
}

function jobPhase(job) {
  if (job.status === 'merging') return 'merging';
  // Paused jobs share the 'downloading' phase so the wipe stays frozen at
  // the last --progress value instead of falling back to the pending sweep.
  if (job.status === 'paused') return job.percent > 0 ? 'downloading' : 'pending';
  if (job.status === 'running' && job.percent > 0) return 'downloading';
  if (job.status === 'running' || job.status === 'queued') return 'pending';
  return job.status;
}

function jobBackdropLayers(thumb) {
  if (thumb) {
    const url = `url('${escapeAttr(thumb)}')`;
    return `
      <div class="backdrop backdrop-grey" style="background-image:${url}"></div>
      <div class="backdrop backdrop-color" style="background-image:${url}"></div>
      <div class="backdrop backdrop-pill" style="background-image:${url}"></div>
    `;
  }
  // No thumbnail yet — CSS paints a gradient fallback so ping-pong / wipe
  // still have something to animate.
  return `
    <div class="backdrop backdrop-grey backdrop-fallback"></div>
    <div class="backdrop backdrop-color backdrop-fallback"></div>
    <div class="backdrop backdrop-pill backdrop-fallback"></div>
  `;
}

function jobSubline(job) {
  if (job.status === 'paused') {
    return job.percent > 0
      ? `<span>${Math.round(job.percent)}%</span><span class="dot">·</span><span>Paused</span>`
      : `<span>Paused</span>`;
  }
  if (job.status === 'running') {
    const hasProgress = job.percent > 0 || (job.speed && job.speed !== '—');
    if (hasProgress) {
      return `
        <span>${Math.round(job.percent)}%</span>
        <span class="dot">·</span>
        <span>${escapeHTML(job.speed || '—')}</span>
        <span class="dot">·</span>
        <span>ETA ${escapeHTML(job.eta || '—')}</span>
      `;
    }
    return `<span class="log">${escapeHTML(preDownloadStatus(job))}</span>`;
  }
  if (job.status === 'merging') {
    return `<span class="log">${escapeHTML(job.lastLog || 'Processing file…')}</span>`;
  }
  if (job.status === 'queued' && job.lastLog) {
    return `<span class="log">${escapeHTML(job.lastLog)}</span>`;
  }
  if (job.errorMessage) {
    return `<span class="error">${escapeHTML(job.errorMessage)}</span>`;
  }
  return '';
}

function preDownloadStatus(job) {
  const log = (job.lastLog || '').trim();
  if (!log) return 'Preparing…';
  if (log.toLowerCase().includes('cookies are no longer valid')) {
    return 'Browser cookies rejected — trying anyway…';
  }
  return log;
}

function progressValue(job) {
  if (job.status === 'finished') return 1;
  if (job.status === 'failed' || job.status === 'cancelled') return 0;
  if (job.status === 'merging') return Math.max(job.percent / 100, 0.99);
  return (job.percent || 0) / 100;
}

function renderHistoryItem(item) {
  const el = document.createElement('div');
  el.className = 'row-card';
  const modeIco = icon(item.mode === 'audio' ? 'music' : 'film', { size: 28 });

  el.innerHTML = `
    ${backdropHTML(item.thumbnailURL)}
    <div class="thumb">
      ${item.thumbnailURL ? `<img src="${escapeAttr(item.thumbnailURL)}" alt="">` : modeIco}
    </div>
    <div class="row-body">
      <div class="row-title">${escapeHTML(item.title || item.url)}</div>
      ${item.uploader ? `<div class="uploader row-sub">${escapeHTML(item.uploader)}</div>` : ''}
      <div class="row-sub">
        <span class="badge ${item.status}">${STATUS_LABELS[item.status]}</span>
        <span>${relativeTime(item.completedAt)}</span>
        ${item.fileSizeBytes ? `<span class="dot">·</span><span>${formatSize(item.fileSizeBytes)}</span>` : ''}
      </div>
    </div>
    <div class="row-actions">
      ${item.filePath ? `
        <button class="icon-btn small" data-action="reveal" title="Reveal in Finder" data-icon="folder"></button>
        <button class="icon-btn small" data-action="open" title="Open" data-icon="play"></button>
      ` : ''}
      <button class="icon-btn small" data-action="menu" title="More" data-icon="more"></button>
    </div>
  `;
  const img = el.querySelector('.thumb img');
  if (img) img.addEventListener('error', () => { img.outerHTML = modeIco; }, { once: true });
  el.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.dataset.action;
    if (action === 'reveal' && item.filePath) api.revealInFinder(item.filePath);
    else if (action === 'open' && item.filePath) api.openFile(item.filePath);
    else if (action === 'menu') openHistoryMenu(e, item);
  });
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    openHistoryMenu(e, item);
  });
  return el;
}

function backdropHTML(thumb) {
  if (!thumb) return '';
  return `<div class="backdrop" style="background-image:url('${escapeAttr(thumb)}')"></div>`;
}

function openHistoryMenu(e, item) {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = '';
  const add = (label, fn, destructive = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (destructive) b.className = 'destructive';
    b.addEventListener('click', () => { fn(); closeContextMenu(); });
    menu.appendChild(b);
  };
  const addDiv = () => menu.appendChild(document.createElement('hr'));

  if (item.filePath) {
    add('Reveal in Finder', () => api.revealInFinder(item.filePath));
    add('Open', () => api.openFile(item.filePath));
    addDiv();
  }
  add('Copy URL', () => api.writeClipboard(item.url));
  if (item.filePath) add('Copy file path', () => api.writeClipboard(item.filePath));
  add('Download again', () => api.retry(item.id));
  addDiv();
  add('Remove from history', () => api.removeHistory(item.id), true);

  menu.hidden = false;
  // Position — keep inside viewport.
  const vw = window.innerWidth, vh = window.innerHeight;
  const rect = menu.getBoundingClientRect();
  const x = Math.min(e.clientX, vw - rect.width - 8);
  const y = Math.min(e.clientY, vh - rect.height - 8);
  menu.style.left = `${Math.max(4, x)}px`;
  menu.style.top = `${Math.max(4, y)}px`;
}
function closeContextMenu() { document.getElementById('context-menu').hidden = true; }

// ─────────────────────────────────────────── onboarding rendering ─────────
function renderOnboarding() {
  const sheet = document.getElementById('onboarding');
  const show = !state.prefs.onboardingCompleted;
  sheet.hidden = !show;
  if (!show) {
    ui.onboardingInitialised = false;
    ui.installKicked = false;
    return;
  }

  // One-time initial phase: skip straight to browser picker only if our
  // own managed copy is installed. A Homebrew yt-dlp on PATH must not
  // short-circuit the first-launch install — Swift's onboarding gates on
  // YTDLPInstaller.isInstalled (managed location only) for the same reason.
  if (!ui.onboardingInitialised) {
    ui.onboardingInitialised = true;
    ui.onboardingPhase = state.ytdlpManagedInstalled ? 'browser' : 'install';
    if (!ui.onboardingSelection) {
      ui.onboardingSelection = state.prefs.cookiesBrowser || null;
    }
  }

  // Kick off the install as soon as the install phase appears without a
  // managed binary, regardless of any system-wide yt-dlp.
  if (ui.onboardingPhase === 'install'
      && !state.ytdlpManagedInstalled
      && state.upgradeState.status === 'idle'
      && !ui.installKicked) {
    ui.installKicked = true;
    api.install();
  }

  document.getElementById('install-phase').hidden = ui.onboardingPhase !== 'install';
  document.getElementById('browser-phase').hidden = ui.onboardingPhase !== 'browser';

  renderInstallStatus();
  renderBrowserGrid();
}

function renderInstallStatus() {
  const box = document.getElementById('install-status');
  const state_ = state.upgradeState;
  box.className = 'install-status';
  let html;
  if (state_.status === 'running') {
    const pct = Math.round((state_.progress || 0) * 100);
    html = `
      <div class="big">Installing Downloader Engine</div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="label">${escapeHTML(state_.output || '…')}</div>
    `;
  } else if (state_.status === 'success' || (state.ytdlpManagedInstalled && state_.status === 'idle')) {
    html = `
      <div class="status-check">${icon('check', { size: 44, stroke: 2.4 })}</div>
      <div class="big">Downloader Engine ${escapeHTML(state.ytdlpVersion || '')} installed</div>
      <div class="label">Airfetch will use this engine for all downloads.</div>
    `;
  } else if (state_.status === 'failed') {
    box.className = 'install-status error';
    html = `
      <div class="status-warn">${icon('warn', { size: 44, stroke: 2.2 })}</div>
      <div class="big">Download failed</div>
      <div class="message">${escapeHTML(state_.output || 'Unknown error')}</div>
      <button id="install-retry">Try again</button>
    `;
  } else {
    html = `<div class="spinner"></div><div class="label">Preparing…</div>`;
  }
  box.innerHTML = html;

  const retry = document.getElementById('install-retry');
  if (retry) retry.addEventListener('click', async () => {
    ui.installKicked = false;
    await api.resetUpgradeState();
  });

  document.getElementById('install-continue').disabled = !state.ytdlpManagedInstalled;
}

function renderBrowserGrid() {
  const grid = document.getElementById('browser-grid');
  grid.innerHTML = '';
  for (const id of SELECTABLE_BROWSERS) {
    const card = document.createElement('div');
    card.className = 'browser-card' + (ui.onboardingSelection === id ? ' selected' : '');
    const meta = state.browsers.find(b => b.id === id) || { label: id };
    card.innerHTML = `
      <div class="browser-ico">${icon(BROWSER_ICON[id] || 'globe', { size: 32, stroke: 1.6 })}</div>
      <div class="name">${escapeHTML(meta.label)}</div>
    `;
    card.addEventListener('click', () => {
      ui.onboardingSelection = id;
      renderBrowserGrid();
      updateBrowserFooter();
    });
    grid.appendChild(card);
  }
  updateBrowserFooter();
}

function updateBrowserFooter() {
  const label = state.browsers.find(b => b.id === ui.onboardingSelection)?.label;
  document.getElementById('browser-selected').textContent =
    label ? `Using ${label}` : 'Select a browser above';
  document.getElementById('browser-continue').disabled = !ui.onboardingSelection;
}

// ─────────────────────────────────────────────── settings rendering ──────
function renderSettings() {
  document.getElementById('settings').hidden = !ui.settingsOpen;
  if (!ui.settingsOpen) return;

  // Active tab
  document.querySelectorAll('#settings-tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === ui.activeTab);
  });
  document.querySelectorAll('.settings-body section').forEach(s => {
    s.hidden = s.dataset.pane !== ui.activeTab;
  });

  const d = state.prefs.defaults;

  // General
  setText('engine-path', state.ytdlpPath || 'not installed');
  setText('engine-version', state.ytdlpVersion || '—');
  setText('output-dir', d.outputDirectory || '—');
  setValue('output-template', d.outputTemplate);
  setChecked('restrict-filenames', d.restrictFilenames);

  // Cookies
  const browserSel = document.getElementById('cookies-browser');
  if (browserSel.options.length === 0) {
    for (const id of SELECTABLE_BROWSERS) {
      const meta = state.browsers.find(b => b.id === id) || { label: id };
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = meta.label;
      browserSel.appendChild(opt);
    }
  }
  browserSel.value = state.prefs.cookiesBrowser;
  setValue('cookies-profile', state.prefs.cookiesProfile);
  setText('cookies-file', d.cookiesFile || '—');
  document.getElementById('cookies-file-clear').hidden = !d.cookiesFile;

  // Format
  document.querySelectorAll('#defaults-mode button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === d.mode);
  });
  populateSelect('video-quality', VIDEO_QUALITIES, d.videoQuality);
  populateSelect('video-container', VIDEO_CONTAINERS.map(c => [c, c.toUpperCase()]), d.videoContainer);
  populateSelect('recode-format', RECODE_FORMATS, d.recodeFormat);
  populateSelect('audio-format', AUDIO_FORMATS, d.audioFormat);
  setValue('audio-quality', d.audioQuality);
  setText('audio-quality-hint',
    d.audioQuality === 0 ? '(best)' : d.audioQuality === 10 ? '(worst)' : '');
  setChecked('download-playlist', d.downloadPlaylist);
  setValue('playlist-items', d.playlistItems);
  document.getElementById('playlist-items').disabled = !d.downloadPlaylist;

  // Processing
  setChecked('write-subs', d.writeSubtitles);
  setChecked('auto-subs', d.autoSubtitles);
  setChecked('embed-subs', d.embedSubtitles);
  setValue('sub-langs', d.subtitleLanguages);
  document.getElementById('sub-langs').disabled = !(d.writeSubtitles || d.autoSubtitles || d.embedSubtitles);
  setChecked('embed-thumb', d.embedThumbnail);
  setChecked('embed-meta', d.embedMetadata);
  setChecked('embed-chapters', d.embedChapters);
  setChecked('sponsorblock', d.sponsorBlockRemove);
  setChecked('split-chapters', d.splitByChapters);
  setChecked('write-thumb', d.writeThumbnail);
  setChecked('write-desc', d.writeDescription);
  setChecked('write-info', d.writeInfoJSON);

  // Network
  setValue('user-agent', d.userAgent);
  setValue('concurrent', d.concurrentFragments);
  setValue('rate-limit', d.rateLimit);
  setValue('retries', d.retries);
  setValue('proxy', d.proxy);
  setValue('min-size', d.minFilesize);
  setValue('max-size', d.maxFilesize);
  setValue('date-after', d.dateAfter);
  setValue('date-before', d.dateBefore);
  setValue('age-limit', d.ageLimit);
  setValue('limit-start', d.limitStart);
  setValue('limit-end', d.limitEnd);

  // Advanced
  setValue('custom-format', d.customFormat);
  setValue('custom-args', d.customArgs);
  refreshCommandPreview();

  // About
  setText('about-engine', state.ytdlpPath || '—');
  setText('about-version', state.ytdlpVersion || '—');
  setText('about-platform', `${state.platform} · electron`);
  setText('about-data', 'Application data in userData dir');
}

async function refreshCommandPreview() {
  const cmd = await api.buildCommandPreview(state.prefs.defaults);
  setText('cmd-preview', cmd);
}

// ───────────────────────────────────────────────────── wiring ────────────
function wireEvents() {
  // Toolbar
  document.getElementById('btn-paste').addEventListener('click', pasteAndDownload);
  document.getElementById('btn-folder').addEventListener('click', () => api.openOutputDir());
  document.getElementById('btn-settings').addEventListener('click', () => {
    ui.settingsOpen = true; render();
  });
  document.querySelectorAll('#mode-picker button').forEach(b => {
    b.addEventListener('click', () => api.setDefaults({ mode: b.dataset.mode }));
  });

  // Global shortcuts
  window.addEventListener('keydown', e => {
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.key.toLowerCase() === 'v') {
      // Only trigger paste-URL when focus isn't in an input — otherwise the user
      // is just pasting text into a field.
      const t = e.target;
      if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable)) {
        e.preventDefault();
        pasteAndDownload();
      }
    }
    if (cmd && e.key === ',') {
      e.preventDefault();
      ui.settingsOpen = true; render();
    }
    if (e.key === 'Escape') {
      if (!document.getElementById('settings').hidden) {
        ui.settingsOpen = false; render();
      }
      closeContextMenu();
    }
  });

  // History controls
  document.getElementById('search').addEventListener('input', e => {
    ui.searchText = e.target.value;
    renderPage();
  });
  document.getElementById('mode-filter').addEventListener('change', e => {
    ui.modeFilter = e.target.value;
    renderPage();
  });
  document.getElementById('history-menu').addEventListener('click', e => {
    const menu = document.getElementById('context-menu');
    menu.innerHTML = '';
    const add = (label, fn, destructive = false, disabled = false) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (destructive) b.className = 'destructive';
      if (disabled) b.disabled = true;
      b.addEventListener('click', () => { if (!disabled) { fn(); closeContextMenu(); } });
      menu.appendChild(b);
    };
    add('Clear history', () => api.clearHistory(), true, (state.history || []).length === 0);
    add('Remove finished jobs', () => api.clearFinishedJobs(), false,
        !(state.jobs || []).some(j => isTerminal(j.status)));
    menu.hidden = false;
    const rect = e.target.getBoundingClientRect();
    menu.style.left = `${rect.right - 180}px`;
    menu.style.top = `${rect.bottom + 4}px`;
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#context-menu') && !e.target.closest('#history-menu')) {
      closeContextMenu();
    }
  });

  document.getElementById('error-dismiss').addEventListener('click', () => api.dismissLaunchError());

  // Onboarding
  document.getElementById('install-continue').addEventListener('click', () => {
    ui.onboardingPhase = 'browser';
    render();
  });
  document.getElementById('browser-continue').addEventListener('click', () => {
    if (!ui.onboardingSelection) return;
    api.setPrefs({
      cookiesBrowser: ui.onboardingSelection,
      cookiesProfile: ui.onboardingCustomPath || '',
      onboardingCompleted: true,
    });
  });

  // Settings
  document.querySelectorAll('#settings-tabs button').forEach(b => {
    b.addEventListener('click', () => { ui.activeTab = b.dataset.tab; render(); });
  });
  document.getElementById('settings-close').addEventListener('click', () => {
    ui.settingsOpen = false; render();
  });

  // General pane
  document.getElementById('check-updates').addEventListener('click', () => api.install());
  document.getElementById('choose-folder').addEventListener('click', async () => {
    const p = await api.chooseFolder(state.prefs.defaults.outputDirectory);
    if (p) api.setDefaults({ outputDirectory: p });
  });
  bindInput('output-template', v => api.setDefaults({ outputTemplate: v }));
  bindCheckbox('restrict-filenames', v => api.setDefaults({ restrictFilenames: v }));

  // Cookies pane
  document.getElementById('cookies-browser').addEventListener('change', e => {
    api.setPrefs({ cookiesBrowser: e.target.value });
  });
  bindInput('cookies-profile', v => api.setPrefs({ cookiesProfile: v }));
  document.getElementById('cookies-profile-pick').addEventListener('click', async () => {
    const p = await api.chooseFolder();
    if (p) api.setPrefs({ cookiesProfile: p });
  });
  document.getElementById('cookies-file-pick').addEventListener('click', async () => {
    const p = await api.chooseFile();
    if (p) api.setDefaults({ cookiesFile: p });
  });
  document.getElementById('cookies-file-clear').addEventListener('click', () => {
    api.setDefaults({ cookiesFile: null });
  });
  document.getElementById('rerun-onboarding').addEventListener('click', () => {
    ui.onboardingPhase = state.ytdlpPath ? 'browser' : 'install';
    ui.onboardingSelection = state.prefs.cookiesBrowser;
    ui.settingsOpen = false;
    api.setPrefs({ onboardingCompleted: false });
  });

  // Format pane
  document.querySelectorAll('#defaults-mode button').forEach(b => {
    b.addEventListener('click', () => api.setDefaults({ mode: b.dataset.mode }));
  });
  document.getElementById('video-quality').addEventListener('change', e => api.setDefaults({ videoQuality: e.target.value }));
  document.getElementById('video-container').addEventListener('change', e => api.setDefaults({ videoContainer: e.target.value }));
  document.getElementById('recode-format').addEventListener('change', e => api.setDefaults({ recodeFormat: e.target.value }));
  document.getElementById('audio-format').addEventListener('change', e => api.setDefaults({ audioFormat: e.target.value }));
  bindInput('audio-quality', v => api.setDefaults({ audioQuality: clamp(parseInt(v, 10) || 0, 0, 10) }));
  bindCheckbox('download-playlist', v => api.setDefaults({ downloadPlaylist: v }));
  bindInput('playlist-items', v => api.setDefaults({ playlistItems: v }));

  // Processing
  bindCheckbox('write-subs', v => api.setDefaults({ writeSubtitles: v }));
  bindCheckbox('auto-subs', v => api.setDefaults({ autoSubtitles: v }));
  bindCheckbox('embed-subs', v => api.setDefaults({ embedSubtitles: v }));
  bindInput('sub-langs', v => api.setDefaults({ subtitleLanguages: v }));
  bindCheckbox('embed-thumb', v => api.setDefaults({ embedThumbnail: v }));
  bindCheckbox('embed-meta', v => api.setDefaults({ embedMetadata: v }));
  bindCheckbox('embed-chapters', v => api.setDefaults({ embedChapters: v }));
  bindCheckbox('sponsorblock', v => api.setDefaults({ sponsorBlockRemove: v }));
  bindCheckbox('split-chapters', v => api.setDefaults({ splitByChapters: v }));
  bindCheckbox('write-thumb', v => api.setDefaults({ writeThumbnail: v }));
  bindCheckbox('write-desc', v => api.setDefaults({ writeDescription: v }));
  bindCheckbox('write-info', v => api.setDefaults({ writeInfoJSON: v }));

  // Network
  bindInput('user-agent', v => api.setDefaults({ userAgent: v }));
  document.getElementById('ua-reset').addEventListener('click', () => {
    api.setDefaults({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
    });
  });
  document.getElementById('ua-blank').addEventListener('click', () => api.setDefaults({ userAgent: '' }));
  bindInput('concurrent', v => api.setDefaults({ concurrentFragments: clamp(parseInt(v, 10) || 1, 1, 16) }));
  bindInput('rate-limit', v => api.setDefaults({ rateLimit: v }));
  bindInput('retries', v => api.setDefaults({ retries: clamp(parseInt(v, 10) || 0, 0, 50) }));
  bindInput('proxy', v => api.setDefaults({ proxy: v }));
  bindInput('min-size', v => api.setDefaults({ minFilesize: v }));
  bindInput('max-size', v => api.setDefaults({ maxFilesize: v }));
  bindInput('date-after', v => api.setDefaults({ dateAfter: v }));
  bindInput('date-before', v => api.setDefaults({ dateBefore: v }));
  bindInput('age-limit', v => api.setDefaults({ ageLimit: v }));
  bindInput('limit-start', v => api.setDefaults({ limitStart: v }));
  bindInput('limit-end', v => api.setDefaults({ limitEnd: v }));

  // Advanced
  bindInput('custom-format', v => api.setDefaults({ customFormat: v }));
  bindInput('custom-args', v => api.setDefaults({ customArgs: v }));
  document.getElementById('cmd-copy').addEventListener('click', async () => {
    const cmd = await api.buildCommandPreview(state.prefs.defaults);
    api.writeClipboard(cmd);
  });
}

async function pasteAndDownload() {
  const text = await api.readClipboard();
  if (!text) return;
  const urls = text.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
  if (urls.length === 0) return;
  await api.startMultiple(urls);
}

// ─────────────────────────────────────────────────── utilities ───────────
function setText(id, v) {
  const el = document.getElementById(id);
  if (el && el.textContent !== String(v)) el.textContent = String(v);
}
function setValue(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  if (document.activeElement === el) return; // don't clobber user typing
  if (String(el.value) !== String(v ?? '')) el.value = v ?? '';
}
function setChecked(id, v) {
  const el = document.getElementById(id);
  if (el && el.checked !== !!v) el.checked = !!v;
}
function populateSelect(id, entries, current) {
  const el = document.getElementById(id);
  if (el.options.length !== entries.length ||
      Array.from(el.options).some((o, i) => o.value !== entries[i][0])) {
    el.innerHTML = '';
    for (const [v, label] of entries) {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = label;
      el.appendChild(opt);
    }
  }
  if (document.activeElement !== el) el.value = current ?? entries[0][0];
}
function bindInput(id, fn) {
  const el = document.getElementById(id);
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('change', () => fn(el.value));
  el.addEventListener('blur', () => fn(el.value));
}
function bindCheckbox(id, fn) {
  const el = document.getElementById(id);
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('change', () => fn(el.checked));
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHTML(s).replace(/'/g, '&#39;'); }

function isTerminal(status) {
  return status === 'finished' || status === 'failed' || status === 'cancelled';
}
function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (!then) return '';
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} hr ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

// Kick off
init();
