'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('WC3_CASC', Object.freeze({
  status: () => ipcRenderer.invoke('wc3-casc:status'),
  setup: () => ipcRenderer.invoke('wc3-casc:setup'),
  readAssets: requests => ipcRenderer.invoke('wc3-casc:read-assets', { requests: Array.isArray(requests) ? requests : [] })
}));


contextBridge.exposeInMainWorld('WC3_LOCAL_FILES', Object.freeze({
  scanModelTextures: (file, refs) => {
    let modelPath = '';
    try { modelPath = webUtils.getPathForFile(file) || ''; } catch (_) {}
    return ipcRenderer.invoke('wc3-local:scan-model-textures', {
      modelPath,
      refs: Array.isArray(refs) ? refs : []
    });
  }
}));

contextBridge.exposeInMainWorld('WC3_DIAGNOSTICS', Object.freeze({
  append: entry => ipcRenderer.invoke('wc3-log:append', entry && typeof entry === 'object' ? entry : {}),
  read: () => ipcRenderer.invoke('wc3-log:read'),
  clear: () => ipcRenderer.invoke('wc3-log:clear'),
  onMainLog: callback => {
    if(typeof callback !== 'function') return () => {};
    const handler = (_event, entry) => { try { callback(entry); } catch (_) {} };
    ipcRenderer.on('wc3-log:main', handler);
    return () => ipcRenderer.removeListener('wc3-log:main', handler);
  }
}));
