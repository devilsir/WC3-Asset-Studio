'use strict';

const { app, BrowserWindow, Menu, protocol, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

const APP_SCHEME = 'wc3asset';
const APP_HOST = 'app';
const PRODUCT = 'WC3 Asset Studio v1.1';
const windowIcon = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
let mainWindow = null;

// CascLib is only used for the opt-in FX/Spell resolver. The pinned blob is the
// x64 CascLib build distributed by the MIT-licensed W3ModelViewer project.
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
fs.mkdirSync(path.join(portableData, 'Logs'), { recursive: true });
fs.mkdirSync(cascDataDir, { recursive: true });
const runtimeLogPath = path.join(portableData, 'Logs', 'runtime.log');
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

function cascScriptPath() {
  const packaged = path.join(process.resourcesPath, 'tools', 'casc-reader.ps1');
  const dev = path.join(__dirname, 'tools', 'casc-reader.ps1');
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
    const req = https.get(url, { headers: { 'User-Agent': 'WC3-Asset-Studio/1.1' } }, res => {
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
    message: 'WC3 Asset Studio needs CascLib.dll to read Warcraft III Reforged CASC files.',
    detail: 'Only model-referenced effect/spell assets are requested. You can download the pinned MIT-licensed CascLib build (~510 KB), choose an existing CascLib.dll, or cancel.',
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
  const installPath = normalizeWarcraftRoot(settings.installPath || '');
  const dllPath = cascDllPath(settings);
  const script = cascScriptPath();
  const platformReady = process.platform === 'win32';
  const ready = platformReady && validWarcraftRoot(installPath) && !!dllPath && fs.existsSync(script);
  return {
    ready,
    platformReady,
    installPath: validWarcraftRoot(installPath) ? installPath : '',
    dllReady: !!dllPath,
    helperReady: fs.existsSync(script),
    message: ready ? 'Local CASC ready (FX/Spells only).' :
      !platformReady ? 'Local CASC is available in the Windows portable build.' :
      !validWarcraftRoot(installPath) ? 'Choose the Warcraft III install folder.' :
      !dllPath ? 'CascLib support is not installed yet.' :
      'CASC bridge is not available.'
  };
}

async function setupCasc(owner) {
  mainLog('info','CASC','Setup requested');
  if (process.platform !== 'win32') { mainLog('warn','CASC','Setup unavailable on this platform',process.platform); return cascStatus(); }
  const settings = readCascSettings();
  let installPath = normalizeWarcraftRoot(settings.installPath || '');
  if (!validWarcraftRoot(installPath)) {
    const pick = await dialog.showOpenDialog(owner || undefined, {
      title: 'Choose Warcraft III folder (contains .build.info)',
      properties: ['openDirectory']
    });
    if (pick.canceled || !pick.filePaths[0]) return cascStatus();
    installPath = normalizeWarcraftRoot(pick.filePaths[0]);
    if (!validWarcraftRoot(installPath)) {
      await dialog.showMessageBox(owner || undefined, {
        type: 'error',
        title: 'Warcraft III CASC not found',
        message: 'This folder does not contain a Warcraft III CASC install.',
        detail: 'Select the Warcraft III folder that contains .build.info and the Data folder.'
      });
      return cascStatus();
    }
  }
  const dllPath = await ensureCascDll(owner);
  if (!dllPath) return cascStatus();
  writeCascSettings({ ...settings, installPath, dllPath });
  const finalStatus=cascStatus();
  mainLog(finalStatus.ready?'info':'warn','CASC','Setup completed',{ready:finalStatus.ready,installPath:finalStatus.installPath,dllReady:finalStatus.dllReady,helperReady:finalStatus.helperReady});
  return finalStatus;
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
  const ext = path.extname(cleanCascRelative(req.path)).toLowerCase();
  if (kind === 'effect') return ['.mdx', '.mdl', '.pkb', '.pkfx'].includes(ext);
  if (kind === 'effect-texture') return ['.blp', '.dds', '.tga', '.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  return false;
}

function cascCandidates(req) {
  const raw = String(req.path || '').trim().replace(/\//g, '\\');
  const rel0 = cleanCascRelative(raw);
  const rels = [rel0];
  if (/\.mdl$/i.test(rel0)) rels.push(rel0.replace(/\.mdl$/i, '.mdx'));
  if (/\.blp$/i.test(rel0)) rels.push(rel0.replace(/\.blp$/i, '.dds'));
  const hd = req.artSet === 'hd' || req.artSet === 'de' || req.artSet === 'auto-hd';
  const prefixes = hd
    ? ['war3.w3mod:_de.w3mod:', 'war3.w3mod:_hd.w3mod:', 'war3.w3mod:', 'war3sd.w3mod:', '']
    : ['war3sd.w3mod:', 'war3.w3mod:', '', 'war3.w3mod:_hd.w3mod:', 'war3.w3mod:_de.w3mod:'];
  const out = [];
  if (raw.includes(':')) out.push(raw);
  for (const rel of rels) for (const prefix of prefixes) out.push(prefix + rel);
  return [...new Set(out.filter(Boolean))].slice(0, 16);
}

function runCascReader(installPath, dllPath, requests) {
  mainLog('info','CASC','Reader batch started',{installPath,requestCount:requests.length,requests:requests.map(r=>({path:r.path,kind:r.kind,artSet:r.artSet}))});
  return new Promise((resolve, reject) => {
    const script = cascScriptPath();
    const payload = JSON.stringify({
      installPath,
      requests: requests.map((r, i) => ({ id: i, candidates: cascCandidates(r) }))
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
    const timer = setTimeout(() => ps.kill(), 45000);
    ps.stdout.on('data', c => {
      outSize += c.length;
      if (outSize > limit) ps.kill();
      else stdout.push(c);
    });
    ps.stderr.on('data', c => stderr.push(c));
    ps.on('error', err => { clearTimeout(timer); reject(err); });
    ps.on('close', code => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString('utf8').trim();
      const err = Buffer.concat(stderr).toString('utf8').trim();
      if (code !== 0) { mainLog('error','CASC','Reader process failed',{code,stderr:err}); return reject(new Error(err || `CASC reader exited with code ${code}.`)); }
      try { const parsed=out ? JSON.parse(out) : { results: [] }; mainLog('info','CASC','Reader batch completed',{resultCount:(parsed.results||[]).length,stderr:err||''}); resolve(parsed); }
      catch (e) { mainLog('error','CASC','Reader returned invalid JSON',{error:e.message,stderr:err,stdoutPreview:out.slice(0,500)}); reject(new Error(`CASC reader returned invalid data${err ? `: ${err}` : '.'}`)); }
    });
    ps.stdin.end(payload, 'utf8');
  });
}

async function readCascAssets(payload) {
  const status = cascStatus();
  mainLog('info','CASC','Asset read request received',{ready:status.ready,requested:Array.isArray(payload&&payload.requests)?payload.requests.map(r=>({path:r.path,kind:r.kind,artSet:r.artSet})):[]});
  if (!status.ready) throw new Error(status.message);
  const requests = Array.isArray(payload && payload.requests) ? payload.requests.filter(allowedCascRequest).slice(0, 64) : [];
  if (!requests.length) return { results: [], rejected: true };
  const settings = readCascSettings();
  const dllPath = cascDllPath(settings);
  const result = await runCascReader(status.installPath, dllPath, requests);
  let total = 0;
  const results = [];
  for (const r of result.results || []) {
    const index = Number(r.id);
    if (!Number.isInteger(index) || index < 0 || index >= requests.length) continue;
    if (!r.base64) {
      results.push({ requestIndex: index, requestedPath: requests[index].path, found: false, resolvedPath: '' });
      continue;
    }
    const data = Buffer.from(String(r.base64), 'base64');
    total += data.length;
    if (total > 256 * 1024 * 1024) throw new Error('CASC FX batch exceeded the 256 MB safety limit.');
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    results.push({
      requestIndex: index,
      requestedPath: requests[index].path,
      found: true,
      resolvedPath: String(r.path || requests[index].path),
      size: data.length,
      data: arrayBuffer
    });
  }
  mainLog('info','CASC','Asset read request completed',{count:results.length,found:results.filter(r=>r.found).length,missing:results.filter(r=>!r.found).length,totalBytes:results.filter(r=>r.found).reduce((n,r)=>n+(r.size||0),0),resolved:results.map(r=>({requested:r.requestedPath,resolved:r.resolvedPath,found:r.found,size:r.size||0}))});
  return { results };
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

function registerIpc() {
  ipcMain.handle('wc3-local:scan-model-textures', async (_event, payload) => scanModelTextureFiles(payload));
  ipcMain.handle('wc3-casc:status', () => cascStatus());
  ipcMain.handle('wc3-casc:setup', async () => setupCasc(mainWindow));
  ipcMain.handle('wc3-casc:read-assets', async (_event, payload) => readCascAssets(payload));
  ipcMain.handle('wc3-log:append', (_event, entry) => {
    if(!entry || typeof entry!=='object') return false;
    appendRuntimeLog(entry.level||'info',entry.source||'Renderer',entry.message||'',entry.detail||'',false);
    return true;
  });
  ipcMain.handle('wc3-log:read', () => ({path:runtimeLogPath,text:readRuntimeLog()}));
  ipcMain.handle('wc3-log:clear', () => clearRuntimeLog());
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

  mainWindow.webContents.session.on('will-download', async (_event, item) => {
    try {
      item.pause();
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save export',
        defaultPath: item.getFilename()
      });
      if (result.canceled || !result.filePath) {
        item.cancel();
        return;
      }
      item.setSavePath(result.filePath);
      item.resume();
    } catch (error) {
      mainLog('error','Download','Download handler error',error);
      console.error('[download]', error);
      try { item.resume(); } catch (_) {}
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    await registerAppProtocol();
    registerIpc();
    mainLog('info','Main','Application ready',{portableRoot,portableData});
    createWindow();
  });
}

app.on('window-all-closed', () => app.quit());
