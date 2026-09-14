(function () {
  'use strict';

  class TextureEditor {
    constructor(displayCanvas, cursorCanvas) {
      this.displayCanvas = displayCanvas;
      this.displayCtx = displayCanvas.getContext('2d', { willReadFrequently: true });
      this.cursorCanvas = cursorCanvas;
      this.cursorCtx = cursorCanvas.getContext('2d', { willReadFrequently: true });
      this.width = 512;
      this.height = 512;
      this.layers = [];
      this.activeLayerId = null;
      this.tool = 'brush';
      this.color = '#ffcc33';
      this.brushSize = 24;
      this.brushOpacity = 1;
      this.brushHardness = 0.85;
      this.brushTip = 'soft';
      this.brushSpacing = 18;
      this.brushDensity = 55;
      this.brushAngle = -35;
      this.brushJitter = 55;
      this.cloneSource = null;
      this.cloneOffset = null;
      this.smudgeCarry = null;
      this.bucketTolerance = 18;
      this.preserveAlpha = false;
      this.alphaOnly = false;
      this.alphaValue = 255;
      this.wrapPaint = false;
      this.shapeFill = false;
      this.zoom = 1;
      this.previewMode = 'rgba';
      this.isDrawing = false;
      this.lastPoint = null;
      this.startPoint = null;
      this.moveStart = null;
      this.rotateStart = null;
      this.panStart = null;
      this.history = [];
      this.redoStack = [];
      this.maxHistory = 25;
      this.onChange = null;
      this.onLayersChange = null;
      this.onCursor = null;
      this.onStatus = null;
      this._renderQueued = false;
      this._historyLock = false;
      this.newDocument(512, 512, 'transparent', false);
      this.bindPointerEvents();
    }

    makeLayer(name) {
      const canvas = document.createElement('canvas');
      canvas.width = this.width; canvas.height = this.height;
      return {
        id: 'layer_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
        name: name || 'Layer', canvas,
        ctx: canvas.getContext('2d', { willReadFrequently: true }),
        visible: true, locked: false, opacity: 1, blend: 'source-over', offsetX: 0, offsetY: 0
      };
    }

    newDocument(width, height, background, record) {
      this.width = clampInt(width, 1, 8192); this.height = clampInt(height, 1, 8192);
      this.layers = [];
      const base = this.makeLayer('Base');
      if (background === 'white' || background === 'black') {
        base.ctx.fillStyle = background; base.ctx.fillRect(0, 0, this.width, this.height);
      }
      this.layers.push(base); this.activeLayerId = base.id;
      this.history = []; this.redoStack = [];
      this.resizeDisplay(); this.render(true); this.layersChanged();
      if (record !== false) this.pushHistory('New document');
    }

    resizeDisplay() {
      this.displayCanvas.width = this.width; this.displayCanvas.height = this.height;
      this.cursorCanvas.width = this.width; this.cursorCanvas.height = this.height;
      this.applyZoom();
    }

    applyZoom() {
      const w = Math.max(1, Math.round(this.width * this.zoom));
      const h = Math.max(1, Math.round(this.height * this.zoom));
      for (const c of [this.displayCanvas, this.cursorCanvas]) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
      const wrap = this.displayCanvas.parentElement; wrap.style.width = w + 'px'; wrap.style.height = h + 'px';
      this.displayCanvas.style.imageRendering = this.zoom >= 8 ? 'pixelated' : 'auto';
      this.changed();
    }

    setZoom(value) { this.zoom = Math.max(0.03125, Math.min(128, value)); this.applyZoom(); }
    fitTo(stage) {
      const pad = 72;
      const scale = Math.min((stage.clientWidth - pad) / this.width, (stage.clientHeight - pad) / this.height);
      this.setZoom(Math.max(0.03125, Math.min(16, scale)));
    }

    get activeLayer() { return this.layers.find(l => l.id === this.activeLayerId) || this.layers[this.layers.length - 1]; }
    setActiveLayer(id) { if (this.layers.some(l => l.id === id)) { this.activeLayerId = id; this.layersChanged(); } }

    addLayer(name, record = true) {
      if (record) this.pushHistory('New layer');
      const layer = this.makeLayer(name || ('Layer ' + (this.layers.length + 1)));
      this.layers.push(layer); this.activeLayerId = layer.id; this.render(); this.layersChanged(); return layer;
    }

    deleteActiveLayer() {
      if (this.layers.length <= 1) return;
      this.pushHistory('Delete layer');
      const i = this.layers.findIndex(l => l.id === this.activeLayerId);
      this.layers.splice(i, 1); this.activeLayerId = this.layers[Math.max(0, i - 1)].id;
      this.render(); this.layersChanged();
    }

    duplicateActiveLayer() {
      const src = this.activeLayer; if (!src) return;
      this.pushHistory('Duplicate layer');
      const layer = this.makeLayer(src.name + ' copy'); layer.ctx.drawImage(src.canvas, 0, 0);
      Object.assign(layer, { visible: src.visible, locked: src.locked, opacity: src.opacity, blend: src.blend, offsetX: src.offsetX, offsetY: src.offsetY });
      const idx = this.layers.indexOf(src); this.layers.splice(idx + 1, 0, layer); this.activeLayerId = layer.id;
      this.render(); this.layersChanged();
    }

    mergeDown() {
      const top = this.activeLayer, idx = this.layers.indexOf(top); if (idx <= 0) return;
      const bottom = this.layers[idx - 1]; this.pushHistory('Merge layers');
      bottom.ctx.save(); bottom.ctx.globalAlpha = top.opacity; bottom.ctx.globalCompositeOperation = top.blend;
      bottom.ctx.drawImage(top.canvas, top.offsetX - bottom.offsetX, top.offsetY - bottom.offsetY); bottom.ctx.restore();
      this.layers.splice(idx, 1); this.activeLayerId = bottom.id; this.render(); this.layersChanged();
    }

    flattenVisible() {
      this.pushHistory('Flatten image');
      const composite = this.getCompositeCanvas();
      const layer = this.makeLayer('Flattened'); layer.ctx.drawImage(composite, 0, 0);
      this.layers = [layer]; this.activeLayerId = layer.id; this.render(); this.layersChanged();
    }

    moveLayer(fromIndex, toIndex) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= this.layers.length || toIndex >= this.layers.length) return;
      this.pushHistory('Reorder layers'); const [layer] = this.layers.splice(fromIndex, 1); this.layers.splice(toIndex, 0, layer);
      this.render(); this.layersChanged();
    }

    async loadImageData(imageData, name) {
      this.newDocument(imageData.width, imageData.height, 'transparent', false);
      const base = this.layers[0]; base.name = name || 'Base'; base.ctx.putImageData(imageData, 0, 0);
      this.history = []; this.redoStack = []; this.render(true); this.layersChanged(); this.historyChanged();
    }

    async importImageData(imageData, name) {
      this.pushHistory('Import layer'); const layer = this.addLayer(name || 'Imported', false);
      const temp = document.createElement('canvas'); temp.width = imageData.width; temp.height = imageData.height; temp.getContext('2d').putImageData(imageData, 0, 0);
      const scale = Math.min(1, this.width / imageData.width, this.height / imageData.height);
      const w = Math.round(imageData.width * scale), h = Math.round(imageData.height * scale);
      layer.ctx.drawImage(temp, Math.round((this.width - w) / 2), Math.round((this.height - h) / 2), w, h);
      this.render(); this.layersChanged();
    }

    compositeTo(ctx, previewMode) {
      ctx.clearRect(0, 0, this.width, this.height);
      for (const layer of this.layers) {
        if (!layer.visible) continue;
        ctx.save(); ctx.globalAlpha = layer.opacity; ctx.globalCompositeOperation = layer.blend; ctx.drawImage(layer.canvas, layer.offsetX, layer.offsetY); ctx.restore();
      }
      if (previewMode && previewMode !== 'rgba') {
        const img = ctx.getImageData(0, 0, this.width, this.height), d = img.data;
        if (previewMode === 'alpha') {
          for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; d[i] = a; d[i + 1] = a; d[i + 2] = a; d[i + 3] = 255; }
        } else if (previewMode === 'rgb') {
          for (let i = 3; i < d.length; i += 4) d[i] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
    }

    render(force) {
      if (this._renderQueued && !force) return;
      this._renderQueued = true;
      requestAnimationFrame(() => { this._renderQueued = false; this.compositeTo(this.displayCtx, this.previewMode); this.changed(); });
    }

    getCompositeImageData() {
      const c = document.createElement('canvas'); c.width = this.width; c.height = this.height;
      const ctx = c.getContext('2d', { willReadFrequently: true }); this.compositeTo(ctx, 'rgba'); return ctx.getImageData(0, 0, this.width, this.height);
    }
    getCompositeCanvas() { const c = document.createElement('canvas'); c.width = this.width; c.height = this.height; this.compositeTo(c.getContext('2d'), 'rgba'); return c; }
    setPreviewMode(mode) { this.previewMode = mode; this.render(true); }

    setLayerOpacity(value) { const l = this.activeLayer; if (!l) return; l.opacity = clamp(value, 0, 1); this.render(); this.layersChanged(); }
    setLayerBlend(value) { const l = this.activeLayer; if (!l) return; l.blend = value; this.render(); this.layersChanged(); }
    setTool(tool) { this.tool = tool; this.clearCursor(); if (tool !== 'clone') this.cloneOffset = null; if (tool !== 'smudge') this.smudgeCarry = null; this.displayCanvas.style.cursor = tool === 'pan' ? 'grab' : tool === 'rotate' ? 'crosshair' : ''; this.changed(); }
    setCloneSource(point) { if (!point) return; this.cloneSource = { x: point.x, y: point.y, layerId: this.activeLayerId }; this.cloneOffset = null; if (this.onStatus) this.onStatus(`Clone source set · X ${Math.floor(point.x)}  Y ${Math.floor(point.y)}`); this.changed(); }

    pointerToImage(e) {
      const rect = this.displayCanvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * this.width / rect.width, y: (e.clientY - rect.top) * this.height / rect.height };
    }

    bindPointerEvents() {
      const canvas = this.displayCanvas;
      canvas.addEventListener('pointerdown', e => this.pointerDown(e));
      canvas.addEventListener('pointermove', e => this.pointerMove(e));
      canvas.addEventListener('pointerup', e => this.pointerUp(e));
      canvas.addEventListener('pointercancel', e => this.pointerUp(e));
      canvas.addEventListener('pointerleave', () => { if (!this.isDrawing) this.clearCursor(); });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    pointerDown(e) {
      if (e.button !== 0) return;
      const p = this.pointerToImage(e), layer = this.activeLayer;
      if (this.tool === 'pan') {
        const stage = this.displayCanvas.closest('.canvas-stage'); if (!stage) return;
        this.isDrawing = true; this.panStart = { x:e.clientX, y:e.clientY, left:stage.scrollLeft, top:stage.scrollTop, stage };
        this.displayCanvas.style.cursor='grabbing'; canvasCaptureSafe(this.displayCanvas,e.pointerId); return;
      }
      if (!layer || layer.locked) return;
      if (this.tool === 'eyedropper') { this.pickColor(p.x, p.y); return; }
      if (this.tool === 'clone' && e.ctrlKey) { this.setCloneSource(p); return; }
      if (this.tool !== 'crop') this.pushHistory(this.tool === 'move' ? 'Move layer' : this.tool === 'rotate' ? 'Rotate layer' : toolHistoryName(this.tool));
      this.isDrawing = true; this.lastPoint = p; this.startPoint = p; this.cloneOffset = null; canvasCaptureSafe(this.displayCanvas, e.pointerId);
      if (this.tool === 'move') this.moveStart = { x: p.x, y: p.y, ox: layer.offsetX, oy: layer.offsetY };
      else if (this.tool === 'rotate') {
        const source = document.createElement('canvas'); source.width = this.width; source.height = this.height;
        source.getContext('2d').drawImage(layer.canvas, layer.offsetX, layer.offsetY);
        const cx = this.width / 2, cy = this.height / 2;
        this.rotateStart = { source, cx, cy, angle: Math.atan2(p.y - cy, p.x - cx), delta: 0 };
      }
      else if (this.tool === 'bucket') { this.floodFill(Math.floor(p.x - layer.offsetX), Math.floor(p.y - layer.offsetY)); this.isDrawing = false; }
      else if (['brush','eraser','clone','smudge','blur'].includes(this.tool)) this.stroke(p, p);
      else if (['line','rect','ellipse','crop'].includes(this.tool)) this.drawShapePreview(p);
    }

    pointerMove(e) {
      const p = this.pointerToImage(e); if (this.onCursor) this.onCursor(p); this.drawCursor(p);
      if (!this.isDrawing) return;
      if (this.tool === 'pan' && this.panStart) {
        const ps=this.panStart; ps.stage.scrollLeft=ps.left-(e.clientX-ps.x); ps.stage.scrollTop=ps.top-(e.clientY-ps.y); return;
      }
      const layer = this.activeLayer; if (!layer || layer.locked) return;
      if (this.tool === 'move') {
        layer.offsetX = Math.round(this.moveStart.ox + (p.x - this.moveStart.x)); layer.offsetY = Math.round(this.moveStart.oy + (p.y - this.moveStart.y));
        this.render(); this.layersChanged();
      } else if (this.tool === 'rotate' && this.rotateStart) {
        const rs = this.rotateStart;
        let delta = Math.atan2(p.y - rs.cy, p.x - rs.cx) - rs.angle;
        if (e.shiftKey) { const snap = Math.PI / 12; delta = Math.round(delta / snap) * snap; }
        rs.delta = delta;
        layer.ctx.clearRect(0, 0, this.width, this.height);
        layer.ctx.save(); layer.ctx.translate(rs.cx, rs.cy); layer.ctx.rotate(delta); layer.ctx.translate(-rs.cx, -rs.cy); layer.ctx.drawImage(rs.source, 0, 0); layer.ctx.restore();
        layer.offsetX = 0; layer.offsetY = 0;
        this.render(); this.layersChanged(); this.drawCursor(p);
      } else if (['brush','eraser','clone','smudge','blur'].includes(this.tool)) this.stroke(this.lastPoint, p);
      else if (['line','rect','ellipse','crop'].includes(this.tool)) this.drawShapePreview(p);
      this.lastPoint = p;
    }

    pointerUp(e) {
      if (!this.isDrawing) return;
      const p = this.pointerToImage(e), tool = this.tool; this.isDrawing = false;
      if (tool === 'pan') { this.displayCanvas.style.cursor='grab'; this.panStart=null; canvasReleaseSafe(this.displayCanvas,e.pointerId); return; }
      if (['line','rect','ellipse'].includes(tool)) this.commitShape(p);
      else if (tool === 'crop') {
        const r = normalizedRect(this.startPoint, p);
        if (r.w >= 1 && r.h >= 1) { this.pushHistory('Crop document'); this.cropToRect(r); }
        this.clearCursor();
      }
      this.lastPoint = null; this.startPoint = null; this.moveStart = null; this.rotateStart = null; this.panStart = null; canvasReleaseSafe(this.displayCanvas, e.pointerId);
      this.layersChanged(); this.render();
    }

    stroke(a, b) {
      const dist = Math.hypot(b.x - a.x, b.y - a.y); const spacing = Math.max(1, Math.min(100, this.brushSpacing == null ? 18 : this.brushSpacing)); const step = Math.max(1, this.brushSize * (spacing / 100)); const count = Math.max(1, Math.ceil(dist / step));
      let prev = a;
      for (let i = 0; i <= count; i++) {
        const t = count ? i / count : 0;
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (this.tool === 'smudge') this.smudgeWrapped(prev, p);
        else this.stampWrapped(p.x, p.y);
        prev = p;
      }
      this.render();
    }

    stampWrapped(x, y) {
      const pts = [[x, y]], r = this.brushSize / 2;
      if (this.wrapPaint) {
        const xs = [0], ys = [0]; if (x < r) xs.push(this.width); if (x > this.width - r) xs.push(-this.width); if (y < r) ys.push(this.height); if (y > this.height - r) ys.push(-this.height);
        for (const dx of xs) for (const dy of ys) if (dx || dy) pts.push([x + dx, y + dy]);
      }
      for (const pt of pts) this.stampAt(pt[0], pt[1]);
    }

    smudgeWrapped(from, to) {
      const pts = [[from, to]], r = this.brushSize / 2;
      if (this.wrapPaint) {
        const xs = [0], ys = [0]; if (to.x < r) xs.push(this.width); if (to.x > this.width - r) xs.push(-this.width); if (to.y < r) ys.push(this.height); if (to.y > this.height - r) ys.push(-this.height);
        for (const dx of xs) for (const dy of ys) if (dx || dy) pts.push([{x:from.x+dx,y:from.y+dy},{x:to.x+dx,y:to.y+dy}]);
      }
      for (const pt of pts) this.smudgeAt(pt[0], pt[1]);
    }

    stampAt(docX, docY) {
      const layer = this.activeLayer; const x = docX - layer.offsetX, y = docY - layer.offsetY, r = this.brushSize / 2;
      const tip = this.brushTip || 'soft';
      if (this.tool === 'clone') { this.cloneAt(layer, x, y, r, tip); return; }
      if (this.tool === 'blur') { this.blurAt(layer, x, y, r); return; }
      const density = clamp((this.brushDensity == null ? 55 : this.brushDensity) / 100, .05, 1);
      if (tip === 'scatter' || tip === 'spray' || tip === 'chalk' || tip === 'noise') {
        const multiplier = tip === 'spray' ? 1.5 : tip === 'chalk' ? 1.15 : tip === 'noise' ? .75 : .55;
        const dots = Math.max(5, Math.round(this.brushSize * density * multiplier));
        const baseR = tip === 'scatter' ? Math.max(1, r * .22) : tip === 'chalk' ? Math.max(.65, r * .075) : Math.max(.55, r * .055);
        for (let i = 0; i < dots; i++) {
          const ang = Math.random() * Math.PI * 2;
          const mag = Math.sqrt(Math.random()) * r * (tip === 'scatter' ? .9 : .98);
          const rr = baseR * (tip === 'chalk' ? (.45 + Math.random() * 1.3) : (.65 + Math.random() * .8));
          const alpha = tip === 'scatter' ? .72 : tip === 'chalk' ? .36 : tip === 'noise' ? .42 : .28;
          this.stampSingle(layer, x + Math.cos(ang) * mag, y + Math.sin(ang) * mag, rr, 'hard', alpha);
        }
        return;
      }
      if (tip === 'airbrush') {
        // Low-flow soft stamp. Repeated movement builds colour naturally like an airbrush.
        this.stampSingle(layer, x, y, r, 'soft', .20 + density * .18);
        return;
      }
      this.stampSingle(layer, x, y, r, tip);
    }

    stampSingle(layer, x, y, r, tip, opacityScale = 1) {
      if (this.alphaOnly || (this.preserveAlpha && this.tool === 'brush')) {
        this.pixelBrush(layer, x, y, r, tip === 'square' ? 'square' : 'circle', tip === 'hard' || tip === 'pixel' || tip === 'square' ? 1 : this.brushHardness);
        return;
      }
      if (tip === 'pixel') {
        this.pixelBrush(layer, x, y, r, 'circle', 1);
        return;
      }
      const ctx = layer.ctx; ctx.save(); ctx.globalAlpha = this.brushOpacity * opacityScale;
      ctx.globalCompositeOperation = this.tool === 'eraser' ? 'destination-out' : 'source-over';
      const color = this.tool === 'eraser' ? '#000' : this.color;
      const angle = ((this.brushAngle == null ? -35 : this.brushAngle) * Math.PI) / 180;
      if (tip === 'diamond') {
        ctx.fillStyle = color; ctx.translate(x,y); ctx.rotate(Math.PI/4); ctx.fillRect(-r*.72,-r*.72,r*1.44,r*1.44); ctx.restore(); return;
      }
      if (tip === 'cross') {
        ctx.fillStyle = color; const t=Math.max(1,r*.38); ctx.fillRect(x-r,y-t*.5,r*2,t); ctx.fillRect(x-t*.5,y-r,t,r*2); ctx.restore(); return;
      }
      if (tip === 'calligraphy' || tip === 'slash') {
        ctx.fillStyle=color; ctx.translate(x,y); ctx.rotate(angle);
        const h=tip==='calligraphy'?Math.max(2,r*.42):Math.max(1,r*.22);
        ctx.beginPath(); ctx.roundRect(-r,-h/2,r*2,h,Math.min(h/2,3)); ctx.fill(); ctx.restore(); return;
      }
      if (tip === 'star') {
        ctx.fillStyle=color; ctx.translate(x,y); ctx.beginPath();
        for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, rr=i%2===0?r:r*.42; const px=Math.cos(a)*rr,py=Math.sin(a)*rr; if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py); }
        ctx.closePath();ctx.fill();ctx.restore();return;
      }
      if (tip === 'square') {
        ctx.fillStyle = color;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
        return;
      }
      const hardness = tip === 'hard' ? 1 : clamp(this.brushHardness, 0, 1);
      const inner = r * hardness;
      if (hardness >= 0.995 || r <= 1) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      } else {
        const g = ctx.createRadialGradient(x, y, inner, x, y, r);
        const rgbText = this.tool === 'eraser' ? '0,0,0' : hexToRgbString(this.color);
        g.addColorStop(0, `rgba(${rgbText},1)`); g.addColorStop(1, `rgba(${rgbText},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    pixelBrush(layer, x, y, r, shape = 'circle', hardValue = this.brushHardness) {
      const x0 = Math.max(0, Math.floor(x - r - 1)), y0 = Math.max(0, Math.floor(y - r - 1));
      const x1 = Math.min(this.width, Math.ceil(x + r + 1)), y1 = Math.min(this.height, Math.ceil(y + r + 1));
      if (x1 <= x0 || y1 <= y0) return;
      const img = layer.ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data, rgb = hexToRgb(this.color);
      const hard = clamp(hardValue, 0, 1), inner = r * hard;
      for (let py = 0; py < img.height; py++) for (let px = 0; px < img.width; px++) {
        const dx = x0 + px + .5 - x, dy = y0 + py + .5 - y;
        const dist = shape === 'square' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy); if (dist > r) continue;
        let fall = dist <= inner || r === inner ? 1 : 1 - (dist - inner) / Math.max(.0001, r - inner); fall = clamp(fall, 0, 1) * this.brushOpacity;
        const i = (py * img.width + px) * 4;
        if (this.alphaOnly) {
          const target = this.tool === 'eraser' ? 0 : this.alphaValue; d[i + 3] = Math.round(d[i + 3] * (1 - fall) + target * fall);
        } else {
          d[i] = Math.round(d[i] * (1 - fall) + rgb.r * fall); d[i + 1] = Math.round(d[i + 1] * (1 - fall) + rgb.g * fall); d[i + 2] = Math.round(d[i + 2] * (1 - fall) + rgb.b * fall);
        }
      }
      layer.ctx.putImageData(img, x0, y0);
    }

    cloneAt(layer, x, y, r, tip) {
      if (!this.cloneSource) { if (this.onStatus) this.onStatus('Clone: use Ctrl+click to set a source point.'); return; }
      if (!this.cloneOffset) this.cloneOffset = { x: this.cloneSource.x - (x + layer.offsetX), y: this.cloneSource.y - (y + layer.offsetY) };
      const sx = x + layer.offsetX + this.cloneOffset.x - layer.offsetX;
      const sy = y + layer.offsetY + this.cloneOffset.y - layer.offsetY;
      const shape = tip === 'square' ? 'square' : 'circle';
      const x0 = Math.max(0, Math.floor(Math.min(x, sx) - r - 2)), y0 = Math.max(0, Math.floor(Math.min(y, sy) - r - 2));
      const x1 = Math.min(this.width, Math.ceil(Math.max(x, sx) + r + 2)), y1 = Math.min(this.height, Math.ceil(Math.max(y, sy) + r + 2));
      if (x1 <= x0 || y1 <= y0) return;
      const img = layer.ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data;
      const srcD = new Uint8ClampedArray(d);
      const hard = tip === 'hard' || tip === 'pixel' || tip === 'square' ? 1 : clamp(this.brushHardness, 0, 1), inner = r * hard;
      for (let py = 0; py < img.height; py++) for (let px = 0; px < img.width; px++) {
        const dx = x0 + px + .5 - x, dy = y0 + py + .5 - y;
        const dist = shape === 'square' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy); if (dist > r) continue;
        const sxf = Math.round(x0 + px + (sx - x)); const syf = Math.round(y0 + py + (sy - y));
        if (sxf < x0 || syf < y0 || sxf >= x1 || syf >= y1) continue;
        let fall = dist <= inner || r === inner ? 1 : 1 - (dist - inner) / Math.max(.0001, r - inner); fall = clamp(fall, 0, 1) * this.brushOpacity;
        const di = (py * img.width + px) * 4, si = ((syf - y0) * img.width + (sxf - x0)) * 4;
        if (this.alphaOnly) {
          // Clone only the alpha channel. RGB must remain byte-for-byte unchanged.
          d[di + 3] = Math.round(d[di + 3] * (1 - fall) + srcD[si + 3] * fall);
        } else {
          for (let c = 0; c < 4; c++) d[di + c] = Math.round(d[di + c] * (1 - fall) + srcD[si + c] * fall);
        }
      }
      layer.ctx.putImageData(img, x0, y0);
    }

    blurAt(layer, x, y, r) {
      const x0 = Math.max(0, Math.floor(x - r - 2)), y0 = Math.max(0, Math.floor(y - r - 2));
      const x1 = Math.min(this.width, Math.ceil(x + r + 2)), y1 = Math.min(this.height, Math.ceil(y + r + 2));
      if (x1 <= x0 || y1 <= y0) return;
      const img = layer.ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data, src = new Uint8ClampedArray(d);
      const hard = clamp(this.brushHardness, 0, 1), inner = r * hard;
      for (let py = 1; py < img.height - 1; py++) for (let px = 1; px < img.width - 1; px++) {
        const dx = x0 + px + .5 - x, dy = y0 + py + .5 - y, dist = Math.hypot(dx, dy); if (dist > r) continue;
        let fall = dist <= inner || r === inner ? 1 : 1 - (dist - inner) / Math.max(.0001, r - inner); fall = clamp(fall, 0, 1) * this.brushOpacity;
        const di = (py * img.width + px) * 4;
        let rr=0,gg=0,bb=0,aa=0,cnt=0;
        for (let oy=-1; oy<=1; oy++) for (let ox=-1; ox<=1; ox++) {
          const si = ((py + oy) * img.width + (px + ox)) * 4; rr += src[si]; gg += src[si+1]; bb += src[si+2]; aa += src[si+3]; cnt++;
        }
        if (this.alphaOnly) {
          // In alpha-only mode blur the mask, never the visible colour channels.
          d[di+3] = Math.round(d[di+3] * (1 - fall) + (aa / cnt) * fall);
        } else {
          d[di] = Math.round(d[di] * (1 - fall) + (rr / cnt) * fall);
          d[di+1] = Math.round(d[di+1] * (1 - fall) + (gg / cnt) * fall);
          d[di+2] = Math.round(d[di+2] * (1 - fall) + (bb / cnt) * fall);
          d[di+3] = Math.round(d[di+3] * (1 - fall) + (aa / cnt) * fall);
        }
      }
      layer.ctx.putImageData(img, x0, y0);
    }

    smudgeAt(from, to) {
      const layer = this.activeLayer, r = this.brushSize / 2;
      const x = to.x - layer.offsetX, y = to.y - layer.offsetY, sx = from.x - layer.offsetX, sy = from.y - layer.offsetY;
      const x0 = Math.max(0, Math.floor(Math.min(x, sx) - r - 2)), y0 = Math.max(0, Math.floor(Math.min(y, sy) - r - 2));
      const x1 = Math.min(this.width, Math.ceil(Math.max(x, sx) + r + 2)), y1 = Math.min(this.height, Math.ceil(Math.max(y, sy) + r + 2));
      if (x1 <= x0 || y1 <= y0) return;
      const img = layer.ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data, src = new Uint8ClampedArray(d);
      const hard = clamp(this.brushHardness, 0, 1), inner = r * hard, shiftX = x - sx, shiftY = y - sy;
      for (let py = 0; py < img.height; py++) for (let px = 0; px < img.width; px++) {
        const dx = x0 + px + .5 - x, dy = y0 + py + .5 - y, dist = Math.hypot(dx, dy); if (dist > r) continue;
        const sxf = Math.round(x0 + px - shiftX), syf = Math.round(y0 + py - shiftY);
        if (sxf < x0 || syf < y0 || sxf >= x1 || syf >= y1) continue;
        let fall = dist <= inner || r === inner ? 1 : 1 - (dist - inner) / Math.max(.0001, r - inner); fall = clamp(fall, 0, 1) * this.brushOpacity;
        const di = (py * img.width + px) * 4, si = ((syf - y0) * img.width + (sxf - x0)) * 4;
        if (this.alphaOnly) {
          // Smudge only the alpha mask while preserving RGB exactly.
          d[di+3] = Math.round(d[di+3] * (1 - fall) + src[si+3] * fall);
        } else {
          d[di] = Math.round(d[di] * (1 - fall) + src[si] * fall);
          d[di+1] = Math.round(d[di+1] * (1 - fall) + src[si+1] * fall);
          d[di+2] = Math.round(d[di+2] * (1 - fall) + src[si+2] * fall);
          d[di+3] = Math.round(d[di+3] * (1 - fall) + src[si+3] * fall);
        }
      }
      layer.ctx.putImageData(img, x0, y0);
    }

    drawCursor(p) {
      const ctx = this.cursorCtx; ctx.clearRect(0, 0, this.width, this.height);
      if (['line','rect','ellipse','crop'].includes(this.tool) && this.isDrawing) { this.drawShapePreview(p); return; }
      if (this.tool === 'rotate') {
        const cx=this.width/2,cy=this.height/2,r=Math.max(18,Math.min(this.width,this.height)*0.12);
        ctx.save(); ctx.strokeStyle='rgba(255,212,108,.95)'; ctx.fillStyle='rgba(255,212,108,.95)'; ctx.lineWidth=Math.max(1/this.zoom,.6);
        ctx.setLineDash([5/this.zoom,4/this.zoom]); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(cx-7/this.zoom,cy); ctx.lineTo(cx+7/this.zoom,cy); ctx.moveTo(cx,cy-7/this.zoom); ctx.lineTo(cx,cy+7/this.zoom); ctx.stroke();
        if(this.rotateStart){ ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(p.x,p.y); ctx.stroke(); const deg=(this.rotateStart.delta*180/Math.PI).toFixed(1); ctx.font=`${Math.max(1.5,11/this.zoom)}px system-ui,sans-serif`; ctx.fillText(`${deg}°`,p.x+8/this.zoom,p.y-8/this.zoom); }
        ctx.restore(); return;
      }
      if (!['brush','eraser','clone','smudge','blur'].includes(this.tool)) return;
      const r = this.brushSize / 2, tip = this.brushTip || 'soft';
      ctx.save(); ctx.lineWidth = Math.max(.7 / this.zoom, .35); ctx.strokeStyle = 'rgba(255,255,255,.96)';
      if (tip === 'square') {
        ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.setLineDash([3 / this.zoom, 3 / this.zoom]); ctx.strokeRect(p.x - r - 1 / this.zoom, p.y - r - 1 / this.zoom, r * 2 + 2 / this.zoom, r * 2 + 2 / this.zoom);
      } else if (tip === 'scatter') {
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.setLineDash([3 / this.zoom, 3 / this.zoom]); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, r * .35), 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.setLineDash([3 / this.zoom, 3 / this.zoom]); ctx.beginPath(); ctx.arc(p.x, p.y, r + 1 / this.zoom, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    clearCursor() { this.cursorCtx.clearRect(0, 0, this.width, this.height); }

    drawShapePreview(p) {
      const ctx = this.cursorCtx; ctx.clearRect(0, 0, this.width, this.height); if (!this.startPoint) return;
      ctx.save(); ctx.strokeStyle = this.tool === 'crop' ? '#71d6ff' : this.color; ctx.fillStyle = this.color; ctx.globalAlpha = .9;
      ctx.lineWidth = this.tool === 'crop' ? Math.max(1 / this.zoom, .5) : Math.max(1 / this.zoom, this.brushSize); ctx.setLineDash(this.tool === 'crop' ? [6 / this.zoom, 4 / this.zoom] : []);
      drawShapePath(ctx, this.tool, this.startPoint, p, this.shapeFill && this.tool !== 'crop', this.tool === 'crop'); ctx.restore();
    }

    commitShape(p) {
      const layer = this.activeLayer; if (!layer) return;
      const a = { x: this.startPoint.x - layer.offsetX, y: this.startPoint.y - layer.offsetY }, b = { x: p.x - layer.offsetX, y: p.y - layer.offsetY };
      if (this.alphaOnly) {
        this.commitAlphaShape(layer, a, b);
        this.clearCursor();
        return;
      }
      layer.ctx.save(); layer.ctx.strokeStyle = this.color; layer.ctx.fillStyle = this.color; layer.ctx.globalAlpha = this.brushOpacity; layer.ctx.lineWidth = this.brushSize; layer.ctx.lineCap = 'round'; layer.ctx.lineJoin = 'round';
      drawShapePath(layer.ctx, this.tool, a, b, this.shapeFill, false); layer.ctx.restore(); this.clearCursor();
    }

    commitAlphaShape(layer, a, b) {
      // Render the vector shape into a temporary alpha mask and merge only that
      // mask into the layer's alpha channel. This guarantees that line/rect/
      // ellipse tools cannot accidentally repaint RGB while Alpha Only is on.
      const pad = Math.ceil(this.brushSize / 2) + 4;
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - pad));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad));
      const x1 = Math.min(this.width, Math.ceil(Math.max(a.x, b.x) + pad));
      const y1 = Math.min(this.height, Math.ceil(Math.max(a.y, b.y) + pad));
      const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
      const mask = document.createElement('canvas'); mask.width = w; mask.height = h;
      const mctx = mask.getContext('2d', { willReadFrequently: true });
      mctx.save(); mctx.translate(-x0, -y0); mctx.strokeStyle = '#fff'; mctx.fillStyle = '#fff'; mctx.globalAlpha = this.brushOpacity; mctx.lineWidth = this.brushSize; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
      drawShapePath(mctx, this.tool, a, b, this.shapeFill, false); mctx.restore();
      const md = mctx.getImageData(0, 0, w, h).data;
      const img = layer.ctx.getImageData(x0, y0, w, h), d = img.data, target = clampInt(this.alphaValue, 0, 255);
      for (let i = 0; i < d.length; i += 4) {
        const fall = md[i + 3] / 255; if (fall <= 0) continue;
        d[i + 3] = Math.round(d[i + 3] * (1 - fall) + target * fall);
      }
      layer.ctx.putImageData(img, x0, y0);
    }

    pickColor(x, y) {
      const composite = this.getCompositeImageData(); x = clampInt(Math.floor(x), 0, this.width - 1); y = clampInt(Math.floor(y), 0, this.height - 1);
      const p = (y * this.width + x) * 4, d = composite.data;
      this.color = '#' + [d[p], d[p + 1], d[p + 2]].map(v => v.toString(16).padStart(2, '0')).join(''); this.alphaValue = d[p + 3]; this.changed();
    }

    floodFill(x, y) {
      const layer = this.activeLayer; if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
      const img = layer.ctx.getImageData(0, 0, this.width, this.height), d = img.data, start = (y * this.width + x) * 4;
      const target = [d[start], d[start + 1], d[start + 2], d[start + 3]], rgb = hexToRgb(this.color);
      const replacement = [rgb.r, rgb.g, rgb.b, Math.round(255 * this.brushOpacity)], tolerance = this.bucketTolerance;
      const visited = new Uint8Array(this.width * this.height), stack = [[x, y]];
      const matches = idx => Math.abs(d[idx] - target[0]) <= tolerance && Math.abs(d[idx + 1] - target[1]) <= tolerance && Math.abs(d[idx + 2] - target[2]) <= tolerance && Math.abs(d[idx + 3] - target[3]) <= tolerance;
      while (stack.length) {
        const [cx, cy] = stack.pop(); if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) continue;
        const pi = cy * this.width + cx; if (visited[pi]) continue; visited[pi] = 1; const idx = pi * 4; if (!matches(idx)) continue;
        if (this.alphaOnly) d[idx + 3] = this.alphaValue;
        else { d[idx] = replacement[0]; d[idx + 1] = replacement[1]; d[idx + 2] = replacement[2]; if (!this.preserveAlpha) d[idx + 3] = replacement[3]; }
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      layer.ctx.putImageData(img, 0, 0); this.render();
    }

    transformActive(type) {
      const layer = this.activeLayer; if (!layer || layer.locked) return; this.pushHistory('Transformar camada');
      const tmp = document.createElement('canvas'); tmp.width = this.width; tmp.height = this.height; const t = tmp.getContext('2d');
      if (type === 'flipH') { t.translate(this.width, 0); t.scale(-1, 1); t.drawImage(layer.canvas, 0, 0); }
      else if (type === 'flipV') { t.translate(0, this.height); t.scale(1, -1); t.drawImage(layer.canvas, 0, 0); }
      else if (type === 'rotate90') { t.translate(this.width / 2, this.height / 2); t.rotate(Math.PI / 2); t.translate(-this.width / 2, -this.height / 2); t.drawImage(layer.canvas, 0, 0); }
      layer.ctx.clearRect(0, 0, this.width, this.height); layer.ctx.drawImage(tmp, 0, 0); this.render(); this.layersChanged();
    }

    resizeImage(newW, newH, smoothing = true) {
      newW = clampInt(newW, 1, 8192); newH = clampInt(newH, 1, 8192); this.pushHistory('Resize image');
      const sx = newW / this.width, sy = newH / this.height, oldW = this.width, oldH = this.height;
      for (const l of this.layers) {
        const temp = document.createElement('canvas'); temp.width = newW; temp.height = newH; const ctx = temp.getContext('2d'); ctx.imageSmoothingEnabled = smoothing; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(l.canvas, 0, 0, oldW, oldH, 0, 0, newW, newH);
        l.canvas = temp; l.ctx = temp.getContext('2d', { willReadFrequently: true }); l.offsetX = Math.round(l.offsetX * sx); l.offsetY = Math.round(l.offsetY * sy);
      }
      this.width = newW; this.height = newH; this.resizeDisplay(); this.render(true); this.layersChanged();
    }

    resizeCanvas(newW, newH, anchor = 'center') {
      newW = clampInt(newW, 1, 8192); newH = clampInt(newH, 1, 8192); this.pushHistory('Resize canvas');
      const dx = anchor.includes('left') ? 0 : anchor.includes('right') ? newW - this.width : Math.floor((newW - this.width) / 2);
      const dy = anchor.includes('top') ? 0 : anchor.includes('bottom') ? newH - this.height : Math.floor((newH - this.height) / 2);
      for (const l of this.layers) { const temp = document.createElement('canvas'); temp.width = newW; temp.height = newH; temp.getContext('2d').drawImage(l.canvas, 0, 0); l.canvas = temp; l.ctx = temp.getContext('2d', { willReadFrequently: true }); l.offsetX += dx; l.offsetY += dy; }
      this.width = newW; this.height = newH; this.resizeDisplay(); this.render(true); this.layersChanged();
    }

    cropToRect(rect) {
      const x = clampInt(Math.floor(rect.x), 0, this.width - 1), y = clampInt(Math.floor(rect.y), 0, this.height - 1);
      const w = clampInt(Math.ceil(rect.w), 1, this.width - x), h = clampInt(Math.ceil(rect.h), 1, this.height - y);
      for (const l of this.layers) {
        const temp = document.createElement('canvas'); temp.width = w; temp.height = h;
        temp.getContext('2d').drawImage(l.canvas, l.offsetX - x, l.offsetY - y); l.canvas = temp; l.ctx = temp.getContext('2d', { willReadFrequently: true }); l.offsetX = 0; l.offsetY = 0;
      }
      this.width = w; this.height = h; this.resizeDisplay(); this.render(true); this.layersChanged();
    }

    rotateDocument90() {
      this.pushHistory('Rotate document'); const oldW = this.width, oldH = this.height;
      for (const l of this.layers) {
        const temp = document.createElement('canvas'); temp.width = oldH; temp.height = oldW; const ctx = temp.getContext('2d');
        ctx.translate(oldH, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(l.canvas, l.offsetX, l.offsetY); l.canvas = temp; l.ctx = temp.getContext('2d', { willReadFrequently: true }); l.offsetX = 0; l.offsetY = 0;
      }
      this.width = oldH; this.height = oldW; this.resizeDisplay(); this.render(true); this.layersChanged();
    }

    analyze() {
      const img = this.getCompositeImageData(), d = img.data; let transparent = 0, partial = 0, opaque = 0, minA = 255, maxA = 0;
      for (let i = 3; i < d.length; i += 4) { const a = d[i]; minA = Math.min(minA, a); maxA = Math.max(maxA, a); if (a === 0) transparent++; else if (a === 255) opaque++; else partial++; }
      const pixels = this.width * this.height;
      return { width: this.width, height: this.height, pixels, transparent, partial, opaque, minAlpha: minA, maxAlpha: maxA, hasAlpha: transparent + partial > 0 };
    }

    historyChanged(){ window.dispatchEvent(new CustomEvent('wc3-history-change',{detail:{scope:'texture',undo:this.history.length,redo:this.redoStack.length,max:this.maxHistory}})); }
    pushHistory(label) {
      if (this._historyLock) return;
      this.history.push(this.captureCurrent(label)); if (this.history.length > this.maxHistory) this.history.shift(); this.redoStack = [];
      window.WC3_LOG?.debug?.('History',`Texture snapshot · ${label}`,{undo:this.history.length,redo:this.redoStack.length,max:this.maxHistory});
      this.historyChanged();this.changed();
    }
    captureCurrent(label) {
      const layers = this.layers.map(l => ({ id:l.id, name:l.name, visible:l.visible, locked:l.locked, opacity:l.opacity, blend:l.blend, offsetX:l.offsetX, offsetY:l.offsetY, imageData:l.ctx.getImageData(0,0,this.width,this.height) }));
      return { label, width:this.width, height:this.height, activeLayerId:this.activeLayerId, layers };
    }
    restoreSnapshot(snap) {
      this._historyLock = true; this.width = snap.width; this.height = snap.height;
      this.layers = snap.layers.map(s => { const l = this.makeLayer(s.name); l.id=s.id; l.visible=s.visible; l.locked=s.locked; l.opacity=s.opacity; l.blend=s.blend; l.offsetX=s.offsetX; l.offsetY=s.offsetY; l.ctx.putImageData(s.imageData,0,0); return l; });
      this.activeLayerId = snap.activeLayerId; this.resizeDisplay(); this.render(true); this.layersChanged(); this._historyLock = false;
    }
    undo() { if (!this.history.length) {window.WC3_LOG?.warn?.('History','Texture undo requested with empty history');return false;} const prev = this.history.pop(); this.redoStack.push(this.captureCurrent('Redo')); this.restoreSnapshot(prev); this.historyChanged(); window.WC3_LOG?.info?.('History',`Texture undo · ${prev.label||'snapshot'}`,{undo:this.history.length,redo:this.redoStack.length,max:this.maxHistory}); return true; }
    redo() { if (!this.redoStack.length) {window.WC3_LOG?.warn?.('History','Texture redo requested with empty history');return false;} const next = this.redoStack.pop(); this.history.push(this.captureCurrent('Undo')); if(this.history.length>this.maxHistory)this.history.shift(); this.restoreSnapshot(next); this.historyChanged(); window.WC3_LOG?.info?.('History','Texture redo',{undo:this.history.length,redo:this.redoStack.length,max:this.maxHistory}); return true; }
    layersChanged() { if (this.onLayersChange) this.onLayersChange(); this.changed(); }
    changed() { if (this.onChange) this.onChange(); }
  }

  function drawShapePath(ctx, tool, a, b, fill, crop) {
    const r = normalizedRect(a, b); ctx.beginPath();
    if (tool === 'line') { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); return; }
    if (tool === 'rect' || tool === 'crop') { ctx.rect(r.x, r.y, r.w, r.h); }
    else if (tool === 'ellipse') { ctx.ellipse(r.x + r.w/2, r.y + r.h/2, Math.max(.1,r.w/2), Math.max(.1,r.h/2), 0, 0, Math.PI*2); }
    if (fill && !crop) ctx.fill(); else ctx.stroke();
  }
  function normalizedRect(a,b) { return { x:Math.min(a.x,b.x), y:Math.min(a.y,b.y), w:Math.abs(b.x-a.x), h:Math.abs(b.y-a.y) }; }
  function toolHistoryName(t) { return ({brush:'Paint',eraser:'Erase',clone:'Clone',smudge:'Smudge',blur:'Blur',bucket:'Fill',move:'Move layer',rotate:'Rotate layer',line:'Line',rect:'Rectangle',ellipse:'Ellipse'})[t] || 'Edit'; }
  function canvasCaptureSafe(canvas,id){try{canvas.setPointerCapture(id);}catch(_){}}
  function canvasReleaseSafe(canvas,id){try{canvas.releasePointerCapture(id);}catch(_){}}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function clampInt(v,a,b){return Math.max(a,Math.min(b,Math.floor(+v||0)));}
  function hexToRgb(hex){const n=parseInt(hex.replace('#',''),16);return{r:(n>>16)&255,g:(n>>8)&255,b:n&255};}
  function hexToRgbString(hex){const c=hexToRgb(hex);return `${c.r},${c.g},${c.b}`;}

  window.TextureEditor = TextureEditor;
})();
