(function () {
  'use strict';

  const BLP = {};

  function readMagic(view) {
    return String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  }

  function mipDimension(base, level) {
    let v = base;
    for (let i = 0; i < level; i++) v = Math.max(1, Math.floor(v / 2));
    return v;
  }

  function decodePackedAlpha(bytes, pixelCount, alphaBits) {
    const alpha = new Uint8ClampedArray(pixelCount);
    if (alphaBits === 0) {
      alpha.fill(255);
      return alpha;
    }
    if (alphaBits === 8) {
      alpha.set(bytes.subarray(0, pixelCount));
      return alpha;
    }
    if (alphaBits === 4) {
      for (let i = 0; i < pixelCount; i++) {
        const b = bytes[i >> 1] || 0;
        const nibble = (i & 1) ? (b >> 4) : (b & 0x0F);
        alpha[i] = nibble * 17;
      }
      return alpha;
    }
    if (alphaBits === 1) {
      for (let i = 0; i < pixelCount; i++) {
        alpha[i] = ((bytes[i >> 3] >> (i & 7)) & 1) ? 255 : 0;
      }
      return alpha;
    }
    alpha.fill(255);
    return alpha;
  }

  async function decodeJpegBLP(buffer, meta) {
    const view = new DataView(buffer);
    const jpegHeaderSize = view.getUint32(156, true);
    if (jpegHeaderSize > buffer.byteLength - 160) throw new Error('Invalid BLP JPEG: header is outside the file.');
    const sharedHeader = new Uint8Array(buffer, 160, jpegHeaderSize);
    const mipOffset = meta.offsets[0];
    const mipSize = meta.sizes[0];
    if (!mipOffset || !mipSize || mipOffset + mipSize > buffer.byteLength) throw new Error('Invalid BLP JPEG: primary mipmap is missing.');
    const mip = new Uint8Array(buffer, mipOffset, mipSize);
    const jpeg = new Uint8Array(sharedHeader.length + mip.length);
    jpeg.set(sharedHeader, 0);
    jpeg.set(mip, sharedHeader.length);

    // BLP1 JPEG is not always a conventional RGB/CMYK JPEG. Warcraft III can
    // store the diffuse channels as raw B,G,R and a fourth raw alpha component.
    // Generic browser JPEG decoders color-convert those four components and lose
    // the authored alpha, so never use createImageBitmap() for this path.
    if (!window.WC3BLPJpeg || typeof window.WC3BLPJpeg.decode !== 'function') {
      throw new Error('BLP JPEG decoder is unavailable.');
    }

    let decoded;
    try {
      decoded = window.WC3BLPJpeg.decode(jpeg);
    } catch (e) {
      throw new Error('This BLP uses internal JPEG data that could not be decoded: ' + (e && e.message ? e.message : e));
    }

    if (!decoded || !decoded.width || !decoded.height || !decoded.data) {
      throw new Error('BLP JPEG decoder returned invalid image data.');
    }

    let imageData = new ImageData(new Uint8ClampedArray(decoded.data), decoded.width, decoded.height);
    if (decoded.width !== meta.width || decoded.height !== meta.height) {
      const src = document.createElement('canvas');
      src.width = decoded.width;
      src.height = decoded.height;
      src.getContext('2d').putImageData(imageData, 0, 0);
      const dst = document.createElement('canvas');
      dst.width = meta.width;
      dst.height = meta.height;
      const ctx = dst.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(src, 0, 0, meta.width, meta.height);
      imageData = ctx.getImageData(0, 0, meta.width, meta.height);
    }

    const componentLabel = decoded.components === 4 ? 'BGRA' : (decoded.components === 3 ? 'BGR' : decoded.components + ' components');
    return {
      width: meta.width,
      height: meta.height,
      imageData,
      meta: Object.assign(meta, { encoding: 'JPEG / Warcraft raw ' + componentLabel })
    };
  }

  BLP.decode = async function (buffer) {
    if (!(buffer instanceof ArrayBuffer)) throw new Error('Invalid BLP file.');
    if (buffer.byteLength < 156) throw new Error('File is too small to be a valid BLP1.');
    const view = new DataView(buffer);
    const magic = readMagic(view);
    if (magic !== 'BLP1') {
      if (magic === 'BLP2') throw new Error('BLP2 is not supported in this version yet. Convert it to BLP1 or PNG first.');
      throw new Error('Unknown format: expected BLP1.');
    }

    const content = view.getUint32(4, true);
    const alphaBits = view.getUint32(8, true);
    const width = view.getUint32(12, true);
    const height = view.getUint32(16, true);
    const extra = view.getUint32(20, true);
    const hasMipmaps = view.getUint32(24, true) !== 0;
    if (!width || !height || width > 65535 || height > 65535) throw new Error('Invalid BLP dimensions.');

    const offsets = [];
    const sizes = [];
    for (let i = 0; i < 16; i++) offsets.push(view.getUint32(28 + i * 4, true));
    for (let i = 0; i < 16; i++) sizes.push(view.getUint32(92 + i * 4, true));
    const meta = { magic, content, alphaBits, width, height, extra, hasMipmaps, offsets, sizes };

    if (content === 0) return decodeJpegBLP(buffer, meta);
    if (content !== 1) throw new Error('Unsupported BLP1 content type.');

    const paletteOffset = 156;
    if (paletteOffset + 1024 > buffer.byteLength) throw new Error('BLP is missing a complete palette.');
    const palette = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const p = paletteOffset + i * 4;
      palette[i * 4] = view.getUint8(p + 2);
      palette[i * 4 + 1] = view.getUint8(p + 1);
      palette[i * 4 + 2] = view.getUint8(p);
      palette[i * 4 + 3] = 255;
    }

    const mipOffset = offsets[0];
    const mipSize = sizes[0];
    const pixelCount = width * height;
    if (!mipOffset || mipOffset + mipSize > buffer.byteLength || mipSize < pixelCount) throw new Error('Primary BLP mipmap is invalid or truncated.');
    const indexes = new Uint8Array(buffer, mipOffset, pixelCount);
    const alphaStart = mipOffset + pixelCount;
    const alphaLength = Math.max(0, mipSize - pixelCount);
    const alphaBytes = alphaLength ? new Uint8Array(buffer, alphaStart, alphaLength) : new Uint8Array(0);
    const alpha = decodePackedAlpha(alphaBytes, pixelCount, alphaBits);
    const rgba = new Uint8ClampedArray(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
      const pi = indexes[i] * 4;
      const di = i * 4;
      rgba[di] = palette[pi];
      rgba[di + 1] = palette[pi + 1];
      rgba[di + 2] = palette[pi + 2];
      rgba[di + 3] = alpha[i];
    }

    return { width, height, imageData: new ImageData(rgba, width, height), meta: Object.assign(meta, { encoding: 'Direct / Paletted' }) };
  };

  function makeMipmaps(imageData, includeMipmaps) {
    const levels = [imageData];
    if (!includeMipmaps) return levels;
    let current = imageData;
    while ((current.width > 1 || current.height > 1) && levels.length < 16) {
      const src = document.createElement('canvas');
      src.width = current.width;
      src.height = current.height;
      src.getContext('2d').putImageData(current, 0, 0);
      const w = Math.max(1, Math.floor(current.width / 2));
      const h = Math.max(1, Math.floor(current.height / 2));
      const dst = document.createElement('canvas');
      dst.width = w;
      dst.height = h;
      const ctx = dst.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, w, h);
      current = ctx.getImageData(0, 0, w, h);
      levels.push(current);
    }
    return levels;
  }

  function bucketBounds(colors) {
    let r0 = 255, g0 = 255, b0 = 255, r1 = 0, g1 = 0, b1 = 0;
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      const r = (c >>> 16) & 255, g = (c >>> 8) & 255, b = c & 255;
      if (r < r0) r0 = r; if (r > r1) r1 = r;
      if (g < g0) g0 = g; if (g > g1) g1 = g;
      if (b < b0) b0 = b; if (b > b1) b1 = b;
    }
    return { r0, r1, g0, g1, b0, b1 };
  }

  function quantizePalette(imageData) {
    const d = imageData.data;
    const pixels = imageData.width * imageData.height;
    const targetSamples = Math.min(20000, pixels);
    const step = Math.max(1, Math.floor(pixels / targetSamples));
    const sample = [];
    for (let i = 0; i < pixels; i += step) {
      const p = i * 4;
      if (d[p + 3] < 8) continue;
      sample.push((d[p] << 16) | (d[p + 1] << 8) | d[p + 2]);
    }
    if (!sample.length) sample.push(0);

    let buckets = [{ colors: sample, bounds: bucketBounds(sample) }];
    while (buckets.length < 256) {
      let pick = -1, score = -1;
      for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        if (b.colors.length < 2) continue;
        const bd = b.bounds;
        const range = Math.max(bd.r1 - bd.r0, bd.g1 - bd.g0, bd.b1 - bd.b0);
        const s = range * Math.sqrt(b.colors.length);
        if (s > score) { score = s; pick = i; }
      }
      if (pick < 0) break;
      const bucket = buckets.splice(pick, 1)[0];
      const bd = bucket.bounds;
      const rr = bd.r1 - bd.r0, gr = bd.g1 - bd.g0, br = bd.b1 - bd.b0;
      let shift = 16;
      if (gr >= rr && gr >= br) shift = 8;
      else if (br >= rr && br >= gr) shift = 0;
      bucket.colors.sort((a, b) => ((a >>> shift) & 255) - ((b >>> shift) & 255));
      const mid = Math.floor(bucket.colors.length / 2);
      const left = bucket.colors.slice(0, mid);
      const right = bucket.colors.slice(mid);
      buckets.push({ colors: left, bounds: bucketBounds(left) });
      buckets.push({ colors: right, bounds: bucketBounds(right) });
    }

    const palette = new Uint8Array(256 * 3);
    for (let i = 0; i < Math.min(256, buckets.length); i++) {
      const colors = buckets[i].colors;
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < colors.length; j++) {
        const c = colors[j];
        r += (c >>> 16) & 255;
        g += (c >>> 8) & 255;
        b += c & 255;
      }
      const n = Math.max(1, colors.length);
      palette[i * 3] = Math.round(r / n);
      palette[i * 3 + 1] = Math.round(g / n);
      palette[i * 3 + 2] = Math.round(b / n);
    }
    return palette;
  }

  const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function packAlpha(alpha, bits) {
    if (bits === 0) return new Uint8Array(0);
    if (bits === 8) return alpha;
    if (bits === 4) {
      const out = new Uint8Array(Math.ceil(alpha.length / 2));
      for (let i = 0; i < alpha.length; i++) {
        const n = Math.round(alpha[i] / 17) & 15;
        if (i & 1) out[i >> 1] |= n << 4; else out[i >> 1] |= n;
      }
      return out;
    }
    if (bits === 1) {
      const out = new Uint8Array(Math.ceil(alpha.length / 8));
      for (let i = 0; i < alpha.length; i++) if (alpha[i] >= 128) out[i >> 3] |= 1 << (i & 7);
      return out;
    }
    throw new Error('Invalid BLP alpha. Use 0, 1, 4 or 8 bits.');
  }

  function mapToPalette(imageData, palette, dither, alphaBits) {
    const d = imageData.data;
    const count = imageData.width * imageData.height;
    const indexes = new Uint8Array(count);
    const alpha = new Uint8Array(count);
    const cache = new Int16Array(32768);
    cache.fill(-1);
    for (let i = 0; i < count; i++) {
      const p = i * 4;
      let r = d[p], g = d[p + 1], b = d[p + 2];
      if (dither) {
        const x = i % imageData.width, y = Math.floor(i / imageData.width);
        const delta = (bayer4[(x & 3) + ((y & 3) << 2)] - 7.5) * 1.4;
        r = Math.max(0, Math.min(255, r + delta));
        g = Math.max(0, Math.min(255, g + delta));
        b = Math.max(0, Math.min(255, b + delta));
      }
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let best = cache[key];
      if (best < 0) {
        let bestDist = Infinity;
        best = 0;
        for (let k = 0; k < 256; k++) {
          const q = k * 3;
          const dr = r - palette[q], dg = g - palette[q + 1], db = b - palette[q + 2];
          const dist = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
          if (dist < bestDist) { bestDist = dist; best = k; }
        }
        cache[key] = best;
      }
      indexes[i] = best;
      alpha[i] = d[p + 3];
    }
    const packed = packAlpha(alpha, alphaBits);
    const chunk = new Uint8Array(indexes.length + packed.length);
    chunk.set(indexes, 0); chunk.set(packed, indexes.length);
    return chunk;
  }

  BLP.encodePaletted = function (imageData, options) {
    options = options || {};
    const withMipmaps = options.mipmaps !== false;
    const dither = options.dither === true;
    const alphaBits = [0, 1, 4, 8].includes(+options.alphaBits) ? +options.alphaBits : 8;
    if (!imageData || !imageData.width || !imageData.height) throw new Error('Empty image.');
    if (imageData.width > 65535 || imageData.height > 65535) throw new Error('BLP1 supports a maximum of 65535 px per dimension.');

    const levels = makeMipmaps(imageData, withMipmaps);
    const palette = quantizePalette(levels[0]);
    const chunks = levels.map(level => mapToPalette(level, palette, dither, alphaBits));
    const headerSize = 28 + 64 + 64 + 1024;
    let totalSize = headerSize;
    for (const chunk of chunks) totalSize += chunk.length;
    const out = new ArrayBuffer(totalSize);
    const view = new DataView(out);
    const bytes = new Uint8Array(out);

    bytes.set([66, 76, 80, 49], 0); // BLP1
    view.setUint32(4, 1, true); // direct/indexed
    view.setUint32(8, alphaBits, true);
    view.setUint32(12, imageData.width, true);
    view.setUint32(16, imageData.height, true);
    view.setUint32(20, 5, true);
    view.setUint32(24, withMipmaps ? 1 : 0, true);

    let cursor = headerSize;
    for (let i = 0; i < 16; i++) {
      const chunk = chunks[i];
      view.setUint32(28 + i * 4, chunk ? cursor : 0, true);
      view.setUint32(92 + i * 4, chunk ? chunk.length : 0, true);
      if (chunk) cursor += chunk.length;
    }

    const paletteStart = 156;
    for (let i = 0; i < 256; i++) {
      const s = i * 3, p = paletteStart + i * 4;
      view.setUint8(p, palette[s + 2]);
      view.setUint8(p + 1, palette[s + 1]);
      view.setUint8(p + 2, palette[s]);
      view.setUint8(p + 3, 0);
    }

    cursor = headerSize;
    for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
    return new Blob([out], { type: 'application/octet-stream' });
  };

  BLP.hasMeaningfulAlpha = function (imageData) {
    const d = imageData.data; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true; return false;
  };

  BLP.inspect = function (buffer) {
    const view = new DataView(buffer);
    if (buffer.byteLength < 28) return null;
    const magic = readMagic(view);
    if (magic !== 'BLP1') return { magic };
    return {
      magic,
      content: view.getUint32(4, true),
      alphaBits: view.getUint32(8, true),
      width: view.getUint32(12, true),
      height: view.getUint32(16, true),
      hasMipmaps: !!view.getUint32(24, true)
    };
  };

  window.BLP = BLP;
})();
