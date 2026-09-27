(function(){
  'use strict';
  const app = window.BLP_PAINT_APP;
  const labCore = window.WC3_MODEL_CORE;
  const modelCore = window.WAR3_MODEL_CORE;
  if(!app || !labCore || !modelCore) return;
  const core = {...labCore, parseMDL:modelCore.parseMDL, parseMDX:modelCore.parseMDX};
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const state = { batch:null, report:[], sourceLabel:'', entries:[], lastFix:null, fixRunning:false, saveBinaryOverride:null, testMode:false };
  const ORDER = { error:5, severe:4, warning:3, unused:2, info:1, ok:0 };
  const NATIVE_TEXTURE_EXT = new Set(['blp','tga','dds']);
  const IMAGE_EXT = new Set(['blp','tga','dds','png','jpg','jpeg','webp','bmp','gif']);
  const MODEL_EXT = new Set(['mdx','mdl']);
  const KNOWN_SEQUENCE_TOKENS = new Set(['attack','birth','cinematic','death','decay','dissipate','morph','portrait','sleep','spell','stand','walk','ready']);
  const REPLACEABLE_IDS = new Set([1,2,11,21,31,32,33,34,35,36,37]);

  function ext(name){ const m=String(name||'').toLowerCase().match(/\.([^.\\/]+)$/); return m ? m[1] : ''; }
  function basename(path){ return core.basename(path); }
  function norm(path){ return core.normalizePath(path); }
  function isPOT(n){ return n > 0 && (n & (n - 1)) === 0; }
  function abOf(entry){
    const d = entry.data;
    if(d instanceof ArrayBuffer) return d;
    if(ArrayBuffer.isView(d)) return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
    throw new Error('Entry has no readable binary data.');
  }
  function issue(severity, message, object){ return { severity, message, object:object || '' }; }
  function worstSeverity(issues){ let best='ok', value=0; for(const it of issues){ const n=ORDER[it.severity]||0; if(n>value){value=n;best=it.severity;} } return best; }
  function fmtBytes(n){ if(n < 1024) return `${n} B`; if(n < 1024*1024) return `${(n/1024).toFixed(1)} KB`; return `${(n/1024/1024).toFixed(2)} MB`; }
  function gameTexturePath(path){
    const p=norm(path);
    return /^(textures|replaceabletextures|units|abilities|doodads|objects|ui|sharedmodels|environment|terrainart|buildings|creatures|items)\//.test(p);
  }
  function standaloneTextureRefs(parsed){
    const out=[];
    for(const d of parsed?.textureDefs||[]){
      const rid=Number(d?.replaceableId||0),ref=String(d?.path||'').trim();
      // Match Model Lab's automatic folder lookup: explicit textures are searched,
      // while team-color/team-glow replaceables do not need a disk texture.
      if(ref&&rid!==1&&rid!==2&&!out.some(x=>norm(x)===norm(ref)))out.push(ref);
    }
    return out;
  }
  function standaloneTextureResolved(scan,path){
    if(!scan?.resolvedByRef)return null;
    return scan.resolvedByRef[norm(path)]||null;
  }
  async function scanStandaloneModelTextures(entry,parsed,bridgeOverride=null){
    const refs=standaloneTextureRefs(parsed),bridge=bridgeOverride||window.WC3_LOCAL_FILES;
    const source=entry?.sourceFile||entry?.sourcePath||'';
    const base={attempted:false,ok:false,requested:refs.length,found:0,missing:refs.slice(),resolvedByRef:{},scannedFiles:0,truncated:false,modelPath:String(entry?.sourcePath||'')};
    if(!refs.length)return{...base,ok:true,missing:[]};
    if(!source||!bridge||typeof bridge.scanModelTextures!=='function')return{...base,reason:'Local model path / texture scan bridge is unavailable.'};
    try{
      const reply=await bridge.scanModelTextures(source,refs);
      const resolvedByRef={};
      for(const rec of reply?.files||[]){
        const key=norm(rec?.requestedPath||'');if(!key)continue;
        resolvedByRef[key]={requestedPath:String(rec.requestedPath||''),resolvedPath:String(rec.resolvedPath||''),relativePath:String(rec.relativePath||''),size:Number(rec.size)||0};
      }
      return{attempted:true,ok:!!reply?.ok,requested:refs.length,found:Object.keys(resolvedByRef).length,missing:Array.isArray(reply?.missing)?reply.missing.slice():refs.filter(x=>!resolvedByRef[norm(x)]),resolvedByRef,scannedFiles:Number(reply?.scannedFiles)||0,truncated:!!reply?.truncated,modelPath:String(reply?.modelPath||entry?.sourcePath||''),modelDir:String(reply?.modelDir||''),reason:String(reply?.reason||'')};
    }catch(e){
      return{...base,attempted:true,reason:e?.message||String(e)};
    }
  }
  function finiteVertex(v){ return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }
  function finiteUv(v){ return Number.isFinite(v.u) && Number.isFinite(v.v); }

  function restPoseGeometryStats(parsed){
    let total=0,below=0,minZ=Infinity,maxZ=-Infinity;
    for(const g of parsed?.geosets||[])for(const v of g?.vertices||[]){
      const z=Number(v?.z);if(!Number.isFinite(z))continue;total++;if(z<0)below++;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
    }
    if(!total)return{total:0,below:0,belowRatio:0,minZ:0,maxZ:0,centerZ:0,height:0};
    return{total,below,belowRatio:below/total,minZ,maxZ,centerZ:(minZ+maxZ)/2,height:maxZ-minZ};
  }
  function rootTranslationStats(parsed){
    const roots=(parsed?.nodes||[]).filter(n=>n&&(n.parentId==null||Number(n.parentId)<0)),zs=[];
    for(const n of roots){const tr=n?.tracks?.KGTR||n?.translation;if(!Array.isArray(tr?.keys))continue;for(const k of tr.keys||[]){const z=Number(k?.value?.[2]);if(Number.isFinite(z))zs.push(z);}}
    return{roots:roots.length,keys:zs.length,minZ:zs.length?Math.min(...zs):0,maxZ:zs.length?Math.max(...zs):0,maxPositiveZ:zs.length?Math.max(0,...zs):0,maxAbsZ:zs.length?Math.max(...zs.map(Math.abs)):0};
  }
  function analyzeSpatialCompatibility(parsed,issues){
    const rest=restPoseGeometryStats(parsed),root=rootTranslationStats(parsed);
    const buried=rest.total>=3&&rest.belowRatio>=.95&&rest.maxZ<=5&&rest.minZ<-32;
    if(buried){
      const pct=Math.round(rest.belowRatio*1000)/10;
      issues.push(issue('severe',`Rest-pose geometry is ${pct}% below Z=0 (Z ${rest.minZ.toFixed(2)}..${rest.maxZ.toFixed(2)}); the model can appear buried/invisible before an animation is applied.`,'Model geometry'));
      const liftThreshold=Math.max(64,Math.abs(rest.centerZ)*.5);
      if(root.maxPositiveZ>=liftThreshold)issues.push(issue('warning',`Root animation raises Z by up to ${root.maxPositiveZ.toFixed(2)} while the rest-pose mesh is buried; preview/game placement depends on sequence initialization.`,'Root animation'));
    }
    return{rest,root,buried};
  }

  function cloneModelGraph(parsed){
    if(typeof structuredClone==='function')return structuredClone(parsed);
    return JSON.parse(JSON.stringify(parsed));
  }
  function median(values){
    const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
    if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }
  function shiftExtentZ(ext,delta){
    if(!ext||!Number.isFinite(delta)||!delta)return;
    if(Array.isArray(ext.min)&&Array.isArray(ext.max)){ext.min[2]=Number(ext.min[2]||0)+delta;ext.max[2]=Number(ext.max[2]||0)+delta;}
    else if(ext.min&&ext.max){ext.min.z=Number(ext.min.z||0)+delta;ext.max.z=Number(ext.max.z||0)+delta;}
  }
  function cloneKey(src,frame){
    const key={frame,value:Array.isArray(src?.value)?[...src.value]:src?.value};
    if(Array.isArray(src?.inTan))key.inTan=[...src.inTan];
    if(Array.isArray(src?.outTan))key.outTan=[...src.outTan];
    return key;
  }
  function trackInterpIndex(track){
    if(Number.isFinite(Number(track?.interpolationType)))return Math.max(0,Math.min(3,Math.trunc(Number(track.interpolationType))));
    return Math.max(0,['DontInterp','Linear','Hermite','Bezier'].indexOf(String(track?.interpolation||'')));
  }
  function isVisibilityTrack(tag,label){
    return new Set(['KLAV','KATV','KPEV','KP2V','KPPV','KRVS']).has(String(tag||''))||/\bVisibility\b/i.test(String(label||''));
  }
  function sameKeyPayload(a,b){
    const same=(x,y)=>JSON.stringify(x??null)===JSON.stringify(y??null);
    return same(a?.value,b?.value)&&same(a?.inTan,b?.inTan)&&same(a?.outTan,b?.outTan);
  }
  function initRepairActions(){
    return{
      profile:'smart-safe-v4.1',details:[],skipped:[],skippedTruncated:0,totalChanges:0,
      particleEmitterTime:0,openingKeys:0,closingKeys:0,trackSorts:0,duplicateKeysRemoved:0,
      outsideKeysRemoved:0,globalSequenceKeysRemoved:0,visibilityInterpolation:0,globalSequenceFallbacks:0,
      extentsNormalized:0,sequenceExtentsRebuilt:0,geosetAnimationsRemoved:0,
      duplicateGeosetAnimationsRemoved:0,boneReferencesFixed:0,particleEmitterFieldsFixed:0,
      materialFieldsFixed:0,textureFieldsFixed:0,geosetMaterialRefsFixed:0,layerTextureRefsFixed:0,particleEmitterTextureRefsFixed:0,normalsRecomputed:0,matrixReferencesFixed:0,pivotsAdded:0,skinWeightsNormalized:0,skinInvalidInfluencesRemoved:0,
      spatialNormalized:false,spatialDelta:0,rootId:null
    };
  }
  function recordFix(actions,key,target,before,after,note='',count=1,safety='safe'){
    count=Math.max(1,Math.trunc(Number(count)||1));actions[key]=(actions[key]||0)+count;actions.totalChanges+=count;
    actions.details.push({fix:key,count,target:String(target||''),before,after,note:String(note||''),safety});
  }
  function recordSkip(actions,target,reason,kind='unsafe-to-infer'){
    if(actions.skipped.length<120)actions.skipped.push({target:String(target||''),reason:String(reason||''),kind});
    else actions.skippedTruncated++;
  }
  function repairableTrackContexts(parsed){
    const out=[],seen=new Set();
    const add=(obj,label,kind)=>{
      if(!obj?.tracks||seen.has(obj))return;seen.add(obj);
      for(const [tag,track] of Object.entries(obj.tracks||{}))if(track)out.push({obj,track,tag,label:`${label} ${tag}`,kind});
    };
    for(const n of parsed?.nodes||[]){
      if(n?.type==='Bone'||n?.type==='Helper')add(n,`${n.type} ${n.id}`,'rig');
      else if(n?.type==='ParticleEmitter2')add(n,`ParticleEmitter2 ${n.id}`,'effects');
    }
    (parsed?.materials||[]).forEach((m,mi)=>(m?.layers||[]).forEach((l,li)=>add(l,`Material ${mi} Layer ${li}`,'material')));
    (parsed?.geosetAnimations||[]).forEach((g,i)=>add(g,`GeosetAnimation ${i}`,'geosetAnimation'));
    (parsed?.cameras||[]).forEach((c,i)=>add(c,`Camera ${i}`,'camera'));
    return out;
  }
  function markTrackOwnerEdited(model,ctx){
    if(ctx.kind==='rig'){model.__rigEdited=true;model.__animationKeyEdited=true;}
    else if(ctx.kind==='effects')model.__effectsEdited=true;
    else if(ctx.kind==='material')model.__materialEdited=true;
    else if(ctx.kind==='geosetAnimation')model.__geosetAnimationsEdited=true;
    else if(ctx.kind==='camera')model.__cameraEdited=true;
  }
  function openingKeyRepairTargets(parsed){
    const out=[];
    for(const ctx of repairableTrackContexts(parsed)){
      const tr=ctx.track;if(!Array.isArray(tr?.keys)||tr.keys.length<2||Number(tr.globalSequenceId)>=0||trackInterpIndex(tr)===0)continue;
      for(const seq of parsed?.sequences||[]){
        const keys=tr.keys.filter(k=>k.frame>=seq.start&&k.frame<=seq.end).sort((a,b)=>a.frame-b.frame);
        if(keys.length>1&&keys[0].frame!==seq.start&&!valuesEqual(keys[0].value,keys[keys.length-1].value))
          out.push({...ctx,sequence:seq,sourceKey:keys[0]});
      }
    }
    return out;
  }
  function closingKeyRepairTargets(parsed){
    const out=[];
    for(const ctx of repairableTrackContexts(parsed)){
      const tr=ctx.track;if(!Array.isArray(tr?.keys)||tr.keys.length<2||Number(tr.globalSequenceId)>=0||trackInterpIndex(tr)===0)continue;
      for(const seq of parsed?.sequences||[]){
        const keys=tr.keys.filter(k=>k.frame>=seq.start&&k.frame<=seq.end).sort((a,b)=>a.frame-b.frame);
        if(keys.length>1&&keys[keys.length-1].frame!==seq.end&&!valuesEqual(keys[0].value,keys[keys.length-1].value))
          out.push({...ctx,sequence:seq,sourceKey:keys[keys.length-1]});
      }
    }
    return out;
  }
  function repairAnimationTracks(model,actions,{allowBoundaryFixes=false}={}){
    for(const ctx of repairableTrackContexts(model)){
      const tr=ctx.track;if(!Array.isArray(tr?.keys)||!tr.keys.length)continue;let changed=false;
      const invalidGlobal=Number(tr.globalSequenceId)>=0&&!(Number(tr.globalSequenceId)<(model.globalSequences||[]).length);
      if(invalidGlobal){
        const canFallback=tr.keys.every(k=>Number(k.frame)===0||sequenceForFrame(model,Number(k.frame),-1)>=0);
        if(canFallback){const before=tr.globalSequenceId;tr.globalSequenceId=-1;recordFix(actions,'globalSequenceFallbacks',ctx.label,before,-1,'Invalid GlobalSeqId replaced by regular sequence timing.');changed=true;}
        else recordSkip(actions,ctx.label,`Invalid GlobalSeqId ${tr.globalSequenceId} could not be safely detached because some keys do not fit regular sequences.`);
      }
      let unsorted=false;for(let i=1;i<tr.keys.length;i++)if(Number(tr.keys[i].frame)<Number(tr.keys[i-1].frame)){unsorted=true;break;}
      if(unsorted){const before=tr.keys.map(k=>k.frame);tr.keys=tr.keys.map((k,i)=>({k,i})).sort((a,b)=>Number(a.k.frame)-Number(b.k.frame)||a.i-b.i).map(x=>x.k);recordFix(actions,'trackSorts',ctx.label,before,tr.keys.map(k=>k.frame),'Stable chronological sort.');changed=true;}
      const deduped=[];let removed=0;
      for(let i=0;i<tr.keys.length;){
        let j=i+1;while(j<tr.keys.length&&Number(tr.keys[j].frame)===Number(tr.keys[i].frame))j++;
        const group=tr.keys.slice(i,j);
        if(group.length>1&&group.every(k=>sameKeyPayload(k,group[0]))){deduped.push(group[0]);removed+=group.length-1;}
        else{deduped.push(...group);if(group.length>1)recordSkip(actions,`${ctx.label} frame ${group[0].frame}`,'Duplicate frame contains different values/tangents; keeping all keys to avoid changing animation intent.');}
        i=j;
      }
      if(removed){tr.keys=deduped;recordFix(actions,'duplicateKeysRemoved',ctx.label,`duplicate keys: ${removed}`,`removed: ${removed}`,'Only byte-for-byte equivalent duplicate frame keys were removed.',removed);changed=true;}
      if(Number(tr.globalSequenceId)<0&&(model.sequences||[]).length&&tr.keys.length>1){
        const outside=tr.keys.filter(k=>Number(k.frame)!==0&&sequenceForFrame(model,Number(k.frame),-1)===-1);
        if(outside.length&&tr.keys.length-outside.length>=1){
          const set=new Set(outside);tr.keys=tr.keys.filter(k=>!set.has(k));
          recordFix(actions,'outsideKeysRemoved',ctx.label,outside.map(k=>k.frame),tr.keys.map(k=>k.frame),'Nonzero keys outside every sequence do not participate in Warcraft animation playback.',outside.length);changed=true;
        }
      }
      if(Number(tr.globalSequenceId)>=0&&Number(tr.globalSequenceId)<(model.globalSequences||[]).length&&tr.keys.length>1){
        const duration=Number(model.globalSequences[Number(tr.globalSequenceId)]),outside=tr.keys.filter(k=>Number(k.frame)<0||Number(k.frame)>duration);
        if(Number.isFinite(duration)&&duration>=0&&outside.length&&tr.keys.length-outside.length>=1){
          const set=new Set(outside);tr.keys=tr.keys.filter(k=>!set.has(k));
          recordFix(actions,'globalSequenceKeysRemoved',ctx.label,outside.map(k=>k.frame),tr.keys.map(k=>k.frame),`Keys outside global-sequence duration 0..${duration} cannot play and were removed.`,outside.length);changed=true;
        }else if(outside.length)recordSkip(actions,ctx.label,`Global-sequence keys fall outside 0..${duration}, but removing them would empty the track.`);
      }
      if(isVisibilityTrack(ctx.tag,ctx.label)&&trackInterpIndex(tr)!==0){
        const before={interpolation:tr.interpolation,interpolationType:tr.interpolationType};tr.interpolation='DontInterp';tr.interpolationType=0;
        recordFix(actions,'visibilityInterpolation',ctx.label,before,{interpolation:'DontInterp',interpolationType:0},'Warcraft visibility tracks are discrete.');changed=true;
      }
      if(changed)markTrackOwnerEdited(model,ctx);
    }
    for(const t of openingKeyRepairTargets(model)){
      if(t.track.keys.some(k=>Number(k.frame)===Number(t.sequence.start)))continue;
      if(!allowBoundaryFixes){recordSkip(actions,`${t.label} / ${t.sequence.name||t.sequence.start}`,`Missing opening key at ${t.sequence.start}; adding a boundary key can change the sequence's motion curve, so Safe Auto Fix leaves it untouched. Enable Conservative animation/rig fixes to apply.`,'animation-preservation');continue;}
      t.track.keys.push(cloneKey(t.sourceKey,t.sequence.start));t.track.keys.sort((a,b)=>a.frame-b.frame);
      recordFix(actions,'openingKeys',`${t.label} / ${t.sequence.name||t.sequence.start}`,`first=${t.sourceKey.frame}`,`opening=${t.sequence.start}`,'Copied first in-sequence value to the exact sequence start.',1,'conservative');markTrackOwnerEdited(model,t);
    }
    for(const t of closingKeyRepairTargets(model)){
      if(t.track.keys.some(k=>Number(k.frame)===Number(t.sequence.end)))continue;
      if(!allowBoundaryFixes){recordSkip(actions,`${t.label} / ${t.sequence.name||t.sequence.start}`,`Missing closing key at ${t.sequence.end}; adding a boundary key can change the sequence's motion curve, so Safe Auto Fix leaves it untouched. Enable Conservative animation/rig fixes to apply.`,'animation-preservation');continue;}
      t.track.keys.push(cloneKey(t.sourceKey,t.sequence.end));t.track.keys.sort((a,b)=>a.frame-b.frame);
      recordFix(actions,'closingKeys',`${t.label} / ${t.sequence.name||t.sequence.start}`,`last=${t.sourceKey.frame}`,`closing=${t.sequence.end}`,'Copied last in-sequence value to the exact sequence end.',1,'conservative');markTrackOwnerEdited(model,t);
    }
  }
  function normalizeExtentObject(ext){
    if(!ext?.min||!ext?.max)return 0;let swaps=0;
    const min=Array.isArray(ext.min)?ext.min:[ext.min.x,ext.min.y,ext.min.z],max=Array.isArray(ext.max)?ext.max:[ext.max.x,ext.max.y,ext.max.z];
    for(let a=0;a<3;a++){const lo=Number(min[a]),hi=Number(max[a]);if(Number.isFinite(lo)&&Number.isFinite(hi)&&hi<lo){min[a]=hi;max[a]=lo;swaps++;}}
    if(Array.isArray(ext.min)){ext.min=[...min];ext.max=[...max];}else{['x','y','z'].forEach((k,a)=>{ext.min[k]=min[a];ext.max[k]=max[a];});}
    if(Number.isFinite(Number(ext.boundsRadius))&&Number(ext.boundsRadius)<0){ext.boundsRadius=Math.abs(Number(ext.boundsRadius));swaps++;}
    return swaps;
  }
  function repairExtents(model,actions){
    let geomChanged=false,seqChanged=false;
    const fix=(ext,target,kind)=>{const before=ext?cloneModelGraph(ext):null,c=normalizeExtentObject(ext);if(c){recordFix(actions,'extentsNormalized',target,before,cloneModelGraph(ext),'Swapped reversed min/max axes and normalized negative radius.',c);if(kind==='geometry')geomChanged=true;else seqChanged=true;}};
    fix(model.extent,'Model extent','geometry');
    (model.sequences||[]).forEach((seq,i)=>fix(seq?.extent,`Sequence ${i} extent`,'sequence'));
    (model.geosets||[]).forEach((g,gi)=>{
      fix(g?.extent,`Geoset ${gi} extent`,'geometry');
      const wanted=(model.sequences||[]).length,current=Array.isArray(g?.sequenceExtents)?g.sequenceExtents.length:0;
      // A completely absent sequence-extent table is valid (and MDL parsing may
      // intentionally expose none). Only normalize an existing, mismatched table;
      // otherwise the Auto Fix would recreate synthetic extents on every pass.
      if(wanted&&current>0&&current!==wanted){
        const before=current,fallback=cloneModelGraph(g.extent||{boundsRadius:0,min:[0,0,0],max:[0,0,0]}),next=[];
        for(let si=0;si<wanted;si++)next.push(cloneModelGraph((g.sequenceExtents||[])[si]||fallback));
        g.sequenceExtents=next;g.__sequenceExtentsEdited=true;seqChanged=true;
        recordFix(actions,'sequenceExtentsRebuilt',`Geoset ${gi}`,before,wanted,'Sequence extent table resized to match the sequence table.',Math.abs(wanted-before)||1);
      }
      (g?.sequenceExtents||[]).forEach((e,si)=>fix(e,`Geoset ${gi} sequence extent ${si}`,'sequence'));
    });
    if(geomChanged)model.__geometryEdited=true;
    if(seqChanged)model.__sequenceExtentsEdited=true;
  }
  function recalculateGeosetNormals(g){
    const vertices=g?.vertices||[],faces=g?.faces||[],vc=vertices.length;if(!vc||!faces.length)return null;
    const acc=Array.from({length:vc},()=>[0,0,0]),hits=new Uint32Array(vc);
    for(const f of faces){
      if(!Array.isArray(f)||f.length!==3||f.some(x=>!Number.isInteger(x)||x<0||x>=vc))return null;
      const a=vertices[f[0]],b=vertices[f[1]],c=vertices[f[2]];if(!finiteVertex(a)||!finiteVertex(b)||!finiteVertex(c))return null;
      const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z,nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz);
      if(!(len>1e-12))continue;
      for(const id of f){acc[id][0]+=nx;acc[id][1]+=ny;acc[id][2]+=nz;hits[id]++;}
    }
    if([...hits].some(x=>x===0))return null;
    const normals=[];for(let i=0;i<vc;i++){const [x,y,z]=acc[i],len=Math.hypot(x,y,z);if(!(len>1e-12))return null;normals.push({x:x/len,y:y/len,z:z/len});}
    return normals;
  }
  function repairGeometryBindings(model,actions,{allowRigBindingFixes=false}={}){
    const materials=model.materials||[],textures=model.textureDefs||[],nodeById=new Map((model.nodes||[]).map(n=>[Number(n?.id),n]));
    for(let gi=0;gi<(model.geosets||[]).length;gi++){
      const g=model.geosets[gi],target=`Geoset ${gi}`;
      if(!Number.isInteger(Number(g.materialId))||Number(g.materialId)<0||Number(g.materialId)>=materials.length){
        if(materials.length===1){const before=g.materialId;g.materialId=0;g.__geometryEdited=true;model.__geometryEdited=true;recordFix(actions,'geosetMaterialRefsFixed',`${target} MaterialId`,before,0,'Only one material exists, so the invalid geoset material reference has an unambiguous fallback.');}
        else recordSkip(actions,`${target} MaterialId`,`Invalid material ${g.materialId}; ${materials.length} materials exist, so choosing one would change appearance.`);
      }
      const badNormals=(g.normals||[]).length!==(g.vertices||[]).length||(g.normals||[]).some(n=>!finiteVertex(n));
      if(badNormals){const normals=recalculateGeosetNormals(g);if(normals){const before=(g.normals||[]).length;g.normals=normals;g.__geometryEdited=true;model.__geometryEdited=true;recordFix(actions,'normalsRecomputed',`${target} Normals`,before,normals.length,'Normals were deterministically rebuilt from valid triangle geometry.',1,'conservative');}else recordSkip(actions,`${target} Normals`,'Normal count/data is invalid, but geometry contains invalid/degenerate/unreferenced vertices; a reliable normal field cannot be inferred.');}
      if(!(g.skin||[]).length&&(g.matrixGroups||[]).length){
        let matrixChanged=0;
        for(let mi=0;mi<g.matrixGroups.length;mi++){
          const ids=Array.from(g.matrixGroups[mi]||[]),valid=[...new Set(ids.filter(id=>nodeById.get(Number(id))?.type==='Bone').map(Number))];
          if(valid.length&&JSON.stringify(ids)!==JSON.stringify(valid)){
            if(allowRigBindingFixes){g.matrixGroups[mi]=valid;matrixChanged++;recordFix(actions,'matrixReferencesFixed',`${target} MatrixGroup ${mi}`,ids,valid,'Removed invalid/non-Bone/duplicate matrix references while preserving valid bone influences.',1,'conservative');}
            else recordSkip(actions,`${target} MatrixGroup ${mi}`,'Classic matrix-group cleanup can change vertex skinning/animation deformation. Safe Auto Fix leaves the binding table byte-for-byte unchanged. Enable Conservative animation/rig fixes to apply.','animation-preservation');
          }else if(!valid.length&&ids.length)recordSkip(actions,`${target} MatrixGroup ${mi}`,'Matrix group contains no valid Bone reference; no replacement bone can be inferred safely.');
        }
        const groups=g.matrixGroups||[];
        for(let vi=0;vi<(g.vertexGroups||[]).length;vi++){
          const vg=Number(g.vertexGroups[vi]);if(Number.isInteger(vg)&&vg>=0&&vg<groups.length)continue;
          if(groups.length===1&&groups[0]?.length){
            if(allowRigBindingFixes){const before=g.vertexGroups[vi];g.vertexGroups[vi]=0;matrixChanged++;recordFix(actions,'matrixReferencesFixed',`${target} VertexGroup ${vi}`,before,0,'Only one valid matrix group exists, so the invalid vertex-group index has an unambiguous fallback.',1,'conservative');}
            else recordSkip(actions,`${target} VertexGroup ${vi}`,`Invalid vertex-group index ${vg}; remapping it can change skinning, so Safe Auto Fix leaves it untouched.`,'animation-preservation');
          }else recordSkip(actions,`${target} VertexGroup ${vi}`,`Invalid vertex-group index ${vg}; ${groups.length} matrix groups exist, so the intended group cannot be inferred.`);
        }
        if(matrixChanged){g.__geometryEdited=true;model.__geometryEdited=true;}
      }
    }
    // Deterministic texture fallbacks are allowed only when exactly one texture exists.
    for(let mi=0;mi<materials.length;mi++)for(let li=0;li<(materials[mi]?.layers||[]).length;li++){
      const l=materials[mi].layers[li],target=`Material ${mi} Layer ${li}`;
      if(!Number.isInteger(Number(l.textureId))||Number(l.textureId)<0||Number(l.textureId)>=textures.length){if(textures.length===1){const before=l.textureId;l.textureId=0;model.__materialEdited=true;recordFix(actions,'layerTextureRefsFixed',`${target} TextureId`,before,0,'Only one texture exists, so the invalid layer texture reference has an unambiguous fallback.');}else recordSkip(actions,`${target} TextureId`,`Invalid texture ${l.textureId}; ${textures.length} textures exist, so the intended texture cannot be inferred.`);}
      const tf=l?.tracks?.KMTF;if(Array.isArray(tf?.keys))for(const k of tf.keys){const tid=Math.round(Number(k?.value?.[0]));if(Number.isInteger(tid)&&tid>=0&&tid<textures.length)continue;if(textures.length===1&&Array.isArray(k.value)){const before=k.value[0];k.value[0]=0;model.__materialEdited=true;recordFix(actions,'layerTextureRefsFixed',`${target} KMTF frame ${k.frame}`,before,0,'Animated TextureID key repaired because only one texture exists.');}else recordSkip(actions,`${target} KMTF frame ${k.frame}`,`Animated texture ID ${tid} is invalid and no unique texture fallback exists.`);}
    }
    for(const n of model.particleEmitters2||[]){const tid=Number(n?.textureId);if(Number.isInteger(tid)&&tid>=0&&tid<textures.length)continue;if(textures.length===1){const before=n.textureId;n.textureId=0;model.__effectsEdited=true;recordFix(actions,'particleEmitterTextureRefsFixed',`ParticleEmitter2 ${n.id} TextureId`,before,0,'Only one texture exists, so the invalid particle texture reference has an unambiguous fallback.');}else recordSkip(actions,`ParticleEmitter2 ${n.id} TextureId`,`Invalid texture ${tid}; ${textures.length} textures exist, so no texture is guessed.`);}
  }
  function geosetAnimSignature(ga){
    return JSON.stringify({geosetId:Number(ga?.geosetId),alpha:Number(ga?.alpha??1),flags:Number(ga?.flags||0),color:ga?.color||null,tracks:ga?.tracks||null});
  }
  function repairGeosetAnimations(model,actions){
    const old=model.geosetAnimations||[],valid=[],oldToNew=new Map(),signatureToNew=new Map(),byGeoset=new Map();
    for(let i=0;i<old.length;i++){
      const ga=old[i],gid=Number(ga?.geosetId);
      if(!Number.isInteger(gid)||gid<0||gid>=(model.geosets||[]).length){
        oldToNew.set(i,-1);recordFix(actions,'geosetAnimationsRemoved',`GeosetAnimation ${i}`,gid,'removed','Invalid geoset reference can make maps hang/crash.');continue;
      }
      const sig=geosetAnimSignature(ga);
      if(signatureToNew.has(sig)){
        const keep=signatureToNew.get(sig);oldToNew.set(i,keep);recordFix(actions,'duplicateGeosetAnimationsRemoved',`GeosetAnimation ${i}`,`duplicate of ${keep}`,'removed','Exact duplicate GeosetAnimation removed.');continue;
      }
      const ni=valid.length;valid.push(ga);oldToNew.set(i,ni);signatureToNew.set(sig,ni);
      if(byGeoset.has(gid))recordSkip(actions,`Geoset ${gid}`,`Multiple non-identical GeosetAnimations (${byGeoset.get(gid)}, ${i}) reference the same geoset; not merging because visibility/color intent is ambiguous.`);
      else byGeoset.set(gid,i);
    }
    if(valid.length!==old.length){model.geosetAnimations=valid;model.__geosetAnimationsEdited=true;}
    for(const b of model.bones||[]){
      const oldId=Number(b?.geosetAnimId);
      if(Number.isInteger(oldId)&&oldId>=0){
        const mapped=oldToNew.has(oldId)?oldToNew.get(oldId):(oldId<valid.length?oldId:-1);
        if(mapped!==oldId){b.geosetAnimId=mapped;model.__rigEdited=true;recordFix(actions,'boneReferencesFixed',`Bone ${b.id} GeosetAnimId`,oldId,mapped,'Remapped after GeosetAnimation cleanup.');}
      }
    }
  }
  function repairBoneReferences(model,actions,{allowRigBindingFixes=false}={}){
    const nodeIds=new Set((model.nodes||[]).map(n=>Number(n?.id)).filter(Number.isFinite)),geoCount=(model.geosets||[]).length,gaCount=(model.geosetAnimations||[]).length;
    for(const n of [...(model.bones||[]),...(model.helpers||[])]){
      const target=`${n.type} ${n.id}`;
      if(Number(n.parentId)===Number(n.id)||Number(n.parentId)>=0&&!nodeIds.has(Number(n.parentId))){
        if(allowRigBindingFixes){const before=n.parentId;n.parentId=-1;model.__rigEdited=true;recordFix(actions,'boneReferencesFixed',`${target} Parent`,before,-1,'Invalid/self parent detached to root.',1,'conservative');}
        else recordSkip(actions,`${target} Parent`,`Invalid/self parent ${n.parentId}; changing hierarchy can deform every child animation, so Safe Auto Fix leaves it untouched.`,'animation-preservation');
      }
      if(n.type==='Bone'){
        if(Number(n.geosetId)!==-1&&(!Number.isInteger(Number(n.geosetId))||Number(n.geosetId)<0||Number(n.geosetId)>=geoCount)){const before=n.geosetId;n.geosetId=-1;model.__rigEdited=true;recordFix(actions,'boneReferencesFixed',`${target} GeosetId`,before,-1,'Invalid geoset reference changed to Multiple/None.');}
        if(Number(n.geosetAnimId)!==-1&&(!Number.isInteger(Number(n.geosetAnimId))||Number(n.geosetAnimId)<0||Number(n.geosetAnimId)>=gaCount)){const before=n.geosetAnimId;n.geosetAnimId=-1;model.__rigEdited=true;recordFix(actions,'boneReferencesFixed',`${target} GeosetAnimId`,before,-1,'Invalid GeosetAnimation reference changed to None.');}
      }
    }
  }
  function repairEmitterFields(model,actions){
    const texCount=(model.textureDefs||[]).length;
    for(const n of model.particleEmitters2||[]){
      const target=`ParticleEmitter2 ${n.id}`;
      const tm=Number(n?.timeMiddle);if(Number.isFinite(tm)&&(tm<0||tm>1)){const after=Math.max(0,Math.min(1,tm));n.timeMiddle=after;model.__effectsEdited=true;recordFix(actions,'particleEmitterTime',`${target} Time`,tm,after,'Time must be inside 0..1.');}
      const fm=Number(n?.filterMode);if(!Number.isInteger(fm)||fm<0||fm>4){const after=Number.isFinite(fm)?Math.max(0,Math.min(4,Math.round(fm))):1;n.filterMode=after;model.__effectsEdited=true;recordFix(actions,'particleEmitterFieldsFixed',`${target} FilterMode`,fm,after,'Clamped to Warcraft PE2 filter-mode range 0..4.');}
      const tid=Number(n?.textureId);if((!Number.isInteger(tid)||tid<0||tid>=texCount)&&texCount===1){const before=n.textureId;n.textureId=0;model.__effectsEdited=true;recordFix(actions,'particleEmitterTextureRefsFixed',`${target} TextureId`,before,0,'Only one texture exists, so the invalid particle texture reference has an unambiguous fallback.');}
      const rid=Number(n?.replaceableId||0);if(rid&&!REPLACEABLE_IDS.has(rid)){if(Number.isInteger(Number(n.textureId))&&Number(n.textureId)>=0&&Number(n.textureId)<texCount){n.replaceableId=0;model.__effectsEdited=true;recordFix(actions,'particleEmitterFieldsFixed',`${target} ReplaceableId`,rid,0,'Invalid ReplaceableId cleared after resolving a valid texture reference.');}else recordSkip(actions,`${target} ReplaceableId`,`Invalid ReplaceableId ${rid}, but no valid texture fallback exists.`);}
      for(const field of ['rows','columns']){const v=Number(n?.[field]);if(!Number.isFinite(v)||v<1){n[field]=1;model.__effectsEdited=true;recordFix(actions,'particleEmitterFieldsFixed',`${target} ${field}`,v,1,'Particle atlas dimensions must be at least 1.');}}
      const ht=Number(n?.headOrTail);if(!Number.isInteger(ht)||ht<0||ht>2){n.headOrTail=0;model.__effectsEdited=true;recordFix(actions,'particleEmitterFieldsFixed',`${target} Head/Tail`,ht,0,'Invalid mode replaced by Head.');}
      if((n.segmentAlphas||[]).length>=3&&(n.segmentAlphas||[]).every(v=>Number(v)===0))recordSkip(actions,`${target} SegmentAlpha`,'All three segment alpha values are 0 (fully invisible); no automatic opacity is invented.');
      if((n.flags&0x100000)&&(Number(n.speed)===0||Number(n.latitude)===0))recordSkip(actions,target,'XYQuad has zero speed/latitude; a nonzero visual value is model-specific and cannot be inferred safely.');
      if(n.squirt&&!(n.tracks?.KP2E)&&!(n.tracks?.KP2V))recordSkip(actions,target,'Squirt has neither emission-rate nor visibility animation; an emission curve cannot be inferred safely.');
    }
  }
  function repairMaterialAndTextureFields(model,actions){
    const txanCount=(model.textureAnimations||[]).length;
    for(let i=0;i<(model.textureDefs||[]).length;i++){
      const t=model.textureDefs[i]||{},rid=Number(t.replaceableId||0),path=String(t.path||'').trim();
      if(rid&&!REPLACEABLE_IDS.has(rid)){if(path){t.replaceableId=0;recordFix(actions,'textureFieldsFixed',`Texture ${i} ReplaceableId`,rid,0,'Invalid ReplaceableId cleared because an explicit texture path exists.');}else recordSkip(actions,`Texture ${i}`,`Invalid ReplaceableId ${rid} with no explicit path; no replacement texture can be inferred.`);}
    }
    for(let mi=0;mi<(model.materials||[]).length;mi++)for(let li=0;li<(model.materials[mi]?.layers||[]).length;li++){
      const l=model.materials[mi].layers[li],target=`Material ${mi} Layer ${li}`,fm=Number(l?.filterModeId);
      if(!Number.isInteger(fm)||fm<0||fm>6){const after=Number.isFinite(fm)?Math.max(0,Math.min(6,Math.round(fm))):0;l.filterModeId=after;model.__materialEdited=true;recordFix(actions,'materialFieldsFixed',`${target} FilterMode`,fm,after,'Clamped to Warcraft layer filter-mode range 0..6.');}
      const ta=Number(l?.textureAnimationId);if(Number.isInteger(ta)&&ta>=0&&ta>=txanCount){l.textureAnimationId=-1;model.__materialEdited=true;recordFix(actions,'materialFieldsFixed',`${target} TextureAnimationId`,ta,-1,'Invalid texture-animation reference cleared.');}
    }
  }
  function repairPivots(model,actions,{allowRigBindingFixes=false}={}){
    const maxId=Math.max(-1,...(model.nodes||[]).map(n=>Number(n?.id)).filter(Number.isFinite)),wanted=maxId+1;if(wanted<=0)return;
    if(!Array.isArray(model.pivots))model.pivots=[];
    if(model.pivots.length>=wanted)return;
    if(!allowRigBindingFixes){recordSkip(actions,'PivotPoints',`Pivot table has ${model.pivots.length} entries for ${wanted} node IDs; synthesizing pivots can change rotation/scaling centers, so Safe Auto Fix leaves it untouched.`,'animation-preservation');return;}
    const byId=new Map((model.nodes||[]).map(n=>[Number(n?.id),n]));
    const before=model.pivots.length;
    while(model.pivots.length<wanted){const id=model.pivots.length,n=byId.get(id),p=n?.pivot||{x:0,y:0,z:0};model.pivots.push({x:Number(p.x)||0,y:Number(p.y)||0,z:Number(p.z)||0});}
    model.__rigEdited=true;recordFix(actions,'pivotsAdded','PivotPoints',before,model.pivots.length,'Missing pivots filled from parsed node pivots or origin.',model.pivots.length-before, 'conservative');
  }
  function normalized255(weights){
    const sum=weights.reduce((a,b)=>a+Number(b||0),0);if(sum<=0)return null;
    const scaled=weights.map(w=>Number(w||0)*255/sum),out=scaled.map(Math.floor),remainder=255-out.reduce((a,b)=>a+b,0),order=scaled.map((x,i)=>({i,f:x-Math.floor(x)})).sort((a,b)=>b.f-a.f||a.i-b.i);
    for(let r=0;r<remainder;r++)out[order[r%order.length].i]++;return out;
  }
  function repairSkinWeights(model,actions,{allowRigBindingFixes=false}={}){
    const nodes=new Map((model.nodes||[]).map(n=>[Number(n?.id),n]));
    for(let gi=0;gi<(model.geosets||[]).length;gi++){
      const g=model.geosets[gi];if(!g?.skin?.length||g.skin.length%8||g.skin.length/8!==(g.vertices||[]).length)continue;
      let normalized=0,invalidRemoved=0;const examples=[];
      for(let vi=0;vi<g.skin.length/8;vi++){
        const o=vi*8,bones=[g.skin[o],g.skin[o+1],g.skin[o+2],g.skin[o+3]],weights=[g.skin[o+4],g.skin[o+5],g.skin[o+6],g.skin[o+7]];
        const invalidSlots=[];for(let k=0;k<4;k++)if(weights[k]&&nodes.get(Number(bones[k]))?.type!=='Bone')invalidSlots.push(k);
        let hadInvalid=invalidSlots.length>0;
        if(hadInvalid&&!allowRigBindingFixes){recordSkip(actions,`Geoset ${gi} vertex ${vi} SKIN`,`Weighted influence(s) reference invalid/non-Bone objects at slot(s) ${invalidSlots.join(', ')}; removing/reweighting them can change deformation, so Safe Auto Fix leaves this vertex unchanged.`,'animation-preservation');continue;}
        if(hadInvalid){for(const k of invalidSlots){weights[k]=0;g.skin[o+4+k]=0;invalidRemoved++;}}
        let sum=weights.reduce((a,b)=>a+b,0);
        if(hadInvalid){if(sum<=0){recordSkip(actions,`Geoset ${gi} vertex ${vi} SKIN`,'All weighted influences point to invalid/non-Bone objects; no replacement Bone is inferred.');continue;}recordFix(actions,'skinInvalidInfluencesRemoved',`Geoset ${gi} vertex ${vi} SKIN`,'invalid weighted influence(s)',weights,'Dropped only invalid/non-Bone weighted influences before normalization.',1,'conservative');}
        if(sum===0||sum===255)continue;
        const refsOk=weights.every((w,k)=>!w||nodes.get(Number(bones[k]))?.type==='Bone');if(!refsOk){recordSkip(actions,`Geoset ${gi} vertex ${vi} SKIN`,'Weights are not normalized but one or more weighted bone IDs are invalid/non-Bone.');continue;}
        const nw=normalized255(weights);if(!nw)continue;for(let k=0;k<4;k++)g.skin[o+4+k]=nw[k];normalized++;if(examples.length<8)examples.push({vertex:vi,before:sum,after:255});
      }
      if(normalized){g.__geometryEdited=true;model.__geometryEdited=true;recordFix(actions,'skinWeightsNormalized',`Geoset ${gi} SKIN4`,examples,{vertices:normalized,total:255},'Preserved valid bone IDs and normalized existing weight proportions.',normalized);}
      if(invalidRemoved){g.__geometryEdited=true;model.__geometryEdited=true;}
    }
  }
  function nodeTopRootId(nodeId,byId){
    let id=Number(nodeId),guard=0,last=id;
    while(Number.isFinite(id)&&id>=0&&guard++<10000){
      const n=byId.get(id);if(!n)return last;
      last=Number(n.id);const p=Number(n.parentId);
      if(!Number.isFinite(p)||p<0||p===id)return last;
      id=p;
    }
    return last;
  }
  function geometryInfluenceRootIds(parsed){
    const nodes=parsed?.nodes||[],byId=new Map(nodes.map(n=>[Number(n.id),n])),ids=new Set();
    for(const g of parsed?.geosets||[]){
      for(const group of g?.matrixGroups||[])for(const raw of group||[]){const id=Number(raw);if(Number.isFinite(id)&&byId.has(id))ids.add(id);}
      const skin=g?.skin;if(skin&&skin.length>=8){
        for(let o=0;o+7<skin.length;o+=8)for(let k=0;k<4;k++)if(Number(skin[o+4+k])>0){const id=Number(skin[o+k]);if(byId.has(id))ids.add(id);}
      }
    }
    const roots=new Set();for(const id of ids)roots.add(nodeTopRootId(id,byId));
    const allRoots=new Set();for(const n of nodes||[])if(Number.isFinite(Number(n?.id)))allRoots.add(nodeTopRootId(Number(n.id),byId));
    return{influenceIds:[...ids],rootIds:[...roots],allNodeRootIds:[...allRoots],byId};
  }
  function buriedNormalizationPlan(parsed){
    const rest=restPoseGeometryStats(parsed);
    const buried=rest.total>=3&&rest.belowRatio>=.95&&rest.maxZ<=5&&rest.minZ<-32;
    if(!buried)return null;
    const influence=geometryInfluenceRootIds(parsed);
    const roots=(parsed?.nodes||[]).filter(n=>n&&(n.parentId==null||Number(n.parentId)<0)&&Array.isArray(n?.tracks?.KGTR?.keys));
    const candidates=[];
    for(const n of roots){
      const zs=n.tracks.KGTR.keys.map(k=>Number(k?.value?.[2])).filter(z=>Number.isFinite(z)&&z>0);
      if(!zs.length)continue;
      const lift=median(zs),ground=rest.minZ+lift;
      if(lift>=64&&ground>=-64&&ground<=64&&rest.maxZ+lift>=32)candidates.push({node:n,delta:lift,ground,score:Math.abs(ground)});
    }
    candidates.sort((a,b)=>a.score-b.score||b.delta-a.delta);
    const best=candidates[0]||null;if(!best)return null;
    const rootIds=influence.rootIds.length?influence.rootIds:[Number(best.node.id)];
    return{...best,rootIds,allNodeRootIds:influence.allNodeRootIds,influenceIds:influence.influenceIds,allInfluencesUnderCandidate:rootIds.length===1&&Number(rootIds[0])===Number(best.node.id),allNodesUnderCandidate:influence.allNodeRootIds.length===1&&Number(influence.allNodeRootIds[0])===Number(best.node.id)};
  }
  function shiftPivotObjectsOnce(parsed,delta){
    const seen=new WeakSet();let shifted=0;
    const shift=p=>{if(!p||typeof p!=='object'||seen.has(p))return;seen.add(p);if(Number.isFinite(Number(p.z))){p.z=Number(p.z)+delta;shifted++;}};
    for(const p of parsed?.pivots||[])shift(p);
    for(const n of parsed?.nodes||[])shift(n?.pivot);
    return shifted;
  }
  function shiftTranslationTrackZ(track,delta){
    if(!track||!Array.isArray(track.keys))return 0;
    const interpolation=String(track.interpolation||'Linear');let changed=0;
    const shiftVec=v=>{if(Array.isArray(v)&&v.length>=3&&Number.isFinite(Number(v[2]))){v[2]=Number(v[2])+delta;return true;}return false;};
    for(const k of track.keys||[]){
      if(shiftVec(k.value))changed++;
      // Bezier tangents are control points and translate with the curve. Hermite
      // tangents are derivatives, so a constant offset must NOT alter them.
      if(interpolation==='Bezier'){shiftVec(k.inTan);shiftVec(k.outTan);}
    }
    return changed;
  }
  function jsonSame(a,b){return JSON.stringify(a??null)===JSON.stringify(b??null);}
  function spatialNormalizationProof(before,after,plan,delta){
    const errors=[],eps=.002;
    const near=(a,b)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=eps;
    if(!plan?.allInfluencesUnderCandidate)errors.push(`Geometry influences do not resolve to the candidate root ${plan?.node?.id}.`);
    if(!plan?.allNodesUnderCandidate)errors.push(`Not every model node is under the candidate root ${plan?.node?.id}.`);
    if((before?.geosets||[]).length!==(after?.geosets||[]).length)errors.push('Geoset count changed.');
    for(let gi=0;gi<Math.min((before?.geosets||[]).length,(after?.geosets||[]).length);gi++){
      const a=before.geosets[gi],b=after.geosets[gi];
      if((a.vertices||[]).length!==(b.vertices||[]).length){errors.push(`Geoset ${gi} vertex count changed.`);continue;}
      for(let vi=0;vi<(a.vertices||[]).length;vi++){const av=a.vertices[vi],bv=b.vertices[vi];if(!near(av.x,bv.x)||!near(av.y,bv.y)||!near(Number(av.z)+delta,bv.z)){errors.push(`Geoset ${gi} vertex ${vi} is not a uniform +Z shift.`);break;}}
      if(!jsonSame(a.matrixGroups||[],b.matrixGroups||[])||!jsonSame(a.vertexGroups||[],b.vertexGroups||[]))errors.push(`Geoset ${gi} classic skin bindings changed.`);
      if(!jsonSame(Array.from(a.skin||[]),Array.from(b.skin||[])))errors.push(`Geoset ${gi} SKIN bytes changed.`);
    }
    const beforeNodes=new Map((before?.nodes||[]).map(n=>[Number(n.id),n])),afterNodes=new Map((after?.nodes||[]).map(n=>[Number(n.id),n]));
    for(const [id,a] of beforeNodes){
      const b=afterNodes.get(id);if(!b){errors.push(`Node ${id} disappeared.`);continue;}
      const ap=a.pivot||{},bp=b.pivot||{};if(!near(ap.x,bp.x)||!near(ap.y,bp.y)||!near(Number(ap.z||0)+delta,Number(bp.z||0)))errors.push(`Node ${id} pivot was not shifted exactly once.`);
      for(const tag of new Set([...Object.keys(a.tracks||{}),...Object.keys(b.tracks||{})])){
        const ta=a.tracks?.[tag],tb=b.tracks?.[tag];if(tag!=='KGTR'||id!==Number(plan.node.id)){if(!jsonSame(ta,tb))errors.push(`Node ${id} ${tag} changed unexpectedly.`);continue;}
        if(!ta||!tb||(ta.keys||[]).length!==(tb.keys||[]).length){errors.push(`Root ${id} KGTR structure changed.`);continue;}
        const interp=String(ta.interpolation||'Linear');
        for(let i=0;i<(ta.keys||[]).length;i++){
          const x=ta.keys[i],y=tb.keys[i];if(x.frame!==y.frame||!near(x.value?.[0],y.value?.[0])||!near(x.value?.[1],y.value?.[1])||!near(Number(x.value?.[2])-delta,y.value?.[2])){errors.push(`Root ${id} KGTR key ${i} is not compensated by -Z.`);break;}
          if(interp==='Bezier'){
            for(const key of ['inTan','outTan'])if(Array.isArray(x[key])&&Array.isArray(y[key])&&(!near(x[key][0],y[key][0])||!near(x[key][1],y[key][1])||!near(Number(x[key][2])-delta,y[key][2]))){errors.push(`Root ${id} KGTR ${key} ${i} is not Bezier-compensated.`);break;}
          }else if(!jsonSame(x.inTan,y.inTan)||!jsonSame(x.outTan,y.outTan)){errors.push(`Root ${id} KGTR tangents changed for ${interp} interpolation.`);break;}
        }
      }
    }
    return{ok:errors.length===0,errors:errors.slice(0,30),rootId:Number(plan?.node?.id),delta,checkedGeosets:(before?.geosets||[]).length,checkedNodes:beforeNodes.size,bindingsPreserved:!errors.some(x=>/bindings|SKIN/i.test(x)),animationInvariant:!errors.some(x=>/KGTR|pivot|Node .* changed/i.test(x))};
  }
  function applyBuriedRestPoseNormalization(parsed,plan){
    if(!plan)return null;const delta=plan.delta;
    for(const g of parsed.geosets||[]){
      for(const v of g.vertices||[])if(Number.isFinite(Number(v.z)))v.z=Number(v.z)+delta;
      shiftExtentZ(g.extent,delta);for(const e of g.sequenceExtents||[])shiftExtentZ(e,delta);
      g.__geometryEdited=true;g.__sequenceExtentsEdited=true;
    }
    const shiftedPivots=shiftPivotObjectsOnce(parsed,delta);
    shiftExtentZ(parsed.extent,delta);for(const s of parsed.sequences||[])shiftExtentZ(s.extent,delta);
    const root=parsed.nodes?.find(n=>Number(n?.id)===Number(plan.node.id));
    const compensatedKeys=shiftTranslationTrackZ(root?.tracks?.KGTR,-delta);
    parsed.__geometryEdited=true;parsed.__sequenceExtentsEdited=true;parsed.__rigEdited=true;parsed.__animationKeyEdited=true;parsed.__sanitySpatialDelta=delta;
    return{delta,rootId:Number(plan.node.id),rootName:plan.node.name||'',groundAfter:plan.ground,shiftedPivots,compensatedKeys};
  }
  function normalizeBuriedRestPose(parsed,actions){
    const plan=buriedNormalizationPlan(parsed);if(!plan)return null;
    if(!plan.allInfluencesUnderCandidate||!plan.allNodesUnderCandidate){if(actions)recordSkip(actions,'Buried rest pose',`Spatial normalization candidate +${plan.delta.toFixed(3)} Z was not applied because geometry/node hierarchies resolve to root(s) ${[...new Set([...(plan.rootIds||[]),...(plan.allNodeRootIds||[])])].join(', ')}, not exclusively root ${plan.node.id}.`,'spatial-proof');return{ok:false,reason:'root-coverage',plan};}
    const before=cloneModelGraph(parsed),beforeStats=restPoseGeometryStats(before),applied=applyBuriedRestPoseNormalization(parsed,plan),proof=spatialNormalizationProof(before,parsed,plan,plan.delta);
    if(!proof.ok)return{ok:false,reason:'proof-failed',plan,proof,before};
    const after=restPoseGeometryStats(parsed);
    if(actions)recordFix(actions,'spatialNormalized','Buried rest pose',{minZ:beforeStats.minZ,maxZ:beforeStats.maxZ,belowRatio:beforeStats.belowRatio},{minZ:after.minZ,maxZ:after.maxZ,belowRatio:after.belowRatio},`Verified coordinate-basis repair: geometry + pivots shifted +${plan.delta.toFixed(3)} Z exactly once; root ${plan.node.id} KGTR shifted -${plan.delta.toFixed(3)} Z. Existing rotations/scales, skin bindings and non-root animation tracks were preserved.`,1,'safe');
    return{ok:true,...applied,proof,groundAfter:plan.ground};
  }
  function repairModelParsed(parsed,{spatial=true,allowSpatialRepair=true,allowAnimationBoundaryFixes=false,allowRigBindingFixes=false}={}){
    let model=cloneModelGraph(parsed),actions=initRepairActions();
    actions.profile='smart-safe-v4.1';
    actions.mode=allowAnimationBoundaryFixes||allowRigBindingFixes?'verified spatial + conservative animation/rig':'verified spatial + safe-only';
    repairEmitterFields(model,actions);
    repairAnimationTracks(model,actions,{allowBoundaryFixes:allowAnimationBoundaryFixes});
    repairExtents(model,actions);
    repairGeometryBindings(model,actions,{allowRigBindingFixes});
    repairGeosetAnimations(model,actions);
    repairBoneReferences(model,actions,{allowRigBindingFixes});
    repairMaterialAndTextureFields(model,actions);
    repairPivots(model,actions,{allowRigBindingFixes});
    repairSkinWeights(model,actions,{allowRigBindingFixes});
    if(spatial&&String(model.type||'').toUpperCase()==='MDX'){
      const plan=buriedNormalizationPlan(model);
      if(plan&&allowSpatialRepair){
        const candidate=cloneModelGraph(model),result=normalizeBuriedRestPose(candidate,null);
        if(result?.ok){
          const beforeStats=restPoseGeometryStats(model),afterStats=restPoseGeometryStats(candidate);model=candidate;
          recordFix(actions,'spatialNormalized','Buried rest pose',{minZ:beforeStats.minZ,maxZ:beforeStats.maxZ,belowRatio:beforeStats.belowRatio},{minZ:afterStats.minZ,maxZ:afterStats.maxZ,belowRatio:afterStats.belowRatio},`Verified coordinate-basis repair: geometry + pivots shifted +${result.delta.toFixed(3)} Z exactly once; root ${result.rootId} KGTR shifted -${result.delta.toFixed(3)} Z. Animation invariant proof passed for ${result.proof.checkedNodes} nodes / ${result.proof.checkedGeosets} geosets.`,1,'safe');
          actions.spatialNormalized=true;actions.spatialDelta=result.delta;actions.rootId=result.rootId;actions.rootName=result.rootName;actions.groundAfter=result.groundAfter;actions.spatialProof=result.proof;
        }else recordSkip(actions,'Buried rest pose',`Spatial normalization was withheld because the animation-preservation proof did not pass${result?.proof?.errors?.length?`: ${result.proof.errors.join(' | ')}`:''}.`,'spatial-proof');
      }else if(plan){
        recordSkip(actions,'Buried rest pose',`Detected strict buried-rest-pose/root-lift pattern (candidate +${plan.delta.toFixed(3)} Z), but spatial repair was disabled by the caller.`,'spatial-disabled');
      }
    }
    actions.changed=actions.totalChanges>0;
    return{model,actions};
  }
  function fixedModelName(name){
    const raw=String(name||'model.mdx'),slash=Math.max(raw.lastIndexOf('/'),raw.lastIndexOf('\\')),dir=slash>=0?raw.slice(0,slash+1):'',file=slash>=0?raw.slice(slash+1):raw,m=/^(.*?)(\.[^.]+)?$/.exec(file);
    return`${dir}${m?.[1]||file}_SANITY_FIXED${m?.[2]||''}`;
  }
  function issueCounts(report){
    const c={error:0,severe:0,warning:0,unused:0,info:0,total:0};for(const it of report?.issues||[]){if(c[it.severity]!=null)c[it.severity]++;c.total++;}return c;
  }
  function sanityLog(level,message,detail){
    const effective=state.testMode&&level==='error'?'debug':level;
    const L=window.WC3_LOG;if(L?.[effective])L[effective]('Sanity Auto Fix',message,detail);
    else console[effective==='error'?'error':effective==='warn'?'warn':'log'](`[Sanity Auto Fix] ${message}`,detail||'');
  }
  function sanityCheckerLog(level,message,detail){
    const L=window.WC3_LOG;if(L?.[level])L[level]('Sanity',message,detail);
    else console[level==='error'?'error':level==='warn'?'warn':'log'](`[Sanity] ${message}`,detail||'');
  }
  function compactActionCounts(actions){
    const omit=new Set(['profile','mode','details','skipped','skippedTruncated','totalChanges','changed','spatialDelta','rootId','rootName','groundAfter']);
    const out={};for(const [k,v] of Object.entries(actions||{}))if(!omit.has(k)&&(typeof v==='number'||typeof v==='boolean')&&v)out[k]=v;return out;
  }
  function safetySummary(actions){
    const out={safe:0,conservative:0,other:0,skipped:(actions?.skipped?.length||0)+(actions?.skippedTruncated||0)};
    for(const d of actions?.details||[]){const key=d?.safety==='safe'?'safe':d?.safety==='conservative'?'conservative':'other';out[key]+=Math.max(1,Number(d?.count)||1);}
    return out;
  }
  async function repairModelEntry(entry,index,referencedPackageFiles,repairOptions={}){
    if(!MODEL_EXT.has(ext(entry.name)))return{entry,changed:false,actions:null};
    const buffer=abOf(entry),parsed=ext(entry.name)==='mdl'?core.parseMDL(buffer):core.parseMDX(buffer);
    const beforeReport=analyzeModelParsed(entry,parsed,index||makeIndex([]),referencedPackageFiles||new Set(),{packageMode:!!repairOptions.packageMode}),beforeCounts=issueCounts(beforeReport);
    sanityLog('info','Model repair started',{model:entry.name,type:parsed.type,version:parsed.formatVersion||parsed.version||800,bytes:buffer.byteLength,issuesBefore:beforeCounts,profile:'smart-safe-v4.1'});
    const repair=repairModelParsed(parsed,{spatial:true,allowSpatialRepair:true,allowAnimationBoundaryFixes:!!repairOptions.allowConservative,allowRigBindingFixes:!!repairOptions.allowConservative});
    sanityLog('debug','Repair plan generated',{model:entry.name,totalChanges:repair.actions.totalChanges,counts:compactActionCounts(repair.actions),safety:safetySummary(repair.actions),changes:repair.actions.details,spatialProof:repair.actions.spatialProof||null,skipped:repair.actions.skipped,skippedTruncated:repair.actions.skippedTruncated});
    if(!repair.actions.changed){
      sanityLog('info','No safe deterministic fixes required',{model:entry.name,issues:beforeCounts,skipped:repair.actions.skipped});
      return{entry,changed:false,actions:repair.actions,sourceName:entry.name,before:beforeCounts,after:beforeCounts};
    }
    const saver=window.WC3_MODEL_SAVE;if(!saver?.saveEditedModel)throw new Error('Model save/repair backend is unavailable.');
    const saved=saver.saveEditedModel(buffer,entry.name,repair.model),fixed={name:fixedModelName(entry.name),data:saved.bytes,sourceFile:entry.sourceFile||null,sourcePath:entry.sourcePath||''};
    let reparsed;try{const ab=saved.bytes.buffer.slice(saved.bytes.byteOffset,saved.bytes.byteOffset+saved.bytes.byteLength);reparsed=ext(fixed.name)==='mdl'?core.parseMDL(ab):core.parseMDX(ab);}catch(e){sanityLog('error','Reparse validation failed after Auto Fix',{model:entry.name,error:e});throw new Error(`Auto Fix serialized ${entry.name}, but the repaired model could not be parsed again: ${e.message}`);}
    const afterReport=analyzeModelParsed(fixed,reparsed,index||makeIndex([]),referencedPackageFiles||new Set(),{packageMode:!!repairOptions.packageMode}),afterCounts=issueCounts(afterReport);
    const structureBefore={geosets:(parsed.geosets||[]).length,materials:(parsed.materials||[]).length,textures:(parsed.textureDefs||[]).length,nodes:(parsed.nodes||[]).length,sequences:(parsed.sequences||[]).length,geosetAnimations:(parsed.geosetAnimations||[]).length};
    const structureAfter={geosets:(reparsed.geosets||[]).length,materials:(reparsed.materials||[]).length,textures:(reparsed.textureDefs||[]).length,nodes:(reparsed.nodes||[]).length,sequences:(reparsed.sequences||[]).length,geosetAnimations:(reparsed.geosetAnimations||[]).length};
    const worsened=afterCounts.error>beforeCounts.error||afterCounts.severe>beforeCounts.severe;
    sanityLog(worsened?'warn':'info','Model repair serialized and reparsed',{model:entry.name,output:fixed.name,bytesBefore:buffer.byteLength,bytesAfter:saved.bytes.length,serializerChanges:saved.changes||{},issuesBefore:beforeCounts,issuesAfter:afterCounts,structureBefore,structureAfter,totalChanges:repair.actions.totalChanges,counts:compactActionCounts(repair.actions),safety:safetySummary(repair.actions),spatialProof:repair.actions.spatialProof||null,remainingHighSeverity:(afterReport.issues||[]).filter(x=>x.severity==='error'||x.severity==='severe').slice(0,40).map(x=>x.message)});
    return{entry:fixed,changed:true,actions:repair.actions,sourceName:entry.name,before:beforeCounts,after:afterCounts,serializerChanges:saved.changes||{},structureBefore,structureAfter};
  }

  function makeIndex(entries){
    const byPath=new Map(), byBase=new Map();
    for(const e of entries){
      const p=norm(e.name); byPath.set(p,e);
      const b=basename(e.name).toLowerCase();
      if(b && !byBase.has(b)) byBase.set(b,e);
    }
    return {byPath,byBase};
  }
  function resolveRef(index, ref){
    const p=norm(ref); if(index.byPath.has(p)) return index.byPath.get(p);
    const b=basename(ref).toLowerCase(); return index.byBase.get(b) || null;
  }

  async function analyzeTextureEntry(entry){
    const issues=[]; const e=ext(entry.name); const buffer=abOf(entry); let meta={};
    try{
      if(e==='blp'){
        const head=BLP.inspect(buffer);
        if(!head || head.magic!=='BLP1') throw new Error(`Unsupported BLP magic: ${head&&head.magic?head.magic:'unknown'}`);
        const decoded=await BLP.decode(buffer);
        meta={format:`BLP1 ${decoded.meta.encoding}`,width:decoded.width,height:decoded.height,alphaBits:decoded.meta.alphaBits,mipmaps:decoded.meta.offsets.filter(Boolean).length};
        if(!isPOT(decoded.width)||!isPOT(decoded.height)) issues.push(issue('warning',`Non power-of-two BLP dimensions: ${decoded.width}×${decoded.height}. Hive's checker also warns about non-POT BLP textures.`));
        if(![0,1,4,8].includes(decoded.meta.alphaBits)) issues.push(issue('warning',`Unusual BLP alpha depth: ${decoded.meta.alphaBits} bits.`));
        if(!decoded.meta.hasMipmaps || meta.mipmaps<=1) issues.push(issue('warning','BLP has no mipmap chain. Model textures usually benefit from mipmaps.'));
      } else if(e==='tga'){
        const decoded=TGA.decode(buffer); const head=TGA.inspect(buffer);
        meta={format:decoded.meta.encoding,width:decoded.width,height:decoded.height,bpp:head&&head.bpp};
        if(!isPOT(decoded.width)||!isPOT(decoded.height)) issues.push(issue('warning',`Non power-of-two TGA dimensions: ${decoded.width}×${decoded.height}.`));
      } else if(e==='dds'){
        const decoded=DDS.decode(buffer); const head=DDS.inspect(buffer);
        meta={format:decoded.meta.encoding,width:decoded.width,height:decoded.height,mipmaps:decoded.meta.mipCount};
        if(!head || !['BC1','BC3'].includes(head.format)) issues.push(issue('warning',`DDS compression ${head?head.format:'unknown'} is outside this editor's BC1/BC3 reader path.`));
        if(!isPOT(decoded.width)||!isPOT(decoded.height)) issues.push(issue('warning',`Non power-of-two DDS dimensions: ${decoded.width}×${decoded.height}.`));
        if(decoded.meta.mipCount<=1) issues.push(issue('warning','DDS has a single mip level.'));
      } else if(IMAGE_EXT.has(e)){
        const blob=new Blob([buffer]); const bmp=await createImageBitmap(blob); meta={format:e.toUpperCase(),width:bmp.width,height:bmp.height}; if(bmp.close)bmp.close();
        issues.push(issue('warning',`${e.toUpperCase()} opens in the editor but is not a native Warcraft model texture format. Convert it to BLP/TGA/DDS before import.`));
      } else {
        issues.push(issue('info','Skipped: file type is not a texture format supported by the checker.'));
      }
    }catch(err){ issues.push(issue('error',`Texture parser failed: ${err.message}`)); }
    if(!issues.length) issues.push(issue('info','Texture decoded successfully with no checker warnings.'));
    return {name:entry.name,type:'texture',size:entry.data.byteLength||entry.data.length||0,meta,issues,status:worstSeverity(issues)};
  }

  function valuesDiff(a,b,c){let d=0;for(let i=0;i<a.length;i++)d=Math.max(d,Math.abs(a[i]-(b[i]??a[i])),Math.abs(a[i]-(c[i]??a[i])));return d;}
  function valuesEqual(a,b){if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
  function sequenceForFrame(parsed,frame,globalSequenceId){
    if(globalSequenceId==null||globalSequenceId===-1){for(let i=0;i<(parsed.sequences||[]).length;i++){const s=parsed.sequences[i];if(frame>=s.start&&frame<=s.end)return i;}}
    else{const end=(parsed.globalSequences||[])[globalSequenceId];if(Number.isFinite(end)&&frame>=0&&frame<=end)return globalSequenceId;}
    return -1;
  }
  function summarizeFrames(frames,limit=6){
    if(!frames.length) return '';
    const head=frames.slice(0,limit).join(', ');
    return frames.length>limit ? `${head} … (+${frames.length-limit})` : head;
  }

  function analyzeTrack(track,label,issues,parsed){
    if(!track || !Array.isArray(track.keys)) return;
    if(!track.keys.length){ issues.push(issue('warning',`${label}: empty animation track.`,label)); return; }

    let prev=-Infinity;
    const seen=new Set();
    const separated=new Map();
    const outside=[];
    const negative=[];
    const duplicate=[];
    const nonFinite=[];
    const unsorted=[];

    for(let i=0;i<track.keys.length;i++){
      const k=track.keys[i];
      if(k.frame<0) negative.push(k.frame);
      if(k.frame<prev) unsorted.push(k.frame);
      else if(seen.has(k.frame)) duplicate.push(k.frame);
      seen.add(k.frame); prev=k.frame;
      if(!Array.isArray(k.value)||k.value.some(v=>!Number.isFinite(v))) nonFinite.push(k.frame);
      const seq=sequenceForFrame(parsed,k.frame,track.globalSequenceId);
      if(seq===-1 && k.frame!==0 && track.keys.length>1) outside.push(k.frame);
      if(seq!==-1){ if(!separated.has(seq)) separated.set(seq,[]); separated.get(seq).push(i); }
    }

    if(negative.length) issues.push(issue('warning',`${label}: ${negative.length} negative-frame key(s): ${summarizeFrames(negative)}.`,label));
    if(unsorted.length) issues.push(issue('severe',`${label}: ${unsorted.length} key(s) are out of chronological order: ${summarizeFrames(unsorted)}.`,label));
    if(duplicate.length) issues.push(issue('warning',`${label}: ${duplicate.length} duplicate frame key(s): ${summarizeFrames(duplicate)}.`,label));
    if(nonFinite.length) issues.push(issue('severe',`${label}: ${nonFinite.length} key(s) contain non-finite values: ${summarizeFrames(nonFinite)}.`,label));
    if(outside.length) issues.push(issue('unused',`${label}: ${outside.length} key(s) lie outside any active sequence${track.globalSequenceId>=0?` / global sequence ${track.globalSequenceId}`:''}. Frames: ${summarizeFrames(outside)}.`,label));

    if(track.globalSequenceId>=0 && !(track.globalSequenceId<(parsed.globalSequences||[]).length))
      issues.push(issue('error',`${label}: invalid global sequence ${track.globalSequenceId}.`,label));

    const exactRedundant=[];
    const nearRedundant=[];
    for(const [seqId,indices] of separated){
      if(indices.length>1 && track.interpolation!=='DontInterp'){
        const start=track.globalSequenceId>=0?0:(parsed.sequences[seqId]&&parsed.sequences[seqId].start);
        const first=track.keys[indices[0]],last=track.keys[indices[indices.length-1]];
        if(Number.isFinite(start)&&first.frame!==start&&!valuesEqual(first.value,last.value))
          issues.push(issue('severe',`${label}: missing opening key at frame ${start}; interpolation can warp at sequence start.`,label));
        const end=track.globalSequenceId>=0?(parsed.globalSequences||[])[track.globalSequenceId]:(parsed.sequences[seqId]&&parsed.sequences[seqId].end);
        if(Number.isFinite(end)&&last.frame!==end&&!valuesEqual(first.value,last.value))
          issues.push(issue('severe',`${label}: missing closing key at frame ${end}; interpolation can warp at sequence end.`,label));
      }
      if(indices.length>2){
        for(let k=1;k<indices.length-1;k++){
          const ia=indices[k-1],ib=indices[k],ic=indices[k+1];
          const d=valuesDiff(track.keys[ia].value,track.keys[ib].value,track.keys[ic].value);
          if(d===0) exactRedundant.push(track.keys[ib].frame);
          else if(d<0.001) nearRedundant.push(track.keys[ib].frame);
        }
      }
    }
    // Redundant animation keys are an optimisation hint, not thousands of separate failures.
    if(exactRedundant.length) issues.push(issue('unused',`${label}: ${exactRedundant.length} redundant key(s) match both adjacent values. Frames: ${summarizeFrames(exactRedundant)}.`,label));
    if(nearRedundant.length) issues.push(issue('unused',`${label}: ${nearRedundant.length} near-redundant key(s) differ by less than 0.001. Frames: ${summarizeFrames(nearRedundant)}.`,label));

    if(/Visibility/i.test(track.label||label) && track.interpolation!=='DontInterp')
      issues.push(issue('warning',`${label}: visibility tracks should normally use DontInterp.`,label));
    if(track.tag==='KP2R') issues.push(issue('warning',`${label}: ParticleEmitter2 variation animation has limited compatibility with older tools.`,label));
    if(track.tag==='KP2G') issues.push(issue('warning',`${label}: ParticleEmitter2 gravity animation has limited compatibility with older tools.`,label));
  }

  function collectAllTracks(parsed){
    const out=[];
    const add=(obj,label)=>{if(obj&&obj.tracks)for(const [tag,tr] of Object.entries(obj.tracks))if(tr)out.push({track:tr,label:`${label} ${tag}`});};
    (parsed.nodes||[]).forEach(n=>add(n,`${n.type} ${n.id}`));
    (parsed.textureAnimations||[]).forEach((x,i)=>add(x,`TextureAnimation ${i}`));
    (parsed.geosetAnimations||[]).forEach((x,i)=>add(x,`GeosetAnimation ${i}`));
    (parsed.materials||[]).forEach((m,mi)=>(m.layers||[]).forEach((l,li)=>add(l,`Material ${mi} Layer ${li}`)));
    (parsed.cameras||[]).forEach((c,i)=>add(c,`Camera ${i}`));
    return out;
  }

  function analyzeModelParsed(entry, parsed, index, referencedPackageFiles,context={}){
    const issues=[];
    index=index||makeIndex([]);referencedPackageFiles=referencedPackageFiles||new Set();
    const packageMode=!!context.packageMode,standaloneTextureScan=context.standaloneTextureScan||null;
    const textures=parsed.textureDefs||[],materials=parsed.materials||[],geosets=parsed.geosets||[],sequences=parsed.sequences||[],nodes=parsed.nodes||[];
    const version=parsed.formatVersion||parsed.version||800;
    const nodeById=new Map(nodes.map(n=>[n.id,n]));
    const boneUsage=new Map();

    if(parsed.type==='MDX'){
      if(version===900)issues.push(issue('error','MDX version 900 is flagged as unsupported by the upstream Hive/mdx-m3-viewer sanity rules.'));
      else if(![800,1000,1100].includes(version))issues.push(issue('warning',`Unknown/untested MDX format version ${version}.`));
    }
    if(parsed.animationFile)issues.push(issue('warning',`AnimationFile should normally be empty, currently: "${parsed.animationFile}".`));
    if(parsed.extent && parsed.extent.min && parsed.extent.max && parsed.extent.max.some((v,i)=>v<parsed.extent.min[i]))issues.push(issue('warning','Model has negative/reversed extents.'));
    const spatialCompatibility=analyzeSpatialCompatibility(parsed,issues);

    if(!sequences.length){
      issues.push(issue('warning','Model has no animation sequences.'));
      if((parsed.particleEmitters2||[]).length||nodes.some(n=>['ParticleEmitter','ParticleEmitter2','ParticleEmitterPopcorn','EventObject'].includes(n?.type)))issues.push(issue('severe','Model has animated/effect objects but no sequences; Warcraft can fail to play or instantiate this model safely.'));
    }else{
      let hasStand=false,hasDeath=false;const names=new Map();
      for(let i=0;i<sequences.length;i++){
        const s=sequences[i],n=String(s.name||'').trim(),low=n.toLowerCase();let token=(low.split('-')[0].trim().split(/\s+/)[0]||'');if(token==='alternate')token=low.split(/\s+/)[1]||'';
        if(token==='stand')hasStand=true;if(token==='death')hasDeath=true;
        if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<s.start)issues.push(issue('severe',`Sequence ${i} "${n}" has invalid interval ${s.start} → ${s.end}.`,`Sequence ${i}`));
        else if(s.end===s.start)issues.push(issue('warning',`Sequence ${i} "${n}" has zero length.`,`Sequence ${i}`));
        if(token&&!KNOWN_SEQUENCE_TOKENS.has(token))issues.push(issue('warning',`Sequence ${i} "${n}": "${token}" is not a standard Warcraft animation token.`,`Sequence ${i}`));
        if(names.has(low))issues.push(issue('warning',`Duplicate sequence name "${n}".`,`Sequence ${i}`));else names.set(low,i);
        if(s.extent&&s.extent.min&&s.extent.max&&s.extent.max.some((v,j)=>v<s.extent.min[j]))issues.push(issue('warning',`Sequence ${i} has negative/reversed extents.`,`Sequence ${i}`));
        if(version===800){for(let j=0;j<i;j++){const o=sequences[j];if(s.start===o.start)issues.push(issue('severe',`Sequence ${i} starts at the same frame as sequence ${j} "${o.name}".`,`Sequence ${i}`));else if(s.start<o.end)issues.push(issue('severe',`Sequence ${i} starts before sequence ${j} "${o.name}" ends.`,`Sequence ${i}`));}}
      }
      if(!hasStand)issues.push(issue('severe','Missing "Stand" sequence.'));
      if(!hasDeath)issues.push(issue('severe','Missing "Death" sequence.'));
    }
    (parsed.globalSequences||[]).forEach((g,i)=>{if(g===0)issues.push(issue('warning',`Global sequence ${i} has zero length.`));if(g<0)issues.push(issue('warning',`Global sequence ${i} has negative length ${g}.`));});

    const validTextureExt=new Set(['blp','tga','tif','dds']);
    for(let i=0;i<textures.length;i++){
      const t=textures[i]||{},path=String(t.path||'').trim(),rid=Number(t.replaceableId||0);
      if(path&&!validTextureExt.has(ext(path)))issues.push(issue('error',`Texture ${i} has corrupted/unsupported Warcraft path: "${path}".`,`Texture ${i}`));
      if(rid&&!REPLACEABLE_IDS.has(rid))issues.push(issue('error',`Texture ${i} uses unknown ReplaceableId ${rid}.`,`Texture ${i}`));
      if(path&&rid)issues.push(issue('warning',`Texture ${i} defines both a path and ReplaceableId ${rid}.`,`Texture ${i}`));
      if(path){
        const found=resolveRef(index,path),localResolved=!packageMode?standaloneTextureResolved(standaloneTextureScan,path):null;
        if(found)referencedPackageFiles.add(norm(found.name));
        else if(localResolved){
          issues.push(issue('info',`Texture ${i} resolved automatically from the standalone model folder: ${path} → ${localResolved.relativePath||localResolved.resolvedPath||basename(path)}`,`Texture ${i}`));
        }else if(gameTexturePath(path)){
          issues.push(issue('info',packageMode?`Texture ${i} uses an in-game Warcraft path not included in this package: ${path}`:`Texture ${i} uses an in-game Warcraft path; Warcraft game assets are not treated as missing standalone custom textures: ${path}`,`Texture ${i}`));
        }else if(!rid){
          if(packageMode)issues.push(issue('severe',`Custom texture is referenced but missing from the checked package: ${path}`,`Texture ${i}`));
          else if(standaloneTextureScan?.attempted&&standaloneTextureScan?.ok){
            const suffix=standaloneTextureScan.truncated?` The local scan reached its ${standaloneTextureScan.scannedFiles||0}-file safety limit.`:'';
            issues.push(issue('severe',`Custom texture was not found beside the standalone model after automatic local lookup: ${path}.${suffix}`,`Texture ${i}`));
          }else{
            issues.push(issue('info',`Custom texture could not be verified because this standalone check has no readable local model path: ${path}`,`Texture ${i}`));
          }
        }
      }
    }

    const textureUses=new Map(),materialUses=new Map(),txanUses=new Map();
    const use=(map,id)=>map.set(id,(map.get(id)||0)+1);
    for(let mi=0;mi<materials.length;mi++){
      const m=materials[mi]||{};
      if(version>800 && m.shader && !['Shader_SD_FixedFunction','Shader_HD_DefaultUnit'].includes(m.shader))issues.push(issue('warning',`Material ${mi} uses unknown shader "${m.shader}".`,`Material ${mi}`));
      if(!(m.layers||[]).length)issues.push(issue('warning',`Material ${mi} has no layers.`,`Material ${mi}`));
      (m.layers||[]).forEach((l,li)=>{
        const tids=new Set([l.textureId]);const tf=l.tracks&&l.tracks.KMTF;if(tf)tf.keys.forEach(k=>tids.add(Math.round(k.value[0])));
        for(const tid of tids){if(!Number.isInteger(tid)||tid<0||tid>=textures.length)issues.push(issue('error',`Material ${mi} Layer ${li} references invalid texture ${tid}.`,`Material ${mi}`));else use(textureUses,tid);}
        if(l.textureAnimationId!=null&&l.textureAnimationId!==-1){if(l.textureAnimationId<0||l.textureAnimationId>=(parsed.textureAnimations||[]).length)issues.push(issue('error',`Material ${mi} Layer ${li} references invalid texture animation ${l.textureAnimationId}.`,`Material ${mi}`));else use(txanUses,l.textureAnimationId);}
        if(l.filterModeId!=null&&(l.filterModeId<0||l.filterModeId>6))issues.push(issue('warning',`Material ${mi} Layer ${li} has invalid filter mode ${l.filterModeId}.`,`Material ${mi}`));
      });
    }

    for(let gi=0;gi<geosets.length;gi++){
      const g=geosets[gi],label=`Geoset ${gi}`,mat=materials[g.materialId];
      if(!Number.isInteger(g.materialId)||g.materialId<0||g.materialId>=materials.length)issues.push(issue('error',`${label} references invalid material ID ${g.materialId}.`,label));else use(materialUses,g.materialId);
      const isHd=!!(mat&&mat.shader==='Shader_HD_DefaultUnit'),vc=(g.vertices||[]).length,uv=(g.tverts||[]).length,nc=(g.normals||[]).length;
      if(!isHd&&vc>=7433)issues.push(issue('severe',`${label} has ${vc} vertices; classic/SD geosets around this size are known to render incorrectly in Warcraft.`,label));
      if(uv!==vc)issues.push(issue('severe',`${label} has ${vc} vertices but ${uv} texture coordinates.`,label));
      if(nc!==vc)issues.push(issue('severe',`${label} has ${vc} vertices but ${nc} normals.`,label));
      if((g.vertices||[]).some(v=>!finiteVertex(v)))issues.push(issue('error',`${label} contains non-finite vertex coordinates.`,label));
      if((g.tverts||[]).some(v=>!finiteUv(v)))issues.push(issue('severe',`${label} contains non-finite UV coordinates.`,label));
      for(let fi=0;fi<(g.faces||[]).length;fi++){const f=g.faces[fi];if(!f||f.length!==3||f.some(x=>!Number.isInteger(x)||x<0||x>=vc)){issues.push(issue('error',`${label} face ${fi} references an invalid vertex.`,label));break;}}
      if(!(g.faces||[]).length)issues.push(issue('warning',`${label} has zero faces.`,label));
      if(version===800&&(g.sequenceExtents||[]).length&&g.sequenceExtents.length!==sequences.length)issues.push(issue('warning',`${label} has ${g.sequenceExtents.length} sequence extents, expected ${sequences.length}.`,label));
      if((g.skin||[]).length){
        if(g.skin.length%8!==0)issues.push(issue('severe',`${label} SKIN length ${g.skin.length} is not divisible by 8.`,label));
        if(g.skin.length/8!==vc)issues.push(issue('severe',`${label} has ${vc} vertices but ${g.skin.length/8} SKIN records.`,label));
        if((g.vertexGroups||[]).length)issues.push(issue('warning',`${label} contains both SKIN weights and classic vertex groups.`,label));
        for(let vi=0;vi<Math.min(vc,Math.floor(g.skin.length/8));vi++){const o=vi*8;let sum=0;for(let k=0;k<4;k++){const bone=g.skin[o+k],w=g.skin[o+4+k];sum+=w;if(w){if(bone>255)issues.push(issue('error',`${label} vertex ${vi} references bone ${bone}, above HD 8-bit range.`,label));const obj=nodeById.get(bone);if(!obj)issues.push(issue('error',`${label} vertex ${vi} references object ${bone}, which does not exist.`,label));else if(obj.type!=='Bone')issues.push(issue('severe',`${label} vertex ${vi} is attached to ${obj.type} ${bone}, not a Bone.`,label));else boneUsage.set(bone,(boneUsage.get(bone)||0)+1);}}if(sum===0)issues.push(issue('severe',`${label} vertex ${vi} is not attached to any bone.`,label));else if(sum!==255)issues.push(issue('severe',`${label} vertex ${vi} weights total ${sum}, expected 255.`,label));}
      }else if(nodes.some(n=>n.type==='Bone')&&(g.vertexGroups||[]).length){
        for(let vi=0;vi<g.vertexGroups.length;vi++){const vg=g.vertexGroups[vi],ids=(g.matrixGroups||[])[vg];if(!ids){issues.push(issue('severe',`${label} vertex ${vi} references vertex group ${vg} which does not exist.`,label));continue;}for(const bone of ids){const obj=nodeById.get(bone);if(!obj)issues.push(issue('error',`${label} vertex ${vi} references object ${bone}, which does not exist.`,label));else if(obj.type!=='Bone')issues.push(issue('severe',`${label} vertex ${vi} is attached to ${obj.type} ${bone}, not a Bone.`,label));else boneUsage.set(bone,(boneUsage.get(bone)||0)+1);}}
      }
    }

    (parsed.geosetAnimations||[]).forEach((ga,i)=>{if(ga.geosetId<0||ga.geosetId>=geosets.length)issues.push(issue('error',`GeosetAnimation ${i} references invalid geoset ${ga.geosetId}.`,`GeosetAnimation ${i}`));});
    for(let gi=0;gi<geosets.length;gi++){const refs=(parsed.geosetAnimations||[]).map((g,i)=>g.geosetId===gi?i:-1).filter(i=>i>=0);if(refs.length>1)issues.push(issue('warning',`Geoset ${gi} is referenced by ${refs.length} geoset animations: ${refs.join(', ')}.`,`Geoset ${gi}`));}

    for(const n of nodes){
      if(n.parentId===n.id)issues.push(issue('error',`${n.type} ${n.id} has itself as parent.`,`${n.type} ${n.id}`));
      else if(n.parentId>=0&&!nodeById.has(n.parentId))issues.push(issue('error',`${n.type} ${n.id} references invalid parent ${n.parentId}.`,`${n.type} ${n.id}`));
      if(n.type==='Bone'){
        if(n.geosetId!=null&&n.geosetId!==-1&&(n.geosetId<0||n.geosetId>=geosets.length))issues.push(issue('error',`Bone ${n.id} references invalid geoset ${n.geosetId}.`,`Bone ${n.id}`));
        if(n.geosetAnimId!=null&&n.geosetAnimId!==-1&&(n.geosetAnimId<0||n.geosetAnimId>=(parsed.geosetAnimations||[]).length))issues.push(issue('error',`Bone ${n.id} references invalid geoset animation ${n.geosetAnimId}.`,`Bone ${n.id}`));
      }
      if(n.type==='Light'&&n.attenuation){if(n.attenuation[0]<80)issues.push(issue('warning',`Light ${n.id} minimum attenuation is ${n.attenuation[0]}, usually >= 80.`,`Light ${n.id}`));if(n.attenuation[1]>200)issues.push(issue('warning',`Light ${n.id} maximum attenuation is ${n.attenuation[1]}, usually <= 200.`,`Light ${n.id}`));if(n.attenuation[1]<=n.attenuation[0])issues.push(issue('warning',`Light ${n.id} maximum attenuation is not greater than minimum.`,`Light ${n.id}`));}
      if(n.type==='Attachment'&&n.path&&!/\.(mdl|mdx)$/i.test(n.path))issues.push(issue('error',`Attachment ${n.id} has invalid model path "${n.path}".`,`Attachment ${n.id}`));
      if(n.type==='ParticleEmitter'&&n.path&&!/\.(mdl|mdx)$/i.test(n.path))issues.push(issue('error',`ParticleEmitter ${n.id} has invalid model path "${n.path}".`,`ParticleEmitter ${n.id}`));
      if(n.type==='ParticleEmitter2'){
        if(n.textureId<0||n.textureId>=textures.length)issues.push(issue('error',`ParticleEmitter2 ${n.id} references invalid texture ${n.textureId}.`,`ParticleEmitter2 ${n.id}`));else use(textureUses,n.textureId);
        if(!Number.isInteger(Number(n.filterMode))||n.filterMode<0||n.filterMode>4)issues.push(issue('warning',`ParticleEmitter2 ${n.id} has invalid filter mode ${n.filterMode}.`,`ParticleEmitter2 ${n.id}`));
        if(n.replaceableId&&!REPLACEABLE_IDS.has(n.replaceableId))issues.push(issue('error',`ParticleEmitter2 ${n.id} has invalid ReplaceableId ${n.replaceableId}.`,`ParticleEmitter2 ${n.id}`));
        if(Number(n.rows)<1||Number(n.columns)<1)issues.push(issue('warning',`ParticleEmitter2 ${n.id} has invalid atlas size ${n.rows}×${n.columns}; rows/columns must be at least 1.`,`ParticleEmitter2 ${n.id}`));
        if(!Number.isInteger(Number(n.headOrTail))||Number(n.headOrTail)<0||Number(n.headOrTail)>2)issues.push(issue('warning',`ParticleEmitter2 ${n.id} has invalid Head/Tail mode ${n.headOrTail}.`,`ParticleEmitter2 ${n.id}`));
        if((n.flags&0x100000)&&(n.speed===0||n.latitude===0))issues.push(issue('severe',`ParticleEmitter2 ${n.id} is XYQuad but speed/latitude is zero.`,`ParticleEmitter2 ${n.id}`));
        if(n.timeMiddle<0||n.timeMiddle>1)issues.push(issue('severe',`ParticleEmitter2 ${n.id} Time is ${n.timeMiddle}, expected 0..1.`,`ParticleEmitter2 ${n.id}`));
        if((n.segmentAlphas||[]).length>=3&&(n.segmentAlphas||[]).every(v=>Number(v)===0))issues.push(issue('warning',`ParticleEmitter2 ${n.id} has all three segment alpha values at 0 and will be invisible.`,`ParticleEmitter2 ${n.id}`));
        if(n.squirt&&!(n.tracks&&n.tracks.KP2E)&&!(n.tracks&&n.tracks.KP2V))issues.push(issue('severe',`ParticleEmitter2 ${n.id} uses Squirt without animated emission rate or visibility.`,`ParticleEmitter2 ${n.id}`));
      }
      if(n.type==='ParticleEmitterPopcorn'&&!String(n.animationVisibilityGuide||'').length)issues.push(issue('severe',`Popcorn emitter ${n.id} has no animation visibility guide.`,`Popcorn ${n.id}`));
      if(n.type==='RibbonEmitter'){if(n.materialId<0||n.materialId>=materials.length)issues.push(issue('error',`RibbonEmitter ${n.id} references invalid material ${n.materialId}.`,`RibbonEmitter ${n.id}`));else use(materialUses,n.materialId);}
      if(n.type==='EventObject'){const tracks=n.eventTracks||[];if(!tracks.length)issues.push(issue('error',`EventObject ${n.id} has zero event tracks.`,`EventObject ${n.id}`));let prev=-Infinity;tracks.forEach((f,i)=>{if(f<prev)issues.push(issue('severe',`EventObject ${n.id} event ${i} at ${f} is before previous event ${prev}.`,`EventObject ${n.id}`));prev=f;});}
    }
    if(nodes.some(n=>n.type==='Attachment')&&!nodes.some(n=>n.type==='Attachment'&&String(n.name||'').startsWith('Origin Ref')))issues.push(issue('warning','Missing the Origin attachment point.'));
    if((parsed.pivots||[]).length&&parsed.pivots.length!==nodes.length)issues.push(issue('warning',`Expected roughly ${nodes.length} pivot points for generic objects, got ${parsed.pivots.length}.`));
    nodes.filter(n=>n.type==='Bone').forEach(n=>{if(!(boneUsage.get(n.id)>0))issues.push(issue('warning',`Bone ${n.id} "${n.name}" has no vertices attached.`,`Bone ${n.id}`));});

    (parsed.faceEffects||[]).forEach((f,i)=>{if(f.path&&!/\.(facefx|facefx_ingame)$/i.test(f.path))issues.push(issue('error',`FaceEffect ${i} has corrupted path "${f.path}".`,`FaceEffect ${i}`));});
    if((parsed.bindPose||[]).length&&nodes.length&&parsed.bindPose.length!==nodes.length+1)issues.push(issue('warning',`BindPose has ${parsed.bindPose.length} matrices; expected about ${nodes.length+1}.`));

    collectAllTracks(parsed).forEach(x=>analyzeTrack(x.track,x.label,issues,parsed));

    for(let i=0;i<textures.length;i++)if(!textureUses.get(i)&&!textures[i].replaceableId)issues.push(issue('unused',`Texture ${i} "${textures[i].path||''}" is not referenced by materials or parsed emitters.`,`Texture ${i}`));
    for(let i=0;i<materials.length;i++)if(!materialUses.get(i))issues.push(issue('unused',`Material ${i} is not referenced by a geoset or ribbon.`,`Material ${i}`));
    for(let i=0;i<(parsed.textureAnimations||[]).length;i++)if(!txanUses.get(i))issues.push(issue('unused',`TextureAnimation ${i} is not referenced by any layer.`,`TextureAnimation ${i}`));
    if((parsed.unknownChunks||[]).length)issues.push(issue('info',`Preserved unknown MDX chunks: ${parsed.unknownChunks.map(c=>c.tag).join(', ')}.`));

    if(!issues.length)issues.push(issue('info','Model parsed successfully with no checker warnings.'));
    return{name:entry.name,type:'model',size:entry.data.byteLength||entry.data.length||0,meta:{format:`${parsed.type} v${version}`,textures:textures.length,materials:materials.length,geosets:geosets.length,sequences:sequences.length,nodes:nodes.length,effects:nodes.filter(n=>!['Bone','Helper'].includes(n.type)).length,vertices:geosets.reduce((n,g)=>n+(g.vertices||[]).length,0),triangles:geosets.reduce((n,g)=>n+(g.faces||[]).length,0),unknownChunks:(parsed.unknownChunks||[]).length,restPose:{minZ:spatialCompatibility.rest.minZ,maxZ:spatialCompatibility.rest.maxZ,belowRatio:spatialCompatibility.rest.belowRatio,buried:spatialCompatibility.buried},rootMotion:{maxPositiveZ:spatialCompatibility.root.maxPositiveZ,maxAbsZ:spatialCompatibility.root.maxAbsZ},localTextures:standaloneTextureScan?{attempted:!!standaloneTextureScan.attempted,ok:!!standaloneTextureScan.ok,requested:standaloneTextureScan.requested||0,found:standaloneTextureScan.found||0,missing:(standaloneTextureScan.missing||[]).length,scannedFiles:standaloneTextureScan.scannedFiles||0,truncated:!!standaloneTextureScan.truncated}:null},issues,status:worstSeverity(issues),parsed};
  }

  async function analyzeModelEntry(entry,index,referencedPackageFiles,context={}){
    const issues=[];
    try{
      const buffer=abOf(entry),parsed=ext(entry.name)==='mdl'?core.parseMDL(buffer):core.parseMDX(buffer);
      let standaloneTextureScan=context.standaloneTextureScan||null;
      if(!context.packageMode&&!standaloneTextureScan&&context.resolveStandaloneTextures!==false){
        standaloneTextureScan=await scanStandaloneModelTextures(entry,parsed,context.localTextureBridge||null);
        if(standaloneTextureScan.attempted){
          sanityCheckerLog(standaloneTextureScan.ok?'info':'warn','Standalone model texture lookup finished',{model:entry.name,modelPath:standaloneTextureScan.modelPath||entry.sourcePath||'',requested:standaloneTextureScan.requested,found:standaloneTextureScan.found,missing:standaloneTextureScan.missing,scannedFiles:standaloneTextureScan.scannedFiles,truncated:standaloneTextureScan.truncated,reason:standaloneTextureScan.reason||''});
        }
      }
      return analyzeModelParsed(entry,parsed,index,referencedPackageFiles,{...context,standaloneTextureScan});
    }catch(err){
      issues.push(issue('error',`Model parser failed: ${err.message}`));
      return {name:entry.name,type:'model',size:entry.data.byteLength||entry.data.length||0,meta:{format:ext(entry.name).toUpperCase()},issues,status:'error'};
    }
  }

  async function analyzeEntries(entries,sourceLabel,options={}){
    const clean=entries.filter(e=>e&&e.name&&!String(e.name).endsWith('/')&&e.data);
    const index=makeIndex(clean); const referencedPackageFiles=new Set(); const report=[];
    const packageMode=options.packageMode!=null?!!options.packageMode:(clean.length>1||/\.zip$/i.test(String(sourceLabel||'')));
    const models=clean.filter(e=>MODEL_EXT.has(ext(e.name)));
    const textures=clean.filter(e=>IMAGE_EXT.has(ext(e.name)));
    const other=clean.filter(e=>!MODEL_EXT.has(ext(e.name))&&!IMAGE_EXT.has(ext(e.name)));
    for(const e of models) report.push(await analyzeModelEntry(e,index,referencedPackageFiles,{packageMode}));
    for(const e of textures) report.push(await analyzeTextureEntry(e));
    for(const e of other) report.push({name:e.name,type:'other',size:e.data.byteLength||e.data.length||0,meta:{format:ext(e.name).toUpperCase()||'FILE'},issues:[issue('info','File is present in the package but is not analyzed by this checker.')],status:'info'});

    const modelRefs=new Set();
    for(const r of report.filter(r=>r.type==='model'&&r.parsed)) for(const t of (r.parsed.textureDefs||[])){ const found=resolveRef(index,t.path||''); if(found) modelRefs.add(norm(found.name)); }
    for(const r of report.filter(r=>r.type==='texture')){
      if(models.length && !modelRefs.has(norm(r.name))){ r.issues.push(issue('unused','Texture file is not referenced by any model in this checked batch.')); r.status=worstSeverity(r.issues); }
    }

    const counts={error:0,severe:0,warning:0,unused:0,info:0};
    for(const r of report) for(const it of r.issues) if(counts[it.severity]!=null) counts[it.severity]++;
    return {sourceLabel:sourceLabel||'Files',entries:clean,report,counts,models:models.length,textures:textures.length,other:other.length,packageMode};
  }

  async function entriesFromFiles(files){
    const out=[],bridge=window.WC3_LOCAL_FILES;
    for(const file of Array.from(files||[])){
      const ab=await file.arrayBuffer();let sourcePath='';
      try{sourcePath=bridge?.pathForFile?.(file)||'';}catch(_){}
      out.push({name:file.webkitRelativePath||file.name,data:new Uint8Array(ab),sourceFile:file,sourcePath});
    }
    return out;
  }

  async function entriesFromZip(file){
    const ab=await file.arrayBuffer();
    return core.unzipEntries(ab);
  }

  function cardMeta(r){
    const m=r.meta||{};
    if(r.type==='model'){
      const local=m.localTextures?.attempted?` · local textures ${m.localTextures.found||0}/${m.localTextures.requested||0}${m.localTextures.truncated?' · scan capped':''}`:'';
      return `${m.format||'MODEL'} · ${m.geosets||0} geosets · ${m.triangles||0} triangles · ${m.textures||0} texture slots${local} · ${fmtBytes(r.size)}`;
    }
    if(r.type==='texture') return `${m.format||'TEXTURE'}${m.width?` · ${m.width}×${m.height}`:''}${m.mipmaps?` · ${m.mipmaps} mips`:''} · ${fmtBytes(r.size)}`;
    return `${m.format||'FILE'} · ${fmtBytes(r.size)}`;
  }

  function render(){
    const batch=state.batch;
    const list=$('#sanityResults');
    const guide=$('#sanityEmptyGuide');
    if(!batch){
      $('#sanityErrors').textContent='0'; $('#sanitySevere').textContent='0'; $('#sanityWarnings').textContent='0'; $('#sanityUnused').textContent='0';
      $('#sanityFileCount').textContent='0 files'; $('#sanityBatchInfo').textContent='No files checked yet.';
      const fixBtn=$('#sanityFixBtn');if(fixBtn){fixBtn.disabled=true;fixBtn.textContent=state.fixRunning?'Auto Fix Running…':'Auto Fix Models';}
      if(guide) guide.classList.remove('hidden');
      list.classList.add('empty'); list.textContent='';
      return;
    }
    if(guide) guide.classList.add('hidden');
    $('#sanityErrors').textContent=batch.counts.error; $('#sanitySevere').textContent=batch.counts.severe; $('#sanityWarnings').textContent=batch.counts.warning; $('#sanityUnused').textContent=batch.counts.unused;
    $('#sanityFileCount').textContent=`${batch.report.length} file${batch.report.length===1?'':'s'}`;
    const fixLine=state.lastFix?`\nLast Auto Fix · ${state.lastFix.models} model(s) changed · ${state.lastFix.totalChanges||0} deterministic change(s) · ${state.lastFix.skipped||0} ambiguous/risky item(s) left untouched`:``;
    $('#sanityBatchInfo').textContent=`${batch.sourceLabel}\n${batch.models} model(s) · ${batch.textures} texture(s) · ${batch.other} other file(s)\n${batch.counts.error} errors · ${batch.counts.severe} severe · ${batch.counts.warning} warnings · ${batch.counts.unused} unused${fixLine}`;
    const fixBtn=$('#sanityFixBtn');if(fixBtn){fixBtn.disabled=batch.models<1||state.fixRunning;fixBtn.textContent=state.fixRunning?'Auto Fix Running…':(batch.models>1?`Auto Fix ${batch.models} Models`:'Auto Fix Model');}
    list.classList.remove('empty'); list.innerHTML='';
    const ordered=[...batch.report].sort((a,b)=>(ORDER[worstSeverity(b.issues)]||0)-(ORDER[worstSeverity(a.issues)]||0)||a.name.localeCompare(b.name));
    const tabSeverities=['error','severe','warning','unused'];
    for(const r of ordered){
      const card=document.createElement('div'); card.className='sanity-file-card'; card.dataset.search=(r.name+' '+r.issues.map(i=>i.message).join(' ')).toLowerCase();
      const st=worstSeverity(r.issues),counts=Object.fromEntries(['error','severe','warning','unused','info'].map(sev=>[sev,r.issues.filter(x=>x.severity===sev).length]));
      card.dataset.activeSeverity=tabSeverities.find(sev=>counts[sev]>0)||(counts.info?'info':'');
      card.innerHTML=`<div class="sanity-file-head" role="button" tabindex="0"><span class="sanity-card-chevron">▾</span><strong>${escapeHtml(r.name)}</strong><span class="sanity-file-status ${st==='info'||st==='unused'?'':st}">${st==='ok'?'OK':st.toUpperCase()}</span></div><div class="sanity-file-meta">${escapeHtml(cardMeta(r))}</div><div class="sanity-severity-tabs" role="tablist" aria-label="Issue categories for ${escapeHtml(r.name)}"></div><div class="sanity-issue-list"></div><div class="sanity-info-block"><div class="sanity-info-heading">Info <span>${counts.info}</span></div><div class="sanity-info-list"></div></div>`;
      const tabs=card.querySelector('.sanity-severity-tabs'),il=card.querySelector('.sanity-issue-list'),infoList=card.querySelector('.sanity-info-list');
      const labels={error:'Errors',severe:'Severe',warning:'Warnings',unused:'Unused'};
      for(const sev of tabSeverities){
        const btn=document.createElement('button');btn.type='button';btn.className='sanity-severity-tab';btn.dataset.severity=sev;btn.setAttribute('role','tab');btn.disabled=counts[sev]===0;btn.innerHTML=`<span>${labels[sev]}</span><strong>${counts[sev]}</strong>`;
        btn.addEventListener('click',e=>{e.stopPropagation();if(btn.disabled)return;card.dataset.activeSeverity=sev;applyFilters();});tabs.appendChild(btn);
      }
      for(const it of r.issues){
        const row=document.createElement('div'); row.className=`sanity-issue ${it.severity}`; row.dataset.severity=it.severity;
        row.innerHTML=`<div class="sev">${escapeHtml(it.severity)}</div><div class="msg">${escapeHtml(it.message)}</div>`;
        (it.severity==='info'?infoList:il).appendChild(row);
      }
      if(!counts.info)card.querySelector('.sanity-info-block')?.classList.add('hidden-result');
      const toggle=()=>card.classList.toggle('is-collapsed');
      const head=card.querySelector('.sanity-file-head'); head.addEventListener('click',toggle); head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
      list.appendChild(card);
    }
    applyFilters();
  }

  function escapeHtml(str){ return String(str||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function applyFilters(){
    const term=($('#sanitySearch').value||'').trim().toLowerCase(),allowed=new Set($$('.sanity-filter-check:checked').map(x=>x.value)),main=['error','severe','warning','unused'];
    $$('#sanityResults .sanity-file-card').forEach(card=>{
      const rows=[...card.querySelectorAll('.sanity-issue-list .sanity-issue')],present=new Set(rows.map(x=>x.dataset.severity));
      let active=card.dataset.activeSeverity||'';
      if(active!=='info'&&(!allowed.has(active)||!present.has(active)))active=main.find(sev=>allowed.has(sev)&&present.has(sev))||'';
      card.dataset.activeSeverity=active;
      let visibleIssues=0;
      for(const row of rows){const show=!!active&&row.dataset.severity===active&&allowed.has(row.dataset.severity);row.classList.toggle('hidden-result',!show);if(show)visibleIssues++;}
      card.querySelectorAll('.sanity-severity-tab').forEach(btn=>{const selected=btn.dataset.severity===active;btn.classList.toggle('active',selected);btn.setAttribute('aria-selected',selected?'true':'false');btn.classList.toggle('filtered-out',!allowed.has(btn.dataset.severity));});
      const infoRows=[...card.querySelectorAll('.sanity-info-list .sanity-issue')],showInfo=allowed.has('info')&&infoRows.length>0;
      for(const row of infoRows){row.classList.toggle('hidden-result',!showInfo);if(showInfo)visibleIssues++;}
      const infoBlock=card.querySelector('.sanity-info-block');if(infoBlock)infoBlock.classList.toggle('hidden-result',!showInfo);
      const textOk=!term||card.dataset.search.includes(term);card.classList.toggle('hidden-result',!textOk||visibleIssues===0);
    });
  }

  function buildReportText(batch=state.batch){
    if(!batch)return '';
    const b=batch,lines=[];
    lines.push('BLP Paint Reforged — Sanity Checker Report');lines.push(`Source: ${b.sourceLabel}`);lines.push(`Files: ${b.report.length}`);lines.push(`Errors: ${b.counts.error} | Severe: ${b.counts.severe} | Warnings: ${b.counts.warning} | Unused: ${b.counts.unused}`);lines.push('');
    if(state.lastFix){
      lines.push('AUTO FIX SUMMARY');lines.push(`  Models changed: ${state.lastFix.models}`);lines.push(`  Deterministic changes: ${state.lastFix.totalChanges||0}`);lines.push(`  Ambiguous/risky items left untouched: ${state.lastFix.skipped||0}`);lines.push(`  Fix counters: ${JSON.stringify(state.lastFix.fixCounts||{})}`);lines.push(`  Safety totals: ${JSON.stringify(state.lastFix.safety||{})}`);
      for(const m of state.lastFix.modelReports||[]){lines.push(`  ${m.model}: ${m.totalChanges} change(s) · errors ${m.before?.error||0}→${m.after?.error||0} · severe ${m.before?.severe||0}→${m.after?.severe||0}`);if(m.spatialProof?.ok)lines.push(`    SPATIAL PROOF · root ${m.spatialProof.rootId} · delta ${Number(m.spatialProof.delta||0).toFixed(3)} Z · ${m.spatialProof.checkedNodes} nodes · ${m.spatialProof.checkedGeosets} geosets · bindings ${m.spatialProof.bindingsPreserved?'preserved':'changed'} · animation invariant ${m.spatialProof.animationInvariant?'passed':'failed'}`);for(const d of m.details||[])lines.push(`    FIX [${String(d.safety||'safe').toUpperCase()}] ${d.fix}${d.count>1?` ×${d.count}`:''} · ${d.target} · ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}${d.note?` · ${d.note}`:''}`);for(const x of m.skipped||[])lines.push(`    SKIP · ${x.target} · ${x.reason}`);}lines.push('');
    }
    for(const r of b.report){lines.push(`[${r.type.toUpperCase()}] ${r.name}`);lines.push(`  ${cardMeta(r)}`);for(const it of r.issues)lines.push(`  - ${it.severity.toUpperCase()}: ${it.message}`);lines.push('');}
    return lines.join('\n');
  }
  function exportReport(){
    if(!state.batch)return;
    const blob=new Blob([buildReportText(state.batch)],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sanity-report.txt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadData(data,name,type='application/octet-stream'){
    const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function saveAutoFixOutput(data,name,type='application/octet-stream'){
    const native=state.saveBinaryOverride||window.WC3_LOCAL_FILES?.saveBinary;
    if(typeof native==='function'){
      const raw=data instanceof Uint8Array?data:data instanceof ArrayBuffer?new Uint8Array(data):ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(await new Blob([data]).arrayBuffer());
      const extension=ext(name),filters=extension?[{name:extension==='zip'?'ZIP package':extension.toUpperCase()+' file',extensions:[extension]}]:[];
      const result=await native(name,raw,filters);
      sanityLog(result?.canceled?'debug':'info',result?.canceled?'Auto Fix save cancelled':'Auto Fix output saved',{name,bytes:raw.byteLength,path:result?.path||'',nativeDialog:true});
      return result||{canceled:false};
    }
    downloadData(data,name,type);
    sanityLog('debug','Auto Fix output sent through legacy download fallback',{name,nativeDialog:false});
    return{canceled:false,legacyDownload:true,name};
  }
  async function autoFixModels(){
    if(state.fixRunning){sanityLog('warn','Auto Fix re-entry ignored',{reason:'already-running'});return;}
    if(!state.batch||!state.entries?.length||!state.batch.models)return;
    state.fixRunning=true;render();app.showBusy('Repairing Warcraft model compatibility issues…');
    const allowConservative=!!$('#sanityConservativeFixes')?.checked;
    const fixedEntries=[],summary={models:0,totalChanges:0,skipped:0,fixCounts:{},safety:{safe:0,conservative:0,other:0,skipped:0},spatialDelta:[],modelReports:[],mode:allowConservative?'verified spatial + conservative animation/rig':'verified spatial + safe-only'},index=makeIndex(state.entries),referencedPackageFiles=new Set();
    sanityLog('info','Batch Auto Fix started',{source:state.batch.sourceLabel,models:state.batch.models,files:state.entries.length,profile:'smart-safe-v4.1',mode:summary.mode,spatialRepair:'verified-auto'});
    try{
      for(const entry of state.entries){
        if(!MODEL_EXT.has(ext(entry.name))){fixedEntries.push(entry);continue;}
        const r=await repairModelEntry(entry,index,referencedPackageFiles,{allowConservative,packageMode:!!state.batch.packageMode});fixedEntries.push(r.entry);
        summary.skipped+=(r.actions?.skipped?.length||0)+(r.actions?.skippedTruncated||0);
        if(r.actions){const ss=safetySummary(r.actions);for(const k of ['safe','conservative','other','skipped'])summary.safety[k]+=ss[k]||0;}
        if(r.actions)for(const [k,v] of Object.entries(compactActionCounts(r.actions)))if(typeof v==='number')summary.fixCounts[k]=(summary.fixCounts[k]||0)+v;
        if(r.changed){
          summary.models++;summary.totalChanges+=r.actions.totalChanges||0;
          if(r.actions.spatialNormalized)summary.spatialDelta.push({model:r.sourceName,delta:r.actions.spatialDelta,rootId:r.actions.rootId});
          summary.modelReports.push({model:r.sourceName,output:r.entry.name,totalChanges:r.actions.totalChanges||0,before:r.before,after:r.after,details:r.actions.details||[],skipped:r.actions.skipped||[],serializerChanges:r.serializerChanges||{},spatialProof:r.actions.spatialProof||null});
        }
      }
      if(!summary.models){
        state.lastFix={...summary};app.setStatus(`Sanity Auto Fix: no safe deterministic repair was required · ${summary.skipped} ambiguous/risky item(s) left untouched.`);
        sanityLog('info','Batch Auto Fix finished with no changes',summary);return;
      }
      let saveResult;
      if(fixedEntries.length===1&&MODEL_EXT.has(ext(fixedEntries[0].name)))saveResult=await saveAutoFixOutput(fixedEntries[0].data,basename(fixedEntries[0].name));
      else if(window.SimpleZip?.create){const zip=window.SimpleZip.create(fixedEntries.map(e=>({name:e.name,data:e.data})));saveResult=await saveAutoFixOutput(zip,'sanity-fixed-package.zip','application/zip');}
      else{
        const models=fixedEntries.filter(e=>MODEL_EXT.has(ext(e.name)));
        if(models.length!==1)throw new Error('ZIP backend unavailable for multi-model Auto Fix output. No files were saved.');
        saveResult=await saveAutoFixOutput(models[0].data,basename(models[0].name));
      }
      if(saveResult?.canceled){app.setStatus('Sanity Auto Fix save cancelled · no repaired file was loaded into the checker.');sanityLog('debug','Batch Auto Fix cancelled at save step',{models:summary.models,totalChanges:summary.totalChanges});return;}
      state.entries=fixedEntries;state.lastFix=summary;state.batch=await analyzeEntries(fixedEntries,`${state.batch.sourceLabel} · AUTO FIXED`,{packageMode:!!state.batch.packageMode});render();
      app.setStatus(`Sanity Auto Fix complete · ${summary.models} model(s) · ${summary.totalChanges} deterministic change(s) · ${summary.skipped} ambiguous/risky item(s) untouched`);
      sanityLog('info','Batch Auto Fix complete',{modelsChanged:summary.models,totalChanges:summary.totalChanges,skipped:summary.skipped,fixCounts:summary.fixCounts,safety:summary.safety,mode:summary.mode,finalCounts:state.batch.counts,outputs:summary.modelReports.map(x=>({model:x.model,output:x.output,before:x.before,after:x.after,totalChanges:x.totalChanges,spatialProof:x.spatialProof||null}))});
    }catch(e){sanityLog('error','Batch Auto Fix failed',e);if(!state.testMode)console.error(e);alert('Sanity Auto Fix failed.\n\n'+e.message);}
    finally{state.fixRunning=false;app.hideBusy();render();}
  }
  async function runEntries(entries,label,options={}){
    app.showBusy('Running Warcraft sanity checks…');
    try{ state.lastFix=null;state.batch=await analyzeEntries(entries,label,options);state.entries=entries;render();app.setStatus(`Sanity check complete · ${state.batch.counts.error} errors · ${state.batch.counts.severe} severe`); }
    catch(e){console.error(e);alert('Sanity check failed.\n\n'+e.message);}
    finally{app.hideBusy();}
  }

  async function runFiles(files){ const arr=Array.from(files||[]); if(!arr.length)return; await runEntries(await entriesFromFiles(arr),arr.length===1?arr[0].name:`${arr.length} selected files`,{packageMode:arr.length>1}); }
  async function runZip(file){ if(!file)return;app.showBusy('Reading ZIP package…');try{const entries=await entriesFromZip(file);app.hideBusy();await runEntries(entries,file.name,{packageMode:true});}catch(e){app.hideBusy();alert('Could not read ZIP package.\n\n'+e.message);} }

  function openSanity(){
    core.setMode('sanity');
    // Keep the shared workspace state/header in sync with the right-panel mode.
    // Previously SANITY_API.open() only switched the internal panel, leaving
    // document.body.dataset.module on the previous workspace (usually Model Lab).
    if(document.body.dataset.module!=='sanity'){
      window.WC3_WORKSPACE_UI?.setActive?.('sanity',{silent:true});
    }
  }

  // In the Sanity workspace the unified header's Open Files button must open the checker input,
  // not the Texture Paint file picker that normally owns #openBtn.
  $('#openBtn')?.addEventListener('click',e=>{
    if(document.body.dataset.module!=='sanity') return;
    e.preventDefault(); e.stopImmediatePropagation(); $('#sanityFilesInput').click();
  },true);

  $('#sanityCheckerBtn').addEventListener('click',openSanity);
  $('#sanityFilesBtn').addEventListener('click',()=>$('#sanityFilesInput').click());
  $('#sanityZipBtn').addEventListener('click',()=>$('#sanityZipInput').click());
  $('#sanityFilesInput').addEventListener('change',e=>{runFiles(e.target.files);e.target.value='';});
  $('#sanityZipInput').addEventListener('change',e=>{runZip(e.target.files[0]);e.target.value='';});
  $('#sanityClearBtn').addEventListener('click',()=>{state.batch=null;state.entries=[];state.lastFix=null;render();});
  $('#sanityExportBtn').addEventListener('click',exportReport);
  {
    const fixBtn=$('#sanityFixBtn');
    if(fixBtn&&!fixBtn.dataset.sanityAutoFixBound){fixBtn.dataset.sanityAutoFixBound='1';fixBtn.addEventListener('click',autoFixModels);}
  }
  $('#sanitySearch').addEventListener('input',applyFilters);
  $$('.sanity-filter-check').forEach(x=>x.addEventListener('change',applyFilters));
  const dz=$('#sanityDropZone');
  ['dragenter','dragover'].forEach(type=>dz.addEventListener(type,e=>{e.preventDefault();dz.classList.add('dragging');}));
  ['dragleave','drop'].forEach(type=>dz.addEventListener(type,e=>{e.preventDefault();dz.classList.remove('dragging');}));
  dz.addEventListener('drop',e=>{const fs=Array.from(e.dataTransfer.files||[]);if(fs.length===1&&ext(fs[0].name)==='zip')runZip(fs[0]);else runFiles(fs);});

  const autoTest=Object.freeze({
    getState:()=>state,
    setSaveBinaryOverride:fn=>{state.saveBinaryOverride=typeof fn==='function'?fn:null;},
    setTestMode:v=>{state.testMode=!!v;},
    setBatchFixture:(batch,entries=[])=>{state.batch=batch||null;state.entries=Array.isArray(entries)?entries:[];render();return state.batch;},
    saveAutoFixOutput,
    isFixRunning:()=>!!state.fixRunning
  });
  window.WC3_SANITY_CORE={analyzeEntries,analyzeTextureEntry,analyzeModelEntry,analyzeModelParsed,analyzeTrack,collectAllTracks,restPoseGeometryStats,rootTranslationStats,analyzeSpatialCompatibility,openingKeyRepairTargets,closingKeyRepairTargets,buriedNormalizationPlan,geometryInfluenceRootIds,spatialNormalizationProof,normalizeBuriedRestPose,repairModelParsed,repairModelEntry,entriesFromZip,buildReportText,repairableTrackContexts,issueCounts,compactActionCounts,safetySummary,repairGeometryBindings,recalculateGeosetNormals,standaloneTextureRefs,scanStandaloneModelTextures,standaloneTextureResolved,__autoTest:autoTest};
  window.SANITY_API={checkFiles:runFiles,checkZip:runZip,runEntries,autoFix:autoFixModels,open:openSanity,getBatch:()=>state.batch,render,applyFilters,buildReportText:()=>buildReportText(state.batch),__autoTest:autoTest};
  render();
})();
