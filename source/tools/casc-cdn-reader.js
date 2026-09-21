'use strict';

// Warcraft III CASC / TACT reader.
// Uses only Node built-ins, the installed game build metadata and Blizzard's
// public TACT/CDN endpoints. Native CascLib is optional; this reader is the
// safe primary backend when a game update makes CascLib fail-fast.
// No game content is bundled with WC3 Asset Studio.

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

const PATCH = Object.freeze({
  us: 'http://us.patch.battle.net:1119',
  eu: 'http://eu.patch.battle.net:1119',
  kr: 'http://kr.patch.battle.net:1119',
  cn: 'http://cn.patch.battle.net:1119'
});
const PRODUCT = 'w3';
const MAX_HTTP_BYTES = 96 * 1024 * 1024;
const MAX_DECODE_BYTES = 256 * 1024 * 1024;
const USER_AGENT = 'WC3-Asset-Studio/1.3 CASC-TACT';

function trace(message) {
  try { process.stderr.write(`CASC_CDN_STAGE ${message}\n`); } catch (_) {}
}
function normalizeVirtual(value) {
  return String(value || '')
    .trim()
    .replace(/\//g, '\\')
    .replace(/^\\+/, '')
    .toLowerCase();
}
function safeKey(value) {
  const s = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{16,64}$/.test(s) ? s : '';
}
function sha1(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}
function mkdirp(dir) { fs.mkdirSync(dir, { recursive: true }); }
function cacheFile(cacheDir, group, key) {
  const dir = path.join(cacheDir, group); mkdirp(dir);
  return path.join(dir, key.replace(/[^a-zA-Z0-9_.-]/g, '_'));
}
function readCache(file, maxAgeMs = Infinity) {
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs > maxAgeMs) return null;
    return fs.readFileSync(file);
  } catch (_) { return null; }
}
function writeCache(file, data) {
  try {
    mkdirp(path.dirname(file));
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch (_) {}
}

function requestBuffer(url, options = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many CDN redirects.'));
    const client = url.startsWith('https:') ? https : http;
    const headers = { 'User-Agent': USER_AGENT, Connection: 'close', ...(options.headers || {}) };
    const req = client.get(url, { headers }, res => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve(requestBuffer(new URL(res.headers.location, url).toString(), options, redirects + 1));
      }
      const accept = options.range ? (status === 206 || status === 200) : status === 200;
      if (!accept) {
        res.resume();
        const e = new Error(`HTTP ${status} for ${url}`); e.statusCode = status; return reject(e);
      }
      const chunks = [];
      let total = 0;
      const wanted = Number(options.maxBytes || MAX_HTTP_BYTES);
      res.on('data', chunk => {
        total += chunk.length;
        if (total > wanted) {
          req.destroy(new Error(`CDN response exceeded ${wanted} bytes.`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (options.range && status === 200) {
          const { offset, size } = options.range;
          if (body.length < offset + size) return reject(new Error('CDN ignored Range and returned an incomplete archive.'));
          return resolve(body.subarray(offset, offset + size));
        }
        resolve(body);
      });
      res.on('error', reject);
    });
    req.setTimeout(Number(options.timeout || 20000), () => req.destroy(new Error('CDN request timed out.')));
    req.on('error', reject);
  });
}

async function fetchCached(url, file, opts = {}) {
  const cached = readCache(file, opts.maxAgeMs === undefined ? Infinity : opts.maxAgeMs);
  if (cached) return cached;
  const data = await requestBuffer(url, opts);
  writeCache(file, data);
  return data;
}

async function fetchCdnCached(url, file, opts = {}) {
  const cached = readCache(file, opts.maxAgeMs === undefined ? Infinity : opts.maxAgeMs);
  if (cached) return cached;
  const urls = url.startsWith('http://') ? [url.replace(/^http:/, 'https:'), url] : [url];
  let lastError = null;
  for (const candidate of urls) {
    try {
      const data = await requestBuffer(candidate, opts);
      writeCache(file, data);
      return data;
    } catch (e) { lastError = e; }
  }
  throw lastError || new Error('CDN request failed.');
}

function parsePipeTable(text) {
  const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#'));
  if (!lines.length) return [];
  const headers = lines[0].split('|').map(h => h.trim().split('!')[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('|');
    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = (parts[j] || '').trim();
    rows.push(row);
  }
  return rows;
}

function validInstallRoot(root) {
  if (!root || typeof root !== 'string') return false;
  try {
    return fs.statSync(root).isDirectory() && fs.existsSync(path.join(root, '.build.info')) && fs.existsSync(path.join(root, 'Data'));
  } catch (_) { return false; }
}
function readLocalBuildInfo(root) {
  if (!validInstallRoot(root)) return null;
  try {
    const rows = parsePipeTable(fs.readFileSync(path.join(root, '.build.info'), 'utf8'));
    const active = rows.filter(r => String(r.Active || '').trim() === '1');
    const row = active.find(r => String(r.Product || '').toLowerCase() === PRODUCT) || active[0] || rows.find(r => String(r.Product || '').toLowerCase() === PRODUCT) || rows[0];
    if (!row) return null;
    const buildHash = safeKey(row['Build Key'] || row.BuildConfig);
    const cdnHash = safeKey(row['CDN Key'] || row.CDNConfig);
    if (!buildHash || !cdnHash) return null;
    const branch = String(row.Branch || '').toLowerCase();
    const hosts = String(row['CDN Hosts'] || row.Hosts || '').split(/\s+/).filter(Boolean);
    return {
      buildHash,
      cdnHash,
      cdnPath:String(row['CDN Path'] || row.Path || '').trim().replace(/^\/+|\/+$/g,''),
      hosts,
      region:PATCH[branch] ? branch : '',
      version:String(row.Version || row['Versions Name'] || '').trim(),
      product:String(row.Product || '').trim()
    };
  } catch (_) { return null; }
}
function localConfigPath(root, hash) {
  const key = safeKey(hash); if (!validInstallRoot(root) || !key) return '';
  return path.join(root, 'Data', 'config', key.slice(0,2), key.slice(2,4), key);
}
function readLocalConfig(root, hash) {
  const file = localConfigPath(root, hash);
  if (!file) return null;
  try { return fs.readFileSync(file); } catch (_) { return null; }
}
function parseConfig(text) {
  const out = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const p = line.indexOf('='); if (p < 0) continue;
    const k = line.slice(0, p).trim(); const v = line.slice(p + 1).trim();
    out[k] = /^(archives|patch-archives|builds|encoding-size)$/.test(k) ? v.split(/\s+/).filter(Boolean) : v;
  }
  return out;
}

function extLength(buffer, pos, value) {
  let len = value;
  if (value !== 15) return { len, pos };
  while (pos < buffer.length) {
    const b = buffer[pos++]; len += b;
    if (b !== 255) break;
  }
  return { len, pos };
}
function decodeLz4Block(src, expectedSize) {
  const expected = Number(expectedSize || 0);
  if (!Number.isFinite(expected) || expected <= 0 || expected > MAX_DECODE_BYTES) throw new Error('Invalid LZ4 output size.');
  const out = Buffer.allocUnsafe(expected);
  let ip = 0, op = 0;
  while (ip < src.length) {
    const token = src[ip++];
    let r = extLength(src, ip, token >>> 4); let litLen = r.len; ip = r.pos;
    if (ip + litLen > src.length || op + litLen > out.length) throw new Error('LZ4 literal overrun.');
    src.copy(out, op, ip, ip + litLen); ip += litLen; op += litLen;
    if (ip >= src.length) break;
    if (ip + 2 > src.length) throw new Error('LZ4 missing match offset.');
    const offset = src[ip] | (src[ip + 1] << 8); ip += 2;
    if (!offset || offset > op) throw new Error('LZ4 invalid match offset.');
    r = extLength(src, ip, token & 0x0f); let matchLen = r.len + 4; ip = r.pos;
    if (op + matchLen > out.length) throw new Error('LZ4 match overrun.');
    let srcPos = op - offset;
    for (let i = 0; i < matchLen; i++) out[op++] = out[srcPos++];
  }
  if (op !== out.length) return out.subarray(0, op);
  return out;
}

function decodeBlteMode(mode, data, expectedSize) {
  if (mode === 0x4e) return data; // N
  if (mode === 0x5a) return zlib.unzipSync(data); // Z
  if (mode === 0x46) return decodeBlte(data); // F (nested BLTE)
  if (mode === 0x34) { // 4 (LZ4)
    if (data.length < 10) throw new Error('Invalid BLTE LZ4 block.');
    const version = data[0]; if (version !== 1) throw new Error(`Unsupported BLTE LZ4 version ${version}.`);
    const declared = Number(data.readBigUInt64BE(1));
    // byte 9 = block shift; the remaining bytes are the raw LZ4 block.
    return decodeLz4Block(data.subarray(10), Number(expectedSize || declared));
  }
  if (mode === 0x45) throw new Error('Encrypted BLTE block is not supported by the CDN fallback.'); // E
  throw new Error(`Unknown BLTE encoding 0x${mode.toString(16)}.`);
}
function decodeBlte(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 9 || buffer.toString('ascii', 0, 4) !== 'BLTE') throw new Error('Invalid BLTE container.');
  const headerSize = buffer.readUInt32BE(4);
  if (headerSize === 0) return decodeBlteMode(buffer[8], buffer.subarray(9), 0);
  if (headerSize < 12 || headerSize > buffer.length) throw new Error('Invalid BLTE header size.');
  const format = buffer[8];
  if (format !== 0x0f && format !== 0x10) throw new Error(`Unsupported BLTE header format 0x${format.toString(16)}.`);
  const count = buffer.readUIntBE(9, 3); if (!count) throw new Error('BLTE has zero blocks.');
  let p = 12; const blocks = [];
  for (let i = 0; i < count; i++) {
    const entrySize = format === 0x10 ? 40 : 24;
    if (p + entrySize > headerSize) throw new Error('BLTE block table overrun.');
    const compressedSize = buffer.readUInt32BE(p); const decompressedSize = buffer.readUInt32BE(p + 4);
    blocks.push({ compressedSize, decompressedSize }); p += entrySize;
  }
  p = headerSize; const decoded = [];
  let total = 0;
  for (const b of blocks) {
    if (!b.compressedSize || p + b.compressedSize > buffer.length) throw new Error('BLTE block data overrun.');
    const mode = buffer[p]; const data = buffer.subarray(p + 1, p + b.compressedSize); p += b.compressedSize;
    const out = decodeBlteMode(mode, data, b.decompressedSize); total += out.length;
    if (total > MAX_DECODE_BYTES) throw new Error('BLTE output exceeded safety limit.');
    decoded.push(out);
  }
  return Buffer.concat(decoded, total);
}

function parseEncoding(encoded) {
  const buffer = decodeBlte(encoded);
  if (buffer.length < 22 || buffer.toString('ascii', 0, 2) !== 'EN') throw new Error('Invalid ENCODING table.');
  const cLen = buffer[3], eLen = buffer[4];
  const pageKB = buffer.readUInt16BE(5); const pageCount = buffer.readUInt32BE(9); const eSpecSize = buffer.readUInt32BE(18);
  let page = 22 + eSpecSize + pageCount * 32;
  const map = new Map();
  for (let i = 0; i < pageCount; i++) {
    const end = Math.min(buffer.length, page + pageKB * 1024); let p = page;
    while (p + 6 <= end) {
      const keyCount = buffer[p++]; if (!keyCount) break;
      if (p + 5 + cLen + keyCount * eLen > end) break;
      p += 5; // decoded file size
      const cKey = buffer.toString('hex', p, p + cLen); p += cLen;
      const eKeys = [];
      for (let k = 0; k < keyCount; k++) { eKeys.push(buffer.toString('hex', p, p + eLen)); p += eLen; }
      map.set(cKey, eKeys);
    }
    page += pageKB * 1024;
  }
  return map;
}

function parseArchiveIndex(buffer, archiveHash, wanted, found) {
  // CDN archive index entries are EKey(16) + size(4 BE) + offset(4 BE),
  // arranged in 4096-byte pages with a footer after the final full page.
  const pageSize = 4096;
  const usable = buffer.length % pageSize === 0 ? buffer.length : Math.max(0, (Math.ceil(buffer.length / pageSize) - 1) * pageSize);
  for (let page = 0; page < usable; page += pageSize) {
    const end = page + pageSize;
    for (let p = page; p + 24 <= end; p += 24) {
      let empty = true; for (let j = 0; j < 16; j++) if (buffer[p + j] !== 0) { empty = false; break; }
      if (empty) break;
      const eKey = buffer.toString('hex', p, p + 16);
      if (!wanted.has(eKey) || found.has(eKey)) continue;
      const size = buffer.readUInt32BE(p + 16); const offset = buffer.readUInt32BE(p + 20);
      if (size > 0 && size <= MAX_HTTP_BYTES) found.set(eKey, { archiveHash, offset, size });
    }
  }
}

function parseWar3Root(buffer) {
  const decoded = decodeBlte(buffer);
  if (decoded.length < 4 || decoded.toString('ascii', 0, 4) !== 'War3') throw new Error('Warcraft III root is not in War3 format.');
  const exact = new Map();
  const text = decoded.subarray(4).toString('utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const p1 = line.indexOf('|'); if (p1 <= 0) continue;
    const p2 = line.indexOf('|', p1 + 1);
    const vPath = normalizeVirtual(line.slice(0, p1));
    const key = safeKey(line.slice(p1 + 1, p2 < 0 ? line.length : p2));
    if (vPath && key && !exact.has(vPath)) exact.set(vPath, key);
  }
  return exact;
}

function configUrl(host, cdnPath, hash) { return `http://${host}/${cdnPath}/config/${hash.slice(0,2)}/${hash.slice(2,4)}/${hash}`; }
function dataUrl(host, cdnPath, hash, index = false) { return `http://${host}/${cdnPath}/data/${hash.slice(0,2)}/${hash.slice(2,4)}/${hash}${index ? '.index' : ''}`; }

class W3Cdn {
  constructor(region, cacheDir, installPath='') {
    this.region = PATCH[region] ? region : 'us'; this.cacheDir = cacheDir;
    this.installPath = validInstallRoot(installPath) ? path.resolve(installPath) : '';
    this.encoding = new Map(); this.root = new Map(); this.locationCache = new Map();
    this.sourceBuild = '';
  }
  async init() {
    trace(`init region=${this.region} local=${this.installPath ? 'yes' : 'no'}`);
    mkdirp(this.cacheDir);

    const local = readLocalBuildInfo(this.installPath);
    if (local?.region) this.region = local.region;
    let cdn = null, ver = null;

    // Prefer the exact active build installed on the user's machine. The local
    // .build.info and Data/config files are stable bootstrap metadata and avoid
    // mismatches between an older local install and the current online build.
    if (local) {
      this.buildHash = local.buildHash;
      this.cdnHash = local.cdnHash;
      this.cdnPath = local.cdnPath;
      this.host = local.hosts[0] || '';
      this.sourceBuild = `local:${local.version || local.buildHash.slice(0,8)}`;
      trace(`local-build version=${local.version || ''} build=${this.buildHash} cdn=${this.cdnHash}`);
    }

    // Patch metadata fills missing host/path data and is the full fallback when
    // there is no valid local installation metadata.
    if (!this.buildHash || !this.cdnHash || !this.cdnPath || !this.host) {
      const patchBase = PATCH[this.region];
      const cdnsFile = cacheFile(this.cacheDir, 'meta', `${PRODUCT}-${this.region}-cdns.txt`);
      const versionsFile = cacheFile(this.cacheDir, 'meta', `${PRODUCT}-${this.region}-versions.txt`);
      const cdnsText = (await fetchCached(`${patchBase}/${PRODUCT}/cdns`, cdnsFile, { maxAgeMs: 6*60*60*1000, maxBytes: 2*1024*1024 })).toString('utf8');
      const versionsText = (await fetchCached(`${patchBase}/${PRODUCT}/versions`, versionsFile, { maxAgeMs: 60*60*1000, maxBytes: 2*1024*1024 })).toString('utf8');
      const cdns = parsePipeTable(cdnsText); const versions = parsePipeTable(versionsText);
      cdn = cdns.find(x => x.Name === this.region) || cdns.find(x => x.Name === 'us') || cdns[0];
      ver = versions.find(x => x.Region === this.region) || versions.find(x => x.Region === 'us') || versions[0];
      if (!cdn || !ver) throw new Error('Blizzard patch service returned no Warcraft III CDN/version row.');
      const hosts = String(cdn.Hosts || cdn.Servers || '').split(/\s+/).filter(Boolean);
      if (!this.host) this.host = hosts[0] || '';
      if (!this.cdnPath) this.cdnPath = String(cdn.Path || '').trim().replace(/^\/+|\/+$/g,'');
      if (!this.buildHash) this.buildHash = safeKey(ver.BuildConfig);
      if (!this.cdnHash) this.cdnHash = safeKey(ver.CDNConfig);
      if (!this.sourceBuild) this.sourceBuild = `online:${ver.VersionsName || ver.BuildId || this.buildHash.slice(0,8)}`;
    }
    if (!this.host || !this.buildHash || !this.cdnHash || !this.cdnPath) throw new Error('Warcraft III version metadata is incomplete.');
    trace(`version source=${this.sourceBuild} host=${this.host} path=${this.cdnPath}`);

    const buildFile = cacheFile(this.cacheDir, 'config', this.buildHash);
    const cdnFile = cacheFile(this.cacheDir, 'config', this.cdnHash);
    const localBuild = readLocalConfig(this.installPath, this.buildHash);
    const localCdn = readLocalConfig(this.installPath, this.cdnHash);
    if (localBuild) { writeCache(buildFile, localBuild); trace(`config local build bytes=${localBuild.length}`); }
    if (localCdn) { writeCache(cdnFile, localCdn); trace(`config local cdn bytes=${localCdn.length}`); }
    const buildBuf = localBuild || await fetchCdnCached(configUrl(this.host,this.cdnPath,this.buildHash), buildFile, { maxBytes:4*1024*1024 });
    const cdnBuf = localCdn || await fetchCdnCached(configUrl(this.host,this.cdnPath,this.cdnHash), cdnFile, { maxBytes:4*1024*1024 });
    const build = parseConfig(buildBuf.toString('utf8'));
    const cdnCfg = parseConfig(cdnBuf.toString('utf8'));
    this.archives = Array.isArray(cdnCfg.archives) ? cdnCfg.archives.filter(safeKey) : String(cdnCfg.archives || '').split(/\s+/).map(safeKey).filter(Boolean);
    if (!this.archives.length) throw new Error('Warcraft III CDN config contains no archives.');

    const encField = Array.isArray(build.encoding) ? build.encoding.join(' ') : String(build.encoding || '');
    const encParts = encField.split(/\s+/).map(safeKey).filter(Boolean); const encKey = encParts[1] || encParts[0];
    if (!encKey) throw new Error('Warcraft III build config has no encoding key.');
    const encFile = cacheFile(this.cacheDir, 'data', encKey);
    const encBuf = await fetchCdnCached(dataUrl(this.host,this.cdnPath,encKey), encFile, { maxBytes:64*1024*1024 });
    this.encoding = parseEncoding(encBuf);

    const rootCKey = safeKey(build.root); if (!rootCKey) throw new Error('Warcraft III build config has no root key.');
    const rootEKeys = this.encoding.get(rootCKey) || [rootCKey];
    let rootBuf = null;
    for (const key of rootEKeys) {
      try { rootBuf = await fetchCdnCached(dataUrl(this.host,this.cdnPath,key), cacheFile(this.cacheDir,'data',key), { maxBytes:64*1024*1024 }); break; } catch (_) {}
    }
    if (!rootBuf) throw new Error('Could not download the Warcraft III root manifest.');
    this.root = parseWar3Root(rootBuf);
    trace(`root entries=${this.root.size} archives=${this.archives.length}`);
  }
  eKeysFor(value) {
    const key = safeKey(value); if (!key) return [];
    return [...new Set([...(this.encoding.get(key) || []), key])];
  }
  findRootKey(candidates) {
    for (const candidate of candidates || []) {
      const key = this.root.get(normalizeVirtual(candidate)); if (key) return { path: candidate, key };
    }
    return null;
  }
  async readLoose(eKey) {
    const cache = cacheFile(this.cacheDir, 'asset', eKey);
    const existing = readCache(cache); if (existing) return existing;
    try {
      const u = dataUrl(this.host,this.cdnPath,eKey);
      let encoded = null, last = null;
      for (const candidate of [u.replace(/^http:/,'https:'), u]) { try { encoded = await requestBuffer(candidate, { maxBytes:64*1024*1024, timeout:15000 }); break; } catch (e) { last=e; } }
      if (!encoded) throw last || new Error('Loose CDN asset unavailable.');
      const decoded = decodeBlte(encoded); writeCache(cache, decoded); return decoded;
    } catch (_) { return null; }
  }
  loadSavedLocation(eKey) {
    const f = cacheFile(this.cacheDir,'loc',`${this.cdnHash}-${eKey}.json`);
    try { const v = JSON.parse(fs.readFileSync(f,'utf8')); return v && v.archiveHash && Number.isFinite(v.offset) && Number.isFinite(v.size) ? v : null; } catch (_) { return null; }
  }
  saveLocation(eKey, loc) { writeCache(cacheFile(this.cacheDir,'loc',`${this.cdnHash}-${eKey}.json`), Buffer.from(JSON.stringify(loc))); }
  async locate(eKeys) {
    const wanted = new Set(eKeys.map(safeKey).filter(Boolean)); const found = new Map();
    for (const k of [...wanted]) { const saved = this.loadSavedLocation(k); if (saved) { found.set(k,saved); wanted.delete(k); } }
    if (!wanted.size) return found;
    trace(`index scan wanted=${wanted.size}`);
    const concurrency = 12;
    for (let i=0; i<this.archives.length && wanted.size; i+=concurrency) {
      const batch = this.archives.slice(i,i+concurrency);
      await Promise.all(batch.map(async archiveHash => {
        if (!wanted.size) return;
        try {
          const f = cacheFile(this.cacheDir,'index',`${archiveHash}.index`);
          const b = await fetchCdnCached(dataUrl(this.host,this.cdnPath,archiveHash,true), f, { maxBytes:32*1024*1024, timeout:20000 });
          const localFound = new Map(); parseArchiveIndex(b,archiveHash,wanted,localFound);
          for (const [k,loc] of localFound) { if (!found.has(k)) { found.set(k,loc); wanted.delete(k); this.saveLocation(k,loc); } }
        } catch (e) { trace(`index failed ${archiveHash} ${e.message}`); }
      }));
      trace(`index progress ${Math.min(i+concurrency,this.archives.length)}/${this.archives.length} remaining=${wanted.size}`);
    }
    return found;
  }
  async readArchive(eKey, loc) {
    const cache = cacheFile(this.cacheDir,'asset',eKey); const existing = readCache(cache); if (existing) return existing;
    const url = dataUrl(this.host,this.cdnPath,loc.archiveHash);
    const opts = { range:{offset:loc.offset,size:loc.size}, headers:{Range:`bytes=${loc.offset}-${loc.offset+loc.size-1}`}, maxBytes:Math.min(MAX_HTTP_BYTES,loc.size+1024), timeout:25000 };
    let encoded = null, last = null;
    for (const candidate of [url.replace(/^http:/,'https:'), url]) { try { encoded = await requestBuffer(candidate, opts); break; } catch (e) { last=e; } }
    if (!encoded) throw last || new Error('Archive range request failed.');
    const decoded = decodeBlte(encoded); writeCache(cache,decoded); return decoded;
  }
  searchPaths(query='', type='all', limit=200) {
    const q = normalizeVirtual(query).replace(/\\/g,' ').trim().replace(/\s+/g,' ');
    const terms = q.split(' ').filter(Boolean);
    const mode = String(type || 'all').toLowerCase();
    const max = Math.max(1, Math.min(500, Number(limit) || 200));
    const extOk = (p) => {
      const low=String(p||'').toLowerCase();
      if(mode==='textures'||mode==='texture') return /\.(blp|dds|tga|png|jpg|jpeg)$/.test(low);
      if(mode==='models'||mode==='model') return /\.(mdx|mdl)$/.test(low);
      if(mode==='units'||mode==='unit'||mode==='creatures'||mode==='creature') return /\.(mdx|mdl)$/.test(low) && /(^|[:\\])(units|characters|creatures|heroes|buildings)([\\]|$)/.test(low);
      if(mode==='effects'||mode==='effect'||mode==='fx') return /\.(mdx|mdl)$/.test(low) && /(^|[:\\])(abilities|effects|sharedmodels|spells|environment|doodads)([\\]|$)/.test(low);
      if(mode==='sounds'||mode==='sound') return /\.(wav|mp3|ogg|flac)$/.test(low);
      return true;
    };
    const score = (p) => {
      let n=0; const low=String(p||'').toLowerCase();
      for(const t of terms){const at=low.indexOf(t);if(at<0)return -1;n += at===0?12:(low.includes('\\'+t)?8:4);}
      if(/(^|[:\\])(abilities|effects|spells)([\\]|$)/.test(low)) n+=2;
      return n;
    };
    const rows=[];
    for(const p of this.root.keys()){
      if(!extOk(p)) continue;
      const sc=score(p);if(sc<0)continue;
      rows.push({path:p,score:sc});
    }
    rows.sort((a,b)=>b.score-a.score||a.path.length-b.path.length||a.path.localeCompare(b.path));
    return rows.slice(0,max).map(x=>x.path);
  }

  async readRequests(requests) {
    const plans = [];
    for (const req of requests || []) {
      const root = this.findRootKey(req.candidates || []);
      plans.push({ id:req.id, root, eKeys:root ? this.eKeysFor(root.key) : [] });
    }
    const unresolvedKeys = [];
    // Try loose files first; this also covers manifests that Blizzard publishes outside archives.
    for (const plan of plans) {
      if (!plan.root) continue;
      for (const eKey of plan.eKeys) {
        const data = await this.readLoose(eKey);
        if (data) { plan.data=data; plan.eKey=eKey; break; }
      }
      if (!plan.data) unresolvedKeys.push(...plan.eKeys);
    }
    const unresolvedPlans = plans.filter(p=>p.root&&!p.data);
    let locations = new Map();
    if (unresolvedPlans.length > 4) {
      locations = unresolvedKeys.length ? await this.locate([...new Set(unresolvedKeys)]) : new Map();
    } else {
      // Interactive texture lookup is usually one missing asset with multiple
      // possible encoding keys. Do not scan all 190 archive indexes waiting for
      // every alternate key: stop as soon as one encoding key can be located
      // and read successfully. This cuts first-time Search CASC latency sharply.
      for (const plan of unresolvedPlans) {
        for (const eKey of plan.eKeys) {
          const one = await this.locate([eKey]);
          const loc = one.get(eKey); if (!loc) continue;
          try { plan.data=await this.readArchive(eKey,loc); plan.eKey=eKey; break; }
          catch (e) { trace(`archive read failed ${eKey} ${e.message}`); }
        }
      }
    }
    const results=[];
    for (const plan of plans) {
      if (!plan.root) { results.push({id:plan.id,path:'',size:0,base64:''}); continue; }
      if (!plan.data) {
        for (const eKey of plan.eKeys) {
          const loc = locations.get(eKey); if (!loc) continue;
          try { plan.data=await this.readArchive(eKey,loc); plan.eKey=eKey; break; } catch (e) { trace(`archive read failed ${eKey} ${e.message}`); }
        }
      }
      if (!plan.data) results.push({id:plan.id,path:'',size:0,base64:''});
      else results.push({id:plan.id,path:plan.root.path,size:plan.data.length,base64:plan.data.toString('base64')});
    }
    return results;
  }
}

async function main() {
  const input = await new Promise((resolve,reject)=>{const parts=[];process.stdin.on('data',c=>parts.push(c));process.stdin.on('end',()=>resolve(Buffer.concat(parts).toString('utf8')));process.stdin.on('error',reject);});
  const payload = JSON.parse(input || '{}');
  const cacheDir = String(payload.cacheDir || path.join(process.cwd(),'CASC-CDN-Cache'));
  const client = new W3Cdn(String(payload.region || 'us').toLowerCase(), cacheDir, String(payload.installPath || ''));
  await client.init();
  if (payload.probeOnly) return { probe:true, backend:'cdn', region:client.region, sourceBuild:client.sourceBuild, rootEntries:client.root.size, archives:client.archives.length, results:[] };
  if (payload.search) {
    const s=payload.search||{};
    return { backend:'cdn', region:client.region, sourceBuild:client.sourceBuild, search:true, results:client.searchPaths(s.query||'',s.type||'all',s.limit||200) };
  }
  const requests = Array.isArray(payload.requests) ? payload.requests.slice(0,64) : [];
  const results = await client.readRequests(requests);
  return { backend:'cdn', region:client.region, sourceBuild:client.sourceBuild, results };
}

if (require.main === module) {
  main().then(result=>process.stdout.write(JSON.stringify(result))).catch(error=>{
    trace(`error ${error && error.stack ? error.stack : error}`);
    process.stderr.write(`CASC_CDN_ERROR ${error && error.message ? error.message : String(error)}\n`);
    process.exitCode=2;
  });
} else {
  module.exports = { decodeLz4Block, decodeBlte, parseWar3Root, parseArchiveIndex, parseConfig, parsePipeTable, normalizeVirtual, readLocalBuildInfo, localConfigPath };
}
