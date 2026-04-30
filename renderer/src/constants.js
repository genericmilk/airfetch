// Pure data — picker options, status labels, browser allow-list. These
// don't change at runtime so they live outside the reactive store.

export const VIDEO_QUALITIES = [
  ['best',  'Best available'],
  ['q2160', '2160p (4K)'],
  ['q1440', '1440p (2K)'],
  ['q1080', '1080p (Full HD)'],
  ['q720',  '720p (HD)'],
  ['q480',  '480p'],
  ['q360',  '360p'],
  ['worst', 'Worst (smallest)'],
];

export const VIDEO_CONTAINERS = ['mp4', 'mkv', 'webm', 'mov'];

export const AUDIO_FORMATS = [
  ['best', 'Best (no re-encode)'],
  ['mp3', 'MP3'], ['m4a', 'M4A'], ['aac', 'AAC'],
  ['opus', 'OPUS'], ['flac', 'FLAC'], ['wav', 'WAV'],
  ['vorbis', 'VORBIS'], ['alac', 'ALAC'],
];

export const RECODE_FORMATS = [
  ['none', 'No re-encoding'],
  ['mp4', 'MP4'], ['mkv', 'MKV'], ['mov', 'MOV'],
  ['avi', 'AVI'], ['webm', 'WEBM'], ['flv', 'FLV'], ['gif', 'GIF'],
];

export const SELECTABLE_BROWSERS = [
  'safari', 'chrome', 'chromeCanary', 'arc', 'firefox',
  'edge', 'brave', 'vivaldi', 'opera', 'chromium',
];

export const STATUS_LABELS = {
  queued: 'Queued', running: 'Downloading', merging: 'Processing',
  paused: 'Paused',
  finished: 'Finished', failed: 'Failed', cancelled: 'Cancelled',
};
