// Pure formatting + small helpers. No state, no side effects.

export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (!then) return '';
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} hr ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

// Three-way phase classifier shared by JobRow and ThumbnailBackdrop. The
// CSS keys --progress + ping-pong animations off this class.
export function jobPhase(job) {
  if (job.status === 'merging') return 'merging';
  if (job.status === 'paused') return job.percent > 0 ? 'downloading' : 'pending';
  if (job.status === 'running' && job.percent > 0) return 'downloading';
  if (job.status === 'running' || job.status === 'queued') return 'pending';
  return job.status;
}

export function progressValue(job) {
  if (job.status === 'finished') return 1;
  if (job.status === 'failed' || job.status === 'cancelled') return 0;
  if (job.status === 'merging') return Math.max(job.percent / 100, 0.99);
  return (job.percent || 0) / 100;
}

export function preDownloadStatus(job) {
  const log = (job.lastLog || '').trim();
  if (!log) return 'Preparing…';
  if (log.toLowerCase().includes('cookies are no longer valid')) {
    return 'Browser cookies rejected — trying anyway…';
  }
  return log;
}
