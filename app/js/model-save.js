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
    const floats=[node.speed,node.variation,node.latitude,node.gravity,node.lifeSpan,node.emissionRate,node.width,node.length];
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

  function saveMDX(source,model){
    const parsed=topChunks(source), defs=model.textureDefs||[], customNodes=(model.nodes||[]).filter(n=>n&&n.__custom), customAttachments=customNodes.filter(n=>n.type==='Attachment'), customEmitters=customNodes.filter(n=>n.type==='ParticleEmitter2'), customCameras=(model.cameras||[]).filter(c=>c&&c.__custom);
    const byTag=new Map();parsed.chunks.forEach((c,idx)=>{if(!byTag.has(c.tag))byTag.set(c.tag,[]);byTag.get(c.tag).push({c,idx});});
    const replacements=new Map(), consumed=new Set();
    function replaceFirst(tag,data,onlyIfNeeded=true){const arr=byTag.get(tag)||[];if(arr.length){replacements.set(arr[0].idx,chunk(tag,data));consumed.add(tag);return;} if(!onlyIfNeeded||data.length) replacements.set(`append:${tag}`,chunk(tag,data));}
    const texExisting=(byTag.get('TEXS')||[])[0]?.c.data; if(defs.length||texExisting) replaceFirst('TEXS',textureData(texExisting,defs),false);
    const pivExisting=(byTag.get('PIVT')||[])[0]?.c.data; if(customNodes.length) replaceFirst('PIVT',pivotData(pivExisting,model,customNodes),false);
    if(customCameras.length){const ex=(byTag.get('CAMS')||[])[0]?.c.data;replaceFirst('CAMS',appendData(ex,customCameras.map(cameraRecord)),false);}
    if(customAttachments.length){const ex=(byTag.get('ATCH')||[])[0]?.c.data;replaceFirst('ATCH',appendData(ex,customAttachments.map(attachmentOuter)),false);}
    if(customEmitters.length){const ex=(byTag.get('PRE2')||[])[0]?.c.data;replaceFirst('PRE2',appendData(ex,customEmitters.map(emitter2Outer)),false);}
    const parts=[parsed.bytes.slice(0,4)];
    parsed.chunks.forEach((c,idx)=>parts.push(replacements.has(idx)?replacements.get(idx):c.raw));
    for(const tag of ['TEXS','PIVT','ATCH','PRE2','CAMS']){const key=`append:${tag}`;if(replacements.has(key))parts.push(replacements.get(key));}
    return {bytes:concat(parts),type:'MDX',changes:{textures:defs.length,cameras:customCameras.length,attachments:customAttachments.length,particleEmitters2:customEmitters.length}};
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
  function attachmentMdl(n){const lines=[`Attachment "${escMdl(n.name||'Attachment')}" {`,...genericMdlLines(n),`\tPath "${escMdl(n.path||'')}",`,`\tAttachmentID ${i(n.attachmentId,0)},`,'}'];return lines.join('\n');}
  function emitter2Mdl(n){
    const modes=['Blend','Additive','Modulate','Modulate2x','AlphaKey'];const heads=['Head','Tail','Both'];const colors=n.segmentColors||[[1,1,1],[1,.5,.2],[0,0,0]],alph=n.segmentAlphas||[255,255,0],sc=n.segmentScaling||[1,1,1],hi=n.headIntervals||[[0,0,0],[0,0,0]],ti=n.tailIntervals||[[0,0,0],[0,0,0]];
    const lines=[`ParticleEmitter2 "${escMdl(n.name||'ParticleEmitter2')}" {`,...genericMdlLines(n),`\tstatic Speed ${num(n.speed)},`,`\tstatic Variation ${num(n.variation)},`,`\tstatic Latitude ${num(n.latitude)},`,`\tstatic Gravity ${num(n.gravity)},`,`\tLifeSpan ${num(n.lifeSpan)},`,`\tstatic EmissionRate ${num(n.emissionRate)},`,`\tstatic Width ${num(n.width)},`,`\tstatic Length ${num(n.length)},`,`\t${modes[i(n.filterMode,1)]||'Additive'},`,`\tRows ${Math.max(1,i(n.rows,1))},`,`\tColumns ${Math.max(1,i(n.columns,1))},`,`\t${heads[i(n.headOrTail,0)]||'Head'},`,`\tTailLength ${num(n.tailLength)},`,`\tTime ${num(n.timeMiddle)},`,'\tSegmentColor {',`\t\tColor ${v3(colors[0])},`,`\t\tColor ${v3(colors[1])},`,`\t\tColor ${v3(colors[2])},`,'\t},',`\tAlpha { ${i(alph[0],255)}, ${i(alph[1],255)}, ${i(alph[2],0)} },`,`\tParticleScaling { ${num(sc[0]??1)}, ${num(sc[1]??1)}, ${num(sc[2]??1)} },`,`\tLifeSpanUVAnim { ${i(hi[0]?.[0],0)}, ${i(hi[0]?.[1],0)}, ${i(hi[0]?.[2],0)} },`,`\tDecayUVAnim { ${i(hi[1]?.[0],0)}, ${i(hi[1]?.[1],0)}, ${i(hi[1]?.[2],0)} },`,`\tTailUVAnim { ${i(ti[0]?.[0],0)}, ${i(ti[0]?.[1],0)}, ${i(ti[0]?.[2],0)} },`,`\tTailDecayUVAnim { ${i(ti[1]?.[0],0)}, ${i(ti[1]?.[1],0)}, ${i(ti[1]?.[2],0)} },`,`\tTextureID ${i(n.textureId,0)},`,`\tPriorityPlane ${i(n.priorityPlane,0)},`,`\tReplaceableId ${i(n.replaceableId,0)},`];if(i(n.squirt,0))lines.splice(5,0,'\tSquirt,');lines.push('}');return lines.join('\n');
  }
  function cameraMdl(c){return [`Camera "${escMdl(c.name||'Camera')}" {`,`\tPosition ${v3(c.position)},`,`\tFieldOfView ${num(c.fieldOfView??.7)},`,`\tFarClip ${num(c.farClippingPlane??5000)},`,`\tNearClip ${num(c.nearClippingPlane??8)},`,'\tTarget {',`\t\tPosition ${v3(c.targetPosition)},`,'\t}','}'].join('\n');}
  function saveMDL(source,model){
    let text=dec.decode(bytesOf(source));const defs=model.textureDefs||[],customNodes=(model.nodes||[]).filter(n=>n&&n.__custom),customAttachments=customNodes.filter(n=>n.type==='Attachment'),customEmitters=customNodes.filter(n=>n.type==='ParticleEmitter2'),customCameras=(model.cameras||[]).filter(c=>c&&c.__custom);
    if(defs.length){const block=findContainer(text,'Textures'),replacement=texturesMdl(defs);if(block)text=text.slice(0,block.start)+replacement+text.slice(block.end+1);else text+='\n\n'+replacement+'\n';}
    if(customNodes.length){const block=findContainer(text,'PivotPoints'),replacement=pivotsMdl(model,customNodes);if(block)text=text.slice(0,block.start)+replacement+text.slice(block.end+1);else text+='\n\n'+replacement+'\n';}
    const additions=[...customAttachments.map(attachmentMdl),...customEmitters.map(emitter2Mdl),...customCameras.map(cameraMdl)];if(additions.length)text+='\n\n// Added by WC3 Asset Studio\n'+additions.join('\n\n')+'\n';
    return {bytes:enc.encode(text),type:'MDL',changes:{textures:defs.length,cameras:customCameras.length,attachments:customAttachments.length,particleEmitters2:customEmitters.length}};
  }

  function saveEditedModel(sourceBuffer,sourceName,model){
    if(!model)throw new Error('No model loaded.');const type=String(model.type||'').toUpperCase()||(/\.mdl$/i.test(sourceName||'')?'MDL':'MDX');
    return type==='MDL'?saveMDL(sourceBuffer,model):saveMDX(sourceBuffer,model);
  }

  window.WC3_MODEL_SAVE={saveEditedModel,saveMDX,saveMDL,version:'1.0'};
})();
