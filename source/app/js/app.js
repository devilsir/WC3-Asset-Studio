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

  const unsavedState = { texture:false, model:false, modelTextures:false, lastChange:'' };
  function unsavedScopes(){
    return Object.keys(unsavedState).filter(k=>k!=='lastChange'&&unsavedState[k]);
  }
  function unsavedSummary(scopes=unsavedScopes()){
    const labels={texture:'Texture Paint document',model:'model edits',modelTextures:'edited model textures'};
    return scopes.length ? `Unsaved: ${scopes.map(s=>labels[s]||s).join(', ')}.` : '';
  }
  function syncUnsavedState(){
    const scopes=unsavedScopes(),dirty=scopes.length>0;
    document.body.classList.toggle('has-unsaved-changes',dirty);
    try{window.WC3_UNSAVED?.setState?.({dirty,scopes,summary:unsavedSummary(scopes),lastChange:unsavedState.lastChange||''});}catch(_){}
    return dirty;
  }
  function markUnsaved(scope,label=''){
    if(!['texture','model','modelTextures'].includes(scope))return false;
    unsavedState[scope]=true;
    if(label)unsavedState.lastChange=String(label);
    syncUnsavedState();
    window.WC3_LOG?.debug?.('Unsaved Guard','Document marked modified',{scope,label:String(label||'')});
    return true;
  }
  function markSaved(scope){
    const scopes=Array.isArray(scope)?scope:[scope];
    for(const s of scopes){
      if(s==='all'){unsavedState.texture=false;unsavedState.model=false;unsavedState.modelTextures=false;}
      else if(['texture','model','modelTextures'].includes(s))unsavedState[s]=false;
    }
    if(!unsavedScopes().length)unsavedState.lastChange='';
    syncUnsavedState();
    return true;
  }
  function hasUnsaved(scopes=['texture','model','modelTextures']){
    const list=Array.isArray(scopes)?scopes:[scopes];
    return list.some(s=>s==='all'?unsavedScopes().length>0:!!unsavedState[s]);
  }
  function confirmDiscardUnsaved(action='continue',scopes=['texture','model','modelTextures']){
    const list=Array.isArray(scopes)?scopes:[scopes],dirty=list.filter(s=>s==='all'?unsavedScopes().length>0:!!unsavedState[s]);
    if(!dirty.length)return true;
    const affected=dirty.includes('all')?unsavedScopes():dirty;
    const detail=unsavedSummary(affected);
    const ok=window.confirm(`${detail}\n\nDo you want to ${action} without saving?`);
    window.WC3_LOG?.info?.('Unsaved Guard',ok?'Discard confirmed':'Discard cancelled',{action,scopes:affected,lastChange:unsavedState.lastChange||''});
    return ok;
  }
  async function confirmDiscardUnsavedNative(action='continue',scopes=['texture','model','modelTextures'],target=''){
    const list=Array.isArray(scopes)?scopes:[scopes],affected=list.filter(s=>s==='all'?unsavedScopes().length>0:!!unsavedState[s]);
    if(!affected.length)return true;
    if(window.WC3_UNSAVED?.confirmDiscard){
      try{return !!(await window.WC3_UNSAVED.confirmDiscard(action,target,unsavedSummary(affected)));}catch(_){}
    }
    return confirmDiscardUnsaved(action,scopes);
  }
  const pendingSaveDownloads=new Map();
  function registerPendingSave(filename,scopes){
    const key=String(filename||'').trim();if(!key)return false;
    const list=(Array.isArray(scopes)?scopes:[scopes]).filter(Boolean);if(!list.length)return false;
    pendingSaveDownloads.set(key,{scopes:list,queuedAt:Date.now()});
    window.WC3_LOG?.debug?.('Unsaved Guard','Waiting for save download completion',{filename:key,scopes:list});
    return true;
  }
  window.WC3_UNSAVED?.onDownloadResult?.(payload=>{
    const name=String(payload?.name||''),pending=pendingSaveDownloads.get(name);if(!pending)return;
    pendingSaveDownloads.delete(name);
    if(String(payload?.state||'')==='completed'){
      markSaved(pending.scopes);
      window.WC3_LOG?.info?.('Unsaved Guard','Save completed; dirty state cleared',{filename:name,scopes:pending.scopes,path:String(payload?.path||'')});
    }else{
      window.WC3_LOG?.info?.('Unsaved Guard','Save not completed; dirty state preserved',{filename:name,scopes:pending.scopes,state:String(payload?.state||'')});
    }
  });

  function snapshotUnsaved(){return {...unsavedState};}
  function restoreUnsaved(snapshot){
    if(!snapshot||typeof snapshot!=='object')return false;
    unsavedState.texture=!!snapshot.texture;unsavedState.model=!!snapshot.model;unsavedState.modelTextures=!!snapshot.modelTextures;unsavedState.lastChange=String(snapshot.lastChange||'');
    syncUnsavedState();return true;
  }
  function currentTextureUnsavedScope(){
    const s=window.WC3_MODEL_LAB?.getState?.();
    return s?.model&&Number.isInteger(s.editorTextureIndex)&&s.editorTextureIndex>=0?'modelTextures':'texture';
  }

  function fitTextureView(options={}){
    const stage=$('#canvasScroll') || $('#canvasStage');
    if(!stage || !editor.width || !editor.height) return false;
    const sw=stage.clientWidth,sh=stage.clientHeight;
    if(sw<96 || sh<96) return false;
    const comfortable=options.comfortable!==false;
    const pad=comfortable ? 34 : 72;
    const usableW=Math.max(1,sw-pad),usableH=Math.max(1,sh-pad);
    let scale=Math.min(usableW/editor.width,usableH/editor.height);
    if(!Number.isFinite(scale) || scale<=0) return false;
    scale=Math.max(0.03125,Math.min(16,scale));
    editor.setZoom(scale);
    requestAnimationFrame(()=>{
      const maxLeft=Math.max(0,stage.scrollWidth-stage.clientWidth);
      const maxTop=Math.max(0,stage.scrollHeight-stage.clientHeight);
      stage.scrollLeft=maxLeft/2;
      stage.scrollTop=maxTop/2;
    });
    return true;
  }
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
    const undo=$('#undoBtn'),redo=$('#redoBtn');if(undo){undo.disabled=!h.undo;undo.title=`Undo (Ctrl+Z) · ${h.undo||0}/${h.max||75}`;}if(redo){redo.disabled=!h.redo;redo.title=`Redo (Ctrl+Y) · ${h.redo||0}`;}
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
    if(style==='obsidian'){
      const inner=size*.058;fillRing(ctx,size,inner,'rgba(4,6,9,.96)');strokeInset(ctx,size,size*.008,size*.014,'rgba(0,0,0,.95)');strokeInset(ctx,size,size*.026,size*.007,rgba(p.lite,.38));strokeInset(ctx,size,inner-size*.004,size*.008,rgba(p.hi,.72));drawCornerTicks(ctx,size,rgba(p.hi,.7),'rgba(0,0,0,.95)',.62);return;
    }
    if(style==='bronze'){
      const inner=size*.086;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));strokeInset(ctx,size,size*.01,size*.014,rgba(p.deep,.96));strokeInset(ctx,size,size*.04,size*.014,rgba(p.hi,.36));strokeInset(ctx,size,inner-size*.008,size*.01,rgba(p.dark,.94));drawCornerTicks(ctx,size,rgba(p.lite,.92),rgba(p.deep,.95),.82);return;
    }
    if(style==='frost'){
      const inner=size*.052;fillRing(ctx,size,inner,rgba(p.dark,.9));strokeInset(ctx,size,size*.009,size*.008,rgba(p.deep,.9));strokeInset(ctx,size,size*.021,size*.008,rgba(p.hi,.9));strokeInset(ctx,size,inner-size*.004,size*.006,'rgba(255,255,255,.58)');drawCornerTicks(ctx,size,'rgba(255,255,255,.82)',rgba(p.dark,.9),.55);return;
    }
    if(style==='arcane'){
      const inner=size*.074;fillRing(ctx,size,inner,rgba(p.deep,.93));strokeInset(ctx,size,size*.008,size*.01,rgba(p.hi,.5));strokeInset(ctx,size,size*.03,size*.006,rgba(p.lite,.78));strokeInset(ctx,size,inner-size*.005,size*.009,rgba(p.hi,.72));drawCornerTicks(ctx,size,rgba(p.hi,.98),rgba(p.deep,.96),1.18);return;
    }
    if(style==='reforged'){
      const inner=size*.064;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));strokeInset(ctx,size,size*.006,size*.012,rgba(p.deep,.95));strokeInset(ctx,size,inner-size*.006,size*.008,rgba(p.hi,.58));ctx.save();ctx.strokeStyle=rgba(p.hi,.9);ctx.lineWidth=Math.max(1,size*.012);const c=size*.115,o=size*.018;const seg=[[[o,o+c],[o,o],[o+c,o]],[[size-o-c,o],[size-o,o],[size-o,o+c]],[[size-o,size-o-c],[size-o,size-o],[size-o-c,size-o]],[[o+c,size-o],[o,size-o],[o,size-o-c]]];for(const pts of seg){ctx.beginPath();ctx.moveTo(...pts[0]);ctx.lineTo(...pts[1]);ctx.lineTo(...pts[2]);ctx.stroke();}ctx.restore();return;
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
    if(style==='halo'){
      const inner=size*.03;fillRing(ctx,size,inner,rgba(p.deep,.86));strokeInset(ctx,size,size*.006,size*.006,rgba(p.hi,.75));strokeInset(ctx,size,inner-size*.003,size*.004,rgba(p.lite,.55));return;
    }
    if(style==='sunken'){
      const inner=size*.06;fillRing(ctx,size,inner,rgba(p.deep,.98));strokeInset(ctx,size,size*.01,size*.012,'rgba(0,0,0,.78)');strokeInset(ctx,size,size*.032,size*.009,rgba(p.dark,.92));strokeInset(ctx,size,inner-size*.006,size*.006,rgba(p.hi,.28));drawCornerTicks(ctx,size,rgba(p.lite,.58),rgba(p.deep,.96),.58);return;
    }
    if(style==='stone'){
      const inner=size*.078;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));strokeInset(ctx,size,size*.01,size*.016,rgba(p.deep,.95));strokeInset(ctx,size,size*.036,size*.012,rgba(p.lite,.22));strokeInset(ctx,size,inner-size*.008,size*.009,rgba(p.hi,.42));return;
    }
    if(style==='arcane'){
      const inner=size*.052;fillRing(ctx,size,inner,rgba(p.deep,.94));strokeInset(ctx,size,size*.007,size*.008,rgba(p.hi,.72));strokeInset(ctx,size,size*.027,size*.005,rgba(p.lite,.54));strokeInset(ctx,size,inner-size*.004,size*.006,rgba(p.hi,.72));drawCornerTicks(ctx,size,rgba(p.hi,.9),rgba(p.deep,.95),.9);return;
    }
    if(style==='reforged'){
      const inner=size*.048;fillRing(ctx,size,inner,linearFrameGradient(ctx,size,p));strokeInset(ctx,size,size*.008,size*.011,rgba(p.deep,.94));strokeInset(ctx,size,inner-size*.004,size*.007,rgba(p.hi,.6));drawCornerTicks(ctx,size,rgba(p.lite,.82),rgba(p.deep,.95),.7);return;
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
    if(style==='spark'){
      const r=Math.max(2,size*.022),m=size*.035;ctx.save();ctx.fillStyle=accent;ctx.strokeStyle=dark;ctx.lineWidth=Math.max(1,size*.008);ctx.shadowColor=accent;ctx.shadowBlur=disabled?0:size*.032;for(const [x,y] of [[m,m],[size-m,m],[size-m,size-m],[m,size-m]]){ctx.beginPath();ctx.moveTo(x,y-r*1.8);ctx.lineTo(x+r*1.2,y);ctx.lineTo(x,y+r*1.8);ctx.lineTo(x-r*1.2,y);ctx.closePath();ctx.fill();ctx.stroke();}ctx.restore();return;
    }
    if(style==='diamond'){
      const r=Math.max(3,size*.03),m=size*.028;ctx.save();ctx.fillStyle=accent;ctx.strokeStyle=dark;ctx.lineWidth=Math.max(1,size*.009);for(const [x,y] of [[size/2,m],[size-m,size/2],[size/2,size-m],[m,size/2]]){ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();ctx.fill();ctx.stroke();}ctx.restore();return;
    }
    if(style==='pulse'){
      strokeInset(ctx,size,size*.014,size*.028,dark);strokeInset(ctx,size,size*.014,size*.011,accent);strokeInset(ctx,size,size*.05,size*.004,disabled?rgba(f.lite,.28):rgba(a.hi,.42));drawCornerTicks(ctx,size,accent,dark,.52);return;
    }
    if(style==='compass'){
      drawAutocastArrows(ctx,size,disabled,accentColor,.026);strokeInset(ctx,size,size*.014,size*.006,accent);return;
    }
    if(style==='reforged'){
      const inset=size*.01,len=size*.19;ctx.save();ctx.lineCap='square';ctx.lineJoin='miter';for(let i=0;i<4;i++){autocastCornerPath(ctx,size,i,len,inset);ctx.strokeStyle=dark;ctx.lineWidth=Math.max(2,size*.046);ctx.stroke();autocastCornerPath(ctx,size,i,len,inset);ctx.strokeStyle=accent;ctx.lineWidth=Math.max(1,size*.018);ctx.stroke();}ctx.restore();drawCornerTicks(ctx,size,accent,dark,.48);return;
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
  function applyDisabledEffect(canvas,style='classic'){
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); const img=ctx.getImageData(0,0,canvas.width,canvas.height); const d=img.data;
    for(let i=0;i<d.length;i+=4){
      const lum=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114;let r=lum,g=lum,b=lum;
      if(style==='desaturated'){const shade=lum*.78;r=shade;g=shade;b=shade;}
      else if(style==='frost'){const shade=lum*.7;r=shade*.72;g=shade*.86;b=Math.min(255,shade*1.1+10);}
      else if(style==='redlock'){const shade=lum*.66;r=Math.min(255,shade*1.02+15);g=shade*.62;b=shade*.6;}
      else if(style==='sepia'){const shade=lum*.76;r=Math.min(255,shade*1.04+10);g=shade*.88;b=shade*.62;}
      else if(style==='contrast'){const shade=lum<110?lum*.38:Math.min(255,lum*.82);r=shade*.82;g=shade*.86;b=shade*.9;}
      else {const shade=Math.max(0,Math.min(255,lum*.72));r=shade*.78;g=shade*.84;b=shade*.78;}
      d[i]=Math.max(0,Math.min(255,r));d[i+1]=Math.max(0,Math.min(255,g));d[i+2]=Math.max(0,Math.min(255,b));
    }
    ctx.putImageData(img,0,0);
    const overlays={classic:'rgba(7,10,14,.22)',desaturated:'rgba(5,7,10,.18)',frost:'rgba(8,18,32,.2)',redlock:'rgba(35,5,7,.2)',sepia:'rgba(35,24,10,.16)',contrast:'rgba(0,0,0,.26)'};ctx.fillStyle=overlays[style]||overlays.classic;ctx.fillRect(0,0,canvas.width,canvas.height);
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
    normal:[['classic','Classic Bevel'],['thin','Thin Metal'],['heavy','Heavy Warcraft'],['double','Double Rim'],['corner','Corner Cut'],['minimal','Minimal'],['obsidian','Obsidian Edge'],['bronze','Bronze Plate'],['frost','Frost Rim'],['arcane','Arcane Double'],['reforged','Reforged Sharp']],
    passive:[['classic','Classic Passive'],['rune','Rune Frame'],['etched','Inner Etch'],['heavy','Heavy Passive'],['minimal','Minimal Passive'],['halo','Thin Halo'],['sunken','Sunken Rune'],['stone','Stone Relief'],['arcane','Arcane Loop'],['reforged','Reforged Passive']],
    autocast:[['classic','Classic Corners'],['brackets','Long Edge Brackets'],['chevrons','Corner Chevrons'],['full','Full Gold Rim'],['arrows','Edge Arrows'],['minimal','Minimal Corners'],['spark','Spark Corners'],['diamond','Diamond Nodes'],['pulse','Pulse Ring'],['compass','Compass Marks'],['reforged','Reforged Autocast']],
    disabled:[['classic','Classic Dark'],['desaturated','Desaturated'],['frost','Frost Locked'],['redlock','Red Locked'],['sepia','Sepia Disabled'],['contrast','High Contrast']]
  };
  let iconFrameOptions={normalStyle:'classic',passiveStyle:'classic',autocastStyle:'classic',disabledStyle:'classic',frameColor:'#7f8995',autocastColor:'#f6c84d',artBleed:2,trimTransparent:true};
  function getIconFrameOptions(){return {...iconFrameOptions};}
  function setIconFrameOptions(next={}){
    const clean={...iconFrameOptions};
    if(ICON_FRAME_PRESETS.normal.some(x=>x[0]===next.normalStyle))clean.normalStyle=next.normalStyle;
    if(ICON_FRAME_PRESETS.passive.some(x=>x[0]===next.passiveStyle))clean.passiveStyle=next.passiveStyle;
    if(ICON_FRAME_PRESETS.autocast.some(x=>x[0]===next.autocastStyle))clean.autocastStyle=next.autocastStyle;
    if(ICON_FRAME_PRESETS.disabled.some(x=>x[0]===next.disabledStyle))clean.disabledStyle=next.disabledStyle;
    if(/^#[0-9a-f]{6}$/i.test(next.frameColor||''))clean.frameColor=next.frameColor.toLowerCase();
    if(/^#[0-9a-f]{6}$/i.test(next.autocastColor||''))clean.autocastColor=next.autocastColor.toLowerCase();
    if(Number.isFinite(+next.artBleed))clean.artBleed=clamp(+next.artBleed,0,10);
    if(typeof next.trimTransparent==='boolean')clean.trimTransparent=next.trimTransparent;
    iconFrameOptions=clean;return getIconFrameOptions();
  }
  function frameInsetFraction(variant,opts){
    if(variant==='ATC'||variant==='DISATC')return ({classic:.026,brackets:.022,chevrons:.025,full:.036,arrows:.028,minimal:.018,spark:.024,diamond:.027,pulse:.038,compass:.026,reforged:.032})[opts.autocastStyle]||.026;
    if(variant==='PASBTN'||variant==='DISPASBTN')return ({classic:.046,rune:.052,etched:.04,heavy:.07,minimal:.026,halo:.031,sunken:.061,stone:.079,arcane:.053,reforged:.049})[opts.passiveStyle]||.046;
    return ({classic:.08,thin:.047,heavy:.104,double:.078,corner:.07,minimal:.031,obsidian:.059,bronze:.087,frost:.053,arcane:.075,reforged:.065})[opts.normalStyle]||.08;
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
    if(variant.startsWith('DIS'))applyDisabledEffect(canvas,opts.disabledStyle);
    return canvas;
  }
  function analyzeImageDataLocal(imageData){
    const d=imageData.data; let hasAlpha=false, partial=false, transparent=0;
    for(let i=3;i<d.length;i+=4){ const a=d[i]; if(a<255){ hasAlpha=true; if(a===0) transparent++; else partial=true; } }
    return {hasAlpha,partial,transparent};
  }
  async function encodeWarcraftIcon(imageData,outputFormat=''){
    const out=String(outputFormat||($('#iconOutputFormat')&&$('#iconOutputFormat').value)||'blp').toLowerCase()==='tga'?'tga':'blp';
    if(out==='tga') return {blob:TGA.encode(imageData),ext:'tga',format:'TGA 32-bit'};
    const info=analyzeImageDataLocal(imageData);
    const alphaBits=info.partial?8:info.hasAlpha?1:0;
    const blob=BLP.encodePaletted(imageData,{mipmaps:true,dither:false,alphaBits});
    return {blob,ext:'blp',format:'BLP1 A'+alphaBits};
  }
  async function buildIconSetPackage(options={}){
    if(typeof SimpleZip==='undefined')throw new Error('The ZIP module did not load correctly.');
    const variants=(Array.isArray(options.variants)?options.variants:selectedIconVariants()).filter(v=>ICON_VARIANTS.includes(v));
    if(!variants.length)throw new Error('Select at least one button type to generate.');
    const requestedProfile=String(options.profile||profile()).toLowerCase(),size=Number(options.size)||(requestedProfile==='hd'?256:64),output=String(options.format||expectedExt()).toLowerCase()==='tga'?'tga':'blp';
    const base=safeName(options.baseName||($('#iconBaseName')&&$('#iconBaseName').value)||currentName||'CustomIcon'),files=[],lines=[];
    lines.push('BLP Paint Reforged — Import Paths');
    lines.push('Profile: '+(size===256?'256×256 icon':'64×64 icon'));
    lines.push('Size: '+size+'x'+size);
    lines.push('');
    for(const variant of variants){
      const canvas=makeIconCanvas(variant,size),imageData=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,size,size);
      const encoded=await encodeWarcraftIcon(imageData,output),path=iconPathForVariant(variant,base).replace(/\.(?:blp|tga)$/i,'.'+encoded.ext);
      files.push({name:path,data:new Uint8Array(await encoded.blob.arrayBuffer())});
      lines.push(path+'  ['+encoded.format+']');
    }
    files.push({name:'_import_paths.txt',data:lines.join('\n')});
    const blob=SimpleZip.create(files),suffix=(size===256?'256':'64')+'_'+output;
    return {blob,files,variants,size,format:output,base,filename:base+'_icon_set_'+suffix+'.zip',paths:files.map(x=>x.name)};
  }
  async function generateIconSet(){
    showBusy('Generating icon set…'); await new Promise(r=>setTimeout(r,20));
    try{
      const pack=await buildIconSetPackage();
      downloadBlob(pack.blob,pack.filename);
      setStatus(pack.variants.length+' icons generated in ZIP package');
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
      row.querySelector('.lock').addEventListener('click',e=>{e.stopPropagation();editor.pushHistory('Layer lock');l.locked=!l.locked;editor.layersChanged();});
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
    if(!file)return false;
    if(hasUnsaved('texture')&&!confirmDiscardUnsaved('open another texture',['texture']))return false;
    showBusy('Opening '+file.name+'…');
    try{
      if(file.name.toLowerCase().endsWith('.blpproj'))await loadProject(file);
      else{const d=await fileToImageData(file);currentName=safeName(file.name);await editor.loadImageData(d.imageData,currentName);setStatus(`Opened: ${file.name}`);requestAnimationFrame(()=>fitTextureView({comfortable:true}));}
      markSaved('texture');
      return true;
    }
    catch(e){console.error(e);alert('Could not open the file.\n\n'+e.message);setStatus('Error opening file');return false;}finally{hideBusy();}
  }
  function ipcBytes(value){
    if(value instanceof ArrayBuffer)return value;
    if(ArrayBuffer.isView(value))return value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);
    if(value&&value.buffer instanceof ArrayBuffer){const off=Number(value.byteOffset)||0,len=Number(value.byteLength)||value.buffer.byteLength;return value.buffer.slice(off,off+len);}
    return value;
  }
  function associatedWorkspaceForPath(filePath){
    const clean=String(filePath||'').split(/[?#]/)[0];
    const dot=clean.lastIndexOf('.');
    const ext=dot>=0?clean.slice(dot).toLowerCase():'';
    return ext==='.mdl'||ext==='.mdx'?'model':ext==='.blp'||ext==='.tga'?'texture':'';
  }
  function routeAssociatedWorkspace(module){
    if(!module)return;
    if(window.WC3_WORKSPACE_UI?.openModule){window.WC3_WORKSPACE_UI.openModule(module);return;}
    const btn=document.querySelector(`.workspace-tab[data-module="${module}"]`)||document.querySelector(`.module-nav-btn[data-module="${module}"]`);
    if(btn)btn.click();else document.body.dataset.module=module;
  }
  async function openWindowsAssociatedPath(filePath){
    const bridge=window.WC3_FILE_ASSOCIATIONS;if(!bridge||typeof bridge.readFile!=='function')return false;
    const hintedWorkspace=associatedWorkspaceForPath(filePath);
    routeAssociatedWorkspace(hintedWorkspace);
    setStatus(hintedWorkspace==='model'?'Opening model from Windows…':hintedWorkspace==='texture'?'Opening texture from Windows…':'Opening file from Windows…');
    try{
      const payload=await bridge.readFile(String(filePath||''));
      if(!payload||!payload.ok)throw new Error(payload&&payload.error||'Windows file handoff failed.');
      const ext=String(payload.ext||'').toLowerCase(),bytes=ipcBytes(payload.data);
      const mime=ext==='.tga'?'application/octet-stream':ext==='.blp'?'application/octet-stream':ext==='.mdl'?'text/plain':'application/octet-stream';
      const file=new File([bytes],payload.name,{type:mime,lastModified:Date.now()});
      if(ext==='.mdl'||ext==='.mdx'){
        routeAssociatedWorkspace('model');
        if(!window.WC3_MODEL_LAB?.openModel)throw new Error('Model Lab is not ready yet.');
        const opened=await window.WC3_MODEL_LAB.openModel(file,[],{sourcePath:payload.path});
        if(!opened){setStatus('Open model cancelled · unsaved changes kept');return false;}
        routeAssociatedWorkspace('model');
        setStatus(`Opened from Windows: ${payload.name}`);
      }else if(ext==='.blp'||ext==='.tga'){
        routeAssociatedWorkspace('texture');
        await openFile(file);
        routeAssociatedWorkspace('texture');
      }else throw new Error(`Unsupported associated file type: ${ext||'unknown'}`);
      window.WC3_LOG?.info?.('Windows Association','Associated file opened',{path:payload.path,ext,size:payload.size,workspace:associatedWorkspaceForPath(payload.path)});
      return true;
    }catch(e){
      console.error('Associated file open failed:',e);window.WC3_LOG?.error?.('Windows Association','Could not open associated file',e);alert('Could not open the Windows-associated file.\n\n'+(e.message||e));return false;
    }
  }
  let associatedOpenChain=Promise.resolve();
  function enqueueWindowsAssociatedPath(filePath){
    const next=String(filePath||'');
    associatedOpenChain=associatedOpenChain.then(()=>openWindowsAssociatedPath(next));
    return associatedOpenChain;
  }
  window.WC3_ASSOCIATED_FILES=Object.freeze({
    openPath:enqueueWindowsAssociatedPath,
    workspaceForPath:associatedWorkspaceForPath
  });

  async function quickConvertFile(file){
    if(!file)return;
    showBusy('Loading file for conversion…');
    try{
      const d=await fileToImageData(file);
      currentName=safeName(file.name);
      await editor.loadImageData(d.imageData,currentName);
      setStatus(`Loaded for conversion: ${file.name}`);
      requestAnimationFrame(()=>fitTextureView({comfortable:true}));
      openExportDialog('blp');
    }catch(e){console.error(e);alert('Failed to load file for conversion.\n\n'+e.message);setStatus('Conversion load failed');}finally{hideBusy();}
  }

  async function importLayer(file){if(!file)return;showBusy('Importing layer…');try{const d=await fileToImageData(file);await editor.importImageData(d.imageData,safeName(file.name));setStatus('Layer imported');}catch(e){alert('Failed to import layer.\n\n'+e.message);}finally{hideBusy();}}

  function downloadBlob(blob,filename,saveScopes=[]){registerPendingSave(filename,saveScopes);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  async function buildPngArtifact(){
    const canvas=editor.getCompositeCanvas();
    if(!canvas||!canvas.width||!canvas.height)throw new Error('No texture pixels are available.');
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG encoder returned no data.')),'image/png'));
    const head=new Uint8Array(await blob.slice(0,8).arrayBuffer()),sig=[137,80,78,71,13,10,26,10];
    if(sig.some((v,i)=>head[i]!==v))throw new Error('PNG validation failed.');
    return {blob,filename:currentName+'.png',encoding:'PNG',width:canvas.width,height:canvas.height,format:'png'};
  }
  async function exportPNG(){const artifact=await buildPngArtifact();downloadBlob(artifact.blob,artifact.filename);setStatus(`PNG exported · ${artifact.width}×${artifact.height} · ${(artifact.blob.size/1024).toFixed(1)} KB`);}
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
  function buildLayeredProjectBlob(){
    const payload={format:'BLPPaintProject',version:2,width:editor.width,height:editor.height,activeLayerId:editor.activeLayerId,warcraftProfile:profile(),assetType:assetType(),layers:editor.layers.map(l=>({id:l.id,name:l.name,visible:l.visible,locked:l.locked,opacity:l.opacity,blend:l.blend,offsetX:l.offsetX,offsetY:l.offsetY,png:dataURLFromCanvas(l.canvas)}))};
    return {payload,blob:new Blob([JSON.stringify(payload)],{type:'application/json'}),filename:currentName+'.blpproj'};
  }
  async function saveProject(){showBusy('Saving layered project…');try{const artifact=buildLayeredProjectBlob();downloadBlob(artifact.blob,artifact.filename,[currentTextureUnsavedScope()]);setStatus('Project save requested');}finally{hideBusy();}}

  function getSaveTextureOptions(){
    const maxSize=Math.max(0,parseInt($('#saveTextureMaxSize')?.value||'0',10)||0);
    const format=String($('#saveTextureFormat')?.value||'keep').toLowerCase();
    const mipmaps=$('#saveTextureMipmaps')?.checked!==false;
    const quality=Math.max(1,Math.min(100,parseInt($('#saveTextureQuality')?.value||'100',10)||100));
    return {maxSize,format,mipmaps,quality};
  }
  function scaledTextureCanvas(source,maxSize){
    if(!source||!source.width||!source.height)throw new Error('No texture pixels are available.');
    const limit=Math.max(0,Number(maxSize)||0),largest=Math.max(source.width,source.height);
    if(!limit||largest<=limit)return source;
    const scale=limit/largest,w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale));
    const out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.clearRect(0,0,w,h);ctx.drawImage(source,0,0,w,h);return out;
  }
  function saveAlphaProfile(imageData){
    const d=imageData&&imageData.data;if(!d)return{hasAlpha:false,smoothAlpha:false};let hasAlpha=false,smoothAlpha=false;
    for(let i=3;i<d.length;i+=4){const a=d[i];if(a<250)hasAlpha=true;if(a>8&&a<247)smoothAlpha=true;}
    return{hasAlpha,smoothAlpha};
  }
  function saveBlpAlphaBits(imageData,quality){
    const a=saveAlphaProfile(imageData);if(!a.hasAlpha)return 0;if(!a.smoothAlpha)return 1;if(quality>=80)return 8;if(quality>=40)return 4;return 1;
  }
  function saveDdsFormat(imageData,quality){
    const a=saveAlphaProfile(imageData);if(!a.hasAlpha)return'BC1';if(!a.smoothAlpha)return'BC1A';return quality<=25?'BC1A':'BC3';
  }
  async function buildStandaloneTextureArtifact(options={}){
    const opts={maxSize:0,format:'blp',mipmaps:true,quality:100,...options},source=editor.getCompositeCanvas(),canvas=scaledTextureCanvas(source,opts.maxSize);
    const imageData=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height),quality=Math.max(1,Math.min(100,Number(opts.quality)||100));
    const format=['tga','dds','blp'].includes(opts.format)?opts.format:'blp';let blob,filename,encoding='';
    if(format==='tga'){
      blob=TGA.encode(imageData);const chk=TGA.inspect(await blob.arrayBuffer());if(!chk||chk.width!==canvas.width||chk.height!==canvas.height||chk.bpp!==32)throw new Error('TGA validation failed.');filename=currentName+'.tga';encoding='TGA 32-bit';
    }else if(format==='dds'){
      const ddsFormat=saveDdsFormat(imageData,quality);blob=DDS.encode(imageData,{mipmaps:opts.mipmaps,format:ddsFormat});const chk=DDS.inspect(await blob.arrayBuffer());if(!chk||chk.width!==canvas.width||chk.height!==canvas.height)throw new Error('DDS validation failed.');filename=currentName+'.dds';encoding=`DDS ${ddsFormat}`;
    }else{
      const alpha=saveAlphaProfile(imageData),alphaBits=saveBlpAlphaBits(imageData,quality);
      if(!alpha.hasAlpha&&quality<100&&typeof BLP.encodeJpeg==='function'){blob=await BLP.encodeJpeg(imageData,{mipmaps:opts.mipmaps,quality});encoding=`BLP1 JPEG ${quality}%`;}
      else{blob=BLP.encodePaletted(imageData,{mipmaps:opts.mipmaps,dither:quality<100,alphaBits});encoding=`BLP1 indexed A${alphaBits}`;}
      const chk=BLP.inspect(await blob.arrayBuffer());if(!chk||chk.magic!=='BLP1'||chk.width!==canvas.width||chk.height!==canvas.height)throw new Error('BLP validation failed.');filename=currentName+'.blp';
    }
    return {blob,filename,encoding,width:canvas.width,height:canvas.height,format,quality,mipmaps:!!opts.mipmaps};
  }
  async function exportStandaloneTexture(options={}){
    const format=['tga','dds','blp'].includes(options.format)?options.format:'blp';showBusy(`Saving texture as ${format.toUpperCase()}…`);await new Promise(r=>setTimeout(r,20));
    try{const artifact=await buildStandaloneTextureArtifact(options);downloadBlob(artifact.blob,artifact.filename,[currentTextureUnsavedScope()]);setStatus(`Texture save requested · ${artifact.encoding} · ${artifact.width}×${artifact.height} · ${(artifact.blob.size/1024).toFixed(1)} KB`);return true;}
    catch(e){console.error(e);alert('Could not save texture.\n\n'+e.message);return false;}finally{hideBusy();}
  }
  function saveProfileLabel(model){
    if(!model)return'Standalone texture';
    const v=Number(model.formatVersion||800),refs=(model.textureDefs||[]).map(d=>String(d&&d.path||'').toLowerCase()),dds=refs.filter(x=>x.endsWith('.dds')).length,blp=refs.filter(x=>x.endsWith('.blp')).length;
    if(v<=800)return`Classic / SD · MDX v${v}${blp?` · ${blp} BLP`:''}`;
    if(v>=1200)return`Modern HD / DE-compatible · MDX v${v}${dds?` · ${dds} DDS`:''}`;
    return`Reforged / HD · MDX v${v}${dds?` · ${dds} DDS`:''}`;
  }
  function updateSaveQualityNote(){
    const opts=getSaveTextureOptions(),note=$('#saveQualityNote'),mips=$('#saveTextureMipmaps'),qualityOut=$('#saveTextureQualityValue'),qualityInput=$('#saveTextureQuality');if(!note)return;
    const model=window.WC3_MODEL_LAB?.getModel?.(),format=opts.format==='keep'?'source formats':opts.format.toUpperCase(),profile=saveProfileLabel(model);
    const profileEl=$('#saveCompatibilityState');if(profileEl)profileEl.textContent=profile;if(qualityOut)qualityOut.textContent=`${opts.quality}%`;
    if(mips)mips.disabled=opts.format==='tga';if(qualityInput)qualityInput.disabled=opts.format==='tga';
    let detail='';
    if(opts.quality>=100)detail='100% keeps untouched source bytes whenever possible. Rebuilt BLP keeps indexed color/alpha; rebuilt DDS chooses BC1/BC3 from the actual alpha data.';
    else detail=`${opts.quality}% keeps the pixel dimensions unchanged: opaque BLP1 uses JPEG quality ${opts.quality}%; JPEG/WebP use the same quality target. BLP with smooth alpha uses ${opts.quality>=80?'8':opts.quality>=40?'4':'1'}-bit alpha so transparency is not silently discarded.`;
    if(opts.quality<=25)detail+=' Aggressive mode: smooth-alpha DDS may be reduced from BC3/DXT5 to BC1/DXT1 1-bit alpha to cut the payload roughly in half.';
    if(opts.format==='dds')detail+=' DDS block size is otherwise fixed at a given resolution: BC1/DXT1 is smaller than BC3/DXT5; the slider does not fake savings when the codec cannot provide them.';
    if(opts.format==='tga')detail='TGA is uncompressed 32-bit, so quality does not change its file size. Use Resolution, BLP1, or DDS if you want a smaller texture.';
    const res=opts.maxSize?` Resolution cap: ${opts.maxSize}px, preserving aspect ratio.`:' Resolution: original.';
    note.textContent=`${profile} · Output: ${format}. ${detail}${res} Mipmaps are ${opts.mipmaps&&opts.format!=='tga'?'enabled':'disabled'}.`;
  }
  let saveActionRunning=false;
  function openSaveDialog(preselect=''){
    const dialog=$('#saveDialog');if(!dialog)return false;const model=window.WC3_MODEL_LAB?.getModel?.()||null,state=window.WC3_MODEL_LAB?.getState?.()||null;
    const modelBtn=$('#saveOnlyModelBtn'),comboBtn=$('#saveModelTexturesBtn'),texBtn=$('#saveOnlyTexturesBtn');
    if(modelBtn)modelBtn.disabled=!model;if(comboBtn)comboBtn.disabled=!model;if(texBtn)texBtn.disabled=false;
    const modelState=$('#saveModelState'),textureState=$('#saveTextureState'),imageState=$('#saveImageState');
    if(modelState)modelState.textContent=model?(model.sourceName||model.name||'Loaded model'):'No model loaded';
    const resolved=state?.textures?.filter?.(t=>t&&t.canvas&&!t.error).length||0,total=state?.textures?.length||0;
    if(textureState)textureState.textContent=model?`${resolved}/${total} model texture(s) ready`:'Current Texture Paint document';
    if(imageState)imageState.textContent=`${editor.width} × ${editor.height}`;
    const subtitle=$('#saveDialogSubtitle');if(subtitle)subtitle.textContent=model?'Save the model, its external textures, or one synchronized package.':'No model is loaded. Save Textures exports the current Texture Paint image.';
    [modelBtn,texBtn,comboBtn].forEach(b=>b?.classList.remove('suggested'));if(preselect==='model')modelBtn?.classList.add('suggested');else if(preselect==='textures')texBtn?.classList.add('suggested');else if(preselect==='package')comboBtn?.classList.add('suggested');
    updateSaveQualityNote();if(!dialog.open)dialog.showModal();return true;
  }
  async function runSaveChoice(choice){
    if(saveActionRunning)return false;saveActionRunning=true;const dialog=$('#saveDialog'),opts=getSaveTextureOptions(),model=window.WC3_MODEL_LAB?.getModel?.()||null;
    try{
      if(dialog?.open)dialog.close();
      if(choice==='model'){if(!model){alert('Open a model first.');return false;}return await window.WC3_MODEL_LAB.saveModel();}
      if(choice==='textures'){if(model)return await window.WC3_MODEL_LAB.exportTextures(opts);return await exportStandaloneTexture({...opts,format:opts.format==='keep'?'blp':opts.format});}
      if(choice==='package'){if(!model){alert('Open a model first.');return false;}return await window.WC3_MODEL_LAB.exportPackage(opts);}
      return false;
    }finally{saveActionRunning=false;}
  }
  async function saveCurrentWorkspace(){return openSaveDialog();}
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
  $('#zoomInBtn').addEventListener('click',()=>editor.setZoom(editor.zoom*1.25));$('#zoomOutBtn').addEventListener('click',()=>editor.setZoom(editor.zoom/1.25));$('#fitBtn').addEventListener('click',()=>editor.fitTo($('#canvasScroll') || $('#canvasStage')));
  $('#flipHBtn').addEventListener('click',()=>editor.transformActive('flipH'));$('#flipVBtn').addEventListener('click',()=>editor.transformActive('flipV'));$('#rotateLayerBtn').addEventListener('click',()=>editor.transformActive('rotate90'));$('#rotateDocBtn').addEventListener('click',()=>editor.rotateDocument90());
  $('#undoBtn').addEventListener('click',()=>{performUndo();});$('#redoBtn').addEventListener('click',()=>{performRedo();});
  $('#addLayerBtn').addEventListener('click',()=>editor.addLayer());$('#deleteLayerBtn').addEventListener('click',()=>editor.deleteActiveLayer());$('#duplicateLayerBtn').addEventListener('click',()=>editor.duplicateActiveLayer());$('#mergeDownBtn').addEventListener('click',()=>editor.mergeDown());$('#flattenBtn').addEventListener('click',()=>editor.flattenVisible());
  const layerOpacity=$('#layerOpacity');let layerOpacityHistoryArmed=false;
  const armLayerOpacityHistory=()=>{if(layerOpacityHistoryArmed)return;editor.pushHistory('Layer opacity');layerOpacityHistoryArmed=true;};
  layerOpacity.addEventListener('pointerdown',armLayerOpacityHistory);
  layerOpacity.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))armLayerOpacityHistory();});
  layerOpacity.addEventListener('input',e=>{if(!layerOpacityHistoryArmed)armLayerOpacityHistory();editor.setLayerOpacity(+e.target.value/100);});
  ['change','pointerup','pointercancel','blur'].forEach(type=>layerOpacity.addEventListener(type,()=>{layerOpacityHistoryArmed=false;}));
  $('#blendMode').addEventListener('change',e=>{editor.pushHistory('Blend mode');editor.setLayerBlend(e.target.value);});

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
  $('#createDocBtn').addEventListener('click',e=>{e.preventDefault();const w=+$('#newWidth').value,h=+$('#newHeight').value;if(!w||!h||w>8192||h>8192){alert('Use dimensions between 1 and 8192 px.');return;}if(hasUnsaved('texture')&&!confirmDiscardUnsaved('create a new texture document',['texture']))return;editor.newDocument(w,h,$('#newBackground').value,false);currentName='texture';markSaved('texture');$('#formatStatus').textContent='RGBA';$('#newDialog').close();setStatus('New document');requestAnimationFrame(()=>fitTextureView({comfortable:true}));});

  $('#resizeBtn').addEventListener('click',()=>{$('#resizeWidth').value=editor.width;$('#resizeHeight').value=editor.height;$('#resizeDialog').dataset.ratio=editor.width/editor.height;$('#resizeDialog').showModal();});
  $('#resizeWidth').addEventListener('input',e=>{if($('#resizeLockAspect').checked)$('#resizeHeight').value=Math.max(1,Math.round(+e.target.value/($('#resizeDialog').dataset.ratio||1)));});
  $('#resizeHeight').addEventListener('input',e=>{if($('#resizeLockAspect').checked)$('#resizeWidth').value=Math.max(1,Math.round(+e.target.value*($('#resizeDialog').dataset.ratio||1)));});
  $('#confirmResizeBtn').addEventListener('click',e=>{e.preventDefault();editor.resizeImage(+$('#resizeWidth').value,+$('#resizeHeight').value,$('#resizeSmooth').checked);$('#resizeDialog').close();});
  $('#canvasSizeBtn').addEventListener('click',()=>{$('#canvasWidth').value=editor.width;$('#canvasHeight').value=editor.height;$('#canvasDialog').showModal();});
  $('#confirmCanvasBtn').addEventListener('click',e=>{e.preventDefault();editor.resizeCanvas(+$('#canvasWidth').value,+$('#canvasHeight').value,$('#canvasAnchor').value);$('#canvasDialog').close();});

  $('#openBtn').addEventListener('click',()=>{const module=document.body.dataset.module||'texture';if(module==='model'){const input=$('#modelFileInput');if(input){if(typeof input.showPicker==='function'){try{input.showPicker();return;}catch(_){}}input.click();return;}}if(module==='buttons'){const input=$('#buttonSourceInput');if(input){if(typeof input.showPicker==='function'){try{input.showPicker();return;}catch(_){}}input.click();return;}}$('#fileInput').click();});$('#fileInput').addEventListener('change',e=>{openFile(e.target.files[0]);e.target.value='';});$('#convertBtn').addEventListener('click',()=>$('#convertFileInput').click());$('#convertFileInput').addEventListener('change',e=>{quickConvertFile(e.target.files[0]);e.target.value='';});$('#importLayerBtn').addEventListener('click',()=>{const module=document.body.dataset.module||'texture';const input=module==='model'?$('#modelTextureInput'):$('#layerFileInput');if(!input)return;if(typeof input.showPicker==='function'){try{input.showPicker();return;}catch(_){}}input.click();});$('#layerFileInput').addEventListener('change',e=>{importLayer(e.target.files[0]);e.target.value='';});$('#saveProjectBtn').addEventListener('click',saveCurrentWorkspace);$('#saveOnlyModelBtn')?.addEventListener('click',()=>runSaveChoice('model'));$('#saveOnlyTexturesBtn')?.addEventListener('click',()=>runSaveChoice('textures'));$('#saveModelTexturesBtn')?.addEventListener('click',()=>runSaveChoice('package'));$('#saveTextureMaxSize')?.addEventListener('change',updateSaveQualityNote);$('#saveTextureFormat')?.addEventListener('change',updateSaveQualityNote);$('#saveTextureMipmaps')?.addEventListener('change',updateSaveQualityNote);$('#saveTextureQuality')?.addEventListener('input',updateSaveQualityNote);$('#saveTextureQuality')?.addEventListener('change',updateSaveQualityNote);$('#exportPngBtn').addEventListener('click',exportPNG);$('#exportBlpBtn').addEventListener('click',exportBLPDirect);$('#exportTgaBtn').addEventListener('click',exportTGADirect);$('#exportGameBtn').addEventListener('click',()=>openExportDialog('blp'));
  $('#gameExportFormat').addEventListener('change',updateExportFormatUI);$('#blpAlphaBits').addEventListener('change',refreshExportWarnings);$('#generateMipmaps').addEventListener('change',refreshExportWarnings);$('#confirmExportBtn').addEventListener('click',e=>{e.preventDefault();refreshExportWarnings();if($('#confirmExportBtn').disabled)return;$('#exportDialog').close();exportGame();});
  $('#defaultFileTypesBtn')?.addEventListener('click',async()=>{
    const bridge=window.WC3_FILE_ASSOCIATIONS;if(!bridge||typeof bridge.openDefaultApps!=='function'){alert('Windows file association controls are unavailable in this build.');return;}
    try{const r=await bridge.openDefaultApps();if(r&&r.ok)setStatus('Windows Default Apps opened · choose WC3 Asset Studio for BLP / TGA / MDL / MDX');else throw new Error(r&&r.error||'Could not open Default Apps.');}
    catch(e){window.WC3_LOG?.error?.('Windows Association','Could not open Default Apps',e);alert('Could not open Windows Default Apps.\n\n'+(e.message||e));}
  });

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
    openFile,
    openWindowsAssociatedPath,
    openSaveDialog,
    getSaveTextureOptions,
    exportStandaloneTexture,
    buildStandaloneTextureArtifact,
    buildPngArtifact,
    buildLayeredProjectBlob,
    getCurrentName: ()=>currentName,
    setCurrentName: name=>{ currentName=safeName(name||'texture'); },
    async openImageData(imageData, name, options={}){
      currentName = safeName(name || 'texture');
      await editor.loadImageData(imageData, currentName);
      setStatus(`Loaded texture: ${name || currentName}`);
      requestAnimationFrame(()=>fitTextureView({comfortable:options.comfortableFit!==false}));
      return currentName;
    },
    fitTextureView,
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
      buildIconSetPackage,
      encodeWarcraftIcon,
      expectedIconSize,
      updateIconPath,
      framePresets:ICON_FRAME_PRESETS,
      getFrameOptions:getIconFrameOptions,
      setFrameOptions:setIconFrameOptions,
    },
    notifyChange(){ updateUI(); renderLayers(); window.dispatchEvent(new CustomEvent('wc3-editor-change')); },
    refreshUndoUi,
    registerPendingSave,
    unsaved:Object.freeze({
      markDirty:markUnsaved,
      markSaved,
      hasUnsaved,
      confirmDiscard:confirmDiscardUnsaved,
      confirmDiscardNative:confirmDiscardUnsavedNative,
      registerPendingSave,
      snapshot:snapshotUnsaved,
      restore:restoreUnsaved,
      getState:()=>snapshotUnsaved(),
      summary:()=>unsavedSummary()
    }),
  };

  window.addEventListener('wc3-document-mutation',e=>{
    const label=String(e?.detail?.label||'Texture edit');
    markUnsaved(currentTextureUnsavedScope(),label);
  });
  syncUnsavedState();

  window.WC3_FILE_ASSOCIATIONS?.onOpenFile?.(filePath=>{enqueueWindowsAssociatedPath(filePath);});
  window.addEventListener('wc3-history-change',refreshUndoUi);
  window.addEventListener('resize',()=>updateUI());
  renderLayers();requestAnimationFrame(()=>fitTextureView({comfortable:true}));updateCompatibility();setStatus('Ready · PNG/JPG/JPEG/BLP1/TGA/DDS · Reforged');
})();
