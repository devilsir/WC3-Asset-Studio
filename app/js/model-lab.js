(function(){
  'use strict';
  const app = window.BLP_PAINT_APP;
  const modelCore = window.WAR3_MODEL_CORE;
  const geometry = window.MODEL_LAB_GEOMETRY;
  if(!app || !modelCore || !geometry) return;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const diag=(level,source,message,detail)=>{try{window.WC3_LOG?.[level]?.(source,message,detail);}catch(_){}};

  const DEFAULT_CAMERA_YAW = Math.PI / 2; // Warcraft authored forward is +X.
  const TEAM_COLORS = Object.freeze([
    {name:'Red',hex:'#ff0303'},{name:'Blue',hex:'#0042ff'},{name:'Teal',hex:'#1ce6b9'},{name:'Purple',hex:'#540081'},
    {name:'Yellow',hex:'#fffc01'},{name:'Orange',hex:'#fe8a0e'},{name:'Green',hex:'#20c000'},{name:'Pink',hex:'#e55bb0'},
    {name:'Gray',hex:'#959697'},{name:'Light Blue',hex:'#7ebff1'},{name:'Dark Green',hex:'#106246'},{name:'Brown',hex:'#4e2a04'},
    {name:'Maroon',hex:'#9b0000'},{name:'Navy',hex:'#0000c3'},{name:'Turquoise',hex:'#00eaff'},{name:'Violet',hex:'#be00fe'},
    {name:'Wheat',hex:'#ebcd87'},{name:'Peach',hex:'#f8a48b'},{name:'Mint',hex:'#bfff80'},{name:'Lavender',hex:'#dcb9eb'},
    {name:'Coal',hex:'#282828'},{name:'Snow',hex:'#ebf0ff'},{name:'Emerald',hex:'#00781e'},{name:'Peanut',hex:'#a46f33'}
  ]);

  const state = {
    mode: 'inspector',
    model: null,
    packageFiles: new Map(),
    textures: [],
    selectedTextureIndex: -1,
    selectedNodeId: -1,
    meshTriangles: [],
    pickedUv: null,
    paintDrag: false,
    orbitDrag: false,
    panDrag: false,
    viewportTool: 'rotate',
    pointer: { x: 0, y: 0 },
    camera: { yaw: DEFAULT_CAMERA_YAW, pitch: 0, roll: 0, zoom: 1, panX: 0, panY: 0, targetX: 0, targetY: 0, targetZ: 0, norm: 1 },
    animation: { playing: false, t: 0, lastTs: 0, elapsedMs: 0 },
    editorTextureIndex: -1,
    needsRender: true,
    lastRenderTs: 0,
    loading: false,
    interactingUntil: 0,
    geometryCache: { key: '', vertices: [], nodeMatrices: null, bounds: null },
    lastFastPreview: false,
    faceCache: new WeakMap(),
    glRenderer: null,
    textureRevision: 1,
    pickCache: { key:'', triangles:[] },
    gizmoVisible: false,
    gizmoHover: '',
    gizmoDrag: null,
    activePropPanel: 'setup',
    paintCursor: null,
    hoveredHit: null,
    paintTextureIndex: -1,
    paintHistory: [],
    paintRedo: [],
    maxPaintHistory: 25,
    uvView: { zoom:1, panX:0, panY:0, dragging:false, lastX:0, lastY:0 },
    debugPicking: false,
    teamColorIndex: 0,
    fxPreviewMode: false,
    fxPreviewStartedAt: 0,
    fxLastStatsLog: 0,
    photoMode: false,
    casc: { enabled:false, loading:false, verified:false, status:null, loaded:new Map(), effectModels:new Map(), effectRuntimes:new Map(), effectPreviews:new Map(), effectTextures:new Map(), missing:new Set(), lastError:'' },
    nextNodeId: 1,
    activeViewCameraId: '',
    textureDiscovery: { localFound:0, cascFound:0, missing:[], scannedFiles:0, truncated:false, source:'' },
  };

  function markDirty(){ state.needsRender = true; }
  function invalidatePickCache(){ state.pickCache={key:'',triangles:[]}; state.meshTriangles=[]; }
  function bumpTextureRevision(index=state.editorTextureIndex){
    state.textureRevision++;
    const slot=state.textures[index]; if(slot) slot.revision=(slot.revision||1)+1;
    if(state.glRenderer) state.glRenderer.textureRevision=-1;
    markDirty();
  }
  function syncEditorTextureToSlot(){
    const index=state.editorTextureIndex,slot=state.textures[index];
    if(index<0||!slot||!app.editor.width||!app.editor.height) return false;
    const source=app.getCompositeCanvas();
    if(!slot.canvas||slot.canvas.width!==source.width||slot.canvas.height!==source.height){slot.canvas=document.createElement('canvas');slot.canvas.width=source.width;slot.canvas.height=source.height;}
    const ctx=slot.canvas.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,slot.canvas.width,slot.canvas.height);ctx.drawImage(source,0,0);
    slot.imageData=ctx.getImageData(0,0,slot.canvas.width,slot.canvas.height);slot.width=slot.canvas.width;slot.height=slot.canvas.height;slot.edited=true;
    bumpTextureRevision(index);return true;
  }
  let textureUiRefreshPending=false;
  function scheduleTextureUiRefresh(){
    if(textureUiRefreshPending) return;
    textureUiRefreshPending=true;
    requestAnimationFrame(()=>{ textureUiRefreshPending=false; refreshTexturePreviews(); drawUvView(); updatePaintHitInfo(); });
  }
  function noteTextureMutation(){
    // The editor emits wc3-editor-change synchronously; that handler copies the
    // composite into the persistent texture slot used by GPU/UV/thumbnail.
    app.notifyChange();
  }
  function historyChanged(){
    const detail={scope:'model-paint',undo:state.paintHistory.length,redo:state.paintRedo.length,max:state.maxPaintHistory};
    window.dispatchEvent(new CustomEvent('wc3-history-change',{detail}));
  }
  function capturePaintSnapshot(index,label='3D paint'){
    const slot=state.textures[index];if(!slot||!slot.canvas)return null;
    const ctx=slot.canvas.getContext('2d',{willReadFrequently:true});
    let imageData;try{imageData=ctx.getImageData(0,0,slot.canvas.width,slot.canvas.height);}catch(e){diag('error','History','Could not capture Model Lab texture snapshot',{index,label,error:e});return null;}
    return {index,label,ref:slot.ref||'',width:slot.canvas.width,height:slot.canvas.height,imageData};
  }
  function pushPaintHistory(index,label='3D paint'){
    const snap=capturePaintSnapshot(index,label);if(!snap)return false;
    state.paintHistory.push(snap);if(state.paintHistory.length>state.maxPaintHistory)state.paintHistory.shift();state.paintRedo=[];
    diag('info','History',`Model snapshot · ${label}`,{textureIndex:index,texture:snap.ref,undo:state.paintHistory.length,redo:0,max:state.maxPaintHistory});
    historyChanged();return true;
  }
  async function restorePaintSnapshot(snap){
    if(!snap||!state.textures[snap.index])return false;
    const slot=state.textures[snap.index];
    if(!slot.canvas)slot.canvas=document.createElement('canvas');slot.canvas.width=snap.width;slot.canvas.height=snap.height;
    const ctx=slot.canvas.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,snap.width,snap.height);ctx.putImageData(snap.imageData,0,0);
    slot.imageData=ctx.getImageData(0,0,snap.width,snap.height);slot.width=snap.width;slot.height=snap.height;slot.error='';slot.edited=true;slot.revision=(slot.revision||1)+1;
    state.selectedTextureIndex=snap.index;state.editorTextureIndex=snap.index;state.paintTextureIndex=-1;
    await app.openImageData(slot.imageData,basename(slot.ref)||`texture_${snap.index+1}`);
    bumpTextureRevision(snap.index);renderTextureList();updateSelectedTextureLabel();drawUvView();sync3DPaintUi();scheduleTextureUiRefresh();markDirty();
    return true;
  }
  async function undoPaint(){
    if(!state.paintHistory.length){diag('warn','History','Model Ctrl+Z requested with empty history',{undo:0,redo:state.paintRedo.length,max:state.maxPaintHistory});historyChanged();return false;}
    const prev=state.paintHistory.pop(),current=capturePaintSnapshot(prev.index,'Redo');if(current)state.paintRedo.push(current);
    const ok=await restorePaintSnapshot(prev);diag('info','History',`Model undo · ${prev.label}`,{textureIndex:prev.index,texture:prev.ref,undo:state.paintHistory.length,redo:state.paintRedo.length,max:state.maxPaintHistory});historyChanged();return ok;
  }
  async function redoPaint(){
    if(!state.paintRedo.length){diag('warn','History','Model Ctrl+Y requested with empty redo stack',{undo:state.paintHistory.length,redo:0,max:state.maxPaintHistory});historyChanged();return false;}
    const next=state.paintRedo.pop(),current=capturePaintSnapshot(next.index,'Undo');if(current){state.paintHistory.push(current);if(state.paintHistory.length>state.maxPaintHistory)state.paintHistory.shift();}
    const ok=await restorePaintSnapshot(next);diag('info','History','Model redo',{textureIndex:next.index,texture:next.ref,undo:state.paintHistory.length,redo:state.paintRedo.length,max:state.maxPaintHistory});historyChanged();return ok;
  }
  function modelHistoryState(){return {undo:state.paintHistory.length,redo:state.paintRedo.length,max:state.maxPaintHistory};}
  const MODEL_ZOOM_MIN = 0.02;
  const MODEL_ZOOM_MAX = 100;
  function zoomFromSlider(value){ return clamp(Math.pow(10, (+value || 0) / 50), MODEL_ZOOM_MIN, MODEL_ZOOM_MAX); }
  function sliderFromZoom(zoom){ return clamp(Math.round(50 * Math.log10(clamp(zoom, MODEL_ZOOM_MIN, MODEL_ZOOM_MAX))), -100, 100); }
  function updateZoomUi(){
    const range=$('#modelZoomRange'), label=$('#modelZoomLabel');
    if(range) range.value=String(sliderFromZoom(state.camera.zoom));
    if(label){
      const z=state.camera.zoom;
      label.textContent = z >= 10 ? `${z.toFixed(0)}×` : z >= 1 ? `${z.toFixed(2)}×` : `${(z*100).toFixed(z<.1?1:0)}%`;
    }
  }
  function setModelZoom(value, interaction=true){
    state.camera.zoom=clamp(value,MODEL_ZOOM_MIN,MODEL_ZOOM_MAX);
    if(interaction) state.interactingUntil=performance.now()+140;
    updateZoomUi(); invalidatePickCache(); markDirty();
  }

  function currentDisplayBounds(){
    if(!state.model) return {center:{x:0,y:0,z:0},size:1,min:{x:0,y:0,z:0},max:{x:1,y:1,z:1}};
    const geom=getDeformedGeometry();
    return geom&&geom.bounds&&geom.bounds.min ? geom.bounds : state.model.bounds;
  }

  function setCameraTargetFromBounds(bounds=currentDisplayBounds()){
    const b=bounds||{center:{x:0,y:0,z:0},size:1};
    const c=b.center||{x:0,y:0,z:0};
    state.camera.targetX=Number.isFinite(c.x)?c.x:0;
    state.camera.targetY=Number.isFinite(c.y)?c.y:0;
    state.camera.targetZ=Number.isFinite(c.z)?c.z:0;
    state.camera.norm=Math.max(1,Number.isFinite(b.size)?b.size:1);
  }
  function cameraTarget(){
    return {x:state.camera.targetX||0,y:state.camera.targetY||0,z:state.camera.targetZ||0};
  }
  function getModelBoundsCorners(){
    const b=currentDisplayBounds();
    if(!b||!b.min||!b.max) return [{x:0,y:0,z:0}];
    const {min,max}=b;
    return [
      {x:min.x,y:min.y,z:min.z},{x:max.x,y:min.y,z:min.z},{x:min.x,y:max.y,z:min.z},{x:max.x,y:max.y,z:min.z},
      {x:min.x,y:min.y,z:max.z},{x:max.x,y:min.y,z:max.z},{x:min.x,y:max.y,z:max.z},{x:max.x,y:max.y,z:max.z},
      b.center||{x:(min.x+max.x)/2,y:(min.y+max.y)/2,z:(min.z+max.z)/2}
    ];
  }
  function measureProjectedModel(canvas,yaw=state.camera.yaw,pitch=state.camera.pitch){
    const points=getModelBoundsCorners();
    const t=geometry.createOrthoTransform({...state.camera,yaw,pitch,zoom:1,panX:0,panY:0},canvas,{zoom:1,panX:0,panY:0});
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const p of points){const v=t.worldToView(p),sx=v.x*t.pxScale,sy=v.y*t.pxScale;minX=Math.min(minX,sx);maxX=Math.max(maxX,sx);minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);}
    if(!Number.isFinite(minX))return{halfW:1,halfH:1};
    return{halfW:Math.max(Math.abs(minX),Math.abs(maxX),1),halfH:Math.max(Math.abs(minY),Math.abs(maxY),1)};
  }
  function fitZoomForCanvas(canvas,padding=0.84){
    if(!canvas||!state.model) return 1;
    const ext=measureProjectedModel(canvas,state.camera.yaw,state.camera.pitch);
    const fitX=(canvas.width*0.5*padding)/Math.max(1,ext.halfW);
    const fitY=(canvas.height*0.5*padding)/Math.max(1,ext.halfH);
    return clamp(Math.min(fitX,fitY),0.08,8);
  }
  function frameModelView(resetAngles=false){
    const canvas=$('#model3dCanvas');
    if(!canvas||!state.model) return;
    getDeformedGeometry();
    setCameraTargetFromBounds(currentDisplayBounds());
    if(resetAngles){
      state.camera.yaw=DEFAULT_CAMERA_YAW;
      state.camera.pitch=0;
      state.camera.roll=0;
    }
    state.camera.panX=0;
    state.camera.panY=0;
    setModelZoom(fitZoomForCanvas(canvas,0.84), false);
    state.interactingUntil=performance.now()+180;
    invalidatePickCache();
    markDirty();
  }
  function resetCamera(){
    frameModelView(true);
    state.activeViewCameraId='';
    state.gizmoDrag=null;
    state.gizmoHover='';
    const canvas=$('#model3dCanvas');
    if(canvas) canvas.style.cursor='';
    markDirty();
  }

  function vecFromArray(v,fallback={x:0,y:0,z:0}){
    if(Array.isArray(v)) return {x:Number(v[0])||0,y:Number(v[1])||0,z:Number(v[2])||0};
    if(v&&typeof v==='object') return {x:Number(v.x)||0,y:Number(v.y)||0,z:Number(v.z)||0};
    return {x:fallback.x||0,y:fallback.y||0,z:fallback.z||0};
  }
  function ensureAuthoringIds(){
    if(!state.model) return;
    let maxNode=-1;
    (state.model.nodes||[]).forEach((n,i)=>{ const id=Number.isFinite(+n.id)?+n.id:i; n.id=id; if(n.objectId==null) n.objectId=id; maxNode=Math.max(maxNode,id); if(!n.name) n.name=`${n.type||'Node'}_${id}`; });
    state.nextNodeId=Math.max(state.nextNodeId||1,maxNode+1,1);
    (state.model.cameras||[]).forEach((c,i)=>{ if(!c.__cameraId) c.__cameraId=`cam-${i}-${Math.random().toString(36).slice(2,7)}`; if(!c.name) c.name=`Camera ${i+1}`; if(!Array.isArray(c.position)) c.position=[0,0,0]; if(!Array.isArray(c.targetPosition)) c.targetPosition=[0,0,0]; });
  }
  function nextAuthorNodeId(){ ensureAuthoringIds(); return state.nextNodeId++; }
  function findCameraRef(ref){
    if(!state.model) return null;
    ensureAuthoringIds();
    const cams=state.model.cameras||[];
    return cams.find((c,i)=>String(c.__cameraId)===String(ref)||String(c.id)===String(ref)||String(i)===String(ref)||String(`C${i}`)===String(ref))||null;
  }
  function authoringPivot(){
    if(state.model && state.selectedNodeId!=null){
      const node=(state.model.nodes||[]).find(n=>String(n.id)===String(state.selectedNodeId));
      if(node){ const matrices=getDeformedGeometry().nodeMatrices; const m=matrices.get(node.id)||matIdentity(); return matPoint(m,node.pivot||{x:0,y:0,z:0}); }
      const cam=findCameraRef(state.selectedNodeId); if(cam){ const t=vecFromArray(cam.targetPosition); return {x:t.x,y:t.y,z:t.z}; }
    }
    return cameraTarget();
  }
  function createCameraFromCurrentView(){
    if(!state.model) return null;
    ensureAuthoringIds();
    const basis=geometry.cameraBasis(state.camera);
    const target=cameraTarget();
    const dist=Math.max(96,(state.camera.norm||96)*1.2/Math.max(0.18,state.camera.zoom||1));
    const pos={x:target.x-basis.forward.x*dist,y:target.y-basis.forward.y*dist,z:target.z-basis.forward.z*dist};
    const cam={name:`Camera_${(state.model.cameras||[]).length+1}`,position:[pos.x,pos.y,pos.z],targetPosition:[target.x,target.y,target.z],fieldOfView:0.7,farClippingPlane:5000,nearClippingPlane:8,rotation:state.camera.roll||0,tracks:[],__cameraId:`cam-custom-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,__custom:true};
    state.model.cameras=(state.model.cameras||[]); state.model.cameras.push(cam); state.selectedNodeId=cam.__cameraId; state.activeViewCameraId='';
    diag('info','Authoring','Camera created from current view',{name:cam.name,position:cam.position,target:cam.targetPosition});
    renderEverything(); markDirty();
    return cam;
  }
  function lookThroughCamera(ref=state.selectedNodeId){
    const cam=findCameraRef(ref); if(!cam) return false;
    const p=vecFromArray(cam.position),t=vecFromArray(cam.targetPosition); const dx=t.x-p.x,dy=t.y-p.y,dz=t.z-p.z; const len=Math.max(1e-6,Math.hypot(dx,dy,dz));
    state.camera.yaw=Math.atan2(dx,dy); state.camera.pitch=Math.asin(clamp(dz/len,-1,1)); state.camera.roll=Number(cam.rotation)||0; state.camera.targetX=t.x; state.camera.targetY=t.y; state.camera.targetZ=t.z; state.camera.panX=0; state.camera.panY=0; state.activeViewCameraId=cam.__cameraId;
    const canvas=$('#model3dCanvas'); if(canvas){ const fit=fitZoomForCanvas(canvas,0.88); const distNorm=Math.max(48,len*0.8); state.camera.zoom=clamp(fit*(Math.max(64,state.camera.norm||64)/distNorm),MODEL_ZOOM_MIN,MODEL_ZOOM_MAX); updateZoomUi(); }
    state.selectedNodeId=cam.__cameraId; diag('info','Authoring','Looking through model camera',{name:cam.name,position:cam.position,target:cam.targetPosition}); renderAuthoringUI(); markDirty();
    return true;
  }
  function releaseCameraView(){ if(state.activeViewCameraId){ diag('info','Authoring','Exited camera view',{camera:state.activeViewCameraId}); } state.activeViewCameraId=''; frameModelView(false); renderAuthoringUI(); markDirty(); }
  async function addParticleEmitter2(){
    if(!state.model) return null;
    ensureAuthoringIds();
    let textureId=state.selectedTextureIndex>=0?state.selectedTextureIndex:0;
    if(!(state.model.textureDefs||[])[textureId]){
      state.model.textureDefs=(state.model.textureDefs||[]); state.model.textures=(state.model.textures||[]);
      const fallbackPath='Textures\\Clouds8x8Fire.blp';
      state.model.textureDefs.push({path:fallbackPath,replaceableId:0}); state.model.textures.push(fallbackPath);
      state.textures.push({ref:fallbackPath,resolvedName:fallbackPath,canvas:null,imageData:null,width:0,height:0,error:'',revision:1});
      textureId=state.model.textureDefs.length-1;
    }
    const pivot=authoringPivot(); const id=nextAuthorNodeId();
    const emitter={id,objectId:id,type:'ParticleEmitter2',__custom:true,name:`ParticleEmitter2_${id}`,parentId:-1,flags:0,pivot:{x:pivot.x,y:pivot.y,z:pivot.z},textureId,filterMode:1,filterModeName:'Additive',rows:8,columns:8,headOrTail:0,emissionRate:48,speed:32,variation:0.2,latitude:24,gravity:0,lifeSpan:0.9,width:32,length:32,timeMiddle:0.45,segmentScaling:[0.22,0.42,0.10],segmentAlphas:[255,190,0],segmentColors:[[1,0.78,0.22],[1,0.35,0.08],[0.3,0.02,0]],replaceableId:0};
    state.model.nodes.push(emitter); state.model.particleEmitters2=(state.model.particleEmitters2||[]); state.model.particleEmitters2.push(emitter); state.selectedNodeId=id; state.fxPreviewMode=true; state.fxPreviewStartedAt=performance.now();
    diag('info','Authoring','ParticleEmitter2 created',{id,name:emitter.name,textureId,pivot:emitter.pivot});
    renderEverything(); if(state.casc.enabled) await loadCascEffectAssets(true); markDirty(); return emitter;
  }
  async function addEffectAttachment(){
    if(!state.model) return null;
    const defaultPath='Abilities\Spells\Other\TalkToMe\TalkToMe.mdx';
    const path=(prompt('Effect model path (.mdx / .mdl):',defaultPath)||'').trim(); if(!path) return null;
    const name=(prompt('Attachment name:',`Effect_${(state.model.nodes||[]).length+1}`)||'').trim()||`Effect_${(state.model.nodes||[]).length+1}`;
    const pivot=authoringPivot(); const id=nextAuthorNodeId();
    const node={id,objectId:id,type:'Attachment',__custom:true,name,parentId:-1,flags:0,pivot:{x:pivot.x,y:pivot.y,z:pivot.z},path};
    state.model.nodes.push(node); state.selectedNodeId=id; diag('info','Authoring','Attachment effect created',{id,name,path,pivot:node.pivot}); renderEverything(); if(state.casc.enabled) await loadCascEffectAssets(true); markDirty(); return node;
  }
  function performanceMode(){ const el=$('#modelPerformanceMode'); return el ? el.value : 'auto'; }
  function fastPreviewActive(){
    const mode=performanceMode();
    if(mode==='quality') return false;
    if(mode==='speed') return true;
    const triCount=state.glRenderer&&state.glRenderer.triangles ? state.glRenderer.triangles : (state.model?(state.model.geosets||[]).reduce((n,g)=>n+(g.faces||[]).length,0):0);
    return performance.now()<state.interactingUntil || (state.animation.playing && triCount>12000);
  }
  function materialLayersForView(mat,layers){ return layers; }
  function invalidateGeometryCache(){ state.geometryCache={key:'',vertices:[],nodeMatrices:null,bounds:null}; invalidatePickCache(); if(state.glRenderer) state.glRenderer.geometryKey=''; }
  function nextPaint(){ return new Promise(resolve => requestAnimationFrame(() => resolve())); }
  function setLoadStatus(message, kind='info'){
    const el = $('#modelLoadStatus');
    if(!el) return;
    el.textContent = message || '';
    if(message)diag(kind==='error'?'error':kind==='ok'?'info':'debug','Model Lab',message);
    el.dataset.kind = kind;
    el.classList.toggle('bad', kind === 'error');
    el.classList.toggle('ok', kind === 'ok');
  }
  function sync3DPaintUi(){
    const ed=app.editor,tip=ed.brushTip||'soft',tool=ed.tool||'brush';
    document.querySelectorAll('[data-model-paint-tool]').forEach(el=>el.classList.toggle('active',el.dataset.modelPaintTool===tool));
    const badge=$('#modelPaintModeBadge');if(badge)badge.textContent=tool.charAt(0).toUpperCase()+tool.slice(1)+' · '+tip.charAt(0).toUpperCase()+tip.slice(1);
    const color=$('#modelPaintColor');if(color)color.value=ed.color||'#ffcc33';const colorHex=$('#modelPaintColorHex');if(colorHex)colorHex.textContent=(ed.color||'#ffcc33').toUpperCase();
    const pairs=[['modelPaintSize',ed.brushSize||24,'modelPaintSizeValue',v=>`${Math.round(v)} px`],['modelPaintOpacity',Math.round((ed.brushOpacity==null?1:ed.brushOpacity)*100),'modelPaintOpacityValue',v=>`${Math.round(v)}%`],['modelPaintHardness',Math.round((ed.brushHardness==null?0.85:ed.brushHardness)*100),'modelPaintHardnessValue',v=>`${Math.round(v)}%`],['modelPaintSpacing',Math.round(ed.brushSpacing==null?18:ed.brushSpacing),'modelPaintSpacingValue',v=>`${Math.round(v)}%`],['modelPaintDensity',Math.round(ed.brushDensity==null?55:ed.brushDensity),'modelPaintDensityValue',v=>`${Math.round(v)}%`],['modelPaintAngle',Math.round(ed.brushAngle==null?-35:ed.brushAngle),'modelPaintAngleValue',v=>`${Math.round(v)}°`],['modelPaintTolerance',Math.round(ed.bucketTolerance==null?18:ed.bucketTolerance),'modelPaintToleranceValue',v=>`${Math.round(v)}`]];
    pairs.forEach(([id,v,out,fmt])=>{const el=$('#'+id);if(el)el.value=String(v);const o=$('#'+out);if(o)o.textContent=fmt(v);});
    const tipSel=$('#modelPaintTip');if(tipSel)tipSel.value=tip;const pa=$('#modelPaintPreserveAlpha');if(pa)pa.checked=!!ed.preserveAlpha;const ao=$('#modelPaintAlphaOnly');if(ao)ao.checked=!!ed.alphaOnly;
    const optionSets={
      brush:['color','size','opacity','hardness','spacing','tip'],eraser:['size','opacity','hardness','spacing','tip'],clone:['size','opacity','hardness','spacing','tip'],smudge:['size','opacity','hardness','spacing','tip'],blur:['size','opacity','hardness','spacing','tip'],bucket:['color','tolerance'],eyedropper:[]
    };
    const opts=new Set(optionSets[tool]||[]);if(['scatter','spray','airbrush','chalk','noise'].includes(tip)&&!['bucket','eyedropper'].includes(tool)){opts.add('density');opts.add('spacing');}if(['calligraphy','slash'].includes(tip)&&!['bucket','eyedropper'].includes(tool))opts.add('angle');
    document.querySelectorAll('[data-paint-option]').forEach(el=>el.classList.toggle('paint-option-hidden',!opts.has(el.dataset.paintOption)));
    const canvas=$('#model3dCanvas');if(canvas){const enabled=can3DPaint();canvas.classList.toggle('paint-enabled',enabled);canvas.classList.toggle('paint-mode',enabled);if(!enabled&&!state.photoMode)canvas.style.cursor=state.viewportTool==='move'?'grab':'crosshair';}
    const tex=$('#modelPaintTextureName');if(tex){const slot=state.textures[state.editorTextureIndex>=0?state.editorTextureIndex:state.selectedTextureIndex];tex.textContent=slot?basename(slot.ref):'No texture loaded';}
  }

  function basename(path){ return String(path || '').replace(/\\/g, '/').split('/').pop() || ''; }
  function normalizePath(path){ return String(path || '').replace(/\\/g, '/').toLowerCase(); }
  function escapeHtml(str){ return String(str || '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t){ return a + (b - a) * t; }
  function signedArea2(a,b,c){ return (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x); }

  function normalizeQuat(q){ const l=Math.hypot(q[0],q[1],q[2],q[3])||1; return q.map(v=>v/l); }
  function slerpQuat(a,b,t){
    a=normalizeQuat(a); b=normalizeQuat(b); let dot=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];
    if(dot<0){ b=b.map(v=>-v); dot=-dot; }
    if(dot>0.9995) return normalizeQuat(a.map((v,i)=>lerp(v,b[i],t)));
    const th=Math.acos(clamp(dot,-1,1)), s=Math.sin(th); const w1=Math.sin((1-t)*th)/s, w2=Math.sin(t*th)/s;
    return [a[0]*w1+b[0]*w2,a[1]*w1+b[1]*w2,a[2]*w1+b[2]*w2,a[3]*w1+b[3]*w2];
  }
  function hermite(p0,m0,p1,m1,t){ const t2=t*t,t3=t2*t; return (2*t3-3*t2+1)*p0+(t3-2*t2+t)*m0+(-2*t3+3*t2)*p1+(t3-t2)*m1; }
  function bezier(p0,c0,c1,p1,t){ const u=1-t; return u*u*u*p0+3*u*u*t*c0+3*u*t*t*c1+t*t*t*p1; }
  // gl-matrix compatible spherical quadrangle interpolation used by modern MDX viewers
  // for quaternion Hermite/Bezier tracks.
  function sqlerpQuat(a,outTan,inTan,b,t){
    const p=slerpQuat(a,b,t);
    const q=slerpQuat(outTan||a,inTan||b,t);
    return slerpQuat(p,q,2*t*(1-t));
  }
  function interpolateTrackPair(track,a,b,frame,isQuat){
    if(!a||!b) return a?a.value.slice():b?b.value.slice():null;
    if(track.interpolation==='DontInterp'||a.frame===b.frame) return a.value.slice();
    const span=Math.max(1,b.frame-a.frame),t=clamp((frame-a.frame)/span,0,1);
    if(isQuat){
      if((track.interpolation==='Hermite'||track.interpolation==='Bezier')&&a.outTan&&b.inTan){
        return normalizeQuat(sqlerpQuat(a.value,a.outTan,b.inTan,b.value,t));
      }
      return slerpQuat(a.value,b.value,t);
    }
    return a.value.map((v,i)=>{
      if(track.interpolation==='Hermite'&&a.outTan&&b.inTan)return hermite(v,a.outTan[i]??v,b.value[i],b.inTan[i]??b.value[i],t);
      if(track.interpolation==='Bezier'&&a.outTan&&b.inTan)return bezier(v,a.outTan[i]??v,b.inTan[i]??b.value[i],t);
      return lerp(v,b.value[i],t);
    });
  }
  function samplePreparedTrack(track,ks,frame,isQuat){
    if(!ks||!ks.length)return null;
    if(frame<=ks[0].frame)return ks[0].value.slice();
    if(frame>=ks[ks.length-1].frame)return ks[ks.length-1].value.slice();
    let a=ks[0],b=ks[1];
    for(let i=0;i<ks.length-1;i++){
      if(frame>=ks[i].frame&&frame<=ks[i+1].frame){a=ks[i];b=ks[i+1];break;}
    }
    return interpolateTrackPair(track,a,b,frame,isQuat);
  }
  function sampleTrack(track,frame,isQuat){
    if(!track||!track.keys||!track.keys.length)return null;
    if(track.globalSequenceId!=null&&track.globalSequenceId>=0&&state.model&&state.model.globalSequences){
      const duration=state.model.globalSequences[track.globalSequenceId];
      if(duration>0)frame=state.animation.elapsedMs%duration;
    }
    return samplePreparedTrack(track,track.keys,frame,isQuat);
  }
  function sampleNodeTrack(track,frame,isQuat,defaultValue){
    if(!track||!track.keys||!track.keys.length)return defaultValue.slice();
    // Global sequences ignore the selected animation and run on their own GLBS period.
    if(track.globalSequenceId!=null&&track.globalSequenceId>=0)return sampleTrack(track,frame,isQuat)||defaultValue.slice();
    const seq=currentSequence();
    if(!seq)return defaultValue.slice();
    // Warcraft samples only keys that actually live inside the selected sequence window.
    // If there are none, use the rest value. If there are some, clamp to the nearest
    // in-window key before/after the keyed span rather than borrowing keys from another sequence.
    const ks=track.keys.filter(k=>k.frame>=seq.start&&k.frame<=seq.end);
    if(!ks.length)return defaultValue.slice();
    return samplePreparedTrack(track,ks,frame,isQuat)||defaultValue.slice();
  }
  function scaleCollapsesOutsideSequence(track){
    if(!track||!track.keys||track.keys.length<2||track.globalSequenceId>=0||!state.model)return false;
    const first=track.keys[0].value,last=track.keys[track.keys.length-1].value;
    const zero=v=>Array.isArray(v)&&Math.hypot(...v)<1e-4;
    if(!zero(first)||!zero(last))return false;
    const a=track.keys[0].frame,b=track.keys[track.keys.length-1].frame;
    return (state.model.sequences||[]).some(seq=>a>=seq.start&&b<=seq.end);
  }

  function matIdentity(){ return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
  function matMul(a,b){ const o=new Array(16).fill(0); for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)o[r*4+c]+=a[r*4+k]*b[k*4+c]; return o; }
  function matTranslate(x,y,z){ const m=matIdentity(); m[3]=x;m[7]=y;m[11]=z; return m; }
  function matScale(x,y,z){ return [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]; }
  function matQuat(q){ q=normalizeQuat(q||[0,0,0,1]); const [x,y,z,w]=q,xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z; return [1-2*(yy+zz),2*(xy-wz),2*(xz+wy),0, 2*(xy+wz),1-2*(xx+zz),2*(yz-wx),0, 2*(xz-wy),2*(yz+wx),1-2*(xx+yy),0, 0,0,0,1]; }
  function matPoint(m,p){ return {x:m[0]*p.x+m[1]*p.y+m[2]*p.z+m[3], y:m[4]*p.x+m[5]*p.y+m[6]*p.z+m[7], z:m[8]*p.x+m[9]*p.y+m[10]*p.z+m[11]}; }


  // Independent animation sampler used by effect/spell models loaded from CASC.
  // These models have their own SEQS/GLBS/node tracks and must not inherit the
  // currently selected sequence from the character being viewed.
  function sampleModelTrack(track,model,seq,frame,elapsedMs,isQuat=false,defaultValue=null){
    if(!track||!track.keys||!track.keys.length)return defaultValue==null?null:(Array.isArray(defaultValue)?defaultValue.slice():[defaultValue]);
    let keys=track.keys,at=frame;
    if(track.globalSequenceId!=null&&track.globalSequenceId>=0){
      const duration=(model&&model.globalSequences||[])[track.globalSequenceId];
      if(duration>0)at=Math.max(0,elapsedMs||0)%duration;
    }else if(seq){
      keys=track.keys.filter(k=>k.frame>=seq.start&&k.frame<=seq.end);
      if(!keys.length)return defaultValue==null?null:(Array.isArray(defaultValue)?defaultValue.slice():[defaultValue]);
    }
    return samplePreparedTrack(track,keys,at,isQuat)||(defaultValue==null?null:(Array.isArray(defaultValue)?defaultValue.slice():[defaultValue]));
  }
  function modelTrackScalar(track,model,seq,frame,elapsedMs,fallback){
    const v=sampleModelTrack(track,model,seq,frame,elapsedMs,false,[fallback]);
    return v&&Number.isFinite(v[0])?v[0]:fallback;
  }
  function preferredCascEffectSequences(model){
    const seqs=(model&&model.sequences)||[];
    return {
      birth:seqs.find(s=>/^birth(?:\s|$)/i.test(String(s.name||'')))||null,
      stand:seqs.find(s=>/^stand(?:\s|$)/i.test(String(s.name||'')))||null,
      first:seqs[0]||null
    };
  }
  function cascEffectFrame(runtime,nowMs){
    const model=runtime&&runtime.parsed;if(!model)return{seq:null,frame:0,elapsedMs:0};
    const elapsedMs=Math.max(0,(nowMs-(state.fxPreviewStartedAt||nowMs)));
    const pref=runtime.sequencePrefs||preferredCascEffectSequences(model);runtime.sequencePrefs=pref;
    let seq=null,local=elapsedMs;
    if(pref.birth&&pref.birth.length>0&&elapsedMs<pref.birth.length){seq=pref.birth;local=elapsedMs;}
    else if(pref.stand&&pref.stand.length>0){seq=pref.stand;local=(elapsedMs-(pref.birth&&pref.birth.length||0))%pref.stand.length;}
    else if(pref.first&&pref.first.length>0){seq=pref.first;local=elapsedMs%pref.first.length;}
    const frame=seq?seq.start+clamp(local,0,Math.max(0,seq.length)):0;
    return{seq,frame,elapsedMs};
  }
  function modelNodeLocalMatrix(model,node,seq,frame,elapsedMs){
    if(!node)return matIdentity();
    const tr=sampleModelTrack(node.translation,model,seq,frame,elapsedMs,false,[0,0,0]);
    const rot=sampleModelTrack(node.rotation,model,seq,frame,elapsedMs,true,[0,0,0,1]);
    const sc=sampleModelTrack(node.scaling,model,seq,frame,elapsedMs,false,[1,1,1]);
    const p=node.pivot||{x:0,y:0,z:0};
    return matMul(matTranslate(p.x,p.y,p.z),matMul(matTranslate(tr[0]||0,tr[1]||0,tr[2]||0),matMul(matQuat(rot),matMul(matScale(sc[0]??1,sc[1]??1,sc[2]??1),matTranslate(-p.x,-p.y,-p.z)))));
  }
  function buildModelNodeMatrices(model,seq,frame,elapsedMs){
    const map=new Map(),nodes=(model&&model.nodes)||[],byId=new Map(nodes.map(n=>[n.id,n]));
    function world(id,stack=new Set()){
      if(map.has(id))return map.get(id);
      const node=byId.get(id);if(!node)return matIdentity();
      const local=modelNodeLocalMatrix(model,node,seq,frame,elapsedMs);let parent=matIdentity(),pid=node.parentId;
      if(pid>=0&&pid!==id&&byId.has(pid)&&!stack.has(pid)){const next=new Set(stack);next.add(id);parent=world(pid,next);}
      const m=matMul(filterInheritedMatrix(parent,node.flags||0),local);map.set(id,m);return m;
    }
    nodes.forEach(n=>world(n.id,new Set()));return map;
  }
  function modelResolvedSkinIds(model,skinIndex){
    const bones=model&&model.bones||[],bone=bones[skinIndex];if(bone&&Number.isFinite(bone.id))return[bone.id];
    const legacy=bones.find(b=>b&&b.id===skinIndex);return legacy&&Number.isFinite(legacy.id)?[legacy.id]:[];
  }
  function modelClassicNodeIds(geo,index){
    const groupId=geo.vertexGroups&&geo.vertexGroups[index],raw=groupId!=null&&geo.matrixGroups?geo.matrixGroups[groupId]:null;
    return raw&&raw.length?raw.map(Number).filter(id=>Number.isFinite(id)&&id>=0):[];
  }
  function skinModelVertex(model,geo,index,nodeMatrices){
    const v=geo.vertices[index];if(!v)return v;
    if(geo.skin&&geo.skin.length>=(index+1)*8){
      const o=index*8;let x=0,y=0,z=0,total=0;
      for(let k=0;k<4;k++){
        const w=(geo.skin[o+4+k]||0)/255;if(w<=0)continue;
        const p=transformByNodeIds(v,modelResolvedSkinIds(model,geo.skin[o+k]),nodeMatrices);if(!p)continue;
        x+=p.x*w;y+=p.y*w;z+=p.z*w;total+=w;
      }
      if(total>0)return{x:x/total,y:y/total,z:z/total};
    }
    return transformByNodeIds(v,modelClassicNodeIds(geo,index),nodeMatrices)||v;
  }
  function modelGeosetRenderState(model,geoIndex,seq,frame,elapsedMs){
    const ga=(model&&model.geosetAnimations||[]).find(x=>x.geosetId===geoIndex);if(!ga)return{alpha:1,color:[1,1,1]};
    const alpha=modelTrackScalar(ga.tracks&&ga.tracks.KGAO,model,seq,frame,elapsedMs,ga.alpha==null?1:ga.alpha);
    const color=sampleModelTrack(ga.tracks&&ga.tracks.KGAC,model,seq,frame,elapsedMs,false,ga.color||[1,1,1]);
    return{alpha:clamp(alpha,0,1),color:color||ga.color||[1,1,1]};
  }
  function modelLayerState(model,mat,layer,geoIndex,seq,frame,elapsedMs){
    const tracks=layer&&layer.tracks||{};
    const tex=sampleModelTrack(tracks.KMTF,model,seq,frame,elapsedMs,false,null);
    const textureId=tex&&Number.isFinite(tex[0])?Math.round(tex[0]):(layer&&layer.textureId!=null?layer.textureId:(mat.textureId||0));
    const alpha=clamp(modelTrackScalar(tracks.KMTA,model,seq,frame,elapsedMs,layer&&layer.alpha!=null?layer.alpha:1),0,1);
    const gs=modelGeosetRenderState(model,geoIndex,seq,frame,elapsedMs);
    const mode=(layer&&layer.filterMode)||mat.filterMode||'None';let composite='source-over';
    if(mode==='Additive'||mode==='AddAlpha')composite='lighter';else if(mode==='Modulate'||mode==='Modulate2x')composite='multiply';
    let uvTrans=[0,0],uvScale=[1,1],uvAngle=0;const taId=layer&&layer.textureAnimationId!=null?layer.textureAnimationId:-1,ta=taId>=0?(model.textureAnimations||[])[taId]:null;
    if(ta&&ta.tracks){
      const tr=sampleModelTrack(ta.tracks.KTAT,model,seq,frame,elapsedMs,false,null);if(tr)uvTrans=[tr[0]||0,tr[1]||0];
      const sc=sampleModelTrack(ta.tracks.KTAS,model,seq,frame,elapsedMs,false,null);if(sc)uvScale=[sc[0]||1,sc[1]||1];
      const rq=sampleModelTrack(ta.tracks.KTAR,model,seq,frame,elapsedMs,true,null);if(rq)uvAngle=2*Math.atan2(rq[2]||0,rq[3]||1);
    }
    return{textureId,alpha:alpha*gs.alpha,color:gs.color,composite,mode,uvTrans,uvScale,uvAngle,unshaded:!!((layer&&layer.unshaded)||mat.unshaded)};
  }
  function effectAnchorMatrix(parentMatrix,pivot){
    const m=parentMatrix||matIdentity(),p=pivot||{x:0,y:0,z:0},world=matPoint(m,p);
    return[m[0],m[1],m[2],world.x, m[4],m[5],m[6],world.y, m[8],m[9],m[10],world.z, 0,0,0,1];
  }

  function setMode(mode){
    state.mode = mode;
    $$('#rightPanelTabs button').forEach(b => b.classList.toggle('active', b.dataset.panelTab === mode));
    $('#inspectorPanels').classList.toggle('hidden', mode !== 'inspector');
    $('#modelLabPanels').classList.toggle('hidden', mode !== 'model');
    const sanity = $('#sanityPanels'); if(sanity) sanity.classList.toggle('hidden', mode !== 'sanity');
    markDirty();
  }

  async function imageDataFromArrayBuffer(name, buffer){
    const lower = String(name || '').toLowerCase();
    if(lower.endsWith('.blp')) return (await BLP.decode(buffer)).imageData;
    if(lower.endsWith('.tga')) return TGA.decode(buffer).imageData;
    if(lower.endsWith('.dds')) return DDS.decode(buffer).imageData;
    const type = lower.endsWith('.png') ? 'image/png'
      : lower.match(/\.jpe?g$/) ? 'image/jpeg'
      : lower.endsWith('.webp') ? 'image/webp'
      : lower.endsWith('.gif') ? 'image/gif'
      : 'image/bmp';
    const blob = new Blob([buffer], { type });
    const bitmap = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    if(bitmap.close) bitmap.close();
    return ctx.getImageData(0, 0, c.width, c.height);
  }

  function imageDataToCanvas(imageData){
    const c = document.createElement('canvas');
    c.width = imageData.width; c.height = imageData.height;
    c.getContext('2d', { willReadFrequently: true }).putImageData(imageData, 0, 0);
    return c;
  }

  function computeBounds(geosets){ return modelCore.computeBounds(geosets); }

  function parseMDL(buffer){ return modelCore.parseMDL(buffer); }
  function parseMDX(buffer){ return modelCore.parseMDX(buffer); }

  // Model Lab v30 refactor uses authored Warcraft UVs internally.
  // WAR3_MODEL_CORE <= 8.x converted V at parse time (v = 1 - authoredV).
  // A partial/overlaid update can therefore combine a legacy parser with the new
  // renderer and invert every texture. Normalize legacy parser output once here so
  // the renderer/paint/UV inspector always receive one canonical convention.
  function normalizeParsedUvConvention(parsed){
    if(!parsed) return parsed;
    const authored = modelCore.uvConvention === 'warcraft-authored';
    parsed.__uvCoreVersion = String(modelCore.version || 'unknown');
    parsed.__uvSourceConvention = authored ? 'warcraft-authored' : 'legacy-v-flipped';
    parsed.__uvNormalizedFromLegacy = !authored;
    if(authored) return parsed;

    for(const geo of parsed.geosets || []){
      const seenArrays = new Set();
      const arrays = [];
      for(const set of geo.uvSets || []) if(set && !seenArrays.has(set)){ seenArrays.add(set); arrays.push(set); }
      if(geo.tverts && !seenArrays.has(geo.tverts)){ seenArrays.add(geo.tverts); arrays.push(geo.tverts); }
      for(const arr of arrays){
        for(const uv of arr || []){
          if(uv && Number.isFinite(uv.v)) uv.v = 1 - uv.v;
        }
      }
    }
    return parsed;
  }

  async function unzipEntries(arrayBuffer){
    const bytes = new Uint8Array(arrayBuffer);
    let eocd = -1;
    for(let i=bytes.length-22; i>=Math.max(0, bytes.length-65558); i--){
      if(bytes[i]===0x50 && bytes[i+1]===0x4b && bytes[i+2]===0x05 && bytes[i+3]===0x06){ eocd=i; break; }
    }
    if(eocd < 0) throw new Error('ZIP central directory not found.');
    const view = new DataView(arrayBuffer);
    const total = view.getUint16(eocd + 10, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    const entries = [];
    let ptr = centralOffset;
    for(let i=0; i<total; i++){
      if(view.getUint32(ptr, true) !== 0x02014b50) throw new Error('Invalid ZIP central entry.');
      const method = view.getUint16(ptr + 10, true);
      const compressedSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = new TextDecoder().decode(bytes.slice(ptr + 46, ptr + 46 + nameLen));
      ptr += 46 + nameLen + extraLen + commentLen;
      const localView = new DataView(arrayBuffer, localOffset);
      if(localView.getUint32(0, true) !== 0x04034b50) throw new Error('Invalid ZIP local header.');
      const lNameLen = localView.getUint16(26, true);
      const lExtraLen = localView.getUint16(28, true);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      let raw;
      if(method === 0) raw = compressed;
      else if(method === 8){
        if(typeof DecompressionStream === 'undefined') throw new Error('This browser does not support ZIP inflate in this build.');
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        raw = new Uint8Array(await new Response(stream).arrayBuffer());
      } else throw new Error(`ZIP compression method ${method} is not supported.`);
      entries.push({ name, data: raw });
    }
    return entries;
  }

  function arrayBufferOf(entry){ return entry.data.buffer.slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength); }

  function resolveTextureRef(ref){
    const wanted = basename(ref).toLowerCase();
    if(!wanted) return null;
    for(const [name, entry] of state.packageFiles.entries()){
      const base = basename(name).toLowerCase();
      if(base === wanted || normalizePath(name).endsWith('/' + wanted) || normalizePath(name) === wanted) return { name, entry };
    }
    return null;
  }

  function teamColorInfo(){ return TEAM_COLORS[clamp(state.teamColorIndex|0,0,TEAM_COLORS.length-1)] || TEAM_COLORS[0]; }
  function hexRgb01(hex){ const v=parseInt(String(hex||'#ffffff').replace('#',''),16); return [((v>>16)&255)/255,((v>>8)&255)/255,(v&255)/255]; }
  function makeTeamReplaceableCanvas(glow=false){
    const size=glow?128:16,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');
    const color=teamColorInfo().hex;
    if(!glow){ ctx.fillStyle=color;ctx.fillRect(0,0,size,size);return canvas; }
    const g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size*.5);g.addColorStop(0,color);g.addColorStop(.32,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,size,size);return canvas;
  }
  function applyTeamReplaceables(slots){
    const defs=(state.model&&state.model.textureDefs)||[];
    for(let i=0;i<slots.length;i++){
      const rid=Number(defs[i]&&defs[i].replaceableId||0);if(rid!==1&&rid!==2)continue;
      const canvas=makeTeamReplaceableCanvas(rid===2),ctx=canvas.getContext('2d',{willReadFrequently:true});
      slots[i].canvas=canvas;slots[i].imageData=ctx.getImageData(0,0,canvas.width,canvas.height);slots[i].width=canvas.width;slots[i].height=canvas.height;slots[i].format=rid===1?'TEAM COLOR':'TEAM GLOW';slots[i].resolvedName=`Warcraft ${rid===1?'Team Color':'Team Glow'} · ${teamColorInfo().name}`;slots[i].error='';slots[i].revision=(slots[i].revision||0)+1;
    }
    return slots;
  }
  function refreshTeamColorTextures(){
    applyTeamReplaceables(state.textures);
    state.textureRevision++;
    if(state.glRenderer) state.glRenderer.textureRevision=-1;
    const sw=$('#modelTeamColorSwatch');if(sw)sw.style.background=teamColorInfo().hex;
    scheduleTextureUiRefresh();markDirty();
  }
  function initTeamColorUi(){
    const sel=$('#modelTeamColorSelect');if(!sel)return;sel.innerHTML='';TEAM_COLORS.forEach((c,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${i+1}. ${c.name}`;sel.appendChild(o);});sel.value=String(state.teamColorIndex);const sw=$('#modelTeamColorSwatch');if(sw)sw.style.background=teamColorInfo().hex;
  }

  async function buildTextureSlots(refs){
    const slots = [];
    for(let i=0; i<refs.length; i++){
      const ref = refs[i];
      const match = resolveTextureRef(ref);
      let imageData = null, error = '';
      if(match){
        try { imageData = await imageDataFromArrayBuffer(match.name, arrayBufferOf(match.entry)); }
        catch(e){ error = e.message || 'Texture decode failed.'; }
      }
      const canvas=imageData ? imageDataToCanvas(imageData) : null;
      const ext=(basename(ref||match&&match.name||'').split('.').pop()||'').toUpperCase();
      slots.push({
        ref,
        resolvedName: match ? match.name : '',
        imageData,
        canvas,
        width: imageData ? imageData.width : 0,
        height: imageData ? imageData.height : 0,
        format: ext || '—',
        revision: 1,
        edited: false,
        error
      });
    }
    return applyTeamReplaceables(slots);
  }

  async function refreshMissingTextureSlotsFromPackage(){
    const defs=state.model&&state.model.textureDefs||[];
    if(!defs.length)return;
    for(let i=0;i<defs.length;i++){
      const existing=state.textures[i];
      if(existing&&existing.canvas)continue;
      const ref=defs[i]&&defs[i].path||'';
      const match=resolveTextureRef(ref);
      if(!match)continue;
      try{
        const imageData=await imageDataFromArrayBuffer(match.name,arrayBufferOf(match.entry));
        if(!imageData)continue;
        const canvas=imageDataToCanvas(imageData),slot=existing||{ref,resolvedName:'',imageData:null,canvas:null,width:0,height:0,format:'—',revision:1,error:''};
        slot.ref=ref;slot.resolvedName=match.name;slot.imageData=imageData;slot.canvas=canvas;slot.width=imageData.width;slot.height=imageData.height;slot.format=(basename(ref||match.name).split('.').pop()||'').toUpperCase()||'—';slot.error='';slot.revision=(slot.revision||1)+1;
        state.textures[i]=slot;
      }catch(e){if(existing)existing.error=e.message||'Texture decode failed.';}
    }
    applyTeamReplaceables(state.textures);
  }

  function cascBridge(){ return window.WC3_CASC || null; }
  function cascArtSet(){ return state.model && ((state.model.formatVersion||0)>=900 || (state.model.materials||[]).some(m=>/reforged|hd|de/i.test(String(m.layout||'')))) ? 'auto-hd' : 'classic'; }
  function arrayBufferFromIpc(data){
    if(data instanceof ArrayBuffer)return data;
    if(ArrayBuffer.isView(data))return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
    if(data&&data.type==='Buffer'&&Array.isArray(data.data))return new Uint8Array(data.data).buffer;
    return null;
  }
  function localFilesBridge(){ return window.WC3_LOCAL_FILES || null; }
  function referencedTextureDefs(model=state.model){
    const defs=(model&&model.textureDefs)||[];
    const out=[];
    for(let i=0;i<defs.length;i++){
      const d=defs[i]||{},rid=Number(d.replaceableId||0),ref=String(d.path||'').trim();
      if(!ref||rid===1||rid===2)continue;
      out.push({index:i,ref});
    }
    return out;
  }
  function unresolvedModelTextures(){
    const out=[];
    for(const {index,ref} of referencedTextureDefs()){
      const slot=state.textures[index];
      if(!slot||!slot.canvas||slot.error)out.push({index,ref,error:slot&&slot.error||''});
    }
    return out;
  }
  async function autoLoadLocalModelTextures(file, parsed){
    const bridge=localFilesBridge();
    const refs=[];
    for(const d of (parsed&&parsed.textureDefs)||[]){
      const rid=Number(d&&d.replaceableId||0),ref=String(d&&d.path||'').trim();
      if(ref&&rid!==1&&rid!==2&&!refs.some(x=>normalizePath(x)===normalizePath(ref)))refs.push(ref);
    }
    const result={ok:false,files:[],missing:refs,scannedFiles:0,truncated:false};
    if(!file||!refs.length||!bridge||typeof bridge.scanModelTextures!=='function')return result;
    try{
      const reply=await bridge.scanModelTextures(file,refs);
      if(!reply||!reply.ok){diag('warn','Model Textures','Automatic local texture scan unavailable',{reason:reply&&reply.reason||'Unknown',requested:refs});return {...result,...(reply||{})};}
      let loaded=0;
      for(const rec of reply.files||[]){
        const ab=arrayBufferFromIpc(rec&&rec.data);if(!ab)continue;
        const key=String(rec.requestedPath||rec.relativePath||rec.resolvedPath||'').trim();if(!key)continue;
        state.packageFiles.set(key,{name:rec.resolvedPath||rec.relativePath||key,data:new Uint8Array(ab),autoResolved:true});loaded++;
      }
      diag('info','Model Textures','Referenced textures auto-loaded from model folder',{requested:refs.length,loaded,missing:(reply.missing||[]).length,scannedFiles:reply.scannedFiles||0,truncated:!!reply.truncated,modelPath:reply.modelPath||''});
      return {...reply,loaded};
    }catch(e){diag('error','Model Textures','Automatic local texture scan failed',e);return {...result,error:e.message||String(e)};}
  }
  async function autoLoadMissingModelTexturesFromCasc(){
    if(!state.model||!state.casc.enabled)return {found:0,attempted:0};
    const missing=unresolvedModelTextures();if(!missing.length)return {found:0,attempted:0};
    const bridge=cascBridge();if(!bridge)return {found:0,attempted:0};
    let st;try{st=await bridge.status();}catch(_){return {found:0,attempted:0};}
    if(!st||!st.ready)return {found:0,attempted:0};
    try{
      const artSet=cascArtSet(),req=missing.map(x=>({path:x.ref,kind:'effect-texture',artSet}));
      const results=await readCascRequests(req);let found=0;
      for(const asset of results)if(addCascAssetToPackage(asset))found++;
      if(found){await refreshMissingTextureSlotsFromPackage();bumpTextureRevision();}
      diag(found?'info':'debug','Model Textures','CASC fallback for model textures finished',{attempted:req.length,found,missing:req.length-found});
      return {found,attempted:req.length};
    }catch(e){diag('warn','Model Textures','CASC fallback for model textures failed',e);return {found:0,attempted:missing.length,error:e.message||String(e)};}
  }
  function missingTextureMessage(missing){
    const refs=(missing||[]).map(x=>typeof x==='string'?x:x.ref).filter(Boolean);
    const shown=refs.slice(0,18),more=Math.max(0,refs.length-shown.length);
    return `The model was loaded, but ${refs.length} referenced texture${refs.length===1?' was':'s were'} not found automatically.\n\n${shown.map(x=>'• '+x).join('\n')}${more?`\n• …and ${more} more`:''}\n\nPlace the textures in the model folder/subfolders or use “Add Textures”.`;
  }
  function notifyMissingModelTextures(){
    const missing=unresolvedModelTextures();state.textureDiscovery.missing=missing.map(x=>x.ref);
    if(!missing.length)return false;
    diag('warn','Model Textures','Model loaded with unresolved referenced textures',{missing:missing.map(x=>x.ref)});
    alert(missingTextureMessage(missing));return true;
  }

  function effectModelPaths(){
    if(!state.model)return [];
    const out=[];
    for(const n of state.model.nodes||[]){
      if((n.type==='Attachment'||n.type==='ParticleEmitter'||n.type==='ParticleEmitterPopcorn')&&n.path) out.push(n.path);
    }
    for(const f of state.model.faceEffects||[]) if(f&&f.path) out.push(f.path);
    return [...new Set(out.map(x=>String(x||'').trim()).filter(Boolean))];
  }
  function effectTexturePaths(){
    if(!state.model)return [];
    const defs=state.model.textureDefs||[],out=[];
    for(const n of state.model.nodes||[]){
      if(n.type==='ParticleEmitter2'&&n.textureId>=0&&defs[n.textureId]&&defs[n.textureId].path)out.push(defs[n.textureId].path);
      if(n.type==='RibbonEmitter'&&n.materialId>=0){
        const mat=(state.model.materials||[])[n.materialId];for(const layer of (mat&&mat.layers)||[]){const ids=[layer.textureId,layer.emissiveTextureId,layer.teamColorTextureId].filter(x=>Number.isInteger(x)&&x>=0);for(const id of ids)if(defs[id]&&defs[id].path)out.push(defs[id].path);}
      }
    }
    return [...new Set(out.map(x=>String(x||'').trim()).filter(Boolean))];
  }
  let lastCascStatusLog='';
  function setCascStatusUi(message,kind=''){
    const el=$('#modelCascStatus');if(!el)return;el.textContent=message||'CASC FX resolver is off.';el.classList.remove('ready','loading','error');if(kind)el.classList.add(kind);
    const key=`${kind}|${message}`;if(message&&key!==lastCascStatusLog){lastCascStatusLog=key;diag(kind==='error'?'error':kind==='loading'?'debug':'info','CASC',message);}
  }
  async function refreshCascStatus(){
    const bridge=cascBridge();
    if(!bridge){state.casc.status={ready:false,message:'CASC bridge is unavailable in this build.'};setCascStatusUi(state.casc.status.message,'error');return state.casc.status;}
    try{state.casc.status=await bridge.status();diag('debug','CASC','Status response',state.casc.status);}
    catch(e){state.casc.status={ready:false,message:e.message||String(e)};diag('error','CASC','Status request failed',e);}
    const enabled=$('#modelUseCascEffects')&&$('#modelUseCascEffects').checked;
    if(state.casc.loading)setCascStatusUi('Reading referenced FX / Spell assets from local Warcraft III CASC…','loading');
    else if(state.casc.status.ready)setCascStatusUi(`${enabled?(state.casc.verified?'VERIFIED':'Connected · awaiting asset verification'):'Ready'} · ${state.casc.status.message}`,'ready');
    else setCascStatusUi(state.casc.status.message||'CASC FX resolver is not configured.',state.casc.status.platformReady===false?'':'error');
    return state.casc.status;
  }
  function addCascAssetToPackage(asset){
    const ab=arrayBufferFromIpc(asset&&asset.data);if(!asset||!asset.found||!ab){if(asset)diag('warn','CASC','Referenced asset not found',{requestedPath:asset.requestedPath,resolvedPath:asset.resolvedPath||''});return false;}
    const key=asset.resolvedPath||asset.requestedPath;state.packageFiles.set(key,{name:key,data:new Uint8Array(ab)});state.casc.loaded.set(normalizePath(asset.requestedPath),{...asset,data:ab});
    diag('info','CASC','Referenced asset loaded',{requestedPath:asset.requestedPath,resolvedPath:key,size:ab.byteLength});return true;
  }
  async function readCascRequests(requests){
    const bridge=cascBridge();if(!bridge||!requests.length)return [];
    const results=[];diag('info','CASC','Reading referenced assets',{count:requests.length,requests:requests.map(r=>({path:r.path,kind:r.kind,artSet:r.artSet}))});
    for(let i=0;i<requests.length;i+=24){const part=requests.slice(i,i+24);const reply=await bridge.readAssets(part);results.push(...((reply&&reply.results)||[]));}
    diag('info','CASC','Referenced asset read finished',{count:results.length,found:results.filter(r=>r.found).length,missing:results.filter(r=>!r.found).length});return results;
  }

  async function buildCascEffectRuntime(meta){
    if(!meta||!meta.parsed)return null;
    const model=meta.parsed,textures=[];
    for(let i=0;i<(model.textureDefs||[]).length;i++){
      const def=model.textureDefs[i]||{},rid=Number(def.replaceableId||0);
      if(rid===1||rid===2){textures[i]=makeTeamReplaceableCanvas(rid===2);continue;}
      const ref=def.path||'';if(!ref){textures[i]=null;continue;}
      const match=resolveTextureRef(ref);if(!match){textures[i]=null;continue;}
      try{const img=await imageDataFromArrayBuffer(match.name,arrayBufferOf(match.entry));textures[i]=img?imageDataToCanvas(img):null;}
      catch(e){textures[i]=null;diag('warn','CASC Animation','Effect model texture decode failed',{effect:meta.path,texture:ref,error:e});}
    }
    const sequencePrefs=preferredCascEffectSequences(model);
    const trackCount=(model.nodes||[]).reduce((n,x)=>n+Object.values(x.tracks||{}).filter(Boolean).length,0)
      +(model.geosetAnimations||[]).reduce((n,x)=>n+Object.values(x.tracks||{}).filter(Boolean).length,0)
      +(model.materials||[]).reduce((n,m)=>n+(m.layers||[]).reduce((a,l)=>a+Object.values(l.tracks||{}).filter(Boolean).length,0),0);
    const runtime={...meta,textures,sequencePrefs,trackCount};
    state.casc.effectRuntimes.set(normalizePath(meta.path),runtime);
    diag('info','CASC Animation','Real CASC effect model ready',{effect:meta.path,resolvedPath:meta.resolvedPath||'',sequences:(model.sequences||[]).map(s=>s.name),sequenceCount:(model.sequences||[]).length,nodeTracks:trackCount,geosets:(model.geosets||[]).length,particleEmitters2:(model.particleEmitters2||[]).length,texturesDecoded:textures.filter(Boolean).length,texturesTotal:textures.length});
    return runtime;
  }
  async function loadCascEffectAssets(force=false){
    if(!state.model||!state.casc.enabled||state.casc.loading)return;
    const bridge=cascBridge();if(!bridge)return;
    const status=await refreshCascStatus();if(!status||!status.ready){setCascStatusUi((status&&status.message)||'Connect CASC first.','error');return;}
    const modelPaths=effectModelPaths(),texturePaths=effectTexturePaths();
    if(!force&&!modelPaths.length&&!texturePaths.length){setCascStatusUi('CASC connected · this model does not reference external FX/Spell assets.','ready');return;}
    state.casc.loading=true;state.casc.verified=false;state.casc.lastError='';state.casc.missing.clear();setCascStatusUi(`Reading ${modelPaths.length} FX model path(s) and ${texturePaths.length} emitter texture(s)…`,'loading');
    try{
      const artSet=cascArtSet();
      const firstReq=[...modelPaths.map(path=>({path,kind:'effect',artSet})),...texturePaths.map(path=>({path,kind:'effect-texture',artSet}))];
      const first=await readCascRequests(firstReq);first.forEach(a=>{if(!addCascAssetToPackage(a))state.casc.missing.add(normalizePath(a.requestedPath));});
      state.casc.effectModels.clear();state.casc.effectRuntimes.clear();state.casc.effectPreviews.clear();state.casc.effectTextures.clear();
      let emitterTexturesDecoded=0;
      for(const pth of texturePaths){
        const rec=state.casc.loaded.get(normalizePath(pth));if(!rec||!rec.data){diag('warn','FX','Emitter texture missing after CASC read',{path:pth});continue;}
        try{
          const img=await imageDataFromArrayBuffer(rec.resolvedPath||pth,rec.data);
          if(img){const c=imageDataToCanvas(img);state.casc.effectTextures.set(normalizePath(pth),c);state.casc.effectTextures.set(normalizePath(rec.resolvedPath||pth),c);emitterTexturesDecoded++;diag('info','FX','Emitter texture decoded',{requested:pth,resolved:rec.resolvedPath||pth,width:img.width,height:img.height,bytes:rec.data.byteLength});}
          else diag('warn','FX','Emitter texture decoder returned no image',{path:pth,resolved:rec.resolvedPath||pth});
        }catch(e){diag('error','FX','Emitter texture decode failed',{path:pth,resolved:rec.resolvedPath||pth,error:e});}
      }
      const nested=[];
      for(const pth of modelPaths){
        const rec=state.casc.loaded.get(normalizePath(pth));if(!rec||!rec.data)continue;
        if(!/\.(mdx|mdl)$/i.test(rec.resolvedPath||pth))continue;
        try{
          const parsed=/\.mdl$/i.test(rec.resolvedPath||pth)?parseMDL(rec.data):parseMDX(rec.data);state.casc.effectModels.set(normalizePath(pth),{path:pth,resolvedPath:rec.resolvedPath,parsed});
          for(const ref of parsed.textures||[])if(ref)nested.push({path:ref,kind:'effect-texture',artSet,owner:pth});
        }catch(e){diag('error','FX','CASC effect model parse failed',{path:pth,error:e});console.warn('CASC effect model parse failed:',pth,e);}
      }
      const uniqueNested=[];const seen=new Set();for(const r of nested){const k=normalizePath(r.path);if(!seen.has(k)){seen.add(k);uniqueNested.push(r);}}
      const second=await readCascRequests(uniqueNested.map(({path,kind,artSet})=>({path,kind,artSet})));second.forEach(a=>{if(!addCascAssetToPackage(a))state.casc.missing.add(normalizePath(a.requestedPath));});
      // Build actual animated runtimes for CASC MDX/MDL effect models. The old
      // implementation stopped at a single static texture preview, which made it
      // look as if CASC was connected while every visible animation was synthetic.
      for(const [key,meta] of state.casc.effectModels){
        await buildCascEffectRuntime(meta);
        for(const ref of meta.parsed.textures||[]){const match=resolveTextureRef(ref);if(!match)continue;try{const img=await imageDataFromArrayBuffer(match.name,arrayBufferOf(match.entry));if(img){state.casc.effectPreviews.set(key,imageDataToCanvas(img));diag('info','FX','External effect preview texture decoded',{effect:meta.path,texture:match.name,width:img.width,height:img.height});break;}}catch(e){diag('warn','FX','External effect preview texture decode failed',{effect:meta.path,texture:match.name,error:e});}
        }
      }
      await refreshMissingTextureSlotsFromPackage();bumpTextureRevision();
      const loaded=first.filter(x=>x.found).length+second.filter(x=>x.found).length,missing=state.casc.missing.size,totalRequested=firstReq.length+uniqueNested.length;
      const p2=(state.model.particleEmitters2||[]).length,animatedCascModels=[...state.casc.effectRuntimes.values()].filter(r=>(r.parsed.sequences||[]).length||(r.parsed.particleEmitters2||[]).length||r.trackCount).length;state.casc.verified=totalRequested===0||loaded>0;
      if(totalRequested>0&&loaded===0)setCascStatusUi(`CASC connected, but verification FAILED · 0/${totalRequested} referenced asset(s) could be read.`,'error');
      else setCascStatusUi(`CASC VERIFIED · ${loaded} asset(s) loaded · ${animatedCascModels} real CASC model animation(s) ready · ${emitterTexturesDecoded}/${texturePaths.length} emitter texture(s) decoded${missing?` · ${missing} unresolved`:''}.`,'ready');
      diag('info','FX','CASC assets connected to renderer',{particleEmitters2:p2,realAnimatedCascModels:animatedCascModels,emitterTexturePaths:texturePaths,decodedEmitterTextures:emitterTexturesDecoded,textureSlots:state.textures.map((s,i)=>({i,ref:s.ref,resolved:s.resolvedName,width:s.width,height:s.height,error:s.error||''})).filter(s=>texturePaths.some(p=>basename(p).toLowerCase()===basename(s.ref).toLowerCase()))});
      if(p2>0 && !state.fxPreviewMode){state.fxPreviewMode=true;state.fxPreviewStartedAt=performance.now();state.gizmoVisible=false;const firstP2=(state.model.particleEmitters2||[])[0];if(firstP2)state.selectedNodeId=firstP2.id;diag('info','FX','Animated FX preview auto-started after CASC load',{particleEmitters2:p2,fallbackAllowed:true,selectedEmitter:firstP2&&firstP2.name||''});}
      const fxBtn=$('#modelFxPreviewBtn');if(fxBtn)fxBtn.textContent=state.fxPreviewMode?'Stop FX preview':'Start animated FX preview';
      renderEverything();markDirty();
    }catch(e){state.casc.verified=false;state.casc.lastError=e.message||String(e);setCascStatusUi(`CASC error · ${state.casc.lastError}`,'error');diag('error','CASC','FX load failed',e);console.error('CASC FX load failed:',e);}
    finally{state.casc.loading=false;}
  }
  async function setupCasc(){
    const bridge=cascBridge();if(!bridge){setCascStatusUi('CASC bridge is unavailable in this build.','error');return;}
    setCascStatusUi('Opening CASC setup…','loading');
    try{
      state.casc.status=await bridge.setup();
      await refreshCascStatus();
      if(state.casc.status&&state.casc.status.ready){
        state.casc.enabled=true;
        const toggle=$('#modelUseCascEffects');if(toggle)toggle.checked=true;
        if(state.model)await loadCascEffectAssets(true);
      }
    }
    catch(e){setCascStatusUi(`CASC setup failed · ${e.message||e}`,'error');diag('error','CASC','Setup failed',e);}
  }

  async function loadModelBuffer(name, buffer, replaceFiles, sourceFile=null){
    if(replaceFiles) state.packageFiles = replaceFiles;
    // CASC results belong to the currently loaded model. Never let an effect,
    // unresolved-path warning, or preview sprite leak into the next model.
    state.casc.loaded.clear();
    state.casc.effectModels.clear();
    state.casc.effectRuntimes.clear();
    state.casc.effectPreviews.clear();
    state.casc.effectTextures.clear();
    state.casc.missing.clear();
    state.casc.verified=false;
    state.casc.lastError='';
    state.fxPreviewMode=false;
    state.fxPreviewStartedAt=0;
    state.paintHistory=[];state.paintRedo=[];historyChanged();
    const parsed = normalizeParsedUvConvention(String(name).toLowerCase().endsWith('.mdl') ? parseMDL(buffer) : parseMDX(buffer));
    state.model = {
      ...parsed,
      sourceName: name,
      displayName: parsed.name || basename(name),
      formatVersion: parsed.formatVersion || parsed.version || 800,
      geosets: parsed.geosets || [],
      materials: parsed.materials || [],
      textureDefs: parsed.textureDefs || [],
      sequences: parsed.sequences || [],
      globalSequences: parsed.globalSequences || [],
      textureAnimations: parsed.textureAnimations || [],
      geosetAnimations: parsed.geosetAnimations || [],
      pivots: parsed.pivots || [],
      nodes: parsed.nodes || [],
      cameras: parsed.cameras || [],
      faceEffects: parsed.faceEffects || [],
      bindPose: parsed.bindPose || [],
      unknownChunks: parsed.unknownChunks || [],
      bounds: parsed.bounds || computeBounds(parsed.geosets || []),
      sourceBuffer: buffer.slice ? buffer.slice(0) : buffer,
      __uvCoreVersion: parsed.__uvCoreVersion,
      __uvSourceConvention: parsed.__uvSourceConvention,
      __uvNormalizedFromLegacy: !!parsed.__uvNormalizedFromLegacy
    };
    ensureAuthoringIds();
    invalidateGeometryCache();
    state.faceCache=new WeakMap();
    state.textureDiscovery={localFound:0,cascFound:0,missing:[],scannedFiles:0,truncated:false,source:sourceFile?'local-file':(replaceFiles&&replaceFiles.size?'package':'')};
    if(sourceFile){
      const discovered=await autoLoadLocalModelTextures(sourceFile,parsed);
      state.textureDiscovery.localFound=Number(discovered&&discovered.loaded||0);
      state.textureDiscovery.scannedFiles=Number(discovered&&discovered.scannedFiles||0);
      state.textureDiscovery.truncated=!!(discovered&&discovered.truncated);
    }
    state.textures = await buildTextureSlots(parsed.textures || []);
    diag('info','Model Parser','Model parsed',{source:name,type:parsed.type,version:parsed.formatVersion||parsed.version||800,geosets:(parsed.geosets||[]).length,materials:(parsed.materials||[]).length,textures:(parsed.textures||[]).length,nodes:(parsed.nodes||[]).length,particleEmitters2:(parsed.particleEmitters2||[]).length,sequences:(parsed.sequences||[]).length,unknownChunks:(parsed.unknownChunks||[]).length});
    bumpTextureRevision();
    state.selectedTextureIndex = state.textures.length ? 0 : -1;
    state.editorTextureIndex = -1;
    const firstRigNode=(state.model.nodes||[]).find(n=>n.type==='Bone'||n.type==='Helper');
    state.selectedNodeId = firstRigNode ? firstRigNode.id : -1;
    state.animation.playing = false;
    state.animation.t = 0;
    state.animation.lastTs = 0;
    state.animation.elapsedMs = 0;
    const display = $('#modelDisplayMode');
    if(display && !state.textures.some(x => x && x.canvas)) display.value = 'solid';
    state.gizmoVisible = false;
    resetCamera();
    renderEverything();
    markDirty();
    if(state.casc.enabled){
      const textureCasc=await autoLoadMissingModelTexturesFromCasc();
      state.textureDiscovery.cascFound=Number(textureCasc&&textureCasc.found||0);
      await loadCascEffectAssets(true);
    }
    state.textureDiscovery.missing=unresolvedModelTextures().map(x=>x.ref);
  }

  async function openModelFile(file, options={}){
    if(!file || state.loading) return;
    state.loading = true;
    setMode('model');
    setLoadStatus(`Reading ${file.name}…`, 'info');
    app.showBusy('Loading model…');
    try {
      await nextPaint();
      const buffer = await file.arrayBuffer();
      if(buffer.byteLength < 4) throw new Error('The model file is empty or truncated.');
      setLoadStatus(`Parsing ${file.name} (${(buffer.byteLength/1024/1024).toFixed(2)} MB)…`, 'info');
      await nextPaint();
      const started = performance.now();
      await loadModelBuffer(file.name, buffer, new Map(), file);
      const ms = Math.round(performance.now() - started);
      const tris = (state.model.geosets || []).reduce((sum,g)=>sum+(g.faces||[]).length,0);
      const uvCompat=state.model.__uvNormalizedFromLegacy?` · legacy Core ${state.model.__uvCoreVersion} UV normalized`:'';
      const td=state.textureDiscovery||{},missing=unresolvedModelTextures();
      const autoBits=[];if(td.localFound)autoBits.push(`${td.localFound} texture${td.localFound===1?'':'s'} from folder`);if(td.cascFound)autoBits.push(`${td.cascFound} from CASC`);if(missing.length)autoBits.push(`${missing.length} missing`);
      setLoadStatus(`Loaded · ${state.model.geosets.length} geosets · ${tris.toLocaleString()} triangles · ${ms} ms${uvCompat}${autoBits.length?' · '+autoBits.join(' · '):''}`, missing.length?'info':'ok');
      app.setStatus(`Model loaded: ${file.name}${td.localFound?` · ${td.localFound} texture(s) auto-loaded`:''}${missing.length?` · ${missing.length} missing`:''}`);
      markDirty();
      if(options.warnMissing!==false)notifyMissingModelTextures();
    } catch(e){
      console.error('Model load failed:', e);
      const message = e && e.message ? e.message : String(e);
      setLoadStatus(`Could not load model: ${message}`, 'error');
      app.setStatus('Model load failed');
      alert('Could not load the model.\n\n' + message);
    } finally {
      state.loading = false;
      app.hideBusy();
    }
  }

  async function openModelZip(file){
    if(!file) return;
    app.showBusy('Reading ZIP package…');
    try {
      const entries = await unzipEntries(await file.arrayBuffer());
      const files = new Map(entries.filter(e => !e.name.endsWith('/')).map(e => [e.name, e]));
      const models = entries.filter(e => /\.(mdl|mdx)$/i.test(e.name));
      if(!models.length) throw new Error('No MDL or MDX file was found in the ZIP package.');
      await loadModelBuffer(models[0].name, arrayBufferOf(models[0]), files, null);
      if(state.model) state.model.summary += `\nZIP package files: ${files.size}`;
      renderEverything();
      setMode('model');
      app.setStatus(`ZIP package loaded: ${file.name}`);
      notifyMissingModelTextures();
    } catch(e){
      alert('Could not read the ZIP package.\n\n' + e.message);
    } finally { app.hideBusy(); }
  }

  async function addTextureFiles(fileList){
    const files = Array.from(fileList || []);
    if(!files.length) return;
    app.showBusy('Adding textures…');
    try {
      for(const file of files) state.packageFiles.set(file.name, { name:file.name, data:new Uint8Array(await file.arrayBuffer()) });
      if(state.model){
        state.textures = await buildTextureSlots(state.textures.map(t => t.ref));
        bumpTextureRevision();
        if(state.selectedTextureIndex >= state.textures.length) state.selectedTextureIndex = state.textures.length - 1;
        renderEverything();
        const display = $('#modelDisplayMode');
        if(display && display.value === 'solid' && state.textures.some(x => x && x.canvas)) display.value = 'textured';
        markDirty();
      }
      setMode('model');
      const stillMissing=state.model?unresolvedModelTextures():[];
      setLoadStatus(`${files.length} texture file(s) added${stillMissing.length?` · ${stillMissing.length} referenced texture(s) still missing`:''}`, stillMissing.length?'info':'ok');
      app.setStatus(`${files.length} texture file(s) added${stillMissing.length?` · ${stillMissing.length} still missing`:''}`);
    } catch(e){
      alert('Could not add textures.\n\n' + e.message);
    } finally { app.hideBusy(); }
  }

  function currentSequence(){
    if(!state.model) return null;
    const sel = $('#modelSequenceSelect');
    const idx = sel && sel.value !== '' ? +sel.value : -1;
    return idx >= 0 ? state.model.sequences[idx] || null : null;
  }

  function currentSequenceProgress(){
    const seq = currentSequence();
    if(!seq) return 0;
    return clamp(state.animation.t, 0, 1);
  }

  function currentFrame(){
    const seq=currentSequence();
    if(!seq) return 0;
    return seq.start + currentSequenceProgress() * seq.length;
  }

  function nodeLocalMatrix(node, frame){
    if(!node) return matIdentity();
    const mode=$('#modelAnimMode') ? $('#modelAnimMode').value : 'tracks';
    // Node tracks are sequence-bounded. Global sequences remain active independently,
    // while an unselected normal sequence displays the authored rest pose.
    const useTracks=mode==='tracks';
    const tr=useTracks ? sampleNodeTrack(node.translation,frame,false,[0,0,0]) : [0,0,0];
    const rot=useTracks ? sampleNodeTrack(node.rotation,frame,true,[0,0,0,1]) : [0,0,0,1];
    let sc=useTracks ? sampleNodeTrack(node.scaling,frame,false,[1,1,1]) : [1,1,1];
    if(useTracks&&currentSequence()&&scaleCollapsesOutsideSequence(node.scaling)){
      const seq=currentSequence(),hasKey=node.scaling.keys.some(k=>k.frame>=seq.start&&k.frame<=seq.end);
      if(!hasKey)sc=[0,0,0];
    }
    const p=node.pivot||{x:0,y:0,z:0};
    const T0=matTranslate(p.x,p.y,p.z), T1=matTranslate(-p.x,-p.y,-p.z);
    const A=matTranslate(tr?tr[0]:0,tr?tr[1]:0,tr?tr[2]:0);
    const R=matQuat(rot||[0,0,0,1]);
    const S=matScale(sc?sc[0]:1,sc?sc[1]:1,sc?sc[2]:1);
    return matMul(T0,matMul(A,matMul(R,matMul(S,T1))));
  }

  function decomposeAffineMatrix(m){
    const t={x:m[3],y:m[7],z:m[11]};
    let x={x:m[0],y:m[4],z:m[8]},y={x:m[1],y:m[5],z:m[9]},z={x:m[2],y:m[6],z:m[10]};
    let sx=Math.hypot(x.x,x.y,x.z)||1,sy=Math.hypot(y.x,y.y,y.z)||1,sz=Math.hypot(z.x,z.y,z.z)||1;
    x={x:x.x/sx,y:x.y/sx,z:x.z/sx};
    const dxy=x.x*y.x+x.y*y.y+x.z*y.z;y={x:y.x-dxy*x.x,y:y.y-dxy*x.y,z:y.z-dxy*x.z};
    const yl=Math.hypot(y.x,y.y,y.z)||1;y={x:y.x/yl,y:y.y/yl,z:y.z/yl};sy*=yl;
    let nz={x:x.y*y.z-x.z*y.y,y:x.z*y.x-x.x*y.z,z:x.x*y.y-x.y*y.x};
    const sign=(nz.x*z.x+nz.y*z.y+nz.z*z.z)<0?-1:1;z={x:nz.x*sign,y:nz.y*sign,z:nz.z*sign};sz*=sign;
    return {t,r:[x.x,y.x,z.x,0,x.y,y.y,z.y,0,x.z,y.z,z.z,0,0,0,0,1],s:{x:sx,y:sy,z:sz}};
  }

  function filterInheritedMatrix(parent,flags){
    if(!flags) return parent;
    const parts=decomposeAffineMatrix(parent),dontTranslation=!!(flags&0x1),dontRotation=!!(flags&0x2),dontScaling=!!(flags&0x4);
    const T=matTranslate(dontTranslation?0:parts.t.x,dontTranslation?0:parts.t.y,dontTranslation?0:parts.t.z);
    const R=dontRotation?matIdentity():parts.r;
    const S=dontScaling?matIdentity():matScale(parts.s.x,parts.s.y,parts.s.z);
    return matMul(T,matMul(R,S));
  }

  function buildNodeMatrices(){
    const map=new Map();
    if(!state.model) return map;
    const nodes=state.model.nodes||[],byId=new Map(nodes.map(n=>[n.id,n])),frame=currentFrame();
    function world(id,stack=new Set()){
      if(map.has(id)) return map.get(id);
      const node=byId.get(id);if(!node)return matIdentity();
      const local=nodeLocalMatrix(node,frame);let parent=matIdentity(),pid=node.parentId;
      if(pid>=0&&pid!==id&&byId.has(pid)&&!stack.has(pid)){const next=new Set(stack);next.add(id);parent=world(pid,next);}
      // DontInherit is applied to the parent's authored world transform before the
      // child's local pivot transform. The same result is consumed by skinning and rig.
      const inherited=filterInheritedMatrix(parent,node.flags||0),m=matMul(inherited,local);map.set(id,m);return m;
    }
    nodes.forEach(n=>world(n.id,new Set()));return map;
  }

  function resolvedSkinIds(geo,skinIndex){
    // Current Reforged files address SKIN by BONE-chunk order. Some old/custom
    // exporters wrote objectIds instead, so keep a conservative fallback only when
    // the official index is out of range.
    const bones=state.model&&state.model.bones||[];
    const bone=bones[skinIndex];
    if(bone&&Number.isFinite(bone.id))return [bone.id];
    const legacy=bones.find(b=>b&&b.id===skinIndex);
    return legacy&&Number.isFinite(legacy.id)?[legacy.id]:[];
  }

  function classicNodeIdsForVertex(geo,index){
    const groupId=geo.vertexGroups&&geo.vertexGroups[index];
    const raw=groupId!=null&&geo.matrixGroups?geo.matrixGroups[groupId]:null;
    if(!raw||!raw.length)return [];
    // GNDX -> MTGC -> MATS resolves directly to Warcraft ObjectIds. Never reinterpret
    // MATS as an index in the BONE array (that array indexing belongs to Reforged SKIN).
    return raw.map(Number).filter(id=>Number.isFinite(id)&&id>=0);
  }

  function transformByNodeIds(v,ids,nodeMatrices){
    if(!ids||!ids.length) return null;
    let x=0,y=0,z=0,n=0; const seen=new Set();
    for(const raw of ids){
      const id=Number(raw); if(!Number.isFinite(id)||id<0||seen.has(id))continue; seen.add(id);
      const m=nodeMatrices.get(id); if(!m)continue;
      const p=matPoint(m,v);x+=p.x;y+=p.y;z+=p.z;n++;
    }
    return n?{x:x/n,y:y/n,z:z/n}:null;
  }

  function skinVertex(geo,index,nodeMatrices){
    const v=geo.vertices[index];
    if(!v || !$('#modelSkinningEnabled') || !$('#modelSkinningEnabled').checked) return v;
    if(geo.skin && geo.skin.length >= (index+1)*8){
      const o=index*8; let x=0,y=0,z=0,total=0;
      for(let k=0;k<4;k++){
        const skinIndex=geo.skin[o+k],w=(geo.skin[o+4+k]||0)/255;
        if(w<=0)continue;
        const p=transformByNodeIds(v,resolvedSkinIds(geo,skinIndex),nodeMatrices);
        if(!p)continue;
        x+=p.x*w;y+=p.y*w;z+=p.z*w;total+=w;
      }
      if(total>0) return {x:x/total,y:y/total,z:z/total};
    }
    return transformByNodeIds(v,classicNodeIdsForVertex(geo,index),nodeMatrices)||v;
  }

  function cameraTransform(canvas){
    const c=state.camera,m=geometry.viewportMetrics(canvas);
    const key=[canvas.width,canvas.height,m.cssWidth,m.cssHeight,c.yaw,c.pitch,c.roll,c.zoom,c.panX,c.panY,c.targetX,c.targetY,c.targetZ,c.norm].map(v=>typeof v==='number'?Math.round(v*1e6)/1e6:v).join('|');
    if(state.cameraTransformCache&&state.cameraTransformCache.key===key)return state.cameraTransformCache.value;
    const value=geometry.createOrthoTransform(c,canvas);state.cameraTransformCache={key,value};return value;
  }
  function canvasLogicalScale(canvas){const m=geometry.viewportMetrics(canvas);return{x:m.cssToCanvasX,y:m.cssToCanvasY};}
  function cameraPanCanvasPixels(canvas){return cameraTransform(canvas).pan;}
  function cameraProject(v,canvas){return cameraTransform(canvas).worldToScreen(v);}
  function projectPoint(v,canvas){return cameraProject(v,canvas);}
  function screenRay(canvas,x,y){return cameraTransform(canvas).screenToRay({x,y});}

  function currentTextureCanvas(texIndex){
    const slot=state.textures[texIndex];
    return slot&&slot.canvas?slot.canvas:null;
  }

  function updateRuntimeBadge(rendererMode){
    const el=$('#modelRuntimeBadge'); if(!el)return;
    el.textContent='';
    el.style.display='none';
  }

  function compileGlShader(gl,type,source){
    const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ const msg=gl.getShaderInfoLog(s)||'Shader compile failed'; gl.deleteShader(s); throw new Error(msg); }
    return s;
  }
  function createGlProgram(gl,vs,fs){
    const p=gl.createProgram(); gl.attachShader(p,compileGlShader(gl,gl.VERTEX_SHADER,vs)); gl.attachShader(p,compileGlShader(gl,gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){ const msg=gl.getProgramInfoLog(p)||'Shader link failed'; gl.deleteProgram(p); throw new Error(msg); }
    return p;
  }
  function ensureGlRenderer(){
    const overlay=$('#model3dCanvas');
    if(!overlay) return null;
    if(state.glRenderer && state.glRenderer.overlay===overlay) return state.glRenderer;
    let wrap=overlay.parentElement && overlay.parentElement.classList.contains('model-canvas-stack') ? overlay.parentElement : null;
    if(!wrap){
      wrap=document.createElement('div'); wrap.className='model-canvas-stack';
      overlay.parentNode.insertBefore(wrap,overlay); wrap.appendChild(overlay);
    }
    // The render canvases are absolutely positioned. Without an explicit
    // flex/height here the wrapper collapses to 0px and the loaded model is invisible.
    Object.assign(wrap.style,{
      position:'relative',display:'block',flex:'1 1 auto',width:'100%',height:'100%',
      minWidth:'0',minHeight:'0',margin:'0',overflow:'hidden'
    });
    let glCanvas=wrap.querySelector('.model-gl-canvas');
    if(!glCanvas){ glCanvas=document.createElement('canvas'); glCanvas.className='model-gl-canvas'; wrap.insertBefore(glCanvas,overlay); }
    Object.assign(glCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block',zIndex:'1'});
    Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block',zIndex:'2',background:'transparent'});
    let fxWarn=wrap.querySelector('#modelFxSourceWarning');if(!fxWarn){fxWarn=document.createElement('div');fxWarn.id='modelFxSourceWarning';fxWarn.className='model-fx-source-warning';fxWarn.hidden=true;wrap.appendChild(fxWarn);}updateFxSourceWarning();
    const gl=glCanvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,premultipliedAlpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    if(!gl){ state.glRenderer={overlay,canvas:glCanvas,gl:null,failed:true}; const badge=$('#nativeRenderBadge');if(badge)badge.textContent='CPU fallback'; updateRuntimeBadge('CPU'); return state.glRenderer; }
    const vs=`#version 300 es
      precision highp float;
      in vec3 a_position; in vec3 a_normal; in vec2 a_uv; in float a_boneCount;
      uniform vec3 u_target; uniform vec3 u_right; uniform vec3 u_up; uniform vec3 u_forward; uniform float u_pxScale; uniform float u_depthNorm; uniform vec2 u_viewport; uniform vec2 u_panPx;
      uniform vec2 u_uvTrans; uniform vec2 u_uvScale; uniform vec2 u_uvRot;
      out vec2 v_uv; out vec3 v_normal; out float v_boneCount;
      void main(){
        vec3 p=a_position-u_target;
        float vx=dot(p,u_right), vy=dot(p,u_up), vz=dot(p,u_forward);
        vec2 ndc=vec2((vx*u_pxScale+u_panPx.x)/(u_viewport.x*0.5),(vy*u_pxScale-u_panPx.y)/(u_viewport.y*0.5));
        // Orthographic: x/y are independent of depth. z exists only for depth testing.
        float zclip=clamp(-vz/(max(1.0,u_depthNorm)*2.0),-0.98,0.98);
        gl_Position=vec4(ndc,zclip,1.0);
        vec2 uv=(a_uv-0.5)*u_uvScale;
        uv=vec2(uv.x*u_uvRot.x-uv.y*u_uvRot.y,uv.x*u_uvRot.y+uv.y*u_uvRot.x)+0.5+u_uvTrans;
        // Model Lab canonical UV is canvas/top-left space. HTML canvas rows are uploaded
        // with UNPACK_FLIP_Y_WEBGL=false, so authored Warcraft V maps directly to
        // the same canvas row. Do NOT flip V again in the shader.
        v_uv=uv;
        vec3 n=a_normal;
        v_normal=normalize(vec3(dot(n,u_right),dot(n,u_up),dot(n,u_forward)));
        v_boneCount=a_boneCount;
      }`;
    const fs=`#version 300 es
      precision highp float;
      uniform sampler2D u_tex; uniform sampler2D u_teamMask; uniform int u_mode; uniform bool u_hasTexture; uniform bool u_hasTeamMask; uniform int u_teamMaskChannel; uniform bool u_lit; uniform float u_alpha; uniform float u_alphaCut;
      uniform vec3 u_color; uniform vec3 u_flatColor; uniform vec3 u_teamColor;
      in vec2 v_uv; in vec3 v_normal; in float v_boneCount; out vec4 outColor;
      vec3 heat(float c){ float t=clamp(c/4.0,0.0,1.0); return mix(vec3(0.15,0.42,0.95),vec3(1.0,0.2,0.08),t); }
      void main(){
        vec4 c;
        if(u_mode==2) c=vec4(u_flatColor,1.0);
        else if(u_mode==3) c=vec4(v_normal*0.5+0.5,1.0);
        else if(u_mode==4) c=vec4(heat(v_boneCount),1.0);
        else if(u_hasTexture) c=texture(u_tex,v_uv);
        else c=vec4(0.58,0.61,0.66,1.0);
        if(u_hasTeamMask && u_mode<2){
          vec4 tm=texture(u_teamMask,v_uv);
          float mask=u_teamMaskChannel==1 ? tm.r : tm.a;
          float lum=dot(c.rgb,vec3(0.299,0.587,0.114));
          vec3 tinted=u_teamColor*clamp(0.24+lum*1.42,0.12,1.28);
          c.rgb=mix(c.rgb,tinted,clamp(mask,0.0,1.0));
        }
        c.rgb*=u_color; c.a*=u_alpha;
        if(u_alphaCut>0.0 && c.a<u_alphaCut) discard;
        if(u_lit && u_mode<2){ float l=clamp(dot(normalize(v_normal),normalize(vec3(-0.35,0.6,0.72)))+0.68,0.18,1.0); c.rgb*=l; }
        outColor=c;
      }`;
    let program;
    try{ program=createGlProgram(gl,vs,fs); }
    catch(e){ console.warn('WebGL2 shader init failed, using Canvas fallback:',e); state.glRenderer={overlay,canvas:glCanvas,gl:null,failed:true,error:e}; const badge=$('#nativeRenderBadge');if(badge)badge.textContent='CPU fallback'; updateRuntimeBadge('CPU'); return state.glRenderer; }
    const attrib={pos:gl.getAttribLocation(program,'a_position'),normal:gl.getAttribLocation(program,'a_normal'),uv:gl.getAttribLocation(program,'a_uv'),boneCount:gl.getAttribLocation(program,'a_boneCount')};
    const uni={};
    ['u_target','u_right','u_up','u_forward','u_pxScale','u_depthNorm','u_viewport','u_panPx','u_uvTrans','u_uvScale','u_uvRot','u_tex','u_teamMask','u_mode','u_hasTexture','u_hasTeamMask','u_teamMaskChannel','u_lit','u_alpha','u_alphaCut','u_color','u_flatColor','u_teamColor'].forEach(n=>uni[n]=gl.getUniformLocation(program,n));
    state.glRenderer={overlay,wrap,canvas:glCanvas,gl,program,attrib,uni,model:null,batches:[],textures:[],textureRevision:-1,geometryKey:'',drawCalls:0,triangles:0};
    return state.glRenderer;
  }
  function clearGlResources(r){
    if(!r||!r.gl)return; const gl=r.gl;
    for(const b of r.batches||[]){ ['pos','normal','bone','index','wire'].forEach(k=>b[k]&&gl.deleteBuffer(b[k])); (b.uv||[]).forEach(x=>x&&gl.deleteBuffer(x)); }
    for(const t of r.textures||[]) if(t&&t.tex) gl.deleteTexture(t.tex);
    r.batches=[];r.textures=[];r.model=null;r.geometryKey='';r.textureRevision=-1;
  }
  function syncCanvasBackingSize(canvas){
    if(!canvas)return false;
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return false;
    // One immutable interaction resolution: renderer, overlay and CPU fallback all use
    // the same CSS viewport -> backing-store mapping. No fast-preview downscaling.
    const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,2));
    const w=Math.max(2,Math.round(rect.width*dpr)),h=Math.max(2,Math.round(rect.height*dpr));
    if(canvas.width===w&&canvas.height===h)return false;
    canvas.width=w; canvas.height=h;
    state.cameraTransformCache=null; invalidatePickCache();
    return true;
  }
  function syncGlCanvasSize(r){
    if(!r)return false;
    // Fixed backing resolution. Performance modes may change cadence, never geometry
    // resolution, so WebGL, overlay, rig and picking always share one viewport.
    let changed=false;
    if(r.canvas)changed=syncCanvasBackingSize(r.canvas)||changed;
    if(r.overlay)changed=syncCanvasBackingSize(r.overlay)||changed;
    return changed;
  }
  function makeFloat3(vertices){ const a=new Float32Array(vertices.length*3); for(let i=0,j=0;i<vertices.length;i++){const v=vertices[i];a[j++]=v.x;a[j++]=v.y;a[j++]=v.z;} return a; }
  function makeNormals(geo){ const n=geo.normals||[]; const a=new Float32Array(geo.vertices.length*3); for(let i=0,j=0;i<geo.vertices.length;i++){const v=n[i]||{x:0,y:0,z:1};a[j++]=v.x;a[j++]=v.y;a[j++]=v.z;} return a; }
  function makeBoneCounts(geo){ const a=new Float32Array(geo.vertices.length); for(let i=0;i<a.length;i++)a[i]=vertexBoneCount(geo,i); return a; }
  function makeUv(geo,setId){ const src=(geo.uvSets&&geo.uvSets[setId])||(geo.uvSets&&geo.uvSets[0])||geo.tverts||[]; const a=new Float32Array(geo.vertices.length*2); for(let i=0,j=0;i<geo.vertices.length;i++){const u=src[i]||{u:0,v:0};a[j++]=u.u;a[j++]=u.v;} return a; }
  function initGlModel(r){
    if(!r||!r.gl||!state.model)return;
    if(r.model===state.model)return;
    clearGlResources(r); r.model=state.model; const gl=r.gl;
    r.batches=(state.model.geosets||[]).map((geo,gi)=>{
      const pos=gl.createBuffer(),normal=gl.createBuffer(),bone=gl.createBuffer(),index=gl.createBuffer(),wire=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,pos);gl.bufferData(gl.ARRAY_BUFFER,makeFloat3(geo.vertices),gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,normal);gl.bufferData(gl.ARRAY_BUFFER,makeNormals(geo),gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,bone);gl.bufferData(gl.ARRAY_BUFFER,makeBoneCounts(geo),gl.STATIC_DRAW);
      let maxIndex=0; const flat=[]; for(const f of geo.faces||[]){flat.push(f[0],f[1],f[2]);maxIndex=Math.max(maxIndex,f[0],f[1],f[2]);}
      const use32=maxIndex>65535; const idx=use32?new Uint32Array(flat):new Uint16Array(flat);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
      const lines=[];for(const f of geo.faces||[]){lines.push(f[0],f[1],f[1],f[2],f[2],f[0]);}
      const wi=use32?new Uint32Array(lines):new Uint16Array(lines);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,wire);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,wi,gl.STATIC_DRAW);
      const uv=[]; const sets=Math.max(1,(geo.uvSets||[]).length); for(let s=0;s<sets;s++){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,makeUv(geo,s),gl.STATIC_DRAW);uv.push(b);}
      return{geo,gi,pos,normal,bone,index,wire,uv,indexCount:idx.length,wireCount:wi.length,indexType:use32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,positionArray:new Float32Array(geo.vertices.length*3)};
    });
  }
  function uploadGlTexture(r,index){
    const gl=r.gl,slot=state.textures[index],source=currentTextureCanvas(index); if(!source)return null;
    let rec=r.textures[index]; if(!rec){rec={tex:gl.createTexture(),revision:-1,source:null};r.textures[index]=rec;}
    const rev=slot&&slot.revision||1;
    if(rec.source===source&&rec.revision===rev)return rec.tex;
    gl.bindTexture(gl.TEXTURE_2D,rec.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    const def=state.model&&state.model.textureDefs&&state.model.textureDefs[index];
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,def&&def.wrapWidth?gl.REPEAT:gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,def&&def.wrapHeight?gl.REPEAT:gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
    rec.source=source;rec.revision=rev;return rec.tex;
  }
  function applyGlBlend(gl,mode,flags){
    const noDepthTest=!!(flags&64),noDepthSet=!!(flags&128);
    if(noDepthTest)gl.disable(gl.DEPTH_TEST);else gl.enable(gl.DEPTH_TEST);
    gl.depthMask(!noDepthSet && (mode==='None'||mode==='Transparent'));
    if(mode==='Blend'){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}
    else if(mode==='Additive'||mode==='AddAlpha'){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);}
    else if(mode==='Modulate'){gl.enable(gl.BLEND);gl.blendFunc(gl.DST_COLOR,gl.ZERO);}
    else if(mode==='Modulate2x'){gl.enable(gl.BLEND);gl.blendFunc(gl.DST_COLOR,gl.SRC_COLOR);}
    else gl.disable(gl.BLEND);
  }
  function bindGlBatch(r,b,uvSet){
    const gl=r.gl,a=r.attrib;
    gl.bindBuffer(gl.ARRAY_BUFFER,b.pos);gl.enableVertexAttribArray(a.pos);gl.vertexAttribPointer(a.pos,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,b.normal);gl.enableVertexAttribArray(a.normal);gl.vertexAttribPointer(a.normal,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,b.bone);gl.enableVertexAttribArray(a.boneCount);gl.vertexAttribPointer(a.boneCount,1,gl.FLOAT,false,0,0);
    const ub=b.uv[Math.min(Math.max(0,uvSet|0),b.uv.length-1)]||b.uv[0];gl.bindBuffer(gl.ARRAY_BUFFER,ub);gl.enableVertexAttribArray(a.uv);gl.vertexAttribPointer(a.uv,2,gl.FLOAT,false,0,0);
  }
  function updateGlGeometry(r){
    const key=geometryFrameKey(); if(r.geometryKey===key)return;
    const geom=getDeformedGeometry(),gl=r.gl;
    r.batches.forEach((b,i)=>{const verts=geom.vertices[i]||b.geo.vertices,a=b.positionArray;for(let vi=0,j=0;vi<verts.length;vi++){const v=verts[vi];a[j++]=v.x;a[j++]=v.y;a[j++]=v.z;}gl.bindBuffer(gl.ARRAY_BUFFER,b.pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,a);});
    r.geometryKey=key; invalidatePickCache();
  }
  function teamMaskForLayer(layer){
    if(!layer)return null;
    // Prefer an explicit team-color map when a newer material layout exposes
    // one. Reforged/Definitive normally stores the team-color coverage in the
    // alpha channel of the ORM map, which remains the fallback.
    if(Number.isInteger(layer.teamColorTextureId)&&layer.teamColorTextureId>=0)return {textureId:layer.teamColorTextureId,channel:1};
    if(Number.isInteger(layer.ormTextureId)&&layer.ormTextureId>=0)return {textureId:layer.ormTextureId,channel:0};
    return null;
  }

  function renderGlPreview(){
    const r=ensureGlRenderer();
    if(!r||!r.gl||!state.model)return false;
    syncGlCanvasSize(r);initGlModel(r);updateGlGeometry(r);
    const gl=r.gl,canvas=r.canvas,u=r.uni;
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0.045,0.06,0.078,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(r.program);
    const ct=cameraTransform(canvas),b=ct.basis;
    gl.uniform3f(u.u_target,ct.target.x,ct.target.y,ct.target.z);gl.uniform3f(u.u_right,b.right.x,b.right.y,b.right.z);gl.uniform3f(u.u_up,b.up.x,b.up.y,b.up.z);gl.uniform3f(u.u_forward,b.forward.x,b.forward.y,b.forward.z);gl.uniform1f(u.u_pxScale,ct.pxScale);gl.uniform1f(u.u_depthNorm,ct.norm);gl.uniform2f(u.u_viewport,canvas.width,canvas.height);gl.uniform2f(u.u_panPx,ct.pan.x,ct.pan.y);gl.uniform1i(u.u_tex,0);gl.uniform1i(u.u_teamMask,1);
    const tc=hexRgb01(teamColorInfo().hex);gl.uniform3f(u.u_teamColor,tc[0],tc[1],tc[2]);
    const display=$('#modelDisplayMode').value,selected=$('#modelGeosetSelect').value;let calls=0,tris=0;
    const entries=[];
    r.batches.forEach((batch,gi)=>{
      if(selected!=='all'&&+selected!==gi)return;
      const mat=state.model.materials[batch.geo.materialId]||{id:batch.geo.materialId,layers:[]};
      let layers=(mat.layers&&mat.layers.length)?mat.layers:[{id:0,textureId:batch.geo.textureId||mat.textureId||0,filterMode:mat.filterMode||'None',alpha:1,coordId:0,tracks:{}}];
      layers=materialLayersForView(mat,layers);
      layers.forEach((layer,li)=>{const ls=layerState(mat,layer,gi);if(ls.alpha<=0.001)return;entries.push({b:batch,gi,mat,layer,li,ls,priority:(mat.priorityPlane||0)*100+li});});
    });
    entries.sort((a,b)=>a.priority-b.priority);
    for(const e of entries){
      const {b:batch,gi,mat,layer,ls}=e;
      bindGlBatch(r,batch,layer.coordId||0);
      const mode=display==='solid'?2:display==='geoset'?2:display==='normals'?3:display==='bonecount'?4:0;
      gl.uniform1i(u.u_mode,mode);
      const hue=(gi*67)%360,flat=display==='geoset'?hslToRgb(hue/360,.58,.54):[.58,.61,.66];gl.uniform3f(u.u_flatColor,flat[0],flat[1],flat[2]);
      gl.uniform1f(u.u_alpha,ls.alpha);gl.uniform3f(u.u_color,ls.color&&ls.color[0]!=null?ls.color[0]:1,ls.color&&ls.color[1]!=null?ls.color[1]:1,ls.color&&ls.color[2]!=null?ls.color[2]:1);gl.uniform1i(u.u_lit,(display==='lit'||display==='litwire')&&!ls.unshaded);gl.uniform1f(u.u_alphaCut,ls.mode==='Transparent'?.75:(ls.mode==='Modulate'||ls.mode==='Modulate2x'?.02:0));
      const angle=ls.uvAngle||0;gl.uniform2f(u.u_uvTrans,ls.uvTrans[0],ls.uvTrans[1]);gl.uniform2f(u.u_uvScale,ls.uvScale[0],ls.uvScale[1]);gl.uniform2f(u.u_uvRot,Math.cos(angle),Math.sin(angle));
      const tex=uploadGlTexture(r,ls.textureId);gl.uniform1i(u.u_hasTexture,!!tex);if(tex){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);}
      const maskInfo=teamMaskForLayer(layer),maskTex=maskInfo?uploadGlTexture(r,maskInfo.textureId):null;gl.uniform1i(u.u_hasTeamMask,!!maskTex);gl.uniform1i(u.u_teamMaskChannel,maskInfo?maskInfo.channel:0);if(maskTex){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,maskTex);gl.activeTexture(gl.TEXTURE0);}
      if($('#modelBackfaceCulling').checked&&!mat.twoSided&&!layer.twoSided){gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CW);}else gl.disable(gl.CULL_FACE);
      applyGlBlend(gl,ls.mode,layer.flags||0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,batch.index);if(display!=='wireframe')gl.drawElements(gl.TRIANGLES,batch.indexCount,batch.indexType,0);calls++;tris+=batch.indexCount/3;
      if(display==='wireframe'||display==='both'||display==='litwire'){
        gl.disable(gl.BLEND);gl.depthMask(false);gl.uniform1i(u.u_mode,2);gl.uniform1i(u.u_hasTexture,0);gl.uniform1i(u.u_hasTeamMask,0);gl.uniform3f(u.u_flatColor,0.95,0.76,0.34);gl.uniform3f(u.u_color,1,1,1);gl.uniform1f(u.u_alpha,0.72);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,batch.wire);gl.drawElements(gl.LINES,batch.wireCount,batch.indexType,0);gl.depthMask(true);
      }
    }
    gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);r.drawCalls=calls;r.triangles=tris;const badge=$('#nativeRenderBadge');if(badge)badge.textContent=`GPU · ${(state.model.geosets||[]).length} geosets`;updateRuntimeBadge('GPU');return true;
  }
  function hslToRgb(h,s,l){let r,g,b;if(s===0)r=g=b=l;else{const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;const f=t=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};r=f(h+1/3);g=f(h);b=f(h-1/3);}return[r,g,b];}

  function drawBackground(ctx, canvas){
    const g = ctx.createLinearGradient(0,0,0,canvas.height);
    g.addColorStop(0, '#1a2230');
    g.addColorStop(1, '#090c10');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width,canvas.height);
    const gridToggle=$('#modelShowGrid');
    if(!gridToggle || gridToggle.checked){
      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      for(let x=0;x<canvas.width;x+=28){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
      for(let y=0;y<canvas.height;y+=28){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
    }
  }

  function affineFromTriangles(s0,s1,s2,d0,d1,d2){
    const det = s0.x*(s1.y-s2.y) + s1.x*(s2.y-s0.y) + s2.x*(s0.y-s1.y);
    if(Math.abs(det) < 1e-8) return null;
    const a = (d0.x*(s1.y-s2.y) + d1.x*(s2.y-s0.y) + d2.x*(s0.y-s1.y)) / det;
    const b = (d0.y*(s1.y-s2.y) + d1.y*(s2.y-s0.y) + d2.y*(s0.y-s1.y)) / det;
    const c = (d0.x*(s2.x-s1.x) + d1.x*(s0.x-s2.x) + d2.x*(s1.x-s0.x)) / det;
    const d = (d0.y*(s2.x-s1.x) + d1.y*(s0.x-s2.x) + d2.y*(s1.x-s0.x)) / det;
    const e = (d0.x*(s1.x*s2.y-s2.x*s1.y) + d1.x*(s2.x*s0.y-s0.x*s2.y) + d2.x*(s0.x*s1.y-s1.x*s0.y)) / det;
    const f = (d0.y*(s1.x*s2.y-s2.x*s1.y) + d1.y*(s2.x*s0.y-s0.x*s2.y) + d2.y*(s0.x*s1.y-s1.x*s0.y)) / det;
    return { a,b,c,d,e,f };
  }

  function drawTexturedTriangle(ctx, img, s0,s1,s2, d0,d1,d2){
    const m = affineFromTriangles(s0,s1,s2,d0,d1,d2);
    if(!m) return;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(d0.x,d0.y); ctx.lineTo(d1.x,d1.y); ctx.lineTo(d2.x,d2.y); ctx.closePath(); ctx.clip();
    ctx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function trackScalar(track, fallback){
    const v=sampleTrack(track,currentFrame(),false);
    return v && Number.isFinite(v[0]) ? v[0] : fallback;
  }

  function geosetRenderState(geoIndex){
    const ga=(state.model.geosetAnimations||[]).find(x=>x.geosetId===geoIndex);
    if(!ga) return {alpha:1,color:[1,1,1]};
    const alpha=trackScalar(ga.tracks&&ga.tracks.KGAO,ga.alpha==null?1:ga.alpha);
    const cv=sampleTrack(ga.tracks&&ga.tracks.KGAC,currentFrame(),false);
    return {alpha:clamp(alpha,0,1),color:cv||ga.color||[1,1,1]};
  }

  function layerState(mat, layer, geoIndex){
    const tracks=(layer&&layer.tracks)||{};
    const texValue=sampleTrack(tracks.KMTF,currentFrame(),false);
    const textureId=texValue&&Number.isFinite(texValue[0]) ? Math.round(texValue[0]) : (layer&&layer.textureId!=null?layer.textureId:(mat.textureId||0));
    const alpha=clamp(trackScalar(tracks.KMTA,layer&&layer.alpha!=null?layer.alpha:1),0,1);
    const gs=geosetRenderState(geoIndex);
    let composite='source-over';
    const mode=(layer&&layer.filterMode)||mat.filterMode||'None';
    if(mode==='Additive'||mode==='AddAlpha') composite='lighter';
    else if(mode==='Modulate'||mode==='Modulate2x') composite='multiply';
    const taId=layer&&layer.textureAnimationId!=null?layer.textureAnimationId:-1;
    const ta=taId>=0?(state.model.textureAnimations||[])[taId]:null;
    let uvTrans=[0,0],uvScale=[1,1],uvAngle=0;
    if(ta&&ta.tracks){
      const tr=sampleTrack(ta.tracks.KTAT,currentFrame(),false); if(tr)uvTrans=[tr[0]||0,tr[1]||0];
      const sc=sampleTrack(ta.tracks.KTAS,currentFrame(),false); if(sc)uvScale=[sc[0]||1,sc[1]||1];
      const rq=sampleTrack(ta.tracks.KTAR,currentFrame(),true); if(rq)uvAngle=2*Math.atan2(rq[2]||0,rq[3]||1);
    }
    return {textureId,alpha:alpha*gs.alpha,color:gs.color,composite,mode,uvTrans,uvScale,uvAngle,unshaded:!!((layer&&layer.unshaded)||mat.unshaded)};
  }

  function transformUv(uv,ls){
    let x=(uv.u-0.5)*ls.uvScale[0], y=(uv.v-0.5)*ls.uvScale[1];
    if(ls.uvAngle){const c=Math.cos(ls.uvAngle),sn=Math.sin(ls.uvAngle),nx=x*c-y*sn,ny=x*sn+y*c;x=nx;y=ny;}
    return {u:x+0.5+ls.uvTrans[0],v:y+0.5+ls.uvTrans[1]};
  }

  function vertexBoneCount(geo,index){
    if(geo.skin && geo.skin.length >= (index+1)*8){
      const off=index*8,ids=new Set();
      for(let k=0;k<4;k++){
        if((geo.skin[off+4+k]||0)<=0)continue;
        resolvedSkinIds(geo,geo.skin[off+k]).forEach(id=>{if(id>=0)ids.add(id);});
      }
      return ids.size;
    }
    const ids=classicNodeIdsForVertex(geo,index);
    return ids.length ? new Set(ids).size : 0;
  }

  function getStaticFaceData(geo){
    let cached=state.faceCache.get(geo);
    if(cached) return cached;
    cached=(geo.faces||[]).map((face,faceIndex)=>{
      const [i0,i1,i2]=face;
      const baseUv=[geo.tverts[i0]||{u:0,v:0},geo.tverts[i1]||{u:1,v:0},geo.tverts[i2]||{u:1,v:1}];
      let light=1, normal={x:0,y:0,z:1};
      if(geo.normals && geo.normals[i0] && geo.normals[i1] && geo.normals[i2]){
        normal={x:(geo.normals[i0].x+geo.normals[i1].x+geo.normals[i2].x)/3,y:(geo.normals[i0].y+geo.normals[i1].y+geo.normals[i2].y)/3,z:(geo.normals[i0].z+geo.normals[i1].z+geo.normals[i2].z)/3};
        const len=Math.hypot(normal.x,normal.y,normal.z)||1;
        light=clamp(0.55+(-(normal.z/len)*0.25)+(normal.y/len*0.2),0.25,1.1);
      }
      const boneCount=(vertexBoneCount(geo,i0)+vertexBoneCount(geo,i1)+vertexBoneCount(geo,i2))/3;
      return {faceIndex,i0,i1,i2,baseUv,light,normal,boneCount};
    });
    state.faceCache.set(geo,cached);
    return cached;
  }

  function geometryFrameKey(){
    const skinEl=$('#modelSkinningEnabled');
    const skin=!!(skinEl&&skinEl.checked);
    const mode=$('#modelAnimMode') ? $('#modelAnimMode').value : 'tracks';
    const frame=Math.round(currentFrame()*1000)/1000;
    return `${frame}|${skin?1:0}|${mode}`;
  }

  function getDeformedGeometry(){
    if(!state.model) return {vertices:[],nodeMatrices:new Map(),bounds:{center:{x:0,y:0,z:0},size:1,min:{x:0,y:0,z:0},max:{x:1,y:1,z:1}}};
    const key=geometryFrameKey();
    if(state.geometryCache.key===key && state.geometryCache.vertices.length===state.model.geosets.length){
      return {vertices:state.geometryCache.vertices,nodeMatrices:state.geometryCache.nodeMatrices,bounds:state.geometryCache.bounds};
    }
    const nodeMatrices=buildNodeMatrices();
    const geosets=state.model.geosets||[];
    const vertices=geosets.map(geo=>geo.vertices.map((v,vi)=>skinVertex(geo,vi,nodeMatrices)));

    // Camera bounds must follow what is ACTUALLY visible. Warcraft models often keep
    // alternate forms/effects hundreds of units away and hide them with KGAO alpha.
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity,count=0;
    geosets.forEach((geo,gi)=>{
      if(geosetRenderState(gi).alpha<=0.001) return;
      for(const v of vertices[gi]||[]){
        if(!v)continue; count++;
        minX=Math.min(minX,v.x);minY=Math.min(minY,v.y);minZ=Math.min(minZ,v.z);
        maxX=Math.max(maxX,v.x);maxY=Math.max(maxY,v.y);maxZ=Math.max(maxZ,v.z);
      }
    });
    let bounds;
    if(count){
      bounds={min:{x:minX,y:minY,z:minZ},max:{x:maxX,y:maxY,z:maxZ},center:{x:(minX+maxX)/2,y:(minY+maxY)/2,z:(minZ+maxZ)/2},size:Math.max(maxX-minX,maxY-minY,maxZ-minZ,1)};
    }else bounds=state.model.bounds;
    state.geometryCache={key,vertices,nodeMatrices,bounds};
    return {vertices,nodeMatrices,bounds};
  }

  function buildRenderTriangles(canvas){
    const tris = [];
    if(!state.model) return tris;
    const geosets = state.model.geosets || [];
    const selected = $('#modelGeosetSelect').value;
    const geom=getDeformedGeometry();
    geosets.forEach((geo, geoIndex) => {
      if(selected !== 'all' && +selected !== geoIndex) return;
      const deformed=geom.vertices[geoIndex]||geo.vertices;
      const projected = deformed.map(v => projectPoint(v, canvas));
      const mat = state.model.materials[geo.materialId] || {id:geo.materialId,layers:[]};
      let layers=(mat.layers&&mat.layers.length)?mat.layers:[{id:0,textureId:geo.textureId||mat.textureId||0,filterMode:mat.filterMode||'None',alpha:1,tracks:{}}];
      layers=materialLayersForView(mat,layers);
      const layerStates=layers.map(layer=>({layer,ls:layerState(mat,layer,geoIndex)}));
      getStaticFaceData(geo).forEach(faceData => {
        const {i0,i1,i2,baseUv,light,normal,boneCount}=faceData;
        const p0 = projected[i0], p1 = projected[i1], p2 = projected[i2];
        if(!p0 || !p1 || !p2) return;
        const area = signedArea2(p0,p1,p2);
        if(Math.abs(area)<0.08) return;
        const margin=12;
        const minX=Math.min(p0.x,p1.x,p2.x), maxX=Math.max(p0.x,p1.x,p2.x);
        const minY=Math.min(p0.y,p1.y,p2.y), maxY=Math.max(p0.y,p1.y,p2.y);
        if(maxX < -margin || minX > canvas.width+margin || maxY < -margin || minY > canvas.height+margin) return;
        if($('#modelBackfaceCulling').checked && area <= 0 && !mat.twoSided && !layers.some(l=>l.twoSided)) return;
        layerStates.forEach(({layer,ls},layerIndex)=>{
          if(ls.alpha<=0.001)return;
          const uvSet=(geo.uvSets&&geo.uvSets[layer.coordId||0])||(geo.uvSets&&geo.uvSets[0])||geo.tverts||[];
          const srcUv=[uvSet[i0]||baseUv[0],uvSet[i1]||baseUv[1],uvSet[i2]||baseUv[2]];
          const uv=srcUv.map(u=>transformUv(u,ls));
          tris.push({geoIndex,materialId:geo.materialId,layerIndex,texIndex:ls.textureId,p:[p0,p1,p2],uv,z:(p0.z+p1.z+p2.z)/3,light,normal,boneCount,unshaded:ls.unshaded,alpha:ls.alpha,color:ls.color,composite:ls.composite,filterMode:ls.mode,priority:(mat.priorityPlane||0)*100+(layerIndex||0)});
        });
      });
    });
    tris.sort((a,b) => a.priority-b.priority || a.z-b.z);
    return tris;
  }

  function drawOverlayInfo(ctx, text){
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.86)';
    ctx.font = '12px system-ui, sans-serif';
    const lines = String(text).split('\n');
    lines.forEach((line, i) => ctx.fillText(line, 14, 22 + i*18));
    ctx.restore();
  }

  function visibleRigBoneIds(){
    return new Set((state.model&&state.model.nodes||[]).filter(n=>n.type==='Bone'||n.type==='Helper').map(n=>n.id));
  }

  function nodeWorldPivot(node,nodeMatrices){
    if(!node||!node.pivot)return null;
    const m=nodeMatrices&&nodeMatrices.get(node.id);
    // Exactly the matrix used by classic/HD skinning; pivot is transformed once.
    return m?matPoint(m,node.pivot):{x:node.pivot.x,y:node.pivot.y,z:node.pivot.z};
  }

  function drawPivots(ctx,canvas,nodeMatrices){
    if(!state.model||!$('#modelShowRig')?.checked)return;
    const showPivots=$('#modelShowPivots')?.checked,showBones=$('#modelShowBones')?.checked,nodes=(state.model.nodes||[]).filter(n=>n.type==='Bone'||n.type==='Helper'),byId=new Map(nodes.map(n=>[n.id,n])),projected=new Map();nodeMatrices=nodeMatrices||getDeformedGeometry().nodeMatrices;
    nodes.forEach(node=>{const wp=nodeWorldPivot(node,nodeMatrices);if(wp)projected.set(node.id,projectPoint(wp,canvas));});
    if(showBones){ctx.save();ctx.lineWidth=1.25;nodes.forEach(node=>{if(node.parentId<0||!byId.has(node.parentId))return;const a=projected.get(node.id),b=projected.get(node.parentId);if(!a||!b)return;ctx.strokeStyle=node.type==='Helper'?'rgba(176,126,255,.48)':'rgba(98,179,255,.62)';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();});ctx.restore();}
    if(showPivots){ctx.save();nodes.forEach(node=>{const p=projected.get(node.id);if(!p)return;const active=node.id===state.selectedNodeId;ctx.fillStyle=active?'rgba(255,212,108,.98)':node.type==='Helper'?'rgba(190,139,255,.82)':'rgba(116,224,255,.9)';ctx.beginPath();ctx.arc(p.x,p.y,active?4.8:3.25,0,Math.PI*2);ctx.fill();if($('#modelShowNodeNames')?.checked){ctx.font='9px system-ui,sans-serif';ctx.fillStyle='rgba(225,235,245,.86)';ctx.fillText(node.name||`${node.type} ${node.id}`,p.x+6,p.y-5);}});ctx.restore();}
  }

  function drawExtentOverlay(ctx,canvas){
    if(!state.model || !$('#modelShowExtents') || !$('#modelShowExtents').checked) return;
    const b=currentDisplayBounds(); if(!b || !b.min || !b.max) return;
    const mn=b.min,mx=b.max;
    const raw=[
      {x:mn.x,y:mn.y,z:mn.z},{x:mx.x,y:mn.y,z:mn.z},{x:mx.x,y:mx.y,z:mn.z},{x:mn.x,y:mx.y,z:mn.z},
      {x:mn.x,y:mn.y,z:mx.z},{x:mx.x,y:mn.y,z:mx.z},{x:mx.x,y:mx.y,z:mx.z},{x:mn.x,y:mx.y,z:mx.z}
    ];
    const pts=raw.map(v=>projectPoint(v,canvas));
    const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    ctx.save(); ctx.strokeStyle='rgba(255,118,118,.58)'; ctx.lineWidth=1;
    for(const [a,b] of edges){ctx.beginPath();ctx.moveTo(pts[a].x,pts[a].y);ctx.lineTo(pts[b].x,pts[b].y);ctx.stroke();}
    ctx.restore();
  }

  function fxFrac(v){return v-Math.floor(v);}
  function fxRand(seed){return fxFrac(Math.sin(seed*12.9898+78.233)*43758.5453123);}
  function fxLerp(a,b,t){return a+(b-a)*t;}
  function fxSegmentValue(values,t,mid=.5){
    if(!values||values.length<3)return values&&values[0]!=null?values[0]:0;
    mid=clamp(Number(mid)||.5,.05,.95);
    return t<=mid?fxLerp(values[0],values[1],t/mid):fxLerp(values[1],values[2],(t-mid)/(1-mid));
  }
  function fxSegmentColor(colors,t,mid=.5){
    if(!colors||colors.length<3)return[1,1,1];
    mid=clamp(Number(mid)||.5,.05,.95);
    const a=t<=mid?colors[0]:colors[1],b=t<=mid?colors[1]:colors[2],u=t<=mid?t/mid:(t-mid)/(1-mid);
    return[fxLerp(a[0]||0,b[0]||0,u),fxLerp(a[1]||0,b[1]||0,u),fxLerp(a[2]||0,b[2]||0,u)];
  }
  function fxEmitterFrame(n,t){
    const rows=Math.max(1,n.rows|0),cols=Math.max(1,n.columns|0),max=rows*cols-1,mid=clamp(Number(n.timeMiddle)||.5,.05,.95);
    const interval=(n.headIntervals&&n.headIntervals[t<=mid?0:1])||[0,max,1];
    const start=clamp(interval[0]|0,0,max),end=clamp(interval[1]|0,start,max),span=Math.max(1,end-start+1),speed=Math.max(1,Math.abs(interval[2]|0)||1);
    const local=t<=mid?t/mid:(t-mid)/(1-mid);
    return start+((Math.floor(local*span*speed))%span);
  }
  function drawFallbackParticle(ctx,p,size,color,alpha){
    const r=Math.max(1.5,size*.5),rr=Math.round(clamp(color[0],0,1)*255),gg=Math.round(clamp(color[1],0,1)*255),bb=Math.round(clamp(color[2],0,1)*255);
    ctx.fillStyle=`rgba(${rr},${gg},${bb},${Math.min(1,alpha*.28)})`;ctx.beginPath();ctx.arc(p.x,p.y,r*1.7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(${rr},${gg},${bb},${Math.min(1,alpha*.9)})`;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(255,245,205,${Math.min(1,alpha*.75)})`;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,r*.28),0,Math.PI*2);ctx.fill();
  }
  function getEmitterTextureCanvas(n){
    if(!n||n.textureId<0)return null;
    const direct=currentTextureCanvas(n.textureId);if(direct)return direct;
    const def=state.model&&state.model.textureDefs&&state.model.textureDefs[n.textureId],ref=def&&def.path||'';
    if(ref){const c=state.casc.effectTextures.get(normalizePath(ref));if(c)return c;}
    return null;
  }
  function effectSourceForNode(n){
    if(!n)return 'native';
    if(n.type==='ParticleEmitter2'){
      const def=state.model&&state.model.textureDefs&&state.model.textureDefs[n.textureId],ref=def&&def.path||'',key=normalizePath(ref);
      if(ref&&state.casc.effectTextures.has(key)&&state.casc.loaded.has(key))return 'casc';
      if(ref&&state.casc.loaded.has(key)&&currentTextureCanvas(n.textureId))return 'casc';
      if(currentTextureCanvas(n.textureId))return 'local';
      return 'fallback';
    }
    if(n.path){
      const key=normalizePath(n.path);if(state.casc.effectRuntimes.has(key))return 'casc';if(state.casc.loaded.has(key))return 'fallback';
      const wanted=basename(n.path).toLowerCase();for(const name of state.packageFiles.keys())if(basename(name).toLowerCase()===wanted)return 'local';
      return 'fallback';
    }
    return 'native';
  }
  function updateFxSourceWarning(){
    const el=$('#modelFxSourceWarning');if(!el)return;
    // This warning only belongs to the Effects property tab. Keeping it out of
    // the other Model Lab tabs prevents CASC/FX diagnostics from covering the
    // viewport while the user is painting, rigging, editing UVs, materials, etc.
    if(state.activePropPanel!=='effects'||!state.model){el.hidden=true;return;}
    const relevant=(state.model.nodes||[]).filter(n=>n.type==='ParticleEmitter2'||((n.type==='Attachment'||n.type==='ParticleEmitter'||n.type==='ParticleEmitterPopcorn')&&n.path));
    if(!relevant.length){el.hidden=true;return;}
    const sources=relevant.map(n=>effectSourceForNode(n)),non=sources.filter(x=>x!=='casc'),fallback=sources.filter(x=>x==='fallback').length,local=sources.filter(x=>x==='local').length;
    if(!non.length){el.hidden=true;el.textContent='';return;}
    const unsupported=relevant.filter(n=>n.path&&state.casc.loaded.has(normalizePath(n.path))&&!state.casc.effectRuntimes.has(normalizePath(n.path))).length;
    const reason=[];if(local)reason.push(`${local} local`);if(fallback)reason.push(`${fallback} fallback/simulated`);if(unsupported)reason.push(`${unsupported} CASC asset loaded without native playback`);if(!state.casc.enabled)reason.push('CASC disabled');else if(!(state.casc.status&&state.casc.status.ready))reason.push('CASC not connected');else if(!state.casc.verified)reason.push('CASC reading not verified yet');
    const text=`⚠ NON-CASC FX · ${non.length}/${relevant.length} effect(s) are not from CASC${reason.length?` · ${reason.join(' · ')}`:''}`;
    if(el.textContent!==text)el.textContent=text;el.hidden=false;
  }
  function sampleMainObjectTrack(track,defaultValue){
    if(!track||!track.keys||!track.keys.length)return Array.isArray(defaultValue)?defaultValue.slice():[defaultValue];
    const frame=currentFrame();
    if(track.globalSequenceId!=null&&track.globalSequenceId>=0)return sampleTrack(track,frame,false)||(Array.isArray(defaultValue)?defaultValue.slice():[defaultValue]);
    const seq=currentSequence();if(!seq)return Array.isArray(defaultValue)?defaultValue.slice():[defaultValue];
    const keys=track.keys.filter(k=>k.frame>=seq.start&&k.frame<=seq.end);if(!keys.length)return Array.isArray(defaultValue)?defaultValue.slice():[defaultValue];
    return samplePreparedTrack(track,keys,frame,false)||(Array.isArray(defaultValue)?defaultValue.slice():[defaultValue]);
  }
  function mainEmitterScalar(n,tag,fallback){const v=sampleMainObjectTrack(n&&n.tracks&&n.tracks[tag],[fallback]);return v&&Number.isFinite(v[0])?v[0]:fallback;}

  function mainEffectNodeVisibility(n){if(!n)return 1;const tag=n.type==='Attachment'?'KATV':n.type==='ParticleEmitter'?'KPEV':n.type==='ParticleEmitterPopcorn'?'KPPV':null;if(!tag)return 1;const v=sampleMainObjectTrack(n.tracks&&n.tracks[tag],[1]);return clamp(v&&Number.isFinite(v[0])?v[0]:1,0,1);}

  function drawParticleEmitter2Simulation(ctx,canvas,n,m,nowMs){
    const visibility=clamp(mainEmitterScalar(n,'KP2V',1),0,1);if(visibility<=.001)return;
    const life=Math.max(.06,Number(n.lifeSpan)||.5),rate=Math.max(0,mainEmitterScalar(n,'KP2E',Number(n.emissionRate)||0)),count=rate>0?clamp(Math.ceil(rate*life*1.10),1,performanceMode()==='quality'?12:6):0;if(!count)return;
    const pivot=n.pivot||{x:0,y:0,z:0},origin=matPoint(m,pivot),px=cameraTransform(canvas).pxScale;
    const tex=getEmitterTextureCanvas(n),rows=Math.max(1,n.rows|0),cols=Math.max(1,n.columns|0);
    const simTime=Math.max(0,(nowMs-(state.fxPreviewStartedAt||nowMs))/1000),baseSpeed=Math.max(0,mainEmitterScalar(n,'KP2S',Number(n.speed)||0)),variation=Math.max(0,mainEmitterScalar(n,'KP2R',Number(n.variation)||0)),latitude=mainEmitterScalar(n,'KP2L',Number(n.latitude)||0)*Math.PI/180,gravity=mainEmitterScalar(n,'KP2G',Number(n.gravity)||0);
    const width=Math.max(0,mainEmitterScalar(n,'KP2W',Number(n.width)||0)),length=Math.max(0,mainEmitterScalar(n,'KP2N',Number(n.length)||0));
    const oldComp=ctx.globalCompositeOperation,oldAlpha=ctx.globalAlpha,oldSmooth=ctx.imageSmoothingEnabled;
    ctx.globalCompositeOperation=(n.filterModeName==='Additive'||n.filterMode===1)?'lighter':'source-over';ctx.imageSmoothingEnabled=true;
    for(let i=0;i<count;i++){
      const seed=n.id*97.13+i*31.71;
      const phase=fxFrac(simTime/life+i/count+fxRand(seed)*.73),age=phase*life,t=clamp(age/life,0,1);
      const theta=fxRand(seed+1.2)*Math.PI*2,cone=latitude*(.35+.65*fxRand(seed+4.7)),speed=baseSpeed*(1+(fxRand(seed+2.6)*2-1)*variation);
      const lateral=Math.sin(cone)*speed,vertical=Math.cos(cone)*speed;
      const spawnTheta=fxRand(seed+6.1)*Math.PI*2,spawnRadius=Math.sqrt(fxRand(seed+7.8));
      const x=origin.x+Math.cos(spawnTheta)*width*.5*spawnRadius+Math.cos(theta)*lateral*age;
      const y=origin.y+Math.sin(spawnTheta)*length*.5*spawnRadius+Math.sin(theta)*lateral*age;
      const z=origin.z+vertical*age-.5*gravity*age*age;
      const p=projectPoint({x,y,z},canvas);
      const scale=Math.max(.01,fxSegmentValue(n.segmentScaling||[.25,.4,.1],t,n.timeMiddle)),alpha=clamp(fxSegmentValue((n.segmentAlphas||[255,180,0]).map(v=>v/255),t,n.timeMiddle),0,1),color=fxSegmentColor(n.segmentColors||[[1,1,1],[1,.4,.05],[.3,.02,0]],t,n.timeMiddle);
      const size=clamp(scale*px*9,2.4,42);
      if(tex&&tex.width&&tex.height){
        const frame=fxEmitterFrame(n,t),cw=tex.width/cols,ch=tex.height/rows,sx=(frame%cols)*cw,sy=Math.floor(frame/cols)*ch;
        // When a real texture is available (including CASC), render that sprite directly.
        // Do not add the old synthetic glow underneath it: that made CASC-backed FX
        // look like the program's fallback particles even when the CASC texture worked.
        ctx.globalAlpha=alpha*visibility;
        try{ctx.drawImage(tex,sx,sy,cw,ch,p.x-size*.5,p.y-size*.5,size,size);}catch(_){drawFallbackParticle(ctx,p,size,color,alpha);}
      }else{
        ctx.globalAlpha=1;drawFallbackParticle(ctx,p,size*1.35,color,alpha*visibility);
      }
    }
    ctx.globalCompositeOperation=oldComp;ctx.globalAlpha=oldAlpha;ctx.imageSmoothingEnabled=oldSmooth;
  }


  function drawCascEffectEmitter2(ctx,canvas,n,worldMatrix,runtime,anim,nowMs){
    const model=runtime.parsed,visibility=clamp(modelTrackScalar(n.tracks&&n.tracks.KP2V,model,anim.seq,anim.frame,anim.elapsedMs,1),0,1);if(visibility<=.001)return;
    const life=Math.max(.06,Number(n.lifeSpan)||.5),rate=Math.max(0,modelTrackScalar(n.tracks&&n.tracks.KP2E,model,anim.seq,anim.frame,anim.elapsedMs,Number(n.emissionRate)||0));if(rate<=0)return;
    const count=clamp(Math.ceil(rate*life*1.1),1,performanceMode()==='quality'?14:7),origin=matPoint(worldMatrix,n.pivot||{x:0,y:0,z:0}),px=cameraTransform(canvas).pxScale;
    const tex=runtime.textures&&runtime.textures[n.textureId]||null,rows=Math.max(1,n.rows|0),cols=Math.max(1,n.columns|0);
    const simTime=Math.max(0,anim.elapsedMs/1000),speed0=Math.max(0,modelTrackScalar(n.tracks&&n.tracks.KP2S,model,anim.seq,anim.frame,anim.elapsedMs,Number(n.speed)||0));
    const variation=Math.max(0,modelTrackScalar(n.tracks&&n.tracks.KP2R,model,anim.seq,anim.frame,anim.elapsedMs,Number(n.variation)||0));
    const latitude=modelTrackScalar(n.tracks&&n.tracks.KP2L,model,anim.seq,anim.frame,anim.elapsedMs,Number(n.latitude)||0)*Math.PI/180;
    const gravity=modelTrackScalar(n.tracks&&n.tracks.KP2G,model,anim.seq,anim.frame,anim.elapsedMs,Number(n.gravity)||0);
    const width=Math.max(0,modelTrackScalar(n.tracks&&n.tracks.KP2W,model,anim.seq,anim.frame,anim.elapsedMs,Number(n.width)||0)),length=Math.max(0,modelTrackScalar(n.tracks&&n.tracks.KP2N,model,anim.seq,anim.frame,anim.elapsedMs,Number(n.length)||0));
    const oldComp=ctx.globalCompositeOperation,oldAlpha=ctx.globalAlpha,oldSmooth=ctx.imageSmoothingEnabled;ctx.globalCompositeOperation=(n.filterModeName==='Additive'||n.filterMode===1)?'lighter':'source-over';ctx.imageSmoothingEnabled=true;
    for(let i=0;i<count;i++){
      const seed=(n.id+1)*113.17+i*29.31,phase=fxFrac(simTime/life+i/count+fxRand(seed)*.73),age=phase*life,t=clamp(age/life,0,1);
      const theta=fxRand(seed+1.2)*Math.PI*2,cone=latitude*(.35+.65*fxRand(seed+4.7)),speed=speed0*(1+(fxRand(seed+2.6)*2-1)*variation),lateral=Math.sin(cone)*speed,vertical=Math.cos(cone)*speed;
      const spawnTheta=fxRand(seed+6.1)*Math.PI*2,spawnRadius=Math.sqrt(fxRand(seed+7.8));
      const local={x:Math.cos(spawnTheta)*width*.5*spawnRadius+Math.cos(theta)*lateral*age,y:Math.sin(spawnTheta)*length*.5*spawnRadius+Math.sin(theta)*lateral*age,z:vertical*age-.5*gravity*age*age};
      const delta={x:worldMatrix[0]*local.x+worldMatrix[1]*local.y+worldMatrix[2]*local.z,y:worldMatrix[4]*local.x+worldMatrix[5]*local.y+worldMatrix[6]*local.z,z:worldMatrix[8]*local.x+worldMatrix[9]*local.y+worldMatrix[10]*local.z},p=projectPoint({x:origin.x+delta.x,y:origin.y+delta.y,z:origin.z+delta.z},canvas),scale=Math.max(.01,fxSegmentValue(n.segmentScaling||[.25,.4,.1],t,n.timeMiddle));
      const alpha=clamp(fxSegmentValue((n.segmentAlphas||[255,180,0]).map(v=>v/255),t,n.timeMiddle)*visibility,0,1),color=fxSegmentColor(n.segmentColors||[[1,1,1],[1,.4,.05],[.3,.02,0]],t,n.timeMiddle),size=clamp(scale*px*9,2.4,48);
      if(tex&&tex.width&&tex.height){const frame=fxEmitterFrame(n,t),cw=tex.width/cols,ch=tex.height/rows,sx=(frame%cols)*cw,sy=Math.floor(frame/cols)*ch;ctx.globalAlpha=alpha;try{ctx.drawImage(tex,sx,sy,cw,ch,p.x-size*.5,p.y-size*.5,size,size);}catch(_){drawFallbackParticle(ctx,p,size,color,alpha);}}
      else{ctx.globalAlpha=1;drawFallbackParticle(ctx,p,size,color,alpha);}
    }
    ctx.globalCompositeOperation=oldComp;ctx.globalAlpha=oldAlpha;ctx.imageSmoothingEnabled=oldSmooth;
  }

  function drawCascEffectModel(ctx,canvas,hostNode,hostMatrix,runtime,nowMs){
    if(!runtime||!runtime.parsed)return false;
    const model=runtime.parsed,anim=cascEffectFrame(runtime,nowMs),nodeMatrices=buildModelNodeMatrices(model,anim.seq,anim.frame,anim.elapsedMs),anchor=effectAnchorMatrix(hostMatrix,hostNode.pivot||{x:0,y:0,z:0});
    const tris=[],geosets=model.geosets||[],maxFaces=performanceMode()==='quality'?16000:7000;let faceBudget=maxFaces;
    for(let gi=0;gi<geosets.length&&faceBudget>0;gi++){
      const geo=geosets[gi],mat=(model.materials||[])[geo.materialId]||{id:geo.materialId,layers:[]},layers=(mat.layers&&mat.layers.length)?mat.layers:[{id:0,textureId:geo.textureId||mat.textureId||0,filterMode:mat.filterMode||'None',alpha:1,tracks:{}}];
      const states=layers.map(layer=>({layer,ls:modelLayerState(model,mat,layer,gi,anim.seq,anim.frame,anim.elapsedMs)}));
      if(!states.some(x=>x.ls.alpha>.001))continue;
      const verts=(geo.vertices||[]).map((v,vi)=>matPoint(anchor,skinModelVertex(model,geo,vi,nodeMatrices)||v)),projected=verts.map(v=>projectPoint(v,canvas));
      for(const face of geo.faces||[]){if(--faceBudget<0)break;const [i0,i1,i2]=face,p0=projected[i0],p1=projected[i1],p2=projected[i2];if(!p0||!p1||!p2)continue;const area=signedArea2(p0,p1,p2);if(Math.abs(area)<.04)continue;
        const margin=16,minX=Math.min(p0.x,p1.x,p2.x),maxX=Math.max(p0.x,p1.x,p2.x),minY=Math.min(p0.y,p1.y,p2.y),maxY=Math.max(p0.y,p1.y,p2.y);if(maxX<-margin||minX>canvas.width+margin||maxY<-margin||minY>canvas.height+margin)continue;
        if($('#modelBackfaceCulling')?.checked&&area<=0&&!mat.twoSided&&!layers.some(l=>l.twoSided))continue;
        states.forEach(({layer,ls},layerIndex)=>{if(ls.alpha<=.001)return;const uvSet=(geo.uvSets&&geo.uvSets[layer.coordId||0])||(geo.uvSets&&geo.uvSets[0])||geo.tverts||[],uv=[uvSet[i0]||{u:0,v:0},uvSet[i1]||{u:1,v:0},uvSet[i2]||{u:1,v:1}].map(u=>transformUv(u,ls));tris.push({p:[p0,p1,p2],uv,tex:runtime.textures&&runtime.textures[ls.textureId]||null,alpha:ls.alpha,color:ls.color||[1,1,1],composite:ls.composite,priority:(mat.priorityPlane||0)*100+layerIndex,z:(p0.z+p1.z+p2.z)/3});});
      }
    }
    tris.sort((a,b)=>a.priority-b.priority||a.z-b.z);
    for(const tri of tris){const [p0,p1,p2]=tri.p,tex=tri.tex;ctx.save();ctx.globalAlpha=tri.alpha;ctx.globalCompositeOperation=tri.composite||'source-over';if(tex&&tex.width&&tex.height){const [u0,u1,u2]=tri.uv,s0={x:u0.u*(tex.width-1),y:u0.v*(tex.height-1)},s1={x:u1.u*(tex.width-1),y:u1.v*(tex.height-1)},s2={x:u2.u*(tex.width-1),y:u2.v*(tex.height-1)};drawTexturedTriangle(ctx,tex,s0,s1,s2,p0,p1,p2);}else{ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.closePath();ctx.fillStyle=`rgba(${Math.round((tri.color[0]||1)*255)},${Math.round((tri.color[1]||1)*255)},${Math.round((tri.color[2]||1)*255)},.75)`;ctx.fill();}ctx.restore();}
    for(const emitter of model.particleEmitters2||[]){const local=nodeMatrices.get(emitter.id)||matIdentity(),world=matMul(anchor,local);drawCascEffectEmitter2(ctx,canvas,emitter,world,runtime,anim,nowMs);}
    runtime.lastSequenceName=anim.seq&&anim.seq.name||'Rest';runtime.lastFrame=anim.frame;return tris.length>0||(model.particleEmitters2||[]).length>0;
  }

  function drawEffectsOverlay(ctx,canvas,nodeMatrices){
    if(!state.model || !$('#modelShowEffects') || !$('#modelShowEffects').checked) return;
    const matrices=nodeMatrices||getDeformedGeometry().nodeMatrices;
    const showCollision=$('#modelShowCollision') && $('#modelShowCollision').checked;
    const effects=(state.model.nodes||[]).filter(n=>['ParticleEmitter','ParticleEmitter2','ParticleEmitterPopcorn','RibbonEmitter','Light','Attachment','EventObject','CollisionShape'].includes(n.type));
    if(state.fxPreviewMode && performance.now()-(state.fxLastStatsLog||0)>5000){
      state.fxLastStatsLog=performance.now();
      const p2=effects.filter(n=>n.type==='ParticleEmitter2'),decoded=[...new Set(state.casc.effectTextures.values())].length;
      diag('debug','FX Renderer','Particle render heartbeat',{particleEmitters2:p2.length,decodedCascTextures:decoded,withTexture:p2.filter(n=>!!getEmitterTextureCanvas(n)).length,fallback:p2.filter(n=>!getEmitterTextureCanvas(n)).length,canvas:{width:canvas.width,height:canvas.height},performanceMode:performanceMode()});
    }
    ctx.save();
    ctx.font='10px system-ui, sans-serif';
    for(const n of effects){
      const m=matrices.get(n.id)||matIdentity();
      const pivot=n.pivot||{x:0,y:0,z:0};
      const wp=matPoint(m,pivot); const p=projectPoint(wp,canvas);
      let fxPreview=null,cascAnimated=false;
      const effectKey=n.path?normalizePath(n.path):'';
      if(n.path) fxPreview=state.casc.effectPreviews.get(effectKey)||null;
      if(!fxPreview&&n.type==='ParticleEmitter2'&&n.textureId>=0) fxPreview=currentTextureCanvas(n.textureId);
      if(state.fxPreviewMode&&n.path&&state.casc.enabled&&mainEffectNodeVisibility(n)>.001){
        const runtime=state.casc.effectRuntimes.get(effectKey);if(runtime)cascAnimated=drawCascEffectModel(ctx,canvas,n,m,runtime,performance.now());
      }
      if(state.fxPreviewMode&&n.type==='ParticleEmitter2')drawParticleEmitter2Simulation(ctx,canvas,n,m,performance.now());
      else if(!cascAnimated&&fxPreview && state.casc.enabled){
        const base=n.type==='ParticleEmitter2'?Math.max(Number(n.width||0),Number(n.length||0),20):28;
        const size=clamp(18+base*.22,20,72),oldComp=ctx.globalCompositeOperation,oldAlpha=ctx.globalAlpha;
        ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.68;ctx.drawImage(fxPreview,p.x-size/2,p.y-size/2,size,size);ctx.globalCompositeOperation=oldComp;ctx.globalAlpha=oldAlpha;
      }
      const isSelected=!state.photoMode && String(state.selectedNodeId)===String(n.id);
      if(n.type==='CollisionShape'){
        if(!showCollision) continue;
        const pts=(n.collisionVertices||[]).map(v=>projectPoint(matPoint(m,v),canvas));
        ctx.strokeStyle=isSelected?'rgba(255,213,111,.96)':'rgba(255,120,120,.8)';ctx.lineWidth=isSelected?2:1.25;
        if(pts.length===2){ctx.strokeRect(Math.min(pts[0].x,pts[1].x),Math.min(pts[0].y,pts[1].y),Math.abs(pts[1].x-pts[0].x),Math.abs(pts[1].y-pts[0].y));}
        else{ctx.beginPath();ctx.arc(p.x,p.y,Math.max(4,(n.boundsRadius||4)*cameraTransform(canvas).pxScale),0,Math.PI*2);ctx.stroke();}
        if(isSelected){ctx.fillStyle='rgba(255,225,154,.96)';ctx.font='10px system-ui, sans-serif';ctx.fillText(n.name||`${n.type} ${n.id}`,p.x+10,p.y-10);}
        continue;
      }
      if(n.type==='Light'){
        ctx.strokeStyle='rgba(255,231,128,.9)';ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(p.x-9,p.y);ctx.lineTo(p.x+9,p.y);ctx.moveTo(p.x,p.y-9);ctx.lineTo(p.x,p.y+9);ctx.stroke();
      }else if(n.type==='Attachment'){
        ctx.fillStyle='rgba(124,202,255,.9)';ctx.fillRect(p.x-4,p.y-4,8,8);
      }else if(n.type==='RibbonEmitter'){
        ctx.strokeStyle='rgba(202,134,255,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-10,p.y+4);ctx.quadraticCurveTo(p.x,p.y-7,p.x+12,p.y+3);ctx.stroke();
      }else if(n.type==='EventObject'){
        ctx.fillStyle='rgba(255,170,91,.92)';ctx.beginPath();ctx.moveTo(p.x,p.y-6);ctx.lineTo(p.x+6,p.y);ctx.lineTo(p.x,p.y+6);ctx.lineTo(p.x-6,p.y);ctx.closePath();ctx.fill();
      }else{
        if(!(state.fxPreviewMode&&n.type==='ParticleEmitter2'&&!isSelected)){
          ctx.strokeStyle=n.type==='ParticleEmitterPopcorn'?'rgba(255,122,201,.95)':'rgba(110,239,181,.92)';ctx.lineWidth=isSelected?2.4:1.5;ctx.beginPath();ctx.arc(p.x,p.y,isSelected?8:5,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x-(isSelected?10:7),p.y-(isSelected?10:7));ctx.lineTo(p.x+(isSelected?10:7),p.y+(isSelected?10:7));ctx.moveTo(p.x+(isSelected?10:7),p.y-(isSelected?10:7));ctx.lineTo(p.x-(isSelected?10:7),p.y+(isSelected?10:7));ctx.stroke();
        }
      }
      if(isSelected){
        ctx.fillStyle='rgba(255,225,154,.96)';ctx.font='10px system-ui, sans-serif';ctx.fillText(n.name||`${n.type} ${n.id}`,p.x+10,p.y-10);
      }
    }
    const cams=state.model.cameras||[];
    cams.forEach(c=>{const selected=String(state.selectedNodeId)===String(c.__cameraId);const p=projectPoint({x:c.position[0]||0,y:c.position[1]||0,z:c.position[2]||0},canvas);ctx.strokeStyle=selected?'rgba(255,225,154,.96)':'rgba(125,180,255,.8)';ctx.lineWidth=selected?2:1.2;ctx.strokeRect(p.x-6,p.y-4,12,8);ctx.beginPath();ctx.moveTo(p.x+6,p.y-3);ctx.lineTo(p.x+11,p.y-6);ctx.lineTo(p.x+11,p.y+6);ctx.lineTo(p.x+6,p.y+3);ctx.closePath();ctx.stroke();if(selected){ctx.fillStyle='rgba(255,225,154,.96)';ctx.font='10px system-ui, sans-serif';ctx.fillText(c.name||'Camera',p.x+12,p.y-8);}});
    ctx.restore();
  }


  function rotationGizmoGeometry(canvas){
    if(!state.model) return null;
    const bounds=currentDisplayBounds();
    if(!bounds||!bounds.center) return null;
    const c3=cameraTarget();
    const center=projectPoint(c3,canvas);
    const radius=Math.max(1,bounds.size*0.38);
    const steps=96;
    const ringPoints=(axis)=>{
      const pts=[];
      for(let i=0;i<=steps;i++){
        const t=(i/steps)*Math.PI*2,a=Math.cos(t)*radius,b=Math.sin(t)*radius;
        let wp;
        if(axis==='x') wp={x:c3.x,y:c3.y+a,z:c3.z+b};
        else if(axis==='y') wp={x:c3.x+a,y:c3.y,z:c3.z+b};
        else wp={x:c3.x+a,y:c3.y+b,z:c3.z};
        pts.push(projectPoint(wp,canvas));
      }
      return pts;
    };
    return {bounds,c3,center,radius,rings:{x:ringPoints('x'),y:ringPoints('y'),z:ringPoints('z')}};
  }

  function pointSegmentDistance(px,py,a,b){
    const vx=b.x-a.x,vy=b.y-a.y,wx=px-a.x,wy=py-a.y;
    const vv=vx*vx+vy*vy;
    const t=vv>1e-9?clamp((wx*vx+wy*vy)/vv,0,1):0;
    const dx=px-(a.x+vx*t),dy=py-(a.y+vy*t);
    return Math.hypot(dx,dy);
  }

  function hitRotationGizmo(x,y,canvas){
    if(state.viewportTool!=='rotate' || !state.gizmoVisible) return null;
    const g=rotationGizmoGeometry(canvas); if(!g) return null;
    const centerDist=Math.hypot(x-g.center.x,y-g.center.y);
    if(centerDist<=12) return {axis:'free',center:g.center,distance:centerDist};
    let best=null;
    for(const axis of ['x','y','z']){
      const pts=g.rings[axis];
      let d=Infinity;
      for(let i=1;i<pts.length;i++) d=Math.min(d,pointSegmentDistance(x,y,pts[i-1],pts[i]));
      if(d<=8 && (!best||d<best.distance)) best={axis,center:g.center,distance:d};
    }
    return best;
  }

  function drawRotationGizmo(ctx,canvas){
    if(!state.model || state.viewportTool!=='rotate' || !state.gizmoVisible || state.activePropPanel==='paint') return;
    const g=rotationGizmoGeometry(canvas); if(!g) return;
    const colors={x:'rgba(255,82,82,.96)',y:'rgba(70,232,110,.96)',z:'rgba(83,156,255,.98)'};
    ctx.save();
    for(const axis of ['x','y','z']){
      const active=(state.gizmoDrag&&state.gizmoDrag.axis===axis)||state.gizmoHover===axis;
      const pts=g.rings[axis];
      ctx.strokeStyle=colors[axis];
      ctx.lineWidth=active?3.2:1.8;
      ctx.globalAlpha=active?1:.82;
      ctx.beginPath();
      pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.stroke();
    }
    ctx.globalAlpha=1;
    const freeActive=(state.gizmoDrag&&state.gizmoDrag.axis==='free')||state.gizmoHover==='free';
    ctx.fillStyle=freeActive?'rgba(255,255,255,.30)':'rgba(255,255,255,.14)';
    ctx.strokeStyle='rgba(255,255,255,.95)'; ctx.lineWidth=freeActive?2.4:1.5;
    ctx.beginPath(); ctx.arc(g.center.x,g.center.y,10,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.font='bold 10px system-ui,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const labelPoint=(axis)=>g.rings[axis][Math.floor(g.rings[axis].length*.25)];
    for(const axis of ['x','y','z']){
      const p=labelPoint(axis); ctx.fillStyle=colors[axis]; ctx.fillText(axis.toUpperCase(),p.x,p.y);
    }
    ctx.restore();
  }

  function drawPaintCursor(ctx,canvas){
    if(!can3DPaint()||!state.paintCursor||!state.paintCursor.hit)return;
    const hit=state.paintCursor.hit,tri=hit.tri,size=+(($('#modelPaintSize')&&$('#modelPaintSize').value)||24),texIndex=tri.texIndex,tex=currentTextureCanvas(texIndex),tw=Math.max(1,tex&&tex.width||app.editor.width||1),th=Math.max(1,tex&&tex.height||app.editor.height||1),src=tri.uv.map(u=>({x:u.u*tw-.5,y:u.v*th-.5})),dst=tri.p,m=affineFromTriangles(src[0],src[1],src[2],dst[0],dst[1],dst[2]);
    ctx.save();ctx.strokeStyle='rgba(255,255,255,.98)';ctx.lineWidth=1.4;
    if(m){
      const center={x:hit.uv.u*tw-.5,y:hit.uv.v*th-.5},r=Math.max(.5,size*.5);
      ctx.beginPath();ctx.moveTo(dst[0].x,dst[0].y);ctx.lineTo(dst[1].x,dst[1].y);ctx.lineTo(dst[2].x,dst[2].y);ctx.closePath();ctx.clip();
      ctx.beginPath();for(let i=0;i<=64;i++){const t=i/64*Math.PI*2,tx=center.x+Math.cos(t)*r,ty=center.y+Math.sin(t)*r,x=m.a*tx+m.c*ty+m.e,y=m.b*tx+m.d*ty+m.f;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();
    }
    const centerScreen=hit.point?projectPoint(hit.point,canvas):{x:state.paintCursor.x,y:state.paintCursor.y};ctx.fillStyle='rgba(111,214,255,.98)';ctx.beginPath();ctx.arc(centerScreen.x,centerScreen.y,2.4,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  function drawModelPreview(){
    const canvas = $('#model3dCanvas');
    // Keep the CPU fallback/backing canvas on the exact same CSS -> device-pixel
    // transform used by WebGL and every interaction before any draw or pick occurs.
    syncCanvasBackingSize(canvas);
    const ctx = canvas.getContext('2d');
    if(!state.model){ drawBackground(ctx, canvas); return; }
    if(!state.model.geosets.length){ drawBackground(ctx, canvas); return; }
    const glRendered=renderGlPreview();
    if(glRendered){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      const gridToggle=$('#modelShowGrid');
      if(!state.photoMode && (!gridToggle || gridToggle.checked)){
        ctx.save();ctx.strokeStyle='rgba(255,255,255,.045)';ctx.lineWidth=1;
        const step=Math.max(24,Math.round(canvas.width/24));
        for(let x=0;x<canvas.width;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
        for(let y=0;y<canvas.height;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
        ctx.restore();
      }
      const sharedMatrices=getDeformedGeometry().nodeMatrices;
      if(!state.photoMode){drawExtentOverlay(ctx,canvas);drawPivots(ctx,canvas,sharedMatrices);}
      drawEffectsOverlay(ctx,canvas,sharedMatrices);
      if(!state.photoMode){drawRotationGizmo(ctx,canvas);drawPaintCursor(ctx,canvas);}
      if(!state.photoMode && can3DPaint()&&state.paintCursor&&state.paintCursor.hit&&state.paintCursor.hit.tri){
        const tp=state.paintCursor.hit.tri.p;ctx.save();ctx.strokeStyle='rgba(111,214,255,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tp[0].x,tp[0].y);ctx.lineTo(tp[1].x,tp[1].y);ctx.lineTo(tp[2].x,tp[2].y);ctx.closePath();ctx.stroke();ctx.restore();
      }
      if(!state.photoMode && state.pickedUv){const p=pickPointFromUV(state.pickedUv);if(p){ctx.save();ctx.strokeStyle='rgba(111,214,255,.95)';ctx.lineWidth=1.35;ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.stroke();ctx.restore();}}
      return;
    }
    drawBackground(ctx, canvas);
    state.meshTriangles = [];

    const requestedDisplay = $('#modelDisplayMode').value;
    const fast=fastPreviewActive();
    const display = fast && ['textured','lit','both','litwire'].includes(requestedDisplay) ? 'solid' : requestedDisplay;
    const tris = buildRenderTriangles(canvas);
    state.meshTriangles = tris;

    for(const tri of tris){
      const tex = currentTextureCanvas(tri.texIndex);
      const [p0,p1,p2] = tri.p;
      const [uv0,uv1,uv2] = tri.uv;
      const textured = display === 'textured' || display === 'both' || display === 'lit' || display === 'litwire';
      const wire = display === 'wireframe' || display === 'both' || display === 'litwire' || (!tex && textured);
      const lit = display === 'lit' || display === 'litwire';
      if(display==='solid' || display==='geoset' || display==='normals' || display==='bonecount'){
        let fill='rgb(148,156,168)';
        if(display==='geoset'){
          const hue=(tri.geoIndex*67)%360; fill=`hsl(${hue} 58% 54%)`;
        }else if(display==='normals'){
          const n=tri.normal||{x:0,y:0,z:1}, len=Math.hypot(n.x,n.y,n.z)||1;
          fill=`rgb(${Math.round((n.x/len*.5+.5)*255)},${Math.round((n.y/len*.5+.5)*255)},${Math.round((n.z/len*.5+.5)*255)})`;
        }else if(display==='bonecount'){
          const c=Math.max(0,Math.min(4,tri.boneCount||0)); const hue=220-c*48; fill=`hsl(${hue} 72% 54%)`;
        }
        ctx.save(); ctx.globalAlpha=tri.alpha==null?1:tri.alpha; ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.closePath(); ctx.fillStyle=fill; ctx.fill(); ctx.restore();
      }
      if(textured && tex){
        const s0={ x:uv0.u*(tex.width-1), y:uv0.v*(tex.height-1) };
        const s1={ x:uv1.u*(tex.width-1), y:uv1.v*(tex.height-1) };
        const s2={ x:uv2.u*(tex.width-1), y:uv2.v*(tex.height-1) };
        ctx.save();
        ctx.globalAlpha=tri.alpha==null?1:tri.alpha;
        ctx.globalCompositeOperation=tri.composite||'source-over';
        drawTexturedTriangle(ctx, tex, s0,s1,s2, p0,p1,p2);
        ctx.restore();
        if(tri.color && (Math.abs(tri.color[0]-1)>.01||Math.abs(tri.color[1]-1)>.01||Math.abs(tri.color[2]-1)>.01)){
          ctx.save(); ctx.globalAlpha=(tri.alpha==null?1:tri.alpha)*0.35; ctx.globalCompositeOperation='multiply';
          ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.closePath();
          ctx.fillStyle=`rgb(${Math.round(clamp(tri.color[0],0,1)*255)},${Math.round(clamp(tri.color[1],0,1)*255)},${Math.round(clamp(tri.color[2],0,1)*255)})`; ctx.fill(); ctx.restore();
        }
        if(lit && !tri.unshaded){
          ctx.save();
          ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.closePath();
          ctx.fillStyle = `rgba(0,0,0,${(1-tri.light)*0.65})`;
          ctx.fill();
          ctx.restore();
        }
      }
      if(wire){
        ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.closePath();
        ctx.strokeStyle = 'rgba(255,220,140,.65)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    const sharedMatrices=getDeformedGeometry().nodeMatrices;
    if(!fast || performanceMode()==='quality'){
      if(!state.photoMode){drawExtentOverlay(ctx, canvas);drawPivots(ctx, canvas, sharedMatrices);}
      drawEffectsOverlay(ctx, canvas, sharedMatrices);
    }
    if(!state.photoMode){drawRotationGizmo(ctx,canvas);drawPaintCursor(ctx,canvas);}

    if(!state.photoMode && state.pickedUv){
      const p = pickPointFromUV(state.pickedUv);
      if(p){
        ctx.save();
        ctx.strokeStyle = 'rgba(111,214,255,.95)';
        ctx.lineWidth = 1.35;
        ctx.beginPath(); ctx.arc(p.x,p.y,8,0,Math.PI*2); ctx.stroke();
        ctx.restore();
      }
    }

  }

  function updateUvMeta(hit){
    const set=(id,value)=>{const el=$('#'+id);if(el)el.textContent=value==null?'—':String(value);};
    if(!hit||!hit.tri){set('uvMetaGeoset','—');set('uvMetaMaterial','—');set('uvMetaLayer','—');set('uvMetaSet','—');set('uvMetaCoord','—');set('uvMetaPixel','—');set('uvMetaShared','—');set('uvMetaTexture','—');return;}
    const t=hit.tri,slot=state.textures[t.texIndex],d=uvToDoc(hit.uv,t.texIndex);
    set('uvMetaGeoset',`G${t.geoIndex+1}`);set('uvMetaMaterial',`M${t.materialId}`);set('uvMetaLayer',`L${t.layerIndex+1}`);set('uvMetaSet',`UV${t.uvSetId}`);set('uvMetaCoord',`${hit.uv.u.toFixed(5)}, ${hit.uv.v.toFixed(5)}`);set('uvMetaPixel',`${Math.round(d.x)}, ${Math.round(d.y)}`);set('uvMetaShared',`${hit.sharedUv||1} face${(hit.sharedUv||1)===1?'':'s'}`);set('uvMetaTexture',slot?basename(slot.ref):`Texture ${t.texIndex}`);
  }

  function syncUvCanvasSize(canvas){
    const rect=canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return;
    const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,2)),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  }

  function uvViewMapping(canvas,tex,bounds){
    const z=state.uvView.zoom||1,tw=Math.max(1,tex&&tex.width||1),th=Math.max(1,tex&&tex.height||1),b=bounds||{minU:0,minV:0,maxU:1,maxV:1};
    const minU=Math.min(0,Number.isFinite(b.minU)?b.minU:0),minV=Math.min(0,Number.isFinite(b.minV)?b.minV:0),maxU=Math.max(1,Number.isFinite(b.maxU)?b.maxU:1),maxV=Math.max(1,Number.isFinite(b.maxV)?b.maxV:1);
    const rangeU=Math.max(.001,maxU-minU),rangeV=Math.max(.001,maxV-minV),base=Math.min(canvas.width/(rangeU*tw),canvas.height/(rangeV*th));
    const unitW=tw*base*z,unitH=th*base*z,totalW=rangeU*unitW,totalH=rangeV*unitH,left=(canvas.width-totalW)/2+(state.uvView.panX||0),top=(canvas.height-totalH)/2+(state.uvView.panY||0);
    return {left,top,unitW,unitH,totalW,totalH,minU,minV,maxU,maxV,toCanvas:uv=>({x:left+(uv.u-minU)*unitW,y:top+(uv.v-minV)*unitH}),tileRect:(u,v)=>({x:left+(u-minU)*unitW,y:top+(v-minV)*unitH,w:unitW,h:unitH})};
  }

  function drawUvView(){
    const canvas=$('#modelUvCanvas');if(!canvas)return;syncUvCanvasSize(canvas);const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#0c1117';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!state.model||!state.model.geosets.length){const i=$('#uvViewInfo');if(i)i.textContent='No UV';updateUvMeta(null);return;}
    const hit=state.hoveredHit&&state.hoveredHit.tri?state.hoveredHit:null,selected=$('#modelGeosetSelect')?.value||'all';
    let texIndex=hit?hit.tri.texIndex:state.selectedTextureIndex;
    if(!(Number.isInteger(texIndex)&&texIndex>=0)){
      const g0=state.model.geosets[0],m0=state.model.materials[g0.materialId]||{layers:[]},l0=(m0.layers||[])[0];texIndex=l0?l0.textureId:(g0.textureId||0);
    }
    const items=[];
    const addGeo=(geoIndex,preferredLayer=-1)=>{
      const geo=state.model.geosets[geoIndex];if(!geo)return;
      const mat=state.model.materials[geo.materialId]||{layers:[]},layers=(mat.layers&&mat.layers.length)?mat.layers:[{textureId:geo.textureId||0,coordId:0,tracks:{}}];
      let layerIndex=preferredLayer>=0?preferredLayer:layers.findIndex((layer,li)=>{try{return layerState(mat,layer,geoIndex).textureId===texIndex;}catch(_){return layer.textureId===texIndex;}});
      if(layerIndex<0){if(selected==='all')return;layerIndex=0;}
      const layer=layers[layerIndex]||layers[0],ls=layerState(mat,layer,geoIndex),actualTex=ls.textureId;
      if(selected==='all'&&actualTex!==texIndex)return;
      const uvSetId=layer.coordId||0,uvSet=(geo.uvSets&&geo.uvSets[uvSetId])||(geo.uvSets&&geo.uvSets[0])||geo.tverts||[];
      if(!uvSet.length)return;
      items.push({geoIndex,geo,mat,layerIndex,layer,ls,uvSetId,uvSet,texIndex:actualTex});
    };
    if(selected==='all'){
      (state.model.geosets||[]).forEach((_,gi)=>addGeo(gi,hit&&hit.tri.geoIndex===gi?hit.tri.layerIndex:-1));
      if(!items.length && hit)addGeo(hit.tri.geoIndex,hit.tri.layerIndex);
    }else addGeo(clamp(+selected||0,0,state.model.geosets.length-1),hit&&hit.tri.geoIndex===+selected?hit.tri.layerIndex:-1);
    if(!items.length){const i=$('#uvViewInfo');if(i)i.textContent=`No UV uses texture ${texIndex+1}`;updateUvMeta(hit);return;}
    if(selected!=='all')texIndex=items[0].texIndex;
    const tex=currentTextureCanvas(texIndex);let minU=Infinity,minV=Infinity,maxU=-Infinity,maxV=-Infinity;
    for(const item of items){for(const uv of item.uvSet){const t=transformUv(uv,item.ls);if(!Number.isFinite(t.u)||!Number.isFinite(t.v))continue;minU=Math.min(minU,t.u);minV=Math.min(minV,t.v);maxU=Math.max(maxU,t.u);maxV=Math.max(maxV,t.v);}}
    if(!Number.isFinite(minU)){minU=0;minV=0;maxU=1;maxV=1;}
    const map=uvViewMapping(canvas,tex,{minU,minV,maxU,maxV});
    // Show repeated texture tiles when authored UVs intentionally extend outside 0..1.
    if(tex){
      const u0=Math.floor(map.minU),u1=Math.ceil(map.maxU),v0=Math.floor(map.minV),v1=Math.ceil(map.maxV),tileCount=(u1-u0)*(v1-v0);
      ctx.save();ctx.imageSmoothingEnabled=false;
      if(tileCount<=100){for(let v=v0;v<v1;v++)for(let u=u0;u<u1;u++){const r=map.tileRect(u,v);ctx.globalAlpha=(u===0&&v===0)?.82:.26;try{ctx.drawImage(tex,r.x,r.y,r.w,r.h);}catch(_){}}}
      else{const r=map.tileRect(0,0);ctx.globalAlpha=.82;try{ctx.drawImage(tex,r.x,r.y,r.w,r.h);}catch(_){}}
      ctx.restore();
    }
    ctx.save();ctx.lineWidth=1;const u0=Math.floor(map.minU),u1=Math.ceil(map.maxU),v0=Math.floor(map.minV),v1=Math.ceil(map.maxV);
    if((u1-u0)*(v1-v0)<=144){for(let v=v0;v<v1;v++)for(let u=u0;u<u1;u++){const r=map.tileRect(u,v);ctx.strokeStyle=(u===0&&v===0)?'rgba(255,255,255,.20)':'rgba(255,255,255,.07)';ctx.strokeRect(r.x,r.y,r.w,r.h);}}
    ctx.restore();
    let faceTotal=0;
    ctx.save();ctx.lineWidth=Math.max(1,window.devicePixelRatio||1);
    for(const item of items){
      const selectedFace=hit&&hit.tri.geoIndex===item.geoIndex?hit.tri.faceIndex:-1;faceTotal+=(item.geo.faces||[]).length;
      (item.geo.faces||[]).forEach((face,fi)=>{
        const us=face.map(i=>transformUv(item.uvSet[i]||{u:0,v:0},item.ls)),pts=us.map(map.toCanvas);if(pts.length<3)return;
        if(fi===selectedFace){ctx.fillStyle='rgba(71,190,255,.18)';ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);ctx.lineTo(pts[1].x,pts[1].y);ctx.lineTo(pts[2].x,pts[2].y);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(111,214,255,.98)';ctx.lineWidth=2;}
        else{ctx.strokeStyle=selected==='all'?'rgba(255,213,112,.58)':'rgba(255,213,112,.72)';ctx.lineWidth=1;}
        ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);ctx.lineTo(pts[1].x,pts[1].y);ctx.lineTo(pts[2].x,pts[2].y);ctx.closePath();ctx.stroke();
      });
    }
    if(hit&&hit.uv){const p=map.toCanvas(hit.uv);ctx.strokeStyle='rgba(111,214,255,.98)';ctx.fillStyle='rgba(9,15,21,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(p.x-10,p.y);ctx.lineTo(p.x+10,p.y);ctx.moveTo(p.x,p.y-10);ctx.lineTo(p.x,p.y+10);ctx.stroke();}
    ctx.restore();
    const info=$('#uvViewInfo');if(info){const ext=(minU<0||minV<0||maxU>1||maxV>1)?` · extents U ${minU.toFixed(2)}…${maxU.toFixed(2)} V ${minV.toFixed(2)}…${maxV.toFixed(2)}`:'';info.textContent=selected==='all'?`All · T${texIndex+1} · ${items.length} geoset${items.length===1?'':'s'} · ${faceTotal.toLocaleString()} tris${ext}`:`G${items[0].geoIndex+1} · M${items[0].geo.materialId} · L${items[0].layerIndex+1} · UV${items[0].uvSetId}${ext}`;}
    const zl=$('#modelUvZoomLabel');if(zl)zl.textContent=`${Math.round((state.uvView.zoom||1)*100)}%`;updateUvMeta(hit);
  }

  function pointInTri(p,a,b,c){
    const s=signedArea2(a,b,c),s1=signedArea2(p,a,b),s2=signedArea2(p,b,c),s3=signedArea2(p,c,a);
    return s<0?(s1<=0&&s2<=0&&s3<=0):(s1>=0&&s2>=0&&s3>=0);
  }
  function barycentric(p,a,b,c){
    const det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<1e-9)return null;
    const l1=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/det,l2=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/det;return[l1,l2,1-l1-l2];
  }

  function pickFrameKey(){
    const selected=$('#modelGeosetSelect')?.value||'all';
    return `${geometryFrameKey()}|${selected}`;
  }

  function buildPickTriangles(){
    const out=[];if(!state.model)return out;
    const selected=$('#modelGeosetSelect')?.value||'all',geom=getDeformedGeometry();
    (state.model.geosets||[]).forEach((geo,geoIndex)=>{
      if(selected!=='all'&&+selected!==geoIndex)return;if(geosetRenderState(geoIndex).alpha<=0.001)return;
      const verts=geom.vertices[geoIndex]||geo.vertices,mat=state.model.materials[geo.materialId]||{id:geo.materialId,layers:[]};
      const layers=(mat.layers&&mat.layers.length)?mat.layers:[{id:0,textureId:geo.textureId||mat.textureId||0,filterMode:mat.filterMode||'None',alpha:1,coordId:0,tracks:{}}];
      const layerStates=layers.map((layer,layerIndex)=>({layer,layerIndex,ls:layerState(mat,layer,geoIndex)})).filter(x=>x.ls.alpha>0.001);
      getStaticFaceData(geo).forEach(fd=>{
        const world=[verts[fd.i0],verts[fd.i1],verts[fd.i2]];if(world.some(v=>!v))return;
        out.push({geo,geoIndex,materialId:geo.materialId,mat,faceIndex:fd.faceIndex,vertexIndices:[fd.i0,fd.i1,fd.i2],world,baseUv:fd.baseUv,layerStates,light:fd.light,normal:fd.normal,boneCount:fd.boneCount});
      });
    });
    return out;
  }

  function sampleTextureAlpha(texIndex,uv){
    const src=currentTextureCanvas(texIndex);if(!src)return 1;
    const def=state.model&&state.model.textureDefs&&state.model.textureDefs[texIndex],t=geometry.uvToTexel(uv,src.width,src.height,def);
    try{return src.getContext('2d',{willReadFrequently:true}).getImageData(Math.round(t.x),Math.round(t.y),1,1).data[3]/255;}catch(_){return 1;}
  }

  function resolvePickLayer(base,bc){
    const {geo,geoIndex,mat,vertexIndices}=base,[i0,i1,i2]=vertexIndices;
    const candidates=[];
    for(const entry of base.layerStates){
      const {layer,layerIndex,ls}=entry,uvSetId=layer.coordId||0,uvSet=(geo.uvSets&&geo.uvSets[uvSetId])||(geo.uvSets&&geo.uvSets[0])||geo.tverts||[];
      const raw=[uvSet[i0]||base.baseUv[0],uvSet[i1]||base.baseUv[1],uvSet[i2]||base.baseUv[2]],uvs=raw.map(u=>transformUv(u,ls));
      const uv={u:uvs[0].u*bc[0]+uvs[1].u*bc[1]+uvs[2].u*bc[2],v:uvs[0].v*bc[0]+uvs[1].v*bc[1]+uvs[2].v*bc[2]};
      const texAlpha=sampleTextureAlpha(ls.textureId,uv),effectiveAlpha=texAlpha*ls.alpha;
      if((ls.mode==='Transparent'&&effectiveAlpha<0.75)||effectiveAlpha<=0.001)continue;
      candidates.push({layer,layerIndex,ls,uvSetId,uvs,uv,effectiveAlpha});
    }
    // Match painter's visual surface: later material layers are composited later.
    return candidates.length?candidates[candidates.length-1]:null;
  }

  function sharedUvCount(hit){
    if(!hit||!hit.uv||!hit.tri)return 0;
    const texIndex=hit.tri.texIndex,slot=state.textures[texIndex],w=slot&&slot.canvas?slot.canvas.width:1024,h=slot&&slot.canvas?slot.canvas.height:1024,def=state.model.textureDefs&&state.model.textureDefs[texIndex];
    const texel=geometry.uvToTexel(hit.uv,w,h,def),key=`${geometryFrameKey()}|${texIndex}|${Math.round(texel.x)}|${Math.round(texel.y)}`;
    if(state.sharedUvCache&&state.sharedUvCache.key===key)return state.sharedUvCache.count;
    const target=geometry.normalizeUv(hit.uv,def);let count=0;
    (state.model.geosets||[]).forEach((geo,geoIndex)=>{
      const mat=state.model.materials[geo.materialId]||{layers:[]},layers=(mat.layers&&mat.layers.length)?mat.layers:[{textureId:geo.textureId||0,coordId:0,tracks:{},alpha:1}];
      layers.forEach(layer=>{
        const ls=layerState(mat,layer,geoIndex);if(ls.alpha<=0.001||ls.textureId!==texIndex)return;
        const setId=layer.coordId||0,uvSet=(geo.uvSets&&geo.uvSets[setId])||(geo.uvSets&&geo.uvSets[0])||geo.tverts||[];
        (geo.faces||[]).forEach(face=>{
          const verts=face.map(i=>transformUv(uvSet[i]||{u:0,v:0},ls));
          const shifts=(def&&(def.wrapWidth||def.wrapHeight))?[-1,0,1]:[0];let inside=false;
          for(const sx of shifts)for(const sy of shifts){const p={x:target.u+sx,y:target.v+sy},a={x:verts[0].u,y:verts[0].v},b={x:verts[1].u,y:verts[1].v},c={x:verts[2].u,y:verts[2].v};if(pointInTri(p,a,b,c)){inside=true;break;}};
          if(inside)count++;
        });
      });
    });
    state.sharedUvCache={key,count};return count;
  }

  function pickHitFromCanvas(x,y){
    const canvas=$('#model3dCanvas');if(!canvas||!state.model)return null;
    const key=pickFrameKey();if(state.pickCache.key!==key||!state.pickCache.triangles.length)state.pickCache={key,triangles:buildPickTriangles()};
    const ray=screenRay(canvas,x,y),cull=$('#modelBackfaceCulling')?.checked;let best=null;
    for(const base of state.pickCache.triangles){
      const twoSided=base.mat.twoSided||base.layerStates.some(x=>x.layer.twoSided),ri=geometry.rayTriangle(ray,base.world[0],base.world[1],base.world[2],!!cull&&!twoSided);if(!ri)continue;
      if(!best||ri.t<best.ri.t)best={base,ri};
    }
    if(!best)return null;
    const layerHit=resolvePickLayer(best.base,best.ri.bary);if(!layerHit)return null;
    const b=best.base,ct=cameraTransform(canvas),screen=b.world.map(v=>ct.worldToScreen(v)),viewDepth=ct.worldToView(best.ri.point).z;
    const tri={geoIndex:b.geoIndex,faceIndex:b.faceIndex,vertexIndices:b.vertexIndices,materialId:b.materialId,layerIndex:layerHit.layerIndex,texIndex:layerHit.ls.textureId,uvSetId:layerHit.uvSetId,p:screen,world:b.world,uv:layerHit.uvs,filterMode:layerHit.ls.mode,alpha:layerHit.ls.alpha,priority:(b.mat.priorityPlane||0)*100+layerHit.layerIndex};
    const slot=state.textures[tri.texIndex],texel=slot&&slot.canvas?geometry.uvToTexel(layerHit.uv,slot.canvas.width,slot.canvas.height,state.model.textureDefs&&state.model.textureDefs[tri.texIndex]):null;
    const hit={tri,bc:best.ri.bary,pbc:best.ri.bary,depth:viewDepth,distance:best.ri.t,point:best.ri.point,uv:layerHit.uv,texel};
    hit.sharedUv=sharedUvCount(hit);return hit;
  }
  function pickUVFromCanvas(x,y){const hit=pickHitFromCanvas(x,y);return hit?hit.uv:null;}
  function pickPointFromUV(){return state.hoveredHit&&state.hoveredHit.point?projectPoint(state.hoveredHit.point,$('#model3dCanvas')):null;}

  function uvToDoc(uv,texIndex=state.paintTextureIndex){
    const slot=state.textures[texIndex],w=slot&&slot.canvas?slot.canvas.width:Math.max(1,app.editor.width||1),h=slot&&slot.canvas?slot.canvas.height:Math.max(1,app.editor.height||1),def=state.model&&state.model.textureDefs&&texIndex>=0?state.model.textureDefs[texIndex]:null;
    const t=geometry.uvToTexel(uv,w,h,def);return{x:t.x,y:t.y};
  }

  function updatePaintHitInfo(){
    const el=$('#modelPaintHitInfo'),debug=$('#modelPickingDebug');if(!el)return;const h=state.paintCursor&&state.paintCursor.hit;
    if(!h||!h.uv||!h.tri){el.textContent='Cursor: —';if(debug){debug.textContent='';debug.classList.add('hidden');}updateUvMeta(null);return;}
    const ti=h.tri.texIndex,d=uvToDoc(h.uv,ti),mat=state.model.materials&&state.model.materials[h.tri.materialId];
    el.textContent=`G${h.tri.geoIndex+1} · F${h.tri.faceIndex} · M${h.tri.materialId} · L${h.tri.layerIndex+1} · UV${h.tri.uvSetId} · ${h.uv.u.toFixed(4)}, ${h.uv.v.toFixed(4)} · px ${Math.round(d.x)}, ${Math.round(d.y)} · Shared UV: ${h.sharedUv||1} faces`;
    updateUvMeta(h);
    if(debug){const show=state.debugPicking||$('#modelDebugPicking')?.checked||$('#modelDebugPickingView')?.checked;debug.classList.toggle('hidden',!show);debug.textContent=show?[`geoset: ${h.tri.geoIndex}`,`triangle: ${h.tri.faceIndex}`,`material: ${h.tri.materialId}`,`layer: ${h.tri.layerIndex}`,`textureId: ${ti}`,`uvSet: ${h.tri.uvSetId}`,`barycentrics: ${h.bc.map(v=>v.toFixed(6)).join(', ')}`,`uv: ${h.uv.u.toFixed(6)}, ${h.uv.v.toFixed(6)}`,`texel: ${d.x.toFixed(3)}, ${d.y.toFixed(3)}`,`depth: ${h.depth.toFixed(6)}`,`filter: ${h.tri.filterMode}`,`material shader: ${mat&&mat.shader||'classic'}`].join('\n'):'';}
  }

  function can3DPaint(){ const enabled=$('#modelPaintEnabled'),tool=app.editor&&app.editor.tool; const paintTool=['brush','eraser','clone','smudge','blur','bucket','eyedropper'].includes(tool); return !!(!state.photoMode && state.activePropPanel==='paint' && state.model && enabled && enabled.checked && paintTool); }
  function previewPos(e,canvas){return geometry.clientToCanvas(canvas,e.clientX,e.clientY,true);}
  async function ensureActivePaintTexture(index){
    if(index == null || index < 0 || !state.textures[index]) return false;
    if(state.selectedTextureIndex !== index){
      state.selectedTextureIndex = index;
      updateSelectedTextureLabel();
      renderTextureList();
      drawUvView();
    }
    if(state.editorTextureIndex !== index) await loadTextureSlot(index);
    state.paintTextureIndex = index;
    return true;
  }

  async function onPreviewPointerDown(e){
    const canvas=e.target, p=previewPos(e,canvas);
    state.pointer={x:e.clientX,y:e.clientY};
    const paintMode=can3DPaint();

    // Paint workspace: left paints, Alt+left rotates, right/middle pans.
    if(paintMode){
      if(e.button===2 || e.button===1){
        e.preventDefault(); state.panDrag=true; canvas.classList.add('dragging');
        try{canvas.setPointerCapture(e.pointerId);}catch(_){}
        return;
      }
      if(e.button===0 && e.altKey){
        e.preventDefault(); state.orbitDrag=true; canvas.classList.add('dragging');
        try{canvas.setPointerCapture(e.pointerId);}catch(_){}
        return;
      }
      if(e.button!==0) return;
      e.preventDefault();
      const hit=pickHitFromCanvas(p.x,p.y);
      state.paintCursor={x:p.x,y:p.y,hit};
      scheduleTextureUiRefresh();
      if(!hit || !hit.uv){ markDirty(); return; }
      const texIndex=hit.tri&&hit.tri.texIndex!=null&&hit.tri.texIndex>=0?hit.tri.texIndex:state.selectedTextureIndex;
      const ready=await ensureActivePaintTexture(texIndex);
      if(!ready) return;
      const doc=uvToDoc(hit.uv,texIndex);
      if(app.editor.tool==='eyedropper'){
        app.editor.pickColor(doc.x,doc.y);
        const color=$('#modelPaintColor'); if(color) color.value=app.editor.color;
        state.pickedUv=hit.uv; state.hoveredHit=hit; sync3DPaintUi(); markDirty();
        return;
      }
      if(app.editor.tool==='bucket'){
        const layer=app.editor.activeLayer;
        if(layer){
          pushPaintHistory(texIndex,'3D bucket fill');
          app.editor.floodFill(Math.floor(doc.x-layer.offsetX),Math.floor(doc.y-layer.offsetY));
          noteTextureMutation();
        }
        state.pickedUv=hit.uv; state.hoveredHit=hit; sync3DPaintUi(); markDirty();
        return;
      }
      if(app.editor.tool==='clone' && e.ctrlKey){
        app.editor.setCloneSource(doc); state.pickedUv=hit.uv; state.hoveredHit=hit; sync3DPaintUi(); markDirty();
      }else{
        state.paintDrag=true; canvas.classList.add('painting'); state.pickedUv=hit.uv; state.hoveredHit=hit;
        pushPaintHistory(texIndex,'3D paint');
        app.editor.brushSize=+($('#modelPaintSize')?.value||app.editor.brushSize);
        app.editor.stroke(doc,doc); noteTextureMutation(); markDirty();
      }
      try{canvas.setPointerCapture(e.pointerId);}catch(_){}
      return;
    }

    // View / inspect workspaces: explicit Move and Rotate navigation tools.
    const navTool=state.viewportTool||'rotate';
    const gizmoHit=navTool==='rotate'&&e.button===0&&!state.photoMode?hitRotationGizmo(p.x,p.y,canvas):null;
    if(gizmoHit){
      e.preventDefault();
      state.gizmoDrag={axis:gizmoHit.axis,center:gizmoHit.center,lastX:p.x,lastY:p.y,panX:state.camera.panX,panY:state.camera.panY,targetX:state.camera.targetX,targetY:state.camera.targetY,targetZ:state.camera.targetZ};
      state.gizmoHover=gizmoHit.axis; canvas.classList.add('dragging');
      try{canvas.setPointerCapture(e.pointerId);}catch(_){} markDirty(); return;
    }
    const hitAny=state.model?pickHitFromCanvas(p.x,p.y):null;
    if(hitAny&&navTool==='rotate'){state.gizmoVisible=true;markDirty();}
    if(e.button===0){
      e.preventDefault();
      if(navTool==='move') state.panDrag=true; else state.orbitDrag=true;
      canvas.classList.add('dragging');
      try{canvas.setPointerCapture(e.pointerId);}catch(_){} return;
    }
    if(e.button===2 || e.button===1){
      e.preventDefault(); state.panDrag=true; canvas.classList.add('dragging');
      try{canvas.setPointerCapture(e.pointerId);}catch(_){} return;
    }
  }

  function onPreviewPointerMove(e){
    const canvas = e.target, p = previewPos(e, canvas);
    if(state.gizmoDrag){
      const dx=e.clientX-state.pointer.x, dy=e.clientY-state.pointer.y;
      const gd=state.gizmoDrag;
      // Keep the orbit pivot and screen position absolutely fixed while using the gizmo.
      state.camera.panX=gd.panX; state.camera.panY=gd.panY;
      state.camera.targetX=gd.targetX; state.camera.targetY=gd.targetY; state.camera.targetZ=gd.targetZ;
      if(gd.axis==='free'){
        state.camera.yaw += dx*0.006;
        state.camera.pitch = clamp(state.camera.pitch + dy*0.006,-1.35,1.35);
      }else{
        const vx=(p.x-gd.center.x), vy=(p.y-gd.center.y);
        const len=Math.max(1,Math.hypot(vx,vy));
        const tx=-vy/len, ty=vx/len;
        const mdx=p.x-gd.lastX, mdy=p.y-gd.lastY;
        const delta=(mdx*tx + mdy*ty)*0.012;
        gd.lastX=p.x; gd.lastY=p.y;
        if(gd.axis==='z') state.camera.yaw += delta;
        else if(gd.axis==='x') state.camera.pitch = clamp(state.camera.pitch + delta,-1.48,1.48);
        else if(gd.axis==='y') state.camera.roll += delta;
      }
      state.pointer={x:e.clientX,y:e.clientY};
      state.interactingUntil=performance.now()+140;
      invalidatePickCache(); markDirty();
    } else if(state.paintDrag){
      const hit = pickHitFromCanvas(p.x, p.y);
      state.paintCursor={x:p.x,y:p.y,hit};
      scheduleTextureUiRefresh();
      if(hit && hit.uv && state.pickedUv){
        const hitTexIndex = hit.tri && hit.tri.texIndex != null ? hit.tri.texIndex : state.paintTextureIndex;
        if(state.paintTextureIndex < 0 || hitTexIndex === state.paintTextureIndex){
          const a = uvToDoc(state.pickedUv,state.paintTextureIndex), b = uvToDoc(hit.uv,state.paintTextureIndex);
          app.editor.brushSize = +($('#modelPaintSize')?.value || app.editor.brushSize);
          // Do not draw a giant line across unrelated UV islands when the cursor crosses a seam.
          const uvJump=Math.hypot(b.x-a.x,b.y-a.y);
          const seamLimit=Math.max(48,app.editor.brushSize*3.25);
          if(uvJump>seamLimit) app.editor.stroke(b,b);
          else app.editor.stroke(a,b);
          state.pickedUv = hit.uv;
          state.hoveredHit = hit;
          noteTextureMutation();
          markDirty();
        }
      }
    } else if(state.orbitDrag){
      const dx = e.clientX - state.pointer.x, dy = e.clientY - state.pointer.y;
      state.camera.yaw += dx * 0.0065;
      state.camera.pitch = clamp(state.camera.pitch + dy * 0.0065, -1.15, 1.15);
      state.pointer = { x:e.clientX, y:e.clientY };
      state.interactingUntil=performance.now()+120;
      invalidatePickCache(); markDirty();
    } else if(state.panDrag){
      const dx = e.clientX - state.pointer.x, dy = e.clientY - state.pointer.y;
      state.camera.panX += dx;
      state.camera.panY += dy;
      state.pointer = { x:e.clientX, y:e.clientY };
      state.interactingUntil=performance.now()+120;
      invalidatePickCache(); markDirty();
    } else {
      if(can3DPaint()){
        const hit=pickHitFromCanvas(p.x,p.y);
        state.hoveredHit=hit;
        state.pickedUv=hit?hit.uv:null;
        state.paintCursor={x:p.x,y:p.y,hit};
        scheduleTextureUiRefresh();
        state.gizmoHover='';
        canvas.style.cursor=hit?'crosshair':'default';
        markDirty();
      }else{
        state.paintCursor=null;
        const navTool=state.viewportTool||'rotate';
        const gh=state.photoMode||navTool!=='rotate'?null:hitRotationGizmo(p.x,p.y,canvas);
        const hoverAxis=gh?gh.axis:'';
        if(hoverAxis!==state.gizmoHover){state.gizmoHover=hoverAxis;markDirty();}
        canvas.style.cursor=navTool==='move'?'grab':(gh?'grab':'crosshair');
        state.hoveredHit=null;state.pickedUv=null;
      }
    }
    drawUvView();
  }

  function onPreviewPointerUp(e){
    if(state.paintDrag)diag('debug','Paint','3D paint stroke finished',{textureIndex:state.editorTextureIndex,undo:state.paintHistory.length,redo:state.paintRedo.length});
    state.paintDrag = false;
    state.paintTextureIndex = -1;
    state.orbitDrag = false;
    state.panDrag = false;
    state.gizmoDrag = null;
    e.target.classList.remove('dragging','painting');
    if(can3DPaint()) e.target.style.cursor=state.paintCursor&&state.paintCursor.hit?'crosshair':'default'; else e.target.style.cursor=(state.viewportTool==='move'?'grab':'crosshair');
    try{ e.target.releasePointerCapture(e.pointerId); }catch(_){ }
  }

  function onPreviewWheel(e){
    e.preventDefault();
    const factor=Math.exp(-e.deltaY*0.0018);
    setModelZoom(state.camera.zoom*factor,true);
  }

  function composeViewerCanvas(){
    const overlay=$('#model3dCanvas');if(!overlay)return null;
    const out=document.createElement('canvas');out.width=overlay.width;out.height=overlay.height;
    const ctx=out.getContext('2d',{willReadFrequently:true}),r=state.glRenderer;
    if(r&&r.gl&&r.canvas)ctx.drawImage(r.canvas,0,0,out.width,out.height);
    else{ctx.fillStyle='#0b0f14';ctx.fillRect(0,0,out.width,out.height);}
    ctx.drawImage(overlay,0,0,out.width,out.height);return out;
  }
  function setPhotoMode(enabled){
    state.photoMode=!!enabled;
    document.body.classList.toggle('model-photo-mode',state.photoMode);
    const bar=$('#modelPhotoBar');if(bar)bar.classList.toggle('hidden',!state.photoMode);
    if(state.photoMode){state.paintDrag=false;state.orbitDrag=false;state.panDrag=false;state.gizmoDrag=null;state.paintCursor=null;state.hoveredHit=null;state.pickedUv=null;}
    invalidatePickCache();markDirty();
    requestAnimationFrame(()=>{syncCanvasBackingSize($('#model3dCanvas'));markDirty();});
    return state.photoMode;
  }
  function capturePhotoCanvas(){
    if(!state.model)return null;
    const was=state.photoMode;if(!was)state.photoMode=true;
    drawModelPreview();const out=composeViewerCanvas();
    if(!was){state.photoMode=false;drawModelPreview();}
    return out;
  }
  function sendPhotoToButtons(){
    const shot=capturePhotoCanvas();if(!shot){app.setStatus('Photo Mode: open a model first');return;}
    const modelName=basename((state.model&&state.model.sourceName)||'model').replace(/\.(mdx|mdl)$/i,'');
    const label=`${modelName} · camera take`;
    if(window.WC3_BUTTON_STUDIO?.acceptPhotoCanvas)window.WC3_BUTTON_STUDIO.acceptPhotoCanvas(shot,label);else app.iconTools?.setSourceCanvas?.(shot,label);
    setPhotoMode(false);window.WC3_WORKSPACE_UI?.openModule('buttons');
  }
  function ensurePhotoBar(stageHost){
    let bar=$('#modelPhotoBar');if(!bar){bar=document.createElement('div');bar.id='modelPhotoBar';bar.className='model-photo-bar hidden';bar.innerHTML=`<div><strong>PHOTO MODE</strong><span>Orbit, pan and zoom until the framing is right. Viewport helpers are hidden from the take.</span></div><button class="btn" id="modelPhotoExitBtn" type="button">Exit</button><button class="btn primary" id="modelPhotoUseBtn" type="button">Use camera as button</button>`;stageHost.appendChild(bar);bar.querySelector('#modelPhotoExitBtn').addEventListener('click',()=>setPhotoMode(false));bar.querySelector('#modelPhotoUseBtn').addEventListener('click',sendPhotoToButtons);}else if(bar.parentElement!==stageHost)stageHost.appendChild(bar);
    bar.classList.toggle('hidden',!state.photoMode);return bar;
  }

  function renderModelInfo(){
    const box = $('#modelFileInfo');
    const stageName = $('#modelStageFilename');
    if(!state.model){
      if(stageName) stageName.textContent = 'No model loaded';
      box.textContent = 'No model loaded yet.';
      $('#modelTextureCount').textContent = '0 slots';
      $('#nativeRenderBadge').textContent = 'No mesh';
      return;
    }
    updateRuntimeBadge();
    const projectionBadge=$('#modelProjectionBadge'); if(projectionBadge) projectionBadge.textContent='Orthographic';
    const resolved = state.textures.filter(t => t.imageData && !t.error).length;
    if(stageName) stageName.textContent = basename(state.model.sourceName || state.model.name || 'Model');
    box.textContent = `${state.model.sourceName || state.model.name}\nInternal name: ${state.model.displayName || state.model.name || '(none)'}\nType: ${state.model.type} v${state.model.formatVersion || 800}\nCore: ${state.model.__uvCoreVersion || modelCore.version || '?'} · UV: ${state.model.__uvNormalizedFromLegacy ? 'legacy normalized → authored' : 'authored'}\n${state.model.summary}\nResolved textures: ${resolved}/${state.textures.length}`;
    $('#modelTextureCount').textContent = `${state.textures.length} slot${state.textures.length===1?'':'s'}`;
    $('#nativeRenderBadge').textContent = state.model.geosets.length ? `${state.model.geosets.length} geoset${state.model.geosets.length===1?'':'s'}` : 'No mesh';
  }

  function refreshTexturePreviews(){
    document.querySelectorAll('[data-model-texture-preview]').forEach(el=>{
      const index=+el.dataset.modelTexturePreview;
      const ctx=el.getContext && el.getContext('2d');
      if(!ctx) return;
      ctx.clearRect(0,0,el.width,el.height);
      const src=currentTextureCanvas(index) || (state.textures[index]&&state.textures[index].canvas) || null;
      if(!src) return;
      const sw=src.width||src.videoWidth||0, sh=src.height||src.videoHeight||0;
      if(!sw||!sh) return;
      const scale=Math.min(el.width/sw, el.height/sh);
      const dw=Math.max(1,Math.round(sw*scale));
      const dh=Math.max(1,Math.round(sh*scale));
      const dx=((el.width-dw)/2)|0, dy=((el.height-dh)/2)|0;
      try{ ctx.imageSmoothingEnabled=false; ctx.drawImage(src,dx,dy,dw,dh); }catch(_){ }
      if(index===state.selectedTextureIndex && state.pickedUv){
        const px=dx+state.pickedUv.u*dw, py=dy+state.pickedUv.v*dh;
        ctx.save();
        ctx.strokeStyle='rgba(111,214,255,.98)'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.arc(px,py,5,0,Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px-8,py);ctx.lineTo(px+8,py);ctx.moveTo(px,py-8);ctx.lineTo(px,py+8);ctx.stroke();
        ctx.restore();
      }
    });
  }

  function textureUsage(index){
    const materials=[],geosets=[];
    (state.model?.materials||[]).forEach((mat,mi)=>{
      const layers=(mat.layers||[]).map((layer,li)=>({layer,li})).filter(x=>x.layer.textureId===index);
      if(layers.length)materials.push({id:mat.id!=null?mat.id:mi,index:mi,layers:layers.map(x=>x.li)});
    });
    (state.model?.geosets||[]).forEach((geo,gi)=>{
      const mat=state.model.materials?.[geo.materialId];
      const uses=(mat?.layers||[]).some(l=>l.textureId===index) || (!(mat?.layers||[]).length && (geo.textureId||0)===index);
      if(uses)geosets.push(gi);
    });
    return {materials,geosets};
  }

  function renderTextureList(){
    const list = $('#modelTextureList');
    list.innerHTML = '';
    if(!state.textures.length){ list.classList.add('empty'); list.textContent = 'Load a model or ZIP package to detect texture slots.'; return; }
    list.classList.remove('empty');
    state.textures.forEach((slot, index) => {
      const item = document.createElement('div');
      item.className = 'model-texture-item' + (index === state.selectedTextureIndex ? ' active' : '');
      const ok = !!slot.canvas && !slot.error,usage=textureUsage(index),w=slot.width||slot.canvas?.width||0,h=slot.height||slot.canvas?.height||0;
      const materials=usage.materials.length?usage.materials.map(x=>`M${x.id} · L${x.layers.map(n=>n+1).join('/')}`).join(', '):'—';
      const geosets=usage.geosets.length?usage.geosets.map(n=>`G${n+1}`).join(', '):'—';
      item.innerHTML = `
        <div class="model-texture-card">
          <div class="model-texture-thumb-wrap"><canvas class="model-texture-thumb" width="120" height="120" data-model-texture-preview="${index}"></canvas></div>
          <div class="model-texture-meta">
            <div class="model-texture-head">
              <div class="model-texture-titleblock">
                <div class="model-texture-name">${escapeHtml(basename(slot.ref) || `Texture ${index+1}`)}</div>
                <div class="model-texture-path">${escapeHtml(slot.ref||'(replaceable texture)')}</div>
              </div>
              <span class="model-status ${ok ? 'ok':'bad'}">${ok ? 'resolved':'missing'}</span>
            </div>
            <div class="model-texture-facts">
              <span><b>${w&&h?`${w}×${h}`:'—'}</b><small>size</small></span>
              <span><b>${escapeHtml(slot.format||'—')}</b><small>format</small></span>
              <span><b>${usage.geosets.length}</b><small>geosets</small></span>
            </div>
            <div class="model-binding-line"><span>Materials</span><strong>${escapeHtml(materials)}</strong></div>
            <div class="model-binding-line"><span>Geosets</span><strong>${escapeHtml(geosets)}</strong></div>
            <div class="model-texture-actions">
              <button type="button" class="btn tiny pick-texture">Select</button>
              <button type="button" class="btn tiny load-texture" ${ok ? '' : 'disabled'}>Open / Load to Paint</button>
              <button type="button" class="btn tiny edit-path">Edit Path</button>
            </div>
            ${slot.resolvedName ? `<div class="model-mini-note">Resolved file: ${escapeHtml(slot.resolvedName)}</div>` : ''}
            ${slot.error ? `<div class="warning bad">${escapeHtml(slot.error)}</div>` : ''}
          </div>
        </div>
      `;
      item.querySelector('.pick-texture').addEventListener('click', () => { state.selectedTextureIndex = index; renderTextureList(); updateSelectedTextureLabel(); drawUvView(); markDirty(); });
      item.querySelector('.load-texture').addEventListener('click', () => loadTextureSlot(index));
      item.querySelector('.edit-path').addEventListener('click', () => editTexturePath(index));
      list.appendChild(item);
    });
    refreshTexturePreviews();
  }

  function renderGeosetSelect(){
    const sel = $('#modelGeosetSelect');
    sel.innerHTML = '<option value="all">All geosets</option>';
    if(state.model && state.model.geosets){
      state.model.geosets.forEach((g, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = `Geoset ${i+1} · ${g.faces.length} tris`;
        sel.appendChild(o);
      });
    }
  }

  function updateSelectedTextureLabel(){
    const slot = state.textures[state.selectedTextureIndex];
    $('#modelSelectedTextureName').textContent = slot ? basename(slot.ref) || `Texture ${state.selectedTextureIndex+1}` : 'No texture selected';
    const paintName=$('#modelPaintTextureName');
    if(paintName){const active=state.textures[state.editorTextureIndex>=0?state.editorTextureIndex:state.selectedTextureIndex];paintName.textContent=active?basename(active.ref):'No texture loaded';}
  }

  function editTexturePath(index){
    if(!state.model || !state.textures[index]) return;
    const slot=state.textures[index];
    const next=prompt('Texture import path:',slot.ref||'');
    if(next==null) return;
    const clean=next.trim();
    if(!clean && !(state.model.textureDefs[index]&&state.model.textureDefs[index].replaceableId)){
      alert('Custom texture paths cannot be empty unless this slot uses a replaceable ID.'); return;
    }
    slot.ref=clean;
    if(state.model.textureDefs[index]) state.model.textureDefs[index].path=clean;
    if(state.model.textures) state.model.textures[index]=clean;
    renderTextureList();updateSelectedTextureLabel();renderCoreInfo();
    app.setStatus(`Texture path ${index} updated`);
  }

  function downloadModelBlob(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  function safeZipPath(path,fallback='texture.blp'){
    let out=String(path||fallback).replace(/\\/g,'/').replace(/^[A-Za-z]:/,'').replace(/^\/+/, '');
    const parts=[];for(const part of out.split('/')){if(!part||part==='.')continue;if(part==='..'){if(parts.length)parts.pop();continue;}parts.push(part.replace(/[<>:"|?*]/g,'_'));}
    return parts.join('/')||fallback;
  }
  function modelBaseName(){
    const ext=(state.model&&state.model.type||'MDX').toLowerCase();
    return (state.model&&state.model.sourceName||state.model&&state.model.name||`model.${ext}`).replace(/\.(mdx|mdl)$/i,'');
  }
  async function blobBytes(blob){return new Uint8Array(await blob.arrayBuffer());}
  function originalTextureBytes(slot){
    const candidates=[slot&&slot.resolvedName,slot&&slot.ref].filter(Boolean).map(normalizePath);
    for(const [name,entry] of state.packageFiles.entries()){
      const n=normalizePath(name);if(candidates.some(c=>n===c||basename(n).toLowerCase()===basename(c).toLowerCase()))return entry&&entry.data?new Uint8Array(entry.data):null;
    }
    for(const rec of state.casc.loaded.values()){
      const names=[rec&&rec.resolvedPath,rec&&rec.relativePath,rec&&rec.requestedPath].filter(Boolean).map(normalizePath);
      if(!names.some(n=>candidates.some(c=>n===c||basename(n).toLowerCase()===basename(c).toLowerCase())))continue;
      const ab=arrayBufferFromIpc(rec&&rec.data);if(ab)return new Uint8Array(ab);
    }
    return null;
  }
  async function canvasEncodedBytes(canvas,imageData,ext){
    ext=String(ext||'').toLowerCase();
    if(ext==='blp')return blobBytes(BLP.encodePaletted(imageData,{mipmaps:true,dither:false,alphaBits:BLP.hasMeaningfulAlpha(imageData)?8:0}));
    if(ext==='tga')return blobBytes(TGA.encode(imageData));
    const mime=ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='webp'?'image/webp':'image/png';
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Texture encoder returned no data.')),mime,0.95));
    return blobBytes(blob);
  }
  async function buildTextureExportFiles(){
    const files=[],pathOverrides=[],notes=[];const defs=state.model&&state.model.textureDefs||[];
    for(let idx=0;idx<defs.length;idx++){
      const def=defs[idx]||{},slot=state.textures[idx],rid=Number(def.replaceableId||0),ref=String(def.path||slot&&slot.ref||'');
      if(!ref&&rid){notes.push(`Slot ${idx}: ReplaceableId ${rid} (Warcraft runtime texture; no external file).`);pathOverrides[idx]='';continue;}
      if(!ref){notes.push(`Slot ${idx}: empty texture path.`);continue;}
      let target=safeZipPath(ref,`Textures/texture_${idx}.blp`),ext=(target.split('.').pop()||'').toLowerCase(),bytes=null;
      if(slot&&!slot.edited)bytes=originalTextureBytes(slot);
      if(!bytes&&slot&&slot.canvas&&slot.imageData){
        if(!['blp','tga','png','jpg','jpeg','webp'].includes(ext)){
          target=target.replace(/\.[^/.]+$/,'')+'.blp';ext='blp';notes.push(`Slot ${idx}: edited ${ref} exported as ${target} because ${String(ref).split('.').pop()||'that format'} encoding is not available.`);
        }
        bytes=await canvasEncodedBytes(slot.canvas,slot.imageData,ext);
      }
      if(!bytes){notes.push(`Slot ${idx}: ${ref} could not be included because its source pixels were not loaded.`);pathOverrides[idx]=ref;continue;}
      files.push({name:target,data:bytes});pathOverrides[idx]=target.replace(/\//g,'\\');
    }
    return {files,pathOverrides,notes};
  }
  function clonedModelForPaths(paths){
    const model={...state.model};model.textureDefs=(state.model.textureDefs||[]).map((d,i)=>({...d,path:paths[i]!=null?paths[i]:d.path}));model.textures=model.textureDefs.map(d=>d.path||'');return model;
  }
  function serializeCurrentModel(model=state.model){
    if(!state.model||!state.model.sourceBuffer)throw new Error('No editable MDX / MDL model is loaded.');
    const saver=window.WC3_MODEL_SAVE;if(!saver||!saver.saveEditedModel)throw new Error('Model save module is unavailable.');
    return saver.saveEditedModel(state.model.sourceBuffer,state.model.sourceName||state.model.name,model);
  }
  function saveEditedModel(){
    if(!state.model||!state.model.sourceBuffer)return false;
    try{
      const result=serializeCurrentModel(),ext=(result.type||state.model.type||'MDX').toLowerCase(),base=modelBaseName();
      downloadModelBlob(new Blob([result.bytes],{type:result.type==='MDL'?'text/plain':'application/octet-stream'}),`${base}_edited.${ext}`);
      const c=result.changes||{};app.setStatus(`Model saved · ${String(result.type||'').toUpperCase()} · ${c.cameras||0} camera(s), ${c.particleEmitters2||0} emitter(s), ${c.attachments||0} attachment(s) added`);
      diag('info','Model Save','Edited model serialized',{type:result.type,name:`${base}_edited.${ext}`,changes:c});return true;
    }catch(e){diag('error','Model Save','Could not save edited model',e);alert('Could not save edited model.\n\n'+(e.message||e));return false;}
  }
  async function exportModelTextures(){
    if(!state.model)return false;
    try{
      const pack=await buildTextureExportFiles();if(!pack.files.length)throw new Error('No external texture files are available to export.');
      const manifest=['WC3 Asset Studio texture export','',...pack.notes].join('\n');pack.files.push({name:'WC3_Asset_Studio_Texture_Export.txt',data:manifest});
      downloadModelBlob(SimpleZip.create(pack.files),`${modelBaseName()}_textures.zip`);app.setStatus(`Textures exported · ${pack.files.length-1} file(s)`);return true;
    }catch(e){diag('error','Model Save','Could not export textures',e);alert('Could not export model textures.\n\n'+(e.message||e));return false;}
  }
  async function exportModelPackage(){
    if(!state.model||!state.model.sourceBuffer)return false;
    try{
      const pack=await buildTextureExportFiles(),packageModel=clonedModelForPaths(pack.pathOverrides),result=serializeCurrentModel(packageModel),ext=(result.type||state.model.type||'MDX').toLowerCase(),base=modelBaseName(),modelName=`${base}_edited.${ext}`;
      const files=[{name:modelName,data:result.bytes},...pack.files];
      const c=result.changes||{};files.push({name:'WC3_Asset_Studio_SaveInfo.txt',data:[`Model: ${modelName}`,`Format: ${String(result.type||'').toUpperCase()}`,`Textures included: ${pack.files.length}`,`New cameras: ${c.cameras||0}`,`New ParticleEmitter2: ${c.particleEmitters2||0}`,`New attachments: ${c.attachments||0}`,'',...pack.notes].join('\n')});
      downloadModelBlob(SimpleZip.create(files),`${base}_edited_package.zip`);app.setStatus(`Full model package saved · ${pack.files.length} texture(s)`);diag('info','Model Save','Model + texture package exported',{model:modelName,textures:pack.files.length,changes:c,notes:pack.notes});return true;
    }catch(e){diag('error','Model Save','Could not save model package',e);alert('Could not save model + textures package.\n\n'+(e.message||e));return false;}
  }

  async function loadTextureSlot(index){
    const slot = state.textures[index];
    if(!slot || !slot.imageData || slot.error) return;
    await app.openImageData(slot.imageData, basename(slot.ref) || `texture_${index+1}`);
    diag('info','Texture',`Model texture opened for paint`,{index,ref:slot.ref,resolvedName:slot.resolvedName,width:slot.width,height:slot.height,format:slot.format});
    state.selectedTextureIndex = index;
    state.editorTextureIndex = index;
    renderTextureList();
    updateSelectedTextureLabel();
    drawUvView();
    sync3DPaintUi();
    markDirty();
  }

  function renderSequenceUI(){
    const select = $('#modelSequenceSelect');
    const info = $('#modelSequenceInfo');
    const count = $('#modelSequenceCount');
    const sequences = state.model ? state.model.sequences : [];
    const previous=select.value;
    select.innerHTML = '<option value="">None</option>';
    (sequences || []).forEach((seq, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${seq.name} (${seq.start}–${seq.end})`;
      select.appendChild(o);
    });
    if(previous!=='' && +previous<sequences.length) select.value=previous;
    count.textContent = `${sequences.length} sequence${sequences.length===1?'':'s'}`;
    const seq = currentSequence();
    if(!seq) info.textContent = 'No sequence loaded.';
    else {
      const tracked=(state.model.nodes||[]).filter(n=>n.translation||n.rotation||n.scaling).length;
      info.textContent = `Name: ${seq.name}\nInterval: ${seq.start} → ${seq.end}\nLength: ${seq.length} frames\nAnimation: ${$('#modelAnimMode').value}\nTracked nodes: ${tracked}/${(state.model.nodes||[]).length}`;
    }
    $('#modelSequenceScrub').value = Math.round(currentSequenceProgress() * 1000);
    $('#modelSequencePlayBtn').textContent = state.animation.playing ? 'Pause' : 'Play';
  }

  function renderRigUI(){
    const info = $('#modelRigInfo');
    const list = $('#modelNodeList');
    const count = $('#modelRigCount');
    if(!state.model){
      info.textContent = 'No pivot or node data loaded.';
      list.classList.add('empty'); list.textContent = 'Load a model to inspect helpers and bones.';
      count.textContent = '0 rig nodes';
      return;
    }
    const allNodes=state.model.nodes||[];
    const nodes=allNodes.filter(n=>n.type==='Bone'||n.type==='Helper');
    const byId=new Map(allNodes.map(n=>[n.id,n]));
    const boneNodes=nodes.filter(n=>n.type==='Bone');
    const boneCount=boneNodes.length;
    const helpers=nodes.length-boneCount;
    const badParents=nodes.filter(n=>n.parentId>=0&&(n.parentId===n.id||!byId.has(n.parentId))).length;
    const geosets=state.model.geosets||[];
    const skinGeos=geosets.filter(g=>g.skin&&g.skin.length).length;
    const classicGeos=geosets.length-skinGeos;
    let invalidSkinRefs=0,legacySkinFallbackRefs=0,badWeightVertices=0,zeroWeightVertices=0;
    const boneIdSet=new Set((state.model.bones||[]).map(b=>b&&b.id).filter(Number.isFinite));
    for(const geo of geosets){
      if(!geo.skin||geo.skin.length<8)continue;
      const verts=Math.min((geo.vertices||[]).length,Math.floor(geo.skin.length/8));
      for(let v=0;v<verts;v++){
        const off=v*8; let sum=0;
        for(let k=0;k<4;k++){
          const w=geo.skin[off+4+k]||0; sum+=w;
          if(w>0){
            const bi=geo.skin[off+k]||0;
            if(bi>=boneCount){
              if(boneIdSet.has(bi))legacySkinFallbackRefs++;
              else invalidSkinRefs++;
            }
          }
        }
        if(sum===0)zeroWeightVertices++;
        else if(Math.abs(sum-255)>1)badWeightVertices++;
      }
    }
    count.textContent = `${nodes.length} rig node${nodes.length===1?'':'s'}`;
    const skinDetails=skinGeos
      ? `Reforged SKIN4 (${skinGeos} geoset${skinGeos===1?'':'s'})\nSKIN mapping: BONE chunk order${legacySkinFallbackRefs?` (+ ${legacySkinFallbackRefs} legacy ObjectId fallback)`:''}\nInvalid SKIN refs: ${invalidSkinRefs}\nNon-255 weight vertices: ${badWeightVertices}\nZero-weight vertices: ${zeroWeightVertices}`
      : `Classic matrix groups (${classicGeos} geoset${classicGeos===1?'':'s'})\nMATS mapping: node ObjectId`;
    info.textContent = `Bones: ${boneCount}\nHelpers: ${helpers}\nPivot points: ${(state.model.pivots || []).length}\nSkinning: ${skinDetails}\nInvalid parent links: ${badParents}\nSelected node: ${state.selectedNodeId >= 0 ? state.selectedNodeId : 'none'}`;
    list.innerHTML = '';
    if(!nodes.length){ list.classList.add('empty'); list.textContent = 'No Bone/Helper nodes detected in this model.'; return; }
    list.classList.remove('empty');
    nodes.forEach(node => {
      const item = document.createElement('div');
      item.className = 'model-node-item' + (node.id === state.selectedNodeId ? ' active' : '');
      const tracks=[node.translation?'T':'',node.rotation?'R':'',node.scaling?'S':''].filter(Boolean).join('')||'—';
      const inherit=[];
      if(node.flags&1)inherit.push('no T');if(node.flags&2)inherit.push('no R');if(node.flags&4)inherit.push('no S');
      const parentBad=node.parentId>=0&&(node.parentId===node.id||!byId.has(node.parentId));
      item.innerHTML = `<div class="model-node-name">${escapeHtml(node.name||`${node.type} ${node.id}`)}</div><div class="model-node-meta">${escapeHtml(node.type)} · ID ${node.id}${node.parentId >= 0 ? ` · Parent ${node.parentId}${parentBad?' ⚠':''}` : ' · Root'} · Tracks ${tracks}${inherit.length?` · ${inherit.join('/')}`:''}${node.pivot ? ` · Pivot ${node.pivot.x.toFixed(1)}, ${node.pivot.y.toFixed(1)}, ${node.pivot.z.toFixed(1)}` : ''}</div>`;
      item.addEventListener('click', () => { state.selectedNodeId = node.id; renderRigUI(); markDirty(); });
      list.appendChild(item);
    });
  }

  function renderMaterialUI(){
    const list = $('#modelMaterialList');
    const count = $('#modelMaterialCount');
    list.innerHTML = '';
    if(!state.model){ list.classList.add('empty'); list.textContent = 'No materials loaded.'; count.textContent = '0 materials'; return; }
    const mats = state.model.materials || [];
    count.textContent = `${mats.length} material${mats.length===1?'':'s'}`;
    if(!mats.length){ list.classList.add('empty'); list.textContent = 'No materials loaded.'; return; }
    list.classList.remove('empty');
    mats.forEach(mat => {
      const item = document.createElement('div');
      item.className = 'model-texture-item';
      const texName = state.textures[mat.textureId] ? basename(state.textures[mat.textureId].ref) : `Texture ${mat.textureId}`;
      const geoCount = (state.model.geosets || []).filter(g => g.materialId === mat.id).length;
      const layerInfo=(mat.layers||[]).map((l,i)=>`L${i}: T${l.textureId} · UV${l.coordId||0} ${l.filterMode||''}${l.textureAnimationId>=0?` · TXAN ${l.textureAnimationId}`:''}`).join(' · ');
      item.innerHTML = `<div class="model-texture-head"><div><div class="model-texture-name">Material ${mat.id}${mat.shader?` · ${escapeHtml(mat.shader)}`:''}</div><div class="model-texture-path">Texture ${mat.textureId} · ${escapeHtml(texName)}</div></div><span class="model-status ok">${geoCount} geo</span></div><div class="model-mini-note">${escapeHtml(layerInfo || `Filter: ${mat.filterMode || 'Unknown'}`)}${mat.twoSided ? ' · TwoSided' : ''}${mat.unshaded ? ' · Unshaded' : ''}</div>`;
      list.appendChild(item);
    });
  }

  function focusNodeInViewport(nodeId,{fit=false}={}){
    if(!state.model || nodeId==null) return false;
    const cam=findCameraRef(nodeId);
    if(cam){
      const target=vecFromArray(cam.targetPosition);
      state.camera.targetX=target.x; state.camera.targetY=target.y; state.camera.targetZ=target.z; state.gizmoVisible=true;
      if(fit){ lookThroughCamera(cam.__cameraId); return true; }
      invalidatePickCache(); markDirty(); return true;
    }
    const node=(state.model.nodes||[]).find(n=>String(n.id)===String(nodeId));
    if(!node) return false;
    const matrices=getDeformedGeometry().nodeMatrices;
    const m=matrices.get(node.id)||matIdentity();
    const wp=matPoint(m,node.pivot||{x:0,y:0,z:0});
    state.camera.targetX=Number.isFinite(wp.x)?wp.x:0;
    state.camera.targetY=Number.isFinite(wp.y)?wp.y:0;
    state.camera.targetZ=Number.isFinite(wp.z)?wp.z:0;
    state.gizmoVisible=true;
    if(fit){
      const bounds=currentDisplayBounds();
      const size=Math.max(24,(bounds&&bounds.size)||1);
      state.camera.zoom=clamp(Math.max(size*.08, size/10), MODEL_ZOOM_MIN, MODEL_ZOOM_MAX);
      updateZoomUi();
    }
    invalidatePickCache();
    markDirty();
    return true;
  }

  async function activateEffectsPreview(focusFirst=true,forceOn=false){
    if(!state.model) return;
    state.fxPreviewMode=forceOn?true:!state.fxPreviewMode;
    if(state.fxPreviewMode){
      state.fxPreviewStartedAt=performance.now();state.gizmoVisible=false;
      const show=$('#modelShowEffects');if(show)show.checked=true;
      diag('info','FX','Animated FX preview started',{particleEmitters2:(state.model.particleEmitters2||[]).length,cascReady:!!state.casc.status?.ready,cascLoaded:state.casc.loaded.size,realCascEffectModels:state.casc.effectRuntimes.size});
      const status=await refreshCascStatus();
      if(status&&status.ready){
        state.casc.enabled=true;
        const toggle=$('#modelUseCascEffects');if(toggle)toggle.checked=true;
        await loadCascEffectAssets(true);
      }
      const rows=(state.model.nodes||[]).filter(n=>['ParticleEmitter','ParticleEmitter2','ParticleEmitterPopcorn','RibbonEmitter','Light','Attachment','EventObject','CollisionShape'].includes(n.type));
      const focus=rows.find(n=>n.type==='ParticleEmitter2')||rows[0];
      if(focusFirst && focus){state.selectedNodeId=focus.id;focusNodeInViewport(focus.id);state.gizmoVisible=false;}

    }
    if(!state.fxPreviewMode)diag('info','FX','Animated FX preview stopped');
    const btn=$('#modelFxPreviewBtn');if(btn)btn.textContent=state.fxPreviewMode?'Stop FX preview':'Start animated FX preview';
    renderEffectsUI();
    markDirty();
  }

  function renderEffectsUI(){
    const info=$('#modelEffectsInfo'),list=$('#modelEffectsList'),count=$('#modelEffectCount'),previewBtn=$('#modelFxPreviewBtn');
    if(previewBtn)previewBtn.textContent=state.fxPreviewMode?'Stop FX preview':'Start animated FX preview';
    if(!info||!list||!count)return;
    if(!state.model){count.textContent='0 objects';info.textContent='No effect data loaded.';list.classList.add('empty');list.textContent='Load a model to inspect effects.';return;}
    const all=(state.model.nodes||[]).filter(n=>!['Bone','Helper'].includes(n.type));
    const byType={};all.forEach(n=>byType[n.type]=(byType[n.type]||0)+1);
    const cameras=(state.model.cameras||[]).length,face=(state.model.faceEffects||[]).length,unknown=(state.model.unknownChunks||[]).length;
    count.textContent=`${all.length+cameras} objects`;
    const parts=Object.entries(byType).map(([k,v])=>`${k}: ${v}`);if(cameras)parts.push(`Camera: ${cameras}`);if(face)parts.push(`FaceFX: ${face}`);if(unknown)parts.push(`Unknown chunks: ${unknown}`);
    const p2=(state.model.particleEmitters2||[]);
    if(p2.length){
      const texIds=[...new Set(p2.map(n=>n.textureId).filter(x=>Number.isInteger(x)&&x>=0))];
      const texNames=texIds.map(id=>(state.model.textureDefs||[])[id]?.path||`Texture ${id}`);
      parts.push(`Particle FX preview: ${state.fxPreviewMode?'RUNNING':'stopped'}`);
      if(texNames.length)parts.push(`Emitter texture: ${texNames.join(', ')}`);
      const decoded=[...new Set(state.casc.effectTextures.values())].length;
      parts.push(`Emitter renderer texture: ${decoded?`${decoded} decoded from CASC`:'fallback particles active'}`);
    }
    if(state.casc.enabled){const real=[...state.casc.effectRuntimes.values()];parts.push(`CASC FX: ${state.casc.loaded.size} loaded · ${state.casc.missing.size} unresolved · ${state.casc.verified?'VERIFIED':'not verified'}`);parts.push(`Real CASC model playback: ${real.length} model(s) · ${real.reduce((n,r)=>n+(r.parsed.sequences||[]).length,0)} sequence(s) · ${real.reduce((n,r)=>n+(r.trackCount||0),0)} animated track(s)`);if(!real.length&&p2.length)parts.push('This model uses CASC textures on its own MDX particle emitters; particle motion comes from the loaded MDX, not a separate CASC animation model.');}
    info.textContent=parts.length?parts.join('\n'):'No effect objects detected.';
    list.innerHTML='';
    const rows=[...all,...(state.model.cameras||[]).map((c,i)=>({...c,type:'Camera',id:c.__cameraId||`C${i}`}))];
    if(!rows.length){list.classList.add('empty');list.textContent='No effect objects detected.';return;}
    list.classList.remove('empty');
    rows.forEach(obj=>{const item=document.createElement('div');item.className='model-node-item';if(String(state.selectedNodeId)===String(obj.id))item.classList.add('active');let meta=`${obj.type} · ID ${obj.id}`;if(obj.type==='ParticleEmitter2')meta+=` · rate ${Number(obj.emissionRate||0).toFixed(1)} · life ${Number(obj.lifeSpan||0).toFixed(2)} · texture ${obj.textureId}`;if(obj.type==='ParticleEmitterPopcorn')meta+=` · PopcornFX · ${obj.path||'(no path)'}`;if(obj.type==='RibbonEmitter')meta+=` · material ${obj.materialId} · rate ${obj.emissionRate}`;if(obj.type==='Attachment'&&obj.path)meta+=` · ${obj.path}`;if(obj.type==='ParticleEmitter'&&obj.path)meta+=` · ${obj.path}`;if(obj.type==='EventObject')meta+=` · ${(obj.eventTracks||[]).length} events`;if(obj.path&&state.casc.enabled){const k=normalizePath(obj.path),rt=state.casc.effectRuntimes.get(k);meta+=state.casc.loaded.has(k)?' · CASC loaded':state.casc.missing.has(k)?' · CASC missing':'';if(rt)meta+=` · REAL CASC ANIM · ${(rt.parsed.sequences||[]).length} seq${rt.lastSequenceName?` · ${rt.lastSequenceName}`:''}`;}item.innerHTML=`<div class="model-node-name">${escapeHtml(obj.name||obj.type)}</div><div class="model-node-meta">${escapeHtml(meta)}</div>`;item.addEventListener('click',()=>{state.selectedNodeId=obj.id;focusNodeInViewport(obj.id);renderEverything();});item.addEventListener('dblclick',()=>{state.selectedNodeId=obj.id;if(obj.type==='Camera')lookThroughCamera(obj.id);else focusNodeInViewport(obj.id,{fit:true});renderEverything();});list.appendChild(item);});
    if(unknown){const item=document.createElement('div');item.className='model-node-item';item.innerHTML=`<div class="model-node-name">Unknown MDX chunks</div><div class="model-node-meta">${escapeHtml((state.model.unknownChunks||[]).map(x=>`${x.tag} (${x.size} B)`).join(' · '))}</div>`;list.appendChild(item);}
  }

  function recognizeModelCameras(){
    if(!state.model){ diag('warn','Authoring','Recognize cameras requested with no model loaded'); return []; }
    ensureAuthoringIds();
    const cams=state.model.cameras||[];
    if(cams.length){
      const first=cams[0];
      if(!state.selectedNodeId || !findCameraRef(state.selectedNodeId)) state.selectedNodeId=first.__cameraId;
      diag('info','Authoring','Recognized model cameras',{count:cams.length,names:cams.map((c,i)=>c.name||`Camera ${i+1}`)});
    }else{
      diag('warn','Authoring','No model cameras were found in this model');
    }
    renderEverything();
    return cams;
  }

  function renderAuthoringUI(){
    const counts=$('#modelAuthorCounts'),sel=$('#modelAuthorCameraSelect'),info=$('#modelAuthorCameraInfo'),status=$('#modelAuthorStatus');
    if(!counts||!sel||!info||!status) return;
    if(!state.model){ counts.textContent='0 cameras · 0 FX'; sel.innerHTML=''; info.textContent='No model loaded.'; status.textContent='Load a model to inspect cameras and add effect helpers.'; return; }
    ensureAuthoringIds();
    const cams=state.model.cameras||[]; const fx=(state.model.nodes||[]).filter(n=>['ParticleEmitter','ParticleEmitter2','ParticleEmitterPopcorn','RibbonEmitter','Attachment','EventObject','Light','CollisionShape'].includes(n.type));
    counts.textContent=`${cams.length} cameras · ${fx.length} FX objects`;
    sel.innerHTML='';
    if(!cams.length){ const opt=document.createElement('option'); opt.value=''; opt.textContent='No cameras found'; sel.appendChild(opt); sel.disabled=true; }
    else{
      sel.disabled=false;
      cams.forEach((cam,i)=>{ const opt=document.createElement('option'); opt.value=cam.__cameraId; opt.textContent=`${i+1}. ${cam.name||`Camera ${i+1}`}`; if(String(state.selectedNodeId)===String(cam.__cameraId)||String(state.activeViewCameraId)===String(cam.__cameraId)) opt.selected=true; sel.appendChild(opt); });
      if(!sel.value && cams[0]) sel.value=cams[0].__cameraId;
    }
    const active=sel.value?findCameraRef(sel.value):null;
    const ap=active?vecFromArray(active.position):null,at=active?vecFromArray(active.targetPosition):null;
    info.textContent=active?`Position ${ap.x.toFixed(1)}, ${ap.y.toFixed(1)}, ${ap.z.toFixed(1)} · Target ${at.x.toFixed(1)}, ${at.y.toFixed(1)}, ${at.z.toFixed(1)}${state.activeViewCameraId===active.__cameraId?' · VIEWING':''}`:'Select a detected camera or create one from the current viewport.';
    const selectedNode=(state.model.nodes||[]).find(n=>String(n.id)===String(state.selectedNodeId));
    status.textContent=selectedNode?`Selected object: ${selectedNode.name||selectedNode.type} · ${selectedNode.type} · ID ${selectedNode.id}`:(active?`Selected camera: ${active.name||'Camera'}${state.activeViewCameraId===active.__cameraId?' · looking through this camera':''}`:'Use the buttons above to add a camera or a particle/effect helper.');
  }

  function renderCoreInfo(){
    const el=$('#modelCoreInfo'),ver=$('#modelCoreVersion');if(!el||!ver)return;ver.textContent=`v${modelCore.version||'8'}`;
    if(!state.model){el.textContent='Shared Warcraft parser is ready.';return;}
    const geos=state.model.geosets||[];
    const hd=geos.filter(g=>g.skin&&g.skin.length).length;
    const matrix=geos.length-hd;
    const materialLayouts={};(state.model.materials||[]).forEach(m=>materialLayouts[m.layout||'classic']=(materialLayouts[m.layout||'classic']||0)+1);
    const layouts=Object.entries(materialLayouts).map(([k,v])=>`${k}: ${v}`).join(', ')||'n/a';
    el.textContent=`Shared parser: ${modelCore.version} · UV ${modelCore.uvConvention||'legacy/compat'}\nGPU texture V: direct authored (UNPACK_FLIP_Y=false)\nFormat: ${state.model.type} v${state.model.formatVersion}\nSkinning scheme: ${state.model.skinningScheme|| (hd?'reforged-skin4':'classic-matrix-groups')}\nSKIN geosets: ${hd} · matrix-group geosets: ${matrix}\nMaterial layouts: ${layouts}\nGlobal sequences: ${(state.model.globalSequences||[]).length}\nTexture animations: ${(state.model.textureAnimations||[]).length}\nGeoset animations: ${(state.model.geosetAnimations||[]).length}\nBind-pose matrices: ${(state.model.bindPose||[]).length}\nUnknown MDX chunks preserved: ${(state.model.unknownChunks||[]).length}`;
  }

  function renderEverything(){
    renderModelInfo();
    renderTextureList();
    updateSelectedTextureLabel();
    renderGeosetSelect();
    renderSequenceUI();
    renderRigUI();
    renderMaterialUI();
    renderEffectsUI();
    renderAuthoringUI();
    renderCoreInfo();
    drawUvView();
    updateFxSourceWarning();
  }

  function onSequenceSelect(){
    state.animation.playing = false;
    state.animation.t = 0;
    state.animation.elapsedMs = 0;
    invalidateGeometryCache();
    renderSequenceUI();
    markDirty();
  }

  function onSequenceScrub(){
    state.animation.t = clamp(+$('#modelSequenceScrub').value / 1000, 0, 1);
    state.animation.playing = false;
    invalidateGeometryCache();
    renderSequenceUI();
    markDirty();
  }

  function togglePlay(){
    if(!currentSequence()) return;
    state.animation.playing = !state.animation.playing;
    if(state.animation.playing) state.animation.lastTs = 0;
    invalidateGeometryCache();
    renderSequenceUI();
    markDirty();
  }

  function resetSequence(){
    state.animation.playing = false;
    state.animation.t = 0;
    state.animation.elapsedMs = 0;
    invalidateGeometryCache();
    renderSequenceUI();
    markDirty();
  }

  function tickAnimation(ts){
    const seq = currentSequence();
    if(seq && state.animation.playing){
      if(!state.animation.lastTs) state.animation.lastTs = ts;
      const speed=Math.max(.1,(+($('#modelAnimationSpeed')&&$('#modelAnimationSpeed').value)||100)/100);
      const dt = ((ts - state.animation.lastTs) / 1000) * speed;
      state.animation.lastTs = ts;
      state.animation.elapsedMs += dt * 1000;
      state.animation.t += dt / Math.max(0.25, seq.length / 1000);
      if(state.animation.t >= 1){
        if($('#modelSequenceLoop').checked) state.animation.t %= 1;
        else { state.animation.t = 1; state.animation.playing = false; }
      }
      $('#modelSequenceScrub').value = Math.round(clamp(state.animation.t, 0, 1) * 1000);
    } else {
      state.animation.lastTs = ts;
    }
  }



  function mountTextureStyleModelLayout(){
    const modelPanels = $('#modelLabPanels');
    if(!modelPanels || modelPanels.dataset.v12Mounted) return;

    const shell = modelPanels.querySelector('.model-lab-shell');
    const overview = modelPanels.querySelector('.model-lab-overview-panel');
    const sectionbar = $('#modelLabSectionbar');
    const nativePanel = modelPanels.querySelector('.model-native-panel');
    const uvPanel = modelPanels.querySelector('.model-uv-panel');
    const sourcePanel = modelPanels.querySelector('.model-source-panel');
    const texturesPanel = modelPanels.querySelector('.model-textures-panel');
    const paintPanel = modelPanels.querySelector('.model-paint-panel');
    const seqPanel = modelPanels.querySelector('.model-sequences-panel');
    const rigPanel = modelPanels.querySelector('.model-rig-panel');
    const materialsPanel = modelPanels.querySelector('.model-materials-panel');
    const effectsPanel = modelPanels.querySelector('.model-effects-panel');
    const authorPanel = modelPanels.querySelector('.model-author-panel');
    const corePanel = modelPanels.querySelector('.model-core-panel');
    const nativeControls = nativePanel && nativePanel.querySelector('.native-model-controls');

    // LEFT: same footprint and visual language as the Texture Paint tool shelf.
    let toolHost = $('#modelToolShelf');
    if(!toolHost){
      toolHost = document.createElement('div');
      toolHost.id = 'modelToolShelf';
      toolHost.className = 'model-tool-shelf';
      toolHost.innerHTML = `
        <button class="model-shelf-tool active" data-model-panel="setup" type="button" title="Model setup"><span>◆</span><small>Setup</small></button>
        <button class="model-shelf-tool" data-model-panel="textures" type="button" title="Texture slots"><span>▦</span><small>Textures</small></button>
        <div class="model-shelf-sep"></div>
        <button class="model-shelf-tool" data-model-tool="brush" type="button" title="3D Paint Brush"><span>●</span><small>Brush</small></button>
        <button class="model-shelf-tool" data-model-tool="eraser" type="button" title="3D Paint Eraser"><span>◇</span><small>Eraser</small></button>
        <button class="model-shelf-tool" data-model-tool="clone" type="button" title="3D Paint Clone"><span>◎</span><small>Clone</small></button>
        <div class="model-shelf-sep"></div>
        <button class="model-shelf-tool" data-model-nav-tool="move" type="button" title="Move view / pan camera (left drag)"><span>✥</span><small>Move</small></button>
        <button class="model-shelf-tool active" data-model-nav-tool="rotate" type="button" title="Rotate view / orbit camera (left drag)"><span>⟳</span><small>Rotate</small></button>
        <div class="model-shelf-sep"></div>
        <button class="model-shelf-tool" data-model-panel="view" type="button" title="Viewport settings"><span>⌖</span><small>View</small></button>
        <button class="model-shelf-tool" data-model-panel="animation" type="button" title="Animation preview"><span>▶</span><small>Anim</small></button>
        <button class="model-shelf-tool" data-model-panel="uv" type="button" title="UV inspector"><span>▤</span><small>UV</small></button>
        <button class="model-shelf-tool" data-model-panel="rig" type="button" title="Rig and nodes"><span>◇</span><small>Rig</small></button>
        <button class="model-shelf-tool" data-model-panel="effects" type="button" title="Effects / particle preview"><span>✦</span><small>FX</small></button>
        <button class="model-shelf-tool" data-model-panel="author" type="button" title="Camera / effect authoring"><span>◫</span><small>Author</small></button>
        <button class="model-shelf-tool" id="modelShelfRigToggle" data-model-action="toggle-rig" type="button" title="Show / hide rig overlay"><span>◉</span><small>Rig Off</small></button>
        <button class="model-shelf-tool" data-model-action="fit" type="button" title="Fit model to viewport"><span>⊙</span><small>Fit</small></button>
        <button class="model-shelf-tool" data-model-action="reset" type="button" title="Reset camera"><span>↺</span><small>Reset</small></button>
        <button class="model-shelf-tool" data-model-action="screenshot" type="button" title="Save viewport screenshot"><span>▣</span><small>Shot</small></button>`;
      modelPanels.appendChild(toolHost);
    }

    // CENTER: only the 3D viewport. No text bars, no controls, no bottom strip.
    let stageHost = $('#modelStageWorkspace');
    if(!stageHost){
      stageHost = document.createElement('div');
      stageHost.id = 'modelStageWorkspace';
      stageHost.className = 'model-stage-workspace';
      modelPanels.appendChild(stageHost);
    }
    stageHost.replaceChildren();
    if(nativePanel) stageHost.appendChild(nativePanel);
    ensurePhotoBar(stageHost);

    // RIGHT: all menus and text stay in the properties column.
    if(nativeControls && !$('#modelPhotoModeBtn')){const actions=nativeControls.querySelector('.model-view-actions');if(actions){const b=document.createElement('button');b.className='btn small';b.id='modelPhotoModeBtn';b.type='button';b.textContent='Photo Mode';actions.appendChild(b);b.addEventListener('click',()=>setPhotoMode(true));}}
    let viewPanel = document.createElement('section');
    viewPanel.className = 'panel model-view-panel';
    viewPanel.dataset.modelPropPanel = 'view';
    viewPanel.innerHTML = `<div class="panel-heading"><div class="panel-title">VIEWPORT</div><span class="mini-pill">3D</span></div>`;
    if(nativeControls) viewPanel.appendChild(nativeControls);

    let propsHost = $('#modelPropsWorkspace');
    if(!propsHost){
      propsHost = document.createElement('div');
      propsHost.id = 'modelPropsWorkspace';
      propsHost.className = 'model-props-workspace';
      modelPanels.appendChild(propsHost);
    }
    propsHost.innerHTML = `
      <div class="model-props-header">
        <div><strong>Properties</strong><span>Model Lab</span></div><span class="mini-pill">WC3</span>
      </div>
      <div class="model-props-tabs" role="tablist">
        <button class="active" data-model-prop="setup" type="button">Setup</button>
        <button data-model-prop="textures" type="button">Textures</button>
        <button data-model-prop="paint" type="button">Paint</button>
        <button data-model-prop="view" type="button">View</button>
        <button data-model-prop="animation" type="button">Animation</button>
        <button data-model-prop="uv" type="button">UV</button>
        <button data-model-prop="rig" type="button">Rig</button>
        <button data-model-prop="materials" type="button">Materials</button>
        <button data-model-prop="effects" type="button">Effects</button>
        <button data-model-prop="author" type="button">Author</button>
        <button data-model-prop="data" type="button">Data</button>
      </div>
      <div class="model-props-content"></div>`;
    const propsContent = propsHost.querySelector('.model-props-content');
    const panelMap = {
      setup: sourcePanel,
      textures: texturesPanel,
      paint: paintPanel,
      view: viewPanel,
      animation: seqPanel,
      uv: uvPanel,
      rig: rigPanel,
      materials: materialsPanel,
      effects: effectsPanel,
      author: authorPanel,
      data: corePanel,
    };
    Object.entries(panelMap).forEach(([key,panel])=>{
      if(!panel) return;
      panel.dataset.modelPropPanel = key;
      propsContent.appendChild(panel);
    });

    if(overview) overview.remove();
    if(sectionbar) sectionbar.remove();
    if(shell && shell.isConnected) shell.remove();

    const activatePanel = (key) => {
      if(!panelMap[key]) key = 'setup';
      state.activePropPanel=key;
      if(can3DPaint()){ state.gizmoVisible=false; state.gizmoHover=''; }
      else state.paintCursor=null;
      propsHost.querySelectorAll('[data-model-prop]').forEach(btn=>btn.classList.toggle('active', btn.dataset.modelProp === key));
      propsContent.querySelectorAll('[data-model-prop-panel]').forEach(panel=>panel.classList.toggle('model-prop-hidden', panel.dataset.modelPropPanel !== key));
      toolHost.querySelectorAll('[data-model-panel]').forEach(btn=>btn.classList.toggle('active', btn.dataset.modelPanel === key));
      const canvas=$('#model3dCanvas'); if(canvas){ canvas.classList.toggle('paint-mode',can3DPaint()); canvas.style.cursor=''; }
      // Re-evaluate the CASC/FX banner immediately when switching sub-tabs so
      // it disappears as soon as Effects is no longer active.
      updateFxSourceWarning();
      markDirty();
    };
    propsHost.querySelectorAll('[data-model-prop]').forEach(btn=>btn.addEventListener('click',()=>activatePanel(btn.dataset.modelProp)));
    toolHost.querySelectorAll('[data-model-panel]').forEach(btn=>btn.addEventListener('click',()=>activatePanel(btn.dataset.modelPanel)));

    toolHost.querySelectorAll('[data-model-tool]').forEach(btn=>btn.addEventListener('click',()=>{
      const tool = btn.dataset.modelTool;
      const source = document.querySelector(`[data-model-paint-tool="${tool}"]`);
      if(source) source.click();
      activatePanel('paint');
      toolHost.querySelectorAll('[data-model-tool]').forEach(b=>b.classList.toggle('active', b===btn));
      toolHost.querySelectorAll('[data-model-nav-tool]').forEach(b=>b.classList.remove('active'));
    }));
    toolHost.querySelectorAll('[data-model-nav-tool]').forEach(btn=>btn.addEventListener('click',()=>{
      state.viewportTool=btn.dataset.modelNavTool||'rotate';
      state.gizmoDrag=null; state.gizmoHover=''; state.paintDrag=false;
      activatePanel('view');
      toolHost.querySelectorAll('[data-model-nav-tool]').forEach(b=>b.classList.toggle('active', b===btn));
      toolHost.querySelectorAll('[data-model-tool]').forEach(b=>b.classList.remove('active'));
      const canvas=$('#model3dCanvas'); if(canvas) canvas.style.cursor=state.viewportTool==='move'?'grab':'crosshair';
      diag('info','Viewport',`Navigation tool: ${state.viewportTool}`);
      markDirty();
    }));

    const runAction = (action) => {
      if(action==='reset'){ resetCamera(); return; }
      if(action==='toggle-rig'){
        const master=$('#modelShowRig'); if(master){ master.checked=!master.checked; master.dispatchEvent(new Event('change',{bubbles:true})); }
        return;
      }
      const ids = {fit:'modelZoomFitBtn', zoomin:'modelZoomInBtn', zoomout:'modelZoomOutBtn', screenshot:'modelScreenshotBtn'};
      const target = ids[action] && $('#'+ids[action]);
      if(target) target.click();
    };
    document.querySelectorAll('#modelToolShelf [data-model-action]').forEach(btn=>btn.addEventListener('click',()=>runAction(btn.dataset.modelAction)));
    activatePanel('setup');
    modelPanels.dataset.v12Mounted = '1';
  }

  function initModelSections(){
    const bar = $('#modelLabSectionbar');
    if(!bar || bar.dataset.ready) return;
    const buttons = Array.from(bar.querySelectorAll('[data-model-section-filter]'));
    const panels = Array.from(document.querySelectorAll('#modelLabPanels .panel[data-model-section]'));
    const applySection = (key) => {
      buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.modelSectionFilter === key));
      panels.forEach(panel => {
        const tags = (panel.dataset.modelSection || '').split(/\s+/).filter(Boolean);
        const show = key === 'all' || tags.includes(key);
        panel.classList.toggle('hidden-by-section', !show);
      });
      document.querySelectorAll('#modelLabPanels .panel.collapsible-panel:not(.is-collapsed):not(.hidden-by-section) .panel-body').forEach(body => body.style.maxHeight = body.scrollHeight + 'px');
    };
    buttons.forEach(btn => btn.addEventListener('click', () => applySection(btn.dataset.modelSectionFilter || 'setup')));
    applySection('all');
    bar.dataset.ready = '1';
  }

  function initModelAccordion(){
    // V12: Model Lab uses property tabs and a bottom dock; stacked accordions are intentionally disabled.
  }

  function setBrushTip(tip){
    app.editor.brushTip = tip || 'soft';
    const globalTip = $('#brushTip'); if(globalTip) globalTip.value = app.editor.brushTip;
    sync3DPaintUi();
    markDirty();
  }

  function bindEvents(){
    document.querySelectorAll('[data-model-paint-tool]').forEach(el=>el.addEventListener('click',()=>{ const tool=el.dataset.modelPaintTool; const globalBtn=document.querySelector(`.tool[data-tool="${tool}"]`); if(globalBtn) globalBtn.click(); else app.editor.setTool(tool); sync3DPaintUi(); markDirty(); }));
    const paintTip=$('#modelPaintTip'); if(paintTip) paintTip.addEventListener('change',e=>{ setBrushTip(e.target.value); });
    document.querySelectorAll('[data-brush-tip]').forEach(el=>el.addEventListener('click',()=>setBrushTip(el.dataset.brushTip)));
    const paintColor=$('#modelPaintColor'); if(paintColor)paintColor.addEventListener('input',e=>{app.editor.color=e.target.value;const c=$('#colorPicker'),h=$('#hexColor');if(c)c.value=e.target.value;if(h)h.value=e.target.value.toUpperCase();sync3DPaintUi();});
    const paintSize=$('#modelPaintSize'); if(paintSize)paintSize.addEventListener('input',e=>{app.editor.brushSize=+e.target.value;const x=$('#brushSize');if(x)x.value=e.target.value;sync3DPaintUi();markDirty();});
    const paintOpacity=$('#modelPaintOpacity'); if(paintOpacity)paintOpacity.addEventListener('input',e=>{app.editor.brushOpacity=+e.target.value/100;const x=$('#brushOpacity');if(x)x.value=e.target.value;sync3DPaintUi();});
    const paintHardness=$('#modelPaintHardness'); if(paintHardness)paintHardness.addEventListener('input',e=>{app.editor.brushHardness=+e.target.value/100;const x=$('#brushHardness');if(x)x.value=e.target.value;sync3DPaintUi();});
    const paintSpacing=$('#modelPaintSpacing'); if(paintSpacing)paintSpacing.addEventListener('input',e=>{app.editor.brushSpacing=+e.target.value;sync3DPaintUi();});
    const paintDensity=$('#modelPaintDensity'); if(paintDensity)paintDensity.addEventListener('input',e=>{app.editor.brushDensity=+e.target.value;sync3DPaintUi();});
    const paintAngle=$('#modelPaintAngle'); if(paintAngle)paintAngle.addEventListener('input',e=>{app.editor.brushAngle=+e.target.value;sync3DPaintUi();});
    const paintTolerance=$('#modelPaintTolerance'); if(paintTolerance)paintTolerance.addEventListener('input',e=>{app.editor.bucketTolerance=+e.target.value;sync3DPaintUi();});
    const paintEnabled=$('#modelPaintEnabled'); if(paintEnabled)paintEnabled.addEventListener('change',()=>{sync3DPaintUi();markDirty();});
    const paintPreserveAlpha=$('#modelPaintPreserveAlpha'); if(paintPreserveAlpha) paintPreserveAlpha.addEventListener('change',e=>{ app.editor.preserveAlpha=e.target.checked; if(e.target.checked){ app.editor.alphaOnly=false; const ao=$('#modelPaintAlphaOnly'); if(ao) ao.checked=false; const g=$('#alphaOnly'); if(g) g.checked=false; } const g=$('#preserveAlpha'); if(g) g.checked=e.target.checked; sync3DPaintUi(); });
    const paintAlphaOnly=$('#modelPaintAlphaOnly'); if(paintAlphaOnly) paintAlphaOnly.addEventListener('change',e=>{ app.editor.alphaOnly=e.target.checked; if(e.target.checked){ app.editor.preserveAlpha=false; const pa=$('#modelPaintPreserveAlpha'); if(pa) pa.checked=false; const g=$('#preserveAlpha'); if(g) g.checked=false; } const g=$('#alphaOnly'); if(g) g.checked=e.target.checked; sync3DPaintUi(); });
    ['brushSize','brushOpacity','brushHardness','colorPicker'].forEach(id=>{const el=$('#'+id);if(el)el.addEventListener('input',sync3DPaintUi);});
    $('#rightPanelTabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-panel-tab]');
      if(!b) return;
      setMode(b.dataset.panelTab);
    });
    ['openModelBtn','addModelTexturesBtn'].forEach(id=>{ const el=$('#'+id); if(el) el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); const input=$('#'+el.getAttribute('for')); if(input){ if(typeof input.showPicker==='function'){ try{input.showPicker();return;}catch(_){} } input.click(); } } }); });
    const dropZone=$('#modelDropZone');
    if(dropZone){
      ['dragenter','dragover'].forEach(type=>dropZone.addEventListener(type,e=>{e.preventDefault();dropZone.classList.add('dragging');}));
      ['dragleave','drop'].forEach(type=>dropZone.addEventListener(type,e=>{e.preventDefault();dropZone.classList.remove('dragging');}));
      dropZone.addEventListener('drop',async e=>{
        const files=Array.from(e.dataTransfer&&e.dataTransfer.files||[]); if(!files.length)return;
        const model=files.find(f=>/\.(mdx|mdl)$/i.test(f.name));
        const textures=files.filter(f=>/\.(blp|tga|dds|png|jpe?g|webp|bmp|gif)$/i.test(f.name));
        if(model){ await openModelFile(model,{warnMissing:false}); if(textures.length) await addTextureFiles(textures); notifyMissingModelTextures(); }
        else if(textures.length){ await addTextureFiles(textures); }
      });
    }
    $('#modelFileInput').addEventListener('change', e => { openModelFile(e.target.files[0]); e.target.value=''; });
    $('#modelTextureInput').addEventListener('change', e => { addTextureFiles(e.target.files); e.target.value=''; });
    $('#saveEditedModelBtn')?.addEventListener('click', saveEditedModel);
    $('#exportModelTexturesBtn')?.addEventListener('click', ()=>exportModelTextures());
    $('#exportModelPackageBtn')?.addEventListener('click', ()=>exportModelPackage());
    $('#modelGeosetSelect').addEventListener('change', ()=>{invalidatePickCache();drawUvView();markDirty();});
    const uvCanvas=$('#modelUvCanvas');
    const setUvZoom=(z)=>{state.uvView.zoom=clamp(z,.1,32);drawUvView();};
    const uvReset=()=>{state.uvView.zoom=1;state.uvView.panX=0;state.uvView.panY=0;drawUvView();};
    $('#modelUvZoomIn')?.addEventListener('click',()=>setUvZoom(state.uvView.zoom*1.25));
    $('#modelUvZoomOut')?.addEventListener('click',()=>setUvZoom(state.uvView.zoom/1.25));
    $('#modelUvReset')?.addEventListener('click',uvReset);
    if(uvCanvas){
      uvCanvas.addEventListener('wheel',e=>{e.preventDefault();const before=state.uvView.zoom;const next=clamp(before*Math.exp(-e.deltaY*.0018),.1,32);const rect=uvCanvas.getBoundingClientRect(),dpr=uvCanvas.width/Math.max(1,rect.width),mx=(e.clientX-rect.left)*dpr,my=(e.clientY-rect.top)*dpr;state.uvView.panX=(state.uvView.panX-mx)*(next/before)+mx;state.uvView.panY=(state.uvView.panY-my)*(next/before)+my;state.uvView.zoom=next;drawUvView();},{passive:false});
      uvCanvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==1)return;state.uvView.dragging=true;state.uvView.lastX=e.clientX;state.uvView.lastY=e.clientY;try{uvCanvas.setPointerCapture(e.pointerId);}catch(_){}});
      uvCanvas.addEventListener('pointermove',e=>{if(!state.uvView.dragging)return;const rect=uvCanvas.getBoundingClientRect(),dpr=uvCanvas.width/Math.max(1,rect.width);state.uvView.panX+=(e.clientX-state.uvView.lastX)*dpr;state.uvView.panY+=(e.clientY-state.uvView.lastY)*dpr;state.uvView.lastX=e.clientX;state.uvView.lastY=e.clientY;drawUvView();});
      const uvUp=e=>{state.uvView.dragging=false;try{uvCanvas.releasePointerCapture(e.pointerId);}catch(_){}};uvCanvas.addEventListener('pointerup',uvUp);uvCanvas.addEventListener('pointercancel',uvUp);
      uvCanvas.addEventListener('dblclick',uvReset);
    }
    const syncDebugPicking=(source)=>{state.debugPicking=!!source.checked;const a=$('#modelDebugPicking'),b=$('#modelDebugPickingView');if(a)a.checked=state.debugPicking;if(b)b.checked=state.debugPicking;updatePaintHitInfo();};
    $('#modelDebugPicking')?.addEventListener('change',e=>syncDebugPicking(e.target));
    $('#modelDebugPickingView')?.addEventListener('change',e=>syncDebugPicking(e.target));
    $('#modelSequenceSelect').addEventListener('change', onSequenceSelect);
    $('#modelSequenceScrub').addEventListener('input', onSequenceScrub);
    $('#modelSequencePlayBtn').addEventListener('click', togglePlay);
    $('#modelSequenceResetBtn').addEventListener('click', resetSequence);
    $('#modelScreenshotBtn').addEventListener('click',()=>{ const overlay=$('#model3dCanvas'),r=state.glRenderer,out=document.createElement('canvas');out.width=overlay.width;out.height=overlay.height;const x=out.getContext('2d');if(r&&r.gl&&r.canvas)x.drawImage(r.canvas,0,0,out.width,out.height);x.drawImage(overlay,0,0,out.width,out.height);out.toBlob(blob=>{ if(!blob)return; const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${basename((state.model&&state.model.sourceName)||'wc3_model').replace(/\.(mdx|mdl)$/i,'')}_preview.png`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); },'image/png'); });
    $('#modelAnimationSpeed').addEventListener('input',()=>{ $('#modelAnimationSpeedLabel').textContent=(+$('#modelAnimationSpeed').value/100).toFixed(2)+'×'; });
    const rigMaster=$('#modelShowRig'), rigPanelToggle=$('#modelRigOverlayToggle');
    const syncRigToggles=(source)=>{
      const value=!!source.checked;
      if(rigMaster) rigMaster.checked=value;
      if(rigPanelToggle) rigPanelToggle.checked=value;
      const shelf=$('#modelShelfRigToggle');
      if(shelf){ shelf.classList.toggle('active',value); const small=shelf.querySelector('small'); if(small) small.textContent=value?'Rig On':'Rig Off'; }
      markDirty();
    };
    if(rigMaster) rigMaster.addEventListener('change',()=>syncRigToggles(rigMaster));
    if(rigPanelToggle) rigPanelToggle.addEventListener('change',()=>syncRigToggles(rigPanelToggle));
    if(rigPanelToggle && rigMaster) rigPanelToggle.checked=rigMaster.checked;
    if(rigMaster) syncRigToggles(rigMaster);
    const zoomRange=$('#modelZoomRange'); if(zoomRange) zoomRange.addEventListener('input',()=>setModelZoom(zoomFromSlider(zoomRange.value),true));
    const zoomIn=$('#modelZoomInBtn'); if(zoomIn) zoomIn.addEventListener('click',()=>setModelZoom(state.camera.zoom*1.5,true));
    const zoomOut=$('#modelZoomOutBtn'); if(zoomOut) zoomOut.addEventListener('click',()=>setModelZoom(state.camera.zoom/1.5,true));
    const zoomFit=$('#modelZoomFitBtn'); if(zoomFit) zoomFit.addEventListener('click',()=>frameModelView(false));
    const resetCameraBtn=$('#modelResetCameraBtn'); if(resetCameraBtn) resetCameraBtn.addEventListener('click',resetCamera);
    const perf=$('#modelPerformanceMode'); if(perf) perf.addEventListener('change',()=>{state.interactingUntil=0;markDirty();});
    const teamSelect=$('#modelTeamColorSelect');if(teamSelect)teamSelect.addEventListener('change',()=>{state.teamColorIndex=clamp(parseInt(teamSelect.value,10)||0,0,TEAM_COLORS.length-1);refreshTeamColorTextures();});
    const cascToggle=$('#modelUseCascEffects');if(cascToggle)cascToggle.addEventListener('change',async()=>{state.casc.enabled=!!cascToggle.checked;diag('info','CASC',`CASC FX ${state.casc.enabled?'enabled':'disabled'}`);if(!state.casc.enabled){setCascStatusUi('CASC FX resolver is off.');markDirty();return;}const st=await refreshCascStatus();if(!st||!st.ready)await setupCasc();else await loadCascEffectAssets(true);markDirty();});
    const cascSetup=$('#modelCascSetupBtn');if(cascSetup)cascSetup.addEventListener('click',setupCasc);
    const fxPreviewBtn=$('#modelFxPreviewBtn');if(fxPreviewBtn)fxPreviewBtn.addEventListener('click',async()=>{await activateEffectsPreview(true,false);});
    $('#modelAuthorCameraSelect')?.addEventListener('change',e=>{const val=e.target.value; if(val){ state.selectedNodeId=val; focusNodeInViewport(val); renderAuthoringUI(); renderEffectsUI(); }});
    $('#modelRecognizeCamerasBtn')?.addEventListener('click',recognizeModelCameras);
    $('#modelAddCameraBtn')?.addEventListener('click',()=>createCameraFromCurrentView());
    $('#modelLookThroughCameraBtn')?.addEventListener('click',()=>{const sel=$('#modelAuthorCameraSelect'); if(sel&&sel.value) lookThroughCamera(sel.value);});
    $('#modelExitCameraViewBtn')?.addEventListener('click',releaseCameraView);
    $('#modelAddEmitterBtn')?.addEventListener('click',()=>addParticleEmitter2());
    $('#modelAddEffectAttachmentBtn')?.addEventListener('click',()=>addEffectAttachment());
    $('#modelFocusSelectedObjectBtn')?.addEventListener('click',()=>{ if(state.selectedNodeId!=null&&state.selectedNodeId!=='') focusNodeInViewport(state.selectedNodeId,{fit:true}); renderEverything(); });
    $('#model3dCanvas').addEventListener('pointerdown', onPreviewPointerDown);
    $('#model3dCanvas').addEventListener('pointermove', onPreviewPointerMove);
    $('#model3dCanvas').addEventListener('pointerup', onPreviewPointerUp);
    $('#model3dCanvas').addEventListener('pointerleave', onPreviewPointerUp);
    $('#model3dCanvas').addEventListener('wheel', onPreviewWheel, { passive:false });
    $('#model3dCanvas').addEventListener('contextmenu', e => e.preventDefault());
    $('#model3dCanvas').addEventListener('dblclick', ()=>{ state.gizmoVisible = true; resetCamera(); });
    ['modelDisplayMode','modelBackfaceCulling','modelShowPivots','modelShowBones','modelShowExtents','modelShowNodeNames','modelShowGrid','modelAnimMode','modelSkinningEnabled','modelShowEffects','modelShowCollision'].forEach(id => {
      const el = $('#' + id); if(el) el.addEventListener('change', () => { if(id==='modelAnimMode'||id==='modelSkinningEnabled') invalidateGeometryCache(); renderEverything(); markDirty(); });
    });
    const spin = $('#modelSpinSpeed'); if(spin) spin.addEventListener('input', markDirty);
    window.addEventListener('wc3-editor-change',()=>{
      if(!syncEditorTextureToSlot()) bumpTextureRevision();
      scheduleTextureUiRefresh();
    });
  }

  function loop(ts){
    ts = ts || performance.now();
    if(state.mode === 'model'){
      tickAnimation(ts);
      const nowFast=fastPreviewActive();
      if(state.lastFastPreview && !nowFast) state.needsRender=true;
      state.lastFastPreview=nowFast;
      const spin = +($('#modelSpinSpeed') && $('#modelSpinSpeed').value || 0);
      const active = state.animation.playing || state.fxPreviewMode || spin > 0 || state.orbitDrag || state.paintDrag;
      const triCount=state.glRenderer&&state.glRenderer.triangles ? state.glRenderer.triangles : (state.model?(state.model.geosets||[]).reduce((n,g)=>n+(g.faces||[]).length,0):0);
      const pm=performanceMode();
      const frameInterval = triCount>150000 ? 33 : 16;
      if(spin > 0){ state.camera.yaw += spin * 0.00015; state.needsRender = true; }
      if((state.needsRender || active) && ts - state.lastRenderTs >= frameInterval){
        const started = performance.now();
        try { drawModelPreview(); }
        catch(e){ console.error('Model render failed:',e); setLoadStatus(`Render error: ${e.message || e}`, 'error'); state.animation.playing = false; }
        state.lastRenderTs = ts;
        state.needsRender = false;
        const spent = performance.now() - started;
        if(spent > 250 && active){
          state.animation.playing = false;
          if($('#modelSpinSpeed')) $('#modelSpinSpeed').value = 0;
          setLoadStatus(`Preview paused to keep the page responsive (${Math.round(spent)} ms frame).`, 'info');
        }
      }
    } else if(state.needsRender){
      state.needsRender = false;
    }
    requestAnimationFrame(loop);
  }

  window.MODEL_LAB_API = {
    async openModel(file, textureFiles=[]){
      await openModelFile(file,{warnMissing:!(textureFiles&&textureFiles.length)});
      if(textureFiles && textureFiles.length){await addTextureFiles(textureFiles);notifyMissingModelTextures();}
      setMode('model');
      return state.model;
    },
    addTextures:addTextureFiles,
    setMode,
    getModel:()=>state.model,
    getState:()=>state,
    save:exportModelPackage,
    saveModel:saveEditedModel,
    exportTextures:exportModelTextures,
    exportPackage:exportModelPackage,
    getSelectedTextureCanvas(){const i=state.selectedTextureIndex>=0?state.selectedTextureIndex:state.editorTextureIndex;const c=currentTextureCanvas(i);if(!c)return null;const out=document.createElement('canvas');out.width=c.width;out.height=c.height;out.getContext('2d',{willReadFrequently:true}).drawImage(c,0,0);return out;},
    getSelectedTextureName(){const i=state.selectedTextureIndex>=0?state.selectedTextureIndex:state.editorTextureIndex;const s=state.textures[i];return s?basename(s.ref):'';},
    debug:{
      pickAt(x,y){return pickHitFromCanvas(x,y);},
      project(world){return projectPoint(world,$('#model3dCanvas'));},
      setCamera(values={}){Object.assign(state.camera,values);state.cameraTransformCache=null;invalidatePickCache();markDirty();return {...state.camera};},
      transform(){const c=$('#model3dCanvas');return c?cameraTransform(c):null;},
      nodeMatrices:buildNodeMatrices,
      classicNodeIdsForVertex,
      resolvedSkinIds,
      skinVertex,
      matPoint,
      filterInheritedMatrix,
      uvToDoc,
      refresh(){renderEverything();markDirty();}
    },
    setPhotoMode,
    capturePhotoCanvas,
    sendPhotoToButtons,
    undoPaint,
    redoPaint,
    recognizeModelCameras,
    createCameraFromCurrentView,
    lookThroughCamera,
    releaseCameraView,
    addParticleEmitter2,
    addEffectAttachment,
    historyState:modelHistoryState,
    screenshot(){ $('#modelScreenshotBtn').click(); }
  };
  window.WC3_MODEL_LAB = window.MODEL_LAB_API;

  window.WC3_MODEL_CORE = {
    parseMDL,
    parseMDX,
    war3Core:modelCore,
    unzipEntries,
    arrayBufferOf,
    computeBounds,
    imageDataFromArrayBuffer,
    basename,
    normalizePath,
    setMode,
  };

  mountTextureStyleModelLayout();
  initModelAccordion();
  initModelSections();
  initTeamColorUi();
  bindEvents();
  refreshCascStatus();
  sync3DPaintUi();
  updateZoomUi();
  setMode('inspector');
  drawUvView();
  requestAnimationFrame(loop);

})();
