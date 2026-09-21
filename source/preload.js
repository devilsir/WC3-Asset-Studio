'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');


contextBridge.exposeInMainWorld('WC3_UNSAVED', Object.freeze({
  setState: state => ipcRenderer.send('wc3-unsaved:set-state', state && typeof state === 'object' ? state : {}),
  confirmDiscard: (action='open another model', target='', summary='') => ipcRenderer.invoke('wc3-unsaved:confirm-discard', {action:String(action||'open another model'),target:String(target||''),summary:String(summary||'')}),
  onDownloadResult: callback => {
    if(typeof callback!=='function')return()=>{};
    const handler=(_event,payload)=>{try{callback(payload&&typeof payload==='object'?payload:{});}catch(_){}};
    ipcRenderer.on('wc3-download:result',handler);
    return()=>ipcRenderer.removeListener('wc3-download:result',handler);
  }
}));

contextBridge.exposeInMainWorld('WC3_CASC', Object.freeze({
  status: () => ipcRenderer.invoke('wc3-casc:status'),
  installFolderState: () => ipcRenderer.invoke('wc3-casc:install-folder-state'),
  chooseInstallFolder: () => ipcRenderer.invoke('wc3-casc:choose-install-folder'),
  setup: () => ipcRenderer.invoke('wc3-casc:setup'),
  readAssets: requests => ipcRenderer.invoke('wc3-casc:read-assets', { requests: Array.isArray(requests) ? requests : [] }),
  searchAssets: (query, type='all', limit=200) => ipcRenderer.invoke('wc3-casc:search-assets', { query:String(query||''), type:String(type||'all'), limit:Number(limit)||200 })
}));


contextBridge.exposeInMainWorld('WC3_LOCAL_FILES', Object.freeze({
  pathForFile: file => { try { return webUtils.getPathForFile(file) || ''; } catch (_) { return ''; } },
  scanModelTextures: (fileOrPath, refs) => {
    let modelPath = typeof fileOrPath === 'string' ? fileOrPath : '';
    if (!modelPath) { try { modelPath = webUtils.getPathForFile(fileOrPath) || ''; } catch (_) {} }
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

contextBridge.exposeInMainWorld('WC3_FILE_ASSOCIATIONS', Object.freeze({
  ready: () => ipcRenderer.invoke('wc3-file:renderer-ready'),
  readFile: filePath => ipcRenderer.invoke('wc3-file:read-associated', String(filePath || '')),
  openDefaultApps: () => ipcRenderer.invoke('wc3-associations:open-settings'),
  onOpenFile: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, filePath) => { try { callback(String(filePath || '')); } catch (_) {} };
    ipcRenderer.on('wc3-file:open-associated', handler);
    return () => ipcRenderer.removeListener('wc3-file:open-associated', handler);
  }
}));

