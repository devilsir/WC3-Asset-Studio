(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const displayCanvas = $('#displayCanvas'), cursorCanvas = $('#cursorCanvas');
  const editor = new TextureEditor(displayCanvas, cursorCanvas);
  let currentName = 'texture', draggedLayerId = null, heavyTimer = null, lastAnalysis = null;
  let iconSourceCanvas = null, iconSourceLabel = 'Current document';

  const swatches = ['#000000','#ffffff','#8d9097','#d35c5c','#ec913f','#f0cf55','#70bd77','#3ca9a7','#5597e3','#8f6bd7','#e57cb1','#6d4c35','#b8c7d1','#798b4a','#2c5f9f','#7a2f48','#f4e3ba','#cbaf7b','#5a6674','#23272f'];
  for (const c of swatches) { const b=document.createElement('button'); b.className='swatch'; b.style.background=c; b.title=c; b.addEventListener('click',()=>setColor(c)); $('#colorSwatches').appendChild(b); }

  function safeName(name) { return (name || 'texture').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_\-]+/gi, '_') || 'texture'; }
  let lastLoggedStatus='';
  function setStatus(t) { $('#statusText').textContent=t; if(t&&t!==lastLoggedStatus){lastLoggedStatus=t;window.WC3_LOG?.info?.('Status',t);} }
  function showBusy(t) { $('#busyText').textContent=t||'Processing…'; $('#busyOverlay').classList.remove('hidden'); }
  function hideBusy() { $('#busyOverlay').classList.add('hidden'); }
  function isPOT(n) { return n > 0 && (n & (n - 1)) === 0; }
  function setColor(hex) { if(!/^#[0-9a-f]{6}$/i.test(hex)) return; editor.color=hex.toLowerCase(); $('#colorPicker').value=editor.color; $('#hexColor').value=editor.color.toUpperCase(); }
  function profile() { return $('#wcProfile').value; }
  function assetType() { return $('#assetType').value; }
  function expectedIconSize() { return profile()==='hd' ? 256 : 64; }
  function expectedExt() { const f=$('#iconOutputFormat'); return f&&f.value==='tga' ? 'tga' : 'blp'; }
  const ICON_VARIANTS = ['BTN','DISBTN','PASBTN','DISPASBTN','ATC','DISATC'];

  editor.onCursor = p => { $('#cursorStatus').textContent=`X ${Math.floor(p.x)}  Y ${Math.floor(p.y)}`; };
  editor.onChange = updateUI;
  editor.onLayersChange = renderLayers;
  editor.onStatus = setStatus;

  function updateUI() {
    $('#zoomLabel').textContent=Math.round(editor.zoom*100)+'%'; $('#docStatus').textContent=`${editor.width} × ${editor.height}`;
    $('#brushSizeValue').textContent=`${editor.brushSize} px`; $('#brushHardnessValue').textContent=`${Math.round(editor.brushHardness*100)}%`; $('#brushOpacityValue').textContent=`${Math.round(editor.brushOpacity*100)}%`;
    $('#brushSpacingValue').textContent=`${Math.round(editor.brushSpacing || 18)}%`; $('#brushTip').value=editor.brushTip || 'soft';
    $('#bucketToleranceValue').textContent=editor.bucketTolerance; $('#alphaValueLabel').textContent=editor.alphaValue;
    refreshUndoUi();
    const l=editor.activeLayer; if(l){ $('#layerOpacity').value=Math.round(l.opacity*100); $('#blendMode').value=l.blend; }
    setColor(editor.color); scheduleHeavy();
  }

  function refreshUndoUi(){
    const model=document.body.dataset.module==='model'&&window.WC3_MODEL_LAB?.historyState;
    const h=model?window.WC3_MODEL_LAB.historyState():{undo:editor.history.length,redo:editor.redoStack.length,max:editor.maxHistory};
    const undo=$('#undoBtn'),redo=$('#redoBtn');if(undo){undo.disabled=!h.undo;undo.title=`Undo (Ctrl+Z) · ${h.undo||0}/${h.max||25}`;}if(redo){redo.disabled=!h.redo;redo.title=`Redo (Ctrl+Y) · ${h.redo||0}`;}
  }
  async function performUndo(){
    if(document.body.dataset.module==='model'&&window.WC3_MODEL_LAB?.undoPaint){const ok=await window.WC3_MODEL_LAB.undoPaint();refreshUndoUi();return ok;}
    const before=editor.history.length;editor.undo();window.WC3_LOG?.info?.('History','Texture undo',{before,after:editor.history.length,redo:editor.redoStack.length});refreshUndoUi();return before!==editor.history.length;
  }
  async function performRedo(){
    if(document.body.dataset.module==='model'&&window.WC3_MODEL_LAB?.redoPaint){const ok=await window.WC3_MODEL_LAB.redoPaint();refreshUndoUi();return ok;}
    const before=editor.redoStack.length;editor.redo();window.WC3_LOG?.info?.('History','Texture redo',{undo:editor.history.length,beforeRedo:before,afterRedo:editor.redoStack.length});refreshUndoUi();return before!==editor.redoStack.length;
  }

  function scheduleHeavy() { clearTimeout(heavyTimer); heavyTimer=setTimeout(()=>{ updatePreviews(); updateCompatibility(); },80); }

  function updatePreviews() {
    const source=editor.getCompositeCanvas();
    const p256=$('#preview256'), pctx=p256.getContext('2d'); pctx.clearRect(0,0,p256.width,p256.height); pctx.drawImage(source,0,0,p256.width,p256.height);
    for(const size of [64,32,16]){const c=$('#preview'+size),ctx=c.getContext('2d');ctx.clearRect(0,0,size,size);ctx.drawImage(source,0,0,size,size);}
    const tile=$('#tilePreview'),t=tile.getContext('2d');t.clearRect(0,0,tile.width,tile.height);const cell=60;for(let y=0;y<1;y++)for(let x=0;x<3;x++)t.drawImage(source,x*cell,y*cell,cell,cell);
  }

  function analyze() { lastAnalysis=editor.analyze(); return lastAnalysis; }

  function updateCompatibility() {
    const a=analyze(), list=$('#compatList'); list.innerHTML=''; const issues=[];
    const add=(kind,text)=>issues.push({kind,text});
    const pot=isPOT(editor.width)&&isPOT(editor.height);
    if(pot) add('ok','Power-of-two dimensions.'); else add('bad','Use power-of-two dimensions for Warcraft Safe export.');
    if(assetType()==='icon'){
      const sz=expectedIconSize(); if(editor.width===sz&&editor.height===sz)add('ok',`Icon is at the correct size: ${sz}×${sz}.`);else add('bad',`${profile()==='hd'?'HD':'SD'} icon must be ${sz}×${sz}.`);
    }
    add('ok','Export available as BLP1 or 32-bit TGA.');
    if(a.partial)add('ok','Smooth transparency detected: BLP 8-bit alpha or 32-bit TGA will preserve alpha.');
    else if(a.hasAlpha)add('ok','Binary transparency detected: BLP 1-bit or 32-bit TGA will work.');
    else add('ok','Opaque image: BLP 0-bit alpha or 32-bit TGA.');
    if(assetType()==='texture')add('ok','BLP can generate full mipmaps for model textures.');
    for(const it of issues){const d=document.createElement('div');d.className='compat-item '+it.kind;d.textContent=it.text;list.appendChild(d);}
    const bad=issues.some(i=>i.kind==='bad'), warn=issues.some(i=>i.kind==='warn'); const score=$('#compatScore');score.textContent=bad?'FIX':warn?'WARNING':'OK';score.className=bad?'bad':warn?'warn':'ok';
    $('#alphaStatus').textContent=a.hasAlpha?`Alpha · ${((a.transparent+a.partial)/a.pixels*100).toFixed(1)}% non-opaque`:'Alpha · opaque';
    updateProfileUI(); updateIconPath();
  }

  function updateProfileUI(){
    const hd=profile()==='hd';
    $('#profileHint').textContent=hd?'256×256 icon profile. Output can be BLP or TGA.':'64×64 icon profile. Output can be BLP or TGA.';
    $('#iconPanel').classList.remove('hidden');
  }

  function iconFolder(variant){
    if(variant==='PASBTN') return 'ReplaceableTextures\\PassiveButtons\\';
    if(variant.startsWith('DIS')) return 'ReplaceableTextures\\CommandButtonsDisabled\\';
    return 'ReplaceableTextures\\CommandButtons\\';
  }
  function iconPathForVariant(variant, baseName){
    const base=safeName(baseName||$('#iconBaseName').value||'CustomIcon');
    return iconFolder(variant)+variant+base+'.'+expectedExt();
  }
  function iconPath(){ return iconPathForVariant($('#iconVariant').value); }
  function updateIconPath(){ if($('#iconPath')) $('#iconPath').textContent=iconPath(); }
  function selectedIconVariants(){ return $$('.icon-set-check:checked').map(el=>el.value).filter(v=>ICON_VARIANTS.includes(v)); }
  function setIconSelection(mode){
    const all=$$('.icon-set-check');
    all.forEach(box=>{ box.checked = mode==='all' ? true : mode==='core' ? ['BTN','DISBTN'].includes(box.value) : false; });
  }
  function createCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
  function fillRing(ctx, outer, inner, fill){
    ctx.save(); ctx.beginPath(); ctx.rect(0,0,outer,outer); ctx.rect(inner,inner,outer-inner*2,outer-inner*2); ctx.fillStyle=fill; ctx.fill('evenodd'); ctx.restore();
  }
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function hexRgb(hex){
    const m=String(hex||'').trim().match(/^#?([0-9a-f]{6})$/i); if(!m)return {r:128,g:136,b:146};
    const n=parseInt(m[1],16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};
  }
  function mixRgb(a,b,t){return {r:Math.round(a.r+(b.r-a.r)*t),g:Math.round(a.g+(b.g-a.g)*t),b:Math.round(a.b+(b.b-a.b)*t)};}
  function rgba(c,a=1){return `rgba(${clamp(c.r,0,255)},${clamp(c.g,0,255)},${clamp(c.b,0,255)},${clamp(a,0,1)})`;}
  function framePalette(hex){
    const b=hexRgb(hex),white={r:255,g:255,b:255},black={r:0,g:0,b:0};
    return {base:b,hi:mixRgb(b,white,.58),lite:mixRgb(b,white,.28),mid:mixRgb(b,black,.08),dark:mixRgb(b,black,.48),deep:mixRgb(b,black,.72)};
  }
  function linearFrameGradient(ctx,size,p){const g=ctx.createLinearGradient(0,0,0,size);g.addColorStop(0,rgba(p.hi));g.addColorStop(.18,rgba(p.lite));g.addColorStop(.55,rgba(p.mid));g.addColorStop(1,rgba(p.deep));return g;}
  function strokeInset(ctx,size,inset,width,color){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,width);ctx.strokeRect(inset,inset,size-inset*2,size-inset*2);ctx.restore();}
  function drawCornerTicks(ctx,size,color,dark,scale=1){
    const o=Math.max(1,size*.012),len=size*.13*scale,w=Math.max(1,size*.014*scale);
    ctx.save();ctx.lineCap='square';ctx.lineJoin='miter';
    const paths=[[[o,o+len],[o,o],[o+len,o]],[[size-o-len,o],[size-o,o],[size-o,o+len]],[[size-o,size-o-len],[size-o,size-o],[size-o-len,size-o]],[[o+len,size-o],[o,size-o],[o,size-o-len]]];
    for(const pts of paths){ctx.beginPath();ctx.moveTo(...pts[0]);ctx.lineTo(...pts[1]);ctx.lineTo(...pts[2]);ctx.strokeStyle=dark;ctx.lineWidth=w*2.2;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=w;ctx.stroke();}
    ctx.restore();
  }
  function drawNormalFrame(ctx,size,style,color){
    const p=framePalette(color),outer=Math.max(1,size*.008);
    if(style==='thin'){
      const inner=size*.045;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));strokeInset(ctx,size,outer,size*.012,rgba(p.deep,.95));strokeInset(ctx,size,inner-size*.004,size*.007,rgba(p.hi,.5));return;
    }
    if(style==='heavy'){
      const inner=size*.102;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));
      ctx.fillStyle=rgba(p.hi,.35);ctx.fillRect(size*.018,size*.018,size*.964,size*.025);ctx.fillRect(size*.018,size*.018,size*.025,size*.964);
      ctx.fillStyle=rgba(p.deep,.52);ctx.fillRect(size*.018,size*.957,size*.964,size*.025);ctx.fillRect(size*.957,size*.018,size*.025,size*.964);
      strokeInset(ctx,size,inner-size*.008,size*.012,rgba(p.lite,.55));strokeInset(ctx,size,outer,size*.014,'rgba(0,0,0,.82)');return;
    }
    if(style==='double'){
      const inner=size*.075;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));strokeInset(ctx,size,size*.012,size*.012,rgba(p.deep,.9));strokeInset(ctx,size,size*.038,size*.009,rgba(p.hi,.48));strokeInset(ctx,size,inner-size*.004,size*.008,rgba(p.deep,.9));return;
    }
    if(style==='corner'){
      const inner=size*.068;fillRing(ctx,size,inner,rgba(p.dark,.92));strokeInset(ctx,size,size*.012,size*.012,rgba(p.deep,.95));strokeInset(ctx,size,inner-size*.006,size*.008,rgba(p.lite,.45));drawCornerTicks(ctx,size,rgba(p.hi,.95),rgba(p.deep,.9),1.05);return;
    }
    if(style==='minimal'){
      const inner=size*.029;fillRing(ctx,size,inner,rgba(p.dark,.96));strokeInset(ctx,size,size*.008,size*.009,rgba(p.hi,.44));strokeInset(ctx,size,inner-size*.003,size*.006,rgba(p.deep,.95));return;
    }
    const inner=size*.078;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));
    strokeInset(ctx,size,size*.009,size*.012,'rgba(0,0,0,.8)');strokeInset(ctx,size,size*.026,size*.008,rgba(p.hi,.35));strokeInset(ctx,size,inner-size*.006,size*.008,rgba(p.deep,.88));
    ctx.fillStyle=rgba(p.hi,.22);ctx.fillRect(size*.028,size*.028,size*.944,size*.015);ctx.fillRect(size*.028,size*.028,size*.015,size*.944);
  }
  function drawPassiveFrame(ctx,size,style,color){
    const p=framePalette(color);
    if(style==='rune'){
      const inner=size*.05;fillRing(ctx,size,inner,rgba(p.dark,.96));strokeInset(ctx,size,size*.012,size*.012,rgba(p.deep,.95));strokeInset(ctx,size,inner-size*.004,size*.006,rgba(p.hi,.38));
      ctx.save();ctx.strokeStyle=rgba(p.lite,.78);ctx.lineWidth=Math.max(1,size*.012);const m=size*.12,l=size*.09;for(let i=0;i<4;i++){ctx.beginPath();if(i===0){ctx.moveTo(m,size*.018);ctx.lineTo(m+l,size*.018);}if(i===1){ctx.moveTo(size*.982,m);ctx.lineTo(size*.982,m+l);}if(i===2){ctx.moveTo(size-m,size*.982);ctx.lineTo(size-m-l,size*.982);}if(i===3){ctx.moveTo(size*.018,size-m);ctx.lineTo(size*.018,size-m-l);}ctx.stroke();}ctx.restore();return;
    }
    if(style==='etched'){
      const inner=size*.038;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));strokeInset(ctx,size,size*.007,size*.009,rgba(p.deep,.95));strokeInset(ctx,size,inner-size*.004,size*.005,rgba(p.hi,.48));strokeInset(ctx,size,inner+size*.014,size*.004,rgba(p.deep,.58));return;
    }
    if(style==='heavy'){
      const inner=size*.068;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));strokeInset(ctx,size,size*.01,size*.012,rgba(p.deep,.95));strokeInset(ctx,size,inner-size*.008,size*.01,rgba(p.hi,.42));return;
    }
    if(style==='minimal'){
      const inner=size*.024;fillRing(ctx,size,inner,rgba(p.deep,.96));strokeInset(ctx,size,size*.006,size*.007,rgba(p.lite,.48));return;
    }
    const inner=size*.044;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));strokeInset(ctx,size,size*.008,size*.01,rgba(p.deep,.92));strokeInset(ctx,size,inner-size*.004,size*.006,rgba(p.hi,.38));
  }
  function autocastCornerPath(ctx,size,corner,len,inset){
    const x0=inset,y0=inset,x1=size-inset,y1=size-inset;
    ctx.beginPath();
    if(corner===0){ctx.moveTo(x0,y0+len);ctx.lineTo(x0,y0);ctx.lineTo(x0+len,y0);}
    if(corner===1){ctx.moveTo(x1-len,y0);ctx.lineTo(x1,y0);ctx.lineTo(x1,y0+len);}
    if(corner===2){ctx.moveTo(x1,y1-len);ctx.lineTo(x1,y1);ctx.lineTo(x1-len,y1);}
    if(corner===3){ctx.moveTo(x0+len,y1);ctx.lineTo(x0,y1);ctx.lineTo(x0,y1-len);}
  }
  function drawAutocastArrows(ctx,size,disabled,accent,insetFrac=.055){
    const a=framePalette(accent),s=Math.max(6,size*.085),inset=size*insetFrac;
    const fill=disabled?'rgba(138,149,160,.6)':rgba(a.hi,.96),stroke=disabled?'rgba(40,48,59,.85)':rgba(a.deep,.95),glow=disabled?0:Math.max(3,size*.018);
    function arrow(points){ctx.save();ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.shadowBlur=glow;ctx.shadowColor=fill;ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=Math.max(1,size*.008);ctx.fill();ctx.stroke();ctx.restore();}
    arrow([[size/2,inset],[size/2-s*.45,inset+s*.55],[size/2+s*.45,inset+s*.55]]);arrow([[size-inset,size/2],[size-inset-s*.55,size/2-s*.45],[size-inset-s*.55,size/2+s*.45]]);arrow([[size/2,size-inset],[size/2-s*.45,size-inset-s*.55],[size/2+s*.45,size-inset-s*.55]]);arrow([[inset,size/2],[inset+s*.55,size/2-s*.45],[inset+s*.55,size/2+s*.45]]);
  }
  function drawAutocastFrame(ctx,size,style,frameColor,accentColor,disabled){
    const f=framePalette(frameColor),a=framePalette(accentColor),thin=size*.018;
    fillRing(ctx,size,size*.024,rgba(f.deep,.88));strokeInset(ctx,size,size*.006,size*.008,rgba(f.hi,.25));
    const accent=disabled?rgba(f.lite,.55):rgba(a.hi,.98),dark=disabled?rgba(f.deep,.9):rgba(a.deep,.96);
    if(style==='arrows'){drawAutocastArrows(ctx,size,disabled,accentColor,.048);return;}
    if(style==='full'){
      strokeInset(ctx,size,size*.018,size*.027,dark);strokeInset(ctx,size,size*.018,size*.014,accent);drawCornerTicks(ctx,size,accent,dark,.72);return;
    }
    if(style==='chevrons'){
      ctx.save();ctx.fillStyle=accent;ctx.strokeStyle=dark;ctx.lineWidth=Math.max(1,size*.009);const m=size*.018,l=size*.17,w=size*.055;
      const polys=[[[m,m],[m+l,m],[m+l-w,m+w],[m+w,m+w],[m+w,m+l-w],[m,m+l]],[[size-m,m],[size-m-l,m],[size-m-l+w,m+w],[size-m-w,m+w],[size-m-w,m+l-w],[size-m,m+l]],[[size-m,size-m],[size-m-l,size-m],[size-m-l+w,size-m-w],[size-m-w,size-m-w],[size-m-w,size-m-l+w],[size-m,size-m-l]],[[m,size-m],[m+l,size-m],[m+l-w,size-m-w],[m+w,size-m-w],[m+w,size-m-l+w],[m,size-m-l]]];
      for(const pts of polys){ctx.beginPath();ctx.moveTo(...pts[0]);for(let i=1;i<pts.length;i++)ctx.lineTo(...pts[i]);ctx.closePath();ctx.fill();ctx.stroke();}ctx.restore();return;
    }
    if(style==='minimal'){
      const inset=size*.012,len=size*.105;ctx.save();ctx.lineCap='square';ctx.lineJoin='miter';for(let i=0;i<4;i++){autocastCornerPath(ctx,size,i,len,inset);ctx.strokeStyle=dark;ctx.lineWidth=Math.max(2,size*.028);ctx.stroke();autocastCornerPath(ctx,size,i,len,inset);ctx.strokeStyle=accent;ctx.lineWidth=Math.max(1,size*.012);ctx.stroke();}ctx.restore();return;
    }
    // Classic Warcraft-style corner brackets: decoration hugs the outer edge so artwork reaches the frame.
    const inset=size*.012,len=size*(style==='brackets'?.19:.145),outerW=Math.max(2,size*(style==='brackets'?.052:.045)),innerW=Math.max(1,size*(style==='brackets'?.024:.021));
    ctx.save();ctx.lineCap='square';ctx.lineJoin='miter';ctx.shadowColor=disabled?'transparent':rgba(a.base,.65);ctx.shadowBlur=disabled?0:size*.022;
    for(let i=0;i<4;i++){
      autocastCornerPath(ctx,size,i,len,inset);ctx.strokeStyle=dark;ctx.lineWidth=outerW;ctx.stroke();
      autocastCornerPath(ctx,size,i,len,inset);ctx.strokeStyle=accent;ctx.lineWidth=innerW;ctx.stroke();
    }
    // tiny inward hooks like the stock autocast language, still positioned at the edge.
    if(style!=='brackets'){
      const hook=size*.06,off=size*.055;ctx.shadowBlur=0;ctx.strokeStyle=accent;ctx.lineWidth=Math.max(1,size*.012);
      const seg=[[[off,off+hook],[off,off],[off+hook,off]],[[size-off-hook,off],[size-off,off],[size-off,off+hook]],[[size-off,size-off-hook],[size-off,size-off],[size-off-hook,size-off]],[[off+hook,size-off],[off,size-off],[off,size-off-hook]]];
      for(const pts of seg){ctx.beginPath();ctx.moveTo(...pts[0]);ctx.lineTo(...pts[1]);ctx.lineTo(...pts[2]);ctx.stroke();}
    }
    ctx.restore();
  }
  function applyDisabledEffect(canvas){
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); const img=ctx.getImageData(0,0,canvas.width,canvas.height); const d=img.data;
    for(let i=0;i<d.length;i+=4){ const lum=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114; const shade=Math.max(0,Math.min(255,lum*0.72)); d[i]=shade*0.78; d[i+1]=shade*0.84; d[i+2]=shade*0.78; }
    ctx.putImageData(img,0,0); ctx.fillStyle='rgba(7,10,14,.22)'; ctx.fillRect(0,0,canvas.width,canvas.height);
  }
  const alphaBoundsCache=new WeakMap();
  function alphaBounds(source){
    if(!source || !source.getContext)return {x:0,y:0,w:source.width,h:source.height};
    const cached=alphaBoundsCache.get(source);if(cached)return cached;
    try{
      const c=source.getContext('2d',{willReadFrequently:true}),img=c.getImageData(0,0,source.width,source.height),d=img.data;let minX=source.width,minY=source.height,maxX=-1,maxY=-1;
      for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){if(d[(y*source.width+x)*4+3]>1){if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;}}
      const b=maxX>=minX?{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}:{x:0,y:0,w:source.width,h:source.height};alphaBoundsCache.set(source,b);return b;
    }catch(_){return {x:0,y:0,w:source.width,h:source.height};}
  }
  function drawCover(ctx,source,dx,dy,dw,dh,trimTransparent=false){
    const b=trimTransparent?alphaBounds(source):{x:0,y:0,w:source.width,h:source.height};
    const scale=Math.max(dw/b.w,dh/b.h),rw=b.w*scale,rh=b.h*scale;
    ctx.drawImage(source,b.x,b.y,b.w,b.h,dx+(dw-rw)/2,dy+(dh-rh)/2,rw,rh);
  }
  const ICON_FRAME_PRESETS={
    normal:[['classic','Classic Bevel'],['thin','Thin Metal'],['heavy','Heavy Warcraft'],['double','Double Rim'],['corner','Corner Cut'],['minimal','Minimal']],
    passive:[['classic','Classic Passive'],['rune','Rune Frame'],['etched','Inner Etch'],['heavy','Heavy Passive'],['minimal','Minimal Passive']],
    autocast:[['classic','Classic Corners'],['brackets','Long Edge Brackets'],['chevrons','Corner Chevrons'],['full','Full Gold Rim'],['arrows','Edge Arrows'],['minimal','Minimal Corners']]
  };
  let iconFrameOptions={normalStyle:'classic',passiveStyle:'classic',autocastStyle:'classic',frameColor:'#7f8995',autocastColor:'#f6c84d',artBleed:2,trimTransparent:true};
  function getIconFrameOptions(){return {...iconFrameOptions};}
  function setIconFrameOptions(next={}){
    const clean={...iconFrameOptions};
    if(ICON_FRAME_PRESETS.normal.some(x=>x[0]===next.normalStyle))clean.normalStyle=next.normalStyle;
    if(ICON_FRAME_PRESETS.passive.some(x=>x[0]===next.passiveStyle))clean.passiveStyle=next.passiveStyle;
    if(ICON_FRAME_PRESETS.autocast.some(x=>x[0]===next.autocastStyle))clean.autocastStyle=next.autocastStyle;
    if(/^#[0-9a-f]{6}$/i.test(next.frameColor||''))clean.frameColor=next.frameColor.toLowerCase();
    if(/^#[0-9a-f]{6}$/i.test(next.autocastColor||''))clean.autocastColor=next.autocastColor.toLowerCase();
    if(Number.isFinite(+next.artBleed))clean.artBleed=clamp(+next.artBleed,0,10);
    if(typeof next.trimTransparent==='boolean')clean.trimTransparent=next.trimTransparent;
    iconFrameOptions=clean;return getIconFrameOptions();
  }
  function frameInsetFraction(variant,opts){
    if(variant==='ATC'||variant==='DISATC')return ({classic:.026,brackets:.022,chevrons:.025,full:.036,arrows:.028,minimal:.018})[opts.autocastStyle]||.026;
    if(variant==='PASBTN'||variant==='DISPASBTN')return ({classic:.046,rune:.052,etched:.04,heavy:.07,minimal:.026})[opts.passiveStyle]||.046;
    return ({classic:.08,thin:.047,heavy:.104,double:.078,corner:.07,minimal:.031})[opts.normalStyle]||.08;
  }
  function getIconSourceCanvas(){ return iconSourceCanvas || editor.getCompositeCanvas(); }
  function setIconSourceCanvas(source,label='Button source'){
    if(!source || !source.width || !source.height) return false;
    const copy=createCanvas(source.width,source.height), c=copy.getContext('2d',{willReadFrequently:true});
    c.clearRect(0,0,copy.width,copy.height); c.drawImage(source,0,0);
    iconSourceCanvas=copy; iconSourceLabel=label||'Button source';
    window.dispatchEvent(new CustomEvent('wc3-icon-source-change',{detail:{label:iconSourceLabel,width:copy.width,height:copy.height}}));
    return true;
  }
  function clearIconSourceCanvas(){ iconSourceCanvas=null; iconSourceLabel='Current document'; window.dispatchEvent(new CustomEvent('wc3-icon-source-change',{detail:{label:iconSourceLabel}})); }
  function makeIconCanvas(variant,size){
    const canvas=createCanvas(size,size),ctx=canvas.getContext('2d',{willReadFrequently:true}),source=getIconSourceCanvas(),opts=getIconFrameOptions();
    const baseInset=size*frameInsetFraction(variant,opts),bleed=size*(opts.artBleed/100),artInset=Math.max(0,baseInset-bleed);
    ctx.clearRect(0,0,size,size);
    // Artwork deliberately overlaps the frame by the bleed amount. This removes the transparent seam visible in older builds.
    drawCover(ctx,source,artInset,artInset,size-artInset*2,size-artInset*2,opts.trimTransparent);
    const gloss=ctx.createLinearGradient(0,artInset,0,size*.52);gloss.addColorStop(0,'rgba(255,255,255,.12)');gloss.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gloss;ctx.fillRect(artInset,artInset,size-artInset*2,Math.max(1,size*.25));
    if(variant==='PASBTN'||variant==='DISPASBTN')drawPassiveFrame(ctx,size,opts.passiveStyle,opts.frameColor);
    else if(variant==='ATC'||variant==='DISATC')drawAutocastFrame(ctx,size,opts.autocastStyle,opts.frameColor,opts.autocastColor,variant==='DISATC');
    else drawNormalFrame(ctx,size,opts.normalStyle,opts.frameColor);
    if(variant.startsWith('DIS'))applyDisabledEffect(canvas);
    return canvas;
  }
  function analyzeImageDataLocal(imageData){
    const d=imageData.data; let hasAlpha=false, partial=false, transparent=0;
    for(let i=3;i<d.length;i+=4){ const a=d[i]; if(a<255){ hasAlpha=true; if(a===0) transparent++; else partial=true; } }
    return {hasAlpha,partial,transparent};
  }
  async function encodeWarcraftIcon(imageData){
    const out=$('#iconOutputFormat')&&$('#iconOutputFormat').value==='tga'?'tga':'blp';
    if(out==='tga') return {blob:TGA.encode(imageData),ext:'tga',format:'TGA 32-bit'};
    const info=analyzeImageDataLocal(imageData);
    const alphaBits=info.partial?8:info.hasAlpha?1:0;
    const blob=BLP.encodePaletted(imageData,{mipmaps:true,dither:false,alphaBits});
    return {blob,ext:'blp',format:'BLP1 A'+alphaBits};
  }
  async function generateIconSet(){
    const variants=selectedIconVariants();
    if(!variants.length){ alert('Select at least one button type to generate.'); return; }
    if(typeof SimpleZip==='undefined'){ alert('The ZIP module did not load correctly.'); return; }
    const size=expectedIconSize(), base=safeName($('#iconBaseName').value||currentName||'CustomIcon');
    showBusy('Generating icon set…'); await new Promise(r=>setTimeout(r,20));
    try{
      const files=[], lines=[]; const profileLabel=profile()==='hd'?'256×256 icon':'64×64 icon';
      lines.push('BLP Paint Reforged — Import Paths');
      lines.push('Profile: '+profileLabel);
      lines.push('Size: '+size+'x'+size);
      lines.push('');
      for(const variant of variants){
        const canvas=makeIconCanvas(variant,size), imageData=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,size,size);
        const encoded=await encodeWarcraftIcon(imageData), path=iconPathForVariant(variant,base);
        files.push({name:path,data:new Uint8Array(await encoded.blob.arrayBuffer())});
        lines.push(path+'  ['+encoded.format+']');
      }
      files.push({name:'_import_paths.txt',data:lines.join('\n')});
      const zip=SimpleZip.create(files), suffix=(profile()==='hd'?'256':'64')+'_'+expectedExt();
      downloadBlob(zip,base+'_icon_set_'+suffix+'.zip');
      setStatus(variants.length+' icons generated in ZIP package');
    }catch(e){ console.error(e); alert('Failed to generate icon set.\n\n'+e.message); }
    finally{ hideBusy(); }
  }

  function labelBlend(v){return({'source-over':'Normal','multiply':'Multiply','screen':'Screen','overlay':'Overlay','lighter':'Add','darken':'Darken','lighten':'Lighten'})[v]||v;}
  function renderLayers(){
    const list=$('#layersList');list.innerHTML='';
    editor.layers.map((l,i)=>({l,i})).reverse().forEach(({l})=>{
      const row=document.createElement('div');row.className='layer-item'+(l.id===editor.activeLayerId?' active':'');row.draggable=true;row.dataset.id=l.id;
      row.innerHTML=`<button class="eye" title="Visibility">${l.visible?'◉':'○'}</button><canvas class="thumb" width="35" height="35"></canvas><div class="layer-name"><strong></strong><small>${Math.round(l.opacity*100)}% · ${labelBlend(l.blend)}</small></div><button class="lock" title="Lock">${l.locked?'▣':'□'}</button>`;
      row.querySelector('strong').textContent=l.name; const ctx=row.querySelector('.thumb').getContext('2d');ctx.clearRect(0,0,35,35);ctx.drawImage(l.canvas,0,0,35,35);
      row.addEventListener('click',e=>{if(!e.target.closest('button'))editor.setActiveLayer(l.id);});
      row.querySelector('.eye').addEventListener('click',e=>{e.stopPropagation();editor.pushHistory('Visibility');l.visible=!l.visible;editor.render();editor.layersChanged();});
      row.querySelector('.lock').addEventListener('click',e=>{e.stopPropagation();l.locked=!l.locked;editor.layersChanged();});
      row.addEventListener('dblclick',e=>{if(e.target.closest('button'))return;const n=prompt('Layer name:',l.name);if(n&&n.trim()){editor.pushHistory('Rename layer');l.name=n.trim();editor.layersChanged();}});
      row.addEventListener('dragstart',()=>draggedLayerId=l.id);row.addEventListener('dragover',e=>e.preventDefault());row.addEventListener('drop',e=>{e.preventDefault();const from=editor.layers.findIndex(x=>x.id===draggedLayerId),to=editor.layers.findIndex(x=>x.id===l.id);editor.moveLayer(from,to);draggedLayerId=null;});list.appendChild(row);
    });
    updateUI();
  }

  async function fileToImageData(file){
    const low=file.name.toLowerCase();
    if(low.endsWith('.blp')){const d=await BLP.decode(await file.arrayBuffer());$('#formatStatus').textContent=`BLP1 · ${d.meta.encoding} · A${d.meta.alphaBits}`;return d;}
    if(low.endsWith('.tga')){const d=TGA.decode(await file.arrayBuffer());$('#formatStatus').textContent=d.meta.encoding;return d;}
    if(low.endsWith('.dds')){const d=DDS.decode(await file.arrayBuffer());$('#formatStatus').textContent=`${d.meta.encoding} · ${d.meta.mipCount} mip`;return d;}
    const bitmap=await createImageBitmap(file),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);const out={width:c.width,height:c.height,imageData:ctx.getImageData(0,0,c.width,c.height),meta:{encoding:file.type||'Image'}};if(bitmap.close)bitmap.close();$('#formatStatus').textContent=(file.type||'Image').replace('image/','').toUpperCase();return out;
  }

  async function openFile(file){
    if(!file)return;showBusy('Opening '+file.name+'…');
    try{if(file.name.toLowerCase().endsWith('.blpproj'))await loadProject(file);else{const d=await fileToImageData(file);currentName=safeName(file.name);await editor.loadImageData(d.imageData,currentName);setStatus(`Opened: ${file.name}`);requestAnimationFrame(()=>editor.fitTo($('#canvasStage')));}}
    catch(e){console.error(e);alert('Could not open the file.\n\n'+e.message);setStatus('Error opening file');}finally{hideBusy();}
  }
  async function quickConvertFile(file){
    if(!file)return;
    showBusy('Loading file for conversion…');
    try{
      const d=await fileToImageData(file);
      currentName=safeName(file.name);
      await editor.loadImageData(d.imageData,currentName);
      setStatus(`Loaded for conversion: ${file.name}`);
      requestAnimationFrame(()=>editor.fitTo($('#canvasStage')));
      openExportDialog('blp');
    }catch(e){console.error(e);alert('Failed to load file for conversion.\n\n'+e.message);setStatus('Conversion load failed');}finally{hideBusy();}
  }

  async function importLayer(file){if(!file)return;showBusy('Importing layer…');try{const d=await fileToImageData(file);await editor.importImageData(d.imageData,safeName(file.name));setStatus('Layer imported');}catch(e){alert('Failed to import layer.\n\n'+e.message);}finally{hideBusy();}}

  function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  async function exportPNG(){const canvas=editor.getCompositeCanvas(),blob=await new Promise(r=>canvas.toBlob(r,'image/png'));downloadBlob(blob,currentName+'.png');setStatus('PNG exported');}
  async function exportBLPDirect(){
    showBusy('Generating BLP…'); await new Promise(r=>setTimeout(r,20));
    try{
      const img=editor.getCompositeImageData(),a=analyzeImageDataLocal(img),alphaBits=a.partial?8:a.hasAlpha?1:0;
      const blob=BLP.encodePaletted(img,{mipmaps:true,dither:false,alphaBits});
      const chk=BLP.inspect(await blob.arrayBuffer()); if(!chk||chk.magic!=='BLP1') throw new Error('BLP validation failed.');
      downloadBlob(blob,currentName+'.blp'); setStatus(`BLP exported · A${alphaBits} · ${(blob.size/1024).toFixed(1)} KB` );
    }catch(e){console.error(e);alert('Failed to export BLP.\n\n'+e.message);}finally{hideBusy();}
  }
  async function exportTGADirect(){
    showBusy('Generating 32-bit TGA…'); await new Promise(r=>setTimeout(r,20));
    try{
      const blob=TGA.encode(editor.getCompositeImageData()); const chk=TGA.inspect(await blob.arrayBuffer());
      if(!chk||chk.width!==editor.width||chk.height!==editor.height||chk.bpp!==32) throw new Error('TGA validation failed.');
      downloadBlob(blob,currentName+'.tga'); setStatus(`32-bit TGA exported · ${(blob.size/1024).toFixed(1)} KB`);
    }catch(e){console.error(e);alert('Failed to export TGA.\n\n'+e.message);}finally{hideBusy();}
  }

  function exportWarnings(){
    const a=lastAnalysis||analyze(),warnings=[],format=$('#gameExportFormat').value,icon=assetType()==='icon';
    if(icon){const sz=expectedIconSize();if(editor.width!==sz||editor.height!==sz)warnings.push({bad:true,text:`This profile requires an icon size of ${sz}×${sz}.`});}
    if(format==='blp'){
      if(!isPOT(editor.width)||!isPOT(editor.height))warnings.push({bad:true,text:'For Warcraft Safe BLP, use power-of-two dimensions.'});
      const bits=+$('#blpAlphaBits').value;
      if(a.hasAlpha&&bits===0)warnings.push({bad:true,text:'The image has transparency, but BLP is set to 0-bit alpha.'});
      if(a.partial&&bits<4)warnings.push({bad:false,text:'Smooth alpha detected; use 4-bit or 8-bit to avoid harsh cutouts.'});
      if(assetType()==='texture'&&!$('#generateMipmaps').checked)warnings.push({bad:true,text:'For model textures in BLP, keep mipmaps enabled.'});
    }else{
      warnings.push({ok:true,text:'32-bit TGA preserves full RGBA. TGA does not contain built-in mipmaps.'});
    }
    if(!warnings.length)warnings.push({ok:true,text:'Configuration is ready for export.'});
    return warnings;
  }

  function updateExportFormatUI(){
    const format=$('#gameExportFormat').value, a=lastAnalysis||analyze();
    $('#exportFormat').textContent=format==='blp'?'BLP1':'32-bit TGA';
    $('#blpOptions').classList.toggle('hidden',format!=='blp');
    $('#mipmapOption').classList.toggle('hidden',format!=='blp');
    $('#tgaInfo').classList.toggle('hidden',format!=='tga');
    $('#exportSubtitle').textContent=format==='blp'?'BLP1 with configurable alpha and mipmaps.':'Uncompressed 32-bit TGA with full alpha.';
    if(format==='blp')$('#blpAlphaBits').value=a.partial?'8':a.hasAlpha?'1':'0';
    refreshExportWarnings();
  }
  function openExportDialog(preferred){
    const a=analyze();
    $('#gameExportFormat').value=preferred||'blp';
    $('#exportDimensions').textContent=`${editor.width} × ${editor.height}`;
    $('#exportAlphaInfo').textContent=a.hasAlpha?(a.partial?'Smooth':'Binary'):'Opaque';
    $('#exportAssetType').textContent=assetType()==='icon'?'Icon':assetType()==='texture'?'Texture':'UI / image';
    $('#generateMipmaps').checked=true;
    updateExportFormatUI(); $('#exportDialog').showModal();
  }
  function refreshExportWarnings(){const box=$('#exportWarnings');box.innerHTML='';const w=exportWarnings();for(const x of w){const d=document.createElement('div');d.className='warning '+(x.bad?'bad':x.ok?'ok':'');d.textContent=x.text;box.appendChild(d);}$('#confirmExportBtn').disabled=w.some(x=>x.bad);}

  async function exportGame(){
    const format=$('#gameExportFormat').value;
    showBusy(format==='blp'?'Generating BLP and mipmaps…':'Generating 32-bit TGA…'); await new Promise(r=>setTimeout(r,20));
    try{
      const img=editor.getCompositeImageData(); let blob,filename;
      if(format==='blp'){
        blob=BLP.encodePaletted(img,{mipmaps:$('#generateMipmaps').checked,dither:$('#exportDither').checked,alphaBits:+$('#blpAlphaBits').value});
        const chk=BLP.inspect(await blob.arrayBuffer()); if(!chk||chk.magic!=='BLP1'||chk.width!==editor.width||chk.height!==editor.height)throw new Error('BLP validation failed.');
        filename=currentName+'.blp';
      }else{
        blob=TGA.encode(img); const chk=TGA.inspect(await blob.arrayBuffer()); if(!chk||chk.width!==editor.width||chk.height!==editor.height||chk.bpp!==32)throw new Error('TGA validation failed.');
        filename=currentName+'.tga';
      }
      downloadBlob(blob,filename); setStatus(`${filename} exportado · ${(blob.size/1024).toFixed(1)} KB`);
    }catch(e){console.error(e);alert('Warcraft export failed.\n\n'+e.message);}finally{hideBusy();}
  }

  function dataURLFromCanvas(c){return c.toDataURL('image/png');}
  async function saveProject(){showBusy('Saving layered project…');try{const payload={format:'BLPPaintProject',version:2,width:editor.width,height:editor.height,activeLayerId:editor.activeLayerId,warcraftProfile:profile(),assetType:assetType(),layers:editor.layers.map(l=>({id:l.id,name:l.name,visible:l.visible,locked:l.locked,opacity:l.opacity,blend:l.blend,offsetX:l.offsetX,offsetY:l.offsetY,png:dataURLFromCanvas(l.canvas)}))};downloadBlob(new Blob([JSON.stringify(payload)],{type:'application/json'}),currentName+'.blpproj');setStatus('Project saved');}finally{hideBusy();}}
  async function saveCurrentWorkspace(){const module=document.body.dataset.module||'texture';if(module==='model'&&window.WC3_MODEL_LAB?.save){return window.WC3_MODEL_LAB.save();}return saveProject();}
  async function imageFromDataURL(url){const res=await fetch(url),blob=await res.blob();return createImageBitmap(blob);}
  async function loadProject(file){const p=JSON.parse(await file.text());if(p.format!=='BLPPaintProject'||!Array.isArray(p.layers))throw new Error('Invalid BLP Paint project.');editor.newDocument(p.width,p.height,'transparent',false);editor.layers=[];for(const s of p.layers){const l=editor.makeLayer(s.name);l.id=s.id;l.visible=s.visible;l.locked=s.locked;l.opacity=s.opacity;l.blend=s.blend||'source-over';l.offsetX=s.offsetX||0;l.offsetY=s.offsetY||0;const bm=await imageFromDataURL(s.png);l.ctx.drawImage(bm,0,0);if(bm.close)bm.close();editor.layers.push(l);}editor.activeLayerId=p.activeLayerId||editor.layers[editor.layers.length-1].id;editor.history=[];editor.redoStack=[];editor.pushHistory('Open project');editor.render(true);editor.layersChanged();if(p.warcraftProfile)$('#wcProfile').value=p.warcraftProfile;if(p.assetType)$('#assetType').value=p.assetType;currentName=safeName(file.name);$('#formatStatus').textContent='BLP PROJECT';setStatus('Project opened');}

  function syncToolOptions(tool){
    const brushlike = ['brush','eraser','clone','smudge','blur'].includes(tool);
    $$('[data-opt="brushlike"]').forEach(x=>x.classList.toggle('hidden-option',!brushlike));
    $$('[data-opt="bucket"]').forEach(x=>x.classList.toggle('hidden-option',tool!=='bucket'));
    $('#shapeFillWrap').classList.toggle('hidden-option',!['rect','ellipse'].includes(tool));
    $('#alphaValueWrap').classList.toggle('hidden-option',!editor.alphaOnly);
  }
  $$('.tool[data-tool]').forEach(btn=>btn.addEventListener('click',()=>{$$('.tool[data-tool]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');editor.setTool(btn.dataset.tool);$('#toolName').textContent=btn.querySelector('small').textContent;syncToolOptions(btn.dataset.tool);}));

  $('#brushSize').addEventListener('input',e=>{editor.brushSize=+e.target.value;updateUI();});
  $('#brushHardness').addEventListener('input',e=>{editor.brushHardness=+e.target.value/100;updateUI();});
  $('#brushOpacity').addEventListener('input',e=>{editor.brushOpacity=+e.target.value/100;updateUI();});
  $('#brushTip').addEventListener('change',e=>{editor.brushTip=e.target.value;updateUI();});
  $('#brushSpacing').addEventListener('input',e=>{editor.brushSpacing=+e.target.value;updateUI();});
  $('#bucketTolerance').addEventListener('input',e=>{editor.bucketTolerance=+e.target.value;updateUI();});
  $('#preserveAlpha').addEventListener('change',e=>{editor.preserveAlpha=e.target.checked;if(e.target.checked&&editor.alphaOnly){editor.alphaOnly=false;$('#alphaOnly').checked=false;}syncToolOptions(editor.tool);});
  $('#alphaOnly').addEventListener('change',e=>{editor.alphaOnly=e.target.checked;if(e.target.checked){editor.preserveAlpha=false;$('#preserveAlpha').checked=false;}/* Alpha-only is an edit constraint, not a preview mode. Keep the user's RGBA/RGB/Alpha preview unchanged so toggling it can never turn the texture white or leave the viewer stuck in alpha preview. */editor.render(true);syncToolOptions(editor.tool);});
  $('#alphaValue').addEventListener('input',e=>{editor.alphaValue=+e.target.value;updateUI();});
  $('#wrapPaint').addEventListener('change',e=>editor.wrapPaint=e.target.checked);$('#shapeFill').addEventListener('change',e=>editor.shapeFill=e.target.checked);
  $('#colorPicker').addEventListener('input',e=>setColor(e.target.value));$('#hexColor').addEventListener('change',e=>setColor(e.target.value));
  $('#zoomInBtn').addEventListener('click',()=>editor.setZoom(editor.zoom*1.25));$('#zoomOutBtn').addEventListener('click',()=>editor.setZoom(editor.zoom/1.25));$('#fitBtn').addEventListener('click',()=>editor.fitTo($('#canvasStage')));
  $('#flipHBtn').addEventListener('click',()=>editor.transformActive('flipH'));$('#flipVBtn').addEventListener('click',()=>editor.transformActive('flipV'));$('#rotateLayerBtn').addEventListener('click',()=>editor.transformActive('rotate90'));$('#rotateDocBtn').addEventListener('click',()=>editor.rotateDocument90());
  $('#undoBtn').addEventListener('click',()=>{performUndo();});$('#redoBtn').addEventListener('click',()=>{performRedo();});
  $('#addLayerBtn').addEventListener('click',()=>editor.addLayer());$('#deleteLayerBtn').addEventListener('click',()=>editor.deleteActiveLayer());$('#duplicateLayerBtn').addEventListener('click',()=>editor.duplicateActiveLayer());$('#mergeDownBtn').addEventListener('click',()=>editor.mergeDown());$('#flattenBtn').addEventListener('click',()=>editor.flattenVisible());
  $('#layerOpacity').addEventListener('input',e=>editor.setLayerOpacity(+e.target.value/100));$('#blendMode').addEventListener('change',e=>{editor.pushHistory('Blend mode');editor.setLayerBlend(e.target.value);});

  $('#previewModes').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('#previewModes button').forEach(x=>x.classList.remove('active'));b.classList.add('active');editor.setPreviewMode(b.dataset.preview);});
  $('#wcProfile').addEventListener('change',()=>{updateCompatibility();});$('#assetType').addEventListener('change',()=>{updateCompatibility();});$('#iconVariant').addEventListener('change',updateIconPath);$('#iconBaseName').addEventListener('input',updateIconPath);$('#iconOutputFormat').addEventListener('change',updateIconPath);
  $('#copyPathBtn').addEventListener('click',async()=>{const text=iconPath();try{await navigator.clipboard.writeText(text);}catch(_){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}setStatus('Import path copied');});
  $('#resizeIconBtn').addEventListener('click',()=>{const s=expectedIconSize();editor.resizeImage(s,s,true);setStatus(`Document resized to ${s}×${s}`);});
  $('#warcraftButtonsBtn').addEventListener('click',()=>{
    $('#assetType').value='icon';
    updateCompatibility();
    if(window.WC3_BUTTON_STUDIO?.activate) window.WC3_BUTTON_STUDIO.activate();
    setStatus('WC3 Button Studio · choose an image, texture or Model Lab camera take');
  });
  $('#selectAllIconsBtn').addEventListener('click',()=>setIconSelection('all'));
  $('#selectCoreIconsBtn').addEventListener('click',()=>setIconSelection('core'));
  $('#clearIconsBtn').addEventListener('click',()=>setIconSelection('none'));
  $('#generateIconSetBtn').addEventListener('click',generateIconSet);

  $('#newBtn').addEventListener('click',()=>$('#newDialog').showModal());$('#newPreset').addEventListener('change',e=>{const v=e.target.value;if(v==='hdicon'){$('#newWidth').value=256;$('#newHeight').value=256;}else if(v==='sdicon'){$('#newWidth').value=64;$('#newHeight').value=64;}else if(['512','1024','2048'].includes(v)){$('#newWidth').value=v;$('#newHeight').value=v;}});
  $('#createDocBtn').addEventListener('click',e=>{e.preventDefault();const w=+$('#newWidth').value,h=+$('#newHeight').value;if(!w||!h||w>8192||h>8192){alert('Use dimensions between 1 and 8192 px.');return;}editor.newDocument(w,h,$('#newBackground').value,false);currentName='texture';$('#formatStatus').textContent='RGBA';$('#newDialog').close();setStatus('New document');requestAnimationFrame(()=>editor.fitTo($('#canvasStage')));});

  $('#resizeBtn').addEventListener('click',()=>{$('#resizeWidth').value=editor.width;$('#resizeHeight').value=editor.height;$('#resizeDialog').dataset.ratio=editor.width/editor.height;$('#resizeDialog').showModal();});
  $('#resizeWidth').addEventListener('input',e=>{if($('#resizeLockAspect').checked)$('#resizeHeight').value=Math.max(1,Math.round(+e.target.value/($('#resizeDialog').dataset.ratio||1)));});
  $('#resizeHeight').addEventListener('input',e=>{if($('#resizeLockAspect').checked)$('#resizeWidth').value=Math.max(1,Math.round(+e.target.value*($('#resizeDialog').dataset.ratio||1)));});
  $('#confirmResizeBtn').addEventListener('click',e=>{e.preventDefault();editor.resizeImage(+$('#resizeWidth').value,+$('#resizeHeight').value,$('#resizeSmooth').checked);$('#resizeDialog').close();});
  $('#canvasSizeBtn').addEventListener('click',()=>{$('#canvasWidth').value=editor.width;$('#canvasHeight').value=editor.height;$('#canvasDialog').showModal();});
  $('#confirmCanvasBtn').addEventListener('click',e=>{e.preventDefault();editor.resizeCanvas(+$('#canvasWidth').value,+$('#canvasHeight').value,$('#canvasAnchor').value);$('#canvasDialog').close();});

  $('#openBtn').addEventListener('click',()=>{const module=document.body.dataset.module||'texture';if(module==='model'){const input=$('#modelFileInput');if(input){if(typeof input.showPicker==='function'){try{input.showPicker();return;}catch(_){}}input.click();return;}}if(module==='buttons'){const input=$('#buttonSourceInput');if(input){if(typeof input.showPicker==='function'){try{input.showPicker();return;}catch(_){}}input.click();return;}}$('#fileInput').click();});$('#fileInput').addEventListener('change',e=>{openFile(e.target.files[0]);e.target.value='';});$('#convertBtn').addEventListener('click',()=>$('#convertFileInput').click());$('#convertFileInput').addEventListener('change',e=>{quickConvertFile(e.target.files[0]);e.target.value='';});$('#importLayerBtn').addEventListener('click',()=>{const module=document.body.dataset.module||'texture';const input=module==='model'?$('#modelTextureInput'):$('#layerFileInput');if(!input)return;if(typeof input.showPicker==='function'){try{input.showPicker();return;}catch(_){}}input.click();});$('#layerFileInput').addEventListener('change',e=>{importLayer(e.target.files[0]);e.target.value='';});$('#saveProjectBtn').addEventListener('click',saveCurrentWorkspace);$('#exportPngBtn').addEventListener('click',exportPNG);$('#exportBlpBtn').addEventListener('click',exportBLPDirect);$('#exportTgaBtn').addEventListener('click',exportTGADirect);$('#exportGameBtn').addEventListener('click',()=>openExportDialog('blp'));
  $('#gameExportFormat').addEventListener('change',updateExportFormatUI);$('#blpAlphaBits').addEventListener('change',refreshExportWarnings);$('#generateMipmaps').addEventListener('change',refreshExportWarnings);$('#confirmExportBtn').addEventListener('click',e=>{e.preventDefault();refreshExportWarnings();if($('#confirmExportBtn').disabled)return;$('#exportDialog').close();exportGame();});

  const stage=$('#canvasStage');['dragenter','dragover'].forEach(type=>stage.addEventListener(type,e=>{e.preventDefault();stage.classList.add('dragging');}));['dragleave','drop'].forEach(type=>stage.addEventListener(type,e=>{e.preventDefault();stage.classList.remove('dragging');}));stage.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)openFile(f);});
  stage.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();editor.setZoom(editor.zoom*(e.deltaY<0?1.12:1/1.12));}},{passive:false});

  document.addEventListener('keydown',e=>{
    const active=document.activeElement;
    const tag=active&&active.tagName;
    const inputType=((active&&active.type)||'').toLowerCase();
    const editingText=tag==='TEXTAREA'||(tag==='INPUT'&&!['range','checkbox','radio','button','file','color'].includes(inputType))||(active&&active.isContentEditable);
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ if(editingText) return; e.preventDefault(); e.shiftKey?performRedo():performUndo(); return; }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){ if(editingText) return; e.preventDefault(); performRedo(); return; }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){ if(editingText) return; e.preventDefault(); saveCurrentWorkspace(); return; }
    if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA')return;
    const shortcuts={b:'brush',e:'eraser',g:'bucket',i:'eyedropper',h:'pan',v:'move',t:'rotate',l:'line',r:'rect',o:'ellipse',c:'crop'},tool=shortcuts[e.key.toLowerCase()];if(tool){const b=$(`.tool[data-tool="${tool}"]`);if(b)b.click();}
    if(e.key==='['){editor.brushSize=Math.max(1,editor.brushSize-2);$('#brushSize').value=editor.brushSize;updateUI();}if(e.key===']'){editor.brushSize=Math.min(256,editor.brushSize+2);$('#brushSize').value=editor.brushSize;updateUI();}
  });


  window.BLP_PAINT_APP = {
    editor,
    stage,
    safeName,
    setStatus,
    showBusy,
    hideBusy,
    getCurrentName: ()=>currentName,
    setCurrentName: name=>{ currentName=safeName(name||'texture'); },
    async openImageData(imageData, name){
      currentName = safeName(name || 'texture');
      await editor.loadImageData(imageData, currentName);
      setStatus(`Loaded texture: ${name || currentName}`);
      requestAnimationFrame(()=>editor.fitTo(stage));
      return currentName;
    },
    async importImageData(imageData, name){
      await editor.importImageData(imageData, safeName(name || 'Imported'));
      setStatus(`Imported layer: ${name || 'Imported'}`);
    },
    getCompositeCanvas: ()=>editor.getCompositeCanvas(),
    getCompositeImageData: ()=>editor.getCompositeImageData(),
    decodeFileToImageData:fileToImageData,
    iconTools:{
      variants:ICON_VARIANTS.slice(),
      getSourceCanvas:getIconSourceCanvas,
      getSourceLabel:()=>iconSourceLabel,
      setSourceCanvas:setIconSourceCanvas,
      clearSource:clearIconSourceCanvas,
      makeIconCanvas,
      generateIconSet,
      expectedIconSize,
      updateIconPath,
      framePresets:ICON_FRAME_PRESETS,
      getFrameOptions:getIconFrameOptions,
      setFrameOptions:setIconFrameOptions,
    },
    notifyChange(){ updateUI(); renderLayers(); window.dispatchEvent(new CustomEvent('wc3-editor-change')); },
    refreshUndoUi,
  };

  window.addEventListener('wc3-history-change',refreshUndoUi);
  window.addEventListener('resize',()=>updateUI());
  renderLayers();requestAnimationFrame(()=>editor.fitTo(stage));updateCompatibility();setStatus('Ready · PNG/JPG/JPEG/BLP1/TGA/DDS · Reforged');
})();
