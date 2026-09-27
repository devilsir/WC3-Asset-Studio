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
  searchAssets: (query, type='all', limit=200, offset=0, artSet='sd') => ipcRenderer.invoke('wc3-casc:search-assets', { query:String(query||''), type:String(type||'all'), limit:Number(limit)||200, offset:Math.max(0,Number(offset)||0), artSet:String(artSet||'sd').toLowerCase() }),
  exportAssets: (requests, preservePath=true) => ipcRenderer.invoke('wc3-casc:export-assets', { requests:Array.isArray(requests)?requests:[], preservePath:preservePath!==false })
}));



contextBridge.exposeInMainWorld('WC3_EFFECTS', Object.freeze({
  status: () => ipcRenderer.invoke('wc3-effects:status'),
  selfTest: () => ipcRenderer.invoke('wc3-effects:self-test'),
  launchDesigner: payload => ipcRenderer.invoke('wc3-effects:launch-designer', payload && typeof payload==='object' ? payload : {}),
  chooseEpf: () => ipcRenderer.invoke('wc3-effects:choose-epf'),
  saveEpf: payload => ipcRenderer.invoke('wc3-effects:save-epf', payload && typeof payload==='object' ? payload : {}),
  choosePkb: () => ipcRenderer.invoke('wc3-effects:choose-pkb'),
  chooseBundle: () => ipcRenderer.invoke('wc3-effects:choose-bundle'),
  readBundle: bundlePath => ipcRenderer.invoke('wc3-effects:read-bundle', String(bundlePath||'')),
  saveBundle: payload => ipcRenderer.invoke('wc3-effects:save-bundle', payload && typeof payload==='object' ? payload : {}),
  decompile: payload => ipcRenderer.invoke('wc3-effects:decompile', payload && typeof payload==='object' ? payload : {}),
  build: payload => ipcRenderer.invoke('wc3-effects:build', payload && typeof payload==='object' ? payload : {}),
  saveCode: payload => ipcRenderer.invoke('wc3-effects:save-code', payload && typeof payload==='object' ? payload : {})
}));

contextBridge.exposeInMainWorld('WC3_LOCAL_FILES', Object.freeze({
  pathForFile: file => { try { return webUtils.getPathForFile(file) || ''; } catch (_) { return ''; } },
  saveBinary: (name, data, filters=[]) => ipcRenderer.invoke('wc3-file:save-binary', {
    name:String(name||'export.bin'),
    data,
    filters:Array.isArray(filters)?filters:[]
  }),
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

