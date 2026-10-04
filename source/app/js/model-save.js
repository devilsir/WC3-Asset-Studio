(function(){
  'use strict';

  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8',{fatal:false});

  function bytesOf(data){
    if(data instanceof Uint8Array) return data;
    if(data instanceof ArrayBuffer) return new Uint8Array(data);
    if(ArrayBuffer.isView(data)) return new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    if(typeof data==='string') return enc.encode(data);
    throw new Error('Unsupported model buffer.');
  }
  function concat(parts){
    const normalized=parts.map(bytesOf), size=normalized.reduce((n,p)=>n+p.length,0), out=new Uint8Array(size);
    let off=0; for(const p of normalized){out.set(p,off);off+=p.length;} return out;
  }
  function writeTag(view,off,tag){ for(let i=0;i<4;i++) view.setUint8(off+i,tag.charCodeAt(i)||0); }
  function writeLatinZ(out,off,len,text){
    out.fill(0,off,off+len); const s=String(text||'');
    for(let i=0;i<Math.min(len-1,s.length);i++) out[off+i]=s.charCodeAt(i)&255;
  }
  function f(v,d=0){v=Number(v);return Number.isFinite(v)?v:d;}
  function i(v,d=0){v=Number(v);return Number.isFinite(v)?Math.trunc(v):d;}
  function vec3(v,def=[0,0,0]){return [f(v&&v[0],def[0]),f(v&&v[1],def[1]),f(v&&v[2],def[2])];}
  function escMdl(s){return String(s||'').replace(/"/g,'');}
  function num(v){const n=f(v,0); if(Number.isInteger(n)) return `${n}.000000`; return n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');}
  function v3(v){const a=vec3(v);return `{ ${num(a[0])}, ${num(a[1])}, ${num(a[2])} }`;}

  function topChunks(src){
    const bytes=bytesOf(src), view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(bytes.length<4||String.fromCharCode(...bytes.slice(0,4))!=='MDLX') throw new Error('Not an MDX file.');
    const out=[]; let off=4;
    while(off+8<=bytes.length){
      const tag=String.fromCharCode(bytes[off],bytes[off+1],bytes[off+2],bytes[off+3]);
      const size=view.getUint32(off+4,true), end=off+8+size;
      if(end>bytes.length) throw new Error(`Truncated MDX chunk ${tag}.`);
      out.push({tag,header:off,size,data:bytes.slice(off+8,end),raw:bytes.slice(off,end)}); off=end;
    }
    return {bytes,chunks:out};
  }
  function chunk(tag,data){
    data=bytesOf(data); const out=new Uint8Array(8+data.length), view=new DataView(out.buffer);
    writeTag(view,0,tag); view.setUint32(4,data.length,true); out.set(data,8); return out;
  }
  function genericRecord(node){
    const out=new Uint8Array(96), view=new DataView(out.buffer); view.setUint32(0,96,true);
    writeLatinZ(out,4,80,node.name||`${node.type||'Node'}_${i(node.id,0)}`);
    view.setInt32(84,i(node.id??node.objectId,-1),true); view.setInt32(88,i(node.parentId,-1),true); view.setUint32(92,i(node.flags,0)>>>0,true);
    return out;
  }

  const TRACK_SPECS={
    KGTR:[3,'float'],KGRT:[4,'float'],KGSC:[3,'float'],
    KMTF:[1,'uint'],KMTA:[1,'float'],KMTE:[1,'float'],KFC3:[3,'float'],KFCA:[1,'float'],KFTC:[1,'float'],
    KCTR:[3,'float'],KCRL:[1,'float'],KTTR:[3,'float'],
    KP2E:[1,'float'],KP2G:[1,'float'],KP2L:[1,'float'],KP2R:[1,'float'],KP2N:[1,'float'],KP2W:[1,'float'],KP2S:[1,'float'],KP2V:[1,'float'],
    KPPL:[1,'float'],KPPE:[1,'float'],KPPS:[1,'float'],KPPC:[3,'float'],KPPA:[1,'float'],KPPV:[1,'float'],
    KGAO:[1,'float'],KGAC:[3,'float']
  };
  function trackBinary(tag,track){
    if(!track||!Array.isArray(track.keys))return new Uint8Array();
    const spec=TRACK_SPECS[tag];if(!spec)return new Uint8Array();
    const [components,kind]=spec,interp=Math.max(0,Math.min(3,i(track.interpolationType,(['DontInterp','Linear','Hermite','Bezier'].indexOf(track.interpolation))))),tangent=interp>1;
    const per=4+components*4*(tangent?3:1),out=new Uint8Array(16+track.keys.length*per),v=new DataView(out.buffer);
    writeTag(v,0,tag);v.setUint32(4,track.keys.length,true);v.setUint32(8,interp,true);v.setInt32(12,i(track.globalSequenceId,-1),true);
    let p=16;const writeVals=(vals,def)=>{const a=Array.isArray(vals)?vals:[];for(let c=0;c<components;c++,p+=4){const n=f(a[c],def&&def[c]!==undefined?def[c]:0);if(kind==='uint')v.setUint32(p,Math.max(0,Math.round(n))>>>0,true);else v.setFloat32(p,n,true);}};
    for(const key of track.keys){v.setInt32(p,i(key.frame,0),true);p+=4;writeVals(key.value);if(tangent){writeVals(key.inTan,key.value);writeVals(key.outTan,key.value);}}
    return out;
  }
  function trackSetBinary(tracks,tags){const parts=[];for(const tag of tags||[]){const b=trackBinary(tag,tracks&&tracks[tag]);if(b.length)parts.push(b);}return parts.length?concat(parts):new Uint8Array();}
  function genericRecordFull(node){
    const tracks=trackSetBinary(node&&node.tracks,['KGTR','KGRT','KGSC']),size=96+tracks.length,out=new Uint8Array(size),view=new DataView(out.buffer);view.setUint32(0,size,true);
    writeLatinZ(out,4,80,node.name||`${node.type||'Node'}_${i(node.id,0)}`);view.setInt32(84,i(node.id??node.objectId,-1),true);view.setInt32(88,i(node.parentId,-1),true);view.setUint32(92,i(node.flags,0)>>>0,true);if(tracks.length)out.set(tracks,96);return out;
  }
  function bonesData(model){const parts=[];for(const n of model.bones||[]){if(!n||n.__deleted)continue;const g=genericRecordFull(n),tail=new Uint8Array(8),v=new DataView(tail.buffer);v.setInt32(0,i(n.geosetId,-1),true);v.setInt32(4,i(n.geosetAnimId,-1),true);parts.push(g,tail);}return parts.length?concat(parts):new Uint8Array();}
  function helpersData(model){const parts=(model.helpers||[]).filter(n=>n&&!n.__deleted).map(genericRecordFull);return parts.length?concat(parts):new Uint8Array();}
  function pivotsAllData(model){
    const piv=(model.pivots||[]).map(p=>({x:f(p&&p.x),y:f(p&&p.y),z:f(p&&p.z)}));let max=piv.length-1;
    for(const n of model.nodes||[])if(n&&!n.__deleted)max=Math.max(max,i(n.id??n.objectId,-1));while(piv.length<=max)piv.push({x:0,y:0,z:0});
    for(const n of model.nodes||[]){if(!n||n.__deleted)continue;const id=i(n.id??n.objectId,-1);if(id<0)continue;const pp=n.pivot||piv[id]||{x:0,y:0,z:0};piv[id]={x:f(pp.x),y:f(pp.y),z:f(pp.z)};}
    const out=new Uint8Array(piv.length*12),v=new DataView(out.buffer);piv.forEach((p,idx)=>{const o=idx*12;v.setFloat32(o,p.x,true);v.setFloat32(o+4,p.y,true);v.setFloat32(o+8,p.z,true);});return out;
  }
  function materialLayerRecord(layer,formatVersion){
    const hasExtended=formatVersion>800;
    const tracks=trackSetBinary(layer&&layer.tracks,['KMTF','KMTA','KMTE','KFC3','KFCA','KFTC']);
    const slots={...(layer&&layer.textureSlots||{})};if(layer&&Number.isFinite(+layer.textureId))slots[0]=i(layer.textureId,0);
    const slotPairs=hasExtended?Object.entries(slots).map(([slot,tid])=>[i(tid,-1),i(slot,0)]).filter(x=>x[0]>=0&&x[1]>=0&&x[1]<=31).sort((a,b)=>a[1]-b[1]):[];
    const fixed=4+24+(hasExtended?24:0)+(slotPairs.length?8+slotPairs.length*8:0),size=fixed+tracks.length,out=new Uint8Array(size),v=new DataView(out.buffer);v.setUint32(0,size,true);let p=4;
    v.setUint32(p,i(layer.filterModeId,0)>>>0,true);p+=4;v.setUint32(p,i(layer.flags,0)>>>0,true);p+=4;v.setInt32(p,i(layer.textureId,0),true);p+=4;v.setInt32(p,i(layer.textureAnimationId,-1),true);p+=4;v.setUint32(p,i(layer.coordId,0)>>>0,true);p+=4;v.setFloat32(p,f(layer.alpha,1),true);p+=4;
    if(hasExtended){v.setFloat32(p,f(layer.emissiveGain,1),true);p+=4;const fc=Array.isArray(layer.fresnelColor)?layer.fresnelColor:[1,1,1];for(let k=0;k<3;k++,p+=4)v.setFloat32(p,f(fc[k],1),true);v.setFloat32(p,f(layer.fresnelOpacity,0),true);p+=4;v.setFloat32(p,f(layer.fresnelTeamColor,0),true);p+=4;}
    if(slotPairs.length){v.setInt32(p,i(layer.slotTableUnknown,0),true);p+=4;v.setInt32(p,slotPairs.length,true);p+=4;for(const [tid,slot] of slotPairs){v.setInt32(p,tid,true);v.setInt32(p+4,slot,true);p+=8;}}
    if(tracks.length)out.set(tracks,p);return out;
  }
  function materialRecord(mat,formatVersion){
    const layers=(mat.layers||[]).map(l=>materialLayerRecord(l,formatVersion)),lays=concat([new Uint8Array([76,65,89,83]),(()=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,layers.length,true);return b;})(),...layers]);
    const shader=mat.layout==='legacy-reforged-shader-name'?new Uint8Array(80):new Uint8Array();if(shader.length)writeLatinZ(shader,0,80,mat.shader||'');
    const size=12+shader.length+lays.length,out=new Uint8Array(size),v=new DataView(out.buffer);v.setUint32(0,size,true);v.setInt32(4,i(mat.priorityPlane,0),true);v.setUint32(8,i(mat.flags,0)>>>0,true);let p=12;if(shader.length){out.set(shader,p);p+=shader.length;}out.set(lays,p);return out;
  }
  function materialsData(model){const parts=(model.materials||[]).map(m=>materialRecord(m,i(model.formatVersion,800)));return parts.length?concat(parts):new Uint8Array();}
  function cameraRecordFull(cam){const tracks=trackSetBinary(cam&&cam.tracks,['KCTR','KCRL','KTTR']),size=120+tracks.length,out=new Uint8Array(size),view=new DataView(out.buffer);view.setUint32(0,size,true);writeLatinZ(out,4,80,cam.name||'Camera');let p=84;for(const x of vec3(cam.position)){view.setFloat32(p,x,true);p+=4;}view.setFloat32(p,f(cam.fieldOfView,.7),true);p+=4;view.setFloat32(p,f(cam.farClippingPlane,5000),true);p+=4;view.setFloat32(p,f(cam.nearClippingPlane,8),true);p+=4;for(const x of vec3(cam.targetPosition)){view.setFloat32(p,x,true);p+=4;}if(tracks.length)out.set(tracks,p);return out;}
  function camerasData(model){const parts=(model.cameras||[]).filter(Boolean).map(cameraRecordFull);return parts.length?concat(parts):new Uint8Array();}
  function emitter2OuterFull(node){
    const g=genericRecordFull(node),fixed=new Uint8Array(171),v=new DataView(fixed.buffer);let p=0;[node.speed,node.variation,node.latitude,node.gravity,node.lifeSpan,node.emissionRate,node.length,node.width].forEach(x=>{v.setFloat32(p,f(x,0),true);p+=4;});v.setUint32(p,i(node.filterMode,1)>>>0,true);p+=4;v.setUint32(p,Math.max(1,i(node.rows,1))>>>0,true);p+=4;v.setUint32(p,Math.max(1,i(node.columns,1))>>>0,true);p+=4;v.setUint32(p,i(node.headOrTail,0)>>>0,true);p+=4;v.setFloat32(p,f(node.tailLength,0),true);p+=4;v.setFloat32(p,f(node.timeMiddle,.5),true);p+=4;
    const colors=node.segmentColors||[[1,1,1],[1,.5,.2],[0,0,0]];for(let c=0;c<3;c++)for(const x of vec3(colors[c]||[1,1,1])){v.setFloat32(p,x,true);p+=4;}const alphas=node.segmentAlphas||[255,255,0];for(let a=0;a<3;a++)fixed[p++]=Math.max(0,Math.min(255,i(alphas[a],255)));const scale=node.segmentScaling||[1,1,1];for(let k=0;k<3;k++){v.setFloat32(p,f(scale[k],1),true);p+=4;}const h=node.headIntervals||[[0,0,0],[0,0,0]],t=node.tailIntervals||[[0,0,0],[0,0,0]];for(const set of [h[0],h[1],t[0],t[1]])for(let n=0;n<3;n++){v.setUint32(p,Math.max(0,i(set&&set[n],0))>>>0,true);p+=4;}v.setInt32(p,i(node.textureId,0),true);p+=4;v.setUint32(p,i(node.squirt,0)>>>0,true);p+=4;v.setInt32(p,i(node.priorityPlane,0),true);p+=4;v.setUint32(p,i(node.replaceableId,0)>>>0,true);p+=4;
    const extra=trackSetBinary(node&&node.tracks,['KP2E','KP2G','KP2L','KP2R','KP2N','KP2W','KP2S','KP2V']),total=4+g.length+fixed.length+extra.length,out=new Uint8Array(total),ov=new DataView(out.buffer);ov.setUint32(0,total,true);let q=4;out.set(g,q);q+=g.length;out.set(fixed,q);q+=fixed.length;if(extra.length)out.set(extra,q);return out;
  }
  function emitters2Data(model){const parts=(model.particleEmitters2||[]).filter(n=>n&&!n.__deleted).map(emitter2OuterFull);return parts.length?concat(parts):new Uint8Array();}
  function popcornOuterFull(node){
    const g=genericRecordFull(node),fixed=new Uint8Array(552),v=new DataView(fixed.buffer);
    v.setFloat32(0,f(node.lifeSpan,1),true);v.setFloat32(4,f(node.emissionRate,1),true);v.setFloat32(8,f(node.speed,1),true);
    const c=Array.isArray(node.color)?node.color:[1,1,1];v.setFloat32(12,f(c[0],1),true);v.setFloat32(16,f(c[1],1),true);v.setFloat32(20,f(c[2],1),true);
    v.setFloat32(24,f(node.alpha,1),true);v.setUint32(28,i(node.replaceableId,0)>>>0,true);writeLatinZ(fixed,32,260,node.path||'');writeLatinZ(fixed,292,260,node.animationVisibilityGuide||'');
    const extra=trackSetBinary(node&&node.tracks,['KPPL','KPPE','KPPS','KPPC','KPPA','KPPV']),total=4+g.length+fixed.length+extra.length,out=new Uint8Array(total),ov=new DataView(out.buffer);ov.setUint32(0,total,true);let q=4;out.set(g,q);q+=g.length;out.set(fixed,q);q+=fixed.length;if(extra.length)out.set(extra,q);return out;
  }
  function popcornData(model){const parts=(model.popcornEmitters||[]).filter(n=>n&&!n.__deleted).map(popcornOuterFull);return parts.length?concat(parts):new Uint8Array();}
  function cameraRecord(cam){
    const out=new Uint8Array(120), view=new DataView(out.buffer); view.setUint32(0,120,true); writeLatinZ(out,4,80,cam.name||'Camera');
    let p=84; for(const x of vec3(cam.position)){view.setFloat32(p,x,true);p+=4;}
    view.setFloat32(p,f(cam.fieldOfView,.7),true);p+=4; view.setFloat32(p,f(cam.farClippingPlane,5000),true);p+=4; view.setFloat32(p,f(cam.nearClippingPlane,8),true);p+=4;
    for(const x of vec3(cam.targetPosition)){view.setFloat32(p,x,true);p+=4;} return out;
  }
  function attachmentOuter(node){
    const g=genericRecord(node), fixed=new Uint8Array(264), view=new DataView(fixed.buffer); writeLatinZ(fixed,0,260,node.path||''); view.setInt32(260,i(node.attachmentId,0),true);
    const total=4+g.length+fixed.length, out=new Uint8Array(total), ov=new DataView(out.buffer);ov.setUint32(0,total,true);out.set(g,4);out.set(fixed,4+g.length);return out;
  }
  function emitter2Outer(node){
    const g=genericRecord(node), fixed=new Uint8Array(171), v=new DataView(fixed.buffer); let p=0;
    const floats=[node.speed,node.variation,node.latitude,node.gravity,node.lifeSpan,node.emissionRate,node.length,node.width];
    floats.forEach(x=>{v.setFloat32(p,f(x,0),true);p+=4;});
    v.setUint32(p,i(node.filterMode,1)>>>0,true);p+=4;v.setUint32(p,Math.max(1,i(node.rows,1))>>>0,true);p+=4;v.setUint32(p,Math.max(1,i(node.columns,1))>>>0,true);p+=4;v.setUint32(p,i(node.headOrTail,0)>>>0,true);p+=4;
    v.setFloat32(p,f(node.tailLength,0),true);p+=4;v.setFloat32(p,f(node.timeMiddle,.5),true);p+=4;
    const colors=(node.segmentColors||[[1,1,1],[1,.5,.2],[0,0,0]]); for(let c=0;c<3;c++) for(const x of vec3(colors[c]||[1,1,1])){v.setFloat32(p,x,true);p+=4;}
    const alphas=node.segmentAlphas||[255,255,0]; for(let a=0;a<3;a++) fixed[p++]=Math.max(0,Math.min(255,i(alphas[a],255)));
    const scale=node.segmentScaling||[1,1,1]; for(let s=0;s<3;s++){v.setFloat32(p,f(scale[s],1),true);p+=4;}
    const h=node.headIntervals||[[0,0,0],[0,0,0]], t=node.tailIntervals||[[0,0,0],[0,0,0]];
    for(const set of [h[0],h[1],t[0],t[1]]) for(let n=0;n<3;n++){v.setUint32(p,Math.max(0,i(set&&set[n],0))>>>0,true);p+=4;}
    v.setInt32(p,i(node.textureId,0),true);p+=4; v.setUint32(p,i(node.squirt,0)>>>0,true);p+=4; v.setInt32(p,i(node.priorityPlane,0),true);p+=4; v.setUint32(p,i(node.replaceableId,0)>>>0,true);p+=4;
    const total=4+g.length+fixed.length, out=new Uint8Array(total), ov=new DataView(out.buffer);ov.setUint32(0,total,true);out.set(g,4);out.set(fixed,4+g.length);return out;
  }
  function textureData(existing,defs){
    const count=Math.max(defs.length,Math.floor((existing?existing.length:0)/268)); if(!count)return existing||new Uint8Array();
    const out=new Uint8Array(count*268); if(existing) out.set(existing.slice(0,Math.min(existing.length,out.length)));
    const v=new DataView(out.buffer);
    for(let idx=0;idx<defs.length;idx++){
      const d=defs[idx]||{}, off=idx*268, path=String(d.path||''); if(path.length>259)throw new Error(`Texture path ${idx} is longer than 259 bytes.`);
      v.setUint32(off,i(d.replaceableId,0)>>>0,true); writeLatinZ(out,off+4,260,path);
      let flags=Number.isFinite(+d.flags)?i(d.flags,0):((d.wrapWidth?1:0)|(d.wrapHeight?2:0)); v.setUint32(off+264,flags>>>0,true);
    }
    return out;
  }
  function pivotData(existing,model,customNodes){
    const old=existing||new Uint8Array(), oldCount=Math.floor(old.length/12); let maxId=oldCount-1;
    customNodes.forEach(n=>{maxId=Math.max(maxId,i(n.id??n.objectId,-1));});
    if(maxId<0) return old;
    const out=new Uint8Array((maxId+1)*12);out.set(old.slice(0,Math.min(old.length,out.length)));const v=new DataView(out.buffer);
    customNodes.forEach(n=>{const id=i(n.id??n.objectId,-1);if(id<0)return;const p=n.pivot||((model.pivots||[])[id])||{x:0,y:0,z:0};const o=id*12;v.setFloat32(o,f(p.x,0),true);v.setFloat32(o+4,f(p.y,0),true);v.setFloat32(o+8,f(p.z,0),true);});return out;
  }
  function appendData(existing,records){return records.length?concat([existing||new Uint8Array(),...records]):(existing||new Uint8Array());}

  function boundsForVertices(vertices){
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const v of vertices||[]){if(!v)continue;minX=Math.min(minX,f(v.x));minY=Math.min(minY,f(v.y));minZ=Math.min(minZ,f(v.z));maxX=Math.max(maxX,f(v.x));maxY=Math.max(maxY,f(v.y));maxZ=Math.max(maxZ,f(v.z));}
    if(!Number.isFinite(minX))return{min:{x:0,y:0,z:0},max:{x:0,y:0,z:0},center:{x:0,y:0,z:0},boundsRadius:0};
    const center={x:(minX+maxX)/2,y:(minY+maxY)/2,z:(minZ+maxZ)/2};
    let r=0;for(const v of vertices||[])if(v)r=Math.max(r,Math.hypot(f(v.x)-center.x,f(v.y)-center.y,f(v.z)-center.z));
    return{min:{x:minX,y:minY,z:minZ},max:{x:maxX,y:maxY,z:maxZ},center,boundsRadius:r};
  }
  function writeExtent(view,off,b){
    view.setFloat32(off,f(b&&b.boundsRadius,0),true);
    view.setFloat32(off+4,f(b&&b.min&&b.min.x,0),true);view.setFloat32(off+8,f(b&&b.min&&b.min.y,0),true);view.setFloat32(off+12,f(b&&b.min&&b.min.z,0),true);
    view.setFloat32(off+16,f(b&&b.max&&b.max.x,0),true);view.setFloat32(off+20,f(b&&b.max&&b.max.y,0),true);view.setFloat32(off+24,f(b&&b.max&&b.max.z,0),true);
  }

  function extentObject(ext,vertices){
    if(ext&&Array.isArray(ext.min)&&Array.isArray(ext.max))return{boundsRadius:f(ext.boundsRadius,0),min:{x:f(ext.min[0]),y:f(ext.min[1]),z:f(ext.min[2])},max:{x:f(ext.max[0]),y:f(ext.max[1]),z:f(ext.max[2])}};
    if(ext&&ext.min&&ext.max)return{boundsRadius:f(ext.boundsRadius,0),min:{x:f(ext.min.x),y:f(ext.min.y),z:f(ext.min.z)},max:{x:f(ext.max.x),y:f(ext.max.y),z:f(ext.max.z)}};
    return boundsForVertices(vertices||[]);
  }
  function flatFaces(geo){const out=[];for(const face of (geo&&geo.faces)||[]){if(Array.isArray(face))out.push(i(face[0]),i(face[1]),i(face[2]));else if(face)out.push(i(face.a),i(face.b),i(face.c));}return out;}
  function taggedCount(tag,count,bpe,writer){const out=new Uint8Array(8+count*bpe),v=new DataView(out.buffer);writeTag(v,0,tag);v.setUint32(4,count,true);if(writer)writer(v,8,out);return out;}
  function geosetRecordMdx(geo,formatVersion){
    const vertices=geo.vertices||[],normals=(geo.normals||[]).length?geo.normals:vertices.map(()=>({x:0,y:0,z:1})),indices=flatFaces(geo);
    const ptyp=(geo.faceTypeGroups||[]).length?geo.faceTypeGroups:[4],pcnt=(geo.faceGroups||[]).length?geo.faceGroups:[indices.length];
    const vertexGroups=(geo.vertexGroups||[]).length===vertices.length?geo.vertexGroups:new Array(vertices.length).fill(0);
    const matrixGroups=(geo.matrixGroups||[]).length?geo.matrixGroups:[[0]],groupCounts=matrixGroups.map(g=>(g||[]).length),matrixIndices=matrixGroups.flatMap(g=>(g||[]).map(x=>Math.max(0,i(x))));
    const parts=[];
    parts.push(taggedCount('VRTX',vertices.length,12,(v,o)=>{vertices.forEach((x,k)=>{const q=o+k*12;v.setFloat32(q,f(x&&x.x),true);v.setFloat32(q+4,f(x&&x.y),true);v.setFloat32(q+8,f(x&&x.z),true);});}));
    parts.push(taggedCount('NRMS',normals.length,12,(v,o)=>{normals.forEach((x,k)=>{const q=o+k*12;v.setFloat32(q,f(x&&x.x),true);v.setFloat32(q+4,f(x&&x.y),true);v.setFloat32(q+8,f(x&&x.z,1),true);});}));
    parts.push(taggedCount('PTYP',ptyp.length,4,(v,o)=>{ptyp.forEach((x,k)=>v.setUint32(o+k*4,Math.max(0,i(x))>>>0,true));}));
    parts.push(taggedCount('PCNT',pcnt.length,4,(v,o)=>{pcnt.forEach((x,k)=>v.setUint32(o+k*4,Math.max(0,i(x))>>>0,true));}));
    parts.push(taggedCount('PVTX',indices.length,2,(v,o)=>{indices.forEach((x,k)=>v.setUint16(o+k*2,Math.max(0,i(x)),true));}));
    parts.push(taggedCount('GNDX',vertexGroups.length,1,(_v,o,out)=>{vertexGroups.forEach((x,k)=>{out[o+k]=Math.max(0,Math.min(255,i(x)));});}));
    parts.push(taggedCount('MTGC',groupCounts.length,4,(v,o)=>{groupCounts.forEach((x,k)=>v.setUint32(o+k*4,Math.max(0,i(x))>>>0,true));}));
    parts.push(taggedCount('MATS',matrixIndices.length,4,(v,o)=>{matrixIndices.forEach((x,k)=>v.setUint32(o+k*4,Math.max(0,i(x))>>>0,true));}));
    const meta=new Uint8Array(12+(formatVersion>800?84:0)),mv=new DataView(meta.buffer);mv.setUint32(0,Math.max(0,i(geo.materialId))>>>0,true);mv.setUint32(4,Math.max(0,i(geo.selectionGroup))>>>0,true);mv.setUint32(8,Math.max(0,i(geo.selectionFlags))>>>0,true);if(formatVersion>800){mv.setInt32(12,i(geo.lod,-1),true);writeLatinZ(meta,16,80,geo.name||'');}parts.push(meta);
    const ext=new Uint8Array(28),ev=new DataView(ext.buffer);writeExtent(ev,0,extentObject(geo.extent,vertices));parts.push(ext);
    const seqs=geo.sequenceExtents||[],seqBlock=new Uint8Array(4+seqs.length*28),sv=new DataView(seqBlock.buffer);sv.setUint32(0,seqs.length,true);seqs.forEach((e,k)=>writeExtent(sv,4+k*28,extentObject(e,vertices)));parts.push(seqBlock);
    if((geo.tangents||[]).length){const tang=geo.tangents;parts.push(taggedCount('TANG',tang.length,16,(v,o)=>tang.forEach((a,k)=>{const q=o+k*16;for(let c=0;c<4;c++)v.setFloat32(q+c*4,f(a&&a[c],c===3?1:0),true);})));}
    if(geo.skin&&geo.skin.length){
      const skin=Array.from(geo.skin),elementBytes=(geo.skinElementBytes===2||formatVersion>=1800)?2:1;
      const block=new Uint8Array(8+skin.length*elementBytes),v=new DataView(block.buffer);
      writeTag(v,0,'SKIN');v.setUint32(4,skin.length,true);
      if(elementBytes===2){for(let k=0;k<skin.length;k++)v.setUint16(8+k*2,Math.max(0,Math.min(65535,i(skin[k]))),true);}
      else{for(let k=0;k<skin.length;k++)block[8+k]=Math.max(0,Math.min(255,i(skin[k])));}
      parts.push(block);
    }
    const uvSets=(geo.uvSets||[]).length?geo.uvSets:(geo.tverts&&geo.tverts.length?[geo.tverts]:[]);if(uvSets.length){const blocks=[];for(const uv of uvSets){blocks.push(taggedCount('UVBS',uv.length,8,(v,o)=>uv.forEach((x,k)=>{const q=o+k*8;v.setFloat32(q,f(x&&x.u),true);v.setFloat32(q+4,f(x&&x.v),true);})));}const head=new Uint8Array(8),hv=new DataView(head.buffer);writeTag(hv,0,'UVAS');hv.setUint32(4,blocks.length,true);parts.push(head,...blocks);}
    const body=concat(parts),out=new Uint8Array(4+body.length),ov=new DataView(out.buffer);ov.setUint32(0,out.length,true);out.set(body,4);return out;
  }
  function importedGeosets(model){return (model&&model.geosets||[]).map((g,index)=>({g,index})).filter(x=>x.g&&x.g.__referenceImported===true&&!Number.isInteger(x.g.__clonedFromIndex));}
  function appendImportedGeosetsMdx(existing,model,formatVersion){const rows=importedGeosets(model);return rows.length?concat([existing||new Uint8Array(),...rows.map(x=>geosetRecordMdx(x.g,formatVersion))]):(existing||new Uint8Array());}
  function geosetAnimationRecordMdx(a){const tracks=trackSetBinary(a&&a.tracks,['KGAO','KGAC']),out=new Uint8Array(28+tracks.length),v=new DataView(out.buffer);v.setUint32(0,out.length,true);v.setFloat32(4,f(a&&a.alpha,1),true);v.setUint32(8,i(a&&a.flags,0)>>>0,true);const c=Array.isArray(a&&a.color)?a.color:[1,1,1];v.setFloat32(12,f(c[0],1),true);v.setFloat32(16,f(c[1],1),true);v.setFloat32(20,f(c[2],1),true);v.setInt32(24,i(a&&a.geosetId,-1),true);if(tracks.length)out.set(tracks,28);return out;}
  function geosetAnimationsData(model){const rows=(model&&model.geosetAnimations||[]).filter(Boolean).map(geosetAnimationRecordMdx);return rows.length?concat(rows):new Uint8Array();}
  function appendImportedGeosetAnimationsMdx(existing,model){const rows=(model&&model.geosetAnimations||[]).filter(a=>a&&a.__referenceImported===true);return rows.length?concat([existing||new Uint8Array(),...rows.map(geosetAnimationRecordMdx)]):(existing||new Uint8Array());}

  function geosetClones(model){return (model&&model.geosets||[]).map((g,index)=>({g,index})).filter(x=>x.g&&x.g.__cloned&&Number.isInteger(x.g.__clonedFromIndex)&&x.g.__clonedFromIndex>=0);}
  function mdxSizedRecords(data){
    const bytes=bytesOf(data||new Uint8Array()),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out=[];let off=0;
    while(off+4<=bytes.length){const size=view.getUint32(off,true),end=off+size;if(size<4||end>bytes.length)break;out.push(bytes.slice(off,end));off=end;}
    return out;
  }
  function expandClonedGeosetsMdx(existing,model){
    const clones=geosetClones(model);if(!clones.length)return existing||new Uint8Array();
    const records=mdxSizedRecords(existing);if(!records.length)throw new Error('Cannot clone geoset: the MDX GEOS chunk could not be read.');
    const extra=[];
    for(const {g,index} of clones){const src=i(g.__clonedFromIndex,-1);if(src<0||src>=records.length)throw new Error(`Cannot clone Geoset ${index+1}: source Geoset ${src+1} is unavailable in the original model.`);extra.push(records[src]);}
    return concat([existing||new Uint8Array(),...extra]);
  }
  function expandClonedGeosetAnimationsMdx(existing,model){
    const clones=geosetClones(model);if(!existing||!existing.length||!clones.length)return existing||new Uint8Array();
    const records=mdxSizedRecords(existing),extra=[];
    for(const {g,index} of clones){const src=i(g.__clonedFromIndex,-1);for(const raw of records){if(raw.length<28)continue;const v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);if(v.getInt32(24,true)!==src)continue;const copy=new Uint8Array(raw);new DataView(copy.buffer).setInt32(24,index,true);extra.push(copy);}}
    return extra.length?concat([existing,...extra]):existing;
  }
  function patchGeosetsMdx(existing,model,formatVersion){
    const geos=model.geosets||[];if(!existing||!geos.some(g=>g&&(g.__geometryEdited||g.__skinEdited||g.__topologyEdited)))return existing||new Uint8Array();
    const out=new Uint8Array(existing);const view=new DataView(out.buffer,out.byteOffset,out.byteLength);
    const tagAt=o=>o+4<=out.length?String.fromCharCode(out[o],out[o+1],out[o+2],out[o+3]):'';
    let off=0,gi=0,changed=0;
    while(off+4<=out.length&&gi<geos.length){
      const recSize=view.getUint32(off,true),recEnd=off+recSize;if(recSize<64||recEnd>out.length)break;let q=off+4;const geo=geos[gi];
      const readChunk=(tag,bpe)=>{if(q+8>recEnd||tagAt(q)!==tag)return null;const count=view.getUint32(q+4,true),start=q+8,end=start+count*bpe;if(end>recEnd)return null;q=end;return{count,start,end};};
      const vrtx=readChunk('VRTX',12);if(!vrtx)break;
      if(geo&&geo.__geometryEdited){
        const n=Math.min(vrtx.count,(geo.vertices||[]).length);for(let k=0;k<n;k++){const v=geo.vertices[k]||{};const o=vrtx.start+k*12;view.setFloat32(o,f(v.x),true);view.setFloat32(o+4,f(v.y),true);view.setFloat32(o+8,f(v.z),true);}
      }
      const nrms=readChunk('NRMS',12);if(!nrms)break;
      if(geo&&geo.__geometryEdited){
        const n=Math.min(nrms.count,(geo.normals||[]).length);for(let k=0;k<n;k++){const v=geo.normals[k]||{};const o=nrms.start+k*12;view.setFloat32(o,f(v.x),true);view.setFloat32(o+4,f(v.y),true);view.setFloat32(o+8,f(v.z,1),true);}
      }
      const ptyp=readChunk('PTYP',4),pcnt=readChunk('PCNT',4),pvtx=readChunk('PVTX',2),gndx=readChunk('GNDX',1),mtgc=readChunk('MTGC',4),mats=readChunk('MATS',4);if(!ptyp||!pcnt||!pvtx||!gndx||!mtgc||!mats)break;
      if(geo&&geo.__topologyEdited){const faces=geo.faces||geo.triangles||[],flat=[];for(const t of faces){if(Array.isArray(t))flat.push(...t.slice(0,3));else if(t&&Number.isFinite(t.a)&&Number.isFinite(t.b)&&Number.isFinite(t.c))flat.push(t.a,t.b,t.c);}const count=Math.min(pvtx.count,flat.length);for(let k=0;k<count;k++)view.setUint16(pvtx.start+k*2,Math.max(0,i(flat[k],0)),true);changed++;}
      if(q+12>recEnd)break;q+=12;if(formatVersion>800){if(q+84>recEnd)break;q+=84;}
      if(q+28>recEnd)break;
      if(geo&&geo.__geometryEdited){const b=boundsForVertices(geo.vertices);writeExtent(view,q,b);geo.extent={boundsRadius:b.boundsRadius,min:[b.min.x,b.min.y,b.min.z],max:[b.max.x,b.max.y,b.max.z]};changed++;}
      q+=28;
      // Sequence extents are followed by optional Reforged TANG / SKIN chunks.
      // Sanity compatibility repair may shift model-space geometry while compensating
      // the animated root. Shift the stored geoset sequence bounds by the same amount
      // so Warcraft culling sees the same world-space bounds after root compensation.
      if(q+4<=recEnd){
        const seqCount=view.getUint32(q,true),seqStart=q+4;
        if(geo&&geo.__sequenceExtentsEdited&&Array.isArray(geo.sequenceExtents)){
          const count=Math.min(seqCount,geo.sequenceExtents.length);
          for(let si=0;si<count;si++)writeExtent(view,seqStart+si*28,extentObject(geo.sequenceExtents[si]));
          if(count)changed++;
        }
        q=seqStart+Math.max(0,seqCount)*28;
      }
      if(q+8<=recEnd&&tagAt(q)==='TANG'){const count=view.getUint32(q+4,true),end=q+8+count*16;if(end<=recEnd)q=end;}
      if(q+8<=recEnd&&tagAt(q)==='SKIN'){
        const count=view.getUint32(q+4,true),start=q+8,end8=start+count,end16=start+count*2;
        const uv8=end8+4<=recEnd&&tagAt(end8)==='UVAS',uv16=end16+4<=recEnd&&tagAt(end16)==='UVAS';
        const elementBytes=(end16<=recEnd&&(uv16&&(!uv8||formatVersion>=1800)))||((geo&&geo.skinElementBytes===2)&&end16<=recEnd)?2:1;
        const end=start+count*elementBytes;
        if(end<=recEnd&&geo&&geo.__skinEdited&&geo.skin){
          const src=Array.from(geo.skin),n=Math.min(count,src.length);
          if(elementBytes===2){for(let k=0;k<n;k++)view.setUint16(start+k*2,Math.max(0,Math.min(65535,i(src[k]))),true);}
          else{for(let k=0;k<n;k++)out[start+k]=Math.max(0,Math.min(255,i(src[k])));}
          changed++;
        }
      }
      off=recEnd;gi++;
    }
    return changed?out:(existing||out);
  }
  function patchModelExtentMdx(existing,model){
    if(!existing||!model.__geometryEdited||existing.length<372)return existing||new Uint8Array();
    const out=new Uint8Array(existing),view=new DataView(out.buffer,out.byteOffset,out.byteLength),b=boundsForVertices((model.geosets||[]).flatMap(g=>g.vertices||[]));writeExtent(view,340,b);return out;
  }
  function patchSequenceExtentsMdx(existing,model){
    if(!existing||!model.__sequenceExtentsEdited)return existing||new Uint8Array();
    const out=new Uint8Array(existing),view=new DataView(out.buffer,out.byteOffset,out.byteLength),seqs=model.sequences||[];
    const count=Math.min(seqs.length,Math.floor(out.length/132));
    for(let n=0;n<count;n++){
      const ext=extentObject(seqs[n]?.extent);
      writeExtent(view,n*132+104,ext);
    }
    return out;
  }
  function blockEndLocal(text,open){let depth=0,inString=false,esc=false;for(let p=open;p<text.length;p++){const ch=text[p];if(inString){if(esc)esc=false;else if(ch==='\\')esc=true;else if(ch==='"')inString=false;continue;}if(ch==='"'){inString=true;continue;}if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return p;}return-1;}
  function geosetBlockRanges(text){const out=[],re=/\bGeoset\s*\{/gi;let m;while((m=re.exec(text))){const open=text.indexOf('{',m.index),end=blockEndLocal(text,open);if(end<0)break;out.push({start:m.index,open,end});re.lastIndex=end+1;}return out;}

  function geosetAnimBlockRanges(text){const out=[],re=/\bGeosetAnim\s*\{/gi;let m;while((m=re.exec(text))){const open=text.indexOf('{',m.index),end=blockEndLocal(text,open);if(end<0)break;const block=text.slice(m.index,end+1),idMatch=/\bGeosetId\s+(-?\d+)/i.exec(block);out.push({start:m.index,open,end,geosetId:idMatch?i(idMatch[1],-1):-1});re.lastIndex=end+1;}return out;}
  function appendClonedGeosetsMdl(text,model){
    const clones=geosetClones(model);if(!clones.length)return text;
    const sourceText=text,geoRanges=geosetBlockRanges(sourceText),animRanges=geosetAnimBlockRanges(sourceText),parts=[];
    for(const {g,index} of clones){const src=i(g.__clonedFromIndex,-1),r=geoRanges[src];if(!r)throw new Error(`Cannot clone Geoset ${index+1}: source Geoset ${src+1} was not found in the MDL.`);parts.push(sourceText.slice(r.start,r.end+1));for(const ar of animRanges){if(ar.geosetId!==src)continue;let block=sourceText.slice(ar.start,ar.end+1);block=block.replace(/(\bGeosetId\s+)-?\d+/i,`$1${index}`);parts.push(block);}}
    return parts.length?text+'\n\n// Geosets cloned by WC3 Asset Studio\n'+parts.join('\n\n')+'\n':text;
  }
  function replaceCountedMdlBlock(body,key,values){
    const re=new RegExp(`\\b${key}\\s+\\d+\\s*\\{`,'i'),m=re.exec(body);if(!m)return body;const open=body.indexOf('{',m.index),end=blockEndLocal(body,open);if(end<0)return body;
    const rows=values.map(v=>`\t\t{ ${num(v.x)}, ${num(v.y)}, ${num(v.z)} },`).join('\n');const replacement=`${key} ${values.length} {\n${rows}\n\t}`;return body.slice(0,m.index)+replacement+body.slice(end+1);
  }
  function replaceExtentMdl(body,b){
    const replace=(key,value)=>{const re=new RegExp(`(^|\\n)(\\s*)${key}\\s+[^\\n]*,`,'i');if(re.test(body))body=body.replace(re,(m,nl,ws)=>`${nl}${ws}${key} ${value},`);};
    replace('MinimumExtent',`{ ${num(b.min.x)}, ${num(b.min.y)}, ${num(b.min.z)} }`);replace('MaximumExtent',`{ ${num(b.max.x)}, ${num(b.max.y)}, ${num(b.max.z)} }`);replace('BoundsRadius',num(b.boundsRadius));return body;
  }
  function patchGeosetsMdl(text,model){
    const geos=model.geosets||[],ranges=geosetBlockRanges(text);if(!geos.some(g=>g&&g.__geometryEdited))return text;
    const edits=[];for(let gi=0;gi<Math.min(geos.length,ranges.length);gi++){const geo=geos[gi];if(!geo||!geo.__geometryEdited)continue;const r=ranges[gi],body=text.slice(r.open+1,r.end);let nb=replaceCountedMdlBlock(body,'Vertices',geo.vertices||[]);if((geo.normals||[]).length)nb=replaceCountedMdlBlock(nb,'Normals',geo.normals||[]);const b=boundsForVertices(geo.vertices);nb=replaceExtentMdl(nb,b);edits.push({start:r.open+1,end:r.end,text:nb});}
    edits.sort((a,b)=>b.start-a.start);for(const e of edits)text=text.slice(0,e.start)+e.text+text.slice(e.end);return text;
  }
  function patchModelExtentMdl(text,model){
    if(!model.__geometryEdited)return text;const re=/\bModel\s+"[^"]*"\s*\{/i,m=re.exec(text);if(!m)return text;const open=text.indexOf('{',m.index),end=blockEndLocal(text,open);if(open<0||end<0)return text;
    const body=text.slice(open+1,end),b=boundsForVertices((model.geosets||[]).flatMap(g=>g.vertices||[]));let next=replaceExtentMdl(body,b);
    if(next===body){const extent=`\n\tMinimumExtent { ${num(b.min.x)}, ${num(b.min.y)}, ${num(b.min.z)} },\n\tMaximumExtent { ${num(b.max.x)}, ${num(b.max.y)}, ${num(b.max.z)} },\n\tBoundsRadius ${num(b.boundsRadius)},`;next=body+extent+'\n';}
    return text.slice(0,open+1)+next+text.slice(end);
  }

  function patchModelGeosetCountsMdl(text,model){
    const re=/\bModel\s+"[^"]*"\s*\{/i,m=re.exec(text);if(!m)return text;const open=text.indexOf('{',m.index),end=blockEndLocal(text,open);if(open<0||end<0)return text;
    let body=text.slice(open+1,end);const setCount=(key,value)=>{const rx=new RegExp(`(^|\\n)(\\s*)${key}\\s+-?\\d+\\s*,`,'i');if(rx.test(body))body=body.replace(rx,(all,nl,ws)=>`${nl}${ws}${key} ${value},`);else body+=`\n\t${key} ${value},`;};
    setCount('NumGeosets',(model.geosets||[]).length);setCount('NumGeosetAnims',(model.geosetAnimations||[]).length);return text.slice(0,open+1)+body+text.slice(end);
  }

  function saveMDX(source,model){
    if(model&&model.__animationEdited&&window.WC3_MODEL_ANIMATION_SAVE?.patchMdxSource)source=window.WC3_MODEL_ANIMATION_SAVE.patchMdxSource(source,model);
    const parsed=topChunks(source), defs=model.textureDefs||[], customNodes=(model.nodes||[]).filter(n=>n&&n.__custom), customAttachments=customNodes.filter(n=>n.type==='Attachment'), customEmitters=customNodes.filter(n=>n.type==='ParticleEmitter2'), customPopcorn=customNodes.filter(n=>n.type==='ParticleEmitterPopcorn'), customCameras=(model.cameras||[]).filter(c=>c&&c.__custom);
    const byTag=new Map();parsed.chunks.forEach((c,idx)=>{if(!byTag.has(c.tag))byTag.set(c.tag,[]);byTag.get(c.tag).push({c,idx});});
    const replacements=new Map(), consumed=new Set();
    function replaceFirst(tag,data,onlyIfNeeded=true){const arr=byTag.get(tag)||[];if(arr.length){replacements.set(arr[0].idx,chunk(tag,data));consumed.add(tag);return;} if(!onlyIfNeeded||data.length) replacements.set(`append:${tag}`,chunk(tag,data));}
    const texExisting=(byTag.get('TEXS')||[])[0]?.c.data; if(defs.length||texExisting) replaceFirst('TEXS',textureData(texExisting,defs),false);
    if(model.__rigEdited||model.__animationKeyEdited){replaceFirst('BONE',bonesData(model),false);replaceFirst('HELP',helpersData(model),false);replaceFirst('PIVT',pivotsAllData(model),false);}
    if(model.__materialEdited)replaceFirst('MTLS',materialsData(model),false);
    if(model.__cameraEdited)replaceFirst('CAMS',camerasData(model),false);
    if(model.__effectsEdited)replaceFirst('PRE2',emitters2Data(model),false);
    if(model.__popcornEdited)replaceFirst('CORN',popcornData(model),false);
    if(model.__geosetAnimationsEdited)replaceFirst('GEOA',geosetAnimationsData(model),false);
    if(model.__sequenceExtentsEdited){const seqExisting=(byTag.get('SEQS')||[])[0]?.c.data;if(seqExisting)replaceFirst('SEQS',patchSequenceExtentsMdx(seqExisting,model),false);}
    const clones=geosetClones(model),imports=importedGeosets(model);
    if(model.__geometryEdited||clones.length||imports.length){
      const geosExisting=(byTag.get('GEOS')||[])[0]?.c.data;
      if(geosExisting||imports.length){let expanded=expandClonedGeosetsMdx(geosExisting||new Uint8Array(),model);expanded=appendImportedGeosetsMdx(expanded,model,i(model.formatVersion,800));replaceFirst('GEOS',patchGeosetsMdx(expanded,model,i(model.formatVersion,800)),false);}
      if(!model.__geosetAnimationsEdited){const geoaExisting=(byTag.get('GEOA')||[])[0]?.c.data;let geoa=geoaExisting||new Uint8Array();if(clones.length&&geoa.length)geoa=expandClonedGeosetAnimationsMdx(geoa,model);geoa=appendImportedGeosetAnimationsMdx(geoa,model);if(geoa.length)replaceFirst('GEOA',geoa,false);}
      const modlExisting=(byTag.get('MODL')||[])[0]?.c.data;if(modlExisting)replaceFirst('MODL',patchModelExtentMdx(modlExisting,model),false);
    }
    const pivExisting=(byTag.get('PIVT')||[])[0]?.c.data; if(customNodes.length&&!model.__rigEdited&&!model.__animationKeyEdited) replaceFirst('PIVT',pivotData(pivExisting,model,customNodes),false);
    if(customCameras.length&&!model.__cameraEdited){const ex=(byTag.get('CAMS')||[])[0]?.c.data;replaceFirst('CAMS',appendData(ex,customCameras.map(cameraRecord)),false);}
    if(customAttachments.length){const ex=(byTag.get('ATCH')||[])[0]?.c.data;replaceFirst('ATCH',appendData(ex,customAttachments.map(attachmentOuter)),false);}
    if(customEmitters.length&&!model.__effectsEdited){const ex=(byTag.get('PRE2')||[])[0]?.c.data;replaceFirst('PRE2',appendData(ex,customEmitters.map(emitter2Outer)),false);}
    if(customPopcorn.length&&!model.__popcornEdited){const ex=(byTag.get('CORN')||[])[0]?.c.data;replaceFirst('CORN',appendData(ex,customPopcorn.map(popcornOuterFull)),false);}
    const parts=[parsed.bytes.slice(0,4)];
    parsed.chunks.forEach((c,idx)=>parts.push(replacements.has(idx)?replacements.get(idx):c.raw));
    for(const tag of ['TEXS','MTLS','SEQS','GEOS','GEOA','MODL','BONE','HELP','PIVT','ATCH','PRE2','CORN','CAMS']){const key=`append:${tag}`;if(replacements.has(key))parts.push(replacements.get(key));}
    return {bytes:concat(parts),type:'MDX',changes:{textures:defs.length,geosets:(model.geosets||[]).filter(g=>g&&g.__geometryEdited).length,geosetClones:clones.length,geosetImports:imports.length,geosetAnimations:model.__geosetAnimationsEdited?(model.geosetAnimations||[]).length:0,rig:model.__rigEdited?1:0,materials:model.__materialEdited?1:0,cameras:model.__cameraEdited?(model.cameras||[]).length:customCameras.length,effects:model.__effectsEdited?(model.particleEmitters2||[]).length:customEmitters.length,attachments:customAttachments.length,particleEmitters2:model.__effectsEdited?(model.particleEmitters2||[]).length:customEmitters.length,popcornEmitters:model.__popcornEdited?(model.popcornEmitters||[]).filter(n=>n&&!n.__deleted).length:customPopcorn.length}};
  }

  function findContainer(text,keyword){
    const re=new RegExp(`\\b${keyword}\\s+\\d+\\s*\\{`,'i'),m=re.exec(text);if(!m)return null;const open=text.indexOf('{',m.index);let depth=0,inString=false,esc=false;
    for(let p=open;p<text.length;p++){const ch=text[p];if(inString){if(esc)esc=false;else if(ch==='\\\\')esc=true;else if(ch==='"')inString=false;continue;}if(ch==='"'){inString=true;continue;}if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return{start:m.index,open,end:p,header:m[0]};}return null;
  }
  function texturesMdl(defs){
    const lines=[`Textures ${defs.length} {`]; for(const d of defs){lines.push('\tBitmap {');if(i(d.replaceableId,0))lines.push(`\t\tReplaceableId ${i(d.replaceableId,0)},`);lines.push(`\t\tImage "${escMdl(d.path||'')}",`);if(d.wrapWidth||(i(d.flags,0)&1))lines.push('\t\tWrapWidth,');if(d.wrapHeight||(i(d.flags,0)&2))lines.push('\t\tWrapHeight,');lines.push('\t}');}lines.push('}');return lines.join('\n');
  }
  function pivotsMdl(model,customNodes){
    const base=(model.pivots||[]).map(p=>({x:f(p&&p.x),y:f(p&&p.y),z:f(p&&p.z)}));let max=base.length-1;customNodes.forEach(n=>max=Math.max(max,i(n.id??n.objectId,-1)));while(base.length<=max)base.push({x:0,y:0,z:0});customNodes.forEach(n=>{const id=i(n.id??n.objectId,-1);if(id>=0){const p=n.pivot||{};base[id]={x:f(p.x),y:f(p.y),z:f(p.z)};}});
    return `PivotPoints ${base.length} {\n${base.map(p=>`\t{ ${num(p.x)}, ${num(p.y)}, ${num(p.z)} },`).join('\n')}\n}`;
  }
  function genericMdlLines(node,indent='\t'){
    const lines=[`${indent}ObjectId ${i(node.id??node.objectId,-1)},`];if(i(node.parentId,-1)>=0)lines.push(`${indent}Parent ${i(node.parentId,-1)},`);
    const flags=i(node.flags,0);if(flags&1)lines.push(`${indent}DontInherit { Translation },`);if(flags&2)lines.push(`${indent}DontInherit { Rotation },`);if(flags&4)lines.push(`${indent}DontInherit { Scaling },`);if(flags&8)lines.push(`${indent}Billboarded,`);if(flags&16)lines.push(`${indent}BillboardedLockX,`);if(flags&32)lines.push(`${indent}BillboardedLockY,`);if(flags&64)lines.push(`${indent}BillboardedLockZ,`);if(flags&128)lines.push(`${indent}CameraAnchored,`);return lines;
  }
  const MDL_TRACK_NAMES={KGTR:'Translation',KGRT:'Rotation',KGSC:'Scaling',KMTF:'TextureID',KMTA:'Alpha',KMTE:'EmissiveGain',KFC3:'FresnelColor',KFCA:'FresnelOpacity',KFTC:'FresnelTeamColor',KCTR:'Translation',KCRL:'Rotation',KTTR:'Translation',KP2E:'EmissionRate',KP2G:'Gravity',KP2L:'Latitude',KP2R:'Variation',KP2N:'Length',KP2W:'Width',KP2S:'Speed',KP2V:'Visibility',KPPL:'LifeSpan',KPPE:'EmissionRate',KPPS:'Speed',KPPC:'Color',KPPA:'Alpha',KPPV:'Visibility'};
  function mdlTrackText(tag,tr,indent='\t'){
    if(!tr||!Array.isArray(tr.keys)||!tr.keys.length)return'';
    const name=MDL_TRACK_NAMES[tag]||tag;
    const interpNames=['DontInterp','Linear','Hermite','Bezier'];
    let interpIndex=Number.isFinite(+tr.interpolationType)?Math.max(0,Math.min(3,+tr.interpolationType)):interpNames.indexOf(String(tr.interpolation||''));
    if(interpIndex<0)interpIndex=1;
    const interp=interpNames[interpIndex]||'Linear';
    const val=a=>{const x=Array.isArray(a)?a:[a];return x.length===1?num(x[0]):`{ ${x.map(num).join(', ')} }`;};
    const lines=[`${name} ${tr.keys.length} {`,`${indent}${interp},`];
    if(i(tr.globalSequenceId,-1)>=0)lines.push(`${indent}GlobalSeqId ${i(tr.globalSequenceId,-1)},`);
    for(const k of tr.keys){
      lines.push(`${indent}${i(k.frame,0)}: ${val(k.value)},`);
      if(/Hermite|Bezier/.test(interp))lines.push(`${indent}InTan ${val(k.inTan||k.value)},`,`${indent}OutTan ${val(k.outTan||k.value)},`);
    }
    lines.push('}');return lines.join('\n');
  }
  function nodeTrackLines(n,indent='\t'){const out=[];for(const tag of ['KGTR','KGRT','KGSC']){const t=mdlTrackText(tag,n.tracks&&n.tracks[tag],indent+'\t');if(t)out.push(indent+t.replace(/\n/g,'\n'+indent));}return out;}
  function boneMdl(n){const lines=[`Bone "${escMdl(n.name||'Bone')}" {`,...genericMdlLines(n),...nodeTrackLines(n),`\tGeosetId ${i(n.geosetId,-1)<0?'Multiple':i(n.geosetId,-1)},`,`\tGeosetAnimId ${i(n.geosetAnimId,-1)<0?'None':i(n.geosetAnimId,-1)},`,'}'];return lines.join('\n');}
  function helperMdl(n){return [`Helper "${escMdl(n.name||'Helper')}" {`,...genericMdlLines(n),...nodeTrackLines(n),'}'].join('\n');}
  function stripNamedBlocks(text,keyword){const re=new RegExp(`\\b${keyword}\\s+"[^"]*"\\s*\\{`,'gi'),ranges=[];let m;while((m=re.exec(text))){const open=text.indexOf('{',m.index),end=blockEndLocal(text,open);if(end<0)break;ranges.push([m.index,end+1]);re.lastIndex=end+1;}for(let x=ranges.length-1;x>=0;x--){const [a,b]=ranges[x];text=text.slice(0,a)+text.slice(b);}return text;}
  function layerFlagsMdl(flags){const out=[];if(flags&1)out.push('Unshaded');if(flags&2)out.push('SphereEnvMap');if(flags&16)out.push('TwoSided');if(flags&32)out.push('Unfogged');if(flags&64)out.push('NoDepthTest');if(flags&128)out.push('NoDepthSet');if(flags&256)out.push('Unlit');return out;}
  function materialsMdl(model){const filter=['None','Transparent','Blend','Additive','AddAlpha','Modulate','Modulate2x'],lines=[`Materials ${(model.materials||[]).length} {`];for(const mat of model.materials||[]){lines.push('\tMaterial {');if(i(mat.priorityPlane,0))lines.push(`\t\tPriorityPlane ${i(mat.priorityPlane,0)},`);if(mat.flags&1)lines.push('\t\tConstantColor,');if(mat.flags&2)lines.push('\t\tTwoSided,');if(mat.flags&8)lines.push('\t\tSortPrimsNearZ,');if(mat.flags&16)lines.push('\t\tSortPrimsFarZ,');if(mat.flags&32)lines.push('\t\tFullResolution,');if(mat.shader)lines.push(`\t\tShader "${escMdl(mat.shader)}",`);for(const l of mat.layers||[]){lines.push('\t\tLayer {',`\t\t\tFilterMode ${filter[i(l.filterModeId,0)]||l.filterMode||'None'},`);for(const fl of layerFlagsMdl(i(l.flags,0)))lines.push(`\t\t\t${fl},`);lines.push(`\t\t\tstatic TextureID ${i(l.textureId,0)},`);if(i(l.textureAnimationId,-1)>=0)lines.push(`\t\t\tTVertexAnimId ${i(l.textureAnimationId,-1)},`);if(i(l.coordId,0))lines.push(`\t\t\tCoordId ${i(l.coordId,0)},`);lines.push(`\t\t\tstatic Alpha ${num(l.alpha??1)},`);if(model.formatVersion>800){lines.push(`\t\t\tstatic EmissiveGain ${num(l.emissiveGain??1)},`,`\t\t\tstatic FresnelColor ${v3(l.fresnelColor||[1,1,1])},`,`\t\t\tstatic FresnelOpacity ${num(l.fresnelOpacity??0)},`,`\t\t\tstatic FresnelTeamColor ${num(l.fresnelTeamColor??0)},`);}for(const tag of ['KMTF','KMTA','KMTE','KFC3','KFCA','KFTC']){const t=mdlTrackText(tag,l.tracks&&l.tracks[tag],'\t\t\t\t');if(t)lines.push('\t\t\t'+t.replace(/\n/g,'\n\t\t\t'));}lines.push('\t\t}');}lines.push('\t}');}lines.push('}');return lines.join('\n');}
  function attachmentMdl(n){const lines=[`Attachment "${escMdl(n.name||'Attachment')}" {`,...genericMdlLines(n),`\tPath "${escMdl(n.path||'')}",`,`\tAttachmentID ${i(n.attachmentId,0)},`,'}'];return lines.join('\n');}
  function emitter2Mdl(n){
    const modes=['Blend','Additive','Modulate','Modulate2x','AlphaKey'];const heads=['Head','Tail','Both'];const colors=n.segmentColors||[[1,1,1],[1,.5,.2],[0,0,0]],alph=n.segmentAlphas||[255,255,0],sc=n.segmentScaling||[1,1,1],hi=n.headIntervals||[[0,0,0],[0,0,0]],ti=n.tailIntervals||[[0,0,0],[0,0,0]];
    const lines=[`ParticleEmitter2 "${escMdl(n.name||'ParticleEmitter2')}" {`,...genericMdlLines(n),...nodeTrackLines(n),`\tstatic Speed ${num(n.speed)},`,`\tstatic Variation ${num(n.variation)},`,`\tstatic Latitude ${num(n.latitude)},`,`\tstatic Gravity ${num(n.gravity)},`,`\tLifeSpan ${num(n.lifeSpan)},`,`\tstatic EmissionRate ${num(n.emissionRate)},`,`\tstatic Width ${num(n.width)},`,`\tstatic Length ${num(n.length)},`,`\t${modes[i(n.filterMode,1)]||'Additive'},`,`\tRows ${Math.max(1,i(n.rows,1))},`,`\tColumns ${Math.max(1,i(n.columns,1))},`,`\t${heads[i(n.headOrTail,0)]||'Head'},`,`\tTailLength ${num(n.tailLength)},`,`\tTime ${num(n.timeMiddle)},`,'\tSegmentColor {',`\t\tColor ${v3(colors[0])},`,`\t\tColor ${v3(colors[1])},`,`\t\tColor ${v3(colors[2])},`,'\t},',`\tAlpha { ${i(alph[0],255)}, ${i(alph[1],255)}, ${i(alph[2],0)} },`,`\tParticleScaling { ${num(sc[0]??1)}, ${num(sc[1]??1)}, ${num(sc[2]??1)} },`,`\tLifeSpanUVAnim { ${i(hi[0]?.[0],0)}, ${i(hi[0]?.[1],0)}, ${i(hi[0]?.[2],0)} },`,`\tDecayUVAnim { ${i(hi[1]?.[0],0)}, ${i(hi[1]?.[1],0)}, ${i(hi[1]?.[2],0)} },`,`\tTailUVAnim { ${i(ti[0]?.[0],0)}, ${i(ti[0]?.[1],0)}, ${i(ti[0]?.[2],0)} },`,`\tTailDecayUVAnim { ${i(ti[1]?.[0],0)}, ${i(ti[1]?.[1],0)}, ${i(ti[1]?.[2],0)} },`,`\tTextureID ${i(n.textureId,0)},`,`\tPriorityPlane ${i(n.priorityPlane,0)},`,`\tReplaceableId ${i(n.replaceableId,0)},`];
    if(i(n.squirt,0))lines.splice(Math.min(6,lines.length),0,'\tSquirt,');
    for(const tag of ['KP2E','KP2G','KP2L','KP2R','KP2N','KP2W','KP2S','KP2V']){const t=mdlTrackText(tag,n.tracks&&n.tracks[tag],'\t\t');if(t)lines.push('\t'+t.replace(/\n/g,'\n\t'));}
    lines.push('}');return lines.join('\n');
  }
  function popcornMdl(n){
    const lines=[`ParticleEmitterPopcorn "${escMdl(n.name||'ParticleEmitterPopcorn')}" {`,...genericMdlLines(n),...nodeTrackLines(n),`\tstatic LifeSpan ${num(n.lifeSpan??1)},`,`\tstatic EmissionRate ${num(n.emissionRate??1)},`,`\tstatic Speed ${num(n.speed??1)},`,`\tstatic Color ${v3(n.color||[1,1,1])},`,`\tstatic Alpha ${num(n.alpha??1)},`,`\tReplaceableId ${i(n.replaceableId,0)},`,`\tPath "${escMdl(n.path||'')}",`,`\tAnimVisibilityGuide "${escMdl(n.animationVisibilityGuide||'')}",`];
    for(const tag of ['KPPL','KPPE','KPPS','KPPC','KPPA','KPPV']){const t=mdlTrackText(tag,n.tracks&&n.tracks[tag],'\t\t');if(t)lines.push('\t'+t.replace(/\n/g,'\n\t'));}
    lines.push('}');return lines.join('\n');
  }
  function cameraMdl(c){const lines=[`Camera "${escMdl(c.name||'Camera')}" {`,`\tPosition ${v3(c.position)},`,`\tFieldOfView ${num(c.fieldOfView??.7)},`,`\tFarClip ${num(c.farClippingPlane??5000)},`,`\tNearClip ${num(c.nearClippingPlane??8)},`,'\tTarget {',`\t\tPosition ${v3(c.targetPosition)},`,'\t},'];for(const tag of ['KCTR','KCRL','KTTR']){const t=mdlTrackText(tag,c.tracks&&c.tracks[tag],'\t\t');if(t)lines.push('\t'+t.replace(/\n/g,'\n\t'));}lines.push('}');return lines.join('\n');}
  function stripBareBlocks(text,keyword){
    const re=new RegExp(`\\b${keyword}\\s*\\{`,'gi'),ranges=[];let m;
    while((m=re.exec(text))){const open=text.indexOf('{',m.index),end=blockEndLocal(text,open);if(end<0)break;ranges.push([m.index,end+1]);re.lastIndex=end+1;}
    for(let x=ranges.length-1;x>=0;x--){const [a,b]=ranges[x];text=text.slice(0,a)+text.slice(b);}return text;
  }
  function geosetAnimMdl(a){
    const lines=['GeosetAnim {'];if(i(a&&a.flags,0)&1)lines.push('\tDropShadow,');
    lines.push(`\tstatic Alpha ${num(a&&a.alpha!=null?a.alpha:1)},`);
    const c=Array.isArray(a&&a.color)?a.color:[1,1,1];if((i(a&&a.flags,0)&2)||c.some((x,k)=>Math.abs(f(x,1)-1)>1e-9))lines.push(`\tstatic Color ${v3(c)},`);
    lines.push(`\tGeosetId ${i(a&&a.geosetId,-1)},`);
    for(const tag of ['KGAO','KGAC']){const t=mdlTrackText(tag,a&&a.tracks&&a.tracks[tag],'\t\t');if(t)lines.push('\t'+t.replace(/\n/g,'\n\t'));}
    lines.push('}');return lines.join('\n');
  }
  function saveMDL(source,model){
    if(model&&model.__animationEdited&&window.WC3_MODEL_ANIMATION_SAVE?.patchMdlSource)source=window.WC3_MODEL_ANIMATION_SAVE.patchMdlSource(source,model);
    let text=dec.decode(bytesOf(source));const defs=model.textureDefs||[],customNodes=(model.nodes||[]).filter(n=>n&&n.__custom),customAttachments=customNodes.filter(n=>n.type==='Attachment'),customEmitters=customNodes.filter(n=>n.type==='ParticleEmitter2'),customPopcorn=customNodes.filter(n=>n.type==='ParticleEmitterPopcorn'),customCameras=(model.cameras||[]).filter(c=>c&&c.__custom),clones=geosetClones(model);
    if(defs.length){const block=findContainer(text,'Textures'),replacement=texturesMdl(defs);if(block)text=text.slice(0,block.start)+replacement+text.slice(block.end+1);else text+='\n\n'+replacement+'\n';}
    if(model.__rigEdited||model.__animationKeyEdited){text=stripNamedBlocks(stripNamedBlocks(text,'Bone'),'Helper');const rigs=[...(model.bones||[]).filter(n=>n&&!n.__deleted).map(boneMdl),...(model.helpers||[]).filter(n=>n&&!n.__deleted).map(helperMdl)];if(rigs.length)text+='\n\n// Rig written by WC3 Asset Studio\n'+rigs.join('\n\n')+'\n';const block=findContainer(text,'PivotPoints'),replacement=pivotsMdl(model,(model.nodes||[]).filter(n=>n&&!n.__deleted));if(block)text=text.slice(0,block.start)+replacement+text.slice(block.end+1);else text+='\n\n'+replacement+'\n';}
    if(model.__materialEdited){const block=findContainer(text,'Materials'),replacement=materialsMdl(model);if(block)text=text.slice(0,block.start)+replacement+text.slice(block.end+1);else text+='\n\n'+replacement+'\n';}
    if(model.__cameraEdited){text=stripNamedBlocks(text,'Camera');const cams=(model.cameras||[]).filter(Boolean).map(cameraMdl);if(cams.length)text+='\n\n// Cameras written by WC3 Asset Studio\n'+cams.join('\n\n')+'\n';}
    if(model.__effectsEdited){text=stripNamedBlocks(text,'ParticleEmitter2');const fx=(model.particleEmitters2||[]).filter(n=>n&&!n.__deleted).map(emitter2Mdl);if(fx.length)text+='\n\n// ParticleEmitter2 written by WC3 Asset Studio\n'+fx.join('\n\n')+'\n';}
    if(model.__popcornEdited){text=stripNamedBlocks(text,'ParticleEmitterPopcorn');const fx=(model.popcornEmitters||[]).filter(n=>n&&!n.__deleted).map(popcornMdl);if(fx.length)text+='\n\n// ParticleEmitterPopcorn written by WC3 Asset Studio\n'+fx.join('\n\n')+'\n';}
    if(model.__geosetAnimationsEdited){text=stripBareBlocks(text,'GeosetAnim');const gas=(model.geosetAnimations||[]).filter(Boolean).map(geosetAnimMdl);if(gas.length)text+='\n\n// GeosetAnimations written by WC3 Asset Studio\n'+gas.join('\n\n')+'\n';text=patchModelGeosetCountsMdl(text,model);}
    if(clones.length){text=appendClonedGeosetsMdl(text,model);text=patchModelGeosetCountsMdl(text,model);}
    if(model.__geometryEdited||clones.length){text=patchGeosetsMdl(text,model);text=patchModelExtentMdl(text,model);}
    if(customNodes.length&&!model.__rigEdited&&!model.__animationKeyEdited){const block=findContainer(text,'PivotPoints'),replacement=pivotsMdl(model,customNodes);if(block)text=text.slice(0,block.start)+replacement+text.slice(block.end+1);else text+='\n\n'+replacement+'\n';}
    const additions=[...customAttachments.map(attachmentMdl),...(!model.__effectsEdited?customEmitters.map(emitter2Mdl):[]),...(!model.__popcornEdited?customPopcorn.map(popcornMdl):[]),...(!model.__cameraEdited?customCameras.map(cameraMdl):[])];if(additions.length)text+='\n\n// Added by WC3 Asset Studio\n'+additions.join('\n\n')+'\n';
    return {bytes:enc.encode(text),type:'MDL',changes:{textures:defs.length,geosets:(model.geosets||[]).filter(g=>g&&g.__geometryEdited).length,geosetClones:clones.length,geosetAnimations:model.__geosetAnimationsEdited?(model.geosetAnimations||[]).length:0,rig:model.__rigEdited?1:0,materials:model.__materialEdited?1:0,cameras:model.__cameraEdited?(model.cameras||[]).length:customCameras.length,effects:model.__effectsEdited?(model.particleEmitters2||[]).length:customEmitters.length,attachments:customAttachments.length,particleEmitters2:model.__effectsEdited?(model.particleEmitters2||[]).length:customEmitters.length,popcornEmitters:model.__popcornEdited?(model.popcornEmitters||[]).filter(n=>n&&!n.__deleted).length:customPopcorn.length}};
  }

  function saveEditedModel(sourceBuffer,sourceName,model){
    if(!model)throw new Error('No model loaded.');const type=String(model.type||'').toUpperCase()||(/\.mdl$/i.test(sourceName||'')?'MDL':'MDX');
    return type==='MDL'?saveMDL(sourceBuffer,model):saveMDX(sourceBuffer,model);
  }

  window.WC3_MODEL_SAVE={saveEditedModel,saveMDX,saveMDL,version:'1.4'};
})();
