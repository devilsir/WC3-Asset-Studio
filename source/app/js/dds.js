(function () {
  'use strict';

  const DDS = {};
  const MAGIC = 0x20534444; // "DDS "
  const DDPF_FOURCC = 0x4;

  function fourCC(str) {
    return str.charCodeAt(0) | (str.charCodeAt(1) << 8) | (str.charCodeAt(2) << 16) | (str.charCodeAt(3) << 24);
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function rgbTo565(r, g, b) { return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3); }
  function rgbFrom565(c) {
    const r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
    return [Math.round(r * 255 / 31), Math.round(g * 255 / 63), Math.round(b * 255 / 31)];
  }

  function colorDistance(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
  }

  function gatherBlock(data, width, height, bx, by) {
    const out = new Array(16);
    for (let py = 0; py < 4; py++) {
      for (let px = 0; px < 4; px++) {
        const x = clamp(bx * 4 + px, 0, width - 1);
        const y = clamp(by * 4 + py, 0, height - 1);
        const p = (y * width + x) * 4;
        out[py * 4 + px] = [data[p], data[p + 1], data[p + 2], data[p + 3]];
      }
    }
    return out;
  }

  function chooseColorEndpoints(pixels) {
    let minL = Infinity, maxL = -Infinity;
    let min = pixels[0], max = pixels[0];
    // Perceptual luminance gives surprisingly stable endpoints for icons/textures.
    for (const p of pixels) {
      const l = p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722;
      if (l < minL) { minL = l; min = p; }
      if (l > maxL) { maxL = l; max = p; }
    }
    let c0 = rgbTo565(max[0], max[1], max[2]);
    let c1 = rgbTo565(min[0], min[1], min[2]);
    if (c0 === c1) {
      if (c0 < 0xffff) c0++;
      else if (c1 > 0) c1--;
    }
    // For opaque BC1 force 4-color mode.
    if (c0 < c1) { const t = c0; c0 = c1; c1 = t; }
    return [c0, c1];
  }

  function bc1Palette(c0, c1) {
    const a = rgbFrom565(c0), b = rgbFrom565(c1);
    return [
      a,
      b,
      [Math.round((2 * a[0] + b[0]) / 3), Math.round((2 * a[1] + b[1]) / 3), Math.round((2 * a[2] + b[2]) / 3)],
      [Math.round((a[0] + 2 * b[0]) / 3), Math.round((a[1] + 2 * b[1]) / 3), Math.round((a[2] + 2 * b[2]) / 3)]
    ];
  }

  function encodeBC1Block(pixels, view, offset, alphaMode=false) {
    const fitPixels = alphaMode ? pixels.filter(p => p[3] >= 128) : pixels;
    let [c0, c1] = chooseColorEndpoints(fitPixels.length ? fitPixels : [[0,0,0,255]]);
    if(alphaMode){
      // DXT1/BC1 transparent mode is selected when c0 <= c1. Index 3 is then
      // transparent and the remaining three entries retain RGB information.
      if(c0 > c1){ const t=c0; c0=c1; c1=t; }
      if(c0 === c1){ if(c1 < 0xffff) c1++; else if(c0 > 0) c0--; }
    }
    view.setUint16(offset, c0, true);
    view.setUint16(offset + 2, c1, true);
    const a = rgbFrom565(c0), b = rgbFrom565(c1);
    const pal = alphaMode
      ? [a,b,[Math.round((a[0]+b[0])/2),Math.round((a[1]+b[1])/2),Math.round((a[2]+b[2])/2)],[0,0,0]]
      : bc1Palette(c0, c1);
    let bits = 0;
    for (let i = 0; i < 16; i++) {
      let best = 0;
      if(alphaMode && pixels[i][3] < 128) best = 3;
      else {
        let dist = Infinity;
        const count = alphaMode ? 3 : 4;
        for (let k = 0; k < count; k++) {
          const d = colorDistance(pixels[i], pal[k]);
          if (d < dist) { dist = d; best = k; }
        }
      }
      bits |= (best & 3) << (i * 2);
    }
    view.setUint32(offset + 4, bits >>> 0, true);
  }

  function makeAlphaPalette(a0, a1) {
    const p = new Array(8); p[0] = a0; p[1] = a1;
    if (a0 > a1) {
      for (let i = 1; i <= 6; i++) p[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
    } else {
      for (let i = 1; i <= 4; i++) p[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
      p[6] = 0; p[7] = 255;
    }
    return p;
  }

  function encodeBC4Block(values, bytes, offset) {
    let vmin = 255, vmax = 0;
    for (const v of values) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
    let v0 = vmax, v1 = vmin;
    if (v0 === v1) { v0 = v1 = values[0] || 0; }
    bytes[offset] = v0; bytes[offset + 1] = v1;
    const vp = makeAlphaPalette(v0, v1);
    let bits = 0n;
    for (let i = 0; i < 16; i++) {
      let best = 0, dist = Infinity;
      for (let k = 0; k < 8; k++) {
        const d = Math.abs(values[i] - vp[k]);
        if (d < dist) { dist = d; best = k; }
      }
      bits |= BigInt(best & 7) << BigInt(i * 3);
    }
    for (let i = 0; i < 6; i++) bytes[offset + 2 + i] = Number((bits >> BigInt(i * 8)) & 255n);
  }

  function encodeBC2Block(pixels, bytes, view, offset) {
    // DXT3 / BC2: explicit 4-bit alpha followed by an opaque BC1 color block.
    for (let i = 0; i < 8; i++) bytes[offset + i] = 0;
    for (let i = 0; i < 16; i++) {
      const a = Math.round(pixels[i][3] / 17) & 15;
      if (i & 1) bytes[offset + (i >> 1)] |= a << 4; else bytes[offset + (i >> 1)] |= a;
    }
    encodeBC1Block(pixels, view, offset + 8, false);
  }

  function encodeBC3Block(pixels, bytes, view, offset) {
    encodeBC4Block(pixels.map(p => p[3]), bytes, offset);
    encodeBC1Block(pixels, view, offset + 8, false);
  }

  function encodeBC5Block(pixels, bytes, offset) {
    // ATI2 / BC5 stores two independent BC4 channels, normally normal-map X/Y.
    encodeBC4Block(pixels.map(p => p[0]), bytes, offset);
    encodeBC4Block(pixels.map(p => p[1]), bytes, offset + 8);
  }

  function encodeLevel(imageData, format) {
    const blockBytes = (format === 'BC2' || format === 'BC3' || format === 'BC5') ? 16 : 8;
    const bw = Math.max(1, Math.ceil(imageData.width / 4));
    const bh = Math.max(1, Math.ceil(imageData.height / 4));
    const out = new ArrayBuffer(bw * bh * blockBytes);
    const view = new DataView(out), bytes = new Uint8Array(out);
    let off = 0;
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const px = gatherBlock(imageData.data, imageData.width, imageData.height, bx, by);
        if (format === 'BC2') encodeBC2Block(px, bytes, view, off);
        else if (format === 'BC3') encodeBC3Block(px, bytes, view, off);
        else if (format === 'BC5') encodeBC5Block(px, bytes, off);
        else encodeBC1Block(px, view, off, format === 'BC1A');
        off += blockBytes;
      }
    }
    return new Uint8Array(out);
  }

  function resizeImageData(imageData, w, h) {
    const src = document.createElement('canvas');
    src.width = imageData.width; src.height = imageData.height;
    src.getContext('2d').putImageData(imageData, 0, 0);
    const dst = document.createElement('canvas'); dst.width = w; dst.height = h;
    const ctx = dst.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  function makeMipmaps(imageData, enabled) {
    const levels = [imageData];
    if (!enabled) return levels;
    let current = imageData;
    while ((current.width > 1 || current.height > 1) && levels.length < 16) {
      const w = Math.max(1, Math.floor(current.width / 2));
      const h = Math.max(1, Math.floor(current.height / 2));
      current = resizeImageData(current, w, h);
      levels.push(current);
    }
    return levels;
  }

  DDS.encode = function (imageData, options) {
    options = options || {};
    const requested=String(options.format||'BC1').toUpperCase();
    const format=['BC1','BC1A','BC2','BC3','BC5'].includes(requested)?requested:'BC1';
    const mipmaps = options.mipmaps !== false;
    const levels = makeMipmaps(imageData, mipmaps);
    const encoded = levels.map(l => encodeLevel(l, format));
    const total = 128 + encoded.reduce((s, a) => s + a.length, 0);
    const out = new ArrayBuffer(total); const view = new DataView(out); const bytes = new Uint8Array(out);
    view.setUint32(0, MAGIC, true);
    view.setUint32(4, 124, true);
    let flags = 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000; // CAPS|HEIGHT|WIDTH|PIXELFORMAT|LINEARSIZE
    if (levels.length > 1) flags |= 0x20000; // MIPMAPCOUNT
    view.setUint32(8, flags, true);
    view.setUint32(12, imageData.height, true);
    view.setUint32(16, imageData.width, true);
    view.setUint32(20, encoded[0].length, true);
    view.setUint32(24, 0, true); // depth
    view.setUint32(28, levels.length, true);
    // reserved1 11 dwords at 32..75 remain zero
    view.setUint32(76, 32, true); // DDS_PIXELFORMAT size
    view.setUint32(80, DDPF_FOURCC, true);
    const cc=format==='BC2'?'DXT3':format==='BC3'?'DXT5':format==='BC5'?'ATI2':'DXT1';
    view.setUint32(84, fourCC(cc), true);
    // remaining pixel format fields zero
    let caps = 0x1000; // DDSCAPS_TEXTURE
    if (levels.length > 1) caps |= 0x8 | 0x400000; // COMPLEX|MIPMAP
    view.setUint32(108, caps, true);
    let cursor = 128;
    for (const level of encoded) { bytes.set(level, cursor); cursor += level.length; }
    return new Blob([out], { type: 'application/octet-stream' });
  };

  function decodeColorBlock(view, offset, forceFourColor) {
    const c0 = view.getUint16(offset, true), c1 = view.getUint16(offset + 2, true);
    const a = rgbFrom565(c0), b = rgbFrom565(c1);
    let pal;
    if (forceFourColor || c0 > c1) {
      pal = [a, b,
        [Math.round((2 * a[0] + b[0]) / 3), Math.round((2 * a[1] + b[1]) / 3), Math.round((2 * a[2] + b[2]) / 3)],
        [Math.round((a[0] + 2 * b[0]) / 3), Math.round((a[1] + 2 * b[1]) / 3), Math.round((a[2] + 2 * b[2]) / 3)]];
    } else {
      pal = [a, b,
        [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), Math.round((a[2] + b[2]) / 2)],
        [0, 0, 0]];
    }
    return { pal, bits: view.getUint32(offset + 4, true), c0, c1 };
  }

  function decodeBC4Block(bytes, offset) {
    const a0=bytes[offset],a1=bytes[offset+1],pal=makeAlphaPalette(a0,a1);let bits=0n;
    for(let i=0;i<6;i++)bits|=BigInt(bytes[offset+2+i])<<BigInt(i*8);
    const out=new Uint8Array(16);for(let i=0;i<16;i++)out[i]=pal[Number((bits>>BigInt(i*3))&7n)];return out;
  }

  function decodeLevel(buffer, offset, width, height, format) {
    const view = new DataView(buffer); const bytes = new Uint8Array(buffer);
    const data = new Uint8ClampedArray(width * height * 4);
    const bw = Math.max(1, Math.ceil(width / 4)), bh = Math.max(1, Math.ceil(height / 4));
    const blockBytes = (format === 'BC2' || format === 'BC3' || format === 'BC5') ? 16 : 8;
    let off = offset;
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        if(format==='BC5'){
          const red=decodeBC4Block(bytes,off),green=decodeBC4Block(bytes,off+8);
          for(let py=0;py<4;py++)for(let px=0;px<4;px++){
            const x=bx*4+px,y=by*4+py;if(x>=width||y>=height)continue;const i=py*4+px,p=(y*width+x)*4;
            const nx=red[i]/127.5-1,ny=green[i]/127.5-1,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
            data[p]=red[i];data[p+1]=green[i];data[p+2]=Math.round((nz*.5+.5)*255);data[p+3]=255;
          }
          off+=blockBytes;continue;
        }
        let alpha = null, colorOffset = off, forceFour=false;
        if (format === 'BC3') { alpha=decodeBC4Block(bytes,off);colorOffset=off+8;forceFour=true; }
        else if(format==='BC2'){
          alpha=new Uint8Array(16);for(let i=0;i<16;i++){const b=bytes[off+(i>>1)];alpha[i]=((i&1)?(b>>4):(b&15))*17;}colorOffset=off+8;forceFour=true;
        }
        const cb = decodeColorBlock(view, colorOffset, forceFour);
        for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py; if (x >= width || y >= height) continue;
          const i = py * 4 + px, ci = (cb.bits >>> (i * 2)) & 3, c = cb.pal[ci];
          const p = (y * width + x) * 4;
          data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2];
          data[p + 3] = alpha ? alpha[i] : (cb.c0 <= cb.c1 && ci === 3 ? 0 : 255);
        }
        off += blockBytes;
      }
    }
    return new ImageData(data, width, height);
  }

  function formatInfo(view, byteLength){
    const cc=view.getUint32(84,true);let format=null,dataOffset=128,label='';
    if(cc===fourCC('DXT1')){format='BC1';label='BC1 / DXT1';}
    else if(cc===fourCC('DXT3')){format='BC2';label='BC2 / DXT3';}
    else if(cc===fourCC('DXT5')){format='BC3';label='BC3 / DXT5';}
    else if(cc===fourCC('ATI2')||cc===fourCC('BC5U')){format='BC5';label='BC5 / ATI2';}
    else if(cc===fourCC('DX10')){
      if(byteLength<148)return{format:null,dataOffset:148,label:'DX10 (truncated)'};
      const dxgi=view.getUint32(128,true);dataOffset=148;
      if(dxgi===71||dxgi===72){format='BC1';label='BC1 / DX10';}
      else if(dxgi===74||dxgi===75){format='BC2';label='BC2 / DX10';}
      else if(dxgi===77||dxgi===78){format='BC3';label='BC3 / DX10';}
      else if(dxgi===83){format='BC5';label='BC5 / DX10';}
      else if(dxgi===98||dxgi===99){format='BC7';label='BC7 / DX10';}
      else label=`DX10 format ${dxgi}`;
      return{format,dataOffset,label,dxgi};
    }
    return{format,dataOffset,label};
  }

  DDS.decode = function (buffer) {
    if (buffer.byteLength < 128) throw new Error('DDS is truncated.');
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== MAGIC) throw new Error('File is not a DDS.');
    if (view.getUint32(4, true) !== 124 || view.getUint32(76, true) !== 32) throw new Error('Invalid DDS header.');
    const height = view.getUint32(12, true), width = view.getUint32(16, true);
    const mipCount = Math.max(1, view.getUint32(28, true) || 1);
    const pfFlags = view.getUint32(80, true);
    if (!(pfFlags & DDPF_FOURCC)) throw new Error('DDS without BC/DXT compression is not supported by this build.');
    const info=formatInfo(view,buffer.byteLength);
    if(info.format==='BC7')throw new Error('DDS BC7 was detected. The original file is preserved safely, but BC7 pixel editing/re-encoding is not enabled in this build yet.');
    if(!['BC1','BC2','BC3','BC5'].includes(info.format))throw new Error(`Unsupported DDS compression (${info.label||'unknown'}). The original bytes can still be preserved.`);
    const imageData = decodeLevel(buffer, info.dataOffset, width, height, info.format);
    return { width, height, imageData, meta: { format:info.format, mipCount, encoding:`DDS ${info.label}`, dxgi:info.dxgi||null, dataOffset:info.dataOffset } };
  };

  DDS.inspect = function (buffer) {
    if (buffer.byteLength < 128) return null;
    const view = new DataView(buffer); if (view.getUint32(0, true) !== MAGIC) return null;
    const info=formatInfo(view,buffer.byteLength);
    return {
      width: view.getUint32(16, true), height: view.getUint32(12, true), mipCount: Math.max(1, view.getUint32(28, true) || 1),
      format: info.format||'Other', encoding:info.label||'Unknown', dataOffset:info.dataOffset, dxgi:info.dxgi||null
    };
  };

  DDS.hasMeaningfulAlpha = function (imageData) {
    const d = imageData.data; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true; return false;
  };

  window.DDS = DDS;
})();
