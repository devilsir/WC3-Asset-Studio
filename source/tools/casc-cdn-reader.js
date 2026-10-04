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
const USER_AGENT = 'WC3-Asset-Studio/1.5 CASC-TACT';

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

function normalizeArtSet(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'hd' || v === 'auto-hd') return 'hd';
  if (v === 'de') return 'de';
  return 'sd';
}
function logicalVirtualPath(value) {
  const low = normalizeVirtual(value);
  const at = low.lastIndexOf(':');
  return at >= 0 ? low.slice(at + 1) : low;
}
function virtualArtSetInfo(value) {
  const low = normalizeVirtual(value);
  const sd = /^war3sd\.w3mod:/.test(low);
  const hd = /:_hd\.w3mod:/.test(low);
  const de = /:_de\.w3mod:/.test(low);
  const moduleMatches = [...low.matchAll(/:_([a-z0-9_-]+)\.w3mod:/g)].map(m => m[1]);
  const otherModule = moduleMatches.some(x => x !== 'hd' && x !== 'de');
  const base = /^war3\.w3mod:/.test(low) && !hd && !de && !otherModule;
  const bare = !/^war3(?:sd)?\.w3mod:/.test(low);
  return { low, sd, hd, de, base, bare, otherModule };
}
function artSetPreference(value, selected='sd') {
  const set = normalizeArtSet(selected), f = virtualArtSetInfo(value);
  // Locale/censorship overlays (_fr, _teen, etc.) are intentionally excluded
  // from the SD/HD/DE gallery choices. They remain directly readable by path.
  if (f.otherModule) return 1000;
  if (set === 'hd') {
    if (f.hd) return 0;
    if (f.base) return 10;
    if (f.sd) return 20;
    if (f.bare) return 30;
    if (f.de) return 40;
  } else if (set === 'de') {
    if (f.de) return 0;
    if (f.base) return 10;
    if (f.hd) return 20;
    if (f.sd) return 30;
    if (f.bare) return 40;
  } else {
    if (f.sd) return 0;
    if (f.base) return 10;
    if (f.bare) return 20;
    if (f.hd) return 30;
    if (f.de) return 40;
  }
  return 1000;
}
function modelPathFlags(value) {
  const low = normalizeVirtual(value);
  const model = /\.(mdx|mdl)$/.test(low);
  const portrait = model && (/(^|[:\\])portraits?([\\]|$)/.test(low) || /(?:^|[\\])[^\\]*portrait[^\\]*\.(?:mdx|mdl)$/.test(low));
  const building = model && /(^|[:\\])buildings([\\]|$)/.test(low);
  const doodad = model && /(^|[:\\])doodads([\\]|$)/.test(low);
  const effect = model && /(^|[:\\])(abilities|effects|spells|sharedmodels)([\\]|$)/.test(low);
  const projectile = model && (/(^|[:\\])(missiles?|projectiles?)([\\]|$)/.test(low) || /(?:missile|projectile)[^\\]*\.(?:mdx|mdl)$/.test(low));
  const item = model && /(^|[:\\])(items|inventoryitems)([\\]|$)|(^|[:\\])objects[\\]inventoryitems([\\]|$)/.test(low);
  const environment = model && /(^|[:\\])(environment|terrain|cliffs?|water)([\\]|$)/.test(low);
  const hero = model && (/(^|[:\\])heroes?([\\]|$)/.test(low) || /(^|[\\])hero[^\\]*([\\]|$)/.test(low) || /(?:^|[\\])hero[^\\]*\.(?:mdx|mdl)$/.test(low));
  const unitRoot = model && /(^|[:\\])(units|characters|creatures)([\\]|$)/.test(low);
  const unit = unitRoot && !hero && !portrait;
  return { low, model, unit, hero, building, doodad, effect, projectile, item, environment, portrait };
}
function modelCategoryMatches(type, value) {
  const mode = String(type || 'models').toLowerCase();
  const f = modelPathFlags(value);
  if (mode === 'models' || mode === 'model') return f.model;
  if (mode === 'model-units' || mode === 'unit-models') return f.unit;
  if (mode === 'heroes' || mode === 'hero') return f.hero && !f.portrait;
  if (mode === 'buildings' || mode === 'building') return f.building;
  if (mode === 'doodads' || mode === 'doodad') return f.doodad;
  if (mode === 'effects' || mode === 'effect' || mode === 'fx') return f.effect && !f.projectile;
  if (mode === 'projectiles' || mode === 'projectile' || mode === 'missiles' || mode === 'missile') return f.projectile;
  if (mode === 'items' || mode === 'item') return f.item;
  if (mode === 'environment' || mode === 'terrain') return f.environment;
  if (mode === 'portraits' || mode === 'portrait') return f.portrait;
  if (mode === 'model-other' || mode === 'other-models') return f.model && !(f.unit || f.hero || f.building || f.doodad || f.effect || f.projectile || f.item || f.environment || f.portrait);
  return null;
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

function parseIndexFooter(buffer) {
  // TACT has shipped two closely related index-footer layouts:
  //  1) fixed 16-byte TOC hashes + 12-byte metadata + N-byte footer hash
  //     (CascLib FILE_INDEX_FOOTER; total = 28 + N)
  //  2) N-byte last-page hash + N-byte contents hash + the same 12-byte
  //     metadata + N-byte footer hash (TACT.Net; total = 12 + 3*N).
  // Warcraft III builds can use either representation. Probe both layouts,
  // both endian variants of ElementCount, and choose the dimensions that best
  // explain the complete file rather than rejecting a valid archive-group.
  if (!Buffer.isBuffer(buffer) || buffer.length < 28) return null;

  const candidates = [];
  const pushCandidate = (layout, hashBytes, footer, meta, footerSize, pageHashMode='minus1') => {
    if (footer < 0 || meta < 0 || meta + 12 + hashBytes > buffer.length) return;
    const version = buffer[meta];
    const pageSizeKB = buffer[meta + 3];
    const offsetBytes = buffer[meta + 4];
    const sizeBytes = buffer[meta + 5];
    const keyBytes = buffer[meta + 6];
    const storedHashBytes = buffer[meta + 7];
    if (storedHashBytes !== hashBytes || version !== 1) return;
    if (!pageSizeKB || pageSizeKB > 64 || sizeBytes < 1 || sizeBytes > 8 || keyBytes < 8 || keyBytes > 32) return;
    if (![0,4,5,6].includes(offsetBytes)) return;

    const pageSize = pageSizeKB * 1024;
    const entrySize = keyBytes + sizeBytes + offsetBytes;
    const entriesPerPage = Math.floor(pageSize / entrySize);
    if (!entriesPerPage) return;

    const rawCounts = [
      { endian:'le', value:buffer.readUInt32LE(meta + 8) },
      { endian:'be', value:buffer.readUInt32BE(meta + 8) }
    ];
    const seen = new Set();
    for (const row of rawCounts) {
      const entryCount = Number(row.value) || 0;
      if (!entryCount || entryCount > 50_000_000 || seen.has(entryCount)) continue;
      seen.add(entryCount);
      const pageCount = Math.ceil(entryCount / entriesPerPage);
      const pageBytes = pageCount * pageSize;
      if (!pageCount || pageBytes > footer) continue;

      const tocBytes = pageCount * keyBytes;
      const pageHashBytes = (pageHashMode === 'all' ? pageCount : Math.max(0, pageCount - 1)) * hashBytes;
      const expectedSize = pageBytes + tocBytes + pageHashBytes + footerSize;
      const slack = buffer.length - expectedSize;
      const preFooterSlack = footer - pageBytes;
      if (preFooterSlack < 0) continue;

      let score = Math.abs(slack);
      if (slack < 0) score += pageSize * 32;
      if (preFooterSlack < tocBytes) score += pageSize * 16;
      if (row.endian === 'be') score += 0.25;

      candidates.push({
        layout, footer, footerSize, checksumSize:hashBytes, version, pageSize,
        offsetBytes, sizeBytes, keyBytes, entryCount, entrySize,
        entriesPerPage, pageCount, countEndian:row.endian,
        expectedSize, slack, preFooterSlack, score
      });
    }
  };

  for (let hashBytes = 1; hashBytes <= 32; hashBytes++) {
    {
      const meta = buffer.length - (12 + hashBytes);
      const footer = meta - 16;
      const footerSize = 28 + hashBytes;
      pushCandidate('fixed16', hashBytes, footer, meta, footerSize);
    }
    {
      const footerSize = 12 + hashBytes * 3;
      const footer = buffer.length - footerSize;
      const meta = footer + hashBytes * 2;
      pushCandidate('dynamic', hashBytes, footer, meta, footerSize);
    }
    {
      // Current Warcraft III group indices can use the compact Blizzard layout:
      // N-byte TOC hash + 12-byte metadata + N-byte footer hash. Unlike the
      // older dynamic layout, the TOC contains one page hash for every page.
      const footerSize = 12 + hashBytes * 2;
      const footer = buffer.length - footerSize;
      const meta = footer + hashBytes;
      pushCandidate('compact', hashBytes, footer, meta, footerSize, 'all');
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a,b) => a.score-b.score || Math.abs(a.slack)-Math.abs(b.slack) || a.footer-b.footer);
  return candidates[0];
}
function compareIndexKey(buffer, pos, target, keyBytes) {
  for (let i = 0; i < keyBytes; i++) {
    const d = buffer[pos + i] - target[i];
    if (d) return d;
  }
  return 0;
}

function readUIntBE(buffer, pos, bytes) {
  if (bytes <= 6) return buffer.readUIntBE(pos, bytes);
  let value = 0n;
  for (let i = 0; i < bytes; i++) value = (value << 8n) | BigInt(buffer[pos + i]);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : Number.MAX_SAFE_INTEGER;
}

function parseGroupIndex(buffer, archives, wanted, found) {
  // archive-group is the merged TACT index. Group entries are sorted by EKey
  // and use Key + compressed-size + archive-ordinal(2 BE) + offset(4 BE).
  // Resolve only requested EKeys with binary search instead of linearly scanning
  // the whole ~7 MB group index for every gallery batch.
  if (!Buffer.isBuffer(buffer) || !Array.isArray(archives) || !(wanted instanceof Set) || !(found instanceof Map)) return false;
  const footer = parseIndexFooter(buffer);
  if (!footer || (footer.offsetBytes !== 5 && footer.offsetBytes !== 6)) return false;
  const { pageSize, sizeBytes, keyBytes, entryCount, entrySize, entriesPerPage } = footer;
  trace(`archive-group footer layout=${footer.layout} page=${pageSize} entry=${entrySize} count=${entryCount} key=${keyBytes} size=${sizeBytes} offset=${footer.offsetBytes} hash=${footer.checksumSize} countEndian=${footer.countEndian} slack=${footer.slack}`);

  const entryPos = (index) => Math.floor(index / entriesPerPage) * pageSize + (index % entriesPerPage) * entrySize;
  for (const originalKey of wanted) {
    const fullKey = safeKey(originalKey);
    if (!fullKey || fullKey.length < keyBytes * 2 || found.has(originalKey)) continue;
    const target = Buffer.from(fullKey.slice(0, keyBytes * 2), 'hex');
    let lo = 0, hi = entryCount - 1, match = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const pos = entryPos(mid);
      if (pos + entrySize > footer.footer) return false;
      const cmp = compareIndexKey(buffer, pos, target, keyBytes);
      if (cmp < 0) lo = mid + 1;
      else if (cmp > 0) hi = mid - 1;
      else { match = pos; break; }
    }
    if (match < 0) continue;
    const size = readUIntBE(buffer, match + keyBytes, sizeBytes);
    const ordinalAt = match + keyBytes + sizeBytes;
    const archiveIndexBytes = footer.offsetBytes - 4;
    const archiveIndex = readUIntBE(buffer, ordinalAt, archiveIndexBytes);
    const offset = buffer.readUInt32BE(ordinalAt + archiveIndexBytes);
    const archiveHash = archives[archiveIndex];
    if (archiveHash && size > 0 && size <= MAX_HTTP_BYTES) {
      found.set(originalKey, { archiveHash, offset, size });
    }
  }
  return true;
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
    this.locationMapComplete = false; this.locationMapPromise = null;
    this.archiveGroup = ''; this.groupIndexBuffer = null; this.groupIndexUnavailable = false;
    this.sourceBuild = ''; this.hosts = [];
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
      this.hosts = [...new Set((local.hosts || []).filter(Boolean))];
      this.host = this.hosts[0] || '';
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
      this.hosts = [...new Set([...(this.hosts || []), ...hosts])];
      if (!this.host) this.host = this.hosts[0] || '';
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
    this.archiveGroup = safeKey(Array.isArray(cdnCfg['archive-group']) ? cdnCfg['archive-group'][0] : String(cdnCfg['archive-group'] || '').split(/\s+/)[0]);
    trace(`archive-group=${this.archiveGroup ? 'yes' : 'no'}`);

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
  locationMapFile(){ return cacheFile(this.cacheDir,'locmap',`${this.cdnHash}.bin`); }
  loadLocationMap(){
    if(this.locationMapComplete) return true;
    const b=readCache(this.locationMapFile());
    if(!b||b.length<12||b.toString('ascii',0,8)!=='W3LIDX1\0') return false;
    const count=b.readUInt32LE(8),recordSize=26,expected=12+count*recordSize;
    if(count>2000000||expected!==b.length) return false;
    const cache=new Map();
    for(let i=0,p=12;i<count;i++,p+=recordSize){
      const eKey=b.toString('hex',p,p+16),archiveIndex=b.readUInt16LE(p+16),offset=b.readUInt32LE(p+18),size=b.readUInt32LE(p+22),archiveHash=this.archives[archiveIndex];
      if(archiveHash&&size>0&&size<=MAX_HTTP_BYTES) cache.set(eKey,{archiveHash,offset,size});
    }
    this.locationCache=cache;this.locationMapComplete=true;trace(`location map loaded entries=${cache.size}`);return true;
  }
  saveLocationMap(){
    if(!this.locationCache.size)return;
    const archiveIndex=new Map(this.archives.map((hash,i)=>[hash,i])),rows=[];
    for(const [eKey,loc] of this.locationCache){const ai=archiveIndex.get(loc.archiveHash);if(ai==null||ai>65535||!safeKey(eKey))continue;rows.push([eKey,ai,loc]);}
    const b=Buffer.allocUnsafe(12+rows.length*26);b.write('W3LIDX1\0',0,8,'ascii');b.writeUInt32LE(rows.length,8);let p=12;
    for(const [eKey,ai,loc] of rows){Buffer.from(eKey,'hex').copy(b,p);b.writeUInt16LE(ai,p+16);b.writeUInt32LE(loc.offset>>>0,p+18);b.writeUInt32LE(loc.size>>>0,p+22);p+=26;}
    writeCache(this.locationMapFile(),b);trace(`location map saved entries=${rows.length} bytes=${b.length}`);
  }
  async ensureLocationMap(){
    if(!this.locationMapComplete)this.loadLocationMap();
    if(this.locationMapComplete)return this.locationCache;
    if(this.locationMapPromise)return this.locationMapPromise;
    this.locationMapPromise=(async()=>{
      const wanted=new Set();let failedIndexes=0;
      for(const cKey of this.root.values()) for(const eKey of (this.encoding.get(cKey)||[])) if(safeKey(eKey)) wanted.add(eKey);
      for(const eKey of this.locationCache.keys())wanted.delete(eKey);
      trace(`location map build targets=${wanted.size} cached=${this.locationCache.size}`);
      const concurrency=12;
      for(let i=0;i<this.archives.length;i+=concurrency){
        const batch=this.archives.slice(i,i+concurrency);
        await Promise.all(batch.map(async archiveHash=>{
          try{const f=cacheFile(this.cacheDir,'index',`${archiveHash}.index`),b=await fetchCdnCached(dataUrl(this.host,this.cdnPath,archiveHash,true),f,{maxBytes:32*1024*1024,timeout:20000}),localFound=new Map();parseArchiveIndex(b,archiveHash,wanted,localFound);for(const [eKey,loc] of localFound){this.locationCache.set(eKey,loc);wanted.delete(eKey);}}catch(e){failedIndexes++;trace(`index failed ${archiveHash} ${e.message}`);}
        }));
        trace(`location map progress ${Math.min(i+concurrency,this.archives.length)}/${this.archives.length} remaining=${wanted.size}`);
      }
      this.locationMapComplete=failedIndexes===0;if(this.locationMapComplete)this.saveLocationMap();else trace(`location map incomplete failedIndexes=${failedIndexes}`);return this.locationCache;
    })().finally(()=>{this.locationMapPromise=null;});
    return this.locationMapPromise;
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
  candidateHosts() {
    const regionHost = this.region && this.region !== 'cn' ? `${this.region}.cdn.blizzard.com` : '';
    const values = [this.host, ...(this.hosts || []), regionHost, 'level3.ssl.blizzard.com'];
    return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
  }
  dataCandidates(hash, index=false) {
    const out = [];
    for (const host of this.candidateHosts()) {
      const base = dataUrl(host, this.cdnPath, hash, index);
      if (/^http:\/\//i.test(base)) out.push(base.replace(/^http:/i,'https:'), base);
      else out.push(base);
    }
    return [...new Set(out)];
  }
  async readLoose(eKey) {
    const cache = cacheFile(this.cacheDir, 'asset', eKey);
    const existing = readCache(cache); if (existing) return existing;
    try {
      let encoded = null, last = null;
      for (const candidate of this.dataCandidates(eKey, false)) { try { encoded = await requestBuffer(candidate, { maxBytes:64*1024*1024, timeout:15000 }); break; } catch (e) { last=e; } }
      if (!encoded) throw last || new Error('Loose CDN asset unavailable.');
      const decoded = decodeBlte(encoded); writeCache(cache, decoded); return decoded;
    } catch (_) { return null; }
  }
  locationFile(eKey) { return cacheFile(this.cacheDir,'loc',`${this.cdnHash}-${safeKey(eKey)}.json`); }
  loadSavedLocation(eKey) {
    const key=safeKey(eKey); if(!key)return null;
    const f = this.locationFile(key);
    try { const v = JSON.parse(fs.readFileSync(f,'utf8')); return v && v.archiveHash && Number.isFinite(v.offset) && Number.isFinite(v.size) ? v : null; } catch (_) { return null; }
  }
  saveLocation(eKey, loc) { const key=safeKey(eKey);if(key&&loc)writeCache(this.locationFile(key), Buffer.from(JSON.stringify(loc))); }
  invalidateLocation(eKey, reason='') {
    const key=safeKey(eKey); if(!key)return;
    this.locationCache.delete(key);
    try{fs.rmSync(this.locationFile(key),{force:true});}catch(_){}
    // A failed range can mean a compact map produced by an older/broken
    // index parser is stale. Drop that map once so the next lookup is rebuilt
    // from the authoritative group/per-archive index instead of poisoning every
    // future helper process.
    if(this.locationMapComplete){
      this.locationMapComplete=false;
      try{fs.rmSync(this.locationMapFile(),{force:true});}catch(_){}
    }
    trace(`stale location invalidated ${key}${reason?` reason=${reason}`:''}`);
  }
  async loadGroupIndex() {
    if (this.groupIndexBuffer) return this.groupIndexBuffer;
    if (!this.archiveGroup || this.groupIndexUnavailable) return null;
    try {
      let data = null;
      if (this.installPath) {
        const local = path.join(this.installPath, 'Data', 'indices', `${this.archiveGroup}.index`);
        try { data = fs.readFileSync(local); trace(`archive-group local bytes=${data.length}`); } catch (_) {}
      }
      if (!data) {
        const f = cacheFile(this.cacheDir, 'group-index', `${this.archiveGroup}.index`);
        data = await fetchCdnCached(dataUrl(this.host, this.cdnPath, this.archiveGroup, true), f, { maxBytes:64*1024*1024, timeout:20000 });
        trace(`archive-group cache/cdn bytes=${data.length}`);
      }
      this.groupIndexBuffer = data;
      return data;
    } catch (e) {
      this.groupIndexUnavailable = true;
      trace(`archive-group unavailable ${e.message}`);
      return null;
    }
  }
  async locateFromGroupIndex(wanted) {
    const found = new Map();
    if (!wanted?.size || !this.archiveGroup || this.groupIndexUnavailable) return { usable:false, found };
    const b = await this.loadGroupIndex();
    if (!b) return { usable:false, found };
    const usable = parseGroupIndex(b, this.archives, wanted, found);
    if (!usable) {
      this.groupIndexUnavailable = true;
      trace(`archive-group parse rejected bytes=${b.length} tail=${b.subarray(Math.max(0,b.length-64)).toString('hex')}; falling back to per-archive indices`);
      return { usable:false, found:new Map() };
    }
    for (const [eKey, loc] of found) {
      this.locationCache.set(eKey, loc);
      this.saveLocation(eKey, loc);
    }
    trace(`archive-group lookup wanted=${wanted.size} found=${found.size}`);
    return { usable:true, found };
  }
  readCachedAsset(eKey) {
    const key=safeKey(eKey); if(!key) return null;
    return readCache(cacheFile(this.cacheDir,'asset',key));
  }
  async locatePlans(plans) {
    const pending=new Set(), wanted=new Set(), owners=new Map(), found=new Map();
    const accept=(eKey,loc)=>{
      if(!loc)return;
      if(!found.has(eKey)){found.set(eKey,loc);this.locationCache.set(eKey,loc);this.saveLocation(eKey,loc);}
      const planIds=owners.get(eKey);if(!planIds)return;
      for(const planId of planIds){
        if(!pending.has(planId))continue;
        const plan=plans[planId];plan.location=loc;plan.eKey=eKey;pending.delete(planId);
        for(const sibling of plan.eKeys)wanted.delete(sibling);
      }
    };
    for(let i=0;i<(plans||[]).length;i++){
      const plan=plans[i]; if(!plan?.root||!plan.eKeys?.length||plan.data) continue;
      for(const eKey of plan.eKeys){
        const saved=this.locationCache.get(eKey)||this.loadSavedLocation(eKey);
        if(saved){ plan.location=saved; plan.eKey=eKey; found.set(eKey,saved); break; }
      }
      if(plan.location) continue;
      pending.add(i);
      for(const eKey of plan.eKeys){
        wanted.add(eKey);
        if(!owners.has(eKey)) owners.set(eKey,new Set());
        owners.get(eKey).add(i);
      }
    }
    if(!pending.size||this.locationMapComplete) return found;

    // Current TACT builds publish one archive-group index containing the
    // locations for all CDN archives. A single 4-8 MB scan is dramatically
    // cheaper than parsing up to ~190 individual .index files per thumbnail.
    const group=await this.locateFromGroupIndex(new Set(wanted));
    if(group.usable){
      for(const [eKey,loc] of group.found)accept(eKey,loc);
      // archive-group is authoritative for archived assets. Anything left is
      // normally a loose CDN file, which readRequests will try directly.
      trace(`archive-group batch remainingPlans=${pending.size}`);
      return found;
    }

    // Compatibility fallback for builds that do not publish a usable group
    // index. One pass resolves the entire request batch, never one pass/card.
    trace(`index batch plans=${pending.size} keys=${wanted.size}`);
    const concurrency=12;
    for(let i=0;i<this.archives.length&&pending.size;i+=concurrency){
      const batch=this.archives.slice(i,i+concurrency);
      await Promise.all(batch.map(async archiveHash=>{
        if(!pending.size)return;
        try{
          const f=cacheFile(this.cacheDir,'index',`${archiveHash}.index`);
          const b=await fetchCdnCached(dataUrl(this.host,this.cdnPath,archiveHash,true),f,{maxBytes:32*1024*1024,timeout:20000});
          const localFound=new Map();parseArchiveIndex(b,archiveHash,wanted,localFound);
          for(const [eKey,loc] of localFound)accept(eKey,loc);
        }catch(e){trace(`index failed ${archiveHash} ${e.message}`);}
      }));
      trace(`index batch progress ${Math.min(i+concurrency,this.archives.length)}/${this.archives.length} remainingPlans=${pending.size}`);
    }
    return found;
  }
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
    const opts = { range:{offset:loc.offset,size:loc.size}, headers:{Range:`bytes=${loc.offset}-${loc.offset+loc.size-1}`}, maxBytes:Math.min(MAX_HTTP_BYTES,loc.size+1024), timeout:25000 };
    let encoded = null, last = null;
    for (const candidate of this.dataCandidates(loc.archiveHash, false)) { try { encoded = await requestBuffer(candidate, opts); break; } catch (e) { last=e; } }
    if (!encoded) throw last || new Error('Archive range request failed.');
    const decoded = decodeBlte(encoded); writeCache(cache,decoded); return decoded;
  }
  searchPaths(query='', type='all', limit=200, offset=0, artSet='sd') {
    const q = normalizeVirtual(query).replace(/\\/g,' ').trim().replace(/\s+/g,' ');
    const terms = q.split(' ').filter(Boolean);
    const mode = String(type || 'all').toLowerCase();
    const selectedArtSet = normalizeArtSet(artSet);
    const max = Math.max(1, Math.min(500, Number(limit) || 200));
    const start = Math.max(0, Math.min(100000, Number(offset) || 0));
    const extOk = (p) => {
      const low=String(p||'').toLowerCase();
      if(mode==='textures'||mode==='texture') return /\.(blp|dds|tga|png|jpg|jpeg)$/.test(low);
      const categoryMatch=modelCategoryMatches(mode,low);
      if(categoryMatch!==null) return categoryMatch;
      if(mode==='units'||mode==='unit'||mode==='creatures'||mode==='creature') return /\.(mdx|mdl)$/.test(low) && /(^|[:\\])(units|characters|creatures|heroes|buildings)([\\]|$)/.test(low);
      if(mode==='effects'||mode==='effect'||mode==='fx') return modelPathFlags(low).effect;
      if(mode==='sounds'||mode==='sound') return /\.(wav|mp3|ogg|flac|opus)$/.test(low);
      return true;
    };
    const score = (p) => {
      let n=0; const low=String(p||'').toLowerCase();
      for(const t of terms){const at=low.indexOf(t);if(at<0)return -1;n += at===0?12:(low.includes('\\'+t)?8:4);}
      if(/(^|[:\\])(abilities|effects|spells)([\\]|$)/.test(low)) n+=2;
      return n;
    };

    // Collapse namespace variants to one logical Warcraft path. This avoids
    // showing the same model three times while still preferring the user's
    // selected SD / HD / DE storage namespace.
    const preferred=new Map();
    for(const p of this.root.keys()){
      if(!extOk(p)) continue;
      const sc=score(p);if(sc<0)continue;
      const pref=artSetPreference(p,selectedArtSet);
      if(pref>=1000) continue;
      const logical=logicalVirtualPath(p);
      const current=preferred.get(logical);
      if(!current || pref<current.pref || (pref===current.pref && sc>current.score) || (pref===current.pref && sc===current.score && String(p).length<current.path.length)){
        preferred.set(logical,{path:p,score:sc,pref,logical});
      }
    }
    const rows=[...preferred.values()];
    const modelBrowseRank=(p)=>{const low=String(p||'').toLowerCase();let rank=0;if(/(^|[:\\])(units|characters|creatures|heroes|buildings)([\\]|$)/.test(low))rank-=12;else if(/(^|[:\\])(doodads|environment)([\\]|$)/.test(low))rank-=4;else if(/(^|[:\\])(abilities|effects|spells|sharedmodels)([\\]|$)/.test(low))rank+=4;if(/(?:camera|portrait|target)\.(?:mdx|mdl)$/.test(low))rank+=3;return rank;};
    rows.sort(terms.length
      ? (a,b)=>b.score-a.score||a.pref-b.pref||modelBrowseRank(a.path)-modelBrowseRank(b.path)||a.path.length-b.path.length||a.path.localeCompare(b.path)
      : ((modelCategoryMatches(mode,'x.mdx')!==null||mode==='models'||mode==='model')
        ? (a,b)=>a.pref-b.pref||modelBrowseRank(a.path)-modelBrowseRank(b.path)||a.logical.localeCompare(b.logical)
        : (a,b)=>a.pref-b.pref||a.logical.localeCompare(b.logical)));
    return {results:rows.slice(start,start+max).map(x=>x.path),total:rows.length,offset:start,limit:max,artSet:selectedArtSet};
  }

  async readRequests(requests) {
    const plans=[];
    for(const req of requests||[]){
      const root=this.findRootKey(req.candidates||[]),eKeys=root?this.eKeysFor(root.key):[];
      const plan={id:req.id,root,eKeys};
      // Decoded assets are persistent across helper processes. Check them
      // before any network/INDEX work so reopening a gallery is instant.
      for(const eKey of eKeys){const cached=this.readCachedAsset(eKey);if(cached){plan.data=cached;plan.eKey=eKey;break;}}
      plans.push(plan);
    }

    const unresolved=plans.filter(p=>p.root&&!p.data);
    if(unresolved.length&&!this.locationMapComplete)this.loadLocationMap();
    // Gallery-sized reads pay the archive-index cost once and persist a compact
    // build-specific eKey->archive map. Later helper processes load that map
    // instead of rescanning up to 191 .index files for every card/texture.
    if(unresolved.length>=6&&!this.locationMapComplete&&!this.archiveGroup) await this.ensureLocationMap();
    if(unresolved.length) await this.locatePlans(plans);

    // Archive reads can run together once their locations are known. This is
    // especially important for Model Gallery where 8-12 visible MDX files are
    // requested as one batch instead of spawning an index scan per card.
    const failedLocations=[];
    await Promise.all(plans.map(async plan=>{
      if(!plan.root||plan.data||!plan.location||!plan.eKey)return;
      try{plan.data=await this.readArchive(plan.eKey,plan.location);}
      catch(e){
        trace(`archive read failed ${plan.eKey} ${e.message}`);
        failedLocations.push({plan,eKey:plan.eKey,error:String(e?.message||e)});
      }
    }));

    // Location caches survive helper processes. If an older parser ever wrote a
    // bad archive ordinal/offset, a perfectly valid model can otherwise fail in
    // ~100 ms forever. Invalidate only the failed keys, resolve the batch once
    // more from the authoritative index, and retry the range request.
    if(failedLocations.length){
      for(const row of failedLocations){
        this.invalidateLocation(row.eKey,row.error);
        row.plan.location=null;row.plan.eKey='';
      }
      trace(`archive location retry plans=${failedLocations.length}`);
      await this.locatePlans(failedLocations.map(x=>x.plan));
      await Promise.all(failedLocations.map(async({plan})=>{
        if(plan.data||!plan.location||!plan.eKey)return;
        try{plan.data=await this.readArchive(plan.eKey,plan.location);}
        catch(e){trace(`archive retry failed ${plan.eKey} ${e.message}`);}
      }));
    }

    // Loose CDN files are uncommon for normal Warcraft models/textures. Try
    // them only after the archive lookup/retry misses, avoiding a speculative
    // HTTP request for every thumbnail.
    await Promise.all(plans.map(async plan=>{
      if(!plan.root||plan.data)return;
      for(const eKey of plan.eKeys){
        const data=await this.readLoose(eKey);
        if(data){plan.data=data;plan.eKey=eKey;break;}
      }
    }));

    const results=[];
    for(const plan of plans){
      if(!plan.root||!plan.data) results.push({id:plan.id,path:'',size:0,base64:''});
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
    const page=client.searchPaths(s.query||'',s.type||'all',s.limit||200,s.offset||0,s.artSet||'sd');
    return { backend:'cdn', region:client.region, sourceBuild:client.sourceBuild, search:true, artSet:page.artSet, results:page.results, total:page.total, offset:page.offset, limit:page.limit };
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
  module.exports = { W3Cdn, modelPathFlags, modelCategoryMatches, normalizeArtSet, logicalVirtualPath, virtualArtSetInfo, artSetPreference, decodeLz4Block, decodeBlte, parseWar3Root, parseArchiveIndex, parseGroupIndex, parseIndexFooter, parseConfig, parsePipeTable, normalizeVirtual, readLocalBuildInfo, localConfigPath };
}
