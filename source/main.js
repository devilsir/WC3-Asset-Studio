'use strict';

const { app, BrowserWindow, Menu, protocol, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

const APP_SCHEME = 'wc3asset';
const APP_HOST = 'app';
const PRODUCT = 'WC3 Asset Studio v1.4';
const windowIcon = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const ASSOCIATED_EXTENSIONS = new Set(['.blp','.tga','.mdl','.mdx']);
const REGISTERED_APP_NAME = 'WC3 Asset Studio';
const ASSOCIATION_PROGIDS = Object.freeze({'.blp':'WC3AssetStudio.BLP','.tga':'WC3AssetStudio.TGA','.mdl':'WC3AssetStudio.MDL','.mdx':'WC3AssetStudio.MDX'});
let mainWindow = null;
let pendingAssociatedPaths = [];
let associatedRendererReady = false;
let allowDirtyClose = false;
let unsavedRendererState = { dirty:false, scopes:[], summary:'', lastChange:'' };
let registeredDownloadSession = null;
let registeredDownloadHandler = null;

// CascLib is the preferred local backend for stock Warcraft assets and FX/Spells.
// If a newer game build makes that native reader abort, WC3 Asset Studio can
// transparently use Blizzard's TACT/CDN as a read-only fallback. The pinned
// x64 CascLib blob is distributed by the MIT-licensed W3ModelViewer project.
const CASC_DLL_URL = 'https://raw.githubusercontent.com/Darithos/W3ModelViewer/b6c5658bc28a96910e87dfde733c90fdc346ffb5/native/CascLib.dll';
const CASC_DLL_GIT_BLOB_SHA1 = '35c3f71e0a4bbc88213e5f86328f86a1169f78f7';
const CASC_DLL_SIZE = 522752;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
const portableData = path.join(portableRoot, 'WC3 Asset Studio Data');
const cascDataDir = path.join(portableData, 'CASC');
const cascSettingsPath = path.join(cascDataDir, 'settings.json');
fs.mkdirSync(portableData, { recursive: true });
fs.mkdirSync(path.join(portableData, 'Session'), { recursive: true });
const logsDir = path.join(portableData, 'Logs');
fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(cascDataDir, { recursive: true });
function sessionLogStamp(date=new Date()){
  const pad=(value,width=2)=>String(value).padStart(width,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(),3)}-p${process.pid}`;
}
const runtimeLogPath = path.join(logsDir, `session-${sessionLogStamp()}.log`);
function logValue(value){
  if(value instanceof Error) return `${value.name||'Error'}: ${value.message||value}${value.stack?`\n${value.stack}`:''}`;
  if(typeof value==='string') return value;
  try{return JSON.stringify(value,(k,v)=>{if(v instanceof ArrayBuffer)return `[ArrayBuffer ${v.byteLength}]`;if(Buffer.isBuffer(v))return `[Buffer ${v.length}]`;return v;});}catch(_){return String(value);}
}
function appendRuntimeLog(level,source,message,detail='',broadcast=true){
  const entry={time:new Date().toISOString(),level:String(level||'info'),source:String(source||'Main'),message:String(message||''),detail:detail?logValue(detail):''};
  try{
    fs.appendFileSync(runtimeLogPath,`${JSON.stringify(entry)}\n`,'utf8');
    const stat=fs.statSync(runtimeLogPath);if(stat.size>8*1024*1024){const fd=fs.openSync(runtimeLogPath,'r'),keep=4*1024*1024,start=Math.max(0,stat.size-keep),buf=Buffer.alloc(stat.size-start);fs.readSync(fd,buf,0,buf.length,start);fs.closeSync(fd);const cut=buf.indexOf(0x0a);fs.writeFileSync(runtimeLogPath,cut>=0?buf.subarray(cut+1):buf);}
  }catch(_){}
  if(broadcast && mainWindow && !mainWindow.isDestroyed()){
    try{mainWindow.webContents.send('wc3-log:main',entry);}catch(_){}
  }
  return entry;
}
function readRuntimeLog(){
  try{const stat=fs.statSync(runtimeLogPath);const max=2*1024*1024;const start=Math.max(0,stat.size-max);const fd=fs.openSync(runtimeLogPath,'r');const buf=Buffer.alloc(stat.size-start);fs.readSync(fd,buf,0,buf.length,start);fs.closeSync(fd);return buf.toString('utf8');}catch(_){return '';}
}
function clearRuntimeLog(){try{fs.writeFileSync(runtimeLogPath,'','utf8');return true;}catch(_){return false;}}
function mainLog(level,source,message,detail=''){return appendRuntimeLog(level,source,message,detail,true);}

app.setName(PRODUCT);
app.setPath('userData', portableData);
app.setPath('sessionData', path.join(portableData, 'Session'));
app.setPath('logs', path.join(portableData, 'Logs'));

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.wasm', 'application/wasm'],
  ['.blp', 'application/octet-stream'],
  ['.tga', 'application/octet-stream'],
  ['.dds', 'application/octet-stream'],
  ['.mdx', 'application/octet-stream'],
  ['.mdl', 'text/plain; charset=utf-8']
]);

function appAssetPath(urlString) {
  const url = new URL(urlString);
  if (url.hostname !== APP_HOST) return null;
  let rel = decodeURIComponent(url.pathname || '/');
  if (rel === '/' || rel === '') rel = '/index.html';
  rel = rel.replace(/^\/+/, '');
  const root = path.resolve(__dirname, 'app');
  const resolved = path.resolve(root, rel);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

async function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async request => {
    const filePath = appAssetPath(request.url);
    if (!filePath) return new Response('Forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(filePath);
      const type = mime.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    } catch (error) {
      if (error && error.code === 'ENOENT') return new Response('Not found', { status: 404 });
      mainLog('error','Protocol','Asset protocol error',error);
      console.error('[protocol]', error);
      return new Response('Internal error', { status: 500 });
    }
  });
}

function readCascSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(cascSettingsPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeCascSettings(next) {
  fs.writeFileSync(cascSettingsPath, JSON.stringify(next || {}, null, 2), 'utf8');
}

function validWarcraftRoot(root) {
  if (!root || typeof root !== 'string') return false;
  try {
    return fs.statSync(root).isDirectory() &&
      fs.existsSync(path.join(root, '.build.info')) &&
      fs.existsSync(path.join(root, 'Data'));
  } catch (_) {
    return false;
  }
}

function normalizeWarcraftRoot(root) {
  if (!root) return '';
  let p = path.resolve(root);
  if (validWarcraftRoot(p)) return p;
  const parent = path.dirname(p);
  if (validWarcraftRoot(parent)) return parent;
  return p;
}

function detectWarcraftRoot(preferred='') {
  const pf86 = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || 'C:\\Program Files (x86)';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const candidates = [
    preferred,
    path.join(pf86, 'Warcraft III'),
    path.join(pf, 'Warcraft III'),
    'C:\\Program Files (x86)\\Warcraft III',
    'C:\\Program Files\\Warcraft III'
  ].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = normalizeWarcraftRoot(candidate);
    if (validWarcraftRoot(normalized)) return normalized;
  }
  return '';
}

function warcraftInstallFolderState() {
  const settings = readCascSettings();
  const saved = normalizeWarcraftRoot(settings.installPath || '');
  const valid = validWarcraftRoot(saved);
  return {
    configured: valid,
    confirmed: valid && settings.installPathConfirmed !== false,
    installPath: valid ? saved : '',
    valid,
    firstRunPending: !valid
  };
}

async function chooseWarcraftInstallFolder(owner, options={}) {
  const firstRun = options.firstRun === true;
  const settings = readCascSettings();
  const saved = normalizeWarcraftRoot(settings.installPath || '');
  const suggested = validWarcraftRoot(saved) ? saved : detectWarcraftRoot('');
  while (true) {
    const pick = await dialog.showOpenDialog(owner || undefined, {
      title: firstRun ? 'WC3 Asset Studio - Choose Warcraft III installation folder' : 'Choose Warcraft III installation folder',
      defaultPath: suggested || undefined,
      buttonLabel: 'Use this Warcraft III folder',
      properties: ['openDirectory']
    });
    if (pick.canceled || !pick.filePaths[0]) {
      mainLog('info','CASC',firstRun?'First-run Warcraft folder selection cancelled':'Warcraft folder selection cancelled');
      return { ...warcraftInstallFolderState(), canceled:true };
    }
    const installPath = normalizeWarcraftRoot(pick.filePaths[0]);
    if (!validWarcraftRoot(installPath)) {
      await dialog.showMessageBox(owner || undefined, {
        type: 'error',
        title: 'Warcraft III installation not found',
        message: 'That folder is not a Warcraft III installation.',
        detail: 'Choose the Warcraft III folder that contains both .build.info and the Data folder.',
        buttons: ['Choose another folder'],
        defaultId: 0,
        noLink: true
      });
      continue;
    }
    const previous = validWarcraftRoot(saved) ? saved : '';
    const changed = !previous || path.resolve(previous).toLowerCase() !== path.resolve(installPath).toLowerCase();
    const next = {
      ...settings,
      installPath,
      installPathConfirmed:true,
      installPathSelectedAt:new Date().toISOString(),
      buildFingerprint:warcraftBuildFingerprint(installPath)
    };
    if (changed) {
      next.backend='cdn';
      next.storageParam='';
      next.cascVerified=false;
      next.lastProbeError='';
      next.nativeLastError='';
      next.nativeCrashBuild='';
    }
    writeCascSettings(next);
    mainLog('info','CASC','Warcraft III installation folder saved',{installPath,firstRun,changed});
    return { configured:true, confirmed:true, valid:true, firstRunPending:false, installPath, canceled:false, changed };
  }
}

async function ensureFirstRunWarcraftInstallFolder(owner) {
  if (process.platform !== 'win32') return warcraftInstallFolderState();
  const state = warcraftInstallFolderState();
  if (state.valid) {
    const settings=readCascSettings();
    if (settings.installPathConfirmed !== true) {
      writeCascSettings({...settings,installPath:state.installPath,installPathConfirmed:true,installPathSelectedAt:settings.installPathSelectedAt||new Date().toISOString()});
      mainLog('info','CASC','Migrated existing Warcraft installation path to confirmed first-run setting',{installPath:state.installPath});
    }
    return {...state,confirmed:true,firstRunPending:false};
  }
  return chooseWarcraftInstallFolder(owner,{firstRun:true});
}

function warcraftBuildFingerprint(root) {
  const installPath = normalizeWarcraftRoot(root || '');
  if (!validWarcraftRoot(installPath)) return '';
  try {
    const info = fs.readFileSync(path.join(installPath, '.build.info'));
    return crypto.createHash('sha1').update(info).digest('hex');
  } catch (_) {
    return '';
  }
}

function nativeCrashText(value) {
  return /CascLib crashed|0xC0000409|3221226505|0xC0000005|0xC0000374/i.test(String(value || ''));
}

function nativeCrashRememberedForBuild(settings, installPath) {
  const remembered = String(settings?.nativeLastError || settings?.lastProbeError || '');
  if (!nativeCrashText(remembered)) return false;
  const currentBuild = warcraftBuildFingerprint(installPath);
  const failedBuild = String(settings?.nativeCrashBuild || '');
  // Older settings did not save a build fingerprint. Be conservative and do
  // not re-run a helper that has already fail-fast crashed on this machine.
  if (!currentBuild || !failedBuild) return true;
  return currentBuild === failedBuild;
}

function cascScriptPath() {
  const packaged = path.join(process.resourcesPath, 'tools', 'casc-reader.ps1');
  const dev = path.join(__dirname, 'tools', 'casc-reader.ps1');
  return fs.existsSync(packaged) ? packaged : dev;
}

function cascCdnScriptPath() {
  const packaged = path.join(process.resourcesPath, 'tools', 'casc-cdn-reader.js');
  const dev = path.join(__dirname, 'tools', 'casc-cdn-reader.js');
  return fs.existsSync(packaged) ? packaged : dev;
}

function cascDllPath(settings = readCascSettings()) {
  const candidates = [
    settings.dllPath,
    path.join(cascDataDir, 'CascLib.dll'),
    path.join(__dirname, 'tools', 'CascLib.dll'),
    path.join(process.resourcesPath, 'tools', 'CascLib.dll')
  ].filter(Boolean);
  return candidates.find(p => {
    try { return fs.statSync(p).isFile() && fs.statSync(p).size > 100000; }
    catch (_) { return false; }
  }) || '';
}

function gitBlobSha1(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function downloadBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects while downloading CASC support.'));
    const req = https.get(url, { headers: { 'User-Agent': 'WC3-Asset-Studio/1.4' } }, res => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadBuffer(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`Download failed (HTTP ${status}).`));
      }
      const chunks = [];
      let size = 0;
      res.on('data', c => {
        size += c.length;
        if (size > 4 * 1024 * 1024) {
          req.destroy(new Error('Unexpected CASC helper size.'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(30000, () => req.destroy(new Error('CASC helper download timed out.')));
    req.on('error', reject);
  });
}

async function downloadPinnedCascDll() {
  const data = await downloadBuffer(CASC_DLL_URL);
  if (data.length !== CASC_DLL_SIZE || gitBlobSha1(data) !== CASC_DLL_GIT_BLOB_SHA1) {
    throw new Error('Downloaded CascLib.dll did not match the pinned integrity hash.');
  }
  const out = path.join(cascDataDir, 'CascLib.dll');
  await fs.promises.writeFile(out, data);
  return out;
}

async function chooseExistingCascDll(owner) {
  const pick = await dialog.showOpenDialog(owner || undefined, {
    title: 'Select CascLib.dll',
    properties: ['openFile'],
    filters: [{ name: 'CascLib', extensions: ['dll'] }]
  });
  if (pick.canceled || !pick.filePaths[0]) return '';
  const src = pick.filePaths[0];
  const first = await fs.promises.readFile(src, { encoding: null });
  if (first.length < 100000 || first[0] !== 0x4d || first[1] !== 0x5a) throw new Error('That file does not look like a valid Windows CascLib.dll.');
  const out = path.join(cascDataDir, 'CascLib.dll');
  await fs.promises.copyFile(src, out);
  return out;
}

async function ensureCascDll(owner) {
  const existing = cascDllPath();
  if (existing) return existing;
  const answer = await dialog.showMessageBox(owner || undefined, {
    type: 'question',
    title: 'Enable local CASC effects',
    message: 'WC3 Asset Studio needs CascLib.dll to read Warcraft III CASC assets.',
    detail: 'Only assets referenced by the model are requested, including stock textures and external FX/Spell models. You can download the pinned MIT-licensed CascLib build (~510 KB), choose an existing CascLib.dll, or cancel.',
    buttons: ['Download CASC support', 'Choose CascLib.dll', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });
  if (answer.response === 0) return downloadPinnedCascDll();
  if (answer.response === 1) return chooseExistingCascDll(owner);
  return '';
}

function cascStatus() {
  const settings = readCascSettings();
  const savedInstallPath = normalizeWarcraftRoot(settings.installPath || '');
  const installPath = validWarcraftRoot(savedInstallPath) ? savedInstallPath : '';
  const dllPath = cascDllPath(settings);
  const script = cascScriptPath();
  const cdnScript = cascCdnScriptPath();
  const platformReady = process.platform === 'win32';
  const rootReady = validWarcraftRoot(installPath);
  const nativeReady = platformReady && rootReady && !!dllPath && fs.existsSync(script);
  const cdnHelperReady = fs.existsSync(cdnScript);
  const savedBackend = String(settings.backend || '').toLowerCase();
  const rememberedNativeCrash = nativeCrashRememberedForBuild(settings, installPath);

  // Blizzard TACT/CDN is the safe primary backend. Native CascLib remains an
  // offline/local fallback only when it was explicitly verified and has not
  // fail-fast crashed on the current Warcraft build.
  const backend = savedBackend === 'native' && settings.cascVerified === true && !rememberedNativeCrash
    ? 'native'
    : 'cdn';
  const verified = rootReady && settings.cascVerified === true && (backend === 'cdn' ? cdnHelperReady : !!settings.storageParam);
  const ready = rootReady && (backend === 'cdn' ? cdnHelperReady : nativeReady);
  let message;
  if (!rootReady) message = 'Choose the Warcraft III install folder.';
  else if (ready && verified && backend === 'cdn') message = 'Warcraft CASC connected · Blizzard TACT/CDN.';
  else if (ready && verified) message = 'Local CASC verified.';
  else if (ready) message = backend === 'cdn' ? 'Warcraft CASC resolver ready · connect to verify assets.' : 'Local CASC ready · verification required.';
  else if (!cdnHelperReady && !nativeReady) message = 'Warcraft CASC resolver is unavailable in this build.';
  else if (!dllPath && backend === 'native') message = 'CascLib support is not installed yet.';
  else message = 'CASC bridge is not available.';
  return {
    ready,
    verified,
    backend,
    storageParam: verified ? String(settings.storageParam || (backend === 'cdn' ? 'cdn:w3:us' : '')) : '',
    platformReady,
    installPath: rootReady ? installPath : '',
    buildFingerprint: rootReady ? warcraftBuildFingerprint(installPath) : '',
    dllReady: !!dllPath,
    helperReady: fs.existsSync(script),
    cdnHelperReady,
    nativeReady,
    // Keep the native crash quarantine internal so the same broken CascLib is
    // not retried for this Warcraft build. A healthy CDN connection should not
    // surface an old native crash as a current error in diagnostics/UI.
    nativeSuppressed: rememberedNativeCrash,
    nativeFallback: rememberedNativeCrash ? 'disabled-for-current-build' : (nativeReady ? 'available' : 'unavailable'),
    nativeLastError: backend === 'native' && !verified ? String(settings.nativeLastError || settings.lastProbeError || '') : '',
    message
  };
}

async function setupCasc(owner) {
  mainLog('info','CASC','Setup requested');
  let settings = readCascSettings();
  let installPath = normalizeWarcraftRoot(settings.installPath || '');
  if (!validWarcraftRoot(installPath)) {
    const chosen = await chooseWarcraftInstallFolder(owner,{firstRun:false});
    if (!chosen || chosen.canceled || !chosen.valid) return cascStatus();
    installPath = chosen.installPath;
    settings = readCascSettings();
  }

  const buildFingerprint = warcraftBuildFingerprint(installPath);

  // Safe path first: use Blizzard's official TACT/CDN metadata and the exact
  // active build from the user's .build.info. This avoids native fail-fast
  // crashes while still resolving the same Warcraft CASC assets.
  let cdnError = null;
  try {
    const cdn = await probeCascCdn('us', installPath);
    const storageParam = `cdn:w3:${cdn.region || 'us'}`;
    writeCascSettings({
      ...settings,
      installPath,
      backend:'cdn',
      storageParam,
      cascVerified:true,
      lastProbeError:'',
      nativeLastError:'',
      nativeCrashBuild:'',
      buildFingerprint
    });
    const finalStatus = cascStatus();
    mainLog('info','CASC','Setup completed',{backend:'cdn',ready:finalStatus.ready,verified:true,installPath:finalStatus.installPath,storageParam,rootEntries:cdn.rootEntries||0,archives:cdn.archives||0,sourceBuild:cdn.sourceBuild||''});
    return finalStatus;
  } catch (e) {
    cdnError = e;
    mainLog('warn','CASC','Blizzard TACT/CDN setup failed; local CascLib fallback will be considered',{installPath,error:e.message||String(e)});
  }

  // Offline/local fallback. Never re-run CascLib after a fail-fast crash on
  // the same game build; that only repeats 0xC0000409 and adds no information.
  const rememberedCrash = nativeCrashRememberedForBuild(settings, installPath);
  if (rememberedCrash) {
    const remembered = String(settings.nativeLastError || settings.lastProbeError || 'native CascLib crash');
    const err = new Error(`Warcraft CASC connection failed. Blizzard TACT/CDN: ${cdnError?.message||cdnError}. Local CascLib is disabled for this Warcraft build after a previous fail-fast crash (${remembered}).`);
    writeCascSettings({ ...settings, installPath, backend:'cdn', storageParam:'', cascVerified:false, lastProbeError:err.message, buildFingerprint });
    mainLog('error','CASC','Setup failed; native retry suppressed for current build',{cdnError:cdnError?.message||String(cdnError),nativeError:remembered,buildFingerprint});
    throw err;
  }

  let dllPath = cascDllPath(settings);
  if (!dllPath && process.platform === 'win32') {
    try { dllPath = await ensureCascDll(owner); }
    catch (e) { mainLog('warn','CASC','Local CascLib setup was unavailable',e); }
  }
  if (!dllPath || process.platform !== 'win32' || !fs.existsSync(cascScriptPath())) {
    const err = new Error(`Warcraft CASC connection failed. Blizzard TACT/CDN: ${cdnError?.message||cdnError}. Local CascLib is unavailable.`);
    writeCascSettings({ ...settings, installPath, dllPath:dllPath||'', backend:'cdn', storageParam:'', cascVerified:false, lastProbeError:err.message, buildFingerprint });
    throw err;
  }

  try {
    const storageParam = await probeCascStorage(installPath, dllPath, settings.backend === 'native' ? (settings.storageParam || '') : '');
    writeCascSettings({ ...settings, installPath, dllPath, backend:'native', storageParam, cascVerified:true, lastProbeError:'', nativeLastError:'', nativeCrashBuild:'', buildFingerprint });
    const finalStatus = cascStatus();
    mainLog('info','CASC','Setup completed with local CascLib fallback',{backend:'native',ready:finalStatus.ready,verified:true,installPath:finalStatus.installPath,storageParam,dllReady:finalStatus.dllReady});
    return finalStatus;
  } catch (nativeError) {
    const nativeMessage = nativeError.message||String(nativeError);
    const crashed = !!nativeError.nativeCrash || nativeCrashText(nativeMessage);
    writeCascSettings({
      ...settings,
      installPath,
      dllPath,
      backend:'cdn',
      storageParam:'',
      cascVerified:false,
      lastProbeError:`Warcraft CASC connection failed. Blizzard TACT/CDN: ${cdnError?.message||cdnError}. Local CascLib: ${nativeMessage}`,
      nativeLastError:nativeMessage,
      nativeCrashBuild:crashed ? buildFingerprint : '',
      buildFingerprint
    });
    mainLog('error','CASC','Setup failed for CDN and local backends',{cdnError:cdnError?.message||String(cdnError),nativeError:nativeMessage,nativeCrash:crashed,buildFingerprint});
    throw new Error(`Warcraft CASC connection failed. Blizzard TACT/CDN: ${cdnError?.message||cdnError}. Local CascLib: ${nativeMessage}`);
  }
}

function cleanCascRelative(input) {
  let s = String(input || '').trim().replace(/\//g, '\\');
  s = s.replace(/^\\+/, '');
  if (s.includes(':')) s = s.slice(s.lastIndexOf(':') + 1);
  s = s.replace(/^war3\.w3mod[\\:]+/i, '');
  return s;
}

function effectLikePath(p) {
  const s = String(p || '').toLowerCase().replace(/\\/g, '/');
  return /(abilities|spells|effects?|spawnmodels|missile|aura|buff|particles?|specialart|sharedmodels|\.pkb$|\.pkfx$)/.test(s);
}

function allowedCascRequest(req) {
  if (!req || typeof req.path !== 'string' || req.path.length > 1024) return false;
  const kind = String(req.kind || 'effect');
  const cleaned = cleanCascRelative(req.path);
  const ext = path.extname(cleaned).toLowerCase();

  // war3mapImported is map/custom content. It is never a stock Warcraft CASC
  // namespace, so querying CASC for it only adds a long probe delay and noisy
  // false-missing results.
  if ((kind === 'texture' || kind === 'effect-texture') && /^war3mapimported[\\/]/i.test(cleaned)) return false;

  if (kind === 'effect') return ['.mdx', '.mdl', '.pkb', '.pkfx'].includes(ext);
  // Warcraft Library previews/reference models use model-specific request kinds.
  // Keep these separate from generic effects, but allow the same stock MDX/MDL
  // files through the CASC safety filter instead of silently rejecting them.
  if (kind === 'model' || kind === 'effect-model' || kind === 'reference-model' || kind === 'unit-model') return ['.mdx', '.mdl'].includes(ext);
  if (kind === 'texture' || kind === 'effect-texture') return ['.blp', '.dds', '.tga', '.tif', '.tiff', '.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  if (kind === 'sound' || kind === 'audio') return ['.wav', '.mp3', '.ogg', '.flac', '.opus'].includes(ext);
  return false;
}

function cascCandidates(req) {
  const raw = String(req.path || '').trim().replace(/\//g, '\\');
  const rel0 = cleanCascRelative(raw);
  const rels = [rel0];
  if (/\.mdl$/i.test(rel0)) rels.push(rel0.replace(/\.mdl$/i, '.mdx'));
  // Warcraft models often keep legacy BLP/TGA paths even when Reforged/DE
  // stores the actual texture as DDS. Try the authored path first, then the
  // equivalent modern/classic spellings without changing the model itself.
  if (/\.blp$/i.test(rel0)) rels.push(rel0.replace(/\.blp$/i, '.dds'));
  if (/\.dds$/i.test(rel0)) rels.push(rel0.replace(/\.dds$/i, '.blp'));
  if (/\.tga$/i.test(rel0)) {
    rels.push(rel0.replace(/\.tga$/i, '.blp'));
    rels.push(rel0.replace(/\.tga$/i, '.dds'));
  }
  // Reforged MDX commonly authors material references as .tif even though
  // retail CASC stores the payload as DDS under _hd.w3mod.
  if (/\.tiff?$/i.test(rel0)) {
    rels.push(rel0.replace(/\.tiff?$/i, '.dds'));
    rels.push(rel0.replace(/\.tiff?$/i, '.blp'));
    rels.push(rel0.replace(/\.tiff?$/i, '.tga'));
  }
  const requestedArtSet = String(req.artSet || '').toLowerCase();
  // "DE" here is the explicit _de.w3mod namespace requested by the CASC UI.
  // Keep the three choices distinct; legacy callers still map classic/stock
  // to SD and auto-hd to HD.
  const artSet = requestedArtSet === 'hd' || requestedArtSet === 'auto-hd'
    ? 'hd'
    : requestedArtSet === 'de'
      ? 'de'
      : 'sd';
  const prefixes = artSet === 'hd'
    ? ['war3.w3mod:_hd.w3mod:', 'war3.w3mod:', 'war3sd.w3mod:', '', 'war3.w3mod:_de.w3mod:']
    : artSet === 'de'
      ? ['war3.w3mod:_de.w3mod:', 'war3.w3mod:', 'war3.w3mod:_hd.w3mod:', 'war3sd.w3mod:', '']
      : ['war3sd.w3mod:', 'war3.w3mod:', '', 'war3.w3mod:_hd.w3mod:', 'war3.w3mod:_de.w3mod:'];
  const out = [];
  if (raw.includes(':')) out.push(raw);
  for (const rel of rels) for (const prefix of prefixes) out.push(prefix + rel);
  return [...new Set(out.filter(Boolean))].slice(0, 24);
}

function formatCascExitCode(code) {
  if (code === null || code === undefined) return '';
  const n = Number(code);
  if (!Number.isFinite(n)) return String(code);
  const u = n >>> 0;
  return `${n} (0x${u.toString(16).toUpperCase().padStart(8,'0')})`;
}

function isNativeCascCrashCode(code) {
  const u = (Number(code) >>> 0);
  return u === 0xC0000409 || u === 0xC0000005 || u === 0xC0000374;
}

function cascStorageCandidates(installPath, preferred='') {
  const root = String(installPath || '').replace(/[\\/]+$/,'');
  const saved = String(preferred || '').trim();
  const values = [];

  // CascLib's documented path/product delimiter is '*', e.g.:
  //   C:\\Games\\Warcraft III*w3
  // A previous build used ':w3'. Keep the colon spelling only as a late
  // compatibility fallback, but always probe the documented form first.
  if (saved && saved.includes('*')) values.push(saved);
  values.push(`${root}*w3`, `${root}*w3t`);
  if (saved && !values.includes(saved)) values.push(saved);
  values.push(`${root}:w3`, `${root}:w3t`, root);

  return [...new Set(values.filter(Boolean))];
}

function runCascReaderProcess(storageParam, dllPath, requests, probeOnly=false, extra={}) {
  return new Promise((resolve, reject) => {
    const script = cascScriptPath();
    const indexed = requests.map((r, i) => ({
      id: Number.isInteger(r.__requestIndex) ? r.__requestIndex : i,
      candidates: cascCandidates(r)
    }));
    const payload = JSON.stringify({
      storageParam,
      probeOnly: !!probeOnly,
      requests: indexed,
      ...(extra && typeof extra==='object' ? extra : {})
    });
    const ps = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script
    ], {
      cwd: path.dirname(dllPath),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    let outSize = 0;
    const limit = 384 * 1024 * 1024;
    let settled = false;
    const timer = setTimeout(() => {
      try { ps.kill(); } catch (_) {}
    }, probeOnly ? 30000 : 45000);
    ps.stdout.on('data', c => {
      outSize += c.length;
      if (outSize > limit) {
        try { ps.kill(); } catch (_) {}
      } else stdout.push(c);
    });
    ps.stderr.on('data', c => stderr.push(c));
    ps.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err.storageParam = storageParam;
      reject(err);
    });
    ps.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString('utf8').trim();
      const errText = Buffer.concat(stderr).toString('utf8').trim();
      if (code !== 0) {
        const exitText = formatCascExitCode(code);
        const err = new Error(
          errText ||
          (isNativeCascCrashCode(code)
            ? `CASC native reader crashed with ${exitText}.`
            : `CASC reader exited with code ${exitText || code}.`)
        );
        err.exitCode = code;
        err.stderr = errText;
        err.storageParam = storageParam;
        err.nativeCrash = isNativeCascCrashCode(code);
        return reject(err);
      }
      try {
        const parsed = out ? JSON.parse(out) : { results: [] };
        parsed.__stderr = errText;
        resolve(parsed);
      } catch (e) {
        const err = new Error(`CASC reader returned invalid data${errText ? `: ${errText}` : '.'}`);
        err.stderr = errText;
        err.storageParam = storageParam;
        reject(err);
      }
    });
    ps.stdin.end(payload, 'utf8');
  });
}

function runCascCdnProcess(requests, probeOnly=false, region='us', extra={}) {
  return new Promise((resolve, reject) => {
    const helper = cascCdnScriptPath();
    if (!fs.existsSync(helper)) return reject(new Error('CASC CDN fallback helper is missing from this build.'));
    const indexed = (requests || []).map((r, i) => ({
      id: Number.isInteger(r.__requestIndex) ? r.__requestIndex : i,
      candidates: cascCandidates(r)
    }));
    const payload = JSON.stringify({
      region: String(region || 'us').toLowerCase(),
      cacheDir: path.join(cascDataDir, 'CDNCache'),
      installPath: normalizeWarcraftRoot(extra.installPath || ''),
      probeOnly: !!probeOnly,
      requests: indexed,
      ...(extra && typeof extra==='object' ? extra : {})
    });
    const child = spawn(process.execPath, [helper], {
      windowsHide: true,
      stdio: ['pipe','pipe','pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE:'1' }
    });
    const stdout=[]; const stderr=[]; let outSize=0; let settled=false;
    const maxOut = 384 * 1024 * 1024;
    const timer=setTimeout(()=>{try{child.kill();}catch(_){ }}, probeOnly ? 90000 : 150000);
    child.stdout.on('data',c=>{outSize+=c.length;if(outSize>maxOut){try{child.kill();}catch(_){}}else stdout.push(c);});
    child.stderr.on('data',c=>stderr.push(c));
    child.on('error',err=>{if(settled)return;settled=true;clearTimeout(timer);reject(err);});
    child.on('close',code=>{
      if(settled)return;settled=true;clearTimeout(timer);
      const out=Buffer.concat(stdout).toString('utf8').trim();
      const errText=Buffer.concat(stderr).toString('utf8').trim();
      if(errText) mainLog(code===0?'debug':'warn','CASC CDN','Helper diagnostics',errText);
      if(code!==0){const err=new Error((errText.match(/CASC_CDN_ERROR\s+([^\r\n]+)/)||[])[1]||errText||`CASC CDN helper exited with code ${code}.`);err.exitCode=code;err.stderr=errText;return reject(err);}
      try{const parsed=out?JSON.parse(out):{results:[]};parsed.__stderr=errText;resolve(parsed);}
      catch(e){const err=new Error(`CASC CDN helper returned invalid data${errText?`: ${errText}`:'.'}`);err.stderr=errText;reject(err);}
    });
    child.stdin.end(payload,'utf8');
  });
}

async function searchCascAssets(payload={}) {
  const query=String(payload.query||'').trim();
  const type=String(payload.type||'all').toLowerCase();
  const limit=Math.max(1,Math.min(500,Number(payload.limit)||200));
  const offset=Math.max(0,Math.min(100000,Number(payload.offset)||0));
  const artSet=['sd','hd','de'].includes(String(payload.artSet||'').toLowerCase())?String(payload.artSet).toLowerCase():'sd';
  const settings=readCascSettings();
  const installPath=normalizeWarcraftRoot(settings.installPath||'');
  if(!validWarcraftRoot(installPath))throw new Error('Choose the Warcraft III installation folder before searching CASC assets.');
  const region=String(settings.storageParam||'').startsWith('cdn:w3:') ? String(settings.storageParam).split(':')[2]||'us' : 'us';
  const result=await runCascCdnProcess([],false,region,{installPath,search:{query,type,limit,offset,artSet}});
  const results=Array.isArray(result.results)?result.results:[];
  mainLog('info','CASC CDN','Asset search completed',{query,type,artSet,offset,limit,count:results.length,total:Number(result.total)||results.length});
  return {backend:'cdn',region:result.region||region,artSet:result.artSet||artSet,results,total:Number(result.total)||results.length,offset:Number.isFinite(Number(result.offset))?Number(result.offset):offset,limit:Number.isFinite(Number(result.limit))?Number(result.limit):limit};
}

function cascExportRelative(assetPath, preservePath=true) {
  const cleaned=cleanCascRelative(assetPath).replace(/\\/g,'/');
  const parts=cleaned.split('/').filter(Boolean).filter(part=>part!=='.'&&part!=='..').map(part=>part.replace(/[<>:"|?*\x00-\x1F]/g,'_'));
  const safe=parts.join(path.sep);
  if(!safe)return 'warcraft_asset.bin';
  return preservePath?safe:path.basename(safe);
}

function uniqueExportPath(targetPath, used) {
  let out=targetPath, key=path.resolve(out).toLowerCase(), i=2;
  if(!used.has(key)){used.add(key);return out;}
  const ext=path.extname(out), base=out.slice(0,out.length-ext.length);
  while(used.has(path.resolve(`${base}_${i}${ext}`).toLowerCase()))i++;
  out=`${base}_${i}${ext}`;used.add(path.resolve(out).toLowerCase());return out;
}

async function exportCascAssets(payload={}) {
  const preservePath=payload.preservePath!==false;
  const requests=Array.isArray(payload.requests)?payload.requests.filter(allowedCascRequest).slice(0,64):[];
  if(!requests.length)return {ok:false,canceled:false,files:[],error:'No supported Warcraft assets were selected for export.'};
  const pick=await dialog.showOpenDialog(mainWindow||undefined,{title:'Export Warcraft game storage assets',properties:['openDirectory','createDirectory']});
  if(pick.canceled||!pick.filePaths?.[0])return {ok:false,canceled:true,files:[]};
  const folder=pick.filePaths[0];
  const read=await readCascAssets({requests});
  const used=new Set(),files=[];
  for(const hit of read.results||[]){
    if(!hit?.found||!hit.data)continue;
    const req=requests[hit.requestIndex]||{};
    const rel=cascExportRelative(hit.resolvedPath||hit.requestedPath||req.path,preservePath);
    const target=uniqueExportPath(path.join(folder,rel),used);
    await fs.promises.mkdir(path.dirname(target),{recursive:true});
    const data=Buffer.from(hit.data instanceof ArrayBuffer?new Uint8Array(hit.data):hit.data);
    await fs.promises.writeFile(target,data);
    files.push({requestedPath:hit.requestedPath||req.path||'',resolvedPath:hit.resolvedPath||'',path:target,size:data.length});
  }
  mainLog('info','Game Storage','Export completed',{folder,preservePath,requested:requests.length,exported:files.length,totalBytes:files.reduce((n,f)=>n+f.size,0)});
  return {ok:true,canceled:false,folder,files,missing:Math.max(0,requests.length-files.length)};
}

async function probeCascCdn(region='us', installPath='') {
  mainLog('info','CASC CDN','Probing Blizzard Warcraft III CDN',{region});
  const result=await runCascCdnProcess([],true,region,{installPath:normalizeWarcraftRoot(installPath||'')});
  mainLog('info','CASC CDN','CDN probe succeeded',{region:result.region||region,rootEntries:result.rootEntries||0,archives:result.archives||0});
  return result;
}

async function probeCascStorage(installPath, dllPath, preferred='') {
  const attempts = [];
  for (const storageParam of cascStorageCandidates(installPath, preferred)) {
    try {
      mainLog('info','CASC','Probing storage',{storageParam});
      const result = await runCascReaderProcess(storageParam, dllPath, [], true);
      mainLog('info','CASC','Storage probe succeeded',{storageParam,stderr:result.__stderr||''});
      return storageParam;
    } catch (e) {
      attempts.push({
        storageParam,
        exitCode: e.exitCode,
        nativeCrash: !!e.nativeCrash,
        detail: e.stderr || e.message || String(e)
      });
      mainLog(e.nativeCrash?'warn':'info','CASC','Storage probe failed',{
        storageParam,
        exitCode: formatCascExitCode(e.exitCode),
        nativeCrash: !!e.nativeCrash,
        detail: e.stderr || e.message || String(e)
      });
    }
  }
  const native = attempts.find(a => a.nativeCrash);
  const detail = attempts.map(a => `${a.storageParam} -> ${a.exitCode!==undefined?formatCascExitCode(a.exitCode):a.detail}`).join(' | ');
  const err = new Error(
    native
      ? `CascLib crashed while opening the Warcraft III storage (${formatCascExitCode(native.exitCode)}). ${detail}`
      : `Could not open the Warcraft III CASC storage. ${detail}`
  );
  err.attempts = attempts;
  err.nativeCrash = !!native;
  throw err;
}

async function runCascReaderResilient(storageParam, dllPath, requests) {
  const indexed = requests.map((r, i) => ({ ...r, __requestIndex: Number.isInteger(r.__requestIndex) ? r.__requestIndex : i }));
  async function readGroup(group, depth=0) {
    if (!group.length) return { results: [] };
    mainLog('info','CASC','Reader batch started',{
      storageParam,
      requestCount:group.length,
      depth,
      requests:group.map(r=>({index:r.__requestIndex,path:r.path,kind:r.kind,artSet:r.artSet}))
    });
    try {
      const parsed = await runCascReaderProcess(storageParam, dllPath, group, false);
      mainLog('info','CASC','Reader batch completed',{
        storageParam,
        requestCount:group.length,
        resultCount:(parsed.results||[]).length,
        stderr:parsed.__stderr||''
      });
      return parsed;
    } catch (e) {
      mainLog('error','CASC','Reader process failed',{
        storageParam,
        requestCount:group.length,
        exitCode:formatCascExitCode(e.exitCode),
        nativeCrash:!!e.nativeCrash,
        stderr:e.stderr||'',
        error:e.message||String(e)
      });
      if (!e.nativeCrash) throw e;
      if (group.length === 1) {
        const r = group[0];
        mainLog('warn','CASC','Skipped one asset after native CascLib crash',{
          storageParam,
          requestIndex:r.__requestIndex,
          path:r.path,
          kind:r.kind,
          exitCode:formatCascExitCode(e.exitCode)
        });
        return { results: [{ id:r.__requestIndex, path:'', size:0, base64:'', nativeCrash:true }] };
      }
      const mid = Math.ceil(group.length / 2);
      const left = await readGroup(group.slice(0, mid), depth + 1);
      const right = await readGroup(group.slice(mid), depth + 1);
      return { results:[...(left.results||[]), ...(right.results||[])] };
    }
  }
  return readGroup(indexed);
}

async function readCascAssets(payload) {
  const status = cascStatus();
  mainLog('info','CASC','Asset read request received',{ready:status.ready,backend:status.backend,requested:Array.isArray(payload&&payload.requests)?payload.requests.map(r=>({path:r.path,kind:r.kind,artSet:r.artSet})):[]});
  if (!status.ready) throw new Error(status.message);
  const requests = Array.isArray(payload && payload.requests) ? payload.requests.filter(allowedCascRequest).slice(0, 64) : [];
  if (!requests.length) return { results: [], rejected: true, backend:status.backend };
  let settings = readCascSettings();
  const knownNativeCrash = nativeCrashRememberedForBuild(settings, status.installPath || settings.installPath || '');
  // Honor the resolver status instead of re-deriving a different backend from
  // stale/empty settings. If CDN is the active resolver, or native CascLib is
  // unavailable/quarantined, go straight to Blizzard TACT/CDN. This avoids the
  // old *w3/*w3t/:w3/:w3t probe loop when CascLib.dll is not even installed.
  const savedBackend = String(settings.backend || '').toLowerCase();
  const savedStorage = String(settings.storageParam || '');
  let backend = (status.backend === 'cdn' || status.nativeReady === false || status.nativeSuppressed === true || savedBackend === 'cdn' || savedStorage.startsWith('cdn:') || knownNativeCrash)
    ? 'cdn'
    : 'native';
  let storageParam = backend === 'cdn' && !savedStorage.startsWith('cdn:') ? 'cdn:w3:us' : savedStorage;
  let result;
  let nativeAttempted = false;

  if (backend === 'cdn') {
    const region = String(storageParam).split(':')[2] || 'us';
    mainLog('info','CASC CDN','Direct asset read',{region,requestCount:requests.length,reason:status.nativeReady===false?'native-unavailable':status.nativeSuppressed?'native-suppressed':'cdn-primary'});
    try {
      result = await runCascCdnProcess(requests,false,region,{installPath:status.installPath||settings.installPath||''});
      storageParam = `cdn:w3:${result.region || region}`;
      // A successful real asset read is stronger verification than a status
      // probe. Persist the healthy CDN route so subsequent reads never fall
      // back into native probing just because settings were previously empty.
      settings = {
        ...settings,
        installPath: status.installPath || settings.installPath || '',
        backend: 'cdn',
        storageParam,
        cascVerified: true,
        lastProbeError: '',
        nativeLastError: ''
      };
      writeCascSettings(settings);
    } catch (cdnError) {
      // CascLib is an offline/local fallback only. Try it *after* CDN and only
      // when it is actually available and not quarantined for this build.
      if (!status.nativeReady || status.nativeSuppressed || knownNativeCrash) throw cdnError;
      nativeAttempted = true;
      const dllPath = cascDllPath(settings);
      mainLog('warn','CASC CDN','Direct CDN read failed; trying local CascLib fallback',{error:cdnError.message||String(cdnError)});
      if (!storageParam || storageParam.startsWith('cdn:') || settings.cascVerified !== true) {
        storageParam = await probeCascStorage(status.installPath || settings.installPath || '', dllPath, '');
      }
      result = await runCascReaderResilient(storageParam, dllPath, requests);
      backend = 'native';
      settings = { ...settings, installPath:status.installPath||settings.installPath||'', dllPath, backend:'native', storageParam, cascVerified:true, lastProbeError:'', nativeLastError:'' };
      writeCascSettings(settings);
    }
  } else {
    nativeAttempted = true;
    const dllPath = cascDllPath(settings);
    try {
      if (!storageParam || settings.cascVerified !== true) {
        storageParam = await probeCascStorage(status.installPath, dllPath, storageParam);
        settings = { ...settings, installPath:status.installPath, dllPath, backend:'native', storageParam, cascVerified:true, lastProbeError:'', nativeLastError:'' };
        writeCascSettings(settings);
      }
      result = await runCascReaderResilient(storageParam, dllPath, requests);
    } catch (nativeError) {
      // A game update can make a previously working CascLib build abort before
      // opening the storage. Do not strand the user: switch this install to the
      // Blizzard CDN backend and retry the same requested assets immediately.
      mainLog('warn','CASC','Native asset read failed; switching to Blizzard CDN fallback',{
        storageParam,exitCode:formatCascExitCode(nativeError.exitCode),nativeCrash:!!nativeError.nativeCrash,error:nativeError.message||String(nativeError)
      });
      try {
        const region = 'us';
        result = await runCascCdnProcess(requests,false,region,{installPath:status.installPath||settings.installPath||''});
        backend = 'cdn';
        storageParam = `cdn:w3:${result.region || region}`;
        settings = { ...settings, installPath:status.installPath, dllPath, backend:'cdn', storageParam, cascVerified:true, lastProbeError:'', nativeLastError:nativeError.message||String(nativeError), nativeCrashBuild:(nativeError.nativeCrash||nativeCrashText(nativeError.message||nativeError))?warcraftBuildFingerprint(status.installPath):'' };
        writeCascSettings(settings);
      } catch (cdnError) {
        throw new Error(`Local CascLib failed (${nativeError.message||nativeError}). Blizzard CDN fallback also failed: ${cdnError.message||cdnError}`);
      }
    }
  }

  let total = 0;
  const results = [];
  for (const r of result.results || []) {
    const index = Number(r.id);
    if (!Number.isInteger(index) || index < 0 || index >= requests.length) continue;
    if (!r.base64) {
      results.push({ requestIndex:index, requestedPath:requests[index].path, found:false, resolvedPath:'' });
      continue;
    }
    const data = Buffer.from(String(r.base64), 'base64');
    total += data.length;
    if (total > 256 * 1024 * 1024) throw new Error('CASC asset batch exceeded the 256 MB safety limit.');
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    results.push({
      requestIndex:index,
      requestedPath:requests[index].path,
      found:true,
      resolvedPath:String(r.path || requests[index].path),
      size:data.length,
      data:arrayBuffer
    });
  }
  mainLog('info','CASC','Asset read request completed',{backend,storageParam,count:results.length,found:results.filter(r=>r.found).length,missing:results.filter(r=>!r.found).length,totalBytes:results.filter(r=>r.found).reduce((n,r)=>n+(r.size||0),0),resolved:results.map(r=>({requested:r.requestedPath,resolved:r.resolvedPath,found:r.found,size:r.size||0}))});
  return { results, backend, nativeAttempted };
}


const LOCAL_TEXTURE_EXTS = new Set(['.blp','.tga','.dds','.png','.jpg','.jpeg','.webp','.bmp','.gif']);
function safeTextureRef(value){
  const raw=String(value||'').trim().replace(/\//g,'\\');
  if(!raw || raw.length>1024) return '';
  const ext=path.extname(raw).toLowerCase();
  if(!LOCAL_TEXTURE_EXTS.has(ext)) return '';
  return raw;
}
function relKey(value){ return String(value||'').replace(/\\/g,'/').replace(/^\/+/, '').toLowerCase(); }
function stemKey(value){ const b=path.basename(String(value||'')).toLowerCase(); const e=path.extname(b); return e?b.slice(0,-e.length):b; }
function isInsideDir(root, candidate){
  const r=path.resolve(root),c=path.resolve(candidate);if(c===r)return true;
  const pref=r.endsWith(path.sep)?r:r+path.sep;
  return process.platform==='win32'?c.toLowerCase().startsWith(pref.toLowerCase()):c.startsWith(pref);
}
async function scanModelTextureFiles(payload){
  const modelPath=String(payload&&payload.modelPath||'');
  const refs=[...new Set((Array.isArray(payload&&payload.refs)?payload.refs:[]).map(safeTextureRef).filter(Boolean))].slice(0,512);
  if(!modelPath) return {ok:false,reason:'Model file path is unavailable.',files:[],missing:refs,scannedFiles:0};
  let stat;try{stat=await fs.promises.stat(modelPath);}catch(_){return {ok:false,reason:'Model file path could not be read.',files:[],missing:refs,scannedFiles:0};}
  if(!stat.isFile()) return {ok:false,reason:'Selected model is not a local file.',files:[],missing:refs,scannedFiles:0};
  const modelDir=path.dirname(modelPath);
  const wantedRel=new Set(refs.map(relKey));
  const wantedBase=new Set(refs.map(r=>path.basename(r).toLowerCase()));
  const wantedStem=new Set(refs.map(stemKey));
  const candidates=[];let scannedFiles=0,truncated=false;
  const maxFiles=12000,maxDepth=7;
  async function walk(dir,depth){
    if(depth>maxDepth||scannedFiles>=maxFiles){truncated=true;return;}
    let entries;try{entries=await fs.promises.readdir(dir,{withFileTypes:true});}catch(_){return;}
    for(const ent of entries){
      if(scannedFiles>=maxFiles){truncated=true;break;}
      const full=path.join(dir,ent.name);
      if(ent.isDirectory()){await walk(full,depth+1);continue;}
      if(!ent.isFile())continue;
      scannedFiles++;
      const ext=path.extname(ent.name).toLowerCase();if(!LOCAL_TEXTURE_EXTS.has(ext))continue;
      const rel=path.relative(modelDir,full),rk=relKey(rel),base=ent.name.toLowerCase(),stem=stemKey(ent.name);
      if(wantedRel.has(rk)||wantedBase.has(base)||wantedStem.has(stem))candidates.push({full,rel,rk,base,stem,ext});
    }
  }
  await walk(modelDir,0);
  const files=[],missing=[];let totalBytes=0;
  for(const ref of refs){
    const rk=relKey(ref),base=path.basename(ref).toLowerCase(),stem=stemKey(ref),ext=path.extname(ref).toLowerCase();
    let match=candidates.find(c=>c.rk===rk);
    if(!match)match=candidates.find(c=>c.base===base);
    if(!match){
      const stemMatches=candidates.filter(c=>c.stem===stem).sort((a,b)=>((a.ext===ext)?-1:0)-((b.ext===ext)?-1:0)||a.rel.length-b.rel.length);
      match=stemMatches[0]||null;
    }
    // Fast direct checks are useful even when recursion was truncated.
    if(!match){
      const cleaned=ref.replace(/^([a-zA-Z]:)?[\\/]+/,'').replace(/\.\.[\\/]/g,'');
      for(const direct of [path.resolve(modelDir,cleaned),path.join(modelDir,path.basename(ref))]){
        if(!isInsideDir(modelDir,direct))continue;
        try{const st=await fs.promises.stat(direct);if(st.isFile()&&LOCAL_TEXTURE_EXTS.has(path.extname(direct).toLowerCase())){match={full:direct,rel:path.relative(modelDir,direct)};break;}}catch(_){}
      }
    }
    if(!match){missing.push(ref);continue;}
    try{
      const data=await fs.promises.readFile(match.full);totalBytes+=data.length;
      if(totalBytes>384*1024*1024)throw new Error('Automatic texture import exceeded the 384 MB safety limit.');
      files.push({requestedPath:ref,resolvedPath:match.full,relativePath:match.rel||path.relative(modelDir,match.full),size:data.length,data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});
    }catch(e){missing.push(ref);mainLog('warn','Local Textures','Could not read referenced texture',{ref,path:match.full,error:e.message||String(e)});}
  }
  mainLog('info','Local Textures','Automatic model texture scan completed',{modelPath,modelDir,requested:refs.length,found:files.length,missing:missing.length,scannedFiles,truncated,resolved:files.map(f=>({requested:f.requestedPath,resolved:f.resolvedPath,size:f.size})),missingRefs:missing});
  return {ok:true,modelPath,modelDir,files,missing,scannedFiles,truncated};
}

function associatedFilePath(value){
  const raw=String(value||'').trim().replace(/^"|"$/g,'');if(!raw)return '';
  const ext=path.extname(raw).toLowerCase();if(!ASSOCIATED_EXTENSIONS.has(ext))return '';
  try{const full=path.resolve(raw),st=fs.statSync(full);return st.isFile()?full:'';}catch(_){return '';}
}
function associatedPathFromArgv(argv){
  for(const arg of Array.isArray(argv)?argv:[]){const full=associatedFilePath(arg);if(full)return full;}
  return '';
}
function queueAssociatedOpen(filePath){
  const full=associatedFilePath(filePath);if(!full)return false;
  if(!pendingAssociatedPaths.includes(full))pendingAssociatedPaths.push(full);
  flushAssociatedOpens();return true;
}
function associatedWorkspace(filePath){
  const ext=path.extname(String(filePath||'')).toLowerCase();
  return ext==='.mdl'||ext==='.mdx'?'model':ext==='.blp'||ext==='.tga'?'texture':'';
}
function flushAssociatedOpens(){
  if(!associatedRendererReady||!mainWindow||mainWindow.isDestroyed()||mainWindow.webContents.isLoadingMainFrame())return;
  while(pendingAssociatedPaths.length){const filePath=pendingAssociatedPaths.shift();try{mainWindow.webContents.send('wc3-file:open-associated',filePath);mainLog('info','Windows Association','Dispatched associated file',{filePath});}catch(e){mainLog('error','Windows Association','Could not dispatch associated file',e);}}
}
function runReg(args){
  return new Promise((resolve,reject)=>{
    const child=spawn('reg.exe',args,{windowsHide:true});let err='';child.stderr.on('data',c=>err+=c.toString());child.on('error',reject);child.on('close',code=>code===0?resolve(true):reject(new Error(err.trim()||`reg.exe exited with code ${code}`)));
  });
}
async function regAdd(key,valueName,valueData){
  const args=['ADD',key,'/f'];if(valueName===null)args.push('/ve');else args.push('/v',valueName);args.push('/t','REG_SZ','/d',String(valueData));return runReg(args);
}
function associationIconPath(ext){
  const model = ext === '.mdl' || ext === '.mdx';
  const fileName = model ? 'model.ico' : 'texture.ico';
  const packaged = path.join(process.resourcesPath, 'file-icons', fileName);
  const dev = path.join(__dirname, 'assets', model ? 'file-model.ico' : 'file-texture.ico');
  if (fs.existsSync(packaged)) return packaged;
  if (fs.existsSync(dev)) return dev;
  return '';
}
async function registerWindowsFileAssociations(){
  if(process.platform!=='win32')return {ok:false,error:'Windows only.'};
  const exe=process.execPath,command=`"${exe}" "%1"`,appIcon=`"${exe}",0`;
  const descriptions={'.blp':'Warcraft III BLP Texture','.tga':'TGA Texture','.mdl':'Warcraft III MDL Model','.mdx':'Warcraft III MDX Model'};
  const iconMap={};
  for(const [ext,progId] of Object.entries(ASSOCIATION_PROGIDS)){
    const base=`HKCU\\Software\\Classes\\${progId}`;
    const iconPath=associationIconPath(ext);
    const icon=iconPath?`"${iconPath}",0`:appIcon;
    iconMap[ext]=iconPath||exe;
    await regAdd(base,null,descriptions[ext]);
    await regAdd(`${base}\\DefaultIcon`,null,icon);
    await regAdd(`${base}\\shell\\open\\command`,null,command);
    await regAdd(`HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`,progId,'');
  }
  const cap='HKCU\\Software\\WC3 Asset Studio\\Capabilities';
  await regAdd(cap,'ApplicationName',REGISTERED_APP_NAME);
  await regAdd(cap,'ApplicationDescription','Warcraft III model and texture editor for BLP, TGA, MDL and MDX files.');
  await regAdd(cap,'ApplicationIcon',appIcon);
  for(const [ext,progId] of Object.entries(ASSOCIATION_PROGIDS))await regAdd(`${cap}\\FileAssociations`,ext,progId);
  const appKey=`HKCU\\Software\\Classes\\Applications\\${path.basename(exe)}`;
  await regAdd(`${appKey}\\shell\\open\\command`,null,command);
  for(const ext of Object.keys(ASSOCIATION_PROGIDS))await regAdd(`${appKey}\\SupportedTypes`,ext,'');
  await regAdd('HKCU\\Software\\RegisteredApplications',REGISTERED_APP_NAME,'Software\\WC3 Asset Studio\\Capabilities');
  mainLog('info','Windows Association','Registered file types for Default Apps',{extensions:Object.keys(ASSOCIATION_PROGIDS),exe,icons:iconMap});
  return {ok:true,icons:iconMap};
}
async function openWindowsDefaultApps(){
  if(process.platform!=='win32')return {ok:false,error:'Windows only.'};
  try{
    await registerWindowsFileAssociations();
    const uri=`ms-settings:defaultapps?registeredAppUser=${encodeURIComponent(REGISTERED_APP_NAME)}`;
    await shell.openExternal(uri);
    return {ok:true,uri};
  }catch(e){mainLog('error','Windows Association','Could not register/open Default Apps',e);return {ok:false,error:e.message||String(e)};}
}
async function readAssociatedFile(filePath){
  const full=associatedFilePath(filePath);if(!full)return {ok:false,error:'The requested file is missing or is not a supported BLP/TGA/MDL/MDX file.'};
  try{
    const st=await fs.promises.stat(full);if(st.size>1024*1024*1024)return {ok:false,error:'The file is larger than the 1 GB safety limit.'};
    const data=await fs.promises.readFile(full);return {ok:true,path:full,name:path.basename(full),ext:path.extname(full).toLowerCase(),size:data.length,data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
  }catch(e){mainLog('error','Windows Association','Could not read associated file',{filePath:full,error:e.message||String(e)});return {ok:false,error:e.message||String(e)};}
}


function ipcBinaryBuffer(data){
  if(Buffer.isBuffer(data)) return data;
  if(data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if(ArrayBuffer.isView(data)) return Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  if(Array.isArray(data)) return Buffer.from(data);
  throw new Error('Binary save payload is missing or unsupported.');
}
async function saveBinaryFile(payload={}){
  const requested=path.basename(String(payload.name||'export.bin')).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'export.bin';
  const filters=Array.isArray(payload.filters)?payload.filters.map(f=>({name:String(f?.name||'File'),extensions:Array.isArray(f?.extensions)?f.extensions.map(x=>String(x||'').replace(/^\./,'').toLowerCase()).filter(Boolean):[]})).filter(f=>f.extensions.length):[];
  const bytes=ipcBinaryBuffer(payload.data);
  const pick=await dialog.showSaveDialog(mainWindow||undefined,{title:'Save export',defaultPath:requested,...(filters.length?{filters}: {})});
  if(pick.canceled||!pick.filePath){mainLog('debug','Native Save','Save cancelled',{name:requested,bytes:bytes.length});return{canceled:true,name:requested,bytes:bytes.length};}
  await fs.promises.writeFile(pick.filePath,bytes);
  mainLog('info','Native Save','Binary export saved',{name:requested,path:pick.filePath,bytes:bytes.length});
  return{canceled:false,path:pick.filePath,name:path.basename(pick.filePath),bytes:bytes.length};
}
function bindDownloadHandler(session){
  if(!session)return;
  if(registeredDownloadSession&&registeredDownloadHandler)registeredDownloadSession.removeListener('will-download',registeredDownloadHandler);
  registeredDownloadSession=session;
  registeredDownloadHandler=async (_event,item)=>{
    const requestedName=item.getFilename();
    const report=(state,filePath='')=>{
      const payload={name:requestedName,state:String(state||''),path:String(filePath||'')};
      if(mainWindow&&!mainWindow.isDestroyed())try{mainWindow.webContents.send('wc3-download:result',payload);}catch(_){}
      mainLog(state==='completed'?'info':'debug','Download',`Download ${state||'unknown'}`,payload);
    };
    try{
      item.pause();
      const result=await dialog.showSaveDialog(mainWindow,{title:'Save export',defaultPath:requestedName});
      if(result.canceled||!result.filePath){item.cancel();report('cancelled');return;}
      item.setSavePath(result.filePath);
      item.once('done',(_doneEvent,state)=>report(state,item.getSavePath()));
      item.resume();
    }catch(error){
      mainLog('error','Download','Download handler error',error);console.error('[download]',error);report('interrupted');try{item.resume();}catch(_){}
    }
  };
  session.on('will-download',registeredDownloadHandler);
  mainLog('debug','Download','Download handler bound',{idempotent:true});
}

function registerIpc() {
  ipcMain.handle('wc3-file:renderer-ready', () => {
    // Initial-launch files are claimed by the renderer instead of being pushed
    // as an event. This removes the startup race where the main process could
    // dispatch a file before the renderer had installed its onOpenFile listener.
    // Second-instance opens still use the live event path below.
    associatedRendererReady = true;
    const paths = pendingAssociatedPaths.splice(0);
    mainLog('info','Windows Association','Renderer ready for associated files',{claimed:paths.length,paths});
    return {ok:true,pending:paths.length,paths};
  });
  ipcMain.handle('wc3-local:scan-model-textures', async (_event, payload) => scanModelTextureFiles(payload));
  ipcMain.handle('wc3-file:read-associated', async (_event, filePath) => readAssociatedFile(filePath));
  ipcMain.handle('wc3-file:save-binary', async (_event, payload) => saveBinaryFile(payload||{}));
  ipcMain.handle('wc3-associations:open-settings', async () => openWindowsDefaultApps());
  ipcMain.handle('wc3-casc:status', () => cascStatus());
  ipcMain.handle('wc3-casc:install-folder-state', () => warcraftInstallFolderState());
  ipcMain.handle('wc3-casc:choose-install-folder', async () => chooseWarcraftInstallFolder(mainWindow,{firstRun:false}));
  ipcMain.handle('wc3-casc:setup', async () => {
    try {
      return await setupCasc(mainWindow);
    } catch (nativeSetupError) {
      // Last-resort guard: a native CascLib fail-fast must never escape the
      // setup IPC as the final result while the CDN resolver is available.
      // This also protects older settings / migrated installs whose previous
      // native state did not get rewritten before the helper process died.
      const nativeText = String(nativeSetupError && (nativeSetupError.message || nativeSetupError) || '');
      const isNativeCrash = /CascLib crashed|0xC0000409|3221226505|0xC0000005|0xC0000374/i.test(nativeText);
      if (!isNativeCrash || !fs.existsSync(cascCdnScriptPath())) throw nativeSetupError;

      mainLog('warn','CASC','Native setup crash escaped normal recovery; forcing Blizzard CDN backend',{error:nativeText});
      try {
        const old = readCascSettings();
        const installPath = normalizeWarcraftRoot(old.installPath || '');
        const cdn = await probeCascCdn('us', installPath);
        const storageParam = `cdn:w3:${cdn.region || 'us'}`;
        writeCascSettings({
          ...old,
          installPath,
          backend:'cdn',
          storageParam,
          cascVerified:true,
          lastProbeError:'',
          nativeLastError:nativeText,
          nativeCrashBuild:warcraftBuildFingerprint(installPath)
        });
        const status = cascStatus();
        mainLog('info','CASC','Forced CDN recovery completed',{backend:'cdn',storageParam,rootEntries:cdn.rootEntries||0,archives:cdn.archives||0});
        return status;
      } catch (cdnError) {
        const combined = new Error(`Local CascLib crashed (${nativeText}). Blizzard CDN fallback also failed: ${cdnError.message || cdnError}`);
        mainLog('error','CASC','Forced CDN recovery failed',{nativeError:nativeText,cdnError:cdnError.message||String(cdnError)});
        throw combined;
      }
    }
  });
  ipcMain.handle('wc3-casc:read-assets', async (_event, payload) => readCascAssets(payload));
  ipcMain.handle('wc3-casc:search-assets', async (_event, payload) => searchCascAssets(payload||{}));
  ipcMain.handle('wc3-casc:export-assets', async (_event, payload) => exportCascAssets(payload||{}));
  ipcMain.handle('wc3-effects:status', () => effectsStatus());
  ipcMain.handle('wc3-effects:self-test', async () => effectsSelfTest());
  ipcMain.handle('wc3-effects:launch-designer', async (_event,payload) => effectsLaunchDesigner(payload||{}));
  ipcMain.handle('wc3-effects:choose-epf', async () => effectsChooseEpf());
  ipcMain.handle('wc3-effects:save-epf', async (_event,payload) => effectsSaveEpf(payload||{}));
  ipcMain.handle('wc3-effects:choose-pkb', async () => effectsChoosePkb());
  ipcMain.handle('wc3-effects:choose-bundle', async () => effectsChooseBundle());
  ipcMain.handle('wc3-effects:read-bundle', async (_event,bundlePath) => effectsReadBundle(bundlePath));
  ipcMain.handle('wc3-effects:save-bundle', async (_event,payload) => effectsSaveBundle(payload||{}));
  ipcMain.handle('wc3-effects:decompile', async (_event,payload) => effectsDecompile(payload||{}));
  ipcMain.handle('wc3-effects:build', async (_event,payload) => effectsBuild(payload||{}));
  ipcMain.handle('wc3-effects:save-code', async (_event,payload) => effectsSaveCode(payload||{}));
  ipcMain.handle('wc3-log:append', (_event, entry) => {
    if(!entry || typeof entry!=='object') return false;
    appendRuntimeLog(entry.level||'info',entry.source||'Renderer',entry.message||'',entry.detail||'',false);
    return true;
  });
  ipcMain.handle('wc3-log:read', () => ({path:runtimeLogPath,text:readRuntimeLog()}));
  ipcMain.handle('wc3-log:clear', () => clearRuntimeLog());
  ipcMain.on('wc3-unsaved:set-state', (_event, payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    unsavedRendererState = {
      dirty: !!p.dirty,
      scopes: Array.isArray(p.scopes) ? p.scopes.map(x=>String(x||'')).filter(Boolean).slice(0,8) : [],
      summary: String(p.summary || '').slice(0,600),
      lastChange: String(p.lastChange || '').slice(0,240)
    };
  });
  ipcMain.handle('wc3-unsaved:confirm-discard', (_event, payload={}) => {
    const action=String(payload.action||'open another model'),target=String(payload.target||'').trim();
    const detailParts=[];
    if(payload.summary)detailParts.push(String(payload.summary).slice(0,600));
    else if(unsavedRendererState.summary)detailParts.push(unsavedRendererState.summary);
    if(unsavedRendererState.lastChange)detailParts.push(`Last change: ${unsavedRendererState.lastChange}`);
    if(target)detailParts.push(`Target: ${target}`);
    const opening=/open/i.test(action);
    const choice=dialog.showMessageBoxSync(mainWindow||undefined,{
      type:'warning',
      buttons:['Cancel',opening?'Open without saving':'Continue without saving'],
      defaultId:0,
      cancelId:0,
      noLink:true,
      title:'Unsaved changes',
      message:`Do you want to ${action} without saving?`,
      detail:detailParts.join('\n\n')||'Your unsaved changes will be lost.'
    });
    mainLog('info','Unsaved Guard',choice===1?'Discard confirmed':'Discard cancelled',{action,target,scopes:unsavedRendererState.scopes,lastChange:unsavedRendererState.lastChange});
    return choice===1;
  });
}


const EFFECTS_CORE_BUNDLE_FILES = Object.freeze(['effect.cfx','code.cfx','samplers.cfx','renderers.cfx','events.cfx']);
const EFFECTS_OPTIONAL_BUNDLE_FILES = Object.freeze(['functions.cfx']);
const EFFECTS_BUNDLE_FILES = Object.freeze([...EFFECTS_CORE_BUNDLE_FILES,...EFFECTS_OPTIONAL_BUNDLE_FILES]);
function effectsToolRoot(){
  return app.isPackaged ? path.join(process.resourcesPath,'tools','effects-lab') : path.join(__dirname,'tools','effects-lab');
}
const EFFECTS_RUNTIME_EXECUTABLE = 'effects-runtime.exe';
function effectsRuntimePath(){return path.join(effectsToolRoot(),EFFECTS_RUNTIME_EXECUTABLE);}
function effectsDesignerPath(){return path.join(effectsToolRoot(),'effect-designer','Effect Designer.exe');}
function effectsStatus(){
  const runtimePath=effectsRuntimePath(),libraryPath=path.join(effectsToolRoot(),'cfxlib'),designer=effectsDesignerPath();
  return {ready:fs.existsSync(runtimePath)&&fs.existsSync(libraryPath),runtimePath,libraryPath,legacyDesigner:designer,legacyDesignerReady:fs.existsSync(designer),toolRoot:effectsToolRoot(),platform:process.platform};
}
function effectsLaunchDesigner(payload={}){
  const exe=effectsDesignerPath();if(!fs.existsSync(exe))throw new Error('Effect Designer backend is not packaged.');
  const projectPath=String(payload.path||'').trim();const args=projectPath&&fs.existsSync(projectPath)?[projectPath]:[];const child=spawn(exe,args,{cwd:path.dirname(exe),windowsHide:false,detached:true,stdio:'ignore'});child.unref();mainLog('info','Effects Lab','Original Effect Designer launched',{projectPath:args[0]||''});return{ok:true,path:exe,projectPath:args[0]||''};
}

function effectsReadBundle(bundlePath){
  const root=path.resolve(String(bundlePath||''));
  if(!root||!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new Error('CFX bundle folder was not found.');
  const files={};
  for(const name of EFFECTS_CORE_BUNDLE_FILES){const fp=path.join(root,name);files[name]=fs.existsSync(fp)?fs.readFileSync(fp,'utf8'):'';}
  for(const name of EFFECTS_OPTIONAL_BUNDLE_FILES){const fp=path.join(root,name);if(fs.existsSync(fp))files[name]=fs.readFileSync(fp,'utf8');}
  return {path:root,name:path.basename(root),files};
}
function effectsWriteBundle(bundlePath,files={}){
  const root=path.resolve(String(bundlePath||''));if(!root)throw new Error('Choose a CFX bundle folder.');fs.mkdirSync(root,{recursive:true});
  let written=0;
  for(const name of EFFECTS_BUNDLE_FILES){if(!Object.prototype.hasOwnProperty.call(files,name))continue;fs.writeFileSync(path.join(root,name),String(files[name]??''),'utf8');written++;}
  return {path:root,written,files:EFFECTS_BUNDLE_FILES.filter(n=>Object.prototype.hasOwnProperty.call(files,n))};
}
function runEffectsTool(args,{cwd='',timeout=120000}={}){
  const st=effectsStatus();if(!st.ready)return Promise.reject(new Error('Effects Runtime backend is not packaged. Re-apply the Effects Lab patch.'));
  return new Promise((resolve,reject)=>{
    const child=spawn(st.runtimePath,args.map(x=>String(x)),{cwd:cwd||st.toolRoot,windowsHide:true});
    let stdout='',stderr='',done=false;const cap=1024*1024;
    const append=(cur,buf)=>{cur+=buf.toString();return cur.length>cap?cur.slice(-cap):cur;};
    child.stdout.on('data',b=>stdout=append(stdout,b));child.stderr.on('data',b=>stderr=append(stderr,b));
    const timer=setTimeout(()=>{if(done)return;done=true;try{child.kill();}catch(_){}reject(new Error(`Effects Runtime timed out after ${Math.round(timeout/1000)}s.`));},timeout);
    child.on('error',err=>{if(done)return;done=true;clearTimeout(timer);reject(err);});
    child.on('close',code=>{if(done)return;done=true;clearTimeout(timer);const result={ok:code===0,code,stdout:stdout.trim(),stderr:stderr.trim()};if(code===0)resolve(result);else reject(new Error(result.stderr||result.stdout||`Effects Runtime exited with code ${code}`));});
  });
}
async function effectsSelfTest(){
  const st=effectsStatus();if(!st.ready)return{ready:false,...st};
  // The packaged Effects Runtime has no stable version verb. `help` is a harmless,
  // read-only live probe and is explicitly advertised by the runtime itself.
  const run=await runEffectsTool(['help'],{timeout:10000});
  const output=(run.stdout||run.stderr||'').trim();
  return{ready:true,...st,run,output,probe:'help'};
}
async function effectsChooseEpf(){
  const pick=await dialog.showOpenDialog(mainWindow||undefined,{title:'Open Effect Designer project',properties:['openFile'],filters:[{name:'Effect Designer Project',extensions:['epf']},{name:'All files',extensions:['*']}]});
  if(pick.canceled||!pick.filePaths?.[0])return{canceled:true};const filePath=pick.filePaths[0];return{canceled:false,path:filePath,name:path.basename(filePath),text:fs.readFileSync(filePath,'latin1')};
}
async function effectsSaveEpf(payload={}){
  let target=String(payload.path||'');if(!target){const pick=await dialog.showSaveDialog(mainWindow||undefined,{title:'Save Effect Designer project',defaultPath:String(payload.name||'effect.epf'),filters:[{name:'Effect Designer Project',extensions:['epf']}]});if(pick.canceled||!pick.filePath)return{canceled:true};target=pick.filePath;}
  fs.writeFileSync(target,Buffer.from(String(payload.text||''),'latin1'));return{canceled:false,path:target,name:path.basename(target),bytes:fs.statSync(target).size};
}
async function effectsChoosePkb(){
  const pick=await dialog.showOpenDialog(mainWindow||undefined,{title:'Open Warcraft PopcornFX effect',properties:['openFile'],filters:[{name:'Warcraft PopcornFX',extensions:['pkb','particles']},{name:'All files',extensions:['*']}]});
  if(pick.canceled||!pick.filePaths?.[0])return{canceled:true};const filePath=pick.filePaths[0];return{canceled:false,path:filePath,name:path.basename(filePath),bytes:fs.statSync(filePath).size};
}
async function effectsChooseBundle(){
  const pick=await dialog.showOpenDialog(mainWindow||undefined,{title:'Open CFX bundle folder',properties:['openDirectory']});if(pick.canceled||!pick.filePaths?.[0])return{canceled:true};return{canceled:false,...effectsReadBundle(pick.filePaths[0])};
}
async function effectsDecompile(payload={}){
  const input=path.resolve(String(payload.inputPath||''));if(!input||!fs.existsSync(input))throw new Error('Choose a valid .pkb / .particles file first.');
  let out=String(payload.outputDir||'');if(!out){const pick=await dialog.showOpenDialog(mainWindow||undefined,{title:'Choose destination for the .cfxb bundle',properties:['openDirectory','createDirectory']});if(pick.canceled||!pick.filePaths?.[0])return{canceled:true};out=path.join(pick.filePaths[0],`${path.basename(input,path.extname(input))}.cfxb`);}
  out=path.resolve(out);fs.mkdirSync(out,{recursive:true});mainLog('info','Effects Lab','Effects Runtime decompile started',{input,out});const run=await runEffectsTool(['decompile',input,out],{timeout:180000});mainLog('info','Effects Lab','Effects Runtime decompile completed',{input,out,stdout:run.stdout});return{canceled:false,run,...effectsReadBundle(out)};
}
async function effectsBuild(payload={}){
  const bundle=path.resolve(String(payload.bundlePath||''));if(!bundle||!fs.existsSync(bundle))throw new Error('Open or save a .cfxb folder first.');
  let output=String(payload.outputPath||'');if(!output){const pick=await dialog.showSaveDialog(mainWindow||undefined,{title:'Build Warcraft PopcornFX effect',defaultPath:path.basename(bundle).replace(/\.cfxb$/i,'')+'.pkb',filters:[{name:'Warcraft PopcornFX',extensions:['pkb']}]});if(pick.canceled||!pick.filePath)return{canceled:true};output=pick.filePath;}
  output=path.resolve(output);mainLog('info','Effects Lab','Effects Runtime build started',{bundle,output});const run=await runEffectsTool(['build',bundle,output],{timeout:180000});const bytes=fs.existsSync(output)?fs.statSync(output).size:0;mainLog('info','Effects Lab','Effects Runtime build completed',{bundle,output,bytes,stdout:run.stdout});return{canceled:false,run,path:output,name:path.basename(output),bytes};
}
async function effectsSaveBundle(payload={}){
  let bundlePath=String(payload.bundlePath||'');if(!bundlePath){const pick=await dialog.showOpenDialog(mainWindow||undefined,{title:'Choose destination folder for CFX bundle',properties:['openDirectory','createDirectory']});if(pick.canceled||!pick.filePaths?.[0])return{canceled:true};const safe=String(payload.name||'effect').replace(/[^A-Za-z0-9_.-]+/g,'_').replace(/\.cfxb$/i,'');bundlePath=path.join(pick.filePaths[0],safe+'.cfxb');}
  return{canceled:false,...effectsWriteBundle(bundlePath,payload.files||{})};
}
async function effectsSaveCode(payload={}){
  const lang=String(payload.language||'lua').toLowerCase()==='jass'?'j':'lua';const pick=await dialog.showSaveDialog(mainWindow||undefined,{title:'Save generated effect script',defaultPath:String(payload.name||`effect.${lang}`),filters:[{name:lang==='j'?'JASS':'Lua',extensions:[lang]}]});if(pick.canceled||!pick.filePath)return{canceled:true};fs.writeFileSync(pick.filePath,String(payload.text||''),'utf8');return{canceled:false,path:pick.filePath,name:path.basename(pick.filePath),bytes:fs.statSync(pick.filePath).size};
}

function createWindow() {
  mainLog('info','Main','Creating application window',{product:PRODUCT,platform:process.platform,arch:process.arch});
  mainWindow = new BrowserWindow({
    title: PRODUCT,
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0d0f13',
    icon: windowIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://${APP_HOST}/`)) event.preventDefault();
  });

  bindDownloadHandler(mainWindow.webContents.session);

  mainWindow.webContents.on('did-start-loading', () => { associatedRendererReady = false; });
  mainWindow.webContents.on('did-finish-load', () => {
    mainLog('info','Windows Association','Renderer document loaded; waiting for workspace-ready handshake',{pending:pendingAssociatedPaths.length});
  });

  mainWindow.once('ready-to-show', async () => {
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    try {
      const folder = await ensureFirstRunWarcraftInstallFolder(mainWindow);
      if (folder && folder.valid) mainLog('info','CASC','First-run Warcraft folder ready',{installPath:folder.installPath});
      else if (process.platform === 'win32') mainLog('warn','CASC','Warcraft folder is still unconfigured; CASC reads will ask again when needed.');
    } catch (error) {
      mainLog('error','CASC','First-run Warcraft folder setup failed',error);
    }
  });

  const startupModule = associatedWorkspace(initialAssociatedPath);
  const startupQuery = startupModule ? `?startup=${encodeURIComponent(startupModule)}` : '';
  mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html${startupQuery}`);
  mainWindow.on('close', event => {
    if(allowDirtyClose || !unsavedRendererState.dirty) return;
    const detailParts=[];
    if(unsavedRendererState.summary) detailParts.push(unsavedRendererState.summary);
    if(unsavedRendererState.lastChange) detailParts.push(`Last change: ${unsavedRendererState.lastChange}`);
    const choice=dialog.showMessageBoxSync(mainWindow,{
      type:'warning',
      buttons:['Cancel','Close without saving'],
      defaultId:0,
      cancelId:0,
      noLink:true,
      title:'Unsaved changes',
      message:'There are unsaved changes.',
      detail:(detailParts.join('\n\n')||'Close WC3 Asset Studio without saving these changes?')
    });
    if(choice!==1){
      event.preventDefault();
      mainLog('info','Unsaved Guard','Application close cancelled',{scopes:unsavedRendererState.scopes,lastChange:unsavedRendererState.lastChange});
      return;
    }
    allowDirtyClose=true;
    mainLog('warn','Unsaved Guard','Application closing with unsaved changes by user choice',{scopes:unsavedRendererState.scopes,lastChange:unsavedRendererState.lastChange});
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    allowDirtyClose = false;
    unsavedRendererState = { dirty:false, scopes:[], summary:'', lastChange:'' };
  });
}

const initialAssociatedPath = associatedPathFromArgv(process.argv);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const filePath=associatedPathFromArgv(commandLine);if(filePath)queueAssociatedOpen(filePath);
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    await registerAppProtocol();
    registerIpc();
    mainLog('info','Main','Application ready',{portableRoot,portableData,runtimeLogPath,initialAssociatedPath:initialAssociatedPath||''});
    if(initialAssociatedPath)pendingAssociatedPaths.push(initialAssociatedPath);
    createWindow();
  });
}

app.on('window-all-closed', () => app.quit());
