'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, nativeImage, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const https = require('node:https');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const VERBOSE = !!process.env.AIRFETCH_DEV;

const APP_ICON_PATH = path.join(__dirname, 'icons', 'dock-icon.png');

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
// Sibling file written by the background updater. Swapped over BIN_PATH on the
// next launch so we never replace the binary while it's in use.
const BIN_UPGRADE_NAME = process.platform === 'win32' ? 'yt-dlp-upgrade.exe' : 'yt-dlp-upgrade';
const BIN_UPGRADE_PATH = () => path.join(BIN_DIR(), BIN_UPGRADE_NAME);
const HISTORY_PATH = () => path.join(USER_DATA(), 'history.json');
const PREFS_PATH = () => path.join(USER_DATA(), 'prefs.json');

// yt-dlp handles all of these natively via --cookies-from-browser. Each
// entry also carries a representative user-agent so requests look like
// they came from the same browser the cookies were lifted from.
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.6 Safari/605.1.15';
const FIREFOX_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) ' +
  'Gecko/20100101 Firefox/128.0';
const EDGE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';

const BROWSERS = [
  { id: 'none',         label: 'None',          ytdlp: null,       ua: null },
  { id: 'safari',       label: 'Safari',        ytdlp: 'safari',   ua: SAFARI_UA },
  { id: 'chrome',       label: 'Chrome',        ytdlp: 'chrome',   ua: CHROME_UA },
  { id: 'chromeCanary', label: 'Chrome Canary', ytdlp: 'chrome',   ua: CHROME_UA },
  { id: 'arc',          label: 'Arc',           ytdlp: 'chrome',   ua: CHROME_UA },
  { id: 'firefox',      label: 'Firefox',       ytdlp: 'firefox',  ua: FIREFOX_UA },
  { id: 'edge',         label: 'Edge',          ytdlp: 'edge',     ua: EDGE_UA },
  { id: 'brave',        label: 'Brave',         ytdlp: 'brave',    ua: CHROME_UA },
  { id: 'chromium',     label: 'Chromium',      ytdlp: 'chromium', ua: CHROME_UA },
  { id: 'opera',        label: 'Opera',         ytdlp: 'opera',    ua: CHROME_UA },
  { id: 'vivaldi',      label: 'Vivaldi',       ytdlp: 'vivaldi',  ua: CHROME_UA },
];

function userAgentFor(browserId) {
  const b = BROWSERS.find(x => x.id === browserId);
  return b ? b.ua : null;
}

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
});

const DEFAULT_PREFS = () => ({
  cookiesBrowser: 'safari',
  cookiesProfile: '',
  onboardingCompleted: false,
  notifyOnComplete: true,
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
  args.push('--print', 'video:[AFMETA]%(id)s\x1f%(title)s\x1f%(duration)s\x1f%(uploader)s\x1f%(thumbnail)s\x1f%(webpage_url)s\x1f%(playlist_index)s\x1f%(playlist_count)s');
  args.push('--print', 'after_move:[AFFILE]%(id)s\x1f%(filepath)s');

  if (opts.outputDirectory) args.push('-P', opts.outputDirectory);
  args.push('-o', opts.outputTemplate || '%(title)s [%(id)s].%(ext)s');
  if (opts.restrictFilenames) args.push('--restrict-filenames');

  const ua = userAgentFor(opts.cookiesFromBrowser);
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

  if (opts.embedThumbnail) {
    args.push('--embed-thumbnail');
    // YouTube serves webp/avif thumbnails which ffmpeg can't reliably
    // mux into mp4/m4a — postprocessing dies with
    //   "Postprocessing: Error opening output files: Invalid argument"
    // even though the video itself downloaded fine. Forcing the
    // thumbnail to jpg before the embed step keeps it inside the set
    // every container actually supports.
    args.push('--convert-thumbnails', 'jpg');
  }
  if (opts.embedMetadata) args.push('--embed-metadata');
  if (opts.embedChapters) args.push('--embed-chapters');
  if (opts.sponsorBlockRemove) args.push('--sponsorblock-remove', 'sponsor,selfpromo,interaction');
  if (opts.splitByChapters) args.push('--split-chapters');
  if (opts.writeThumbnail) args.push('--write-thumbnail');
  if (opts.writeDescription) args.push('--write-description');
  if (opts.writeInfoJSON) args.push('--write-info-json');

  const browser = BROWSERS.find(b => b.id === opts.cookiesFromBrowser);
  // Arc on macOS encrypts its cookies with a key stored under the
  // "Arc Safe Storage" Keychain entry, but yt-dlp's --cookies-from-browser
  // only knows how to look up Chromium's "Chrome Safe Storage" — so every
  // cookie fails to decrypt and the request goes out as if logged-out.
  // Manager.start() decrypts Arc's cookie jar ahead of time and stashes the
  // resulting Netscape file path on opts; we feed that via --cookies instead.
  if (opts.cookiesFromBrowser === 'arc' && opts._arcCookiesFile) {
    args.push('--cookies', opts._arcCookiesFile);
  } else if (browser && browser.ytdlp) {
    let spec = browser.ytdlp;
    const profile = (opts.cookiesBrowserProfile || '').trim();
    if (profile) spec += `:${profile}`;
    else if (opts.cookiesFromBrowser === 'chromeCanary') {
      spec += `:${path.join(os.homedir(), 'Library/Application Support/Google/Chrome Canary/Default')}`;
    }
    else if (opts.cookiesFromBrowser === 'arc') {
      // Fallback when the keychain export couldn't run (non-darwin or
      // Keychain access denied). Better than nothing, but the cookies will
      // still come out garbled — we surface the export failure separately.
      spec += `:${pickArcProfileDir(opts.cookiesBrowserProfile) || path.join(os.homedir(), 'Library/Application Support/Arc/User Data/Default')}`;
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

// Async — spawnSync blocks the Node event loop, which means IPC stalls and
// the renderer's window freezes for the duration of a `yt-dlp --version`
// call (1–3 s for the macOS PyInstaller bundle).
function probeVersion(binPath) {
  return new Promise((resolve) => {
    try {
      const child = spawn(binPath, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', d => { out += d.toString(); });
      child.on('error', () => resolve(''));
      child.on('close', code => resolve(code === 0 ? out.trim() : ''));
    } catch {
      resolve('');
    }
  });
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
  // A successful manual install supersedes any background-staged upgrade.
  try { await fsp.unlink(BIN_UPGRADE_PATH()); } catch { /* ok */ }
  return { path: dest, tag };
}

// yt-dlp uses calendar versioning ("YYYY.MM.DD" or "YYYY.MM.DD.PATCH"), so
// numeric-component compare works across formats.
function compareVersions(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

// ───────────────────────────────────────────────── app self-update ─────────
const APP_REPO = 'genericmilk/airfetch';
const APP_RELEASES_PAGE = `https://github.com/${APP_REPO}/releases/latest`;

// "v0.1.2" → "0.1.2"; everything else passes through. Strips the "v" prefix
// and any pre-release suffix so compareVersions can handle git tags vs the
// bare semver carried in package.json's "version".
function normalizeAppVersion(s) {
  return String(s || '').trim().replace(/^v/i, '').split('-')[0];
}

async function fetchLatestAppRelease() {
  const url = `https://api.github.com/repos/${APP_REPO}/releases/latest`;
  return fetchJSON(url);
}

// Run on every launch (after a managed install exists). If a previous session
// staged a newer binary at BIN_UPGRADE_PATH, atomically replace BIN_PATH with
// it; otherwise discard a stale or older stage.
async function applyStagedUpgrade() {
  const staged = BIN_UPGRADE_PATH();
  if (!fs.existsSync(staged)) {
    log('info', 'yt-dlp updater: no staged upgrade waiting');
    return;
  }
  const dest = BIN_PATH();
  try {
    if (fs.existsSync(dest)) {
      const current = await probeVersion(dest);
      const next = await probeVersion(staged);
      if (next && current && compareVersions(next, current) <= 0) {
        log('info', `yt-dlp updater: discarding stale stage (staged=${next} ≤ current=${current})`);
        fs.unlinkSync(staged);
        return;
      }
      log('info', `yt-dlp updater: applying staged upgrade ${current || '?'} → ${next || '?'}`);
    } else {
      log('info', 'yt-dlp updater: applying staged binary (no live binary present)');
    }
    // Replace the live binary. rename() across the same directory is atomic
    // on POSIX; Windows can't replace an open file, but the staged-on-startup
    // ordering means nothing is using it yet.
    try { fs.unlinkSync(dest); } catch { /* ok */ }
    fs.renameSync(staged, dest);
    if (process.platform !== 'win32') {
      try { fs.chmodSync(dest, 0o755); } catch { /* ignore */ }
      if (process.platform === 'darwin') {
        try { spawnSync('/usr/bin/xattr', ['-c', dest]); } catch { /* ignore */ }
      }
    }
    log('info', `yt-dlp updater: swap complete → ${dest}`);
  } catch (err) {
    log('error', `yt-dlp updater: applyStagedUpgrade failed: ${err.message}`);
    try { fs.unlinkSync(staged); } catch { /* ignore */ }
  }
}

// Quietly download the latest release into BIN_UPGRADE_PATH if newer than the
// running binary. Never throws; failures are swallowed (no network, GH rate
// limit, etc.). The actual swap happens on the *next* launch via
// applyStagedUpgrade().
async function stageBackgroundUpgrade(currentVersion) {
  log('info', `yt-dlp updater: querying GitHub for latest release (current=${currentVersion || 'unknown'})`);
  const release = await fetchJSON('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest');
  const tag = release.tag_name;
  if (!tag) {
    log('info', 'yt-dlp updater: GitHub returned no tag_name');
    return null;
  }
  if (currentVersion && compareVersions(tag, currentVersion) <= 0) {
    log('info', `yt-dlp updater: already up to date (current=${currentVersion}, latest=${tag})`);
    return null;
  }
  const asset = (release.assets || []).find(a => a.name === pickAssetName());
  if (!asset) {
    log('info', `yt-dlp updater: release ${tag} has no asset for ${pickAssetName()}`);
    return null;
  }

  log('info', `yt-dlp updater: downloading ${tag} (${asset.name}) for next-launch swap`);
  await fsp.mkdir(BIN_DIR(), { recursive: true });
  const tmp = path.join(os.tmpdir(), `airfetch-ytdlp-${randomUUID()}`);
  await downloadTo(asset.browser_download_url, tmp);
  const staged = BIN_UPGRADE_PATH();
  try { await fsp.unlink(staged); } catch { /* ok */ }
  await fsp.rename(tmp, staged);
  if (process.platform !== 'win32') {
    try { await fsp.chmod(staged, 0o755); } catch { /* ignore */ }
    if (process.platform === 'darwin') {
      try { spawnSync('/usr/bin/xattr', ['-c', staged]); } catch { /* ignore */ }
    }
  }
  log('info', `yt-dlp updater: staged ${tag} at ${staged}`);
  return tag;
}

// ─────────────────────────────────────────────────────── arc cookies ──────
// yt-dlp doesn't natively support Arc and treats `--cookies-from-browser arc:…`
// as Chrome — so it queries the wrong macOS Keychain entry ("Chrome Safe
// Storage" instead of "Arc Safe Storage"), the AES-CBC decrypt fails for
// every cookie, and the request goes out logged-out. We work around this by
// reading Arc's cookie jar ourselves, decrypting with the right key, and
// writing a Netscape cookies.txt that yt-dlp can ingest via --cookies.
const ARC_USER_DATA = () =>
  path.join(os.homedir(), 'Library/Application Support/Arc/User Data');
const ARC_KEYCHAIN_SERVICE = 'Arc Safe Storage';
const PBKDF2_SALT = 'saltysalt';
const PBKDF2_ITER = 1003;
const AES_KEY_LEN = 16;
// Chromium uses an IV of 16 spaces for cookie encryption on macOS/Linux.
const CHROMIUM_IV = Buffer.alloc(16, 0x20);

// Picks the Arc profile directory to read cookies from. Honors a user-
// supplied profile name (or absolute path) and otherwise auto-selects the
// profile whose Cookies file was most recently written — that's the one the
// user most recently used. Arc's "Spaces" feature creates additional
// profiles ("Profile 1", "Profile 2", …) alongside the original "Default";
// without auto-detection we'd silently pull from an empty Default for
// anyone who's used Spaces.
function pickArcProfileDir(profileHint) {
  const base = ARC_USER_DATA();
  const trimmed = (profileHint || '').trim();
  if (trimmed) return path.isAbsolute(trimmed) ? trimmed : path.join(base, trimmed);
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return null; }
  let best = null;
  let bestMtime = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name !== 'Default' && !/^Profile \d+$/.test(e.name)) continue;
    const cookiesPath = path.join(base, e.name, 'Cookies');
    let st;
    try { st = fs.statSync(cookiesPath); } catch { continue; }
    if (st.mtimeMs > bestMtime) { best = path.join(base, e.name); bestMtime = st.mtimeMs; }
  }
  return best;
}

function getArcAesKey() {
  const res = spawnSync(
    '/usr/bin/security',
    ['find-generic-password', '-w', '-s', ARC_KEYCHAIN_SERVICE],
    { encoding: 'utf8' },
  );
  if (res.status !== 0 || !res.stdout) {
    throw new Error('Arc Safe Storage password not found in macOS Keychain');
  }
  const password = res.stdout.replace(/[\r\n]+$/, '');
  return require('node:crypto').pbkdf2Sync(
    password, PBKDF2_SALT, PBKDF2_ITER, AES_KEY_LEN, 'sha1',
  );
}

function decryptArcCookieValue(key, hex) {
  if (!hex) return '';
  const buf = Buffer.from(hex, 'hex');
  if (buf.length === 0) return '';
  const version = buf.slice(0, 3).toString('latin1');
  if (version !== 'v10' && version !== 'v11') return buf.toString('utf8');
  const ct = buf.slice(3);
  if (ct.length === 0 || ct.length % 16 !== 0) return null;
  const decipher = require('node:crypto').createDecipheriv('aes-128-cbc', key, CHROMIUM_IV);
  let pt;
  try { pt = Buffer.concat([decipher.update(ct), decipher.final()]); }
  catch { return null; }
  // Chromium 130+ on macOS prefixes the plaintext with a 32-byte SHA-256 of
  // (host || name) before the cookie value. There's no version marker for
  // it — Chromium just bumped the format under the same `v10`/`v11` prefix.
  // Detect by inspection: a binary head followed by a printable tail means
  // strip the head.
  if (pt.length > 32) {
    let headBinary = false;
    for (let i = 0; i < 32; i++) {
      const b = pt[i];
      if (b < 0x20 || b > 0x7e) { headBinary = true; break; }
    }
    if (headBinary) {
      let tailPrintable = true;
      for (let i = 32; i < pt.length; i++) {
        const b = pt[i];
        if (b < 0x09 || (b > 0x0d && b < 0x20) || b > 0x7e) { tailPrintable = false; break; }
      }
      if (tailPrintable) return pt.slice(32).toString('utf8');
    }
  }
  return pt.toString('utf8');
}

// Decrypts every cookie in the chosen Arc profile and writes a Netscape
// cookies.txt to the system tmpdir. Returns the absolute path. Caller owns
// cleanup via cleanupArcCookieFile().
function exportArcCookies(profileHint) {
  const profileDir = pickArcProfileDir(profileHint);
  if (!profileDir) throw new Error('No Arc profile directory found');
  const cookiesDb = path.join(profileDir, 'Cookies');
  if (!fs.existsSync(cookiesDb)) throw new Error(`Arc cookies database missing: ${cookiesDb}`);
  const key = getArcAesKey();

  // VACUUM INTO produces a consistent snapshot even when Arc has the live DB
  // open with WAL pages outstanding. A plain copy can miss recent writes.
  const tmpDb = path.join(os.tmpdir(), `airfetch-arc-${randomUUID()}.db`);
  const vac = spawnSync(
    '/usr/bin/sqlite3',
    [cookiesDb, `VACUUM INTO '${tmpDb.replace(/'/g, "''")}'`],
    { encoding: 'utf8' },
  );
  if (vac.status !== 0) {
    // Fallback: best-effort copy. Less correct but better than failing.
    try { fs.copyFileSync(cookiesDb, tmpDb); }
    catch (err) { throw new Error(`Cannot snapshot Arc cookies DB: ${vac.stderr || err.message}`); }
  }

  const sql = 'SELECT host_key, path, is_secure, expires_utc, name, hex(encrypted_value), is_httponly FROM cookies;';
  const sq = spawnSync(
    '/usr/bin/sqlite3', ['-separator', '\t', tmpDb, sql],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  try { fs.unlinkSync(tmpDb); } catch { /* ok */ }
  if (sq.status !== 0) throw new Error(`sqlite3 read failed: ${sq.stderr || 'unknown'}`);

  const lines = ['# Netscape HTTP Cookie File', '# Generated by Airfetch', ''];
  let total = 0, ok = 0;
  for (const row of sq.stdout.split('\n')) {
    if (!row) continue;
    total++;
    const parts = row.split('\t');
    if (parts.length < 7) continue;
    const [host, ckPath, isSec, expires, name, hex, httponly] = parts;
    if (!host || !name) continue;
    const value = decryptArcCookieValue(key, hex);
    // null = decrypt failed; skip silently. Empty string is a legitimate
    // cookie value (e.g. session-clear) so we keep it.
    if (value === null) continue;
    if (/[\t\r\n]/.test(value)) continue;
    ok++;
    // Chromium stores expires_utc as microseconds since 1601-01-01;
    // Netscape wants seconds since 1970. 11644473600 = seconds between.
    const exp = expires === '0'
      ? '0'
      : Math.max(0, Math.floor(Number(expires) / 1_000_000 - 11644473600));
    const flag = host.startsWith('.') ? 'TRUE' : 'FALSE';
    const secure = isSec === '1' ? 'TRUE' : 'FALSE';
    const prefix = httponly === '1' ? '#HttpOnly_' : '';
    lines.push([prefix + host, flag, ckPath || '/', secure, exp, name, value].join('\t'));
  }
  log('info', `Arc cookies export: ${ok}/${total} from ${path.basename(profileDir)}`);
  const outPath = path.join(os.tmpdir(), `airfetch-arc-cookies-${randomUUID()}.txt`);
  fs.writeFileSync(outPath, lines.join('\n') + '\n', { mode: 0o600 });
  return outPath;
}

function cleanupArcCookieFile(p) {
  if (!p) return;
  try { fs.unlinkSync(p); } catch { /* ok */ }
}

// Sweep stale Arc-cookie temp files left behind by prior crashes. Runs once
// at startup so /tmp doesn't accumulate decrypted cookie jars across runs.
function cleanupOrphanedArcCookieFiles() {
  let entries;
  try { entries = fs.readdirSync(os.tmpdir()); } catch { return; }
  for (const name of entries) {
    if (!/^airfetch-arc-(cookies-.*\.txt|.*\.db)$/.test(name)) continue;
    try { fs.unlinkSync(path.join(os.tmpdir(), name)); } catch { /* ok */ }
  }
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
    // Probing yt-dlp synchronously here would block the window from painting
    // — `yt-dlp_macos --version` is a PyInstaller bundle that costs 1–3 s to
    // launch. Resolved lazily after the renderer is up via resolveYtdlp().
    this.ytdlpPath = null;
    this.ytdlpVersion = '';
    this.launchError = null;
    this.upgradeState = { status: 'idle', progress: 0, output: '', lastTag: '' };
    // App-self-update state. status: idle|checking|up-to-date|available|error.
    this.appUpdate = {
      status: 'idle',
      currentVersion: app.getVersion(),
      latestVersion: '',
      releaseUrl: APP_RELEASES_PAGE,
      releaseNotes: '',
      publishedAt: '',
      error: '',
      checkedAt: '',
      dismissed: false,
    };
    // Highest version we've already shown a notification for in this session.
    // Prevents re-notifying on every periodic check or after the user has
    // already been told.
    this.appUpdateNotifiedFor = '';
    this.appUpdateTimer = null;
    this.win = null;
    this.ensureOutputDir();
  }

  attach(win) { this.win = win; }

  async resolveYtdlp() {
    this.ytdlpPath = locateYtdlp();
    this.ytdlpVersion = this.ytdlpPath ? await probeVersion(this.ytdlpPath) : '';
  }

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
      appUpdate: this.appUpdate,
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
      logLines: [],
      errorMessage: null,
      // Playlist mode: yt-dlp emits one [AFMETA]/[AFPROG]/[AFFILE] cycle per
      // entry. We record each completed entry so the row can show "N of M"
      // and each finished video lands as its own history item.
      isPlaylist: false,
      playlistIndex: 0,
      playlistCount: 0,
      completedEntries: [],
    };
    this.jobs.unshift(job);
    this.launchProcess(job, opts);
    this.broadcast();
    return job.id;
  }

  launchProcess(job, opts) {
    // Re-export Arc cookies on every spawn (initial start + resume) so the
    // freshest session jar lands in the temp file. Discard any prior export
    // first; cookies may have rotated while the job was paused.
    if (opts.cookiesFromBrowser === 'arc' && process.platform === 'darwin') {
      cleanupArcCookieFile(opts._arcCookiesFile);
      opts._arcCookiesFile = null;
      try {
        opts._arcCookiesFile = exportArcCookies(opts.cookiesBrowserProfile);
      } catch (err) {
        log('error', `Arc cookies export failed: ${err.message}`);
        job.lastLog = `Arc cookies unavailable: ${err.message}`;
      }
    }
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
      // moveToHistory removes the job from this.jobs, so onExit's lookup
      // returns undefined and its cleanup branch never runs. Clean up the
      // Arc cookies temp file here instead.
      cleanupArcCookieFile(job.options._arcCookiesFile);
      job.options._arcCookiesFile = null;
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
    if (!item) return;
    this.history = this.history.filter(h => h.id !== historyId);
    this.saveHistory();
    this.start(item.url);
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
    // The current entry (which hasn't been archived yet) becomes the final
    // history item. For non-playlist jobs this is just the single download;
    // for playlists, archivePlaylistEntry has already filed the earlier
    // entries — this one rounds out the set.
    if (job.filePath || !job.isPlaylist || job.completedEntries.length === 0) {
      const item = historyItemFrom(job);
      this.history = this.history.filter(h => h.id !== item.id);
      this.history.unshift(item);
    }
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
        const id = (p[0] && p[0] !== 'NA') ? p[0] : '';
        // A new id while we already have one means yt-dlp moved on to the
        // next playlist entry — snapshot the prior entry into history so
        // each video shows up as its own row.
        if (id && job.videoID && id !== job.videoID && job.filePath) {
          this.archivePlaylistEntry(job);
        }
        if (p[1] && p[1] !== 'NA') job.title = p[1];
        if (p[3] && p[3] !== 'NA') job.uploader = p[3];
        if (id) job.videoID = id;
        if (p[4] && p[4] !== 'NA') job.thumbnailURL = p[4];
        const idx = parseInt(p[6], 10);
        const total = parseInt(p[7], 10);
        if (Number.isFinite(idx) && idx >= 1) {
          job.isPlaylist = true;
          job.playlistIndex = idx;
          if (Number.isFinite(total) && total > 0) job.playlistCount = total;
        }
        // Reset per-entry progress so the row doesn't briefly show the
        // previous video's completed state while the next one is still
        // being resolved.
        job.percent = 0;
        job.filePath = null;
      }
    } else if (line.startsWith('[AFFILE]')) {
      const rest = line.slice('[AFFILE]'.length);
      const sep = rest.indexOf('\x1f');
      const filePath = sep >= 0 ? rest.slice(sep + 1).trim() : rest.trim();
      if (filePath) job.filePath = filePath;
    } else {
      job.lastLog = line;
      appendLogLine(job, line);
    }
    this.broadcast();
  }

  // Capture a finished playlist entry as a history item *before* yt-dlp
  // overwrites the job fields with the next entry's metadata.
  archivePlaylistEntry(job) {
    const entry = {
      id: randomUUID(),
      url: job.url,
      title: job.title,
      uploader: job.uploader,
      videoID: job.videoID,
      thumbnailURL: job.thumbnailURL,
      filePath: job.filePath,
      completedAt: new Date().toISOString(),
      mode: job.options.mode,
      status: 'finished',
      errorMessage: null,
      fileSizeBytes: filePathSize(job.filePath),
    };
    job.completedEntries.push(entry);
    this.history = this.history.filter(h => h.id !== entry.id);
    this.history.unshift(entry);
    this.saveHistory();
    this.notifyJobFinished(entry);
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
    log('info', `job=${jobId.slice(0, 8)} stderr ${line}`);
    appendLogLine(job, line);
    // yt-dlp emits a steady stream of non-fatal cookie/extractor warnings
    // even on perfectly successful downloads (e.g. "failed to decrypt
    // cookie (AES-CBC)" when a browser jar contains entries we can't
    // read). They aren't actionable for the user and shouldn't bleed
    // into the row subline or the error banner.
    if (isBenignYtDlpNoise(line)) {
      this.broadcast();
      return;
    }
    const clean = sanitizeEngineMessage(line);
    if (!clean) {
      this.broadcast();
      return;
    }
    job.lastLog = clean;
    if (clean.toLowerCase().includes('error') && !job.errorMessage) {
      job.errorMessage = clean;
    }
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
      // A non-zero exit from a postprocessor (embed thumbnail, embed
      // metadata, sponsor block, …) often leaves the actual video on
      // disk — yt-dlp printed the after-move filepath before bailing,
      // or the downloaded file is still sitting in the output dir.
      // In that case we don't want the row to read as "failed" when
      // the user already has a working file.
      const recovered = recoverFinishedFile(job);
      if (recovered) {
        job.filePath = recovered;
        job.status = 'finished';
        job.percent = 100;
        if (!job.lastLog) job.lastLog = 'Finished with postprocessing warning';
        job.errorMessage = null;
      } else {
        job.status = 'failed';
        if (!job.errorMessage) job.errorMessage = `Downloader Engine exited with code ${code}`;
      }
    }
    log('info', `job=${jobId.slice(0, 8)} exit=${code} status=${job.status}`);
    // Decrypted Arc cookies were written to a temp file just for this run;
    // remove it now that the job has reached a terminal state. (Pause is
    // handled by the early return above so the file survives a resume.)
    cleanupArcCookieFile(job.options._arcCookiesFile);
    job.options._arcCookiesFile = null;
    // Skip when the playlist path already fired per-entry notifications;
    // those handle the success cases. The container exit only matters
    // here for failure notifications.
    const playlistAlreadyNotified = job.isPlaylist && job.completedEntries.length > 0 && job.status === 'finished';
    if (!playlistAlreadyNotified) this.notifyJobFinished(job);
    this.moveToHistory(jobId);
    this.broadcast();
  }

  notifyJobFinished(job) {
    if (!this.prefs.notifyOnComplete) return;
    if (!Notification.isSupported()) return;
    const isFailure = job.status === 'failed' || job.status === 'cancelled';
    const title = isFailure
      ? (job.status === 'cancelled' ? 'Download cancelled' : 'Download failed')
      : 'Download complete';
    const body = job.title || job.url || '';
    const note = new Notification({
      title,
      body,
      silent: false,
      icon: nativeImage.createFromPath(APP_ICON_PATH),
    });
    if (job.filePath) {
      // Click reveals the finished file in Finder/Explorer/Files. Failure
      // notifications just focus the app so the user can see the row.
      note.on('click', () => {
        if (isFailure) {
          if (this.win && !this.win.isDestroyed()) this.win.focus();
        } else {
          shell.showItemInFolder(job.filePath);
        }
      });
    } else {
      note.on('click', () => {
        if (this.win && !this.win.isDestroyed()) this.win.focus();
      });
    }
    note.show();
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
      this.ytdlpVersion = await probeVersion(p);
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

  // ── app self-update ─────────────────────────────────────────────────────
  // Polls the GitHub releases endpoint for genericmilk/airfetch, compares
  // against app.getVersion(), and updates this.appUpdate. We don't auto-
  // install — the build is unsigned on macOS/Windows, so an in-place swap
  // would either fail Gatekeeper or trip SmartScreen. The renderer offers
  // a button to open the release page; the user runs the platform installer.
  async checkAppUpdate({ silent = false } = {}) {
    if (this.appUpdate.status === 'checking') return this.appUpdate;
    const previousLatest = this.appUpdate.latestVersion;
    this.appUpdate = { ...this.appUpdate, status: 'checking', error: '' };
    this.broadcast();
    try {
      const release = await fetchLatestAppRelease();
      const tag = release.tag_name || '';
      const latest = normalizeAppVersion(tag);
      const current = normalizeAppVersion(this.appUpdate.currentVersion);
      const cmp = latest && current ? compareVersions(current, latest) : 0;
      const isNewer = cmp < 0;
      // Reset the dismissed flag if we discover a *newer* tag than the one
      // the user already dismissed — don't keep a banner permanently hidden
      // when v0.2.0 lands after they dismissed v0.1.5.
      const dismissed = this.appUpdate.dismissed && latest === previousLatest;
      this.appUpdate = {
        ...this.appUpdate,
        status: isNewer ? 'available' : 'up-to-date',
        latestVersion: latest,
        releaseUrl: release.html_url || APP_RELEASES_PAGE,
        releaseNotes: release.body || '',
        publishedAt: release.published_at || '',
        error: '',
        checkedAt: new Date().toISOString(),
        dismissed,
      };
      log('info', `app updater: current=${current} latest=${latest || '?'} → ${this.appUpdate.status}`);
      // Notify on first discovery of this latest version (whether the call
      // was triggered by a manual check or the background timer). Silent
      // suppresses the toast but the banner still appears in the UI.
      if (isNewer && !silent && this.appUpdateNotifiedFor !== latest) {
        this.notifyAppUpdateAvailable();
        this.appUpdateNotifiedFor = latest;
      }
      this.broadcast();
      return this.appUpdate;
    } catch (err) {
      this.appUpdate = {
        ...this.appUpdate,
        status: 'error',
        error: err.message || String(err),
        checkedAt: new Date().toISOString(),
      };
      log('error', `app updater: check failed: ${err.message}`);
      this.broadcast();
      return this.appUpdate;
    }
  }

  notifyAppUpdateAvailable() {
    if (!Notification.isSupported()) return;
    const note = new Notification({
      title: `Airfetch ${this.appUpdate.latestVersion} is available`,
      body: 'Click to view the release.',
      silent: false,
      icon: nativeImage.createFromPath(APP_ICON_PATH),
    });
    note.on('click', () => shell.openExternal(this.appUpdate.releaseUrl));
    note.show();
  }

  openReleasePage() {
    return shell.openExternal(this.appUpdate.releaseUrl || APP_RELEASES_PAGE);
  }

  dismissAppUpdate() {
    this.appUpdate = { ...this.appUpdate, dismissed: true };
    this.broadcast();
  }

  // Re-poll the GitHub releases API every 6 hours while the app is open.
  // The first call (after the launch-time silent one) will fire a system
  // notification when a new version is found.
  startAppUpdateTimer() {
    if (this.appUpdateTimer) return;
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    this.appUpdateTimer = setInterval(() => {
      this.checkAppUpdate({ silent: false }).catch(() => { /* logged inside */ });
    }, SIX_HOURS);
    if (this.appUpdateTimer.unref) this.appUpdateTimer.unref();
  }

  // Best-effort: ask GitHub for the newest yt-dlp and stage it next to the
  // live binary so the *next* launch swaps it in. No-op when the user is
  // already running a manual install, no managed binary exists yet (first
  // run — the onboarding install will handle it), or the network call fails.
  async backgroundUpdateCheck() {
    if (this.upgradeState.status === 'running') {
      log('info', 'yt-dlp updater: skipping background check (manual install in progress)');
      return;
    }
    if (!this.ytdlpPath || !fs.existsSync(BIN_PATH())) {
      log('info', 'yt-dlp updater: skipping background check (no managed binary — first run)');
      return;
    }
    try {
      const tag = await stageBackgroundUpgrade(this.ytdlpVersion);
      if (tag) log('info', `yt-dlp updater: ${tag} staged for next launch`);
    } catch (err) {
      log('error', `yt-dlp updater: background check failed: ${err.message}`);
    }
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
function filePathSize(filePath) {
  if (!filePath) return null;
  try { return fs.statSync(filePath).size; } catch { return null; }
}

// Look for the actual downloaded file when yt-dlp exited non-zero. If
// after_move printed a filepath we trust it; otherwise scan the output
// directory for a recent file matching the video id (yt-dlp embeds
// "[<id>]" in the default template) and treat that as the final file.
function recoverFinishedFile(job) {
  if (job.filePath && fs.existsSync(job.filePath)) return job.filePath;
  const dir = job.options?.outputDirectory;
  const id = job.videoID;
  if (!dir || !id) return null;
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }
  // Skip yt-dlp's intermediate scratch files.
  const SKIP = /\.(part|ytdl|temp|frag\d*|webp|jpg|jpeg|png|description|info\.json|en\.vtt|live_chat\.json)$/i;
  let best = null;
  let bestMtime = 0;
  for (const name of entries) {
    if (!name.includes(`[${id}]`)) continue;
    if (SKIP.test(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile() || st.size === 0) continue;
    if (st.mtimeMs > bestMtime) { best = full; bestMtime = st.mtimeMs; }
  }
  return best;
}

// stderr lines we suppress from the UI. The download still continues and
// finishes cleanly when these appear, so surfacing them as "lastLog" or
// "errorMessage" makes a successful job look broken.
const BENIGN_NOISE_PATTERNS = [
  /failed to decrypt cookie/i,
  /UTF-8 decoding failed/i,
  /Possibly the key is wrong/i,
  /could not find .* cookies database/i,
  /Deleting existing file/i,
];
function isBenignYtDlpNoise(line) {
  return BENIGN_NOISE_PATTERNS.some(re => re.test(line));
}
// Strip user-facing yt-dlp branding from log/error lines before they hit
// the renderer. The "please report this issue on …/yt-dlp/issues" hint is
// also misdirection (we maintain Airfetch, not yt-dlp), so we drop it
// rather than rewrite it.
function sanitizeEngineMessage(line) {
  if (!line) return line;
  return line
    .replace(/\s*;?\s*please report this issue on\s+https?:\/\/github\.com\/yt-dlp\/yt-dlp\/issues\S*[^.]*\.?/gi, '')
    .replace(/\s*Confirm you are on the latest version using\s+yt-dlp\s+-U\.?/gi, '')
    .replace(/\byt-dlp\b/g, 'the engine')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function historyItemFrom(job) {
  const size = filePathSize(job.filePath);
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
    consoleLog: (job.logLines || []).join('\n'),
    fileSizeBytes: size,
  };
}

// Cap the per-job log buffer so a runaway process can't pin unbounded memory.
// 2000 lines is comfortably above what a normal failed download produces.
const MAX_LOG_LINES = 2000;
function appendLogLine(job, line) {
  if (!job) return;
  if (!Array.isArray(job.logLines)) job.logLines = [];
  job.logLines.push(line);
  if (job.logLines.length > MAX_LOG_LINES) {
    job.logLines.splice(0, job.logLines.length - MAX_LOG_LINES);
  }
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
    icon: !isMac && fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined,
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
      scrollBounce: true,
    },
  });
  // `trafficLightPosition` is only applied at construction; re-apply on load
  // so window reloads and macOS theme changes don't knock it back to default.
  if (isMac && typeof win.setWindowButtonPosition === 'function') {
    const apply = () => { try { win.setWindowButtonPosition(trafficLight); } catch { /* ignore */ } };
    apply();
    win.webContents.on('did-finish-load', apply);
  }
  // Renderer is built by Vite to renderer/dist; npm run start handles the
  // build before electron launches.
  win.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));
  if (VERBOSE) {
    win.webContents.openDevTools({ mode: 'detach' });
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      const levels = ['debug', 'info', 'warn', 'error'];
      const prefix = levels[level] || 'log';
      log('info', `renderer[${prefix}] ${source}:${line} ${message}`);
    });
  }
  return win;
}

// Windows uses the AppUserModelID to title notifications and to group
// shortcuts in the taskbar. Without this, toasts read "electron.app" on
// Win 10/11. Must be set before any Notification is shown.
if (process.platform === 'win32') app.setAppUserModelId('com.peterday.airfetch');

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock && fs.existsSync(APP_ICON_PATH)) {
    try { app.dock.setIcon(nativeImage.createFromPath(APP_ICON_PATH)); } catch { /* ignore */ }
  }
  // Drop any decrypted-cookie temp files left behind by a previous crash
  // before we start writing fresh ones. Cheap and bounded — only inspects
  // names matching the airfetch-arc-* pattern.
  if (process.platform === 'darwin') cleanupOrphanedArcCookieFiles();
  manager = new Manager();
  const win = createWindow();
  manager.attach(win);
  // Paint the window first, then do the slow yt-dlp work. applyStagedUpgrade
  // and probeVersion both spawn the yt-dlp binary synchronously (~1–3 s on
  // macOS PyInstaller bundles), which used to stall first paint by 10 s+.
  win.webContents.on('did-finish-load', async () => {
    manager.broadcast();
    await applyStagedUpgrade();
    await manager.resolveYtdlp();
    manager.broadcast();
    manager.backgroundUpdateCheck();
    // Cold-start check is non-silent so a friend who launches a stale build
    // gets the system toast immediately. Subsequent periodic checks rely on
    // appUpdateNotifiedFor to avoid re-toasting the same version.
    manager.checkAppUpdate({ silent: false });
    manager.startAppUpdateTimer();
  });

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

ipcMain.handle('checkAppUpdate', () => manager.checkAppUpdate({ silent: false }));
ipcMain.handle('openReleasePage', () => manager.openReleasePage());
ipcMain.handle('dismissAppUpdate', () => manager.dismissAppUpdate());

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
