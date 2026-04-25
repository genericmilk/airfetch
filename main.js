'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const https = require('node:https');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const VERBOSE = !!process.env.AIRFETCH_DEV;

// ───────────────────────────────────────────────────────────── logging ─────
function log(level, msg) {
  if (level === 'debug' && !VERBOSE) return;
  // eslint-disable-next-line no-console
  console.log(`[${level.toUpperCase()}] ${msg}`);
}

// ─────────────────────────────────────────────────────────── constants ─────
const USER_DATA = () => app.getPath('userData');
const BIN_DIR = () => path.join(USER_DATA(), 'bin');
const BIN_NAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const BIN_PATH = () => path.join(BIN_DIR(), BIN_NAME);
const HISTORY_PATH = () => path.join(USER_DATA(), 'history.json');
const PREFS_PATH = () => path.join(USER_DATA(), 'prefs.json');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

// Matches DownloadOptions.Browser from the Swift app, minus Arc (macOS-only
// keychain extraction). yt-dlp handles all of these natively via
// --cookies-from-browser.
const BROWSERS = [
  { id: 'none',         label: 'None',          ytdlp: null },
  { id: 'safari',       label: 'Safari',        ytdlp: 'safari' },
  { id: 'chrome',       label: 'Chrome',        ytdlp: 'chrome' },
  { id: 'chromeCanary', label: 'Chrome Canary', ytdlp: 'chrome' },
  { id: 'firefox',      label: 'Firefox',       ytdlp: 'firefox' },
  { id: 'edge',         label: 'Edge',          ytdlp: 'edge' },
  { id: 'brave',        label: 'Brave',         ytdlp: 'brave' },
  { id: 'chromium',     label: 'Chromium',      ytdlp: 'chromium' },
  { id: 'opera',        label: 'Opera',         ytdlp: 'opera' },
  { id: 'vivaldi',      label: 'Vivaldi',       ytdlp: 'vivaldi' },
];

const DEFAULT_OPTIONS = () => ({
  mode: 'video',
  videoContainer: 'mp4',
  videoQuality: 'best',
  audioFormat: 'mp3',
  audioQuality: 0,
  outputDirectory: path.join(app.getPath('downloads'), 'Airfetch'),
  outputTemplate: '%(title)s [%(id)s].%(ext)s',
  restrictFilenames: false,
  writeSubtitles: false,
  autoSubtitles: false,
  embedSubtitles: false,
  subtitleLanguages: 'en',
  embedThumbnail: true,
  embedMetadata: true,
  embedChapters: false,
  sponsorBlockRemove: false,
  recodeFormat: 'none',
  splitByChapters: false,
  writeThumbnail: false,
  writeDescription: false,
  writeInfoJSON: false,
  cookiesFromBrowser: 'none',
  cookiesBrowserProfile: '',
  cookiesFile: null,
  downloadPlaylist: false,
  playlistItems: '',
  concurrentFragments: 4,
  rateLimit: '',
  retries: 10,
  proxy: '',
  limitStart: '',
  limitEnd: '',
  minFilesize: '',
  maxFilesize: '',
  dateBefore: '',
  dateAfter: '',
  ageLimit: '',
  customFormat: '',
  customArgs: '',
  userAgent: DEFAULT_USER_AGENT,
});

const DEFAULT_PREFS = () => ({
  cookiesBrowser: 'safari',
  cookiesProfile: '',
  onboardingCompleted: false,
  defaults: DEFAULT_OPTIONS(),
});

// ────────────────────────────────────────────────────── arg-builder ───────
// Mirrors DownloadOptions.arguments(for:) in DownloadOptions.swift.
function buildArguments(opts, urls) {
  const args = [];
  args.push('--newline', '--no-simulate', '--progress');
  // Use ASCII Unit Separator (U+001F) as the field delimiter. YouTube
  // titles regularly contain a literal "|", which would break a
  // pipe-split parser and shift every following field by one.
  args.push('--progress-template',
    'download:[AFPROG]%(progress.status)s\x1f%(progress._percent_str)s\x1f%(progress._eta_str)s\x1f%(progress._speed_str)s\x1f%(progress._downloaded_bytes_str)s\x1f%(progress._total_bytes_str)s\x1f%(info.id)s\x1f%(info.title)s');
  args.push('--print', 'video:[AFMETA]%(id)s\x1f%(title)s\x1f%(duration)s\x1f%(uploader)s\x1f%(thumbnail)s\x1f%(webpage_url)s');
  args.push('--print', 'after_move:[AFFILE]%(filepath)s');

  if (opts.outputDirectory) args.push('-P', opts.outputDirectory);
  args.push('-o', opts.outputTemplate || '%(title)s [%(id)s].%(ext)s');
  if (opts.restrictFilenames) args.push('--restrict-filenames');

  const ua = (opts.userAgent || '').trim();
  if (ua) args.push('--user-agent', ua);

  const heightLimits = {
    q2160: 2160, q1440: 1440, q1080: 1080,
    q720: 720, q480: 480, q360: 360,
  };
  const customF = (opts.customFormat || '').trim();
  if (opts.mode === 'video') {
    if (customF) {
      args.push('-f', customF);
      args.push('--merge-output-format', opts.videoContainer);
    } else {
      const h = heightLimits[opts.videoQuality];
      const cap = h ? `[height<=${h}]` : '';
      if (opts.videoContainer === 'mp4') {
        args.push('-f',
          `bestvideo${cap}[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]/` +
          `bestvideo${cap}[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/` +
          `bestvideo${cap}[vcodec^=avc1]+bestaudio[acodec^=mp4a]/` +
          `best${cap}[ext=mp4][vcodec^=avc1]/best${cap}[ext=mp4]/best${cap}`);
        args.push('--merge-output-format', 'mp4');
      } else if (opts.videoQuality === 'worst') {
        args.push('-f', 'worst');
        args.push('--merge-output-format', opts.videoContainer);
      } else {
        args.push('-f', `bestvideo${cap}+bestaudio/best${cap}`);
        args.push('--merge-output-format', opts.videoContainer);
      }
    }
    if (opts.recodeFormat && opts.recodeFormat !== 'none') {
      args.push('--recode-video', opts.recodeFormat);
    }
  } else {
    args.push('-x');
    args.push('--audio-format', opts.audioFormat);
    args.push('--audio-quality', String(opts.audioQuality));
    if (customF) args.push('-f', customF);
    else args.push('-f', 'bestaudio[ext=m4a]/bestaudio/best');
  }

  if (opts.writeSubtitles) args.push('--write-subs');
  if (opts.autoSubtitles) args.push('--write-auto-subs');
  if ((opts.writeSubtitles || opts.autoSubtitles) && opts.subtitleLanguages) {
    args.push('--sub-langs', opts.subtitleLanguages);
  }
  if (opts.embedSubtitles) args.push('--embed-subs');

  if (opts.embedThumbnail) args.push('--embed-thumbnail');
  if (opts.embedMetadata) args.push('--embed-metadata');
  if (opts.embedChapters) args.push('--embed-chapters');
  if (opts.sponsorBlockRemove) args.push('--sponsorblock-remove', 'sponsor,selfpromo,interaction');
  if (opts.splitByChapters) args.push('--split-chapters');
  if (opts.writeThumbnail) args.push('--write-thumbnail');
  if (opts.writeDescription) args.push('--write-description');
  if (opts.writeInfoJSON) args.push('--write-info-json');

  const browser = BROWSERS.find(b => b.id === opts.cookiesFromBrowser);
  if (browser && browser.ytdlp) {
    let spec = browser.ytdlp;
    const profile = (opts.cookiesBrowserProfile || '').trim();
    if (profile) spec += `:${profile}`;
    else if (opts.cookiesFromBrowser === 'chromeCanary') {
      spec += `:${path.join(os.homedir(), 'Library/Application Support/Google/Chrome Canary/Default')}`;
    }
    args.push('--cookies-from-browser', spec);
  }
  if (opts.cookiesFile) args.push('--cookies', opts.cookiesFile);

  if (!opts.downloadPlaylist) args.push('--no-playlist');
  else {
    args.push('--yes-playlist');
    const items = (opts.playlistItems || '').trim();
    if (items) args.push('-I', items);
  }

  if (opts.concurrentFragments > 1) args.push('-N', String(opts.concurrentFragments));
  const rl = (opts.rateLimit || '').trim();
  if (rl) args.push('-r', rl);
  if (opts.retries !== 10) args.push('-R', String(opts.retries));
  const px = (opts.proxy || '').trim();
  if (px) args.push('--proxy', px);

  const s = (opts.limitStart || '').trim();
  const e = (opts.limitEnd || '').trim();
  if (s || e) args.push('--download-sections', `*${s || '0'}-${e || 'inf'}`);

  if (opts.minFilesize) args.push('--min-filesize', opts.minFilesize);
  if (opts.maxFilesize) args.push('--max-filesize', opts.maxFilesize);
  if (opts.dateBefore) args.push('--datebefore', opts.dateBefore);
  if (opts.dateAfter) args.push('--dateafter', opts.dateAfter);
  if (opts.ageLimit) args.push('--age-limit', opts.ageLimit);

  const custom = (opts.customArgs || '').trim();
  if (custom) args.push(...tokenise(custom));

  args.push(...urls);
  return args;
}

function tokenise(input) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// ───────────────────────────────────────────────────────── persistence ────
function loadJSON(file, fallback) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return JSON.parse(text);
  } catch { return fallback; }
}
function saveJSON(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } catch (err) { log('error', `saveJSON ${file}: ${err.message}`); }
}

// ─────────────────────────────────────────────────────── yt-dlp locate ────
function locateYtdlp() {
  const managed = BIN_PATH();
  if (fs.existsSync(managed)) return managed;

  const candidates = process.platform === 'win32'
    ? ['yt-dlp.exe']
    : ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', '/opt/local/bin/yt-dlp'];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  const which = process.platform === 'win32' ? 'where' : 'which';
  try {
    const res = spawnSync(which, ['yt-dlp'], { encoding: 'utf8' });
    if (res.status === 0) {
      const hit = res.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
      if (hit && fs.existsSync(hit)) return hit;
    }
  } catch { /* ignore */ }
  return null;
}

function probeVersion(binPath) {
  try {
    const r = spawnSync(binPath, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return (r.stdout || '').trim();
  } catch { /* ignore */ }
  return '';
}

// ────────────────────────────────────────────────── yt-dlp installer ──────
function pickAssetName() {
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  if (process.platform === 'win32') return 'yt-dlp.exe';
  // linux
  if (process.arch === 'arm64') return 'yt-dlp_linux_aarch64';
  if (process.arch === 'arm') return 'yt-dlp_linux_armv7l';
  return 'yt-dlp_linux';
}

function httpsRequest(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'Airfetch', ...(opts.headers || {}) };
    const req = https.get(url, { headers }, res => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        httpsRequest(res.headers.location, opts).then(resolve, reject);
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
  });
}

async function fetchJSON(url) {
  const res = await httpsRequest(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.statusCode !== 200) throw new Error(`GitHub returned HTTP ${res.statusCode}`);
  const chunks = [];
  for await (const c of res) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function downloadTo(url, dest, onProgress) {
  const res = await httpsRequest(url);
  if (res.statusCode !== 200) throw new Error(`Download failed: HTTP ${res.statusCode}`);
  const total = parseInt(res.headers['content-length'] || '0', 10);
  let written = 0;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    res.on('data', chunk => {
      written += chunk.length;
      if (total > 0) onProgress?.(Math.min(1, written / total));
    });
    res.pipe(out);
    res.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
  });
}

async function installYtdlp(onProgress) {
  const release = await fetchJSON('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest');
  const asset = (release.assets || []).find(a => a.name === pickAssetName());
  if (!asset) throw new Error(`Latest release has no asset named ${pickAssetName()}`);
  const tag = release.tag_name;

  const tmp = path.join(os.tmpdir(), `airfetch-ytdlp-${randomUUID()}`);
  await downloadTo(asset.browser_download_url, tmp, onProgress);

  await fsp.mkdir(BIN_DIR(), { recursive: true });
  const dest = BIN_PATH();
  try { await fsp.unlink(dest); } catch { /* ok */ }
  await fsp.rename(tmp, dest);
  if (process.platform !== 'win32') {
    await fsp.chmod(dest, 0o755);
    // Strip macOS quarantine so the binary runs without a Gatekeeper prompt.
    if (process.platform === 'darwin') {
      try { spawnSync('/usr/bin/xattr', ['-c', dest]); } catch { /* ignore */ }
    }
  }
  return { path: dest, tag };
}

// ──────────────────────────────────────────────────── download manager ────
class Manager {
  constructor() {
    this.prefs = { ...DEFAULT_PREFS(), ...loadJSON(PREFS_PATH(), {}) };
    // Merge stored defaults over current defaults so new option keys pick up
    // sensible values when upgrading.
    this.prefs.defaults = { ...DEFAULT_OPTIONS(), ...(this.prefs.defaults || {}) };
    this.history = loadJSON(HISTORY_PATH(), []);
    this.jobs = [];
    this.runs = new Map();  // jobId → { child, lastStderr }
    this.ytdlpPath = locateYtdlp();
    this.ytdlpVersion = this.ytdlpPath ? probeVersion(this.ytdlpPath) : '';
    this.launchError = null;
    this.upgradeState = { status: 'idle', progress: 0, output: '', lastTag: '' };
    this.win = null;
    this.ensureOutputDir();
  }

  attach(win) { this.win = win; }

  ensureOutputDir() {
    const dir = this.prefs.defaults.outputDirectory;
    if (dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ } }
  }

  snapshot() {
    return {
      jobs: this.jobs,
      history: this.history,
      prefs: this.prefs,
      ytdlpPath: this.ytdlpPath,
      ytdlpVersion: this.ytdlpVersion,
      // Mirrors Swift's YTDLPInstaller.isInstalled — true only when our own
      // managed copy is on disk. Onboarding gates the auto-install on this
      // so a Homebrew yt-dlp doesn't short-circuit the first-launch install.
      ytdlpManagedInstalled: fs.existsSync(BIN_PATH()),
      launchError: this.launchError,
      upgradeState: this.upgradeState,
      platform: process.platform,
      browsers: BROWSERS,
    };
  }

  broadcast() {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('state', this.snapshot());
    }
  }

  savePrefs() { saveJSON(PREFS_PATH(), this.prefs); }
  saveHistory() { saveJSON(HISTORY_PATH(), this.history); }

  updatePrefs(patch) {
    this.prefs = { ...this.prefs, ...patch };
    if (patch.defaults) {
      this.prefs.defaults = { ...this.prefs.defaults, ...patch.defaults };
    }
    this.savePrefs();
    this.ensureOutputDir();
    this.broadcast();
  }

  setLaunchError(err) {
    this.launchError = err;
    this.broadcast();
  }

  // ── jobs ────────────────────────────────────────────────────────────────
  start(url, overrideOptions) {
    const cleaned = (url || '').trim();
    if (!cleaned) return null;
    if (!this.ytdlpPath) {
      this.setLaunchError('Downloader Engine is not installed. Install it from the toolbar.');
      return null;
    }
    const opts = {
      ...this.prefs.defaults,
      ...(overrideOptions || {}),
      cookiesFromBrowser: this.prefs.cookiesBrowser,
      cookiesBrowserProfile: this.prefs.cookiesProfile,
    };
    const job = {
      id: randomUUID(),
      url: cleaned,
      options: opts,
      status: 'running',
      percent: 0,
      eta: '—',
      speed: '—',
      downloaded: '—',
      total: '—',
      title: defaultTitle(cleaned),
      videoID: '',
      uploader: '',
      thumbnailURL: null,
      filePath: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastLog: '',
      errorMessage: null,
    };
    this.jobs.unshift(job);
    this.launchProcess(job, opts);
    this.broadcast();
    return job.id;
  }

  launchProcess(job, opts) {
    const args = ['--color', 'never', ...buildArguments(opts, [job.url])];
    log('info', `spawn job=${job.id.slice(0, 8)} args=${args.length}`);
    const env = { ...process.env };
    if (process.platform !== 'win32') {
      const extra = ['/opt/homebrew/bin', '/usr/local/bin'];
      env.PATH = [...extra, ...(env.PATH || '').split(':').filter(Boolean)].join(':');
    }
    const child = spawn(this.ytdlpPath, args, { env });
    this.runs.set(job.id, { child, lastStderr: '' });

    bufferLines(child.stdout, line => this.onStdout(job.id, line));
    bufferLines(child.stderr, line => this.onStderr(job.id, line));
    child.on('error', err => this.onStderr(job.id, `spawn error: ${err.message}`));
    child.on('close', code => this.onExit(job.id, code ?? -1));
  }

  cancel(jobId) {
    const run = this.runs.get(jobId);
    if (run && run.child && !run.child.killed) {
      try { run.child.kill(); } catch { /* ignore */ }
      setTimeout(() => {
        const r = this.runs.get(jobId);
        if (r && r.child && !r.child.killed) {
          try { r.child.kill('SIGKILL'); } catch { /* ignore */ }
        }
      }, 3000);
    }
    const job = this.jobs.find(j => j.id === jobId);
    if (job) {
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
      job.errorMessage = 'Cancelled by user';
      this.moveToHistory(jobId);
    }
    this.broadcast();
  }

  pause(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job || job.status === 'paused' || isTerminal(job.status)) return;
    // Flip status before killing so onExit doesn't mark the job failed.
    job.status = 'paused';
    job.eta = '—';
    job.speed = '—';
    const run = this.runs.get(jobId);
    if (run && run.child && !run.child.killed) {
      try { run.child.kill(); } catch { /* ignore */ }
      setTimeout(() => {
        const r = this.runs.get(jobId);
        if (r && r.child && !r.child.killed) {
          try { r.child.kill('SIGKILL'); } catch { /* ignore */ }
        }
      }, 3000);
    }
    log('info', `job=${jobId.slice(0, 8)} paused at ${job.percent}%`);
    this.broadcast();
  }

  resume(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job || job.status !== 'paused') return;
    if (!this.ytdlpPath) {
      this.setLaunchError('Downloader Engine is not installed. Install it from the toolbar.');
      return;
    }
    job.status = 'running';
    job.errorMessage = null;
    job.finishedAt = null;
    log('info', `job=${jobId.slice(0, 8)} resuming from ${job.percent}%`);
    this.launchProcess(job, job.options);
    this.broadcast();
  }

  retry(historyId) {
    const item = this.history.find(h => h.id === historyId);
    if (item) this.start(item.url);
  }

  removeHistory(id) {
    this.history = this.history.filter(h => h.id !== id);
    this.saveHistory();
    this.broadcast();
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
    this.broadcast();
  }

  clearFinishedJobs() {
    this.jobs = this.jobs.filter(j => !isTerminal(j.status));
    this.broadcast();
  }

  moveToHistory(jobId) {
    const idx = this.jobs.findIndex(j => j.id === jobId);
    if (idx < 0) return;
    const job = this.jobs[idx];
    if (!isTerminal(job.status)) return;
    this.jobs.splice(idx, 1);
    const item = historyItemFrom(job);
    this.history = this.history.filter(h => h.id !== item.id);
    this.history.unshift(item);
    this.saveHistory();
  }

  onStdout(jobId, raw) {
    const line = raw.trim();
    if (!line) return;
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return;

    if (line.startsWith('[AFPROG]')) {
      const p = line.slice('[AFPROG]'.length).split('\x1f');
      if (p.length >= 8) {
        job.percent = parsePercent(p[1]);
        job.eta = p[2] || '—';
        job.speed = p[3] || '—';
        job.downloaded = p[4];
        job.total = p[5];
        if (p[7] && p[7] !== 'NA') job.title = p[7];
        if (p[0] === 'finished') job.status = 'merging';
        else if (p[0] === 'error') job.status = 'failed';
        else job.status = 'running';
      }
    } else if (line.startsWith('[AFMETA]')) {
      const p = line.slice('[AFMETA]'.length).split('\x1f');
      if (p.length >= 6) {
        if (p[1] && p[1] !== 'NA') job.title = p[1];
        if (p[3] && p[3] !== 'NA') job.uploader = p[3];
        if (p[0] && p[0] !== 'NA') job.videoID = p[0];
        if (p[4] && p[4] !== 'NA') job.thumbnailURL = p[4];
      }
    } else if (line.startsWith('[AFFILE]')) {
      const filePath = line.slice('[AFFILE]'.length).trim();
      if (filePath) job.filePath = filePath;
    } else {
      job.lastLog = line;
    }
    this.broadcast();
  }

  onStderr(jobId, raw) {
    const line = raw.trim();
    if (!line) return;
    const run = this.runs.get(jobId);
    if (run) {
      if (run.lastStderr === line) return;
      run.lastStderr = line;
    }
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return;
    job.lastLog = line;
    if (line.toLowerCase().includes('error') && !job.errorMessage) {
      job.errorMessage = line;
    }
    log('info', `job=${jobId.slice(0, 8)} stderr ${line}`);
    this.broadcast();
  }

  onExit(jobId, code) {
    const job = this.jobs.find(j => j.id === jobId);
    this.runs.delete(jobId);
    if (!job) return;
    // A pause kills the child to free the network/disk; the job is not
    // finished and must stay in the active list so the user can resume.
    if (job.status === 'paused') {
      log('info', `job=${jobId.slice(0, 8)} exit=${code} (paused)`);
      this.broadcast();
      return;
    }
    job.finishedAt = new Date().toISOString();
    if (code === 0) {
      job.status = 'finished';
      job.percent = 100;
    } else if (job.status !== 'cancelled') {
      job.status = 'failed';
      if (!job.errorMessage) job.errorMessage = `Downloader Engine exited with code ${code}`;
    }
    log('info', `job=${jobId.slice(0, 8)} exit=${code} status=${job.status}`);
    this.moveToHistory(jobId);
    this.broadcast();
  }

  // ── yt-dlp install ──────────────────────────────────────────────────────
  async installOrUpgrade() {
    if (this.upgradeState.status === 'running') return false;
    this.upgradeState = { status: 'running', progress: 0, output: 'Fetching latest release…', lastTag: '' };
    this.broadcast();
    try {
      const { path: p, tag } = await installYtdlp(frac => {
        this.upgradeState.progress = frac;
        this.upgradeState.output = `Downloading ${Math.round(frac * 100)}%`;
        this.broadcast();
      });
      this.ytdlpPath = p;
      this.ytdlpVersion = probeVersion(p);
      this.upgradeState = { status: 'success', progress: 1, output: `Installed ${tag}`, lastTag: tag };
      log('info', `yt-dlp install OK tag=${tag} path=${p}`);
      this.broadcast();
      return true;
    } catch (err) {
      this.upgradeState = { status: 'failed', progress: 0, output: err.message || String(err), lastTag: '' };
      log('error', `yt-dlp install failed: ${err.message}`);
      this.broadcast();
      return false;
    }
  }

  resetUpgradeState() {
    this.upgradeState = { status: 'idle', progress: 0, output: '', lastTag: '' };
    this.broadcast();
  }
}

// ─────────────────────────────────────────────────────────── helpers ──────
function defaultTitle(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    return `${u.host}${last ? ' – ' + last : ''}`;
  } catch { return url; }
}
function parsePercent(s) {
  const n = parseFloat((s || '').replace('%', '').trim());
  return Number.isFinite(n) ? n : 0;
}
function isTerminal(status) {
  return status === 'finished' || status === 'failed' || status === 'cancelled';
}
function historyItemFrom(job) {
  let size = null;
  if (job.filePath) {
    try { size = fs.statSync(job.filePath).size; } catch { /* ignore */ }
  }
  return {
    id: job.id,
    url: job.url,
    title: job.title,
    uploader: job.uploader,
    videoID: job.videoID,
    thumbnailURL: job.thumbnailURL,
    filePath: job.filePath,
    completedAt: job.finishedAt || new Date().toISOString(),
    mode: job.options.mode,
    status: job.status,
    errorMessage: job.errorMessage,
    fileSizeBytes: size,
  };
}

// Buffer child stdout/stderr into complete lines before dispatch.
function bufferLines(stream, onLine) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    buf += chunk;
    let idx;
    while ((idx = buf.search(/\r?\n/)) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + (buf[idx] === '\r' && buf[idx + 1] === '\n' ? 2 : 1));
      if (line) onLine(line);
    }
  });
  stream.on('end', () => { if (buf) onLine(buf); });
}

// ─────────────────────────────────────────────────────────── app wiring ───
let manager;

function createWindow() {
  const isMac = process.platform === 'darwin';
  // Traffic-light cluster top-left. macOS draws the three buttons inside a
  // ~14 px tall area; with the toolbar height defined in styles.css, this
  // y-offset centres the cluster on the toolbar-button baseline. x=22 lines
  // the cluster up with the first toolbar button's left padding.
  const trafficLight = { x: 22, y: 21 };
  const win = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 820,
    minHeight: 520,
    title: 'Airfetch',
    titleBarStyle: isMac ? 'hidden' : 'default',
    trafficLightPosition: isMac ? trafficLight : undefined,
    // On macOS, use a translucent window material so whatever is behind
    // Airfetch bleeds through with the standard system blur. Elsewhere,
    // fall back to a flat dark chrome.
    backgroundColor: isMac ? '#00000000' : '#111113',
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: isMac ? 'active' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // `trafficLightPosition` is only applied at construction; re-apply on load
  // so window reloads and macOS theme changes don't knock it back to default.
  if (isMac && typeof win.setWindowButtonPosition === 'function') {
    const apply = () => { try { win.setWindowButtonPosition(trafficLight); } catch { /* ignore */ } };
    apply();
    win.webContents.on('did-finish-load', apply);
  }
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (VERBOSE) win.webContents.openDevTools({ mode: 'detach' });
  return win;
}

app.whenReady().then(() => {
  manager = new Manager();
  const win = createWindow();
  manager.attach(win);
  // Send initial state after the renderer finishes loading.
  win.webContents.on('did-finish-load', () => manager.broadcast());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      manager.attach(w);
      w.webContents.on('did-finish-load', () => manager.broadcast());
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─────────────────────────────────────────────────────────────── IPC ──────
ipcMain.handle('state', () => manager.snapshot());

ipcMain.handle('start', (_e, { url, options }) => manager.start(url, options));
ipcMain.handle('startMultiple', (_e, { urls, options }) => {
  const ids = [];
  for (const u of urls) { const id = manager.start(u, options); if (id) ids.push(id); }
  return ids;
});
ipcMain.handle('cancel', (_e, { jobId }) => manager.cancel(jobId));
ipcMain.handle('pause', (_e, { jobId }) => manager.pause(jobId));
ipcMain.handle('resume', (_e, { jobId }) => manager.resume(jobId));
ipcMain.handle('retry', (_e, { historyId }) => manager.retry(historyId));
ipcMain.handle('removeHistory', (_e, { id }) => manager.removeHistory(id));
ipcMain.handle('clearHistory', () => manager.clearHistory());
ipcMain.handle('clearFinishedJobs', () => manager.clearFinishedJobs());

ipcMain.handle('setPrefs', (_e, { patch }) => manager.updatePrefs(patch));
ipcMain.handle('setDefaults', (_e, { patch }) => manager.updatePrefs({ defaults: { ...manager.prefs.defaults, ...patch } }));
ipcMain.handle('dismissLaunchError', () => manager.setLaunchError(null));

ipcMain.handle('install', () => manager.installOrUpgrade());
ipcMain.handle('resetUpgradeState', () => manager.resetUpgradeState());

ipcMain.handle('revealInFinder', (_e, { path: p }) => {
  if (p) shell.showItemInFolder(p);
});
ipcMain.handle('openFile', async (_e, { path: p }) => {
  if (p) { const err = await shell.openPath(p); if (err) return err; }
  return null;
});
ipcMain.handle('openOutputDir', () => {
  const dir = manager.prefs.defaults.outputDirectory;
  if (dir) shell.openPath(dir);
});
ipcMain.handle('chooseFolder', async (_e, { initial } = {}) => {
  const res = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: initial || manager.prefs.defaults.outputDirectory,
  });
  return res.canceled ? null : res.filePaths[0];
});
ipcMain.handle('chooseFile', async (_e, { filters } = {}) => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters || [{ name: 'All', extensions: ['*'] }],
  });
  return res.canceled ? null : res.filePaths[0];
});
ipcMain.handle('readClipboard', () => clipboard.readText() || '');
ipcMain.handle('writeClipboard', (_e, { text }) => clipboard.writeText(text || ''));
ipcMain.handle('fileExists', (_e, { path: p }) => {
  if (!p) return false;
  try { return fs.existsSync(p); } catch { return false; }
});
ipcMain.handle('buildCommandPreview', (_e, { options }) => {
  const args = buildArguments(options || manager.prefs.defaults, ['<URL>']);
  return ['yt-dlp', ...args].map(a =>
    /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a
  ).join(' ');
});
