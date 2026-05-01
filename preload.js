'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('airfetch', {
  getState: () => invoke('state'),

  start: (url, options) => invoke('start', { url, options }),
  startMultiple: (urls, options) => invoke('startMultiple', { urls, options }),
  cancel: (jobId) => invoke('cancel', { jobId }),
  pause: (jobId) => invoke('pause', { jobId }),
  resume: (jobId) => invoke('resume', { jobId }),
  retry: (historyId) => invoke('retry', { historyId }),
  removeHistory: (id) => invoke('removeHistory', { id }),
  clearHistory: () => invoke('clearHistory'),
  clearFinishedJobs: () => invoke('clearFinishedJobs'),

  setPrefs: (patch) => invoke('setPrefs', { patch }),
  setDefaults: (patch) => invoke('setDefaults', { patch }),
  dismissLaunchError: () => invoke('dismissLaunchError'),

  install: () => invoke('install'),
  resetUpgradeState: () => invoke('resetUpgradeState'),

  checkAppUpdate: () => invoke('checkAppUpdate'),
  openReleasePage: () => invoke('openReleasePage'),
  dismissAppUpdate: () => invoke('dismissAppUpdate'),

  revealInFinder: (p) => invoke('revealInFinder', { path: p }),
  openFile: (p) => invoke('openFile', { path: p }),
  openOutputDir: () => invoke('openOutputDir'),
  chooseFolder: (initial) => invoke('chooseFolder', { initial }),
  chooseFile: (filters) => invoke('chooseFile', { filters }),

  readClipboard: () => invoke('readClipboard'),
  writeClipboard: (text) => invoke('writeClipboard', { text }),
  fileExists: (p) => invoke('fileExists', { path: p }),
  buildCommandPreview: (options) => invoke('buildCommandPreview', { options }),

  onState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('state', handler);
    return () => ipcRenderer.removeListener('state', handler);
  },
});
