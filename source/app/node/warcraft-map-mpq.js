'use strict';

const zlib = require('zlib');

const MPQ_MAGIC = Buffer.from([0x4d, 0x50, 0x51, 0x1a]);
const HASH_TABLE_KEY_NAME = '(hash table)';
const BLOCK_TABLE_KEY_NAME = '(block table)';
const HASH_TABLE_OFFSET = 0;
const HASH_NAME_A = 1;
const HASH_NAME_B = 2;
const HASH_FILE_KEY = 3;
const MPQ_FILE_IMPLODE = 0x00000100;
const MPQ_FILE_COMPRESS = 0x00000200;
const MPQ_FILE_ENCRYPTED = 0x00010000;
const MPQ_FILE_FIX_KEY = 0x00020000;
const MPQ_FILE_SINGLE_UNIT = 0x01000000;
const MPQ_FILE_SECTOR_CRC = 0x04000000;
const MPQ_FILE_EXISTS = 0x80000000;
const HASH_ENTRY_EMPTY = 0xffffffff;
const HASH_ENTRY_DELETED = 0xfffffffe;

let CRYPT_TABLE = null;
function cryptTable() {
  if (CRYPT_TABLE) return CRYPT_TABLE;
  const out = new Uint32Array(0x500);
  let seed = 0x00100001;
  for (let i = 0; i < 0x100; i++) {
    let j = i;
    for (let k = 0; k < 5; k++, j += 0x100) {
      seed = (Math.imul(seed, 125) + 3) % 0x2aaaab;
      const a = (seed & 0xffff) << 16;
      seed = (Math.imul(seed, 125) + 3) % 0x2aaaab;
      out[j] = (a | (seed & 0xffff)) >>> 0;
    }
  }
  CRYPT_TABLE = out;
  return out;
}

function normalizeName(name) {
  return String(name || '').replace(/\//g, '\\').toUpperCase();
}

function hashString(name, type) {
  const table = cryptTable();
  const text = normalizeName(name);
  let seed1 = 0x7fed7fed >>> 0;
  let seed2 = 0xeeeeeeee >>> 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i) & 0xff;
    seed1 = (table[(type << 8) + ch] ^ ((seed1 + seed2) >>> 0)) >>> 0;
    seed2 = (ch + seed1 + seed2 + ((seed2 << 5) >>> 0) + 3) >>> 0;
  }
  return seed1 >>> 0;
}

function cryptDwords(buffer, key, encrypt) {
  const input = Buffer.from(buffer);
  const out = Buffer.from(input);
  const table = cryptTable();
  let seed1 = key >>> 0;
  let seed2 = 0xeeeeeeee >>> 0;
  const words = Math.floor(out.length / 4);
  for (let i = 0; i < words; i++) {
    seed2 = (seed2 + table[0x400 + (seed1 & 0xff)]) >>> 0;
    const raw = input.readUInt32LE(i * 4) >>> 0;
    const plain = encrypt ? raw : (raw ^ ((seed1 + seed2) >>> 0)) >>> 0;
    const coded = encrypt ? (raw ^ ((seed1 + seed2) >>> 0)) >>> 0 : plain;
    out.writeUInt32LE(coded >>> 0, i * 4);
    seed1 = ((((~seed1) << 21) >>> 0) + 0x11111111 | (seed1 >>> 11)) >>> 0;
    seed2 = (plain + seed2 + ((seed2 << 5) >>> 0) + 3) >>> 0;
  }
  return out;
}

function decryptBlock(buffer, key) { return cryptDwords(buffer, key, false); }
function encryptBlock(buffer, key) { return cryptDwords(buffer, key, true); }

function locateHeader(buffer) {
  const limit = Math.min(buffer.length, 4 * 1024 * 1024);
  let at = buffer.indexOf(MPQ_MAGIC, 0);
  while (at >= 0 && at < limit) {
    if (at + 32 <= buffer.length) {
      const size = buffer.readUInt32LE(at + 4);
      if (size >= 32 && size <= 208 && at + size <= buffer.length) return at;
    }
    at = buffer.indexOf(MPQ_MAGIC, at + 1);
  }
  return -1;
}

function safeRange(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) throw new Error(`MPQ ${label} is outside the archive.`);
  return buffer.subarray(offset, offset + length);
}

function parseTableEntries(buffer, count, kind) {
  const entries = [];
  if (kind === 'hash') {
    for (let i = 0; i < count; i++) {
      const o = i * 16;
      entries.push({ hashA: buffer.readUInt32LE(o), hashB: buffer.readUInt32LE(o + 4), locale: buffer.readUInt16LE(o + 8), platform: buffer.readUInt16LE(o + 10), blockIndex: buffer.readUInt32LE(o + 12) });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const o = i * 16;
      entries.push({ filePos: buffer.readUInt32LE(o), compressedSize: buffer.readUInt32LE(o + 4), fileSize: buffer.readUInt32LE(o + 8), flags: buffer.readUInt32LE(o + 12) >>> 0 });
    }
  }
  return entries;
}

function serializeHashTable(entries) {
  const out = Buffer.alloc(entries.length * 16, 0xff);
  entries.forEach((e, i) => {
    const o = i * 16;
    out.writeUInt32LE((e.hashA ?? 0xffffffff) >>> 0, o);
    out.writeUInt32LE((e.hashB ?? 0xffffffff) >>> 0, o + 4);
    out.writeUInt16LE((e.locale ?? 0xffff) & 0xffff, o + 8);
    out.writeUInt16LE((e.platform ?? 0xffff) & 0xffff, o + 10);
    out.writeUInt32LE((e.blockIndex ?? 0xffffffff) >>> 0, o + 12);
  });
  return out;
}

function serializeBlockTable(entries) {
  const out = Buffer.alloc(entries.length * 16);
  entries.forEach((e, i) => {
    const o = i * 16;
    out.writeUInt32LE(e.filePos >>> 0, o);
    out.writeUInt32LE(e.compressedSize >>> 0, o + 4);
    out.writeUInt32LE(e.fileSize >>> 0, o + 8);
    out.writeUInt32LE(e.flags >>> 0, o + 12);
  });
  return out;
}

function open(buffer) {
  const bytes = Buffer.from(buffer);
  const headerOffset = locateHeader(bytes);
  if (headerOffset < 0) throw new Error('The selected file is not an MPQ Warcraft map.');
  const headerSize = bytes.readUInt32LE(headerOffset + 4);
  const formatVersion = bytes.readUInt16LE(headerOffset + 12);
  const blockSizeShift = bytes.readUInt16LE(headerOffset + 14);
  const hashPosLow = bytes.readUInt32LE(headerOffset + 16);
  const blockPosLow = bytes.readUInt32LE(headerOffset + 20);
  const hashTableSize = bytes.readUInt32LE(headerOffset + 24);
  const blockTableSize = bytes.readUInt32LE(headerOffset + 28);
  let hashPosHigh = 0, blockPosHigh = 0, hiBlockTablePos = 0n;
  if (formatVersion >= 1 && headerSize >= 44) {
    hiBlockTablePos = bytes.readBigUInt64LE(headerOffset + 32);
    hashPosHigh = bytes.readUInt16LE(headerOffset + 40);
    blockPosHigh = bytes.readUInt16LE(headerOffset + 42);
  }
  const hashRel = Number((BigInt(hashPosHigh) << 32n) | BigInt(hashPosLow));
  const blockRel = Number((BigInt(blockPosHigh) << 32n) | BigInt(blockPosLow));
  if (!hashTableSize || hashTableSize > 0x100000 || !blockTableSize || blockTableSize > 0x100000) throw new Error('MPQ table sizes are not plausible.');
  const hashEnc = safeRange(bytes, headerOffset + hashRel, hashTableSize * 16, 'hash table');
  const blockEnc = safeRange(bytes, headerOffset + blockRel, blockTableSize * 16, 'block table');
  const hashEntries = parseTableEntries(decryptBlock(hashEnc, hashString(HASH_TABLE_KEY_NAME, HASH_FILE_KEY)), hashTableSize, 'hash');
  const blockEntries = parseTableEntries(decryptBlock(blockEnc, hashString(BLOCK_TABLE_KEY_NAME, HASH_FILE_KEY)), blockTableSize, 'block');
  let highBlockWords = null;
  if (formatVersion >= 1 && hiBlockTablePos > 0n) {
    const rel = Number(hiBlockTablePos);
    const hb = safeRange(bytes, headerOffset + rel, blockTableSize * 2, 'high block table');
    highBlockWords = new Uint16Array(blockTableSize);
    for (let i = 0; i < blockTableSize; i++) highBlockWords[i] = hb.readUInt16LE(i * 2);
  }
  return { bytes, headerOffset, headerSize, formatVersion, blockSizeShift, hashTableSize, blockTableSize, hashEntries, blockEntries, highBlockWords };
}

function findHashSlot(mpq, name) {
  const start = hashString(name, HASH_TABLE_OFFSET) % mpq.hashEntries.length;
  const a = hashString(name, HASH_NAME_A), b = hashString(name, HASH_NAME_B);
  for (let n = 0; n < mpq.hashEntries.length; n++) {
    const index = (start + n) % mpq.hashEntries.length;
    const entry = mpq.hashEntries[index];
    if (entry.blockIndex === HASH_ENTRY_EMPTY) return { found: false, index, start };
    if (entry.blockIndex !== HASH_ENTRY_DELETED && entry.hashA === a && entry.hashB === b) return { found: true, index, start, entry };
  }
  return { found: false, index: -1, start };
}

function hasFile(mpq, name) { return !!findHashSlot(mpq, name).found; }

function blockAbsolutePos(mpq, blockIndex) {
  const block = mpq.blockEntries[blockIndex];
  if (!block) throw new Error(`MPQ block ${blockIndex} does not exist.`);
  const high = mpq.highBlockWords ? BigInt(mpq.highBlockWords[blockIndex] || 0) : 0n;
  const rel = (high << 32n) | BigInt(block.filePos >>> 0);
  const abs = BigInt(mpq.headerOffset) + rel;
  if (abs > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MPQ file offset is too large.');
  return Number(abs);
}

function fileKey(name, block) {
  const base = String(name || '').replace(/\//g, '\\').split('\\').pop() || String(name || '');
  let key = hashString(base, HASH_FILE_KEY);
  if ((block.flags & MPQ_FILE_FIX_KEY) !== 0) key = ((key + (block.filePos >>> 0)) ^ (block.fileSize >>> 0)) >>> 0;
  return key >>> 0;
}

function decompressSector(data, expectedSize, flags) {
  const input = Buffer.from(data);
  if (input.length === expectedSize || (flags & (MPQ_FILE_COMPRESS | MPQ_FILE_IMPLODE)) === 0) return input;
  if ((flags & MPQ_FILE_IMPLODE) !== 0 && (flags & MPQ_FILE_COMPRESS) === 0) throw new Error('PKWARE-implode compressed MPQ files are not supported by the built-in runtime tester.');
  if (!input.length) return input;
  const mask = input[0];
  if (mask === 0) return input.subarray(1);
  if ((mask & ~0x02) !== 0) throw new Error(`MPQ compression mask 0x${mask.toString(16)} is not supported by the built-in runtime tester.`);
  const out = zlib.inflateSync(input.subarray(1));
  if (out.length > expectedSize) return out.subarray(0, expectedSize);
  return out;
}

function readFile(mpq, name) {
  const slot = findHashSlot(mpq, name);
  if (!slot.found) return null;
  const blockIndex = slot.entry.blockIndex >>> 0;
  const block = mpq.blockEntries[blockIndex];
  if (!block || (block.flags & MPQ_FILE_EXISTS) === 0) return null;
  const abs = blockAbsolutePos(mpq, blockIndex);
  let raw = Buffer.from(safeRange(mpq.bytes, abs, block.compressedSize, name));
  let key = 0;
  if ((block.flags & MPQ_FILE_ENCRYPTED) !== 0) key = fileKey(name, block);
  if ((block.flags & MPQ_FILE_SINGLE_UNIT) !== 0) {
    if (key) raw = decryptBlock(raw, key);
    return Buffer.from(decompressSector(raw, block.fileSize, block.flags).subarray(0, block.fileSize));
  }
  const sectorSize = 512 << mpq.blockSizeShift;
  const sectorCount = Math.ceil(block.fileSize / sectorSize);
  const offsetCount = sectorCount + 1 + ((block.flags & MPQ_FILE_SECTOR_CRC) !== 0 ? 1 : 0);
  const offsetBytes = offsetCount * 4;
  if (raw.length < offsetBytes) throw new Error(`MPQ sector table for ${name} is truncated.`);
  let tableBytes = raw.subarray(0, offsetBytes);
  if (key) tableBytes = decryptBlock(tableBytes, (key - 1) >>> 0);
  const offsets = [];
  for (let i = 0; i < sectorCount + 1; i++) offsets.push(tableBytes.readUInt32LE(i * 4));
  const chunks = [];
  for (let i = 0; i < sectorCount; i++) {
    const a = offsets[i], b = offsets[i + 1];
    if (a > b || b > raw.length) throw new Error(`MPQ sector ${i} for ${name} is invalid.`);
    let sector = Buffer.from(raw.subarray(a, b));
    if (key) sector = decryptBlock(sector, (key + i) >>> 0);
    const expected = Math.min(sectorSize, block.fileSize - i * sectorSize);
    chunks.push(decompressSector(sector, expected, block.flags).subarray(0, expected));
  }
  return Buffer.concat(chunks).subarray(0, block.fileSize);
}

function align4(value) { return (value + 3) & ~3; }

function appendRawFile(chunks, cursor, baseOffset, data) {
  const aligned = align4(cursor);
  if (aligned > cursor) chunks.push(Buffer.alloc(aligned - cursor));
  const body = Buffer.from(data);
  chunks.push(body);
  return { next: aligned + body.length, relPos: aligned - baseOffset, size: body.length };
}

function insertHashEntry(hashEntries, name, blockIndex) {
  const start = hashString(name, HASH_TABLE_OFFSET) % hashEntries.length;
  const a = hashString(name, HASH_NAME_A), b = hashString(name, HASH_NAME_B);
  let deleted = -1;
  for (let n = 0; n < hashEntries.length; n++) {
    const i = (start + n) % hashEntries.length;
    const e = hashEntries[i];
    if (e.blockIndex === HASH_ENTRY_DELETED && deleted < 0) deleted = i;
    if (e.blockIndex === HASH_ENTRY_EMPTY) {
      const target = deleted >= 0 ? deleted : i;
      hashEntries[target] = { hashA: a, hashB: b, locale: 0, platform: 0, blockIndex: blockIndex >>> 0 };
      return target;
    }
  }
  if (deleted >= 0) {
    hashEntries[deleted] = { hashA: a, hashB: b, locale: 0, platform: 0, blockIndex: blockIndex >>> 0 };
    return deleted;
  }
  throw new Error('This MPQ hash table has no free slot for runtime-test assets. Use an unpacked copy of this map or a map with free MPQ hash entries.');
}

function patchArchive(input, replacements) {
  const mpq = open(input);
  const original = Buffer.from(mpq.bytes);
  const hashEntries = mpq.hashEntries.map(e => ({ ...e }));
  const blockEntries = mpq.blockEntries.map(e => ({ ...e }));
  const highWords = mpq.highBlockWords ? Array.from(mpq.highBlockWords) : null;
  const chunks = [original];
  let cursor = original.length;
  const writes = [];
  for (const [rawName, rawData] of Object.entries(replacements || {})) {
    const name = String(rawName).replace(/\//g, '\\');
    const data = Buffer.from(rawData);
    const slot = findHashSlot({ ...mpq, hashEntries }, name);
    const appended = appendRawFile(chunks, cursor, mpq.headerOffset, data);
    cursor = appended.next;
    const nextBlock = { filePos: appended.relPos >>> 0, compressedSize: data.length >>> 0, fileSize: data.length >>> 0, flags: (MPQ_FILE_EXISTS | MPQ_FILE_SINGLE_UNIT) >>> 0 };
    let blockIndex;
    if (slot.found) {
      blockIndex = slot.entry.blockIndex >>> 0;
      blockEntries[blockIndex] = nextBlock;
      if (highWords) highWords[blockIndex] = 0;
    } else {
      blockIndex = blockEntries.length;
      blockEntries.push(nextBlock);
      if (highWords) highWords.push(0);
      insertHashEntry(hashEntries, name, blockIndex);
    }
    writes.push({ name, blockIndex, bytes: data.length, replaced: !!slot.found });
  }
  let aligned = align4(cursor);
  if (aligned > cursor) chunks.push(Buffer.alloc(aligned - cursor));
  cursor = aligned;
  const hashRel = cursor - mpq.headerOffset;
  const hashEncrypted = encryptBlock(serializeHashTable(hashEntries), hashString(HASH_TABLE_KEY_NAME, HASH_FILE_KEY));
  chunks.push(hashEncrypted); cursor += hashEncrypted.length;
  aligned = align4(cursor); if (aligned > cursor) chunks.push(Buffer.alloc(aligned - cursor)); cursor = aligned;
  const blockRel = cursor - mpq.headerOffset;
  const blockEncrypted = encryptBlock(serializeBlockTable(blockEntries), hashString(BLOCK_TABLE_KEY_NAME, HASH_FILE_KEY));
  chunks.push(blockEncrypted); cursor += blockEncrypted.length;
  let hiBlockRel = 0;
  if (highWords) {
    aligned = align4(cursor); if (aligned > cursor) chunks.push(Buffer.alloc(aligned - cursor)); cursor = aligned;
    hiBlockRel = cursor - mpq.headerOffset;
    const hb = Buffer.alloc(highWords.length * 2);
    highWords.forEach((v, i) => hb.writeUInt16LE(v & 0xffff, i * 2));
    chunks.push(hb); cursor += hb.length;
  }
  const out = Buffer.concat(chunks);
  if (hashRel > 0xffffffff || blockRel > 0xffffffff || out.length - mpq.headerOffset > 0xffffffff) throw new Error('Runtime-test MPQ exceeds the supported 32-bit archive size.');
  out.writeUInt32LE((out.length - mpq.headerOffset) >>> 0, mpq.headerOffset + 8);
  out.writeUInt32LE(hashRel >>> 0, mpq.headerOffset + 16);
  out.writeUInt32LE(blockRel >>> 0, mpq.headerOffset + 20);
  out.writeUInt32LE(hashEntries.length >>> 0, mpq.headerOffset + 24);
  out.writeUInt32LE(blockEntries.length >>> 0, mpq.headerOffset + 28);
  if (mpq.formatVersion >= 1 && mpq.headerSize >= 44) {
    out.writeBigUInt64LE(BigInt(hiBlockRel || 0), mpq.headerOffset + 32);
    out.writeUInt16LE(0, mpq.headerOffset + 40);
    out.writeUInt16LE(0, mpq.headerOffset + 42);
  }
  return { bytes: out, writes, headerOffset: mpq.headerOffset, formatVersion: mpq.formatVersion, hashTableSize: hashEntries.length, blockTableSize: blockEntries.length };
}


function encodeZlibSector(raw) {
  const source = Buffer.from(raw);
  const zipped = zlib.deflateSync(source);
  const tagged = Buffer.concat([Buffer.from([0x02]), zipped]);
  return tagged.length < source.length ? tagged : source;
}

function encodeArchiveFile(data, compression, blockSizeShift) {
  const source = Buffer.from(data);
  if (compression === 'zlib-single') {
    const body = encodeZlibSector(source);
    return { body, flags: (MPQ_FILE_EXISTS | MPQ_FILE_SINGLE_UNIT | MPQ_FILE_COMPRESS) >>> 0 };
  }
  if (compression === 'zlib-sectors') {
    const sectorSize = 512 << blockSizeShift;
    const count = Math.ceil(source.length / sectorSize);
    const sectors = [];
    const table = Buffer.alloc((count + 1) * 4);
    let offset = table.length;
    table.writeUInt32LE(offset, 0);
    for (let i = 0; i < count; i++) {
      const part = source.subarray(i * sectorSize, Math.min(source.length, (i + 1) * sectorSize));
      const encoded = encodeZlibSector(part);
      sectors.push(encoded); offset += encoded.length; table.writeUInt32LE(offset, (i + 1) * 4);
    }
    return { body: Buffer.concat([table, ...sectors]), flags: (MPQ_FILE_EXISTS | MPQ_FILE_COMPRESS) >>> 0 };
  }
  return { body: source, flags: (MPQ_FILE_EXISTS | MPQ_FILE_SINGLE_UNIT) >>> 0 };
}

function nextPow2(v) { let n = 1; while (n < v) n <<= 1; return n; }
function buildArchive(files, { hashTableSize = 0, compression = 'none', blockSizeShift = 3 } = {}) {
  const entries = Object.entries(files || {}).map(([name, data]) => [String(name).replace(/\//g, '\\'), Buffer.from(data)]);
  const hashCount = Math.max(8, hashTableSize || nextPow2(Math.max(4, entries.length * 2)));
  const header = Buffer.alloc(32);
  MPQ_MAGIC.copy(header, 0);
  header.writeUInt32LE(32, 4);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(blockSizeShift, 14);
  const hashEntries = Array.from({ length: hashCount }, () => ({ hashA: 0xffffffff, hashB: 0xffffffff, locale: 0xffff, platform: 0xffff, blockIndex: HASH_ENTRY_EMPTY }));
  const blockEntries = [];
  const chunks = [header];
  let cursor = header.length;
  for (const [name, data] of entries) {
    const aligned = align4(cursor); if (aligned > cursor) chunks.push(Buffer.alloc(aligned - cursor)); cursor = aligned;
    const index = blockEntries.length, encoded = encodeArchiveFile(data, compression, blockSizeShift);
    blockEntries.push({ filePos: cursor >>> 0, compressedSize: encoded.body.length >>> 0, fileSize: data.length >>> 0, flags: encoded.flags });
    insertHashEntry(hashEntries, name, index);
    chunks.push(encoded.body); cursor += encoded.body.length;
  }
  let aligned = align4(cursor); if (aligned > cursor) chunks.push(Buffer.alloc(aligned - cursor)); cursor = aligned;
  const hashPos = cursor;
  const hashEnc = encryptBlock(serializeHashTable(hashEntries), hashString(HASH_TABLE_KEY_NAME, HASH_FILE_KEY)); chunks.push(hashEnc); cursor += hashEnc.length;
  aligned = align4(cursor); if (aligned > cursor) chunks.push(Buffer.alloc(aligned - cursor)); cursor = aligned;
  const blockPos = cursor;
  const blockEnc = encryptBlock(serializeBlockTable(blockEntries), hashString(BLOCK_TABLE_KEY_NAME, HASH_FILE_KEY)); chunks.push(blockEnc); cursor += blockEnc.length;
  const out = Buffer.concat(chunks);
  out.writeUInt32LE(out.length >>> 0, 8);
  out.writeUInt32LE(hashPos >>> 0, 16);
  out.writeUInt32LE(blockPos >>> 0, 20);
  out.writeUInt32LE(hashEntries.length >>> 0, 24);
  out.writeUInt32LE(blockEntries.length >>> 0, 28);
  return out;
}

module.exports = Object.freeze({
  MPQ_MAGIC,
  MPQ_FILE_EXISTS,
  MPQ_FILE_SINGLE_UNIT,
  hashString,
  open,
  hasFile,
  readFile,
  patchArchive,
  buildArchive
});
