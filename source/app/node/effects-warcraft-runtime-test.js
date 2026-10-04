'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const mpqMap = require('./warcraft-map-mpq');

const ASSET_DIR = 'wc3asset';
const PKB_NAME = 'test_effect.pkb';
const PKFX_NAME = 'test_effect.pkfx';
const CARRIER_NAME = 'test_carrier.mdx';
const LUA_MARKER = '-- WC3AS_EFFECTS_RUNTIME_TEST';
const JASS_MARKER = '// WC3AS_EFFECTS_RUNTIME_TEST';
const packedMapValidationCache = new Map();

function bytesOf(data) {
  if (Buffer.isBuffer(data)) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Buffer.from(data);
  throw new Error('Runtime test PKB payload is missing or unsupported.');
}

function writeTag(buf, offset, tag) {
  for (let i = 0; i < 4; i++) buf[offset + i] = tag.charCodeAt(i) || 0;
}

function writeLatinZ(buf, offset, length, value) {
  buf.fill(0, offset, offset + length);
  const text = String(value || '');
  for (let i = 0; i < Math.min(length - 1, text.length); i++) buf[offset + i] = text.charCodeAt(i) & 255;
}

function chunk(tag, data) {
  const body = Buffer.from(data || []);
  const out = Buffer.alloc(8 + body.length);
  writeTag(out, 0, tag);
  out.writeUInt32LE(body.length, 4);
  body.copy(out, 8);
  return out;
}

function createCarrierMdx(effectVirtualPath = `${ASSET_DIR}\\${PKFX_NAME}`) {
  const vers = Buffer.alloc(4);
  vers.writeUInt32LE(1000, 0);

  const modl = Buffer.alloc(372);
  writeLatinZ(modl, 0, 80, 'WC3 Asset Studio Runtime Test');
  modl.writeFloatLE(256, 340);
  modl.writeFloatLE(-256, 344);
  modl.writeFloatLE(-256, 348);
  modl.writeFloatLE(-256, 352);
  modl.writeFloatLE(256, 356);
  modl.writeFloatLE(256, 360);
  modl.writeFloatLE(256, 364);
  modl.writeUInt32LE(150, 368);

  const seqs = Buffer.alloc(132);
  writeLatinZ(seqs, 0, 80, 'Stand');
  seqs.writeUInt32LE(0, 80);
  seqs.writeUInt32LE(100000, 84);
  seqs.writeFloatLE(0, 88);
  seqs.writeUInt32LE(0, 92);
  seqs.writeFloatLE(0, 96);
  seqs.writeUInt32LE(0, 100);
  seqs.writeFloatLE(256, 104);
  seqs.writeFloatLE(-256, 108);
  seqs.writeFloatLE(-256, 112);
  seqs.writeFloatLE(-256, 116);
  seqs.writeFloatLE(256, 120);
  seqs.writeFloatLE(256, 124);
  seqs.writeFloatLE(256, 128);

  const generic = Buffer.alloc(96);
  generic.writeUInt32LE(96, 0);
  writeLatinZ(generic, 4, 80, 'WC3AS_Popcorn');
  generic.writeInt32LE(0, 84);
  generic.writeInt32LE(-1, 88);
  generic.writeUInt32LE(0x1000, 92);

  const fixed = Buffer.alloc(552);
  fixed.writeFloatLE(1, 0);
  fixed.writeFloatLE(1, 4);
  fixed.writeFloatLE(1, 8);
  fixed.writeFloatLE(1, 12);
  fixed.writeFloatLE(1, 16);
  fixed.writeFloatLE(1, 20);
  fixed.writeFloatLE(1, 24);
  fixed.writeUInt32LE(0, 28);
  const cornPath = String(effectVirtualPath || `${ASSET_DIR}\\${PKFX_NAME}`).replace(/\.pkb$/i, '.pkfx');
  writeLatinZ(fixed, 32, 260, cornPath);
  writeLatinZ(fixed, 292, 260, 'Always=on');

  const cornRecord = Buffer.alloc(4 + generic.length + fixed.length);
  cornRecord.writeUInt32LE(cornRecord.length, 0);
  generic.copy(cornRecord, 4);
  fixed.copy(cornRecord, 4 + generic.length);

  const pivt = Buffer.alloc(12);
  const header = Buffer.from('MDLX', 'ascii');
  return Buffer.concat([
    header,
    chunk('VERS', vers),
    chunk('MODL', modl),
    chunk('SEQS', seqs),
    chunk('CORN', cornRecord),
    chunk('PIVT', pivt)
  ]);
}

function findWarcraftExe(installPath = '') {
  const root = String(installPath || '').trim();
  if (!root) return '';
  const candidates = [
    path.join(root, 'x86_64', 'Warcraft III.exe'),
    path.join(root, '_retail_', 'x86_64', 'Warcraft III.exe'),
    path.join(root, 'Warcraft III.exe')
  ];
  return candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile()) || '';
}


function parseWarcraftPreferences(text = '') {
  const raw = String(text || '');
  const match = raw.match(/^\s*hd\s*=\s*([01])\s*$/im);
  if (!match) return { mode: 'unknown', hd: null };
  const hd = Number(match[1]);
  return { mode: hd === 1 ? 'reforged' : 'classic', hd };
}

function detectWarcraftGraphicsMode(extraPaths = []) {
  const candidates = [];
  for (const value of Array.isArray(extraPaths) ? extraPaths : [extraPaths]) if (value) candidates.push(path.resolve(String(value)));
  const homes = [process.env.USERPROFILE, process.env.OneDrive, os.homedir()].filter(Boolean);
  for (const home of homes) {
    candidates.push(path.join(home, 'Documents', 'Warcraft III', 'War3Preferences.txt'));
    candidates.push(path.join(home, 'Warcraft III', 'War3Preferences.txt'));
  }
  const seen = new Set();
  for (const filePath of candidates) {
    const key = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (!fs.statSync(filePath).isFile()) continue;
      const parsed = parseWarcraftPreferences(fs.readFileSync(filePath, 'utf8'));
      return { ...parsed, path: filePath, found: true };
    } catch (_) {}
  }
  return { mode: 'unknown', hd: null, path: '', found: false };
}

function validateMapFolder(mapPath = '') {
  const root = path.resolve(String(mapPath || ''));
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) return { ok: false, path: root, reason: 'not-directory', kind: 'unpacked' };
  const lua = path.join(root, 'war3map.lua');
  const jass = path.join(root, 'war3map.j');
  const scriptPath = fs.existsSync(lua) ? lua : fs.existsSync(jass) ? jass : '';
  const hasMapInfo = fs.existsSync(path.join(root, 'war3map.w3i')) || fs.existsSync(path.join(root, 'war3map.w3e'));
  if (!scriptPath) return { ok: false, path: root, reason: 'missing-script', kind: 'unpacked' };
  if (!hasMapInfo) return { ok: false, path: root, reason: 'missing-map-data', kind: 'unpacked' };
  const ext = /^\.w3[mx]$/i.test(path.extname(root)) ? path.extname(root).toLowerCase() : '.w3x';
  return { ok: true, path: root, scriptPath, scriptName: path.basename(scriptPath), language: scriptPath.endsWith('.lua') ? 'lua' : 'jass', kind: 'unpacked', extension: ext };
}

function validatePackedMap(mapPath = '') {
  const target = path.resolve(String(mapPath || ''));
  if (!target || !fs.existsSync(target)) return { ok: false, path: target, reason: 'not-file', kind: 'packed' };
  const stat = fs.statSync(target);
  if (!stat.isFile()) return { ok: false, path: target, reason: 'not-file', kind: 'packed' };
  const ext = path.extname(target).toLowerCase();
  if (ext !== '.w3m' && ext !== '.w3x') return { ok: false, path: target, reason: 'wrong-extension', kind: 'packed' };
  const cacheKey = `${target}|${stat.size}|${stat.mtimeMs}`;
  const cached = packedMapValidationCache.get(cacheKey);
  if (cached) return { ...cached };
  try {
    const archive = mpqMap.open(fs.readFileSync(target));
    const scriptName = mpqMap.hasFile(archive, 'war3map.lua') ? 'war3map.lua' : mpqMap.hasFile(archive, 'war3map.j') ? 'war3map.j' : '';
    const hasMapInfo = mpqMap.hasFile(archive, 'war3map.w3i') || mpqMap.hasFile(archive, 'war3map.w3e');
    if (!scriptName) return { ok: false, path: target, reason: 'missing-script', kind: 'packed', extension: ext };
    if (!hasMapInfo) return { ok: false, path: target, reason: 'missing-map-data', kind: 'packed', extension: ext };
    const scriptBytes = mpqMap.readFile(archive, scriptName);
    if (!scriptBytes) return { ok: false, path: target, reason: 'missing-script', kind: 'packed', extension: ext };
    const result = { ok: true, path: target, scriptName, language: scriptName.endsWith('.lua') ? 'lua' : 'jass', kind: 'packed', extension: ext, archiveVersion: archive.formatVersion, archiveHeaderOffset: archive.headerOffset, size: stat.size };
    packedMapValidationCache.clear(); packedMapValidationCache.set(cacheKey, result);
    return { ...result };
  } catch (error) {
    const result = { ok: false, path: target, reason: 'mpq-error', kind: 'packed', extension: ext, error: String(error?.message || error), size: stat.size };
    packedMapValidationCache.clear(); packedMapValidationCache.set(cacheKey, result);
    return { ...result };
  }
}

function validateMap(mapPath = '') {
  const target = path.resolve(String(mapPath || ''));
  if (!target || !fs.existsSync(target)) return { ok: false, path: target, reason: 'not-found', kind: '' };
  try {
    return fs.statSync(target).isDirectory() ? validateMapFolder(target) : validatePackedMap(target);
  } catch (error) {
    return { ok: false, path: target, reason: 'stat-error', kind: '', error: String(error?.message || error) };
  }
}

function runtimeMapExtension(mapPath = '') {
  const map = validateMap(mapPath);
  if (map.extension === '.w3m') return '.w3m';
  return '.w3x';
}

function patchLua(source, effectVirtualPath = `${ASSET_DIR}\\${PKB_NAME}`) {
  const text = String(source || '');
  if (text.includes(LUA_MARKER)) return text;
  if (!/function\s+main\s*\(\s*\)/.test(text)) throw new Error('war3map.lua does not contain function main().');
  const pathLiteral = effectVirtualPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const helper = `\n${LUA_MARKER}\nfunction WC3AS_EffectsLabRuntimeTest()\n    local x = GetCameraTargetPositionX()\n    local y = GetCameraTargetPositionY()\n    local fx = AddSpecialEffect("${pathLiteral}", x, y)\n    local tag = CreateTextTag()\n    BlzSetSpecialEffectScale(fx, 1.0)\n    SetTextTagText(tag, "FX HERE", 0.023)\n    SetTextTagPos(tag, x, y, 90.0)\n    SetTextTagColor(tag, 80, 220, 255, 255)\n    SetTextTagPermanent(tag, false)\n    SetTextTagLifespan(tag, 8.0)\n    SetTextTagFadepoint(tag, 6.0)\n    PingMinimapEx(x, y, 6.0, 255, 215, 0, false)\n    DisplayTimedTextToPlayer(Player(0), 0, 0, 8.0, "WC3 Asset Studio · direct PKB spawned at camera target · look for FX HERE + gold minimap ping")\nend\n\nfunction WC3AS_EffectsLabRuntimeBootstrap()\n    local t = CreateTimer()\n    TimerStart(t, 0.75, false, function()\n        DestroyTimer(t)\n        WC3AS_EffectsLabRuntimeTest()\n    end)\nend\n`;
  return text.replace(/function\s+main\s*\(\s*\)/, match => `${helper}\n${match}\n    WC3AS_EffectsLabRuntimeBootstrap()`);
}

function patchJass(source, effectVirtualPath = `${ASSET_DIR}\\${PKB_NAME}`) {
  const text = String(source || '');
  if (text.includes(JASS_MARKER)) return text;
  const mainRe = /function\s+main\s+takes\s+nothing\s+returns\s+nothing/i;
  if (!mainRe.test(text)) throw new Error('war3map.j does not contain the generated main function.');
  const pathLiteral = effectVirtualPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const helper = `\n${JASS_MARKER}\nfunction WC3AS_EffectsLabRuntimeTest takes nothing returns nothing\n    local real x = GetCameraTargetPositionX()\n    local real y = GetCameraTargetPositionY()\n    local effect fx = AddSpecialEffect("${pathLiteral}", x, y)\n    local texttag tag = CreateTextTag()\n    call BlzSetSpecialEffectScale(fx, 1.00)\n    call SetTextTagText(tag, "FX HERE", 0.023)\n    call SetTextTagPos(tag, x, y, 90.00)\n    call SetTextTagColor(tag, 80, 220, 255, 255)\n    call SetTextTagPermanent(tag, false)\n    call SetTextTagLifespan(tag, 8.00)\n    call SetTextTagFadepoint(tag, 6.00)\n    call PingMinimapEx(x, y, 6.00, 255, 215, 0, false)\n    call DisplayTimedTextToPlayer(Player(0), 0, 0, 8.00, "WC3 Asset Studio · direct PKB spawned at camera target · look for FX HERE + gold minimap ping")\n    set tag = null\n    set fx = null\nendfunction\n\nfunction WC3AS_EffectsLabRuntimeBootstrap takes nothing returns nothing\n    local timer t = CreateTimer()\n    call TimerStart(t, 0.75, false, function WC3AS_EffectsLabRuntimeTest)\n    set t = null\nendfunction\n`;
  return text.replace(mainRe, match => `${helper}\n${match}\n    call WC3AS_EffectsLabRuntimeBootstrap()`);
}

function suppressMeleeVictory(source, language) {
  let text = String(source || '');
  if (String(language).toLowerCase() === 'jass') {
    text = text.replace(/^([ \t]*)call\s+MeleeInitVictoryDefeat\s*\(\s*\)\s*$/gim, '$1// WC3AS runtime test: MeleeInitVictoryDefeat disabled');
  } else {
    text = text.replace(/^([ \t]*)MeleeInitVictoryDefeat\s*\(\s*\)\s*$/gim, '$1-- WC3AS runtime test: MeleeInitVictoryDefeat disabled');
  }
  return text;
}

function patchMapScript(source, language, effectVirtualPath = `${ASSET_DIR}\\${PKB_NAME}`) {
  const patched = String(language).toLowerCase() === 'jass' ? patchJass(source, effectVirtualPath) : patchLua(source, effectVirtualPath);
  return suppressMeleeVictory(patched, language);
}

function copyMapFolder(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function runtimeManifest({ source, destination, pkb, effectName, buildSummary }) {
  return {
    schema: 'wc3.effects.runtime-test',
    version: 3,
    createdAt: new Date().toISOString(),
    effectName: String(effectName || 'effect'),
    language: source.language,
    mapKind: source.kind,
    mapExtension: source.extension || '.w3x',
    pkbBytes: pkb.length,
    pkbVirtualPath: `${ASSET_DIR}\\${PKB_NAME}`,
    pkfxAliasVirtualPath: `${ASSET_DIR}\\${PKFX_NAME}`,
    cornEffectPath: `${ASSET_DIR}\\${PKFX_NAME}`,
    dualBakeAlias: true,
    carrierVirtualPath: `${ASSET_DIR}\\${CARRIER_NAME}`,
    spawnAssetKind: 'pkb-direct',
    spawnAssetVirtualPath: `${ASSET_DIR}\\${PKB_NAME}`,
    spawnMode: 'camera-target',
    spawnDelaySeconds: 0.75,
    spawnMarker: 'FX HERE + gold minimap ping',
    sourceMapPath: source.path,
    runtimeMapPath: destination,
    buildSummary: buildSummary && typeof buildSummary === 'object' ? buildSummary : null
  };
}

function prepareUnpackedRuntimeMap({ source, destination, pkb, effectName, buildSummary }) {
  copyMapFolder(source.path, destination);
  const copied = validateMapFolder(destination);
  if (!copied.ok) throw new Error('The runtime test map copy is incomplete.');
  const assetDir = path.join(destination, ASSET_DIR);
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(path.join(assetDir, PKB_NAME), pkb);
  fs.writeFileSync(path.join(assetDir, PKFX_NAME), pkb);
  fs.writeFileSync(path.join(assetDir, CARRIER_NAME), createCarrierMdx(`${ASSET_DIR}\\${PKFX_NAME}`));
  const sourceScript = fs.readFileSync(copied.scriptPath, 'utf8');
  const patched = patchMapScript(sourceScript, copied.language, `${ASSET_DIR}\\${PKB_NAME}`);
  fs.writeFileSync(copied.scriptPath, patched, 'utf8');
  const manifest = runtimeManifest({ source, destination, pkb, effectName, buildSummary });
  fs.writeFileSync(path.join(assetDir, 'runtime-test.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { ...manifest, scriptPath: copied.scriptPath };
}

function preparePackedRuntimeMap({ source, destination, pkb, effectName, buildSummary }) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const original = fs.readFileSync(source.path);
  const archive = mpqMap.open(original);
  const scriptBytes = mpqMap.readFile(archive, source.scriptName);
  if (!scriptBytes) throw new Error(`Could not read ${source.scriptName} from the packed map.`);
  const scriptText = scriptBytes.toString('utf8');
  const patchedScript = Buffer.from(patchMapScript(scriptText, source.language, `${ASSET_DIR}\\${PKB_NAME}`), 'utf8');
  const carrier = createCarrierMdx(`${ASSET_DIR}\\${PKFX_NAME}`);
  const patched = mpqMap.patchArchive(original, {
    [source.scriptName]: patchedScript,
    [`${ASSET_DIR}\\${PKB_NAME}`]: pkb,
    [`${ASSET_DIR}\\${PKFX_NAME}`]: pkb,
    [`${ASSET_DIR}\\${CARRIER_NAME}`]: carrier
  });
  fs.writeFileSync(destination, patched.bytes);
  const verify = validatePackedMap(destination);
  if (!verify.ok) throw new Error(`The packed runtime map failed validation${verify.error ? `: ${verify.error}` : '.'}`);
  const verifyArchive = mpqMap.open(patched.bytes);
  const verifyPkb = mpqMap.readFile(verifyArchive, `${ASSET_DIR}\\${PKB_NAME}`);
  const verifyPkfx = mpqMap.readFile(verifyArchive, `${ASSET_DIR}\\${PKFX_NAME}`);
  const verifyCarrier = mpqMap.readFile(verifyArchive, `${ASSET_DIR}\\${CARRIER_NAME}`);
  const verifyScript = mpqMap.readFile(verifyArchive, source.scriptName);
  if (!verifyPkb || !verifyPkb.equals(pkb) || !verifyPkfx || !verifyPkfx.equals(pkb) || !verifyCarrier || verifyCarrier.subarray(0, 4).toString('ascii') !== 'MDLX' || !verifyScript || !verifyScript.toString('utf8').includes(source.language === 'jass' ? JASS_MARKER : LUA_MARKER)) throw new Error('Packed MPQ runtime-test verification failed after injection.');
  const manifest = runtimeManifest({ source, destination, pkb, effectName, buildSummary });
  manifest.mpq = { formatVersion: patched.formatVersion, headerOffset: patched.headerOffset, hashTableSize: patched.hashTableSize, blockTableSize: patched.blockTableSize, writes: patched.writes };
  fs.writeFileSync(`${destination}.runtime-test.json`, JSON.stringify(manifest, null, 2), 'utf8');
  return { ...manifest, scriptPath: `${source.scriptName} (inside MPQ)`, mpq: manifest.mpq };
}

function prepareRuntimeMap({ sourceMapPath, destinationMapPath, pkbData, effectName = 'effect', buildSummary = null } = {}) {
  const source = validateMap(sourceMapPath);
  if (!source.ok) {
    if (source.reason === 'missing-script') throw new Error('The selected map does not contain war3map.lua or war3map.j.');
    if (source.reason === 'missing-map-data') throw new Error('The selected path does not look like a Warcraft III map.');
    if (source.reason === 'mpq-error') throw new Error(`The packed Warcraft III map could not be read: ${source.error || 'invalid MPQ'}`);
    throw new Error('The selected Warcraft III test map was not found or is unsupported.');
  }
  const destination = path.resolve(String(destinationMapPath || ''));
  if (!destination) throw new Error('Runtime test destination is missing.');
  const pkb = bytesOf(pkbData);
  return source.kind === 'packed'
    ? preparePackedRuntimeMap({ source, destination, pkb, effectName, buildSummary })
    : prepareUnpackedRuntimeMap({ source, destination, pkb, effectName, buildSummary });
}

module.exports = Object.freeze({
  ASSET_DIR,
  PKB_NAME,
  PKFX_NAME,
  CARRIER_NAME,
  LUA_MARKER,
  JASS_MARKER,
  bytesOf,
  createCarrierMdx,
  findWarcraftExe,
  parseWarcraftPreferences,
  detectWarcraftGraphicsMode,
  validateMapFolder,
  validatePackedMap,
  validateMap,
  runtimeMapExtension,
  patchLua,
  patchJass,
  suppressMeleeVictory,
  patchMapScript,
  prepareRuntimeMap
});
