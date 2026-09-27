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
    editorTextureLoading: false,
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
    cameraGizmoHover: '',
    cameraGizmoDrag: null,
    activePropPanel: 'setup',
    paintCursor: null,
    hoveredHit: null,
    paintTextureIndex: -1,
    paintHistory: [], // legacy counters kept for diagnostics; unified history is modelHistory
    paintRedo: [],
    maxPaintHistory: 75,
    modelHistory: [],
    modelRedo: [],
    maxModelHistory: 75,
    uvView: { zoom:1, panX:0, panY:0, dragging:false, lastX:0, lastY:0 },
    debugPicking: false,
    teamColorIndex: 0,
    fxPreviewMode: false,
    fxPreviewStartedAt: 0,
    fxLastStatsCheck: 0,
    fxLastStatsLog: 0,
    fxLastStatsSignature: '',
    photoMode: false,
    casc: { enabled:false, loading:false, verified:false, userRequested:false, status:null, loaded:new Map(), effectModels:new Map(), effectRuntimes:new Map(), effectPreviews:new Map(), effectTextures:new Map(), referenceTextures:new Map(), missing:new Set(), lastError:'' },
    nextNodeId: 1,
    activeViewCameraId: '',
    textureDiscovery: { localFound:0, cascFound:0, cascAttempted:0, missing:[], scannedFiles:0, truncated:false, source:'' },
    editingTexturePathIndex: -1,
    renamingTextureIndex: -1,
    selectedGeosetIndex: -1,
    hiddenGeosets: new Set(),
    geosetTool: 'select',
    geosetDrag: null,
    geosetHover: '',
    geosetHistory: [], // legacy counters kept for diagnostics; unified history is modelHistory
    geosetRedo: [],
    maxGeosetHistory: 75,
    geometryRevision: 0,
    referenceModel: { model:null, runtime:null, name:'', path:'', source:'', visible:true, opacity:1, offset:{x:0,y:0,z:0}, selectedKind:'', selectedIndex:-1 },
  };

  const assetPreviewGlRenderers = new WeakMap();

  function markDirty(){ state.needsRender = true; }
  function markModelUnsaved(scope,label){
    try{app.unsaved?.markDirty?.(scope,label);}catch(_){}
  }
  async function guardModelReplacement(action='open another model',target=''){
    try{
      if(!app.unsaved?.hasUnsaved?.(['model','modelTextures']))return true;
      if(app.unsaved?.confirmDiscardNative)return !!(await app.unsaved.confirmDiscardNative(action,['model','modelTextures'],target));
      return app.unsaved.confirmDiscard?.(action,['model','modelTextures'])!==false;
    }catch(_){return true;}
  }
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
    const detail={scope:'model',undo:state.modelHistory.length,redo:state.modelRedo.length,max:state.maxModelHistory};
    window.dispatchEvent(new CustomEvent('wc3-history-change',{detail}));
  }
  function cloneHistoryData(value){
    if(value==null)return value;
    if(typeof structuredClone==='function'){try{return structuredClone(value);}catch(_){}}
    return JSON.parse(JSON.stringify(value));
  }
  function pushModelHistorySnapshot(snap){
    if(!snap)return false;
    state.modelHistory.push(snap);
    if(state.modelHistory.length>state.maxModelHistory)state.modelHistory.shift();
    state.modelRedo=[];
    // Keep the old per-scope arrays empty so older UI/debug code never reports stale counts.
    state.paintHistory=[];state.paintRedo=[];state.geosetHistory=[];state.geosetRedo=[];
    diag('info','History',`Model snapshot · ${snap.label||snap.kind||'edit'}`,{kind:snap.kind,undo:state.modelHistory.length,redo:0,max:state.maxModelHistory});
    if(snap.kind==='paint')markModelUnsaved('modelTextures',snap.label||'Model texture edit');
    else if(snap.kind!=='geoset-visibility')markModelUnsaved('model',snap.label||snap.kind||'Model edit');
    historyChanged();return true;
  }
  function capturePaintSnapshot(index,label='3D paint'){
    const slot=state.textures[index];if(!slot||!slot.canvas)return null;
    const ctx=slot.canvas.getContext('2d',{willReadFrequently:true});
    let imageData;try{imageData=ctx.getImageData(0,0,slot.canvas.width,slot.canvas.height);}catch(e){diag('error','History','Could not capture Model Lab texture snapshot',{index,label,error:e});return null;}
    return {kind:'paint',index,label,ref:slot.ref||'',width:slot.canvas.width,height:slot.canvas.height,imageData};
  }
  function pushPaintHistory(index,label='3D paint'){
    const snap=capturePaintSnapshot(index,label);if(!snap)return false;
    return pushModelHistorySnapshot(snap);
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
  function captureGeosetSnapshot(index,label='Geoset edit'){
    const geo=state.model&&state.model.geosets&&state.model.geosets[index];if(!geo)return null;
    return {kind:'geoset',index,label,vertices:(geo.vertices||[]).map(v=>({x:v.x,y:v.y,z:v.z})),normals:(geo.normals||[]).map(v=>({x:v.x,y:v.y,z:v.z})),faces:cloneHistoryData(geo.faces||geo.triangles||[]),extent:geo.extent?cloneHistoryData(geo.extent):null,edited:!!geo.__geometryEdited,topologyEdited:!!geo.__topologyEdited};
  }
  function captureGeosetStructureSnapshot(label='Geoset structure'){
    if(!state.model)return null;
    return {kind:'geoset-structure',label,geosets:cloneHistoryData(state.model.geosets||[]),geosetAnimations:cloneHistoryData(state.model.geosetAnimations||[]),selectedGeosetIndex:state.selectedGeosetIndex,hiddenGeosets:[...state.hiddenGeosets],geometryEdited:!!state.model.__geometryEdited,structureEdited:!!state.model.__geosetStructureEdited,bounds:cloneHistoryData(state.model.bounds||null)};
  }
  function captureGeosetVisibilitySnapshot(label='Geoset visibility'){
    if(!state.model)return null;
    return {kind:'geoset-visibility',label,hiddenGeosets:[...state.hiddenGeosets],selectedGeosetIndex:state.selectedGeosetIndex};
  }
  function captureReferenceImportSnapshot(label='Reference import'){
    if(!state.model)return null;
    return {
      kind:'reference-import',label,
      geosets:cloneHistoryData(state.model.geosets||[]),
      geosetAnimations:cloneHistoryData(state.model.geosetAnimations||[]),
      nodes:cloneHistoryData(state.model.nodes||[]),
      materials:cloneHistoryData(state.model.materials||[]),
      textureDefs:cloneHistoryData(state.model.textureDefs||[]),
      modelTextures:cloneHistoryData(state.model.textures||[]),
      textureSlots:(state.textures||[]).slice(),
      pivots:cloneHistoryData(state.model.pivots||[]),
      bounds:cloneHistoryData(state.model.bounds||null),
      selectedGeosetIndex:state.selectedGeosetIndex,selectedNodeId:state.selectedNodeId,
      flags:{geometryEdited:!!state.model.__geometryEdited,geosetStructureEdited:!!state.model.__geosetStructureEdited,materialEdited:!!state.model.__materialEdited,effectsEdited:!!state.model.__effectsEdited,textureEdited:!!state.model.__textureEdited}
    };
  }
  function restoreReferenceImportSnapshot(snap){
    if(!snap||!state.model)return false;
    state.model.geosets=cloneHistoryData(snap.geosets||[]);
    state.model.geosetAnimations=cloneHistoryData(snap.geosetAnimations||[]);
    state.model.nodes=cloneHistoryData(snap.nodes||[]);
    state.model.materials=cloneHistoryData(snap.materials||[]);
    state.model.textureDefs=cloneHistoryData(snap.textureDefs||[]);
    state.model.textures=cloneHistoryData(snap.modelTextures||[]);
    state.model.pivots=cloneHistoryData(snap.pivots||[]);
    state.model.bounds=cloneHistoryData(snap.bounds||computeBounds(state.model.geosets||[]));
    state.textures=(snap.textureSlots||[]).slice();
    const f=snap.flags||{};state.model.__geometryEdited=!!f.geometryEdited;state.model.__geosetStructureEdited=!!f.geosetStructureEdited;state.model.__materialEdited=!!f.materialEdited;state.model.__effectsEdited=!!f.effectsEdited;state.model.__textureEdited=!!f.textureEdited;
    state.selectedGeosetIndex=Math.min(Math.max(-1,snap.selectedGeosetIndex??-1),(state.model.geosets||[]).length-1);state.selectedNodeId=snap.selectedNodeId??-1;
    rebuildNodeTypeArrays();state.geometryRevision++;state.faceCache=new WeakMap();invalidateGeometryCache();invalidatePickCache();if(state.glRenderer)clearGlResources(state.glRenderer);renderEverything();markDirty();return true;
  }
  function captureTexturePathSnapshot(index,label='Texture path'){
    if(!state.model||!state.textures[index])return null;
    const slot=state.textures[index],def=state.model.textureDefs?.[index]||null;
    return {kind:'texture-path',label,index,ref:slot.ref||'',pathEdited:!!slot.pathEdited,renamed:!!slot.renamed,defPath:def?String(def.path||''):null,modelTexture:Array.isArray(state.model.textures)?state.model.textures[index]:undefined};
  }

  function captureModelEditSnapshot(label='Model edit'){
    if(!state.model)return null;
    return {
      kind:'model-edit',label,
      nodes:cloneHistoryData(state.model.nodes||[]),
      materials:cloneHistoryData(state.model.materials||[]),
      cameras:cloneHistoryData(state.model.cameras||[]),
      pivots:cloneHistoryData(state.model.pivots||[]),
      textureDefs:cloneHistoryData(state.model.textureDefs||[]),
      modelTextures:cloneHistoryData(state.model.textures||[]),
      textureSlots:state.textures.slice(),
      geosetSkin:(state.model.geosets||[]).map(g=>g&&g.skin?Array.from(g.skin):null),
      geosetSkinEdited:(state.model.geosets||[]).map(g=>!!(g&&g.__skinEdited)),
      selectedNodeId:state.selectedNodeId,
      selectedGeosetIndex:state.selectedGeosetIndex,
      hiddenGeosets:[...state.hiddenGeosets],
      flags:{
        rigEdited:!!state.model.__rigEdited,
        materialEdited:!!state.model.__materialEdited,
        effectsEdited:!!state.model.__effectsEdited,
        cameraEdited:!!state.model.__cameraEdited,
        animationKeyEdited:!!state.model.__animationKeyEdited,
        animationEdited:!!state.model.__animationEdited,
        textureEdited:!!state.model.__textureEdited,
        geometryEdited:!!state.model.__geometryEdited
      }
    };
  }
  function rebuildNodeTypeArrays(){
    if(!state.model)return;
    const nodes=state.model.nodes||[];
    state.model.bones=nodes.filter(n=>n&&n.type==='Bone');
    state.model.helpers=nodes.filter(n=>n&&n.type==='Helper');
    state.model.lights=nodes.filter(n=>n&&n.type==='Light');
    state.model.attachments=nodes.filter(n=>n&&n.type==='Attachment');
    state.model.particleEmitters=nodes.filter(n=>n&&n.type==='ParticleEmitter');
    state.model.particleEmitters2=nodes.filter(n=>n&&n.type==='ParticleEmitter2');
    state.model.popcornEmitters=nodes.filter(n=>n&&n.type==='ParticleEmitterPopcorn');
    state.model.ribbonEmitters=nodes.filter(n=>n&&n.type==='RibbonEmitter');
    state.model.eventObjects=nodes.filter(n=>n&&n.type==='EventObject');
    state.model.collisionShapes=nodes.filter(n=>n&&n.type==='CollisionShape');
  }
  function restoreModelEditSnapshot(snap){
    if(!snap||!state.model)return false;
    state.model.nodes=cloneHistoryData(snap.nodes||[]);
    state.model.materials=cloneHistoryData(snap.materials||[]);
    state.model.cameras=cloneHistoryData(snap.cameras||[]);
    state.model.pivots=cloneHistoryData(snap.pivots||[]);
    if(snap.textureDefs)state.model.textureDefs=cloneHistoryData(snap.textureDefs);
    if(snap.modelTextures)state.model.textures=cloneHistoryData(snap.modelTextures);
    if(Array.isArray(snap.textureSlots))state.textures=snap.textureSlots.slice();
    if(Array.isArray(snap.geosetSkin))for(let gi=0;gi<(state.model.geosets||[]).length;gi++){const g=state.model.geosets[gi],skin=snap.geosetSkin[gi];if(g&&skin){g.skin=Array.from(skin);g.__skinEdited=!!snap.geosetSkinEdited?.[gi];}}
    rebuildNodeTypeArrays();
    state.selectedNodeId=snap.selectedNodeId??-1;
    state.selectedGeosetIndex=snap.selectedGeosetIndex??state.selectedGeosetIndex;
    if(Array.isArray(snap.hiddenGeosets))state.hiddenGeosets=new Set(snap.hiddenGeosets);
    const f=snap.flags||{};
    state.model.__rigEdited=!!f.rigEdited;
    state.model.__materialEdited=!!f.materialEdited;
    state.model.__effectsEdited=!!f.effectsEdited;
    state.model.__cameraEdited=!!f.cameraEdited;
    state.model.__animationKeyEdited=!!f.animationKeyEdited;
    state.model.__animationEdited=!!f.animationEdited;
    state.model.__textureEdited=!!f.textureEdited;
    state.model.__geometryEdited=!!f.geometryEdited;
    invalidateGeometryCache();invalidatePickCache();renderEverything();markDirty();return true;
  }

  function captureAnimationSnapshot(label='Animation edit'){
    if(!state.model)return null;
    return {
      kind:'animation',label,
      sequences:cloneHistoryData(state.model.sequences||[]),
      animationOps:cloneHistoryData(state.model.__animationOps||[]),
      animationEdited:!!state.model.__animationEdited,
      geosetSequenceExtents:(state.model.geosets||[]).map(g=>cloneHistoryData(g&&g.sequenceExtents||[])),
      nodes:(state.model.nodes||[]).map(n=>({tracks:cloneHistoryData(n&&n.tracks||{}),eventTracks:cloneHistoryData(n&&n.eventTracks||[]),globalSequenceId:n&&n.globalSequenceId!=null?n.globalSequenceId:-1})),
      textureAnimations:(state.model.textureAnimations||[]).map(x=>cloneHistoryData(x&&x.tracks||{})),
      geosetAnimations:(state.model.geosetAnimations||[]).map(x=>cloneHistoryData(x&&x.tracks||{})),
      materialLayers:(state.model.materials||[]).map(m=>(m&&m.layers||[]).map(l=>cloneHistoryData(l&&l.tracks||{}))),
      cameras:(state.model.cameras||[]).map(c=>cloneHistoryData(c&&c.tracks||{})),
      selectedSequenceIndex:(()=>{const el=$('#modelSequenceSelect');return el&&el.value!==''?+el.value:-1;})(),
      animationT:state.animation.t,
      animationElapsedMs:state.animation.elapsedMs
    };
  }
  function pushGeosetHistorySnapshot(snap){return pushModelHistorySnapshot(snap);}
  function recalcGeosetExtent(geo){
    if(!geo||!(geo.vertices||[]).length)return null;let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const v of geo.vertices){minX=Math.min(minX,v.x);minY=Math.min(minY,v.y);minZ=Math.min(minZ,v.z);maxX=Math.max(maxX,v.x);maxY=Math.max(maxY,v.y);maxZ=Math.max(maxZ,v.z);}
    const c={x:(minX+maxX)/2,y:(minY+maxY)/2,z:(minZ+maxZ)/2};let r=0;for(const v of geo.vertices)r=Math.max(r,Math.hypot(v.x-c.x,v.y-c.y,v.z-c.z));
    geo.extent={boundsRadius:r,min:[minX,minY,minZ],max:[maxX,maxY,maxZ]};return {center:c,min:{x:minX,y:minY,z:minZ},max:{x:maxX,y:maxY,z:maxZ},size:Math.max(maxX-minX,maxY-minY,maxZ-minZ,1),boundsRadius:r};
  }
  function noteGeometryMutation(index=state.selectedGeosetIndex){
    const geo=state.model&&state.model.geosets&&state.model.geosets[index];if(!geo)return;geo.__geometryEdited=true;state.model.__geometryEdited=true;recalcGeosetExtent(geo);state.model.bounds=computeBounds(state.model.geosets||[]);state.geometryRevision++;state.faceCache=new WeakMap();invalidateGeometryCache();markDirty();
  }
  function refreshGeometryAfterHistory({structure=false}={}){
    if(!state.model)return;
    state.model.bounds=computeBounds(state.model.geosets||[]);state.geometryRevision++;state.faceCache=new WeakMap();invalidateGeometryCache();invalidatePickCache();
    if(structure&&state.glRenderer)clearGlResources(state.glRenderer);
    renderGeosetSelect();renderGeosetUI();drawUvView();markDirty();
  }
  function restoreGeosetSnapshot(snap){
    if(!snap||!state.model||!state.model.geosets[snap.index])return false;
    const geo=state.model.geosets[snap.index];geo.vertices=snap.vertices.map(v=>({...v}));geo.normals=snap.normals.map(v=>({...v}));if(snap.faces){geo.faces=cloneHistoryData(snap.faces);if(Array.isArray(geo.triangles))geo.triangles=cloneHistoryData(snap.faces);}geo.extent=snap.extent?cloneHistoryData(snap.extent):geo.extent;geo.__geometryEdited=!!snap.edited;geo.__topologyEdited=!!snap.topologyEdited;
    state.model.__geometryEdited=(state.model.geosets||[]).some(g=>!!g.__geometryEdited);state.selectedGeosetIndex=snap.index;
    refreshGeometryAfterHistory();return true;
  }
  function restoreGeosetStructureSnapshot(snap){
    if(!snap||!state.model)return false;
    state.model.geosets=cloneHistoryData(snap.geosets||[]);state.model.geosetAnimations=cloneHistoryData(snap.geosetAnimations||[]);
    state.model.__geometryEdited=!!snap.geometryEdited;state.model.__geosetStructureEdited=!!snap.structureEdited;
    state.selectedGeosetIndex=Math.min(Math.max(-1,snap.selectedGeosetIndex),state.model.geosets.length-1);
    state.hiddenGeosets=new Set((snap.hiddenGeosets||[]).filter(i=>i>=0&&i<state.model.geosets.length));
    refreshGeometryAfterHistory({structure:true});return true;
  }
  function restoreGeosetVisibilitySnapshot(snap){
    if(!snap||!state.model)return false;
    state.hiddenGeosets=new Set((snap.hiddenGeosets||[]).filter(i=>i>=0&&i<state.model.geosets.length));
    state.selectedGeosetIndex=Math.min(Math.max(-1,snap.selectedGeosetIndex),state.model.geosets.length-1);
    invalidateGeometryCache();invalidatePickCache();renderGeosetSelect();renderGeosetUI();drawUvView();markDirty();return true;
  }
  function restoreTexturePathSnapshot(snap){
    if(!snap||!state.model||!state.textures[snap.index])return false;
    const slot=state.textures[snap.index],def=state.model.textureDefs?.[snap.index]||null;
    slot.ref=snap.ref||'';slot.pathEdited=!!snap.pathEdited;slot.renamed=!!snap.renamed;
    if(def&&snap.defPath!=null)def.path=snap.defPath;
    if(Array.isArray(state.model.textures))state.model.textures[snap.index]=snap.modelTexture!==undefined?snap.modelTexture:(snap.ref||'');
    if(state.editorTextureIndex===snap.index&&typeof app.setCurrentName==='function')app.setCurrentName(basename(slot.ref)||`texture_${snap.index+1}`);
    state.editingTexturePathIndex=-1;state.renamingTextureIndex=-1;
    renderTextureList();updateSelectedTextureLabel();renderCoreInfo();drawUvView();bumpTextureRevision(snap.index);markDirty();return true;
  }

  function restoreAnimationSnapshot(snap){
    if(!snap||!state.model)return false;
    state.model.sequences=cloneHistoryData(snap.sequences||[]);
    state.model.__animationOps=cloneHistoryData(snap.animationOps||[]);
    state.model.__animationEdited=!!snap.animationEdited;
    (state.model.geosets||[]).forEach((g,idx)=>{if(g)g.sequenceExtents=cloneHistoryData((snap.geosetSequenceExtents||[])[idx]||[]);});
    (state.model.nodes||[]).forEach((n,idx)=>{if(!n)return;const src=(snap.nodes||[])[idx]||{};n.tracks=cloneHistoryData(src.tracks||{});n.translation=n.tracks.KGTR||null;n.rotation=n.tracks.KGRT||null;n.scaling=n.tracks.KGSC||null;if('eventTracks'in src)n.eventTracks=cloneHistoryData(src.eventTracks||[]);if(src.globalSequenceId!=null)n.globalSequenceId=src.globalSequenceId;});
    (state.model.textureAnimations||[]).forEach((x,idx)=>{if(x)x.tracks=cloneHistoryData((snap.textureAnimations||[])[idx]||{});});
    (state.model.geosetAnimations||[]).forEach((x,idx)=>{if(x)x.tracks=cloneHistoryData((snap.geosetAnimations||[])[idx]||{});});
    (state.model.materials||[]).forEach((m,mi)=>(m&&m.layers||[]).forEach((l,li)=>{if(l)l.tracks=cloneHistoryData((((snap.materialLayers||[])[mi]||[])[li])||{});}));
    (state.model.cameras||[]).forEach((c,idx)=>{if(c)c.tracks=cloneHistoryData((snap.cameras||[])[idx]||{});});
    state.animation.playing=false;state.animation.t=Number.isFinite(+snap.animationT)?+snap.animationT:0;state.animation.elapsedMs=Number.isFinite(+snap.animationElapsedMs)?+snap.animationElapsedMs:0;state.animation.lastTs=0;
    invalidateGeometryCache();renderSequenceUI();
    const sel=$('#modelSequenceSelect');if(sel&&snap.selectedSequenceIndex>=0&&snap.selectedSequenceIndex<(state.model.sequences||[]).length)sel.value=String(snap.selectedSequenceIndex);
    renderSequenceUI();markDirty();return true;
  }

  function captureCurrentForHistory(entry,label='Redo'){
    if(!entry)return null;
    if(entry.kind==='paint')return capturePaintSnapshot(entry.index,label);
    if(entry.kind==='geoset')return captureGeosetSnapshot(entry.index,label);
    if(entry.kind==='geoset-structure')return captureGeosetStructureSnapshot(label);
    if(entry.kind==='geoset-visibility')return captureGeosetVisibilitySnapshot(label);
    if(entry.kind==='reference-import')return captureReferenceImportSnapshot(label);
    if(entry.kind==='texture-path')return captureTexturePathSnapshot(entry.index,label);
    if(entry.kind==='animation')return captureAnimationSnapshot(label);
    if(entry.kind==='model-edit')return captureModelEditSnapshot(label);
    return null;
  }
  async function restoreModelHistoryEntry(entry){
    if(!entry)return false;
    if(entry.kind==='paint')return restorePaintSnapshot(entry);
    if(entry.kind==='geoset')return restoreGeosetSnapshot(entry);
    if(entry.kind==='geoset-structure')return restoreGeosetStructureSnapshot(entry);
    if(entry.kind==='geoset-visibility')return restoreGeosetVisibilitySnapshot(entry);
    if(entry.kind==='reference-import')return restoreReferenceImportSnapshot(entry);
    if(entry.kind==='texture-path')return restoreTexturePathSnapshot(entry);
    if(entry.kind==='animation')return restoreAnimationSnapshot(entry);
    if(entry.kind==='model-edit')return restoreModelEditSnapshot(entry);
    return false;
  }
  async function undoPaint(){
    if(!state.modelHistory.length){diag('warn','History','Model Ctrl+Z requested with empty history',{undo:0,redo:state.modelRedo.length,max:state.maxModelHistory});historyChanged();return false;}
    const prev=state.modelHistory.pop(),current=captureCurrentForHistory(prev,`Redo ${prev.label||prev.kind}`);if(current)state.modelRedo.push(current);
    const ok=await restoreModelHistoryEntry(prev);diag('info','History',`Model undo · ${prev.label||prev.kind}`,{kind:prev.kind,undo:state.modelHistory.length,redo:state.modelRedo.length,max:state.maxModelHistory});historyChanged();return ok;
  }
  async function redoPaint(){
    if(!state.modelRedo.length){diag('warn','History','Model Ctrl+Y requested with empty redo stack',{undo:state.modelHistory.length,redo:0,max:state.maxModelHistory});historyChanged();return false;}
    const next=state.modelRedo.pop(),current=captureCurrentForHistory(next,`Undo ${next.label||next.kind}`);if(current){state.modelHistory.push(current);if(state.modelHistory.length>state.maxModelHistory)state.modelHistory.shift();}
    const ok=await restoreModelHistoryEntry(next);diag('info','History',`Model redo · ${next.label||next.kind}`,{kind:next.kind,undo:state.modelHistory.length,redo:state.modelRedo.length,max:state.maxModelHistory});historyChanged();return ok;
  }
  function undoGeoset(){return undoPaint();}
  function redoGeoset(){return redoPaint();}
  function modelHistoryState(){return {undo:state.modelHistory.length,redo:state.modelRedo.length,max:state.maxModelHistory};}
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
    const historySnap=captureModelEditSnapshot('Add ParticleEmitter2');
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
    state.model.nodes.push(emitter); state.model.particleEmitters2=(state.model.particleEmitters2||[]); state.model.particleEmitters2.push(emitter); state.selectedNodeId=id;
    diag('info','Authoring','ParticleEmitter2 created',{id,name:emitter.name,textureId,pivot:emitter.pivot});
    if(historySnap)pushModelHistorySnapshot(historySnap);
    renderEverything(); if(state.casc.enabled) await loadCascEffectAssets(true); markDirty(); return emitter;
  }
  async function addEffectAttachment(){
    if(!state.model) return null;
    const historySnap=captureModelEditSnapshot('Add effect attachment');
    const defaultPath='Abilities\\Spells\\Other\\TalkToMe\\TalkToMe.mdx';
    const path=(prompt('Effect model path (.mdx / .mdl):',defaultPath)||'').trim(); if(!path) return null;
    const name=(prompt('Attachment name:',`Effect_${(state.model.nodes||[]).length+1}`)||'').trim()||`Effect_${(state.model.nodes||[]).length+1}`;
    const pivot=authoringPivot(); const id=nextAuthorNodeId();
    const node={id,objectId:id,type:'Attachment',__custom:true,name,parentId:-1,flags:0,pivot:{x:pivot.x,y:pivot.y,z:pivot.z},path};
    state.model.nodes.push(node); state.selectedNodeId=id; diag('info','Authoring','Attachment effect created',{id,name,path,pivot:node.pivot}); if(historySnap)pushModelHistorySnapshot(historySnap); renderEverything(); if(state.casc.enabled) await loadCascEffectAssets(true); markDirty(); return node;
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
    const elapsedMs=Math.max(0,(nowMs-(runtime.startedAt||state.fxPreviewStartedAt||nowMs)));
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
    const hasColorTrack=!!(ga.tracks&&ga.tracks.KGAC),hasStaticColor=!!(Number(ga.flags||0)&2);
    const staticColor=hasStaticColor?(ga.color||[1,1,1]):[1,1,1];
    const color=hasColorTrack?sampleModelTrack(ga.tracks.KGAC,model,seq,frame,elapsedMs,false,staticColor):staticColor;
    return{alpha:clamp(alpha,0,1),color:color||staticColor};
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
  const particleSpriteCache=new WeakMap();
  function particleCompositeMode(n){const name=String(n?.filterModeName||'').toLowerCase(),mode=Number(n?.filterMode);if(name==='additive'||name==='addalpha'||mode===1)return'lighter';if(name==='modulate'||name==='modulate2x'||mode===2||mode===3)return'multiply';return'source-over';}
  function particleSpriteTexture(n,tex){
    if(!tex||particleCompositeMode(n)!=='lighter')return tex;
    const cached=particleSpriteCache.get(tex);if(cached)return cached;
    try{
      const w=Math.max(1,tex.width|0),h=Math.max(1,tex.height|0),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.clearRect(0,0,w,h);x.drawImage(tex,0,0,w,h);const im=x.getImageData(0,0,w,h),d=im.data;
      for(let i=0;i<d.length;i+=4){const peak=Math.max(d[i],d[i+1],d[i+2]);d[i+3]=peak<=3?0:Math.min(d[i+3],peak);}
      x.putImageData(im,0,0);particleSpriteCache.set(tex,c);return c;
    }catch(_){return tex;}
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
    const wantedPath=normalizePath(ref),wanted=basename(ref).toLowerCase();
    if(!wanted) return null;
    const wantedStem=wanted.replace(/\.[^.]+$/,'');
    let stemFallback=null;
    for(const [name, entry] of state.packageFiles.entries()){
      const keyPath=normalizePath(name),sourceName=String(entry&&entry.name||name),sourcePath=normalizePath(sourceName),base=basename(name).toLowerCase(),sourceBase=basename(sourceName).toLowerCase();
      const requestedPath=normalizePath(entry&&entry.requestedPath||'');
      // CASC may satisfy a legacy .blp reference with the modern .dds asset.
      // Prefer the authored/requested alias, but decode using entry.name so the
      // decoder sees the real file format instead of the legacy extension.
      if(keyPath===wantedPath||requestedPath===wantedPath||base===wanted||sourceBase===wanted||keyPath.endsWith('/'+wanted)||sourcePath.endsWith('/'+wanted)) return {name:sourceName,entry};
      if(!stemFallback){
        const sourceStem=sourceBase.replace(/\.[^.]+$/,'');
        const keyStem=base.replace(/\.[^.]+$/,'');
        if((sourceStem===wantedStem||keyStem===wantedStem)&&/\.(?:blp|dds|tga|png|jpe?g|webp)$/i.test(sourceBase))stemFallback={name:sourceName,entry};
      }
    }
    return stemFallback;
  }

  function teamColorInfo(){ return TEAM_COLORS[clamp(state.teamColorIndex|0,0,TEAM_COLORS.length-1)] || TEAM_COLORS[0]; }
  function hexRgb01(hex){ const v=parseInt(String(hex||'#ffffff').replace('#',''),16); return [((v>>16)&255)/255,((v>>8)&255)/255,(v&255)/255]; }
  function textureReplaceableInfo(def){
    const rid=Number(def&&def.replaceableId||0),ref=String(def&&def.path||'').replace(/\\/g,'/');
    if(rid===1||rid===2)return{rid,index:state.teamColorIndex|0,explicit:false};
    let m=/replaceabletextures\/teamcolor\/teamcolor(\d{1,2})\.(?:blp|dds|tga)$/i.exec(ref);if(m)return{rid:1,index:clamp(parseInt(m[1],10)||0,0,TEAM_COLORS.length-1),explicit:true};
    m=/replaceabletextures\/teamglow\/teamglow(\d{1,2})\.(?:blp|dds|tga)$/i.exec(ref);if(m)return{rid:2,index:clamp(parseInt(m[1],10)||0,0,TEAM_COLORS.length-1),explicit:true};
    return{rid:0,index:-1,explicit:false};
  }
  function makeTeamReplaceableCanvas(glow=false,colorIndex=null){
    const size=glow?128:16,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');
    const info=colorIndex==null?teamColorInfo():(TEAM_COLORS[clamp(Number(colorIndex)||0,0,TEAM_COLORS.length-1)]||teamColorInfo()),color=info.hex;
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

  function isLikelyWarcraftStockTextureRef(value){
    const raw=String(value||'').trim().replace(/\//g,'\\').replace(/^\\+/,'');
    if(!raw)return false;
    if(/^war3mapimported[\\/]/i.test(raw))return false;

    // These are normal Warcraft III virtual asset roots. Keep this conservative:
    // a bare/custom filename should be resolved beside the model, not by probing
    // the whole CASC installation.
    return /^(?:textures|replaceabletextures|abilities|units|doodads|terrainart|environment|buildings|objects|sharedmodels|ui|sound|splats|war3\.w3mod|_hd\.w3mod|_de\.w3mod)[\\/]/i.test(raw);
  }

  function hasRenderableModelTexture(){
    if(!state.model||!Array.isArray(state.textures)||!state.textures.length)return false;
    const used=new Set();
    for(const mat of state.model.materials||[]){
      for(const layer of mat&&mat.layers||[]){
        // The viewport samples layer.textureId as the visible color map. Normal/ORM
        // maps alone should not force Textured mode because they would still render gray.
        const id=layer&&layer.textureId;if(Number.isInteger(id)&&id>=0)used.add(id);
      }
    }
    for(const geo of state.model.geosets||[])if(Number.isInteger(geo&&geo.textureId)&&geo.textureId>=0)used.add(geo.textureId);
    const loaded=id=>{const slot=state.textures[id];return !!(slot&&slot.canvas&&!slot.error);};
    return used.size?[...used].some(loaded):state.textures.some(slot=>slot&&slot.canvas&&!slot.error);
  }
  function setDefaultViewportDisplay(){
    const display=$('#modelDisplayMode');if(!display)return;
    display.value=hasRenderableModelTexture()?'textured':'solid';
    diag('debug','Viewport',`Default display: ${display.value}`,{loadedTextures:state.textures.filter(x=>x&&x.canvas&&!x.error).length});
    markDirty();
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
  function cascTextureSearchQuery(ref){
    const raw=String(ref||'').trim().replace(/\\/g,'/'),base=(raw.split('/').pop()||'').trim();
    const stem=base.replace(/\.[^.]+$/,'').replace(/[_\-.]+/g,' ').replace(/\s+/g,' ').trim();
    return stem||base;
  }
  function cascTextureCandidateScore(ref,candidate){
    const want=basename(ref).toLowerCase(),wantStem=want.replace(/\.[^.]+$/,'');
    const pathText=String(candidate||'').replace(/\\/g,'/'),got=(pathText.split('/').pop()||'').toLowerCase(),gotStem=got.replace(/\.[^.]+$/,'');
    let score=0;
    if(got===want)score+=1000;
    if(gotStem===wantStem)score+=700;
    if(got.includes(wantStem))score+=180;
    const wantExt=(want.match(/\.[^.]+$/)||[''])[0],gotExt=(got.match(/\.[^.]+$/)||[''])[0];
    if(wantExt&&gotExt===wantExt)score+=60;
    if(/\.dds$/i.test(got)&&/\.(?:blp|tga)$/i.test(want))score+=35;
    const parts=String(ref||'').replace(/\\/g,'/').toLowerCase().split('/').filter(Boolean).slice(-3,-1);
    for(const p of parts)if(p.length>2&&pathText.toLowerCase().includes('/'+p+'/'))score+=20;
    return score-Math.min(120,pathText.length/8);
  }
  async function searchCascTextureCandidates(ref,limit=12){
    const bridge=cascBridge();if(!bridge||typeof bridge.searchAssets!=='function')return [];
    const query=cascTextureSearchQuery(ref);if(!query)return [];
    try{
      const reply=await bridge.searchAssets(query,'textures',Math.max(24,Math.min(160,limit*8)));
      const rows=[...new Set((reply&&reply.results||[]).map(String).filter(Boolean))];
      rows.sort((a,b)=>cascTextureCandidateScore(ref,b)-cascTextureCandidateScore(ref,a)||a.length-b.length||a.localeCompare(b));
      const best=rows.slice(0,limit);
      diag('info','Model Textures','CASC texture index search completed',{requested:ref,query,candidates:best.length,top:best.slice(0,6)});
      return best;
    }catch(e){
      diag('warn','Model Textures','CASC texture index search failed',{requested:ref,query,error:e&&e.message||String(e)});
      return [];
    }
  }
  async function autoLoadMissingModelTexturesFromCasc(){
    // On explicit user request, every unresolved texture is allowed to reach
    // CASC. Exact virtual paths are tried first. Bare/custom/map-import names
    // then fall back to a basename/stem search in the active Warcraft CDN index.
    if(!state.model)return {found:0,attempted:0,available:false};
    const missing=unresolvedModelTextures();if(!missing.length)return {found:0,attempted:0,available:true};

    const bridge=cascBridge();if(!bridge)return {found:0,attempted:0,available:false};
    let st;try{st=await bridge.status();state.casc.status=st;}catch(e){diag('debug','Model Textures','CASC status unavailable for texture lookup',e);return {found:0,attempted:0,available:false};}
    if(!st||!st.ready){diag('debug','Model Textures','CASC not configured; texture lookup skipped',{missing:missing.map(x=>x.ref),status:st&&st.message||''});return {found:0,attempted:0,available:false};}
    const artSet=cascArtSet();
    let attempted=0,found=0,indexSearches=0;
    const resolved=[];
    try{
      // war3mapImported is not a real CASC namespace, so those references go
      // straight to index search by filename. All other refs get an exact read.
      const exactMissing=missing.filter(x=>!/^war3mapimported[\\/]/i.test(String(x.ref||'').trim()));
      if(exactMissing.length){
        const req=exactMissing.map(x=>({path:x.ref,kind:'texture',artSet}));
        attempted+=req.length;
        const results=await readCascRequests(req);
        for(const asset of results){
          if(addCascAssetToPackage(asset)){found++;resolved.push({requested:asset.requestedPath,resolved:asset.resolvedPath,via:'exact'});}
        }
        if(found){await refreshMissingTextureSlotsFromPackage();bumpTextureRevision();}
      }

      // Anything still unresolved gets a real CASC index search. This is the
      // important fallback for bare filenames and old custom-looking paths that
      // may actually exist in Warcraft III under another virtual directory.
      const afterExact=unresolvedModelTextures();
      for(const item of afterExact){
        const candidates=await searchCascTextureCandidates(item.ref,10);indexSearches++;
        if(!candidates.length)continue;
        const req=candidates.slice(0,6).map(path=>({path,kind:'texture',artSet}));
        attempted+=req.length;
        const results=await readCascRequests(req);
        const hit=results.find(x=>x&&x.found);
        if(!hit)continue;
        const aliased={...hit,requestedPath:item.ref};
        if(addCascAssetToPackage(aliased)){found++;resolved.push({requested:item.ref,resolved:hit.resolvedPath||hit.requestedPath,via:'index'});await refreshMissingTextureSlotsFromPackage();bumpTextureRevision();}
      }

      const stillMissing=unresolvedModelTextures();
      diag(found?'info':'debug','Model Textures','Automatic Warcraft CASC texture lookup finished',{
        attempted,found,missing:stillMissing.length,indexSearches,resolved,
        unresolved:stillMissing.map(x=>x.ref)
      });
      return {found,attempted,available:true,missing:stillMissing.length,indexSearches,resolved};
    }catch(e){
      diag('warn','Model Textures','Automatic Warcraft CASC texture lookup failed',{attempted,found,indexSearches,error:e&&e.message||String(e)});
      return {found,attempted,available:true,indexSearches,error:e.message||String(e)};
    }
  }
  function missingTextureList(missing,limit=16){
    const refs=(missing||[]).map(x=>typeof x==='string'?x:x.ref).filter(Boolean);
    const shown=refs.slice(0,limit),more=Math.max(0,refs.length-shown.length);
    return `${shown.map(x=>'• '+x).join('\n')}${more?`\n• …and ${more} more`:''}`;
  }
  function noteUnresolvedModelTextures(){
    const missing=unresolvedModelTextures();
    state.textureDiscovery.missing=missing.map(x=>x.ref);
    if(!missing.length)return [];
    diag('warn','Model Textures','Model loaded with unresolved referenced textures',{missing:missing.map(x=>x.ref)});
    return missing;
  }
  async function ensureCascOnDemand({enableEffects=false,resolveTextures=false,reason='user'}={}){
    const bridge=cascBridge();
    state.casc.userRequested=true;
    diag('info','CASC','On-demand Warcraft asset access requested',{reason,enableEffects,resolveTextures});
    if(!bridge){setCascStatusUi('Warcraft asset access is unavailable in this build.','error');return {ready:false};}
    let st=await refreshCascStatus();
    if(!st||!st.ready){
      st=await setupCasc({enableEffects:false,resolveTextures:false,reason});
      if(!st||!st.ready)return st||{ready:false};
    }
    if(resolveTextures&&state.model){
      const pending=unresolvedModelTextures();
      if(pending.length)setCascStatusUi(`Searching Warcraft CASC / Blizzard CDN for ${pending.length} missing texture${pending.length===1?'':'s'}…`,'loading');
      const textureCasc=await autoLoadMissingModelTexturesFromCasc();
      state.textureDiscovery.cascFound=Number(textureCasc&&textureCasc.found||0);
      state.textureDiscovery.cascAttempted=Number(textureCasc&&textureCasc.attempted||0);
      state.textureDiscovery.missing=unresolvedModelTextures().map(x=>x.ref);
      if(state.textureDiscovery.cascFound)setDefaultViewportDisplay();
      renderEverything();markDirty();
      if(state.textureDiscovery.missing.length)setCascStatusUi(`CASC search finished · ${state.textureDiscovery.missing.length} texture${state.textureDiscovery.missing.length===1?'':'s'} still missing.`,'error');
      else setCascStatusUi(`CASC search finished · ${state.textureDiscovery.cascFound} missing texture${state.textureDiscovery.cascFound===1?'':'s'} resolved.`,'ready');
    }
    if(enableEffects){
      state.casc.enabled=true;
      const toggle=$('#modelUseCascEffects');if(toggle)toggle.checked=true;
      if(state.model)await loadCascEffectAssets(true);
    }
    return state.casc.status||st||{ready:false};
  }
  async function askSearchGameFiles(missing){
    const dialog=$('#missingTextureGameSearchDialog');
    if(!dialog||typeof dialog.showModal!=='function'){
      return window.confirm(`Some textures were not found. Would you like to search the game files?\n\n${missingTextureList(missing)}`);
    }
    const count=$('#missingTextureGameSearchCount'),list=$('#missingTextureGameSearchList');
    if(count)count.textContent=`${missing.length} referenced texture${missing.length===1?' was':'s were'} not found in the model package or local model folder.`;
    if(list)list.textContent=missingTextureList(missing);
    return await new Promise(resolve=>{
      const finish=()=>{
        dialog.removeEventListener('close',finish);
        resolve(dialog.returnValue==='search');
      };
      dialog.addEventListener('close',finish,{once:true});
      dialog.returnValue='cancel';
      dialog.showModal();
    });
  }
  async function promptForMissingGameTextures(){
    const missing=noteUnresolvedModelTextures();
    if(!missing.length)return false;
    if(!(await askSearchGameFiles(missing))){
      setCascStatusUi('Game files were not searched. Warcraft asset access remains off until requested.');
      return false;
    }
    await ensureCascOnDemand({enableEffects:false,resolveTextures:true,reason:'missing-textures'});
    const remaining=noteUnresolvedModelTextures();
    if(remaining.length){
      window.alert(`The game files were searched, but ${remaining.length} texture${remaining.length===1?' is':'s are'} still missing.\n\n${missingTextureList(remaining)}\n\nFor custom textures, use “Add Textures” or place the files next to the model in the expected folders.`);
    }else{
      app.setStatus('All referenced textures are resolved.');
    }
    return true;
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
    return [...new Set(out.map(x=>String(x||'').trim()).filter(x=>x&&isLikelyWarcraftStockTextureRef(x)))];
  }
  let lastCascStatusLog='';
  function setCascStatusUi(message,kind=''){
    const el=$('#modelCascStatus');if(!el)return;el.textContent=message||'CASC asset resolver is not connected.';el.classList.remove('ready','loading','error');if(kind)el.classList.add(kind);
    const key=`${kind}|${message}`;if(message&&key!==lastCascStatusLog){lastCascStatusLog=key;diag(kind==='error'?'error':kind==='loading'?'debug':'info','CASC',message);}
  }
  async function refreshCascStatus(){
    const bridge=cascBridge();
    if(!bridge){state.casc.status={ready:false,message:'CASC bridge is unavailable in this build.'};setCascStatusUi(state.casc.status.message,'error');return state.casc.status;}
    try{state.casc.status=await bridge.status();diag('debug','CASC','Status response',state.casc.status);}
    catch(e){state.casc.status={ready:false,message:e.message||String(e)};diag('error','CASC','Status request failed',e);}
    const enabled=$('#modelUseCascEffects')&&$('#modelUseCascEffects').checked;
    if(state.casc.loading)setCascStatusUi('Reading referenced FX / Spell assets from the Warcraft asset source…','loading');
    else if(state.casc.status.ready){
      const backendVerified=state.casc.status.verified===true;
      const prefix=enabled?(state.casc.verified?'FX VERIFIED':(backendVerified?'Connected · backend verified':'Connected · verification required')):'Ready';
      setCascStatusUi(`${prefix} · ${state.casc.status.message}`,'ready');
    }
    else setCascStatusUi(state.casc.status.message||'CASC FX resolver is not configured.',state.casc.status.platformReady===false?'':'error');
    return state.casc.status;
  }
  function addCascAssetToPackage(asset){
    const ab=arrayBufferFromIpc(asset&&asset.data);if(!asset||!asset.found||!ab){if(asset)diag('warn','CASC','Referenced asset not found',{requestedPath:asset.requestedPath,resolvedPath:asset.resolvedPath||''});return false;}
    const resolved=asset.resolvedPath||asset.requestedPath,requested=asset.requestedPath||resolved;
    const entry={name:resolved,data:new Uint8Array(ab),autoResolved:true,source:'casc',requestedPath:requested};
    // Keep both names. Reforged/DE commonly resolves an MDX-authored .blp path
    // to a .dds file in CASC; the authored alias lets the material find it while
    // entry.name preserves the real extension for the DDS decoder.
    state.packageFiles.set(resolved,entry);
    if(normalizePath(requested)!==normalizePath(resolved))state.packageFiles.set(requested,entry);
    state.casc.loaded.set(normalizePath(requested),{...asset,data:ab});
    diag('info','CASC','Referenced asset loaded',{requestedPath:requested,resolvedPath:resolved,size:ab.byteLength});return true;
  }
  async function readCascRequests(requests){
    const bridge=cascBridge();if(!bridge||!requests.length)return [];
    const results=[];diag('info','CASC','Reading referenced assets',{count:requests.length,requests:requests.map(r=>({path:r.path,kind:r.kind,artSet:r.artSet}))});
    for(let i=0;i<requests.length;i+=24){const part=requests.slice(i,i+24);const reply=await bridge.readAssets(part);results.push(...((reply&&reply.results)||[]));}
    diag('info','CASC','Referenced asset read finished',{count:results.length,found:results.filter(r=>r.found).length,missing:results.filter(r=>!r.found).length});return results;
  }

  function makeModelRuntime(meta,textures=[]){
    if(!meta||!meta.parsed)return null;
    const model=meta.parsed,sequencePrefs=preferredCascEffectSequences(model);
    const trackCount=(model.nodes||[]).reduce((n,x)=>n+Object.values(x.tracks||{}).filter(Boolean).length,0)
      +(model.geosetAnimations||[]).reduce((n,x)=>n+Object.values(x.tracks||{}).filter(Boolean).length,0)
      +(model.materials||[]).reduce((n,m)=>n+(m.layers||[]).reduce((a,l)=>a+Object.values(l.tracks||{}).filter(Boolean).length,0),0);
    return {...meta,textures,sequencePrefs,trackCount,startedAt:performance.now()};
  }
  async function buildCascEffectRuntime(meta){
    if(!meta||!meta.parsed)return null;
    const model=meta.parsed,textures=[];
    for(let i=0;i<(model.textureDefs||[]).length;i++){
      const def=model.textureDefs[i]||{},rep=textureReplaceableInfo(def),rid=rep.rid;
      if(rid===1||rid===2){textures[i]=makeTeamReplaceableCanvas(rid===2,rep.index);continue;}
      const ref=def.path||'';if(!ref){textures[i]=null;continue;}
      const match=resolveTextureRef(ref);if(!match){textures[i]=null;continue;}
      try{const img=await imageDataFromArrayBuffer(match.name,arrayBufferOf(match.entry));textures[i]=img?imageDataToCanvas(img):null;}
      catch(e){textures[i]=null;diag('warn','CASC Animation','Effect model texture decode failed',{effect:meta.path,texture:ref,error:e});}
    }
    const runtime=makeModelRuntime(meta,textures);
    state.casc.effectRuntimes.set(normalizePath(meta.path),runtime);
    diag('info','CASC Animation','Real CASC effect model ready',{effect:meta.path,resolvedPath:meta.resolvedPath||'',sequences:(model.sequences||[]).map(s=>s.name),sequenceCount:(model.sequences||[]).length,nodeTracks:runtime.trackCount,geosets:(model.geosets||[]).length,particleEmitters2:(model.particleEmitters2||[]).length,texturesDecoded:textures.filter(Boolean).length,texturesTotal:textures.length});
    return runtime;
  }
  function rememberReferenceTexture(key,canvas){
    const k=normalizePath(key||'');if(!k||!canvas)return canvas;
    const cache=state.casc.referenceTextures||(state.casc.referenceTextures=new Map());
    if(cache.has(k))cache.delete(k);cache.set(k,canvas);
    while(cache.size>96)cache.delete(cache.keys().next().value);
    return canvas;
  }
  function cachedReferenceTexture(key){
    const k=normalizePath(key||'');if(!k)return null;
    const cache=state.casc.referenceTextures;if(!cache)return null;
    const hit=cache.get(k)||null;
    if(hit){cache.delete(k);cache.set(k,hit);}
    return hit;
  }

  async function prepareReferenceModelRuntime(model,path='',artSet='stock'){
    if(!model)return null;
    const bridge=cascBridge();if(!bridge)throw new Error('CASC bridge is unavailable.');
    const status=await ensureCascOnDemand({enableEffects:false,resolveTextures:false,reason:'reference-model-runtime'});
    if(!status||status.ready===false)throw new Error((status&&status.message)||'Warcraft CASC is not ready.');
    const defs=model.textureDefs||[],requests=[],seen=new Set();
    for(const def of defs){
      const rep=textureReplaceableInfo(def),rid=rep.rid,ref=String(def&&def.path||'').trim();
      if(!ref||rid===1||rid===2)continue;const key=normalizePath(ref);if(seen.has(key)||cachedReferenceTexture(key))continue;seen.add(key);requests.push({path:ref,kind:'effect-texture',artSet});
    }
    const results=requests.length?await readCascRequests(requests):[],assets=new Map();
    for(const a of results){if(!a||!a.found||!a.data)continue;assets.set(normalizePath(a.requestedPath||''),a);}
    const textures=[];
    for(let i=0;i<defs.length;i++){
      const def=defs[i]||{},rep=textureReplaceableInfo(def),rid=rep.rid;
      if(rid===1||rid===2){textures[i]=makeTeamReplaceableCanvas(rid===2,rep.index);continue;}
      const ref=String(def.path||'').trim();if(!ref){textures[i]=null;continue;}
      const key=normalizePath(ref),cached=cachedReferenceTexture(key);if(cached){textures[i]=cached;continue;}
      const asset=assets.get(key);if(!asset){textures[i]=null;continue;}
      try{
        const ab=arrayBufferFromIpc(asset.data),img=await imageDataFromArrayBuffer(asset.resolvedPath||ref,ab),canvas=img?imageDataToCanvas(img):null;
        textures[i]=canvas;if(canvas){rememberReferenceTexture(key,canvas);rememberReferenceTexture(asset.resolvedPath||'',canvas);}
      }
      catch(e){textures[i]=null;diag('warn','Reference Model','Reference texture decode failed',{model:path,texture:ref,error:e});}
    }
    const runtime=makeModelRuntime({path:String(path||model.sourceName||'reference'),resolvedPath:String(path||''),parsed:model,reference:true},textures);
    diag('info','Reference Model','Full CASC reference runtime ready',{path:runtime.path,geosets:(model.geosets||[]).length,sequences:(model.sequences||[]).length,nodeTracks:runtime.trackCount,texturesDecoded:textures.filter(Boolean).length,texturesTotal:defs.length});
    return runtime;
  }

  async function prepareReferenceModelRuntimesBatch(items=[],artSet='stock'){
    const list=(Array.isArray(items)?items:[]).slice(0,8).map((item,index)=>({
      index,
      model:item?.model||item?.m||null,
      path:String(item?.path||item?.model?.sourceName||'reference')
    })).filter(x=>x.model);
    if(!list.length)return [];
    const bridge=cascBridge();if(!bridge)throw new Error('CASC bridge is unavailable.');
    const status=await ensureCascOnDemand({enableEffects:false,resolveTextures:false,reason:'reference-model-gallery-batch'});
    if(!status||status.ready===false)throw new Error((status&&status.message)||'Warcraft CASC is not ready.');

    const requests=[],seen=new Set(),decoded=new Map();
    for(const item of list){
      for(const def of (item.model.textureDefs||[])){
        const rep=textureReplaceableInfo(def),rid=rep.rid,ref=String(def&&def.path||'').trim();
        if(!ref||rid===1||rid===2)continue;
        const key=normalizePath(ref),cached=cachedReferenceTexture(key);
        if(cached){decoded.set(key,cached);continue;}
        if(seen.has(key))continue;
        seen.add(key);requests.push({path:ref,kind:'effect-texture',artSet});
      }
    }
    const results=requests.length?await readCascRequests(requests):[];
    for(const a of results){
      if(!a||!a.found||!a.data)continue;
      const key=normalizePath(a.requestedPath||'');if(decoded.has(key))continue;
      try{
        const ab=arrayBufferFromIpc(a.data),img=await imageDataFromArrayBuffer(a.resolvedPath||a.requestedPath||'',ab),canvas=img?imageDataToCanvas(img):null;
        decoded.set(key,canvas);if(canvas){rememberReferenceTexture(key,canvas);rememberReferenceTexture(a.resolvedPath||'',canvas);}
      }catch(e){decoded.set(key,null);diag('warn','Reference Model','Gallery batch texture decode failed',{texture:a.requestedPath||'',error:e});}
    }

    const output=[];
    for(const item of list){
      const model=item.model,defs=model.textureDefs||[],textures=[];
      for(let i=0;i<defs.length;i++){
        const def=defs[i]||{},rep=textureReplaceableInfo(def),rid=rep.rid;
        if(rid===1||rid===2){textures[i]=makeTeamReplaceableCanvas(rid===2,rep.index);continue;}
        const ref=String(def.path||'').trim();textures[i]=ref?(decoded.get(normalizePath(ref))||null):null;
      }
      const runtime=makeModelRuntime({path:item.path,resolvedPath:item.path,parsed:model,reference:true},textures);
      output.push({path:item.path,runtime});
    }
    diag('info','Reference Model','CASC gallery runtime batch ready',{
      models:output.length,
      requestedTextures:requests.length,
      cachedOrDecodedTextures:decoded.size,
      texturesDecoded:[...decoded.values()].filter(Boolean).length
    });
    return output;
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
      if(p2>0 && !state.fxPreviewMode){state.fxPreviewMode=true;state.fxPreviewStartedAt=performance.now();state.gizmoVisible=false;const firstP2=(state.model.particleEmitters2||[])[0];if(firstP2)state.selectedNodeId=firstP2.id;diag('info','FX','CASC effect playback enabled after asset load',{particleEmitters2:p2,selectedEmitter:firstP2&&firstP2.name||''});}
      renderEverything();markDirty();
    }catch(e){state.casc.verified=false;state.casc.lastError=e.message||String(e);setCascStatusUi(`CASC error · ${state.casc.lastError}`,'error');diag('error','CASC','FX load failed',e);console.error('CASC FX load failed:',e);}
    finally{state.casc.loading=false;}
  }
  async function setupCasc(options={}){
    const {enableEffects=true,resolveTextures=false,reason='manual-connect'}=options||{};
    const bridge=cascBridge();if(!bridge){setCascStatusUi('Warcraft asset access is unavailable in this build.','error');return {ready:false};}
    state.casc.userRequested=true;
    setCascStatusUi('Opening Warcraft asset source…','loading');
    try{
      state.casc.status=await bridge.setup();
      await refreshCascStatus();
      if(state.casc.status&&state.casc.status.ready){
        if(resolveTextures&&state.model){
          const textureCasc=await autoLoadMissingModelTexturesFromCasc();
          state.textureDiscovery.cascFound=Number(textureCasc&&textureCasc.found||0);
          state.textureDiscovery.cascAttempted=Number(textureCasc&&textureCasc.attempted||0);
          state.textureDiscovery.missing=unresolvedModelTextures().map(x=>x.ref);
          if(state.textureDiscovery.cascFound)setDefaultViewportDisplay();
        }
        if(enableEffects){
          state.casc.enabled=true;
          const toggle=$('#modelUseCascEffects');if(toggle)toggle.checked=true;
          if(state.model)await loadCascEffectAssets(true);
        }else{
          state.casc.enabled=false;
          const toggle=$('#modelUseCascEffects');if(toggle)toggle.checked=false;
        }
        diag('info','CASC','On-demand setup completed',{reason,enableEffects,resolveTextures,backend:state.casc.status.backend||''});
      }
      return state.casc.status;
    }
    catch(e){setCascStatusUi(`Warcraft asset setup failed · ${e.message||e}`,'error');diag('error','CASC','Setup failed',e);return {ready:false,message:e.message||String(e)};}
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
    state.fxLastStatsCheck=0;
    state.fxLastStatsLog=0;
    state.fxLastStatsSignature='';
    state.paintHistory=[];state.paintRedo=[];
    state.geosetHistory=[];state.geosetRedo=[];state.modelHistory=[];state.modelRedo=[];state.hiddenGeosets=new Set();
    state.selectedGeosetIndex=-1;state.geosetDrag=null;state.geosetHover='';state.geometryRevision=0;
    historyChanged();
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
      sourcePath: typeof sourceFile==='string' ? sourceFile : (window.WC3_LOCAL_FILES?.pathForFile?.(sourceFile)||''),
      __uvCoreVersion: parsed.__uvCoreVersion,
      __uvSourceConvention: parsed.__uvSourceConvention,
      __uvNormalizedFromLegacy: !!parsed.__uvNormalizedFromLegacy
    };
    ensureAuthoringIds();
    invalidateGeometryCache();
    state.faceCache=new WeakMap();
    state.textureDiscovery={localFound:0,cascFound:0,cascAttempted:0,missing:[],scannedFiles:0,truncated:false,source:sourceFile?'local-file':(replaceFiles&&replaceFiles.size?'package':'')};
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
    state.selectedGeosetIndex = state.model.geosets.length ? 0 : -1;
    state.editorTextureIndex = -1;
    state.editingTexturePathIndex = -1;
    state.renamingTextureIndex = -1;
    const firstRigNode=(state.model.nodes||[]).find(n=>n.type==='Bone'||n.type==='Helper');
    state.selectedNodeId = firstRigNode ? firstRigNode.id : -1;
    state.animation.playing = false;
    state.animation.t = 0;
    state.animation.lastTs = 0;
    state.animation.elapsedMs = 0;
    setDefaultViewportDisplay();
    state.gizmoVisible = false;
    // A newly opened model must never inherit a sequence selected in the previous
    // document. Sequence names/indices are model-local and stale selection can make
    // a valid model look missing, buried or wildly transformed on first render.
    const sequenceSelect=$('#modelSequenceSelect');if(sequenceSelect)sequenceSelect.value='';
    resetCamera();
    renderEverything();
    markDirty();
    // Warcraft game files are intentionally NOT touched during normal model load.
    // First resolve only package/local textures. CASC/CDN is strictly opt-in:
    // the missing-texture prompt, the Effects tab, the FX toggle, Connect, or Asset Browser.
    state.textureDiscovery.cascFound=0;
    state.textureDiscovery.cascAttempted=0;
    state.textureDiscovery.missing=unresolvedModelTextures().map(x=>x.ref);
    if(state.textureDiscovery.missing.length)setCascStatusUi('Warcraft game files have not been searched.');
    try{app.unsaved?.markSaved?.(['model','modelTextures']);}catch(_){}
  }

  async function openModelFile(file, options={}){
    if(!file || state.loading) return false;
    if(options.skipUnsavedPrompt!==true && !(await guardModelReplacement('open another model',file.name||'')))return false;
    state.loading = true;
    let loadedOk=false;
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
      const detectedPath=String(options.sourcePath||window.WC3_LOCAL_FILES?.pathForFile?.(file)||'');
      await loadModelBuffer(file.name, buffer, new Map(), detectedPath || file);
      const ms = Math.round(performance.now() - started);
      const tris = (state.model.geosets || []).reduce((sum,g)=>sum+(g.faces||[]).length,0);
      const uvCompat=state.model.__uvNormalizedFromLegacy?` · legacy Core ${state.model.__uvCoreVersion} UV normalized`:'';
      const td=state.textureDiscovery||{},missing=unresolvedModelTextures();
      const autoBits=[];if(td.localFound)autoBits.push(`${td.localFound} texture${td.localFound===1?'':'s'} from folder`);if(td.cascFound)autoBits.push(`${td.cascFound} from CASC`);if(missing.length)autoBits.push(`${missing.length} missing`);
      setLoadStatus(`Loaded · ${state.model.geosets.length} geosets · ${tris.toLocaleString()} triangles · ${ms} ms${uvCompat}${autoBits.length?' · '+autoBits.join(' · '):''}`, missing.length?'info':'ok');
      app.setStatus(`Model loaded: ${file.name}${td.localFound?` · ${td.localFound} texture(s) auto-loaded`:''}${missing.length?` · ${missing.length} missing`:''}`);
      markDirty();
      loadedOk=true;
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
    if(loadedOk&&options.warnMissing!==false&&options.promptMissing!==false)await promptForMissingGameTextures();
    return loadedOk;
  }

  async function openModelZip(file,options={}){
    if(!file) return false;
    if(options.skipUnsavedPrompt!==true && !(await guardModelReplacement('open another model package',file.name||'')))return false;
    let loadedOk=false;
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
      loadedOk=true;
    } catch(e){
      alert('Could not read the ZIP package.\n\n' + e.message);
    } finally { app.hideBusy(); }
    if(loadedOk)await promptForMissingGameTextures();
    return loadedOk;
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


  function selectedSequenceIndex(){
    const sel=$('#modelSequenceSelect');return sel&&sel.value!==''?+sel.value:-1;
  }
  function uniqueSequenceName(base){
    const used=new Set((state.model&&state.model.sequences||[]).map(s=>String(s.name||'').toLowerCase()));let name=String(base||'Action Copy').trim()||'Action Copy';if(!used.has(name.toLowerCase()))return name;
    let n=2;while(used.has(`${name} ${n}`.toLowerCase()))n++;return `${name} ${n}`;
  }
  function nextSequenceInterval(length){
    const seqs=state.model&&state.model.sequences||[];let maxEnd=0;for(const s of seqs)maxEnd=Math.max(maxEnd,+s.end||0);
    const start=Math.max(0,Math.ceil((maxEnd+100)/100)*100);return {start,end:start+Math.max(1,Math.round(length||1))};
  }
  function allTrackContainers(){
    const out=[];if(!state.model)return out;
    (state.model.textureAnimations||[]).forEach(x=>x&&out.push(x));
    (state.model.geosetAnimations||[]).forEach(x=>x&&out.push(x));
    (state.model.materials||[]).forEach(m=>(m&&m.layers||[]).forEach(l=>l&&out.push(l)));
    (state.model.nodes||[]).forEach(n=>n&&out.push(n));
    (state.model.cameras||[]).forEach(c=>c&&out.push(c));
    return out;
  }
  function duplicateTrackRange(track,sourceStart,sourceEnd,destStart){
    if(!track||!Array.isArray(track.keys)||(track.globalSequenceId!=null&&track.globalSequenceId>=0))return 0;
    const delta=destStart-sourceStart,source=track.keys.filter(k=>k.frame>=sourceStart&&k.frame<=sourceEnd).map(k=>cloneHistoryData(k));if(!source.length)return 0;
    const existing=new Set(track.keys.map(k=>k.frame));let added=0;
    for(const key of source){key.frame+=delta;if(existing.has(key.frame))continue;track.keys.push(key);existing.add(key.frame);added++;}
    track.keys.sort((a,b)=>a.frame-b.frame);return added;
  }
  function duplicateEventRange(node,sourceStart,sourceEnd,destStart){
    if(!node||!Array.isArray(node.eventTracks)||(node.globalSequenceId!=null&&node.globalSequenceId>=0))return 0;
    const delta=destStart-sourceStart,add=node.eventTracks.filter(f=>f>=sourceStart&&f<=sourceEnd).map(f=>f+delta),set=new Set(node.eventTracks);let n=0;for(const f of add)if(!set.has(f)){node.eventTracks.push(f);set.add(f);n++;}node.eventTracks.sort((a,b)=>a-b);return n;
  }
  function duplicateSelectedSequence(){
    if(!state.model)return false;const index=selectedSequenceIndex(),src=index>=0?state.model.sequences[index]:null;if(!src)return false;
    const nameInput=$('#modelSequenceNameInput'),typed=String(nameInput&&nameInput.value||'').trim();const proposed=typed&&typed!==src.name?typed:`${src.name||'Action'} Copy`,name=uniqueSequenceName(proposed);
    pushModelHistorySnapshot(captureAnimationSnapshot(`Duplicate action ${src.name||index+1}`));
    const interval=nextSequenceInterval(src.length||(+src.end-+src.start)||1),delta=interval.start-src.start;let keyCount=0,eventCount=0;
    for(const owner of allTrackContainers())for(const track of Object.values(owner.tracks||{}))keyCount+=duplicateTrackRange(track,src.start,src.end,interval.start);
    for(const n of state.model.nodes||[])eventCount+=duplicateEventRange(n,src.start,src.end,interval.start);
    const next={...cloneHistoryData(src),id:(state.model.sequences||[]).length,name,start:interval.start,end:interval.end,length:interval.end-interval.start,__clonedFromIndex:index};
    state.model.sequences.push(next);
    (state.model.geosets||[]).forEach(g=>{if(!g)return;const seqExt=Array.isArray(g.sequenceExtents)?g.sequenceExtents:(g.sequenceExtents=[]);const fallback=g.extent?cloneHistoryData(g.extent):{boundsRadius:0,min:[0,0,0],max:[0,0,0]};seqExt.push(cloneHistoryData(seqExt[index]||fallback));});
    if(!Array.isArray(state.model.__animationOps))state.model.__animationOps=[];state.model.__animationOps.push({type:'clone',sourceIndex:index,sourceStart:src.start,sourceEnd:src.end,destStart:interval.start,destEnd:interval.end});state.model.__animationEdited=true;
    state.animation.playing=false;state.animation.t=0;state.animation.elapsedMs=0;invalidateGeometryCache();renderSequenceUI();const sel=$('#modelSequenceSelect');if(sel)sel.value=String(state.model.sequences.length-1);renderSequenceUI();resetSequenceTransformFields();markDirty();
    app.setStatus(`Action duplicated · ${src.name} → ${name} · ${keyCount} key(s) + ${eventCount} event(s) copied`);diag('info','Animation Editor','Sequence duplicated',{source:src.name,name,sourceInterval:[src.start,src.end],destInterval:[interval.start,interval.end],keys:keyCount,events:eventCount});return true;
  }
  function renameSelectedSequence(){
    if(!state.model)return false;const index=selectedSequenceIndex(),seq=index>=0?state.model.sequences[index]:null,input=$('#modelSequenceNameInput');if(!seq||!input)return false;const name=String(input.value||'').trim();if(!name){alert('Type a name for the action first.');return false;}if(name===seq.name)return true;
    pushModelHistorySnapshot(captureAnimationSnapshot(`Rename action ${seq.name}`));const old=seq.name;seq.name=name;state.model.__animationEdited=true;renderSequenceUI();const sel=$('#modelSequenceSelect');if(sel)sel.value=String(index);renderSequenceUI();app.setStatus(`Action renamed · ${old} → ${name}`);diag('info','Animation Editor','Sequence renamed',{index,old,name});return true;
  }
  function quatMultiply(a,b){return normalizeQuat([a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]);}
  function quatFromEulerDegrees(x,y,z){
    const rx=(+x||0)*Math.PI/180/2,ry=(+y||0)*Math.PI/180/2,rz=(+z||0)*Math.PI/180/2;
    const qx=[Math.sin(rx),0,0,Math.cos(rx)],qy=[0,Math.sin(ry),0,Math.cos(ry)],qz=[0,0,Math.sin(rz),Math.cos(rz)];return quatMultiply(qz,quatMultiply(qy,qx));
  }
  function ensureSequenceTrack(node,tag,label,components){
    if(!node.tracks)node.tracks={};let track=node.tracks[tag];if(track&&track.globalSequenceId!=null&&track.globalSequenceId>=0)return null;
    if(!track){track={tag,label,interpolation:'Linear',interpolationType:1,globalSequenceId:-1,keys:[]};node.tracks[tag]=track;}
    if(!Array.isArray(track.keys))track.keys=[];if(tag==='KGTR')node.translation=track;if(tag==='KGRT')node.rotation=track;if(tag==='KGSC')node.scaling=track;return track;
  }
  function transformVectorKey(key,mode,amount,interp){
    const apply=v=>{if(!Array.isArray(v))return v;if(mode==='translate')return v.map((x,i)=>(+x||0)+(amount[i]||0));if(mode==='scale')return v.map((x,i)=>(+x||0)*(amount[i]??1));return v;};
    key.value=apply(key.value);if(key.inTan){if(mode==='translate'&&interp==='Hermite'){}else key.inTan=apply(key.inTan);}if(key.outTan){if(mode==='translate'&&interp==='Hermite'){}else key.outTan=apply(key.outTan);}
  }
  function transformQuatKey(key,q){const apply=v=>Array.isArray(v)&&v.length>=4?quatMultiply(q,v):v;key.value=apply(key.value);if(key.inTan)key.inTan=apply(key.inTan);if(key.outTan)key.outTan=apply(key.outTan);}
  function applyTransformToTrack(track,tag,seq,transform){
    const inRange=track.keys.filter(k=>k.frame>=seq.start&&k.frame<=seq.end);const interp=track.interpolation||'Linear';
    if(!inRange.length){let value=tag==='KGTR'?[0,0,0]:tag==='KGSC'?[1,1,1]:[0,0,0,1];const make=frame=>({frame,value:value.slice(),inTan:null,outTan:null});const a=make(seq.start),b=make(seq.end);track.keys.push(a,b);inRange.push(a,b);}
    if(tag==='KGTR')for(const k of inRange)transformVectorKey(k,'translate',transform.translate,interp);
    else if(tag==='KGSC')for(const k of inRange)transformVectorKey(k,'scale',transform.scale,interp);
    else if(tag==='KGRT'){const q=quatFromEulerDegrees(...transform.rotate);for(const k of inRange)transformQuatKey(k,q);}
    track.keys.sort((a,b)=>a.frame-b.frame);
  }
  function readSequenceTransformFields(){
    const val=id=>{const e=$(id),n=e?+e.value:0;return Number.isFinite(n)?n:0;};
    const scale=id=>{const e=$(id),n=e?+e.value:1;return Number.isFinite(n)?n:1;};
    return {translate:[val('#modelSeqPosX'),val('#modelSeqPosY'),val('#modelSeqPosZ')],rotate:[val('#modelSeqRotX'),val('#modelSeqRotY'),val('#modelSeqRotZ')],scale:[scale('#modelSeqScaleX'),scale('#modelSeqScaleY'),scale('#modelSeqScaleZ')]};
  }
  function resetSequenceTransformFields(){for(const id of ['#modelSeqPosX','#modelSeqPosY','#modelSeqPosZ','#modelSeqRotX','#modelSeqRotY','#modelSeqRotZ']){const e=$(id);if(e)e.value='0';}for(const id of ['#modelSeqScaleX','#modelSeqScaleY','#modelSeqScaleZ']){const e=$(id);if(e)e.value='1';}}
  function applySelectedSequenceTransform(){
    if(!state.model)return false;const index=selectedSequenceIndex(),seq=index>=0?state.model.sequences[index]:null;if(!seq)return false;const transform=readSequenceTransformFields();const identity=transform.translate.every(v=>Math.abs(v)<1e-9)&&transform.rotate.every(v=>Math.abs(v)<1e-9)&&transform.scale.every(v=>Math.abs(v-1)<1e-9);if(identity){app.setStatus('Animation transform is already neutral.');return false;}
    const rigRoots=(state.model.nodes||[]).filter(n=>(n.type==='Bone'||n.type==='Helper')&&(+n.parentId<0));const roots=rigRoots.length?rigRoots:(state.model.nodes||[]).filter(n=>+n.parentId<0);if(!roots.length){alert('No root rig node was found for this model.');return false;}
    pushModelHistorySnapshot(captureAnimationSnapshot(`Transform action ${seq.name}`));let skippedGlobal=0;
    for(const n of roots){const needsT=transform.translate.some(v=>Math.abs(v)>1e-9),needsR=transform.rotate.some(v=>Math.abs(v)>1e-9),needsS=transform.scale.some(v=>Math.abs(v-1)>1e-9);if(needsT){const t=ensureSequenceTrack(n,'KGTR','Translation',3);if(t)applyTransformToTrack(t,'KGTR',seq,transform);else skippedGlobal++;}if(needsR){const t=ensureSequenceTrack(n,'KGRT','Rotation',4);if(t)applyTransformToTrack(t,'KGRT',seq,transform);else skippedGlobal++;}if(needsS){const t=ensureSequenceTrack(n,'KGSC','Scaling',3);if(t)applyTransformToTrack(t,'KGSC',seq,transform);else skippedGlobal++;}}
    if(!Array.isArray(state.model.__animationOps))state.model.__animationOps=[];state.model.__animationOps.push({type:'transform',start:seq.start,end:seq.end,translate:transform.translate.slice(),rotate:transform.rotate.slice(),scale:transform.scale.slice(),rootScope:rigRoots.length?'rig':'all'});state.model.__animationEdited=true;
    invalidateGeometryCache();renderSequenceUI();markDirty();app.setStatus(`Action transform applied · ${seq.name}${skippedGlobal?` · ${skippedGlobal} global-sequence track(s) skipped`:''}`);diag('info','Animation Editor','Sequence root transform applied',{name:seq.name,interval:[seq.start,seq.end],transform,roots:roots.length,skippedGlobal});return true;
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
    const yl=Math.hypot(y.x,y.y,y.z)||1;y={x:y.x/yl,y:y.y/yl,z:y.z/yl};sy=yl;
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
    if(r.gridBuffer){gl.deleteBuffer(r.gridBuffer);r.gridBuffer=null;}
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
      const normalArray=makeNormals(geo);gl.bindBuffer(gl.ARRAY_BUFFER,normal);gl.bufferData(gl.ARRAY_BUFFER,normalArray,gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,bone);gl.bufferData(gl.ARRAY_BUFFER,makeBoneCounts(geo),gl.STATIC_DRAW);
      let maxIndex=0; const flat=[]; for(const f of geo.faces||[]){flat.push(f[0],f[1],f[2]);maxIndex=Math.max(maxIndex,f[0],f[1],f[2]);}
      const use32=maxIndex>65535; const idx=use32?new Uint32Array(flat):new Uint16Array(flat);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
      const lines=[];for(const f of geo.faces||[]){lines.push(f[0],f[1],f[1],f[2],f[2],f[0]);}
      const wi=use32?new Uint32Array(lines):new Uint16Array(lines);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,wire);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,wi,gl.STATIC_DRAW);
      const uv=[]; const sets=Math.max(1,(geo.uvSets||[]).length); for(let s=0;s<sets;s++){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,makeUv(geo,s),gl.STATIC_DRAW);uv.push(b);}
      return{geo,gi,pos,normal,bone,index,wire,uv,indexCount:idx.length,wireCount:wi.length,indexType:use32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,positionArray:new Float32Array(geo.vertices.length*3),normalArray};
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
  function clearGlReferenceResources(r){
    if(!r||!r.gl)return;const gl=r.gl,rr=r.referenceResources;if(rr){for(const b of rr.batches||[]){['pos','normal','bone','index'].forEach(k=>b[k]&&gl.deleteBuffer(b[k]));(b.uv||[]).forEach(x=>x&&gl.deleteBuffer(x));}for(const t of rr.textures||[])if(t&&t.tex)gl.deleteTexture(t.tex);}r.referenceResources=null;r.referenceRendered=false;
  }
  function referenceLayerPolicy(mode='None',flags=0,opacity=1){
    const noDepthTest=!!(flags&64),noDepthSet=!!(flags&128),op=clamp(Number(opacity)||1,0,1),opaque=mode==='None'||mode==='Transparent';
    return{mode,depthTest:!noDepthTest,depthWrite:!noDepthSet&&opaque,blend:!opaque||op<.999,alphaCut:mode==='Transparent'?.75*op:(mode==='Modulate'||mode==='Modulate2x'?.02:0),opacity:op};
  }
  function referenceLayerStackPolicy(){
    // Warcraft materials commonly stack multiple coplanar layers on one geoset
    // (for example Team Color under a cutout diffuse layer). With GL_LESS the
    // first depth-writing layer blocks every later layer at the exact same Z,
    // leaving a flat replaceable/team-color surface. GL_LEQUAL keeps normal
    // occlusion against geometry behind it while allowing the authored layer
    // stack on the same triangles to composite correctly.
    return{depthFunc:'LEQUAL',restoreDepthFunc:'LESS',coplanarLayers:true};
  }
  function applyReferenceLayerPolicy(gl,policy){
    if(policy.depthTest)gl.enable(gl.DEPTH_TEST);else gl.disable(gl.DEPTH_TEST);gl.depthMask(!!policy.depthWrite);
    if(policy.blend){gl.enable(gl.BLEND);if(policy.mode==='Additive'||policy.mode==='AddAlpha')gl.blendFunc(gl.SRC_ALPHA,gl.ONE);else if(policy.mode==='Modulate')gl.blendFunc(gl.DST_COLOR,gl.ZERO);else if(policy.mode==='Modulate2x')gl.blendFunc(gl.DST_COLOR,gl.SRC_COLOR);else gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}else gl.disable(gl.BLEND);
  }
  function initGlReferenceModel(r,ref){
    if(!r||!r.gl||!ref?.runtime?.parsed)return null;const model=ref.runtime.parsed,gl=r.gl,old=r.referenceResources;
    if(old&&old.model===model&&old.runtime===ref.runtime)return old;clearGlReferenceResources(r);
    const rr={model,runtime:ref.runtime,batches:[],textures:[],geometryKey:'',anim:null,logged:false};
    rr.batches=modelRenderableGeosetEntries(model).map(({geo,index:gi,lod})=>{const pos=gl.createBuffer(),normal=gl.createBuffer(),bone=gl.createBuffer(),index=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pos);gl.bufferData(gl.ARRAY_BUFFER,makeFloat3(geo.vertices||[]),gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,normal);gl.bufferData(gl.ARRAY_BUFFER,makeNormals(geo),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,bone);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array((geo.vertices||[]).length),gl.STATIC_DRAW);const flat=[];let maxIndex=0;for(const f of geo.faces||geo.triangles||[]){const ids=Array.isArray(f)?f:[f?.a,f?.b,f?.c];if(ids?.length<3)continue;flat.push(ids[0],ids[1],ids[2]);maxIndex=Math.max(maxIndex,ids[0],ids[1],ids[2]);}const use32=maxIndex>65535,idx=use32?new Uint32Array(flat):new Uint16Array(flat);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);const uv=[];for(let si=0;si<Math.max(1,(geo.uvSets||[]).length);si++){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,makeUv(geo,si),gl.STATIC_DRAW);uv.push(b);}return{geo,gi,lod,pos,normal,bone,index,uv,indexCount:idx.length,indexType:use32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,positionArray:new Float32Array((geo.vertices||[]).length*3)};});
    r.referenceResources=rr;return rr;
  }
  function uploadGlReferenceTexture(r,rr,index){
    const gl=r.gl,source=rr.runtime?.textures?.[index];if(!source)return null;let rec=rr.textures[index];if(!rec){rec={tex:gl.createTexture(),source:null};rr.textures[index]=rec;}if(rec.source===source)return rec.tex;gl.bindTexture(gl.TEXTURE_2D,rec.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);const def=rr.model?.textureDefs?.[index];gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,def&&def.wrapWidth?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,def&&def.wrapHeight?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);rec.source=source;return rec.tex;
  }
  function updateGlReferenceGeometry(r,rr,ref,nowMs){
    const runtime=rr.runtime,model=rr.model,anim=cascEffectFrame(runtime,nowMs),off=ref.offset||{x:0,y:0,z:0},key=`${anim.seq?.name||''}|${Math.round(anim.frame*1000)}|${off.x||0}|${off.y||0}|${off.z||0}`;rr.anim=anim;if(rr.geometryKey===key)return;const nodeMatrices=buildModelNodeMatrices(model,anim.seq,anim.frame,anim.elapsedMs),gl=r.gl;for(const b of rr.batches){const a=b.positionArray,geo=b.geo;for(let vi=0,j=0;vi<(geo.vertices||[]).length;vi++){const base=geo.vertices[vi],v=skinModelVertex(model,geo,vi,nodeMatrices)||base;a[j++]=(v.x||0)+(off.x||0);a[j++]=(v.y||0)+(off.y||0);a[j++]=(v.z||0)+(off.z||0);}gl.bindBuffer(gl.ARRAY_BUFFER,b.pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,a);}rr.geometryKey=key;runtime.lastSequenceName=anim.seq?.name||'Rest';runtime.lastFrame=anim.frame;
  }
  function renderGlReferenceModel(r){
    r.referenceRendered=false;const ref=state.referenceModel;if(!r?.gl||!ref?.model||ref.visible===false||!ref.runtime?.parsed||state.photoMode)return false;const rr=initGlReferenceModel(r,ref);if(!rr)return false;updateGlReferenceGeometry(r,rr,ref,performance.now());const gl=r.gl,u=r.uni,model=rr.model,anim=rr.anim,opacity=clamp(Number(ref.opacity)||1,.08,1),entries=[],stackPolicy=referenceLayerStackPolicy(),stats={layers:0,texturedLayers:0,missingExpectedTextures:0,replaceableLayers:0,multiLayerGeosets:0,lod:modelLodSummary(model),depthFunc:stackPolicy.depthFunc};
    rr.batches.forEach(batch=>{const gi=batch.gi,mat=(model.materials||[])[batch.geo.materialId]||{id:batch.geo.materialId,layers:[]},layers=(mat.layers&&mat.layers.length)?mat.layers:[{id:0,textureId:batch.geo.textureId||mat.textureId||0,filterMode:mat.filterMode||'None',alpha:1,coordId:0,tracks:{}}];if(layers.length>1)stats.multiLayerGeosets++;layers.forEach((layer,li)=>{const ls=modelLayerState(model,mat,layer,gi,anim.seq,anim.frame,anim.elapsedMs);if(ls.alpha<=.001)return;const policy=referenceLayerPolicy(ls.mode,layer.flags||0,opacity);entries.push({batch,gi,mat,layer,li,ls,policy,priority:(mat.priorityPlane||0)*100+li});});});
    entries.sort((a,b)=>(a.policy.blend&&!a.policy.depthWrite)-(b.policy.blend&&!b.policy.depthWrite)||a.priority-b.priority);
    gl.depthFunc(gl.LEQUAL);
    for(const e of entries){const {batch,gi,mat,layer,ls,policy}=e;bindGlBatch(r,batch,layer.coordId||0);gl.uniform1i(u.u_mode,0);gl.uniform1f(u.u_alpha,ls.alpha*opacity);gl.uniform3f(u.u_color,ls.color?.[0]??1,ls.color?.[1]??1,ls.color?.[2]??1);gl.uniform1i(u.u_lit,0);gl.uniform1f(u.u_alphaCut,policy.alphaCut);const angle=ls.uvAngle||0;gl.uniform2f(u.u_uvTrans,ls.uvTrans[0],ls.uvTrans[1]);gl.uniform2f(u.u_uvScale,ls.uvScale[0],ls.uvScale[1]);gl.uniform2f(u.u_uvRot,Math.cos(angle),Math.sin(angle));const tex=uploadGlReferenceTexture(r,rr,ls.textureId),def=(model.textureDefs||[])[ls.textureId],rid=Number(def?.replaceableId||0);stats.layers++;if(tex)stats.texturedLayers++;else if(def)stats.missingExpectedTextures++;if(rid===1||rid===2)stats.replaceableLayers++;gl.uniform1i(u.u_hasTexture,!!tex);if(tex){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);}const maskInfo=teamMaskForLayer(layer),maskTex=maskInfo?uploadGlReferenceTexture(r,rr,maskInfo.textureId):null;gl.uniform1i(u.u_hasTeamMask,!!maskTex);gl.uniform1i(u.u_teamMaskChannel,maskInfo?maskInfo.channel:0);if(maskTex){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,maskTex);gl.activeTexture(gl.TEXTURE0);}if($('#modelBackfaceCulling')?.checked&&!mat.twoSided&&!layer.twoSided){gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CW);}else gl.disable(gl.CULL_FACE);applyReferenceLayerPolicy(gl,policy);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,batch.index);gl.drawElements(gl.TRIANGLES,batch.indexCount,batch.indexType,0);}
    rr.lastStats=stats;gl.depthFunc(gl.LESS);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);r.referenceRendered=true;if(!rr.logged){rr.logged=true;diag('info','Reference Model','GPU depth-buffer reference renderer active',{name:ref.name,geosets:rr.batches.length,textures:rr.runtime?.textures?.filter(Boolean).length||0,opacity,layerStack:stats});}return true;
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
    r.batches.forEach((b,i)=>{const verts=geom.vertices[i]||b.geo.vertices,a=b.positionArray;for(let vi=0,j=0;vi<verts.length;vi++){const v=verts[vi];a[j++]=v.x;a[j++]=v.y;a[j++]=v.z;}gl.bindBuffer(gl.ARRAY_BUFFER,b.pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,a);const ns=b.geo.normals||[],na=b.normalArray;if(na){for(let vi=0,j=0;vi<b.geo.vertices.length;vi++){const n=ns[vi]||{x:0,y:0,z:1};na[j++]=n.x;na[j++]=n.y;na[j++]=n.z;}gl.bindBuffer(gl.ARRAY_BUFFER,b.normal);gl.bufferSubData(gl.ARRAY_BUFFER,0,na);}});
    r.geometryKey=key; invalidatePickCache();
  }
  function teamMaskForLayer(layer){
    if(!layer)return null;
    // Combined Reforged/DE materials store team-color coverage in ORM alpha.
    // Slot 4 is the team *color* texture itself and must never be interpreted as
    // a coverage mask (doing that turns the whole material into a flat tint).
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
    drawGlWorldGrid(r);
    const display=$('#modelDisplayMode').value,selected=$('#modelGeosetSelect').value;let calls=0,tris=0;
    const entries=[];
    r.batches.forEach((batch,gi)=>{
      if(isGeosetHidden(gi))return;if(selected!=='all'&&+selected!==gi)return;
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
    gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);renderGlReferenceModel(r);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);r.drawCalls=calls;r.triangles=tris;const badge=$('#nativeRenderBadge');if(badge)badge.textContent=`GPU · ${(state.model.geosets||[]).length} geosets${r.referenceRendered?' + REF':''}`;updateRuntimeBadge('GPU');return true;
  }
  function hslToRgb(h,s,l){let r,g,b;if(s===0)r=g=b=l;else{const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;const f=t=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};r=f(h+1/3);g=f(h);b=f(h-1/3);}return[r,g,b];}

  function drawBackground(ctx, canvas){
    const g = ctx.createLinearGradient(0,0,0,canvas.height);
    g.addColorStop(0, '#1a2230');
    g.addColorStop(1, '#090c10');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  function worldGridEnabled(){
    const gridToggle=$('#modelShowGrid');
    return !state.photoMode && (!gridToggle || gridToggle.checked);
  }
  function niceWorldGridStep(target){
    const v=Math.max(1e-4,Math.abs(Number(target)||1)),power=Math.pow(10,Math.floor(Math.log10(v))),n=v/power;
    const nice=n<=1?1:n<=2?2:n<=5?5:10;
    return nice*power;
  }
  function worldGridSpec(canvas){
    const ct=cameraTransform(canvas),target=cameraTarget();
    // Keep roughly 30-40 minor cells visible, regardless of model scale/zoom.
    const viewRadius=Math.max(canvas.width,canvas.height)/(Math.max(1e-6,ct.pxScale)*2);
    const bounds=currentDisplayBounds(),reference=Math.max(1,viewRadius,(bounds&&bounds.size||1)*.55);
    const step=niceWorldGridStep(reference/10);
    const half=Math.max(step*18,reference*1.55);
    const startX=Math.floor((target.x-half)/step)*step,endX=Math.ceil((target.x+half)/step)*step;
    const startY=Math.floor((target.y-half)/step)*step,endY=Math.ceil((target.y+half)/step)*step;
    return {z:0,step,majorEvery:5,startX,endX,startY,endY};
  }
  function classifyGridLine(value,spec){
    const q=Math.round(value/spec.step),eps=Math.max(1e-5,spec.step*1e-5);
    if(Math.abs(value)<=eps)return 'axis';
    return Math.abs(q)%spec.majorEvery===0?'major':'minor';
  }
  function drawWorldGrid2D(ctx,canvas){
    if(!worldGridEnabled())return;
    const spec=worldGridSpec(canvas),groups={minor:[],major:[],axis:[]};
    for(let x=spec.startX;x<=spec.endX+spec.step*.25;x+=spec.step){
      const a=projectPoint({x,y:spec.startY,z:spec.z},canvas),b=projectPoint({x,y:spec.endY,z:spec.z},canvas);
      groups[classifyGridLine(x,spec)].push([a,b]);
    }
    for(let y=spec.startY;y<=spec.endY+spec.step*.25;y+=spec.step){
      const a=projectPoint({x:spec.startX,y,z:spec.z},canvas),b=projectPoint({x:spec.endX,y,z:spec.z},canvas);
      groups[classifyGridLine(y,spec)].push([a,b]);
    }
    const draw=(items,style,width)=>{if(!items.length)return;ctx.strokeStyle=style;ctx.lineWidth=width;ctx.beginPath();for(const [a,b] of items){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}ctx.stroke();};
    ctx.save();
    draw(groups.minor,'rgba(185,200,218,.10)',1);
    draw(groups.major,'rgba(200,214,232,.20)',1.15);
    draw(groups.axis,'rgba(255,214,112,.42)',1.45);
    ctx.restore();
  }
  function drawGlWorldGrid(r){
    if(!r||!r.gl||!worldGridEnabled())return;
    const gl=r.gl,a=r.attrib,u=r.uni,spec=worldGridSpec(r.canvas),groups={minor:[],major:[],axis:[]};
    const push=(group,a0,b0)=>{group.push(a0.x,a0.y,a0.z,b0.x,b0.y,b0.z);};
    for(let x=spec.startX;x<=spec.endX+spec.step*.25;x+=spec.step)push(groups[classifyGridLine(x,spec)],{x,y:spec.startY,z:0},{x,y:spec.endY,z:0});
    for(let y=spec.startY;y<=spec.endY+spec.step*.25;y+=spec.step)push(groups[classifyGridLine(y,spec)],{x:spec.startX,y,z:0},{x:spec.endX,y,z:0});
    if(!r.gridBuffer)r.gridBuffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,r.gridBuffer);
    gl.enableVertexAttribArray(a.pos);gl.vertexAttribPointer(a.pos,3,gl.FLOAT,false,0,0);
    gl.disableVertexAttribArray(a.normal);gl.vertexAttrib3f(a.normal,0,0,1);
    gl.disableVertexAttribArray(a.uv);gl.vertexAttrib2f(a.uv,0,0);
    gl.disableVertexAttribArray(a.boneCount);gl.vertexAttrib1f(a.boneCount,0);
    gl.uniform1i(u.u_mode,2);gl.uniform1i(u.u_hasTexture,0);gl.uniform1i(u.u_hasTeamMask,0);gl.uniform1i(u.u_lit,0);gl.uniform1f(u.u_alphaCut,0);gl.uniform3f(u.u_color,1,1,1);
    gl.uniform2f(u.u_uvTrans,0,0);gl.uniform2f(u.u_uvScale,1,1);gl.uniform2f(u.u_uvRot,1,0);
    gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.CULL_FACE);
    const draw=(arr,color,alpha)=>{if(!arr.length)return;gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.DYNAMIC_DRAW);gl.uniform3f(u.u_flatColor,color[0],color[1],color[2]);gl.uniform1f(u.u_alpha,alpha);gl.drawArrays(gl.LINES,0,arr.length/3);};
    draw(groups.minor,[.56,.62,.70],.20);
    draw(groups.major,[.70,.76,.84],.32);
    draw(groups.axis,[1.0,.78,.28],.58);
    gl.disable(gl.BLEND);gl.depthMask(true);
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
    return `${frame}|${skin?1:0}|${mode}|g${state.geometryRevision}`;
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
      if(isGeosetHidden(gi)||geosetRenderState(gi).alpha<=0.001) return;
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
      if(isGeosetHidden(geoIndex)) return;if(selected !== 'all' && +selected !== geoIndex) return;
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
    if(!['effects','particles'].includes(state.activePropPanel)||!state.model){el.hidden=true;return;}
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


  function drawCascEffectEmitter2(ctx,canvas,n,worldMatrix,runtime,anim,nowMs,opacity=1){
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
      if(tex&&tex.width&&tex.height){const frame=fxEmitterFrame(n,t),cw=tex.width/cols,ch=tex.height/rows,sx=(frame%cols)*cw,sy=Math.floor(frame/cols)*ch;ctx.globalAlpha=alpha*opacity;try{ctx.drawImage(tex,sx,sy,cw,ch,p.x-size*.5,p.y-size*.5,size,size);}catch(_){drawFallbackParticle(ctx,p,size,color,alpha*opacity);}}
      else{ctx.globalAlpha=1;drawFallbackParticle(ctx,p,size,color,alpha*opacity);}
    }
    ctx.globalCompositeOperation=oldComp;ctx.globalAlpha=oldAlpha;ctx.imageSmoothingEnabled=oldSmooth;
  }

  function drawCascEffectModel(ctx,canvas,hostNode,hostMatrix,runtime,nowMs,options={}){
    if(!runtime||!runtime.parsed)return false;
    const opacity=clamp(Number(options.opacity==null?1:options.opacity),0,1),drawMeshes=options.meshes!==false,drawEmitters=options.emitters!==false;
    const model=runtime.parsed,anim=cascEffectFrame(runtime,nowMs),nodeMatrices=buildModelNodeMatrices(model,anim.seq,anim.frame,anim.elapsedMs),anchor=effectAnchorMatrix(hostMatrix,hostNode.pivot||{x:0,y:0,z:0});
    const tris=[],geosets=modelRenderableGeosetEntries(model),maxFaces=performanceMode()==='quality'?16000:7000;let faceBudget=maxFaces;
    if(drawMeshes)for(let vi=0;vi<geosets.length&&faceBudget>0;vi++){
      const ge=geosets[vi],geo=ge.geo,gi=ge.index,mat=(model.materials||[])[geo.materialId]||{id:geo.materialId,layers:[]},layers=(mat.layers&&mat.layers.length)?mat.layers:[{id:0,textureId:geo.textureId||mat.textureId||0,filterMode:mat.filterMode||'None',alpha:1,tracks:{}}];
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
    for(const tri of tris){const [p0,p1,p2]=tri.p,tex=tri.tex;ctx.save();ctx.globalAlpha=tri.alpha*opacity;ctx.globalCompositeOperation=tri.composite||'source-over';if(tex&&tex.width&&tex.height){const [u0,u1,u2]=tri.uv,s0={x:u0.u*(tex.width-1),y:u0.v*(tex.height-1)},s1={x:u1.u*(tex.width-1),y:u1.v*(tex.height-1)},s2={x:u2.u*(tex.width-1),y:u2.v*(tex.height-1)};drawTexturedTriangle(ctx,tex,s0,s1,s2,p0,p1,p2);}else{ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.closePath();ctx.fillStyle=`rgba(${Math.round((tri.color[0]||1)*255)},${Math.round((tri.color[1]||1)*255)},${Math.round((tri.color[2]||1)*255)},.75)`;ctx.fill();}ctx.restore();}
    if(drawEmitters)for(const emitter of model.particleEmitters2||[]){const local=nodeMatrices.get(emitter.id)||matIdentity(),world=matMul(anchor,local);drawCascEffectEmitter2(ctx,canvas,emitter,world,runtime,anim,nowMs,opacity);}
    runtime.lastSequenceName=anim.seq&&anim.seq.name||'Rest';runtime.lastFrame=anim.frame;return tris.length>0||(drawEmitters&&(model.particleEmitters2||[]).length>0);
  }


  function modelPrimaryLod(model){
    const geosets=(model&&model.geosets)||[],lods=[];
    for(const geo of geosets){
      const lod=Number(geo&&geo.lod);
      if(Number.isFinite(lod)&&lod>=0)lods.push(lod|0);
    }
    if(!lods.length)return -1;
    if(lods.includes(0))return 0;
    return Math.min(...lods);
  }
  function modelRenderableGeosetEntries(model){
    const geosets=(model&&model.geosets)||[],primary=modelPrimaryLod(model);
    const entries=[];
    for(let index=0;index<geosets.length;index++){
      const geo=geosets[index],raw=Number(geo&&geo.lod);
      const lod=Number.isFinite(raw)?raw|0:-1;
      // Reforged/DE store alternate LOD meshes as extra geosets. They are not
      // additive geometry. Warcraft renders the default/no-LOD geosets together
      // with the primary LOD only; drawing every LOD simultaneously produces the
      // oversized/jagged blob that HD/DE showed in the CASC viewer.
      if(lod<0||primary<0||lod===primary)entries.push({geo,index,lod});
    }
    // Malformed/custom assets sometimes contain only unusual positive LODs.
    // modelPrimaryLod() already chooses the smallest one, but never blank the
    // viewer if a parser/client hands us inconsistent metadata.
    if(!entries.length){
      for(let index=0;index<geosets.length;index++)entries.push({geo:geosets[index],index,lod:Number(geosets[index]?.lod)||-1});
    }
    return entries;
  }
  function modelLodSummary(model){
    const all=(model&&model.geosets)||[],visible=modelRenderableGeosetEntries(model),primary=modelPrimaryLod(model);
    return{total:all.length,rendered:visible.length,skipped:Math.max(0,all.length-visible.length),primary};
  }
  function renderableModelBounds(model){
    const entries=modelRenderableGeosetEntries(model);
    if(entries.length)return computeBounds(entries.map(x=>x.geo));
    return rawModelBounds(model);
  }

  function hdMaterialInfo(model,mat,preferredLayer=null){
    const layers=(mat&&mat.layers)||[],shader=String(mat&&mat.shader||'');
    const combined=preferredLayer&&((preferredLayer.isHdCombined===true)||Number(preferredLayer.shaderTypeId)===1||Number(preferredLayer.slotTableUnknown)===1)
      ? preferredLayer
      : layers.find(layer=>layer&&((layer.isHdCombined===true)||Number(layer.shaderTypeId)===1||Number(layer.slotTableUnknown)===1));
    if(combined){
      const slots=combined.textureSlots||{};
      const pick=(slot,fallback=-1)=>Number.isInteger(Number(slots[slot]))?Number(slots[slot]):fallback;
      return{isHd:true,combined:true,baseLayer:combined,slots:{diffuse:pick(0,Number(combined.textureId)),normal:pick(1,Number(combined.normalTextureId)),orm:pick(2,Number(combined.ormTextureId)),emissive:pick(3,Number(combined.emissiveTextureId)),team:pick(4,Number(combined.teamColorTextureId)),reflections:pick(5,Number(combined.reflectionsTextureId))}};
    }
    // Reforged 900/1000 used the material shader string and six ordinal layers.
    if(/^Shader_HD_DefaultUnit$/i.test(shader)&&layers.length){
      const tid=i=>Number.isInteger(Number(layers[i]?.textureId))?Number(layers[i].textureId):-1;
      return{isHd:true,combined:false,baseLayer:layers[0],slots:{diffuse:tid(0),normal:tid(1),orm:tid(2),emissive:tid(3),team:tid(4),reflections:tid(5)}};
    }
    return null;
  }
  function hdMaterialSample(base=[.58,.61,.66,1],orm=[1,.5,0,0],team=[1,0,0,1],emissive=[0,0,0,1],normal=[.5,.5,1,1],emissiveGain=1){
    const mask=clamp(Number(orm[3])||0,0,1),ao=clamp(Number(orm[0])||1,.12,1),rough=clamp(Number(orm[1])||.5,0,1),metal=clamp(Number(orm[2])||0,0,1);
    const nx=(Number(normal[0])||.5)*2-1,ny=(Number(normal[1])||.5)*2-1,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny)),light=Math.max(.18,nx*.24+ny*.38+nz*.89);
    const out=[0,0,0];for(let i=0;i<3;i++){const tc=(1-mask)+clamp(Number(team[i])||0,0,1)*mask,diff=(Number(base[i])||0)*tc,lit=diff*(.30+.70*light)*(.42+.58*ao),spec=(.04+.22*metal)*(1-rough)*Math.pow(light,5);out[i]=clamp(lit+spec+(Number(emissive[i])||0)*Math.max(0,Number(emissiveGain)||1),0,4);}return[out[0],out[1],out[2],clamp(Number(base[3])||1,0,1)];
  }
  function clearAssetPreviewGlRenderer(r){
    if(!r?.gl)return;const gl=r.gl;
    for(const b of r.batches||[]){if(b.pos)gl.deleteBuffer(b.pos);if(b.normal)gl.deleteBuffer(b.normal);if(b.index)gl.deleteBuffer(b.index);for(const u of b.uv||[])if(u)gl.deleteBuffer(u);}
    for(const t of r.textures||[])if(t?.tex)gl.deleteTexture(t.tex);
    r.batches=[];r.textures=[];r.model=null;r.runtime=null;r.geometryKey='';r.logged=false;r.lastStats=null;
  }
  function ensureAssetPreviewGlRenderer(canvas){
    if(!canvas)return null;let r=assetPreviewGlRenderers.get(canvas);if(r)return r;
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,premultipliedAlpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});if(!gl){assetPreviewGlRenderers.set(canvas,{canvas,gl:null,failed:true});return assetPreviewGlRenderers.get(canvas);}
    const vs=`#version 300 es
      precision highp float;
      in vec3 a_position; in vec3 a_normal; in vec2 a_uv;
      uniform vec2 u_uvTrans; uniform vec2 u_uvScale; uniform vec2 u_uvRot;
      out vec2 v_uv; out vec3 v_normal;
      void main(){
        gl_Position=vec4(a_position,1.0);
        vec2 uv=(a_uv-0.5)*u_uvScale;
        uv=vec2(uv.x*u_uvRot.x-uv.y*u_uvRot.y,uv.x*u_uvRot.y+uv.y*u_uvRot.x)+0.5+u_uvTrans;
        v_uv=uv;v_normal=normalize(a_normal);
      }`;
    const fs=`#version 300 es
      precision highp float;
      uniform sampler2D u_tex; uniform sampler2D u_normalTex; uniform sampler2D u_ormTex; uniform sampler2D u_emissiveTex; uniform sampler2D u_teamTex; uniform sampler2D u_reflectionTex;
      uniform bool u_hasTexture; uniform bool u_hasNormal; uniform bool u_hasOrm; uniform bool u_hasEmissive; uniform bool u_hasTeam; uniform bool u_hasReflection; uniform bool u_hd;
      uniform float u_alpha; uniform float u_alphaCut; uniform float u_emissiveGain; uniform vec3 u_color; uniform vec3 u_teamColor;
      in vec2 v_uv; in vec3 v_normal; out vec4 outColor;
      void main(){
        vec4 base=u_hasTexture?texture(u_tex,v_uv):vec4(0.58,0.61,0.66,1.0);
        vec4 c=base;
        if(u_hd){
          vec4 orm=u_hasOrm?texture(u_ormTex,v_uv):vec4(1.0,0.5,0.0,0.0);
          vec3 tc=u_hasTeam?texture(u_teamTex,v_uv).rgb:u_teamColor;
          float teamMask=clamp(orm.a,0.0,1.0);
          vec3 n=normalize(v_normal);
          if(u_hasNormal){vec2 xy=texture(u_normalTex,v_uv).rg*2.0-1.0;float zz=sqrt(max(0.0,1.0-dot(xy,xy)));n=normalize(vec3(xy,zz));}
          vec3 lightDir=normalize(vec3(0.24,0.38,0.89));float lam=max(0.18,dot(n,lightDir));
          float ao=clamp(orm.r,0.12,1.0),rough=clamp(orm.g,0.0,1.0),metal=clamp(orm.b,0.0,1.0);
          vec3 rgb=base.rgb*mix(vec3(1.0),tc,teamMask);rgb*=mix(0.30,1.0,lam)*mix(0.42,1.0,ao);
          float spec=(0.04+0.22*metal)*(1.0-rough)*pow(lam,5.0);rgb+=vec3(spec);
          if(u_hasReflection){vec3 env=texture(u_reflectionTex,v_uv).rgb;rgb+=env*metal*(1.0-rough)*0.08;}
          if(u_hasEmissive)rgb+=texture(u_emissiveTex,v_uv).rgb*max(0.0,u_emissiveGain);
          c=vec4(rgb,base.a);
        }
        c.rgb*=u_color;c.a*=u_alpha;
        if(u_alphaCut>0.0&&c.a<u_alphaCut)discard;
        outColor=c;
      }`;
    let program;try{program=createGlProgram(gl,vs,fs);}catch(e){diag('warn','Unit / Effect Viewer','WebGL preview shader failed',{error:String(e)});assetPreviewGlRenderers.set(canvas,{canvas,gl:null,failed:true,error:e});return assetPreviewGlRenderers.get(canvas);}
    const attrib={pos:gl.getAttribLocation(program,'a_position'),normal:gl.getAttribLocation(program,'a_normal'),uv:gl.getAttribLocation(program,'a_uv')},uni={};
    ['u_uvTrans','u_uvScale','u_uvRot','u_tex','u_normalTex','u_ormTex','u_emissiveTex','u_teamTex','u_reflectionTex','u_hasTexture','u_hasNormal','u_hasOrm','u_hasEmissive','u_hasTeam','u_hasReflection','u_hd','u_alpha','u_alphaCut','u_emissiveGain','u_color','u_teamColor'].forEach(n=>uni[n]=gl.getUniformLocation(program,n));
    r={canvas,gl,program,attrib,uni,model:null,runtime:null,batches:[],textures:[],geometryKey:'',logged:false,lastStats:null};assetPreviewGlRenderers.set(canvas,r);return r;
  }
  function initAssetPreviewGlModel(r,runtime){
    if(!r?.gl||!runtime?.parsed)return null;const model=runtime.parsed;if(r.model===model&&r.runtime===runtime)return r;clearAssetPreviewGlRenderer(r);r.model=model;r.runtime=runtime;const gl=r.gl;
    r.batches=modelRenderableGeosetEntries(model).map(({geo,index:gi,lod})=>{const pos=gl.createBuffer(),normal=gl.createBuffer(),index=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pos);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array((geo.vertices||[]).length*3),gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,normal);gl.bufferData(gl.ARRAY_BUFFER,makeNormals(geo),gl.STATIC_DRAW);const flat=[];let maxIndex=0;for(const f of geo.faces||geo.triangles||[]){const ids=Array.isArray(f)?f:[f?.a,f?.b,f?.c];if(!ids||ids.length<3)continue;flat.push(ids[0],ids[1],ids[2]);maxIndex=Math.max(maxIndex,ids[0],ids[1],ids[2]);}const use32=maxIndex>65535,idx=use32?new Uint32Array(flat):new Uint16Array(flat);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);const uv=[];for(let si=0;si<Math.max(1,(geo.uvSets||[]).length);si++){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,makeUv(geo,si),gl.STATIC_DRAW);uv.push(b);}return{geo,gi,lod,pos,normal,index,uv,indexCount:idx.length,indexType:use32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,positionArray:new Float32Array((geo.vertices||[]).length*3)};});return r;
  }
  function uploadAssetPreviewGlTexture(r,index){
    const gl=r.gl,source=r.runtime?.textures?.[index];if(!source)return null;let rec=r.textures[index];if(!rec){rec={tex:gl.createTexture(),source:null};r.textures[index]=rec;}if(rec.source===source)return rec.tex;gl.bindTexture(gl.TEXTURE_2D,rec.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);const def=r.model?.textureDefs?.[index];gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,def?.wrapWidth?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,def?.wrapHeight?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);rec.source=source;return rec.tex;
  }
  function updateAssetPreviewGlGeometry(r,nowMs,view={}){
    const runtime=r.runtime,model=r.model,anim=cascEffectFrame(runtime,nowMs),yaw=Number.isFinite(+view.yaw)?+view.yaw:.72,pitch=Number.isFinite(+view.pitch)?+view.pitch:.32,zoom=clamp(Number.isFinite(+view.zoom)?+view.zoom:1,.25,6),panX=(Number.isFinite(+view.panX)?+view.panX:0)*r.canvas.width,panY=(Number.isFinite(+view.panY)?+view.panY:0)*r.canvas.height,key=`${canvasSizeKey(r.canvas)}|${anim.seq?.name||''}|${Math.round(anim.frame*1000)}|${yaw.toFixed(4)}|${pitch.toFixed(4)}|${zoom.toFixed(4)}|${panX.toFixed(2)}|${panY.toFixed(2)}`;r.anim=anim;if(r.geometryKey===key)return;const matrices=buildModelNodeMatrices(model,anim.seq,anim.frame,anim.elapsedMs),b=renderableModelBounds(model),center=b.center||{x:0,y:0,z:0},size=Math.max(1,b.size||1),cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),px=Math.min(r.canvas.width,r.canvas.height)*.72/size*zoom,halfW=Math.max(1,r.canvas.width*.5),halfH=Math.max(1,r.canvas.height*.5),gl=r.gl;
    for(const batch of r.batches){const a=batch.positionArray,geo=batch.geo;for(let vi=0,j=0;vi<(geo.vertices||[]).length;vi++){const v=skinModelVertex(model,geo,vi,matrices)||geo.vertices[vi]||{x:0,y:0,z:0},dx=(v.x||0)-center.x,dy=(v.y||0)-center.y,dz=(v.z||0)-center.z,rx=dx*cy-dy*sy,ry=dx*sy+dy*cy,vy=dz*cp-ry*sp,dep=ry*cp+dz*sp;a[j++]=(rx*px+panX)/halfW;a[j++]=(vy*px-panY)/halfH;a[j++]=clamp(-dep/(size*2),-.98,.98);}gl.bindBuffer(gl.ARRAY_BUFFER,batch.pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,a);}r.geometryKey=key;runtime.lastSequenceName=anim.seq?.name||'Rest';runtime.lastFrame=anim.frame;
  }
  function canvasSizeKey(canvas){return `${canvas?.width||0}x${canvas?.height||0}`;}
  function bindAssetPreviewBatch(r,batch,uvSet=0){const gl=r.gl,a=r.attrib;gl.bindBuffer(gl.ARRAY_BUFFER,batch.pos);gl.enableVertexAttribArray(a.pos);gl.vertexAttribPointer(a.pos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,batch.normal);gl.enableVertexAttribArray(a.normal);gl.vertexAttribPointer(a.normal,3,gl.FLOAT,false,0,0);const uv=batch.uv[Math.max(0,Math.min(batch.uv.length-1,uvSet|0))]||batch.uv[0];gl.bindBuffer(gl.ARRAY_BUFFER,uv);gl.enableVertexAttribArray(a.uv);gl.vertexAttribPointer(a.uv,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,batch.index);}
  function renderRuntimeAssetPreviewGl(canvas,runtime,nowMs=performance.now(),view={}){
    if(!canvas||!runtime?.parsed)return false;const r=ensureAssetPreviewGlRenderer(canvas);if(!r?.gl)return false;initAssetPreviewGlModel(r,runtime);updateAssetPreviewGlGeometry(r,nowMs,view);const gl=r.gl,u=r.uni,model=r.model,anim=r.anim,entries=[],stack=referenceLayerStackPolicy(),stats={layers:0,texturedLayers:0,missingExpectedTextures:0,replaceableLayers:0,multiLayerGeosets:0,hdMaterials:0,hdPasses:0,pbrTexturesBound:0,lod:modelLodSummary(model),depthFunc:stack.depthFunc,gpuDepth:true};
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(9/255,15/255,21/255,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(r.program);gl.disable(gl.CULL_FACE);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);const tc=hexRgb01(teamColorInfo().hex);gl.uniform3f(u.u_teamColor,tc[0],tc[1],tc[2]);
    r.batches.forEach(batch=>{const gi=batch.gi,mat=(model.materials||[])[batch.geo.materialId]||{id:batch.geo.materialId,layers:[]},layers=(mat.layers&&mat.layers.length)?mat.layers:[{id:0,textureId:batch.geo.textureId||mat.textureId||0,filterMode:mat.filterMode||'None',alpha:1,coordId:0,tracks:{}}],hd=hdMaterialInfo(model,mat);if(hd){const layer=hd.baseLayer||layers[0],ls=modelLayerState(model,mat,layer,gi,anim.seq,anim.frame,anim.elapsedMs);if(ls.alpha>.001){entries.push({batch,gi,mat,layer,li:0,ls,hd,policy:referenceLayerPolicy(ls.mode,layer.flags||0,1),priority:(mat.priorityPlane||0)*100});stats.hdMaterials++;}return;}if(layers.length>1)stats.multiLayerGeosets++;for(let li=0;li<layers.length;li++){const layer=layers[li],ls=modelLayerState(model,mat,layer,gi,anim.seq,anim.frame,anim.elapsedMs);if(ls.alpha<=.001)continue;entries.push({batch,gi,mat,layer,li,ls,hd:null,policy:referenceLayerPolicy(ls.mode,layer.flags||0,1),priority:(mat.priorityPlane||0)*100+li});}});
    entries.sort((a,b)=>(a.policy.blend&&!a.policy.depthWrite)-(b.policy.blend&&!b.policy.depthWrite)||a.priority-b.priority);
    const bindTex=(unit,uniform,index,hasUniform)=>{const tex=Number.isInteger(index)&&index>=0?uploadAssetPreviewGlTexture(r,index):null;if(hasUniform)gl.uniform1i(hasUniform,!!tex);if(tex){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(uniform,unit);}return tex;};
    for(const e of entries){const {batch,layer,ls,policy,hd}=e;bindAssetPreviewBatch(r,batch,layer.coordId||0);gl.uniform1f(u.u_alpha,ls.alpha);gl.uniform1f(u.u_alphaCut,policy.alphaCut);gl.uniform1f(u.u_emissiveGain,Number.isFinite(+layer.emissiveGain)?Math.max(0,+layer.emissiveGain):1);gl.uniform3f(u.u_color,ls.color?.[0]??1,ls.color?.[1]??1,ls.color?.[2]??1);const angle=ls.uvAngle||0;gl.uniform2f(u.u_uvTrans,ls.uvTrans[0],ls.uvTrans[1]);gl.uniform2f(u.u_uvScale,ls.uvScale[0],ls.uvScale[1]);gl.uniform2f(u.u_uvRot,Math.cos(angle),Math.sin(angle));gl.uniform1i(u.u_hd,!!hd);
      let diffuseId=ls.textureId,normalId=-1,ormId=-1,emissiveId=-1,teamId=-1,reflectionsId=-1;if(hd){diffuseId=hd.slots.diffuse;normalId=hd.slots.normal;ormId=hd.slots.orm;emissiveId=hd.slots.emissive;teamId=hd.slots.team;reflectionsId=hd.slots.reflections;stats.hdPasses++;}
      const tex=bindTex(0,u.u_tex,diffuseId,u.u_hasTexture),normal=bindTex(1,u.u_normalTex,normalId,u.u_hasNormal),orm=bindTex(2,u.u_ormTex,ormId,u.u_hasOrm),emissive=bindTex(3,u.u_emissiveTex,emissiveId,u.u_hasEmissive),team=bindTex(4,u.u_teamTex,teamId,u.u_hasTeam),reflection=bindTex(5,u.u_reflectionTex,reflectionsId,u.u_hasReflection);gl.activeTexture(gl.TEXTURE0);
      stats.layers++;if(tex)stats.texturedLayers++;else{const def=(model.textureDefs||[])[diffuseId];if(def)stats.missingExpectedTextures++;}const def=(model.textureDefs||[])[diffuseId],rid=Number(def?.replaceableId||0);if(rid===1||rid===2)stats.replaceableLayers++;if(hd)stats.pbrTexturesBound+=[tex,normal,orm,emissive,team,reflection].filter(Boolean).length;applyReferenceLayerPolicy(gl,policy);gl.drawElements(gl.TRIANGLES,batch.indexCount,batch.indexType,0);}
    gl.depthFunc(gl.LESS);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);r.lastStats=stats;runtime.previewGpuDepthRendered=true;runtime.previewLayerStats=stats;if(!r.logged){r.logged=true;diag('info','Unit / Effect Viewer','GPU depth-buffer preview renderer active',{model:runtime.path||model.sourceName||'',geosets:r.batches.length,textures:(runtime.textures||[]).filter(Boolean).length,layerStack:stats});}return true;
  }
  function drawRuntimeAssetPreviewOverlay(canvas,runtime,nowMs=performance.now(),view={}){
    if(!canvas||!runtime?.parsed)return false;const ctx=canvas.getContext('2d'),model=runtime.parsed,anim=cascEffectFrame(runtime,nowMs),nodeMatrices=buildModelNodeMatrices(model,anim.seq,anim.frame,anim.elapsedMs),b=renderableModelBounds(model),center=b.center||{x:0,y:0,z:0},size=Math.max(1,b.size||1),yaw=Number.isFinite(+view.yaw)?+view.yaw:.72,pitch=Number.isFinite(+view.pitch)?+view.pitch:.32,zoom=clamp(Number.isFinite(+view.zoom)?+view.zoom:1,.25,6),panX=(Number.isFinite(+view.panX)?+view.panX:0)*canvas.width,panY=(Number.isFinite(+view.panY)?+view.panY:0)*canvas.height,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),scale=Math.min(canvas.width,canvas.height)*.72/size*zoom,project=v=>{const dx=(v.x||0)-center.x,dy=(v.y||0)-center.y,dz=(v.z||0)-center.z,rx=dx*cy-dy*sy,ry=dx*sy+dy*cy,vy=dz*cp-ry*sp;return{x:canvas.width/2+panX+rx*scale,y:canvas.height/2+panY-vy*scale};};ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const n of model.particleEmitters2||[]){const local=nodeMatrices.get(n.id)||matIdentity(),origin=matPoint(local,n.pivot||{x:0,y:0,z:0}),tex=runtime.textures?.[n.textureId]||null,life=Math.max(.12,+n.lifeSpan||1),rate=Math.max(1,Math.min(60,+n.emissionRate||8)),count=Math.max(4,Math.min(18,Math.ceil(rate*life*.12))),speed=Math.max(-200,Math.min(200,+n.speed||20)),gravity=Math.max(-240,Math.min(240,+n.gravity||0)),rows=Math.max(1,n.rows|0),cols=Math.max(1,n.columns|0),sim=Math.max(0,anim.elapsedMs/1000);for(let i=0;i<count;i++){const seed=(n.id+1)*117+i*23.7,age=fxFrac(sim/life+i/count+fxRand(seed)*.4)*life,t=age/life,q=project({x:origin.x+(fxRand(seed+3)-.5)*(+n.width||12),y:origin.y+(fxRand(seed+6)-.5)*(+n.length||12),z:origin.z+speed*age*.16-.5*gravity*age*age*.018}),sz=Math.max(2,Math.min(30,Math.max(.03,fxSegmentValue(n.segmentScaling||[.25,.4,.1],t,n.timeMiddle))*scale*5)),a=clamp(fxSegmentValue((n.segmentAlphas||[255,180,0]).map(v=>v/255),t,n.timeMiddle),0,1);if(tex&&tex.width&&tex.height){const frame=fxEmitterFrame(n,t),cw=tex.width/cols,ch=tex.height/rows,sx=(frame%cols)*cw,sy=Math.floor(frame/cols)*ch;ctx.save();ctx.globalCompositeOperation=particleCompositeMode(n);ctx.globalAlpha=a;const sprite=particleSpriteTexture(n,tex);ctx.drawImage(sprite,sx,sy,cw,ch,q.x-sz/2,q.y-sz/2,sz,sz);ctx.restore();}}}
    const lod=modelLodSummary(model),geoLabel=lod.skipped?`${lod.rendered}/${lod.total} geosets · LOD ${lod.primary}`:`${lod.total} geosets`;ctx.save();ctx.fillStyle='rgba(235,242,248,.92)';ctx.font='11px system-ui,sans-serif';ctx.textAlign='left';ctx.fillText(`${geoLabel} · ${(model.nodes||[]).length} nodes · ${runtime.textures?.filter(Boolean).length||0}/${runtime.textures?.length||0} textures · ${anim.seq?.name||'Rest'}`,10,18);ctx.restore();return true;
  }
  function drawRuntimeAssetPreview2D(canvas,runtime,nowMs=performance.now(),view={}){
    if(!canvas||!runtime||!runtime.parsed)return false;const ctx=canvas.getContext('2d'),model=runtime.parsed,anim=cascEffectFrame(runtime,nowMs),nodeMatrices=buildModelNodeMatrices(model,anim.seq,anim.frame,anim.elapsedMs),b=renderableModelBounds(model),center=b.center||{x:0,y:0,z:0},size=Math.max(1,b.size||1),yaw=Number.isFinite(+view.yaw)?+view.yaw:.72,pitch=Number.isFinite(+view.pitch)?+view.pitch:.32,zoom=clamp(Number.isFinite(+view.zoom)?+view.zoom:1,.25,6),panX=(Number.isFinite(+view.panX)?+view.panX:0)*canvas.width,panY=(Number.isFinite(+view.panY)?+view.panY:0)*canvas.height,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),scale=Math.min(canvas.width,canvas.height)*.72/size*zoom;
    const project=v=>{const dx=(v.x||0)-center.x,dy=(v.y||0)-center.y,dz=(v.z||0)-center.z,rx=dx*cy-dy*sy,ry=dx*sy+dy*cy,vy=dz*cp-ry*sp,dep=ry*cp+dz*sp;return{x:canvas.width/2+panX+rx*scale,y:canvas.height/2+panY-vy*scale,z:dep};};
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#090f15';ctx.fillRect(0,0,canvas.width,canvas.height);const tris=[];let budget=9000;
    for(const ge of modelRenderableGeosetEntries(model)){if(budget<=0)break;const gi=ge.index;
      const geo=ge.geo,mat=(model.materials||[])[geo.materialId]||{id:geo.materialId,layers:[]},layers=(mat.layers&&mat.layers.length)?mat.layers:[{id:0,textureId:geo.textureId||mat.textureId||0,filterMode:mat.filterMode||'None',alpha:1,tracks:{}}],states=layers.map(layer=>({layer,ls:modelLayerState(model,mat,layer,gi,anim.seq,anim.frame,anim.elapsedMs)}));if(!states.some(x=>x.ls.alpha>.001))continue;
      const world=(geo.vertices||[]).map((v,vi)=>skinModelVertex(model,geo,vi,nodeMatrices)||v),pv=world.map(project),faces=geo.faces||geo.triangles||[];
      for(const face of faces){if(--budget<0)break;const ids=Array.isArray(face)?face:[face?.a,face?.b,face?.c],p0=pv[ids?.[0]],p1=pv[ids?.[1]],p2=pv[ids?.[2]];if(!p0||!p1||!p2||Math.abs(signedArea2(p0,p1,p2))<.03)continue;states.forEach(({layer,ls},li)=>{if(ls.alpha<=.001)return;const uvSet=(geo.uvSets&&geo.uvSets[layer.coordId||0])||(geo.uvSets&&geo.uvSets[0])||geo.tverts||[],uv=[uvSet[ids[0]]||{u:0,v:0},uvSet[ids[1]]||{u:1,v:0},uvSet[ids[2]]||{u:1,v:1}].map(u=>transformUv(u,ls));tris.push({p:[p0,p1,p2],uv,tex:runtime.textures?.[ls.textureId]||null,alpha:ls.alpha,color:ls.color||[1,1,1],composite:ls.composite,priority:(mat.priorityPlane||0)*100+li,z:(p0.z+p1.z+p2.z)/3});});}
    }
    tris.sort((a,b)=>a.priority-b.priority||a.z-b.z);for(const tri of tris){const [p0,p1,p2]=tri.p,tex=tri.tex;ctx.save();ctx.globalAlpha=tri.alpha;ctx.globalCompositeOperation=tri.composite||'source-over';if(tex&&tex.width&&tex.height){const [u0,u1,u2]=tri.uv,s0={x:u0.u*(tex.width-1),y:u0.v*(tex.height-1)},s1={x:u1.u*(tex.width-1),y:u1.v*(tex.height-1)},s2={x:u2.u*(tex.width-1),y:u2.v*(tex.height-1)};drawTexturedTriangle(ctx,tex,s0,s1,s2,p0,p1,p2);}else{ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.closePath();ctx.fillStyle=`rgb(${Math.round((tri.color[0]||1)*190)},${Math.round((tri.color[1]||1)*200)},${Math.round((tri.color[2]||1)*215)})`;ctx.fill();}ctx.restore();}
    for(const n of model.particleEmitters2||[]){const local=nodeMatrices.get(n.id)||matIdentity(),origin=matPoint(local,n.pivot||{x:0,y:0,z:0}),tex=runtime.textures?.[n.textureId]||null,life=Math.max(.12,+n.lifeSpan||1),rate=Math.max(1,Math.min(60,+n.emissionRate||8)),count=Math.max(4,Math.min(18,Math.ceil(rate*life*.12))),speed=Math.max(-200,Math.min(200,+n.speed||20)),gravity=Math.max(-240,Math.min(240,+n.gravity||0)),rows=Math.max(1,n.rows|0),cols=Math.max(1,n.columns|0),sim=Math.max(0,anim.elapsedMs/1000);for(let i=0;i<count;i++){const seed=(n.id+1)*117+i*23.7,age=fxFrac(sim/life+i/count+fxRand(seed)*.4)*life,t=age/life,q=project({x:origin.x+(fxRand(seed+3)-.5)*(+n.width||12),y:origin.y+(fxRand(seed+6)-.5)*(+n.length||12),z:origin.z+speed*age*.16-.5*gravity*age*age*.018}),sz=Math.max(2,Math.min(30,Math.max(.03,fxSegmentValue(n.segmentScaling||[.25,.4,.1],t,n.timeMiddle))*scale*5)),a=clamp(fxSegmentValue((n.segmentAlphas||[255,180,0]).map(v=>v/255),t,n.timeMiddle),0,1);if(tex&&tex.width&&tex.height){const frame=fxEmitterFrame(n,t),cw=tex.width/cols,ch=tex.height/rows,sx=(frame%cols)*cw,sy=Math.floor(frame/cols)*ch;ctx.save();ctx.globalCompositeOperation=particleCompositeMode(n);ctx.globalAlpha=a;const sprite=particleSpriteTexture(n,tex);ctx.drawImage(sprite,sx,sy,cw,ch,q.x-sz/2,q.y-sz/2,sz,sz);ctx.restore();}}
    }
    const lod=modelLodSummary(model),geoLabel=lod.skipped?`${lod.rendered}/${lod.total} geosets · LOD ${lod.primary}`:`${lod.total} geosets`;ctx.save();ctx.fillStyle='rgba(235,242,248,.92)';ctx.font='11px system-ui,sans-serif';ctx.textAlign='left';ctx.fillText(`${geoLabel} · ${(model.nodes||[]).length} nodes · ${runtime.textures?.filter(Boolean).length||0}/${runtime.textures?.length||0} textures · ${anim.seq?.name||'Rest'}`,10,18);ctx.restore();runtime.lastSequenceName=anim.seq&&anim.seq.name||'Rest';runtime.lastFrame=anim.frame;return true;
  }
  function drawRuntimeAssetPreview(glCanvas,overlayCanvas,runtime,nowMs=performance.now(),view={}){
    if(renderRuntimeAssetPreviewGl(glCanvas,runtime,nowMs,view)){drawRuntimeAssetPreviewOverlay(overlayCanvas,runtime,nowMs,view);return true;}
    if(runtime){runtime.previewGpuDepthRendered=false;runtime.previewLayerStats=null;}
    return drawRuntimeAssetPreview2D(overlayCanvas||glCanvas,runtime,nowMs,view);
  }

  function particleHeartbeatSignature(stats){
    const c=stats?.canvas||{};
    return [String(stats?.model||''),Number(stats?.particleEmitters2||0),Number(stats?.decodedCascTextures||0),Number(stats?.withTexture||0),Number(stats?.fallback||0),Number(c.width||0),Number(c.height||0),String(stats?.performanceMode||'')].join('|');
  }
  function particleHeartbeatDecision(stats,now=performance.now(),lastSignature='',lastAt=0,keepaliveMs=60000){
    const signature=particleHeartbeatSignature(stats),changed=signature!==String(lastSignature||''),keepalive=Number(now)-Number(lastAt||0)>=Math.max(1000,Number(keepaliveMs)||60000);
    return{log:changed||keepalive,signature,changed,keepalive};
  }
  function particleHeartbeatStats(canvas,effects){
    const p2=(effects||[]).filter(n=>n.type==='ParticleEmitter2');let withTexture=0;
    for(const n of p2)if(getEmitterTextureCanvas(n))withTexture++;
    return{model:state.model?.sourceName||state.model?.displayName||state.model?.name||'',particleEmitters2:p2.length,decodedCascTextures:[...new Set(state.casc.effectTextures.values())].length,withTexture,fallback:Math.max(0,p2.length-withTexture),canvas:{width:canvas?.width||0,height:canvas?.height||0},performanceMode:performanceMode()};
  }
  function maybeLogParticleHeartbeat(canvas,effects,now=performance.now()){
    if(!state.fxPreviewMode)return false;
    if(now-(state.fxLastStatsCheck||0)<5000)return false;
    state.fxLastStatsCheck=now;
    const stats=particleHeartbeatStats(canvas,effects),decision=particleHeartbeatDecision(stats,now,state.fxLastStatsSignature,state.fxLastStatsLog,60000);
    if(!decision.log)return false;
    state.fxLastStatsLog=now;state.fxLastStatsSignature=decision.signature;
    diag('debug','FX Renderer','Particle render heartbeat',{...stats,reason:decision.changed?'changed':'keepalive'});
    return true;
  }

  function drawEffectsOverlay(ctx,canvas,nodeMatrices){
    if(!state.model || !$('#modelShowEffects') || !$('#modelShowEffects').checked) return;
    const matrices=nodeMatrices||getDeformedGeometry().nodeMatrices;
    const showCollision=$('#modelShowCollision') && $('#modelShowCollision').checked;
    const effects=(state.model.nodes||[]).filter(n=>['ParticleEmitter','ParticleEmitter2','ParticleEmitterPopcorn','RibbonEmitter','Light','Attachment','EventObject','CollisionShape'].includes(n.type));
    maybeLogParticleHeartbeat(canvas,effects);
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


  function isGeosetHidden(index){return state.hiddenGeosets&&state.hiddenGeosets.has(index);}
  function selectedGeoset(){return state.model&&state.model.geosets&&state.selectedGeosetIndex>=0?state.model.geosets[state.selectedGeosetIndex]:null;}
  function geosetEditActive(){return !!(state.model&&!state.photoMode&&state.activePropPanel==='geosets');}
  function geosetBaseBounds(index=state.selectedGeosetIndex){
    const geo=state.model&&state.model.geosets&&state.model.geosets[index];if(!geo||!(geo.vertices||[]).length)return null;
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const v of geo.vertices){minX=Math.min(minX,v.x);minY=Math.min(minY,v.y);minZ=Math.min(minZ,v.z);maxX=Math.max(maxX,v.x);maxY=Math.max(maxY,v.y);maxZ=Math.max(maxZ,v.z);}
    return{min:{x:minX,y:minY,z:minZ},max:{x:maxX,y:maxY,z:maxZ},center:{x:(minX+maxX)/2,y:(minY+maxY)/2,z:(minZ+maxZ)/2},size:Math.max(maxX-minX,maxY-minY,maxZ-minZ,1)};
  }
  function geosetDisplayBounds(index=state.selectedGeosetIndex){
    if(!state.model||index<0||isGeosetHidden(index))return null;const geom=getDeformedGeometry(),verts=geom.vertices[index]||state.model.geosets[index]?.vertices||[];if(!verts.length)return null;
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;for(const v of verts){if(!v)continue;minX=Math.min(minX,v.x);minY=Math.min(minY,v.y);minZ=Math.min(minZ,v.z);maxX=Math.max(maxX,v.x);maxY=Math.max(maxY,v.y);maxZ=Math.max(maxZ,v.z);}
    if(!Number.isFinite(minX))return null;return{min:{x:minX,y:minY,z:minZ},max:{x:maxX,y:maxY,z:maxZ},center:{x:(minX+maxX)/2,y:(minY+maxY)/2,z:(minZ+maxZ)/2},size:Math.max(maxX-minX,maxY-minY,maxZ-minZ,1)};
  }
  function selectGeoset(index,{focus=false}={}){
    if(!state.model||index<0||index>=state.model.geosets.length)return false;state.selectedGeosetIndex=index;state.geosetHover='';
    if(focus){const b=geosetDisplayBounds(index)||geosetBaseBounds(index);if(b){state.camera.targetX=b.center.x;state.camera.targetY=b.center.y;state.camera.targetZ=b.center.z;state.camera.panX=0;state.camera.panY=0;}}
    renderGeosetUI();markDirty();return true;
  }
  function setGeosetTool(tool){
    const allowed=new Set(['select','move','drag','scale','rotate']);state.geosetTool=allowed.has(tool)?tool:'select';state.geosetDrag=null;state.geosetHover='';
    state.animation.playing=false;
    document.querySelectorAll('[data-model-geoset-tool]').forEach(b=>{const shelf=!!b.closest('#modelToolShelf');b.classList.toggle('active',b.dataset.modelGeosetTool===state.geosetTool&&(!shelf||state.activePropPanel==='geosets'));});
    const status=$('#modelGeosetToolStatus');if(status)status.textContent=`Tool: ${state.geosetTool[0].toUpperCase()+state.geosetTool.slice(1)} · edits bind-pose geometry`;
    const canvas=$('#model3dCanvas');if(canvas)canvas.style.cursor=state.geosetTool==='select'?'crosshair':state.geosetTool==='drag'?'move':'default';
    diag('info','Geoset',`Tool: ${state.geosetTool}`);markDirty();
  }
  function toggleGeosetHidden(index,hidden){
    if(!state.model||index<0||index>=state.model.geosets.length)return;if(hidden)state.hiddenGeosets.add(index);else state.hiddenGeosets.delete(index);invalidateGeometryCache();renderGeosetSelect();renderGeosetUI();drawUvView();markDirty();
  }

  function cloneData(value){
    if(typeof structuredClone==='function'){
      try{return structuredClone(value);}catch(_){}
    }
    return JSON.parse(JSON.stringify(value));
  }
  function rawModelBounds(model){
    if(model&&model.bounds&&model.bounds.min&&model.bounds.max)return cloneData(model.bounds);
    return computeBounds((model&&model.geosets)||[]);
  }
  function offsetBounds(bounds,off={x:0,y:0,z:0}){
    const b=bounds||{min:{x:0,y:0,z:0},max:{x:0,y:0,z:0},center:{x:0,y:0,z:0},size:1};
    const min={x:(b.min?.x||0)+(off.x||0),y:(b.min?.y||0)+(off.y||0),z:(b.min?.z||0)+(off.z||0)},max={x:(b.max?.x||0)+(off.x||0),y:(b.max?.y||0)+(off.y||0),z:(b.max?.z||0)+(off.z||0)};
    return{min,max,center:{x:(min.x+max.x)/2,y:(min.y+max.y)/2,z:(min.z+max.z)/2},size:Math.max(max.x-min.x,max.y-min.y,max.z-min.z,1)};
  }
  function unionBounds(a,b){
    if(!a)return b;if(!b)return a;const min={x:Math.min(a.min.x,b.min.x),y:Math.min(a.min.y,b.min.y),z:Math.min(a.min.z,b.min.z)},max={x:Math.max(a.max.x,b.max.x),y:Math.max(a.max.y,b.max.y),z:Math.max(a.max.z,b.max.z)};
    return{min,max,center:{x:(min.x+max.x)/2,y:(min.y+max.y)/2,z:(min.z+max.z)/2},size:Math.max(max.x-min.x,max.y-min.y,max.z-min.z,1)};
  }
  function defaultReferenceOffset(refModel){
    const main=currentDisplayBounds(),rb=renderableModelBounds(refModel),gap=Math.max(main.size,rb.size)*.18;
    const targetY=(main.min?.y||0)-gap-rb.size*.52;
    return{x:(main.center?.x||0)-(rb.center?.x||0),y:targetY-(rb.center?.y||0),z:(main.min?.z||0)-(rb.min?.z||0)};
  }
  function referenceModelState(){const r=state.referenceModel||{},rt=r.runtime,gs=state.glRenderer?.referenceResources?.lastStats||null;return{model:r.model,name:r.name||'',path:r.path||'',source:r.source||'',visible:r.visible!==false,opacity:Number.isFinite(+r.opacity)?+r.opacity:1,offset:{x:+r.offset?.x||0,y:+r.offset?.y||0,z:+r.offset?.z||0},selectedKind:r.selectedKind||'',selectedIndex:Number.isFinite(+r.selectedIndex)?+r.selectedIndex:-1,runtimeReady:!!(rt&&rt.parsed),texturesDecoded:rt&&rt.textures?rt.textures.filter(Boolean).length:0,texturesTotal:rt&&rt.textures?rt.textures.length:0,sequenceCount:rt&&rt.parsed?(rt.parsed.sequences||[]).length:0,activeSequence:rt&&rt.lastSequenceName||'',gpuDepthRendered:!!state.glRenderer?.referenceRendered,gpuLayerStats:gs};}
  function setReferenceModel(model,options={}){
    if(!model){clearReferenceModel();return null;}const offset=options.offset||defaultReferenceOffset(model);
    state.referenceModel={model,runtime:options.runtime||null,name:String(options.name||model.sourceName||model.name||'Reference model'),path:String(options.path||''),source:String(options.source||'reference'),visible:options.visible!==false,opacity:clamp(Number(options.opacity??1),.08,1),offset:{x:+offset.x||0,y:+offset.y||0,z:+offset.z||0},selectedKind:'',selectedIndex:-1};
    diag('info','Reference Model','Reference model loaded',{name:state.referenceModel.name,source:state.referenceModel.source,geosets:(model.geosets||[]).length,nodes:(model.nodes||[]).length,particleEmitters2:(model.particleEmitters2||[]).length,runtimeReady:!!state.referenceModel.runtime,texturesDecoded:state.referenceModel.runtime?.textures?.filter(Boolean).length||0,sequences:(model.sequences||[]).length,offset:state.referenceModel.offset});
    markDirty();try{window.dispatchEvent(new CustomEvent('wc3-reference-model-change',{detail:referenceModelState()}));}catch(_){}return state.referenceModel;
  }
  function clearReferenceModel(){state.referenceModel={model:null,runtime:null,name:'',path:'',source:'',visible:true,opacity:1,offset:{x:0,y:0,z:0},selectedKind:'',selectedIndex:-1};markDirty();try{window.dispatchEvent(new CustomEvent('wc3-reference-model-change',{detail:referenceModelState()}));}catch(_){}return true;}
  function setReferenceTransform(values={}){const r=state.referenceModel;if(!r||!r.model)return false;if(values.offset){for(const k of ['x','y','z'])if(Number.isFinite(+values.offset[k]))r.offset[k]=+values.offset[k];}if(values.visible!=null)r.visible=!!values.visible;if(Number.isFinite(+values.opacity))r.opacity=clamp(+values.opacity,.08,1);markDirty();try{window.dispatchEvent(new CustomEvent('wc3-reference-model-change',{detail:referenceModelState()}));}catch(_){}return true;}
  function selectReferenceItem(kind,index){const r=state.referenceModel;if(!r||!r.model)return false;r.selectedKind=String(kind||'');r.selectedIndex=Number.isFinite(+index)?+index:-1;markDirty();return true;}
  function referenceSceneBounds(){const main=currentDisplayBounds(),r=state.referenceModel;if(!r?.model||r.visible===false)return main;return unionBounds(main,offsetBounds(renderableModelBounds(r.model),r.offset));}
  function frameReferenceScene(){
    const canvas=$('#model3dCanvas');if(!canvas||!state.model)return false;const b=referenceSceneBounds();setCameraTargetFromBounds(b);state.camera.panX=0;state.camera.panY=0;
    const corners=[{x:b.min.x,y:b.min.y,z:b.min.z},{x:b.max.x,y:b.min.y,z:b.min.z},{x:b.min.x,y:b.max.y,z:b.min.z},{x:b.max.x,y:b.max.y,z:b.min.z},{x:b.min.x,y:b.min.y,z:b.max.z},{x:b.max.x,y:b.min.y,z:b.max.z},{x:b.min.x,y:b.max.y,z:b.max.z},{x:b.max.x,y:b.max.y,z:b.max.z}];
    const t=geometry.createOrthoTransform({...state.camera,zoom:1,panX:0,panY:0},canvas,{zoom:1,panX:0,panY:0});let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const p of corners){const v=t.worldToView(p),sx=v.x*t.pxScale,sy=v.y*t.pxScale;minX=Math.min(minX,sx);maxX=Math.max(maxX,sx);minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);}const fitX=(canvas.width*.44)/Math.max(1,Math.max(Math.abs(minX),Math.abs(maxX))),fitY=(canvas.height*.44)/Math.max(1,Math.max(Math.abs(minY),Math.abs(maxY)));setModelZoom(clamp(Math.min(fitX,fitY),MODEL_ZOOM_MIN,MODEL_ZOOM_MAX),false);invalidatePickCache();markDirty();return true;
  }
  function drawReferenceRuntimeSelection(ctx,canvas,r,nowMs){
    const runtime=r&&r.runtime;if(!runtime||!runtime.parsed)return;const model=runtime.parsed,off=r.offset||{x:0,y:0,z:0},anim=cascEffectFrame(runtime,nowMs),nodeMatrices=buildModelNodeMatrices(model,anim.seq,anim.frame,anim.elapsedMs),anchor=matTranslate(off.x||0,off.y||0,off.z||0);
    if(r.selectedKind==='geoset'&&Number.isFinite(+r.selectedIndex)){
      const gi=+r.selectedIndex,geo=(model.geosets||[])[gi];if(geo){const verts=(geo.vertices||[]).map((v,vi)=>projectPoint(matPoint(anchor,skinModelVertex(model,geo,vi,nodeMatrices)||v),canvas)),faces=geo.faces||geo.triangles||[],stride=faces.length>15000?Math.ceil(faces.length/15000):1;ctx.save();ctx.globalAlpha=.23;ctx.fillStyle='rgba(255,209,84,.9)';ctx.strokeStyle='rgba(255,224,130,.95)';ctx.lineWidth=1;for(let fi=0;fi<faces.length;fi+=stride){const f=faces[fi],ids=Array.isArray(f)?f:[f?.a,f?.b,f?.c],a=verts[ids?.[0]],b=verts[ids?.[1]],c=verts[ids?.[2]];if(!a||!b||!c)continue;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();ctx.fill();ctx.stroke();}ctx.restore();}
    }
    if(r.selectedKind==='node'){
      const node=(model.nodes||[]).find(n=>String(n&&n.id)===String(r.selectedIndex));if(node){const local=nodeMatrices.get(node.id)||matIdentity(),world=matMul(anchor,local),p=projectPoint(matPoint(world,node.pivot||{x:0,y:0,z:0}),canvas);ctx.save();ctx.strokeStyle='rgba(255,224,130,.98)';ctx.fillStyle='rgba(255,209,84,.22)';ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
    }
  }
  function drawReferenceModelOverlay(ctx,canvas){
    const r=state.referenceModel;if(!r?.model||r.visible===false||state.photoMode)return;const m=r.model,off=r.offset||{x:0,y:0,z:0},alpha=clamp(Number(r.opacity)||1,.08,1),runtime=r.runtime,now=performance.now();
    if(runtime&&runtime.parsed){
      const gpuDepth=!!state.glRenderer?.referenceRendered;
      drawCascEffectModel(ctx,canvas,{pivot:{x:0,y:0,z:0}},matTranslate(off.x||0,off.y||0,off.z||0),runtime,now,{opacity:alpha,meshes:!gpuDepth,emitters:true});
      drawReferenceRuntimeSelection(ctx,canvas,r,now);
      ctx.save();ctx.globalAlpha=.95;ctx.fillStyle='rgba(166,220,255,.96)';ctx.font='bold 10px system-ui,sans-serif';const rb=offsetBounds(rawModelBounds(m),off),label=projectPoint({x:rb.center.x,y:rb.max.y,z:rb.max.z},canvas);ctx.fillText(`REF · ${r.name||m.sourceName||'model'}${runtime.lastSequenceName?` · ${runtime.lastSequenceName}`:''}`,label.x+8,label.y-8);ctx.restore();return;
    }
    const tris=[],geos=m.geosets||[];for(let gi=0;gi<geos.length;gi++){const g=geos[gi],verts=(g.vertices||[]).map(v=>projectPoint({x:(v.x||0)+off.x,y:(v.y||0)+off.y,z:(v.z||0)+off.z},canvas)),faces=g.faces||g.triangles||[];const stride=faces.length>70000?Math.ceil(faces.length/70000):1;for(let fi=0;fi<faces.length;fi+=stride){const f=faces[fi],ids=Array.isArray(f)?f:[f?.a,f?.b,f?.c];if(!ids||ids.length<3)continue;const p0=verts[ids[0]],p1=verts[ids[1]],p2=verts[ids[2]];if(!p0||!p1||!p2)continue;tris.push({gi,p:[p0,p1,p2],z:(p0.z+p1.z+p2.z)/3});}}
    tris.sort((a,b)=>a.z-b.z);ctx.save();for(const t of tris){const selected=r.selectedKind==='geoset'&&r.selectedIndex===t.gi;ctx.globalAlpha=selected?Math.min(1,alpha+.15):alpha*.58;ctx.fillStyle=selected?'rgba(255,205,82,.62)':'rgba(75,174,235,.42)';ctx.beginPath();ctx.moveTo(t.p[0].x,t.p[0].y);ctx.lineTo(t.p[1].x,t.p[1].y);ctx.lineTo(t.p[2].x,t.p[2].y);ctx.closePath();ctx.fill();if(selected){ctx.globalAlpha=.95;ctx.strokeStyle='rgba(255,220,110,.95)';ctx.lineWidth=1;ctx.stroke();}}
    for(const n of m.nodes||[]){if(!['ParticleEmitter2','ParticleEmitter','ParticleEmitterPopcorn','RibbonEmitter','Attachment','Light','EventObject'].includes(n.type))continue;const p=n.pivot||{x:0,y:0,z:0},q=projectPoint({x:(p.x||0)+off.x,y:(p.y||0)+off.y,z:(p.z||0)+off.z},canvas),selected=r.selectedKind==='node'&&String(r.selectedIndex)===String(n.id);ctx.globalAlpha=selected?1:.8;ctx.strokeStyle=selected?'rgba(255,220,110,.98)':'rgba(111,214,255,.9)';ctx.lineWidth=selected?2.4:1.3;ctx.beginPath();ctx.arc(q.x,q.y,selected?7:4,0,Math.PI*2);ctx.stroke();}
    ctx.globalAlpha=.95;ctx.fillStyle='rgba(166,220,255,.96)';ctx.font='bold 10px system-ui,sans-serif';const rb=offsetBounds(rawModelBounds(m),off),label=projectPoint({x:rb.center.x,y:rb.max.y,z:rb.max.z},canvas);ctx.fillText(`REF · ${r.name||m.sourceName||'model'} · mesh fallback`,label.x+8,label.y-8);ctx.restore();
  }
  function referenceTextureKey(d){return `${normalizePath(d?.path||'')}|${Number(d?.replaceableId||0)}|${d?.wrapWidth?1:0}|${d?.wrapHeight?1:0}`;}
  function copyReferenceTextureDef(refModel,sourceId,textureMap){
    if(!Number.isInteger(sourceId)||sourceId<0)return sourceId;if(textureMap.has(sourceId))return textureMap.get(sourceId);const src=(refModel.textureDefs||[])[sourceId]||{path:(refModel.textures||[])[sourceId]||'',replaceableId:0},key=referenceTextureKey(src),defs=state.model.textureDefs||(state.model.textureDefs=[]);let id=defs.findIndex(d=>referenceTextureKey(d)===key);
    if(id<0){id=defs.length;const d=cloneData(src);defs.push(d);state.model.textures=state.model.textures||[];state.model.textures[id]=d.path||'';state.textures=state.textures||[];state.textures[id]={ref:d.path||'',resolvedName:'',imageData:null,canvas:null,width:0,height:0,format:(basename(d.path||'').split('.').pop()||'').toUpperCase()||'—',revision:1,edited:false,error:''};state.model.__textureEdited=true;}
    textureMap.set(sourceId,id);return id;
  }
  function remapLayerTextures(layer,refModel,textureMap){
    if(!layer)return;const fields=['textureId','normalTextureId','ormTextureId','emissiveTextureId','teamColorTextureId','reflectionsTextureId'];for(const f of fields)if(Number.isInteger(layer[f])&&layer[f]>=0)layer[f]=copyReferenceTextureDef(refModel,layer[f],textureMap);if(layer.textureSlots&&typeof layer.textureSlots==='object')for(const k of Object.keys(layer.textureSlots)){const v=layer.textureSlots[k];if(Number.isInteger(v)&&v>=0)layer.textureSlots[k]=copyReferenceTextureDef(refModel,v,textureMap);}const kmtf=layer.tracks&&layer.tracks.KMTF;if(kmtf&&Array.isArray(kmtf.keys))for(const key of kmtf.keys){if(Array.isArray(key.value)&&Number.isInteger(key.value[0]))key.value[0]=copyReferenceTextureDef(refModel,key.value[0],textureMap);else if(Number.isInteger(key.value))key.value=copyReferenceTextureDef(refModel,key.value,textureMap);}
  }
  function copyReferenceMaterial(refModel,sourceId,materialMap,textureMap){
    sourceId=Number.isInteger(sourceId)?sourceId:0;if(materialMap.has(sourceId))return materialMap.get(sourceId);const src=(refModel.materials||[])[sourceId]||{id:sourceId,layers:[]},mat=cloneData(src);for(const layer of mat.layers||[])remapLayerTextures(layer,refModel,textureMap);if(Number.isInteger(mat.textureId)&&mat.textureId>=0)mat.textureId=copyReferenceTextureDef(refModel,mat.textureId,textureMap);const id=(state.model.materials||(state.model.materials=[])).length;mat.id=id;state.model.materials.push(mat);state.model.__materialEdited=true;materialMap.set(sourceId,id);return id;
  }
  function copyReferenceNodeHierarchy(refModel,sourceId,nodeMap){
    if(sourceId==null||sourceId<0)return -1;if(nodeMap.has(sourceId))return nodeMap.get(sourceId);const src=(refModel.nodes||[]).find(n=>n&&String(n.id)===String(sourceId));if(!src||!['Bone','Helper'].includes(src.type))return -1;const existing=(state.model.nodes||[]).find(n=>n&&n.type===src.type&&String(n.name||'')===String(src.name||'')&&['Bone','Helper'].includes(src.type));if(existing){nodeMap.set(sourceId,existing.id);return existing.id;}const parent=src.parentId>=0?copyReferenceNodeHierarchy(refModel,src.parentId,nodeMap):-1,copy=cloneData(src),id=nextAuthorNodeId();copy.id=id;copy.objectId=id;copy.parentId=parent;copy.__custom=true;copy.__referenceImported=true;if(copy.type==='Bone'){copy.geosetId=-1;copy.geosetAnimationId=-1;}state.model.nodes.push(copy);state.model.__rigEdited=true;nodeMap.set(sourceId,id);return id;
  }
  async function copyReferenceGeoset(index){
    const r=state.referenceModel,ref=r&&r.model;if(!state.model||!ref||!ref.geosets?.[index])return null;const before=captureReferenceImportSnapshot(`Copy reference geoset ${index+1}`);ensureAuthoringIds();const textureMap=new Map(),materialMap=new Map(),nodeMap=new Map(),src=ref.geosets[index],copy=cloneData(src);copy.materialId=copyReferenceMaterial(ref,src.materialId,materialMap,textureMap);
    if(Array.isArray(copy.matrixGroups))copy.matrixGroups=copy.matrixGroups.map(group=>(group||[]).map(id=>copyReferenceNodeHierarchy(ref,id,nodeMap)).filter(id=>id>=0));
    const hdMap=new Map();if(copy.skin&&copy.skin.length){const used=new Set();for(let vi=0;vi<Math.floor(copy.skin.length/8);vi++){const o=vi*8;for(let k=0;k<4;k++)if((copy.skin[o+4+k]||0)>0)used.add(copy.skin[o+k]);}for(const bi of used){const b=ref.bones?.[bi];if(b)hdMap.set(bi,copyReferenceNodeHierarchy(ref,b.id,nodeMap));}}
    rebuildNodeTypeArrays();if(copy.skin&&copy.skin.length&&hdMap.size){const byNode=new Map((state.model.bones||[]).map((b,i)=>[b.id,i]));for(let vi=0;vi<Math.floor(copy.skin.length/8);vi++){const o=vi*8;for(let k=0;k<4;k++){if((copy.skin[o+4+k]||0)<=0)continue;const tid=hdMap.get(copy.skin[o+k]);copy.skin[o+k]=byNode.has(tid)?byNode.get(tid):0;}}}
    const newIndex=state.model.geosets.length;copy.id=newIndex;delete copy.__cloned;delete copy.__clonedFromIndex;copy.__referenceImported=true;copy.__geometryEdited=true;state.model.geosets.push(copy);for(const a of (ref.geosetAnimations||[]).filter(x=>x&&x.geosetId===index)){const ca=cloneData(a);ca.id=state.model.geosetAnimations.length;ca.geosetId=newIndex;ca.__referenceImported=true;state.model.geosetAnimations.push(ca);}state.model.__geometryEdited=true;state.model.__geosetStructureEdited=true;state.model.bounds=computeBounds(state.model.geosets||[]);state.selectedGeosetIndex=newIndex;state.geometryRevision++;state.faceCache=new WeakMap();invalidateGeometryCache();invalidatePickCache();if(state.glRenderer)clearGlResources(state.glRenderer);pushModelHistorySnapshot(before);renderEverything();if(state.casc.enabled)try{await autoLoadMissingModelTexturesFromCasc();}catch(_){}diag('info','Reference Model','Geoset copied into target',{source:r.name,index,newIndex,materialId:copy.materialId});markDirty();return copy;
  }
  async function copyReferenceObject(sourceId){
    const r=state.referenceModel,ref=r&&r.model;if(!state.model||!ref)return null;const src=(ref.nodes||[]).find(n=>n&&String(n.id)===String(sourceId));if(!src||!['ParticleEmitter2','ParticleEmitter','ParticleEmitterPopcorn','RibbonEmitter','Attachment','Light','EventObject'].includes(src.type))return null;const before=captureReferenceImportSnapshot(`Copy reference ${src.type}`);ensureAuthoringIds();const textureMap=new Map(),materialMap=new Map(),nodeMap=new Map(),copy=cloneData(src);copy.id=nextAuthorNodeId();copy.objectId=copy.id;copy.parentId=src.parentId>=0?copyReferenceNodeHierarchy(ref,src.parentId,nodeMap):-1;copy.__custom=true;copy.__referenceImported=true;if(src.type==='ParticleEmitter2'&&Number.isInteger(src.textureId)&&src.textureId>=0)copy.textureId=copyReferenceTextureDef(ref,src.textureId,textureMap);if(src.type==='RibbonEmitter'&&Number.isInteger(src.materialId)&&src.materialId>=0)copy.materialId=copyReferenceMaterial(ref,src.materialId,materialMap,textureMap);state.model.nodes.push(copy);rebuildNodeTypeArrays();state.selectedNodeId=copy.id;state.model.__effectsEdited=true;pushModelHistorySnapshot(before);renderEverything();if(state.casc.enabled)try{await loadCascEffectAssets(true);await autoLoadMissingModelTexturesFromCasc();}catch(_){}diag('info','Reference Model','FX/object copied into target',{source:r.name,type:src.type,name:src.name||src.type,id:copy.id});markDirty();return copy;
  }
  function constantObjectTrack(tag,value){
    const seqs=(state.model&&state.model.sequences)||[],frames=[];
    if(seqs.length){for(const seq of seqs){frames.push(Math.round(seq.start||0),Math.round(seq.end||seq.start||0));}}
    else frames.push(0);
    const uniq=[...new Set(frames)].sort((a,b)=>a-b);
    return{tag,interpolation:'DontInterp',interpolationType:0,globalSequenceId:-1,keys:uniq.map(frame=>({frame,value:Array.isArray(value)?value.slice():[value]}))};
  }
  function quatFromEulerDegrees(rx=0,ry=0,rz=0){
    const x=Number(rx||0)*Math.PI/360,y=Number(ry||0)*Math.PI/360,z=Number(rz||0)*Math.PI/360;
    const sx=Math.sin(x),cx=Math.cos(x),sy=Math.sin(y),cy=Math.cos(y),sz=Math.sin(z),cz=Math.cos(z);
    return [sx*cy*cz-cx*sy*sz,cx*sy*cz+sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz];
  }
  function addedObjectEntries(){
    const m=state.model;if(!m)return[];const out=[];
    (m.geosets||[]).forEach((g,i)=>{if(g&&((g.__referenceImported===true)||(g.__cloned===true)||(g.__custom===true)))out.push({kind:'geoset',key:i,label:`Geoset ${i+1}`,object:g});});
    for(const n of m.nodes||[]){if(!n||n.__deleted)continue;if(!n.__addedTransformHelper&&(n.__referenceImported===true||n.__custom===true))out.push({kind:'node',key:n.id,label:`${n.type||'Node'} · ${n.name||n.id}`,object:n});}
    return out;
  }
  function findAddedObject(kind,key){
    if(!state.model)return null;if(kind==='geoset')return state.model.geosets?.[Number(key)]||null;
    return (state.model.nodes||[]).find(n=>n&&!n.__deleted&&String(n.id)===String(key))||null;
  }
  function ensureAddedTransformHelper(node){
    if(!node||!state.model)return null;
    if(node.__editorTransformHelperId!=null){const old=(state.model.nodes||[]).find(n=>n&&!n.__deleted&&String(n.id)===String(node.__editorTransformHelperId));if(old)return old;}
    ensureAuthoringIds();const id=nextAuthorNodeId(),helper={id,objectId:id,type:'Helper',__custom:true,__addedTransformHelper:true,name:`${String(node.name||node.type||'Object').slice(0,60)}_Transform`,parentId:Number.isFinite(+node.parentId)?+node.parentId:-1,flags:0,pivot:cloneData(node.pivot||{x:0,y:0,z:0}),tracks:{}};
    state.model.nodes.push(helper);node.parentId=id;node.__editorTransformHelperId=id;rebuildNodeTypeArrays();return helper;
  }
  function applyAddedObjectTransform(kind,key,values={}){
    const obj=findAddedObject(kind,key);if(!obj||!state.model)return false;
    const move=Array.isArray(values.move)?values.move:[0,0,0],scale=Array.isArray(values.scale)?values.scale:[1,1,1],rot=Array.isArray(values.rotate)?values.rotate:[0,0,0];
    if(kind==='geoset'){
      const idx=Number(key),before=captureGeosetSnapshot(idx,'Transform added geoset');if(!before)return false;const prev=state.selectedGeosetIndex;selectGeoset(idx);
      if(move.some(v=>Math.abs(Number(v)||0)>1e-12))translateSelectedGeoset(Number(move[0])||0,Number(move[1])||0,Number(move[2])||0);
      if(scale.some((v,i)=>Math.abs((Number(v)||1)-1)>1e-12))scaleSelectedGeoset(Number(scale[0])||1,Number(scale[1])||1,Number(scale[2])||1);
      for(const [axis,deg] of [['x',rot[0]],['y',rot[1]],['z',rot[2]]])if(Math.abs(Number(deg)||0)>1e-12)rotateSelectedGeoset(axis,(Number(deg)||0)*Math.PI/180);
      pushGeosetHistorySnapshot(before);if(prev>=0&&prev!==idx)selectGeoset(prev);markDirty();return true;
    }
    const before=captureModelEditSnapshot('Transform added object'),helper=ensureAddedTransformHelper(obj);if(!helper)return false;helper.__editorTransform=helper.__editorTransform||{translation:[0,0,0],scale:[1,1,1],rotation:[0,0,0]};const t=helper.__editorTransform;
    for(let i=0;i<3;i++){t.translation[i]=(Number(t.translation[i])||0)+(Number(move[i])||0);t.scale[i]=(Number(t.scale[i])||1)*(Number(scale[i])||1);t.rotation[i]=(Number(t.rotation[i])||0)+(Number(rot[i])||0);}
    helper.tracks=helper.tracks||{};helper.tracks.KGTR=constantObjectTrack('KGTR',t.translation);helper.translation=helper.tracks.KGTR;helper.tracks.KGSC=constantObjectTrack('KGSC',t.scale);helper.scaling=helper.tracks.KGSC;helper.tracks.KGRT=constantObjectTrack('KGRT',quatFromEulerDegrees(...t.rotation));helper.rotation=helper.tracks.KGRT;
    state.model.__effectsEdited=true;pushModelHistorySnapshot(before);renderEverything();markDirty();return true;
  }
  function cloneAddedObject(kind,key){
    const obj=findAddedObject(kind,key);if(!obj||!state.model)return null;
    if(kind==='geoset'){const prev=state.selectedGeosetIndex;selectGeoset(Number(key));const ok=cloneSelectedGeoset();const created=ok?state.model.geosets[state.model.geosets.length-1]:null;if(created)created.__custom=true;if(prev>=0&&prev!==Number(key))selectGeoset(prev);return created;}
    const before=captureModelEditSnapshot(`Clone ${obj.type||'object'}`);ensureAuthoringIds();const copy=cloneData(obj),id=nextAuthorNodeId();copy.id=id;copy.objectId=id;copy.name=`${String(obj.name||obj.type||'Object').slice(0,68)}_Copy`;copy.__custom=true;copy.__referenceImported=!!obj.__referenceImported;delete copy.__editorTransformHelperId;state.model.nodes.push(copy);rebuildNodeTypeArrays();state.selectedNodeId=id;state.model.__effectsEdited=true;pushModelHistorySnapshot(before);renderEverything();markDirty();return copy;
  }
  function attachAddedObjectToBone(kind,key,boneId){
    const obj=findAddedObject(kind,key);if(!obj||!state.model)return false;boneId=Number(boneId);const bone=(state.model.bones||[]).find(b=>b&&!b.__deleted&&Number(b.id)===boneId);if(!bone)return false;
    if(kind==='geoset'){
      const idx=Number(key),geo=obj,before=captureGeosetSnapshot(idx,'Bind added geoset to bone');if(!before)return false;const boneIndex=(state.model.bones||[]).findIndex(b=>b&&!b.__deleted&&Number(b.id)===boneId);if(!geo.__preBoneBind)geo.__preBoneBind={matrixGroups:cloneData(geo.matrixGroups||[]),matrixIndices:cloneData(geo.matrixIndices||[]),vertexGroups:cloneData(geo.vertexGroups||[]),skin:cloneData(geo.skin||[])};geo.matrixGroups=[[boneId]];geo.matrixIndices=[boneId];geo.vertexGroups=new Array((geo.vertices||[]).length).fill(0);if(Array.isArray(geo.skin)&&geo.skin.length&&boneIndex>=0){const count=Math.floor(geo.skin.length/8);for(let vi=0;vi<count;vi++){const o=vi*8;geo.skin[o]=boneIndex;geo.skin[o+1]=geo.skin[o+2]=geo.skin[o+3]=0;geo.skin[o+4]=255;geo.skin[o+5]=geo.skin[o+6]=geo.skin[o+7]=0;}}geo.__boundBoneId=boneId;noteGeometryMutation(idx);pushGeosetHistorySnapshot(before);markDirty();return true;
    }
    const before=captureModelEditSnapshot('Attach added object to bone'),helper=(obj.__editorTransformHelperId!=null?(state.model.nodes||[]).find(n=>n&&!n.__deleted&&String(n.id)===String(obj.__editorTransformHelperId)):null),holder=helper||obj;if(obj.__preBoneParentId==null)obj.__preBoneParentId=Number.isFinite(+holder.parentId)?+holder.parentId:-1;holder.parentId=boneId;obj.__boundBoneId=boneId;state.model.__effectsEdited=true;pushModelHistorySnapshot(before);renderEverything();markDirty();return true;
  }
  function detachAddedObjectFromBone(kind,key){
    const obj=findAddedObject(kind,key);if(!obj||!state.model)return false;
    if(kind==='geoset'){const idx=Number(key),before=captureGeosetSnapshot(idx,'Detach added geoset from bone');if(!before)return false;const prev=obj.__preBoneBind;if(prev){obj.matrixGroups=cloneData(prev.matrixGroups||[]);obj.matrixIndices=cloneData(prev.matrixIndices||[]);obj.vertexGroups=cloneData(prev.vertexGroups||[]);obj.skin=cloneData(prev.skin||[]);delete obj.__preBoneBind;}else{obj.matrixGroups=[];obj.matrixIndices=[];obj.vertexGroups=new Array((obj.vertices||[]).length).fill(0);}delete obj.__boundBoneId;noteGeometryMutation(idx);pushGeosetHistorySnapshot(before);markDirty();return true;}
    const before=captureModelEditSnapshot('Detach added object from bone'),helper=(obj.__editorTransformHelperId!=null?(state.model.nodes||[]).find(n=>n&&!n.__deleted&&String(n.id)===String(obj.__editorTransformHelperId)):null),holder=helper||obj;holder.parentId=obj.__preBoneParentId!=null?obj.__preBoneParentId:-1;delete obj.__preBoneParentId;delete obj.__boundBoneId;state.model.__effectsEdited=true;pushModelHistorySnapshot(before);renderEverything();markDirty();return true;
  }
  function focusAddedObject(kind,key){const obj=findAddedObject(kind,key);if(!obj)return false;if(kind==='geoset'){selectGeoset(Number(key));const b=$('#modelGeosetFocusBtn');if(b)b.click();return true;}state.selectedNodeId=obj.id;focusNodeInViewport?.(obj.id,{fit:true});renderEverything();return true;}
  function particleVisibilityRanges(mode,sequenceIds,start,end){
    const seqs=(state.model&&state.model.sequences)||[];if(mode==='infinite')return[];if(mode==='current'){const s=currentSequence();return s?[[s.start,s.end]]:[];}if(mode==='selected'){const ids=new Set((sequenceIds||[]).map(Number));return seqs.map((s,i)=>ids.has(i)?[s.start,s.end]:null).filter(Boolean);}const a=Math.round(Number(start)||0),b=Math.round(Number(end)||a);return[[Math.min(a,b),Math.max(a,b)]];
  }
  function buildParticleVisibilityTrack(ranges){
    if(!ranges||!ranges.length)return null;const points=new Map();for(const [a0,b0] of ranges){const a=Math.round(a0),b=Math.round(b0);points.set(a-1,0);points.set(a,1);points.set(b,1);points.set(b+1,0);}const keys=[...points].sort((a,b)=>a[0]-b[0]).map(([frame,v])=>({frame,value:[v]}));return{tag:'KP2V',interpolation:'DontInterp',interpolationType:0,globalSequenceId:-1,keys};
  }
  function setParticleEmitterTiming(index,config={}){
    const emitter=state.model?.particleEmitters2?.[Number(index)];if(!emitter)return false;const mode=String(config.mode||'infinite'),ranges=particleVisibilityRanges(mode,config.sequenceIds,config.start,config.end);emitter.tracks=emitter.tracks||{};const tr=buildParticleVisibilityTrack(ranges);if(tr)emitter.tracks.KP2V=tr;else delete emitter.tracks.KP2V;emitter.__editorTiming={mode,sequenceIds:(config.sequenceIds||[]).map(Number),start:Number(config.start)||0,end:Number(config.end)||0};state.model.__effectsEdited=true;return true;
  }
  async function addEffectAttachmentFromPath(path,name=''){
    if(!state.model)return null;path=String(path||'').trim();if(!path)return null;const historySnap=captureModelEditSnapshot('Add Warcraft effect attachment');ensureAuthoringIds();const pivot=authoringPivot(),id=nextAuthorNodeId(),node={id,objectId:id,type:'Attachment',__custom:true,name:String(name||basename(path).replace(/\.(mdx|mdl)$/i,'')||`Effect_${id}`).slice(0,79),parentId:-1,flags:0,pivot:{x:pivot.x,y:pivot.y,z:pivot.z},path};state.model.nodes.push(node);rebuildNodeTypeArrays();state.selectedNodeId=id;state.model.__effectsEdited=true;if(historySnap)pushModelHistorySnapshot(historySnap);renderEverything();if(state.casc.enabled)try{await loadCascEffectAssets(true);}catch(_){}diag('info','Authoring','Warcraft effect attached from Asset Browser',{id,name:node.name,path});markDirty();return node;
  }
  function cloneSelectedGeoset(){
    if(!state.model||state.selectedGeosetIndex<0||!state.model.geosets?.[state.selectedGeosetIndex])return false;
    const before=captureGeosetStructureSnapshot('Clone geoset');
    const sourceIndex=state.selectedGeosetIndex,source=state.model.geosets[sourceIndex];
    const originalSource=Number.isInteger(source.__clonedFromIndex)?source.__clonedFromIndex:sourceIndex;
    const clone=cloneData(source),newIndex=state.model.geosets.length;
    clone.id=newIndex;
    clone.__cloned=true;
    clone.__clonedFromIndex=originalSource;
    clone.__geometryEdited=true;
    clone.extent=source.extent?cloneData(source.extent):source.extent;
    clone.sequenceExtents=source.sequenceExtents?cloneData(source.sequenceExtents):[];
    state.model.geosets.push(clone);

    const sourceAnims=(state.model.geosetAnimations||[]).filter(a=>a&&a.geosetId===sourceIndex);
    for(const anim of sourceAnims){
      const copy=cloneData(anim);copy.id=state.model.geosetAnimations.length;copy.geosetId=newIndex;copy.__cloned=true;copy.__clonedFromGeosetId=originalSource;state.model.geosetAnimations.push(copy);
    }

    state.model.__geometryEdited=true;
    state.model.__geosetStructureEdited=true;
    state.model.bounds=computeBounds(state.model.geosets||[]);
    state.geometryRevision++;
    state.faceCache=new WeakMap();
    invalidateGeometryCache();
    invalidatePickCache();
    if(state.glRenderer)clearGlResources(state.glRenderer);
    renderGeosetSelect();
    selectGeoset(newIndex);
    // Cloning selects the new geoset for editing, but must not turn the
    // viewport geoset filter into "only this geoset". That made every
    // original geoset appear to disappear after Clone.
    const sel=$('#modelGeosetSelect');if(sel)sel.value='all';
    invalidatePickCache();
    drawUvView();
    diag('info','Geoset','Geoset cloned',{source:sourceIndex+1,clone:newIndex+1,vertices:(clone.vertices||[]).length,triangles:(clone.faces||[]).length,animationCopies:sourceAnims.length});
    app.setStatus(`Geoset ${sourceIndex+1} cloned as Geoset ${newIndex+1}`);
    pushModelHistorySnapshot(before);
    markDirty();
    return true;
  }
  function transformNormal(n,sx,sy,sz,axis,angle){
    let x=n.x,y=n.y,z=n.z;
    if(sx!=null){x/=Math.max(1e-6,sx);y/=Math.max(1e-6,sy);z/=Math.max(1e-6,sz);}
    if(axis&&angle){const c=Math.cos(angle),q=Math.sin(angle);if(axis==='x'){const ny=y*c-z*q,nz=y*q+z*c;y=ny;z=nz;}else if(axis==='y'){const nx=x*c+z*q,nz=-x*q+z*c;x=nx;z=nz;}else if(axis==='z'){const nx=x*c-y*q,ny=x*q+y*c;x=nx;y=ny;}}
    const l=Math.hypot(x,y,z)||1;return{x:x/l,y:y/l,z:z/l};
  }
  function translateSelectedGeoset(dx,dy,dz){const geo=selectedGeoset();if(!geo)return;for(const v of geo.vertices||[]){v.x+=dx;v.y+=dy;v.z+=dz;}noteGeometryMutation(state.selectedGeosetIndex);}
  function scaleSelectedGeoset(sx,sy,sz,pivot){const geo=selectedGeoset();if(!geo)return;const c=pivot||geosetBaseBounds()?.center;if(!c)return;for(const v of geo.vertices||[]){v.x=c.x+(v.x-c.x)*sx;v.y=c.y+(v.y-c.y)*sy;v.z=c.z+(v.z-c.z)*sz;}if((geo.normals||[]).length)geo.normals=geo.normals.map(n=>transformNormal(n,sx,sy,sz));noteGeometryMutation(state.selectedGeosetIndex);}
  function rotateSelectedGeoset(axis,angle,pivot){const geo=selectedGeoset();if(!geo||!axis||!angle)return;const c=pivot||geosetBaseBounds()?.center;if(!c)return;const co=Math.cos(angle),si=Math.sin(angle);for(const v of geo.vertices||[]){let x=v.x-c.x,y=v.y-c.y,z=v.z-c.z;if(axis==='x'){const ny=y*co-z*si,nz=y*si+z*co;y=ny;z=nz;}else if(axis==='y'){const nx=x*co+z*si,nz=-x*si+z*co;x=nx;z=nz;}else{const nx=x*co-y*si,ny=x*si+y*co;x=nx;y=ny;}v.x=c.x+x;v.y=c.y+y;v.z=c.z+z;}if((geo.normals||[]).length)geo.normals=geo.normals.map(n=>transformNormal(n,null,null,null,axis,angle));noteGeometryMutation(state.selectedGeosetIndex);}
  function geosetGizmoGeometry(canvas){
    const b=geosetDisplayBounds();if(!b)return null;const center=projectPoint(b.center,canvas),len=Math.max(b.size*.52,(getDeformedGeometry().bounds?.size||b.size)*.04,4),axes={};
    for(const axis of ['x','y','z']){const end={x:b.center.x,y:b.center.y,z:b.center.z};end[axis]+=len;axes[axis]={worldEnd:end,screenEnd:projectPoint(end,canvas)};}
    const radius=Math.max(b.size*.42,3),steps=72,rings={};
    for(const axis of ['x','y','z']){const pts=[];for(let i=0;i<=steps;i++){const t=i/steps*Math.PI*2,a=Math.cos(t)*radius,c=Math.sin(t)*radius;let w;if(axis==='x')w={x:b.center.x,y:b.center.y+a,z:b.center.z+c};else if(axis==='y')w={x:b.center.x+a,y:b.center.y,z:b.center.z+c};else w={x:b.center.x+a,y:b.center.y+c,z:b.center.z};pts.push(projectPoint(w,canvas));}rings[axis]=pts;}
    return{bounds:b,center,worldCenter:b.center,len,axes,radius,rings};
  }
  function hitGeosetGizmo(x,y,canvas){
    if(!geosetEditActive()||state.selectedGeosetIndex<0||isGeosetHidden(state.selectedGeosetIndex))return null;const tool=state.geosetTool,g=geosetGizmoGeometry(canvas);if(!g)return null;
    if(tool==='drag')return Math.hypot(x-g.center.x,y-g.center.y)<=18?{axis:'free',center:g.center,g}:null;
    if(tool==='move'||tool==='scale'){
      let best=null;for(const axis of ['x','y','z']){const e=g.axes[axis].screenEnd,d=pointSegmentDistance(x,y,g.center,e);const endD=Math.hypot(x-e.x,y-e.y),hit=tool==='scale'?Math.min(d,endD):d;if(hit<=10&&(!best||hit<best.distance))best={axis,center:g.center,distance:hit,g};}
      if(tool==='scale'&&Math.hypot(x-g.center.x,y-g.center.y)<=11)return{axis:'uniform',center:g.center,distance:0,g};return best;
    }
    if(tool==='rotate'){
      let best=null;for(const axis of ['x','y','z']){const pts=g.rings[axis];let d=Infinity;for(let i=1;i<pts.length;i++)d=Math.min(d,pointSegmentDistance(x,y,pts[i-1],pts[i]));if(d<=9&&(!best||d<best.distance))best={axis,center:g.center,distance:d,g};}return best;
    }
    return null;
  }
  function drawGeosetEditorOverlay(ctx,canvas){
    if(!geosetEditActive()||state.selectedGeosetIndex<0||isGeosetHidden(state.selectedGeosetIndex))return;const g=geosetGizmoGeometry(canvas);if(!g)return;
    const b=g.bounds,corners=[{x:b.min.x,y:b.min.y,z:b.min.z},{x:b.max.x,y:b.min.y,z:b.min.z},{x:b.min.x,y:b.max.y,z:b.min.z},{x:b.max.x,y:b.max.y,z:b.min.z},{x:b.min.x,y:b.min.y,z:b.max.z},{x:b.max.x,y:b.min.y,z:b.max.z},{x:b.min.x,y:b.max.y,z:b.max.z},{x:b.max.x,y:b.max.y,z:b.max.z}].map(v=>projectPoint(v,canvas)),edges=[[0,1],[0,2],[1,3],[2,3],[4,5],[4,6],[5,7],[6,7],[0,4],[1,5],[2,6],[3,7]];
    ctx.save();ctx.strokeStyle='rgba(255,210,92,.9)';ctx.lineWidth=1.2;ctx.setLineDash([5,4]);ctx.beginPath();for(const [a,bx] of edges){ctx.moveTo(corners[a].x,corners[a].y);ctx.lineTo(corners[bx].x,corners[bx].y);}ctx.stroke();ctx.setLineDash([]);
    const colors={x:'rgba(255,88,88,.98)',y:'rgba(82,230,118,.98)',z:'rgba(82,155,255,.98)'},tool=state.geosetTool;
    if(tool==='move'||tool==='scale'){
      for(const axis of ['x','y','z']){const e=g.axes[axis].screenEnd,active=(state.geosetDrag&&state.geosetDrag.axis===axis)||state.geosetHover===axis;ctx.strokeStyle=colors[axis];ctx.lineWidth=active?3.2:2;ctx.beginPath();ctx.moveTo(g.center.x,g.center.y);ctx.lineTo(e.x,e.y);ctx.stroke();ctx.fillStyle=colors[axis];if(tool==='scale')ctx.fillRect(e.x-5,e.y-5,10,10);else{ctx.beginPath();ctx.arc(e.x,e.y,4.3,0,Math.PI*2);ctx.fill();}}
      if(tool==='scale'){ctx.fillStyle=(state.geosetHover==='uniform'||state.geosetDrag?.axis==='uniform')?'rgba(255,255,255,.95)':'rgba(255,255,255,.65)';ctx.fillRect(g.center.x-5,g.center.y-5,10,10);}
    }else if(tool==='rotate'){
      for(const axis of ['x','y','z']){const pts=g.rings[axis],active=(state.geosetDrag&&state.geosetDrag.axis===axis)||state.geosetHover===axis;ctx.strokeStyle=colors[axis];ctx.lineWidth=active?3.2:1.8;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();}
    }else if(tool==='drag'){
      ctx.strokeStyle='rgba(255,255,255,.95)';ctx.fillStyle='rgba(255,210,92,.18)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(g.center.x,g.center.y,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(g.center.x-18,g.center.y);ctx.lineTo(g.center.x+18,g.center.y);ctx.moveTo(g.center.x,g.center.y-18);ctx.lineTo(g.center.x,g.center.y+18);ctx.stroke();
    }
    ctx.fillStyle='rgba(255,210,92,.95)';ctx.beginPath();ctx.arc(g.center.x,g.center.y,3.5,0,Math.PI*2);ctx.fill();ctx.restore();
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
    if(state.viewportTool!=='rotate' || !state.gizmoVisible || state.activePropPanel==='geosets') return null;
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
    if(!state.model || state.viewportTool!=='rotate' || !state.gizmoVisible || state.activePropPanel==='paint' || state.activePropPanel==='geosets') return;
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

  function cameraOrientationGizmoGeometry(canvas){
    if(!canvas||state.photoMode)return null;
    const m=geometry.viewportMetrics(canvas),sx=m.cssToCanvasX||1,sy=m.cssToCanvasY||1;
    const cssSize=88,cssPad=14,radiusCss=31;
    const cx=canvas.width-(cssPad+cssSize*.5)*sx,cy=(cssPad+cssSize*.5)*sy;
    const radius=radiusCss*Math.min(sx,sy);
    const target=cameraTarget(),base=projectPoint(target,canvas),axes={};
    for(const axis of ['x','y','z']){
      const wp={x:target.x,y:target.y,z:target.z};wp[axis]+=1;
      const sp=projectPoint(wp,canvas),dx=sp.x-base.x,dy=sp.y-base.y,len=Math.hypot(dx,dy)||1;
      axes[axis]={dx:dx/len,dy:dy/len};
    }
    const endpoints={};
    for(const axis of ['x','y','z']){
      const d=axes[axis],depth=(axis==='x'?geometry.cameraBasis(state.camera).forward.x:axis==='y'?geometry.cameraBasis(state.camera).forward.y:geometry.cameraBasis(state.camera).forward.z)||0;
      endpoints[axis]={axis,sign:1,x:cx+d.dx*radius,y:cy+d.dy*radius,depth};
      endpoints['-'+axis]={axis,sign:-1,x:cx-d.dx*radius,y:cy-d.dy*radius,depth:-depth};
    }
    return {cx,cy,radius,hitRadius:10*Math.min(sx,sy),endpoints,scale:Math.min(sx,sy)};
  }

  function hitCameraOrientationGizmo(x,y,canvas){
    const g=cameraOrientationGizmoGeometry(canvas);if(!g)return null;
    let best=null;
    for(const key of ['x','y','z','-x','-y','-z']){
      const e=g.endpoints[key],d=Math.hypot(x-e.x,y-e.y);
      if(d<=g.hitRadius*1.15&&(!best||d<best.distance))best={kind:'axis',axis:e.axis,sign:e.sign,key,distance:d,g};
    }
    const dc=Math.hypot(x-g.cx,y-g.cy);
    if(!best&&dc<=g.radius+g.hitRadius*.6)best={kind:'free',axis:'free',sign:0,key:'free',distance:dc,g};
    return best;
  }

  function snapCameraToAxis(axis,sign){
    sign=sign<0?-1:1;
    if(axis==='x'){state.camera.yaw=sign>0?Math.PI/2:-Math.PI/2;state.camera.pitch=0;}
    else if(axis==='y'){state.camera.yaw=sign>0?0:Math.PI;state.camera.pitch=0;}
    else if(axis==='z'){state.camera.pitch=sign>0?Math.PI/2-0.01:-Math.PI/2+0.01;}
    state.camera.roll=0;state.interactingUntil=performance.now()+180;invalidatePickCache();markDirty();
    diag('debug','Viewport','Camera gizmo snap',{axis,sign,yaw:state.camera.yaw,pitch:state.camera.pitch});
  }

  function drawCameraOrientationGizmo(ctx,canvas){
    const g=cameraOrientationGizmoGeometry(canvas);if(!g)return;
    const colors={x:'#ef5a5a',y:'#67c23a',z:'#4b8ef7'};
    const basis=geometry.cameraBasis(state.camera),depthFor={x:basis.forward.x||0,y:basis.forward.y||0,z:basis.forward.z||0};
    const ordered=[];
    for(const axis of ['x','y','z']){
      ordered.push({...g.endpoints['-'+axis],key:'-'+axis,front:-depthFor[axis]});
      ordered.push({...g.endpoints[axis],key:axis,front:depthFor[axis]});
    }
    ordered.sort((a,b)=>a.front-b.front);
    ctx.save();
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.fillStyle='rgba(26,30,36,.72)';ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1*g.scale;
    ctx.beginPath();ctx.arc(g.cx,g.cy,g.radius+15*g.scale,0,Math.PI*2);ctx.fill();ctx.stroke();
    for(const axis of ['x','y','z']){
      const p=g.endpoints[axis],n=g.endpoints['-'+axis],active=state.cameraGizmoHover===axis||state.cameraGizmoHover==='-'+axis||state.cameraGizmoDrag?.key===axis||state.cameraGizmoDrag?.key==='-'+axis;
      ctx.globalAlpha=active?1:.78;ctx.strokeStyle=colors[axis];ctx.lineWidth=(active?2.6:1.7)*g.scale;
      ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.lineTo(p.x,p.y);ctx.stroke();
    }
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${Math.max(9,10*g.scale)}px system-ui,sans-serif`;
    for(const e of ordered){
      const key=e.key,positive=e.sign>0,hover=state.cameraGizmoHover===key||state.cameraGizmoDrag?.key===key,r=(positive?8.7:5.3)*g.scale;
      ctx.globalAlpha=positive?1:.48;ctx.fillStyle=colors[e.axis];ctx.strokeStyle=hover?'rgba(255,255,255,.98)':'rgba(0,0,0,.38)';ctx.lineWidth=(hover?2.2:1.1)*g.scale;
      ctx.beginPath();ctx.arc(e.x,e.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(positive){ctx.fillStyle='#fff';ctx.globalAlpha=1;ctx.fillText(e.axis.toUpperCase(),e.x,e.y+.2*g.scale);}
    }
    ctx.globalAlpha=1;
    const free=state.cameraGizmoHover==='free'||state.cameraGizmoDrag?.key==='free';
    ctx.fillStyle=free?'rgba(255,255,255,.28)':'rgba(255,255,255,.16)';ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=(free?2:1)*g.scale;
    ctx.beginPath();ctx.arc(g.cx,g.cy,5.5*g.scale,0,Math.PI*2);ctx.fill();ctx.stroke();
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
    if(!state.model){ drawBackground(ctx, canvas); drawWorldGrid2D(ctx,canvas); drawReferenceModelOverlay(ctx,canvas); drawCameraOrientationGizmo(ctx,canvas); return; }
    if(!state.model.geosets.length){ drawBackground(ctx, canvas); drawWorldGrid2D(ctx,canvas); drawReferenceModelOverlay(ctx,canvas); drawEffectsOverlay(ctx,canvas,new Map()); drawCameraOrientationGizmo(ctx,canvas); return; }
    const glRendered=renderGlPreview();
    if(glRendered){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      const sharedMatrices=getDeformedGeometry().nodeMatrices;
      drawReferenceModelOverlay(ctx,canvas);
      if(!state.photoMode){drawExtentOverlay(ctx,canvas);drawPivots(ctx,canvas,sharedMatrices);}
      drawEffectsOverlay(ctx,canvas,sharedMatrices);
      if(!state.photoMode){drawGeosetEditorOverlay(ctx,canvas);drawRotationGizmo(ctx,canvas);drawPaintCursor(ctx,canvas);}
      if(!state.photoMode && can3DPaint()&&state.paintCursor&&state.paintCursor.hit&&state.paintCursor.hit.tri){
        const tp=state.paintCursor.hit.tri.p;ctx.save();ctx.strokeStyle='rgba(111,214,255,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tp[0].x,tp[0].y);ctx.lineTo(tp[1].x,tp[1].y);ctx.lineTo(tp[2].x,tp[2].y);ctx.closePath();ctx.stroke();ctx.restore();
      }
      if(!state.photoMode && state.pickedUv){const p=pickPointFromUV(state.pickedUv);if(p){ctx.save();ctx.strokeStyle='rgba(111,214,255,.95)';ctx.lineWidth=1.35;ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.stroke();ctx.restore();}}
      drawCameraOrientationGizmo(ctx,canvas);
      return;
    }
    drawBackground(ctx, canvas);
    drawWorldGrid2D(ctx,canvas);
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

    drawReferenceModelOverlay(ctx,canvas);
    const sharedMatrices=getDeformedGeometry().nodeMatrices;
    if(!fast || performanceMode()==='quality'){
      if(!state.photoMode){drawExtentOverlay(ctx, canvas);drawPivots(ctx, canvas, sharedMatrices);}
      drawEffectsOverlay(ctx, canvas, sharedMatrices);
    }
    if(!state.photoMode){drawGeosetEditorOverlay(ctx,canvas);drawRotationGizmo(ctx,canvas);drawPaintCursor(ctx,canvas);}

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
    drawCameraOrientationGizmo(ctx,canvas);

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
      const geo=state.model.geosets[geoIndex];if(!geo||isGeosetHidden(geoIndex))return;
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
    return `${geometryFrameKey()}|${selected}|h:${Array.from(state.hiddenGeosets||[]).sort((a,b)=>a-b).join(',')}`;
  }

  function buildPickTriangles(){
    const out=[];if(!state.model)return out;
    const selected=$('#modelGeosetSelect')?.value||'all',geom=getDeformedGeometry();
    (state.model.geosets||[]).forEach((geo,geoIndex)=>{
      if(isGeosetHidden(geoIndex))return;if(selected!=='all'&&+selected!==geoIndex)return;if(geosetRenderState(geoIndex).alpha<=0.001)return;
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

  function beginGeosetTransform(tool,axis,p,canvas){
    const index=state.selectedGeosetIndex,before=captureGeosetSnapshot(index,`${tool[0].toUpperCase()+tool.slice(1)} geoset`),g=geosetGizmoGeometry(canvas),base=geosetBaseBounds(index);if(!before||!g||!base)return false;
    let angle=0;if(tool==='rotate')angle=Math.atan2(p.y-g.center.y,p.x-g.center.x);
    state.geosetDrag={tool,axis,index,before,lastX:p.x,lastY:p.y,center:g.center,g,pivot:{...base.center},lastAngle:angle,changed:false};markDirty();return true;
  }
  function updateGeosetTransform(p,canvas){
    const gd=state.geosetDrag;if(!gd||gd.index!==state.selectedGeosetIndex)return;const dx=p.x-gd.lastX,dy=p.y-gd.lastY;if(!dx&&!dy)return;
    if(gd.tool==='drag'){
      const ct=cameraTransform(canvas),inv=1/Math.max(1e-6,ct.pxScale),dRight=dx*inv,dUp=-dy*inv,b=ct.basis;translateSelectedGeoset(b.right.x*dRight+b.up.x*dUp,b.right.y*dRight+b.up.y*dUp,b.right.z*dRight+b.up.z*dUp);gd.changed=true;
    }else if(gd.tool==='move'){
      const a=gd.g.axes[gd.axis];if(a){const vx=a.screenEnd.x-gd.g.center.x,vy=a.screenEnd.y-gd.g.center.y,sl=Math.max(1,Math.hypot(vx,vy)),ux=vx/sl,uy=vy/sl,pxPerUnit=sl/Math.max(1e-6,gd.g.len),amount=(dx*ux+dy*uy)/Math.max(1e-6,pxPerUnit),d={x:0,y:0,z:0};d[gd.axis]=amount;translateSelectedGeoset(d.x,d.y,d.z);gd.changed=true;}
    }else if(gd.tool==='scale'){
      let factor;if(gd.axis==='uniform')factor=Math.exp((dx-dy)*0.006);else{const a=gd.g.axes[gd.axis],vx=a.screenEnd.x-gd.g.center.x,vy=a.screenEnd.y-gd.g.center.y,sl=Math.max(1,Math.hypot(vx,vy)),amount=(dx*(vx/sl)+dy*(vy/sl));factor=Math.exp(amount*0.008);}factor=clamp(factor,.05,20);let sx=1,sy=1,sz=1;if(gd.axis==='uniform')sx=sy=sz=factor;else if(gd.axis==='x')sx=factor;else if(gd.axis==='y')sy=factor;else sz=factor;scaleSelectedGeoset(sx,sy,sz,gd.pivot);gd.changed=true;
    }else if(gd.tool==='rotate'){
      const ang=Math.atan2(p.y-gd.center.y,p.x-gd.center.x);let delta=ang-gd.lastAngle;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;gd.lastAngle=ang;if(Math.abs(delta)>1e-5){rotateSelectedGeoset(gd.axis,delta,gd.pivot);gd.changed=true;}
    }
    gd.lastX=p.x;gd.lastY=p.y;state.interactingUntil=performance.now()+120;markDirty();
  }
  function finishGeosetTransform(){const gd=state.geosetDrag;if(!gd)return;if(gd.changed){pushGeosetHistorySnapshot(gd.before);renderGeosetUI();diag('info','Geoset',`${gd.tool} applied`,{geoset:gd.index+1,axis:gd.axis});}state.geosetDrag=null;state.geosetHover='';historyChanged();markDirty();}

  async function onPreviewPointerDown(e){
    const canvas=e.target, p=previewPos(e,canvas);
    state.pointer={x:e.clientX,y:e.clientY};
    const paintMode=can3DPaint();
    const cameraGizmoHit=e.button===0&&!state.photoMode?hitCameraOrientationGizmo(p.x,p.y,canvas):null;
    if(cameraGizmoHit){
      e.preventDefault();
      state.cameraGizmoDrag={key:cameraGizmoHit.key,axis:cameraGizmoHit.axis,sign:cameraGizmoHit.sign,startX:p.x,startY:p.y,lastX:p.x,lastY:p.y,moved:false};
      state.cameraGizmoHover=cameraGizmoHit.key;canvas.classList.add('dragging');
      try{canvas.setPointerCapture(e.pointerId);}catch(_){}
      markDirty();return;
    }

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

    // Geoset workspace: direct selection and bind-pose mesh transforms.
    if(geosetEditActive()){
      if(e.button===2||e.button===1){e.preventDefault();state.panDrag=true;canvas.classList.add('dragging');try{canvas.setPointerCapture(e.pointerId);}catch(_){}return;}
      if(e.button===0&&e.altKey){e.preventDefault();state.orbitDrag=true;canvas.classList.add('dragging');try{canvas.setPointerCapture(e.pointerId);}catch(_){}return;}
      if(e.button!==0)return;e.preventDefault();
      const tool=state.geosetTool||'select',gizmoHit=hitGeosetGizmo(p.x,p.y,canvas),hit=state.model?pickHitFromCanvas(p.x,p.y):null;
      if(tool==='select'){
        if(hit&&hit.tri){selectGeoset(hit.tri.geoIndex);state.geosetHover='';}
        try{canvas.setPointerCapture(e.pointerId);}catch(_){}return;
      }
      if(gizmoHit&&state.selectedGeosetIndex>=0){beginGeosetTransform(tool,gizmoHit.axis,p,canvas);state.geosetHover=gizmoHit.axis;canvas.classList.add('dragging');try{canvas.setPointerCapture(e.pointerId);}catch(_){}return;}
      if(hit&&hit.tri){
        const gi=hit.tri.geoIndex;if(gi!==state.selectedGeosetIndex)selectGeoset(gi);
        if(tool==='drag'){beginGeosetTransform('drag','free',p,canvas);canvas.classList.add('dragging');try{canvas.setPointerCapture(e.pointerId);}catch(_){}return;}
      }
      markDirty();return;
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
    if(state.cameraGizmoDrag){
      const gd=state.cameraGizmoDrag,dx=p.x-gd.lastX,dy=p.y-gd.lastY,total=Math.hypot(p.x-gd.startX,p.y-gd.startY);
      if(total>3)gd.moved=true;
      if(gd.moved){
        const m=geometry.viewportMetrics(canvas),sx=Math.max(1e-6,m.cssToCanvasX||1),sy=Math.max(1e-6,m.cssToCanvasY||1);
        state.camera.yaw+=dx/sx*0.0105;state.camera.pitch=clamp(state.camera.pitch+dy/sy*0.0105,-1.55,1.55);state.camera.roll=0;
        gd.lastX=p.x;gd.lastY=p.y;state.interactingUntil=performance.now()+140;invalidatePickCache();markDirty();
      }
      state.pointer={x:e.clientX,y:e.clientY};
    } else if(state.geosetDrag){
      updateGeosetTransform(p,canvas);
      state.pointer={x:e.clientX,y:e.clientY};
    } else if(state.gizmoDrag){
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
      const cgh=!state.photoMode?hitCameraOrientationGizmo(p.x,p.y,canvas):null;
      const cameraHover=cgh?cgh.key:'';
      if(cameraHover!==state.cameraGizmoHover){state.cameraGizmoHover=cameraHover;markDirty();}
      if(cgh){canvas.style.cursor='grab';state.paintCursor=null;state.hoveredHit=null;state.pickedUv=null;drawUvView();return;}
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
        if(geosetEditActive()){
          const gh=hitGeosetGizmo(p.x,p.y,canvas),hoverAxis=gh?gh.axis:'';if(hoverAxis!==state.geosetHover){state.geosetHover=hoverAxis;markDirty();}
          const hit=state.model?pickHitFromCanvas(p.x,p.y):null;state.hoveredHit=hit;state.pickedUv=null;
          canvas.style.cursor=gh?'grab':(state.geosetTool==='drag'&&hit?'move':'crosshair');
        }else{
          const navTool=state.viewportTool||'rotate';
          const gh=state.photoMode||navTool!=='rotate'?null:hitRotationGizmo(p.x,p.y,canvas);
          const hoverAxis=gh?gh.axis:'';
          if(hoverAxis!==state.gizmoHover){state.gizmoHover=hoverAxis;markDirty();}
          canvas.style.cursor=navTool==='move'?'grab':(gh?'grab':'crosshair');
          state.hoveredHit=null;state.pickedUv=null;
        }
      }
    }
    drawUvView();
  }

  function onPreviewPointerUp(e){
    if(state.cameraGizmoDrag){
      const gd=state.cameraGizmoDrag;if(!gd.moved&&gd.axis!=='free')snapCameraToAxis(gd.axis,gd.sign);
      state.cameraGizmoDrag=null;state.cameraGizmoHover='';markDirty();
    }
    if(state.geosetDrag)finishGeosetTransform();
    if(state.paintDrag)diag('debug','Paint','3D paint stroke finished',{textureIndex:state.editorTextureIndex,undo:state.modelHistory.length,redo:state.modelRedo.length});
    state.paintDrag = false;
    state.paintTextureIndex = -1;
    state.orbitDrag = false;
    state.panDrag = false;
    state.gizmoDrag = null;
    e.target.classList.remove('dragging','painting');
    if(state.cameraGizmoHover)e.target.style.cursor='grab'; else if(can3DPaint()) e.target.style.cursor=state.paintCursor&&state.paintCursor.hit?'crosshair':'default'; else if(geosetEditActive())e.target.style.cursor=state.geosetTool==='drag'?'move':'crosshair'; else e.target.style.cursor=(state.viewportTool==='move'?'grab':'crosshair');
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
    if(state.photoMode){state.paintDrag=false;state.orbitDrag=false;state.panDrag=false;state.gizmoDrag=null;state.cameraGizmoDrag=null;state.cameraGizmoHover='';state.paintCursor=null;state.hoveredHit=null;state.pickedUv=null;}
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
      const textureDef=state.model?.textureDefs?.[index]||null,replaceableId=Number(textureDef?.replaceableId||0);
      const canRename=!!String(textureDef?.path||slot.ref||'').trim() && replaceableId===0;
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
                ${state.editingTexturePathIndex===index ? `
                  <div class="model-texture-path-editor">
                    <input class="model-texture-path-input" type="text" value="${escapeHtml(slot.ref||'')}" spellcheck="false" aria-label="Texture import path">
                    <div class="model-texture-path-editor-actions">
                      <button type="button" class="btn tiny save-path">Save</button>
                      <button type="button" class="btn tiny cancel-path">Cancel</button>
                    </div>
                  </div>
                ` : ''}
                ${state.renamingTextureIndex===index ? `
                  <div class="model-texture-path-editor">
                    <input class="model-texture-rename-input" type="text" value="${escapeHtml(basename(slot.ref||slot.resolvedName)||`texture_${index+1}.blp`)}" spellcheck="false" aria-label="New texture file name">
                    <div class="model-mini-note">Rename keeps this texture in the same folder and updates the model texture path automatically.</div>
                    <div class="model-texture-path-editor-actions">
                      <button type="button" class="btn tiny save-rename">Rename</button>
                      <button type="button" class="btn tiny cancel-rename">Cancel</button>
                    </div>
                  </div>
                ` : ''}
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
              <button type="button" class="btn tiny rename-texture" ${canRename ? '' : 'disabled'}>Rename</button>
              <button type="button" class="btn tiny edit-path">Edit Path</button>
            </div>
            ${slot.resolvedName ? `<div class="model-mini-note">Resolved file: ${escapeHtml(slot.resolvedName)}</div>` : ''}
            ${slot.error ? `<div class="warning bad">${escapeHtml(slot.error)}</div>` : ''}
          </div>
        </div>
      `;
      item.querySelector('.pick-texture').addEventListener('click', () => { state.selectedTextureIndex = index; renderTextureList(); updateSelectedTextureLabel(); drawUvView(); markDirty(); });
      item.querySelector('.load-texture').addEventListener('click', () => loadTextureSlot(index));
      item.querySelector('.rename-texture')?.addEventListener('click', () => renameTexture(index));
      item.querySelector('.edit-path').addEventListener('click', () => editTexturePath(index));
      if(state.editingTexturePathIndex===index){
        const input=item.querySelector('.model-texture-path-input');
        const save=()=>commitTexturePathEdit(index,input ? input.value : '');
        item.querySelector('.save-path')?.addEventListener('click',save);
        item.querySelector('.cancel-path')?.addEventListener('click',()=>cancelTexturePathEdit());
        input?.addEventListener('keydown',e=>{
          if(e.key==='Enter'){e.preventDefault();save();}
          else if(e.key==='Escape'){e.preventDefault();cancelTexturePathEdit();}
        });
        requestAnimationFrame(()=>{try{input?.focus();input?.select();}catch(_){}});
      }
      if(state.renamingTextureIndex===index){
        const input=item.querySelector('.model-texture-rename-input');
        const save=()=>commitTextureRename(index,input ? input.value : '');
        item.querySelector('.save-rename')?.addEventListener('click',save);
        item.querySelector('.cancel-rename')?.addEventListener('click',()=>cancelTextureRename());
        input?.addEventListener('keydown',e=>{
          if(e.key==='Enter'){e.preventDefault();save();}
          else if(e.key==='Escape'){e.preventDefault();cancelTextureRename();}
        });
        requestAnimationFrame(()=>{try{input?.focus();input?.select();}catch(_){}});
      }
      list.appendChild(item);
    });
    refreshTexturePreviews();
  }

  function renderGeosetSelect(){
    const sel = $('#modelGeosetSelect');if(!sel)return;const current=sel.value||'all';
    sel.innerHTML = '<option value="all">All geosets</option>';
    if(state.model && state.model.geosets){
      state.model.geosets.forEach((g, i) => {
        const o = document.createElement('option');o.value = String(i);o.textContent = `${isGeosetHidden(i)?'Hidden · ':''}Geoset ${i+1}${g.__cloned?' · Clone':''}${g.name?` · ${g.name}`:''} · ${g.faces.length} tris`;sel.appendChild(o);
      });
    }
    sel.value=Array.from(sel.options).some(o=>o.value===current)?current:'all';
  }

  function renderGeosetUI(){
    const list=$('#modelGeosetList'),count=$('#modelGeosetCount'),info=$('#modelGeosetInfo');if(!list||!count||!info)return;
    const geos=state.model&&state.model.geosets||[];const visible=geos.reduce((n,_,i)=>n+(isGeosetHidden(i)?0:1),0);count.textContent=`${visible}/${geos.length} visible`;
    if(!geos.length){list.className='model-geoset-list empty';list.textContent='Load a model to inspect geosets.';info.textContent='No geoset selected.';return;}
    list.className='model-geoset-list';list.innerHTML='';
    geos.forEach((g,i)=>{
      const item=document.createElement('div');item.className='model-geoset-item'+(i===state.selectedGeosetIndex?' active':'')+(isGeosetHidden(i)?' hidden-geo':'');item.dataset.geosetIndex=String(i);
      const eye=document.createElement('button');eye.type='button';eye.className='model-geoset-eye';eye.title=isGeosetHidden(i)?'Show geoset':'Hide geoset';eye.textContent=isGeosetHidden(i)?'○':'◉';eye.addEventListener('click',e=>{e.stopPropagation();const before=captureGeosetVisibilitySnapshot(isGeosetHidden(i)?'Show geoset':'Hide geoset');toggleGeosetHidden(i,!isGeosetHidden(i));pushModelHistorySnapshot(before);});
      const meta=document.createElement('div');meta.className='model-geoset-item-meta';meta.innerHTML=`<strong>Geoset ${i+1}${g.__cloned?' · Clone':''}${g.name?` · ${escapeHtml(g.name)}`:''}</strong><span>${(g.vertices||[]).length.toLocaleString()} verts · ${(g.faces||[]).length.toLocaleString()} tris · Material ${g.materialId}${g.__geometryEdited?' · edited':''}</span>`;
      item.append(eye,meta);item.addEventListener('click',()=>selectGeoset(i));item.addEventListener('dblclick',()=>selectGeoset(i,{focus:true}));list.appendChild(item);
    });
    const g=selectedGeoset();if(g){const b=geosetBaseBounds();info.textContent=`Selected: Geoset ${state.selectedGeosetIndex+1}${g.__cloned?' · Clone':''}${g.name?` · ${g.name}`:''}\nVertices: ${(g.vertices||[]).length.toLocaleString()} · Triangles: ${(g.faces||[]).length.toLocaleString()} · Material: ${g.materialId}\nBounds: ${b?`${b.size.toFixed(2)} units · center ${b.center.x.toFixed(2)}, ${b.center.y.toFixed(2)}, ${b.center.z.toFixed(2)}`:'—'}${isGeosetHidden(state.selectedGeosetIndex)?'\nHidden in viewport':''}`;}else info.textContent='Click a geoset in the list or use Select in the viewport.';
    const status=$('#modelGeosetToolStatus');if(status)status.textContent=`Tool: ${state.geosetTool[0].toUpperCase()+state.geosetTool.slice(1)} · edits bind-pose geometry`;
    const hideBtn=$('#modelGeosetHideSelected');if(hideBtn)hideBtn.textContent=state.selectedGeosetIndex>=0&&isGeosetHidden(state.selectedGeosetIndex)?'Show selected':'Hide selected';
    document.querySelectorAll('[data-model-geoset-tool]').forEach(b=>{const shelf=!!b.closest('#modelToolShelf');b.classList.toggle('active',b.dataset.modelGeosetTool===state.geosetTool&&(!shelf||state.activePropPanel==='geosets'));});
  }

  function updateSelectedTextureLabel(){
    const slot = state.textures[state.selectedTextureIndex];
    $('#modelSelectedTextureName').textContent = slot ? basename(slot.ref) || `Texture ${state.selectedTextureIndex+1}` : 'No texture selected';
    const paintName=$('#modelPaintTextureName');
    if(paintName){const active=state.textures[state.editorTextureIndex>=0?state.editorTextureIndex:state.selectedTextureIndex];paintName.textContent=active?basename(active.ref):'No texture loaded';}
  }

  function editTexturePath(index){
    if(!state.model || !state.textures[index]) return;
    state.renamingTextureIndex=-1;
    state.editingTexturePathIndex=index;
    renderTextureList();
  }

  function renameTexture(index){
    if(!state.model || !state.textures[index]) return;
    const def=state.model.textureDefs?.[index]||null;
    if(Number(def?.replaceableId||0)!==0 || !String(def?.path||state.textures[index].ref||'').trim()) return;
    state.editingTexturePathIndex=-1;
    state.renamingTextureIndex=index;
    renderTextureList();
  }

  function cancelTextureRename(){
    if(state.renamingTextureIndex<0)return;
    state.renamingTextureIndex=-1;
    renderTextureList();
  }

  function texturePathWithRenamedFile(path,newFileName){
    const current=String(path||'');
    const slash=Math.max(current.lastIndexOf('/'),current.lastIndexOf('\\'));
    return (slash>=0?current.slice(0,slash+1):'')+newFileName;
  }

  function commitTextureRename(index,nextName){
    if(!state.model || !state.textures[index]) return false;
    const slot=state.textures[index],def=state.model.textureDefs?.[index]||null;
    if(Number(def?.replaceableId||0)!==0)return false;
    const currentPath=String(def?.path||slot.ref||'').trim();
    if(!currentPath)return false;
    const historyBefore=captureTexturePathSnapshot(index,'Rename texture');
    let clean=String(nextName||'').trim();
    if(!clean){
      alert('Texture name cannot be empty.');
      requestAnimationFrame(()=>document.querySelector('.model-texture-rename-input')?.focus());
      return false;
    }
    clean=basename(clean);
    if(!clean || clean==='.' || clean==='..' || /[<>:"|?*\/\\]/.test(clean)){
      alert('Enter a valid texture file name without folders or invalid filename characters.');
      requestAnimationFrame(()=>document.querySelector('.model-texture-rename-input')?.focus());
      return false;
    }
    const oldFile=basename(currentPath),oldExt=(oldFile.match(/(\.[^.]+)$/)||[])[1]||'';
    const typedExt=(clean.match(/(\.[^.]+)$/)||[])[1]||'';
    if(oldExt && typedExt && typedExt.toLowerCase()!==oldExt.toLowerCase()){
      alert(`Rename keeps the texture format. Use the ${oldExt} extension.`);
      requestAnimationFrame(()=>document.querySelector('.model-texture-rename-input')?.focus());
      return false;
    }
    if(oldExt && !typedExt)clean+=oldExt;
    const nextPath=texturePathWithRenamedFile(currentPath,clean);
    if(nextPath===currentPath){state.renamingTextureIndex=-1;renderTextureList();return true;}
    const before=currentPath;
    slot.ref=nextPath;slot.pathEdited=true;slot.renamed=true;
    if(def)def.path=nextPath;
    if(state.model.textures)state.model.textures[index]=nextPath;
    if(state.editorTextureIndex===index && typeof app.setCurrentName==='function')app.setCurrentName(clean);
    state.renamingTextureIndex=-1;
    renderTextureList();updateSelectedTextureLabel();renderCoreInfo();drawUvView();
    bumpTextureRevision(index);markDirty();
    diag('info','Texture','Texture renamed and model path updated automatically',{index,before,after:nextPath,sourceFile:slot.resolvedName||'',fileName:clean});
    app.setStatus(`Texture renamed: ${oldFile} → ${clean} · path updated automatically`);
    pushModelHistorySnapshot(historyBefore);
    return true;
  }

  function cancelTexturePathEdit(){
    if(state.editingTexturePathIndex<0)return;
    state.editingTexturePathIndex=-1;
    renderTextureList();
  }

  function commitTexturePathEdit(index,next){
    if(!state.model || !state.textures[index]) return false;
    state.renamingTextureIndex=-1;
    const slot=state.textures[index],def=state.model.textureDefs[index]||null;
    const clean=String(next||'').trim();
    if(!clean && !(def&&def.replaceableId)){
      alert('Custom texture paths cannot be empty unless this slot uses a replaceable ID.');
      requestAnimationFrame(()=>document.querySelector('.model-texture-path-input')?.focus());
      return false;
    }
    const before=slot.ref||'';
    if(clean===before){state.editingTexturePathIndex=-1;renderTextureList();return true;}
    const historyBefore=captureTexturePathSnapshot(index,'Edit texture path');
    slot.ref=clean;
    slot.pathEdited=true;
    if(def) def.path=clean;
    if(state.model.textures) state.model.textures[index]=clean;
    state.editingTexturePathIndex=-1;
    renderTextureList();updateSelectedTextureLabel();renderCoreInfo();drawUvView();
    bumpTextureRevision(index);markDirty();
    diag('info','Texture','Texture import path updated',{index,before,after:clean,resolvedName:slot.resolvedName||''});
    app.setStatus(`Texture path updated: ${clean || '(replaceable texture)'}`);
    pushModelHistorySnapshot(historyBefore);
    return true;
  }

  function downloadModelBlob(blob,name,saveScopes=[]){
    try{app.registerPendingSave?.(name,saveScopes);}catch(_){}
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
  function scaledTextureForExport(slot,maxSize){
    const source=slot&&slot.canvas;if(!source||!source.width||!source.height)return null;
    const limit=Math.max(0,Number(maxSize)||0),largest=Math.max(source.width,source.height);
    if(!limit||largest<=limit){
      const imageData=slot.imageData||source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height);
      return {canvas:source,imageData,width:source.width,height:source.height,scaled:false};
    }
    const scale=limit/largest,w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.clearRect(0,0,w,h);ctx.drawImage(source,0,0,w,h);
    return {canvas,imageData:ctx.getImageData(0,0,w,h),width:w,height:h,scaled:true};
  }
  function textureAlphaProfile(imageData){
    const d=imageData&&imageData.data;if(!d)return{hasAlpha:false,smoothAlpha:false,binaryAlpha:false};
    let hasAlpha=false,smoothAlpha=false,binaryAlpha=false;
    for(let i=3;i<d.length;i+=4){const a=d[i];if(a<250)hasAlpha=true;if(a<=8||a>=247){if(a<=8)binaryAlpha=true;}else smoothAlpha=true;}
    return{hasAlpha,smoothAlpha,binaryAlpha:hasAlpha&&!smoothAlpha};
  }
  function textureQualityValue(options){return Math.max(1,Math.min(100,Number(options&&options.quality)||100));}
  function blpAlphaBitsForQuality(imageData,quality){
    const a=textureAlphaProfile(imageData);if(!a.hasAlpha)return 0;if(!a.smoothAlpha)return 1;
    if(quality>=80)return 8;if(quality>=40)return 4;return 1;
  }
  function modernTextureProfile(){return !!(state.model&&Number(state.model.formatVersion||800)>800);}
  function ddsFormatForQuality(imageData,quality,preferred=''){
    const a=textureAlphaProfile(imageData),pref=String(preferred||'').toUpperCase();
    // BC5 is a two-channel data texture (normally normal-map XY). Never turn it
    // into a color/alpha codec just because the quality slider moved.
    if(pref==='BC5')return'BC5';
    if(quality>=100&&['BC1','BC1A','BC2','BC3'].includes(pref))return pref;
    if(!a.hasAlpha)return'BC1';
    if(!a.smoothAlpha)return'BC1A';
    if(quality<=25)return'BC1A';
    if(pref==='BC2'||pref==='BC3')return pref;
    return'BC3';
  }
  async function canvasEncodedBytes(canvas,imageData,ext,options={}){
    ext=String(ext||'').toLowerCase();const quality=textureQualityValue(options);
    if(ext==='blp'){
      const alpha=textureAlphaProfile(imageData);
      // Opaque BLP1 can use real JPEG quality without changing dimensions. Alpha
      // textures stay on the indexed BLP1 path so transparency is never silently lost.
      if(!alpha.hasAlpha&&quality<100&&typeof BLP.encodeJpeg==='function')return blobBytes(await BLP.encodeJpeg(imageData,{mipmaps:options.mipmaps!==false,quality}));
      return blobBytes(BLP.encodePaletted(imageData,{mipmaps:options.mipmaps!==false,dither:quality<100,alphaBits:blpAlphaBitsForQuality(imageData,quality)}));
    }
    if(ext==='dds')return blobBytes(DDS.encode(imageData,{mipmaps:options.mipmaps!==false,format:ddsFormatForQuality(imageData,quality,options.ddsFormat)}));
    if(ext==='tga')return blobBytes(TGA.encode(imageData));
    const mime=ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='webp'?'image/webp':'image/png';
    const codecQuality=(ext==='jpg'||ext==='jpeg'||ext==='webp')?Math.max(.05,Math.min(.98,quality/100)):undefined;
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Texture encoder returned no data.')),mime,codecQuality));
    return blobBytes(blob);
  }
  function bytesToArrayBuffer(bytes){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}
  function shouldQualityReencode(sourceExt,slot,original,scaled,opts){
    const quality=textureQualityValue(opts);if(quality>=100||!slot||!scaled)return false;
    if(['blp','jpg','jpeg','webp'].includes(sourceExt))return true;
    if(sourceExt!=='dds')return false;
    const alpha=textureAlphaProfile(scaled.imageData);
    if(quality<=25&&alpha.smoothAlpha)return true; // aggressive BC3 -> BC1A option
    if(original){try{const meta=DDS.inspect(bytesToArrayBuffer(original));if(meta&&['BC2','BC3'].includes(meta.format)&&!alpha.hasAlpha)return true;}catch(_){}}
    return false;
  }
  function prettyBytes(n){n=Math.max(0,Number(n)||0);if(n>=1024*1024)return`${(n/1024/1024).toFixed(n>=10*1024*1024?1:2)} MB`;if(n>=1024)return`${(n/1024).toFixed(n>=100*1024?0:1)} KB`;return`${Math.round(n)} B`;}
  async function buildTextureExportFiles(options={}){
    const opts={maxSize:0,format:'keep',mipmaps:true,quality:100,...options},files=[],pathOverrides=[],notes=[];const defs=state.model&&state.model.textureDefs||[];
    const quality=textureQualityValue(opts);let compareIn=0,compareOut=0,compared=0,rebuilt=0;
    if(opts.maxSize)notes.push(`Texture resolution cap: ${opts.maxSize}px (pixel dimensions reduced only when needed; aspect ratio preserved).`);
    if(quality<100)notes.push(`Texture quality target: ${quality}% · same dimensions unless the separate resolution cap is enabled.`);
    if(opts.format&&opts.format!=='keep')notes.push(`Texture output forced to ${String(opts.format).toUpperCase()}.`);
    notes.push(modernTextureProfile()?`Model texture profile: modern Warcraft III HD / Definitive-compatible workflow. DDS paths are preserved when possible; unsupported source bytes are never rewritten unless an export conversion is requested.`:`Model texture profile: Classic / SD workflow. BLP1 and TGA paths are preserved when possible.`);
    for(let idx=0;idx<defs.length;idx++){
      const def=defs[idx]||{},slot=state.textures[idx],rid=Number(def.replaceableId||0),ref=String(def.path||slot&&slot.ref||'');
      if(!ref&&rid){notes.push(`Slot ${idx}: ReplaceableId ${rid} (Warcraft runtime texture; no external file).`);pathOverrides[idx]='';continue;}
      if(!ref){notes.push(`Slot ${idx}: empty texture path.`);continue;}
      let target=safeZipPath(ref,`Textures/texture_${idx}.blp`),sourceExt=(target.split('.').pop()||'').toLowerCase(),ext=sourceExt,bytes=null;
      const scaled=scaledTextureForExport(slot,opts.maxSize),needsResize=!!scaled?.scaled,forced=['blp','dds','tga'].includes(opts.format);
      const original=slot&&originalTextureBytes(slot);let sourceDdsFormat='';
      if(sourceExt==='dds'&&original){try{sourceDdsFormat=DDS.inspect(bytesToArrayBuffer(original))?.format||'';}catch(_){}}
      if(forced){ext=opts.format;target=target.replace(/\.[^/.]+$/,'')+'.'+ext;}
      const qualityReencode=!forced&&shouldQualityReencode(sourceExt,slot,original,scaled,opts);
      const needsReencode=!!slot&&(!!slot.edited||needsResize||forced||qualityReencode);
      if(slot&&!needsReencode)bytes=original;
      if(needsReencode&&scaled){
        if(!['blp','dds','tga','png','jpg','jpeg','webp'].includes(ext)){
          ext=modernTextureProfile()?'dds':'blp';target=target.replace(/\.[^/.]+$/,'')+'.'+ext;notes.push(`Slot ${idx}: ${ref} rebuilt as ${target} because ${sourceExt||'that source format'} cannot be safely encoded by this build.`);
        }
        const encodeOpts={...opts,ddsFormat:(!forced&&sourceExt==='dds'&&ext==='dds')?sourceDdsFormat:''};
        bytes=await canvasEncodedBytes(scaled.canvas,scaled.imageData,ext,encodeOpts);rebuilt++;
        if(needsResize)notes.push(`Slot ${idx}: ${ref} resized ${slot.canvas.width}x${slot.canvas.height} → ${scaled.width}x${scaled.height}.`);
        if(qualityReencode||quality<100){
          if(ext==='blp'){
            const a=textureAlphaProfile(scaled.imageData);notes.push(`Slot ${idx}: BLP1 ${a.hasAlpha?`indexed alpha ${blpAlphaBitsForQuality(scaled.imageData,quality)}-bit`:`JPEG quality ${quality}%`} (${scaled.width}x${scaled.height}).`);
          }else if(ext==='dds')notes.push(`Slot ${idx}: DDS ${ddsFormatForQuality(scaled.imageData,quality,encodeOpts.ddsFormat)}${quality<=25&&textureAlphaProfile(scaled.imageData).smoothAlpha&&encodeOpts.ddsFormat!=='BC5'?' (smooth alpha reduced to 1-bit at aggressive quality)':''}.`);
          else if(ext==='jpg'||ext==='jpeg'||ext==='webp')notes.push(`Slot ${idx}: ${ext.toUpperCase()} quality ${quality}%.`);
        }
      }
      if(!bytes&&slot&&scaled){
        if(!['blp','dds','tga','png','jpg','jpeg','webp'].includes(ext)){ext=modernTextureProfile()?'dds':'blp';target=target.replace(/\.[^/.]+$/,'')+'.'+ext;}
        const encodeOpts={...opts,ddsFormat:(!forced&&sourceExt==='dds'&&ext==='dds')?sourceDdsFormat:''};bytes=await canvasEncodedBytes(scaled.canvas,scaled.imageData,ext,encodeOpts);rebuilt++;
      }
      if(!bytes){
        if(original){bytes=original;target=safeZipPath(ref,`Textures/texture_${idx}.${sourceExt||'blp'}`);notes.push(`Slot ${idx}: kept original ${ref}; pixel data was unavailable for the requested conversion/downscale.`);}
      }
      if(!bytes){notes.push(`Slot ${idx}: ${ref} could not be included because its source pixels were not loaded.`);pathOverrides[idx]=ref;continue;}
      if(original){compareIn+=original.length;compareOut+=bytes.length;compared++;}
      files.push({name:target,data:bytes});pathOverrides[idx]=target.replace(/\//g,'\\');
    }
    const savingsPct=compareIn>0?((compareIn-compareOut)/compareIn*100):0;
    if(compared)notes.push(`Comparable texture payload: ${prettyBytes(compareIn)} → ${prettyBytes(compareOut)} (${savingsPct>=0?'-':'+'}${Math.abs(savingsPct).toFixed(1)}%).`);
    return {files,pathOverrides,notes,stats:{compareIn,compareOut,compared,rebuilt,savingsPct}};
  }
  function clonedModelForPaths(paths){
    const model={...state.model};model.textureDefs=(state.model.textureDefs||[]).map((d,i)=>({...d,path:paths[i]!=null?paths[i]:d.path}));model.textures=model.textureDefs.map(d=>d.path||'');return model;
  }
  function serializeCurrentModel(model=state.model){
    if(!state.model||!state.model.sourceBuffer)throw new Error('No editable MDX / MDL model is loaded.');
    const saver=window.WC3_MODEL_SAVE;if(!saver||!saver.saveEditedModel)throw new Error('Model save module is unavailable.');
    return saver.saveEditedModel(state.model.sourceBuffer,state.model.sourceName||state.model.name,model);
  }
  function buildEditedModelArtifact(){
    if(!state.model||!state.model.sourceBuffer)throw new Error('No editable MDX / MDL model is loaded.');
    const result=serializeCurrentModel(),ext=(result.type||state.model.type||'MDX').toLowerCase(),base=modelBaseName(),filename=`${base}_edited.${ext}`;
    return {result,bytes:result.bytes,blob:new Blob([result.bytes],{type:result.type==='MDL'?'text/plain':'application/octet-stream'}),filename,type:result.type,changes:result.changes||{}};
  }
  async function buildTexturePackageArtifact(options={}){
    if(!state.model)throw new Error('No model is loaded.');
    const pack=await buildTextureExportFiles(options);if(!pack.files.length)throw new Error('No external texture files are available to export.');
    const files=[...pack.files,{name:'WC3_Asset_Studio_Texture_Export.txt',data:['WC3 Asset Studio texture export','',...pack.notes].join('\n')}];
    return {pack,files,blob:SimpleZip.create(files),filename:`${modelBaseName()}_textures.zip`};
  }
  async function buildModelPackageArtifact(options={}){
    if(!state.model||!state.model.sourceBuffer)throw new Error('No editable MDX / MDL model is loaded.');
    const pack=await buildTextureExportFiles(options),packageModel=clonedModelForPaths(pack.pathOverrides),result=serializeCurrentModel(packageModel),ext=(result.type||state.model.type||'MDX').toLowerCase(),base=modelBaseName(),modelName=`${base}_edited.${ext}`;
    const files=[{name:modelName,data:result.bytes},...pack.files],c=result.changes||{};
    files.push({name:'WC3_Asset_Studio_SaveInfo.txt',data:[`Model: ${modelName}`,`Format: ${String(result.type||'').toUpperCase()}`,`Textures included: ${pack.files.length}`,`New cameras: ${c.cameras||0}`,`New ParticleEmitter2: ${c.particleEmitters2||0}`,`New attachments: ${c.attachments||0}`,'',...pack.notes].join('\n')});
    return {pack,result,modelName,files,blob:SimpleZip.create(files),filename:`${base}_edited_package.zip`,changes:c};
  }
  function saveEditedModel(){
    if(!state.model||!state.model.sourceBuffer)return false;
    try{
      const artifact=buildEditedModelArtifact(),c=artifact.changes||{};
      downloadModelBlob(artifact.blob,artifact.filename,['model']);
      app.setStatus(`Model save requested · ${String(artifact.type||'').toUpperCase()} · ${c.cameras||0} camera(s), ${c.particleEmitters2||0} emitter(s), ${c.attachments||0} attachment(s) added`);
      diag('info','Model Save','Edited model serialized',{type:artifact.type,name:artifact.filename,changes:c});return true;
    }catch(e){diag('error','Model Save','Could not save edited model',e);alert('Could not save edited model.\n\n'+(e.message||e));return false;}
  }
  async function exportModelTextures(options={}){
    if(!state.model)return false;
    try{
      const artifact=await buildTexturePackageArtifact(options),pack=artifact.pack;
      downloadModelBlob(artifact.blob,artifact.filename,['modelTextures']);const st=pack.stats||{};const delta=st.compared?` · ${prettyBytes(st.compareIn)} → ${prettyBytes(st.compareOut)} (${st.savingsPct>=0?'-':'+'}${Math.abs(st.savingsPct).toFixed(1)}%)`:'';app.setStatus(`Textures save requested · ${pack.files.length} file(s)${delta}`);return true;
    }catch(e){diag('error','Model Save','Could not export textures',e);alert('Could not export model textures.\n\n'+(e.message||e));return false;}
  }
  async function exportModelPackage(options={}){
    if(!state.model||!state.model.sourceBuffer)return false;
    try{
      const artifact=await buildModelPackageArtifact(options),pack=artifact.pack,c=artifact.changes||{};
      downloadModelBlob(artifact.blob,artifact.filename,['model','modelTextures']);const st=pack.stats||{};const delta=st.compared?` · textures ${prettyBytes(st.compareIn)} → ${prettyBytes(st.compareOut)} (${st.savingsPct>=0?'-':'+'}${Math.abs(st.savingsPct).toFixed(1)}%)`:'';app.setStatus(`Full model package save requested · ${pack.files.length} texture(s)${delta}`);diag('info','Model Save','Model + texture package exported',{model:artifact.modelName,textures:pack.files.length,changes:c,notes:pack.notes,stats:pack.stats});return true;
    }catch(e){diag('error','Model Save','Could not save model package',e);alert('Could not save model + textures package.\n\n'+(e.message||e));return false;}
  }

  async function loadTextureSlot(index){
    const slot = state.textures[index];
    if(!slot || !slot.imageData || slot.error) return;
    state.editorTextureLoading = true;
    try{
      state.selectedTextureIndex = index;
      state.editorTextureIndex = index;
      state.editingTexturePathIndex = -1;
      state.renamingTextureIndex = -1;

      // Switch to Texture Paint before fitting the document. Fitting while Model
      // Lab was active used the hidden canvas stage size and could force a tiny zoom.
      if(window.WC3_WORKSPACE_UI?.openModule) window.WC3_WORKSPACE_UI.openModule('texture');
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

      await app.openImageData(slot.imageData, basename(slot.ref) || `texture_${index+1}`, { comfortableFit:true });
      app.fitTextureView?.({comfortable:true});

      diag('info','Texture',`Model texture opened for paint`,{index,ref:slot.ref,resolvedName:slot.resolvedName,width:slot.width,height:slot.height,format:slot.format,workspace:'texture',zoom:app.editor?.zoom});
      renderTextureList();
      updateSelectedTextureLabel();
      drawUvView();
      sync3DPaintUi();
      markDirty();
    }finally{
      state.editorTextureLoading = false;
      window.dispatchEvent(new CustomEvent('wc3-texture-paint-ready',{detail:{index}}));
    }
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
    const nameInput=$('#modelSequenceNameInput');if(nameInput&&document.activeElement!==nameInput)nameInput.value=seq?seq.name:'';
    for(const id of ['#modelSequenceCloneBtn','#modelSequenceRenameBtn','#modelSequenceApplyTransformBtn']){const b=$(id);if(b)b.disabled=!seq;}
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


  function renderEffectsUI(){
    const info=$('#modelEffectsInfo'),list=$('#modelEffectsList'),count=$('#modelEffectCount');
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
      if(texNames.length)parts.push(`Emitter texture: ${texNames.join(', ')}`);
      const decoded=[...new Set(state.casc.effectTextures.values())].length;
      if(state.casc.enabled)parts.push(`CASC emitter textures: ${decoded} decoded`);
      else parts.push('CASC emitter textures: not connected');
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
    renderGeosetUI();
    renderSequenceUI();
    renderRigUI();
    renderMaterialUI();
    renderEffectsUI();
    renderAuthoringUI();
    renderCoreInfo();
    drawUvView();
    updateFxSourceWarning();
    try{window.dispatchEvent(new CustomEvent('wc3-model-refresh'));}catch(_){}
  }

  function onSequenceSelect(){
    state.animation.playing = false;
    resetSequenceTransformFields();
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

    // Geosets gets its own property sub-tab because mesh visibility and transforms
    // are a distinct workflow from camera navigation and UV inspection.
    const geosetsPanel = document.createElement('section');
    geosetsPanel.className = 'panel model-geosets-panel';
    geosetsPanel.dataset.modelPropPanel = 'geosets';
    geosetsPanel.innerHTML = `
      <div class="panel-heading model-geoset-heading">
        <div><div class="panel-title">GEOSETS</div><span class="model-panel-subtitle">Select mesh parts, hide them and edit bind-pose geometry.</span></div>
        <span class="mini-pill" id="modelGeosetCount">0/0 visible</span>
      </div>
      <div class="model-geoset-tools" aria-label="Geoset tools">
        <button class="btn small active" data-model-geoset-tool="select" type="button" title="Select a geoset in the viewport">Select</button>
        <button class="btn small" data-model-geoset-tool="move" type="button" title="Move the selected geoset on X, Y or Z">Move</button>
        <button class="btn small" data-model-geoset-tool="drag" type="button" title="Drag the selected geoset freely in the screen plane">Drag</button>
        <button class="btn small" data-model-geoset-tool="scale" type="button" title="Scale the selected geoset by axis or uniformly">Scale</button>
        <button class="btn small" data-model-geoset-tool="rotate" type="button" title="Rotate the selected geoset around X, Y or Z">Rotate</button>
      </div>
      <div class="model-geoset-actions">
        <button class="btn tiny" id="modelGeosetShowAll" type="button">Show all</button>
        <button class="btn tiny" id="modelGeosetHideSelected" type="button">Hide selected</button>
        <button class="btn tiny" id="modelGeosetFocusSelected" type="button">Focus</button>
        <button class="btn tiny" data-model-geoset-action="clone" type="button" title="Duplicate the selected geoset with its material, UVs, skinning and visibility animation">Clone</button>
      </div>
      <div class="model-mini-note model-geoset-tool-status" id="modelGeosetToolStatus">Tool: Select · edits bind-pose geometry</div>
      <div class="model-info-box compact model-geoset-info" id="modelGeosetInfo">No geoset selected.</div>
      <div class="model-geoset-list empty" id="modelGeosetList">Load a model to inspect geosets.</div>
      <div class="model-mini-note model-geoset-help">Alt + Left orbits · Right/Middle pans. Transform edits are written into MDX/MDL when you use Save Model.</div>`;

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
        <button class="model-shelf-tool" data-model-nav-tool="move" type="button" title="Pan camera (left drag)"><span>✥</span><small>Cam Pan</small></button>
        <button class="model-shelf-tool active" data-model-nav-tool="rotate" type="button" title="Orbit camera (left drag)"><span>⟳</span><small>Cam Orbit</small></button>
        <div class="model-shelf-sep"></div>
        <button class="model-shelf-tool" data-model-geoset-tool="select" type="button" title="Select geoset"><span>▱</span><small>Geo Select</small></button>
        <button class="model-shelf-tool" data-model-geoset-tool="move" type="button" title="Move geoset on an axis"><span>↔</span><small>Geo Move</small></button>
        <button class="model-shelf-tool" data-model-geoset-tool="drag" type="button" title="Drag geoset freely"><span>✣</span><small>Geo Drag</small></button>
        <button class="model-shelf-tool" data-model-geoset-tool="scale" type="button" title="Scale geoset"><span>⇲</span><small>Geo Scale</small></button>
        <button class="model-shelf-tool" data-model-geoset-tool="rotate" type="button" title="Rotate geoset"><span>⟳</span><small>Geo Rotate</small></button>
        <button class="model-shelf-tool" data-model-geoset-action="clone" type="button" title="Clone selected geoset"><span>⧉</span><small>Geo Clone</small></button>
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
        <button data-model-prop="geosets" type="button">Geosets</button>
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
      geosets: geosetsPanel,
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
      const wc3LibraryBtn=$('#modelWarcraftLibraryBtn');if(wc3LibraryBtn)wc3LibraryBtn.classList.remove('active');
      const canvas=$('#model3dCanvas');
      if(canvas){
        canvas.classList.toggle('paint-mode',can3DPaint());
        canvas.style.cursor=key==='geosets'?(state.geosetTool==='drag'?'move':'crosshair'):'';
      }
      if(key==='geosets'){
        state.gizmoVisible=false;state.gizmoHover='';state.paintCursor=null;
        if(state.model&&state.selectedGeosetIndex<0&&state.model.geosets?.length)state.selectedGeosetIndex=0;
        renderGeosetUI();
      }
      toolHost.querySelectorAll('[data-model-geoset-tool]').forEach(b=>b.classList.toggle('active',key==='geosets'&&b.dataset.modelGeosetTool===state.geosetTool));
      historyChanged();
      // Re-evaluate the CASC/FX banner immediately when switching sub-tabs so
      // it disappears as soon as Effects is no longer active.
      updateFxSourceWarning();
      markDirty();
    };
    const onPanelClick=(btn,event)=>{
      const key=btn.dataset.modelProp||btn.dataset.modelPanel;
      activatePanel(key);
      // Only a real user click may touch Warcraft game files. Programmatic tab
      // changes (including Auto Test) must stay offline.
      if(key==='effects'&&event?.isTrusted){
        ensureCascOnDemand({enableEffects:true,resolveTextures:true,reason:'effects-tab'}).catch(e=>diag('error','CASC','On-demand Effects access failed',e));
      }
    };
    propsHost.querySelectorAll('[data-model-prop]').forEach(btn=>btn.addEventListener('click',event=>onPanelClick(btn,event)));
    toolHost.querySelectorAll('[data-model-panel]').forEach(btn=>btn.addEventListener('click',event=>onPanelClick(btn,event)));

    toolHost.querySelectorAll('[data-model-tool]').forEach(btn=>btn.addEventListener('click',()=>{
      const tool = btn.dataset.modelTool;
      const source = document.querySelector(`[data-model-paint-tool="${tool}"]`);
      if(source) source.click();
      activatePanel('paint');
      toolHost.querySelectorAll('[data-model-tool]').forEach(b=>b.classList.toggle('active', b===btn));
      toolHost.querySelectorAll('[data-model-nav-tool]').forEach(b=>b.classList.remove('active'));
      toolHost.querySelectorAll('[data-model-geoset-tool]').forEach(b=>b.classList.remove('active'));
    }));
    toolHost.querySelectorAll('[data-model-nav-tool]').forEach(btn=>btn.addEventListener('click',()=>{
      state.viewportTool=btn.dataset.modelNavTool||'rotate';
      state.gizmoDrag=null; state.gizmoHover=''; state.paintDrag=false;
      activatePanel('view');
      toolHost.querySelectorAll('[data-model-nav-tool]').forEach(b=>b.classList.toggle('active', b===btn));
      toolHost.querySelectorAll('[data-model-tool]').forEach(b=>b.classList.remove('active'));
      toolHost.querySelectorAll('[data-model-geoset-tool]').forEach(b=>b.classList.remove('active'));
      const canvas=$('#model3dCanvas'); if(canvas) canvas.style.cursor=state.viewportTool==='move'?'grab':'crosshair';
      diag('info','Viewport',`Navigation tool: ${state.viewportTool}`);
      markDirty();
    }));

    document.querySelectorAll('[data-model-geoset-tool]').forEach(btn=>btn.addEventListener('click',()=>{
      setGeosetTool(btn.dataset.modelGeosetTool||'select');
      activatePanel('geosets');
      toolHost.querySelectorAll('[data-model-tool]').forEach(b=>b.classList.remove('active'));
      toolHost.querySelectorAll('[data-model-nav-tool]').forEach(b=>b.classList.remove('active'));
      toolHost.querySelectorAll('[data-model-geoset-tool]').forEach(b=>b.classList.toggle('active',b.dataset.modelGeosetTool===state.geosetTool));
      renderGeosetUI();
    }));
    $('#modelGeosetShowAll')?.addEventListener('click',()=>{
      if(!state.hiddenGeosets.size)return;
      const before=captureGeosetVisibilitySnapshot('Show all geosets');
      state.hiddenGeosets.clear();invalidateGeometryCache();renderGeosetSelect();renderGeosetUI();drawUvView();markDirty();pushModelHistorySnapshot(before);
    });
    $('#modelGeosetHideSelected')?.addEventListener('click',()=>{
      if(state.selectedGeosetIndex<0)return;
      const before=captureGeosetVisibilitySnapshot(isGeosetHidden(state.selectedGeosetIndex)?'Show geoset':'Hide geoset');
      const hidden=isGeosetHidden(state.selectedGeosetIndex);toggleGeosetHidden(state.selectedGeosetIndex,!hidden);renderGeosetSelect();pushModelHistorySnapshot(before);
    });
    $('#modelGeosetFocusSelected')?.addEventListener('click',()=>{
      if(state.selectedGeosetIndex>=0)selectGeoset(state.selectedGeosetIndex,{focus:true});
    });
    document.querySelectorAll('[data-model-geoset-action="clone"]').forEach(btn=>btn.addEventListener('click',()=>{
      activatePanel('geosets');
      cloneSelectedGeoset();
      toolHost.querySelectorAll('[data-model-tool],[data-model-nav-tool]').forEach(b=>b.classList.remove('active'));
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
    renderGeosetUI();
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
        if(model){ const opened=await openModelFile(model,{warnMissing:false}); if(!opened)return; if(textures.length) await addTextureFiles(textures); await promptForMissingGameTextures(); }
        else if(textures.length){ await addTextureFiles(textures); }
      });
    }
    $('#modelFileInput').addEventListener('change', e => { openModelFile(e.target.files[0]); e.target.value=''; });
    $('#modelTextureInput').addEventListener('change', e => { addTextureFiles(e.target.files); e.target.value=''; });
    $('#saveEditedModelBtn')?.addEventListener('click', ()=>app.openSaveDialog?.('model'));
    $('#exportModelTexturesBtn')?.addEventListener('click', ()=>app.openSaveDialog?.('textures'));
    $('#exportModelPackageBtn')?.addEventListener('click', ()=>app.openSaveDialog?.('package'));
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
    $('#modelSequenceCloneBtn')?.addEventListener('click', duplicateSelectedSequence);
    $('#modelSequenceRenameBtn')?.addEventListener('click', renameSelectedSequence);
    $('#modelSequenceApplyTransformBtn')?.addEventListener('click', applySelectedSequenceTransform);
    $('#modelSequenceTransformResetBtn')?.addEventListener('click', resetSequenceTransformFields);
    $('#modelSequenceNameInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();renameSelectedSequence();}});
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
    const cascToggle=$('#modelUseCascEffects');if(cascToggle)cascToggle.addEventListener('change',async()=>{state.casc.enabled=!!cascToggle.checked;diag('info','CASC',`CASC FX ${state.casc.enabled?'enabled':'disabled'}`);if(!state.casc.enabled){setCascStatusUi('Warcraft game files are not accessed automatically. External FX access is off.');markDirty();return;}await ensureCascOnDemand({enableEffects:true,resolveTextures:true,reason:'fx-toggle'});markDirty();});
    const cascSetup=$('#modelCascSetupBtn');if(cascSetup)cascSetup.addEventListener('click',()=>ensureCascOnDemand({enableEffects:true,resolveTextures:true,reason:'connect-button'}));
    const cascFolder=$('#modelCascChooseFolderBtn');if(cascFolder)cascFolder.addEventListener('click',async()=>{const bridge=cascBridge();if(!bridge?.chooseInstallFolder)return;try{cascFolder.disabled=true;const r=await bridge.chooseInstallFolder();if(r?.valid){setCascStatusUi(`Warcraft folder saved: ${r.installPath}`,'ready');diag('info','CASC','Warcraft installation folder changed',{installPath:r.installPath});}else if(!r?.canceled)setCascStatusUi('Warcraft III installation folder is not configured.','error');await refreshCascStatus();}catch(e){setCascStatusUi(`Warcraft folder selection failed: ${e.message||e}`,'error');diag('error','CASC','Warcraft folder selection failed',e);}finally{cascFolder.disabled=false;}});
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
    // Do not keep the heavy Model Lab / ParticleEmitter2 renderer alive while
    // another workspace (Effects Lab, CASC, Log, etc.) is active. The old loop
    // could continue rendering dozens of emitters behind hidden panels and was
    // visible in runtime logs as 250-300 ms frames after leaving Model Lab.
    const modelWorkspaceActive = document.body?.dataset?.module === 'model';
    if(state.mode === 'model' && modelWorkspaceActive){
      tickAnimation(ts);
      const nowFast=fastPreviewActive();
      if(state.lastFastPreview && !nowFast) state.needsRender=true;
      state.lastFastPreview=nowFast;
      const spin = +($('#modelSpinSpeed') && $('#modelSpinSpeed').value || 0);
      const active = state.animation.playing || state.fxPreviewMode || spin > 0 || state.orbitDrag || state.paintDrag || !!(state.referenceModel?.visible && state.activePropPanel==='assets' && (state.referenceModel?.runtime?.trackCount || state.referenceModel?.runtime?.parsed?.sequences?.length || state.referenceModel?.model?.particleEmitters2?.length));
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
    } else if(state.mode !== 'model' && state.needsRender){
      state.needsRender = false;
    }
    requestAnimationFrame(loop);
  }

  window.MODEL_LAB_API = {
    async openModel(file, textureFiles=[], options={}){
      const promptMissing=options?.promptMissing!==false;
      const opened=await openModelFile(file,{warnMissing:!(textureFiles&&textureFiles.length),promptMissing,sourcePath:String(options&&options.sourcePath||''),skipUnsavedPrompt:options?.skipUnsavedPrompt===true});
      if(!opened)return null;
      if(textureFiles && textureFiles.length){
        await addTextureFiles(textureFiles);
        if(promptMissing)await promptForMissingGameTextures();
      }
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
    internals:{
      renderEverything,renderSequenceUI,renderRigUI,renderMaterialUI,renderEffectsUI,renderAuthoringUI,renderGeosetUI,renderGeosetSelect,
      selectGeoset,pushModelHistorySnapshot,captureAnimationSnapshot,captureModelEditSnapshot,captureGeosetSnapshot,captureGeosetStructureSnapshot,
      markDirty,invalidateGeometryCache,invalidatePickCache,focusNodeInViewport,selectedSequenceIndex,currentSequence,currentSequenceProgress,
      rebuildNodeTypeArrays,cloneHistoryData,translateSelectedGeoset,scaleSelectedGeoset,rotateSelectedGeoset,cloneSelectedGeoset,buildTextureExportFiles,clonedModelForPaths,serializeCurrentModel,buildEditedModelArtifact,buildTexturePackageArtifact,buildModelPackageArtifact,autoLoadMissingModelTexturesFromCasc,searchCascTextureCandidates,
      setReferenceModel,clearReferenceModel,setReferenceTransform,selectReferenceItem,referenceModelState,frameReferenceScene,copyReferenceGeoset,copyReferenceObject,addEffectAttachmentFromPath,captureReferenceImportSnapshot,ensureCascOnDemand,loadCascEffectAssets,prepareReferenceModelRuntime,prepareReferenceModelRuntimesBatch,drawRuntimeAssetPreview,modelPrimaryLod,modelRenderableGeosetEntries,modelLodSummary,renderableModelBounds,hdMaterialInfo,hdMaterialSample,particleCompositeMode,particleSpriteTexture,referenceLayerPolicy,referenceLayerStackPolicy,renderGlReferenceModel,addedObjectEntries,applyAddedObjectTransform,cloneAddedObject,attachAddedObjectToBone,detachAddedObjectFromBone,focusAddedObject,setParticleEmitterTiming,buildParticleVisibilityTrack,particleHeartbeatSignature,particleHeartbeatDecision,particleHeartbeatStats,maybeLogParticleHeartbeat
    },
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
      history:{
        state:modelHistoryState,
        pushPaint:pushPaintHistory,
        captureGeoset:captureGeosetSnapshot,
        pushGeoset:pushGeosetHistorySnapshot,
        cloneGeoset:cloneSelectedGeoset,
        selectGeoset,
        translateGeoset(dx=0,dy=0,dz=0){const before=captureGeosetSnapshot(state.selectedGeosetIndex,'Move geoset');if(!before)return false;translateSelectedGeoset(dx,dy,dz);return pushGeosetHistorySnapshot(before);}
      },
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
    addEffectAttachmentFromPath,
    setReferenceModel,
    clearReferenceModel,
    setReferenceTransform,
    selectReferenceItem,
    getReferenceModelState:referenceModelState,
    frameReferenceScene,
    copyReferenceGeoset,
    copyReferenceObject,
    addedObjectEntries,
    applyAddedObjectTransform,
    cloneAddedObject,
    attachAddedObjectToBone,
    detachAddedObjectFromBone,
    focusAddedObject,
    setParticleEmitterTiming,
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
  setCascStatusUi('Warcraft game files are not accessed automatically. Open Effects or search for missing textures to connect.');
  sync3DPaintUi();
  updateZoomUi();
  setMode('inspector');
  drawUvView();
  requestAnimationFrame(loop);

})();
