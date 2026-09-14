(function(){
  'use strict';
  const app = window.BLP_PAINT_APP;
  const labCore = window.WC3_MODEL_CORE;
  const modelCore = window.WAR3_MODEL_CORE;
  if(!app || !labCore || !modelCore) return;
  const core = {...labCore, parseMDL:modelCore.parseMDL, parseMDX:modelCore.parseMDX};
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const state = { batch:null, report:[], sourceLabel:'', entries:[] };
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
  function finiteVertex(v){ return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }
  function finiteUv(v){ return Number.isFinite(v.u) && Number.isFinite(v.v); }

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

  function analyzeModelParsed(entry, parsed, index, referencedPackageFiles){
    const issues=[];
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

    if(!sequences.length)issues.push(issue('warning','Model has no animation sequences.'));
    else{
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
      if(path){const found=resolveRef(index,path);if(found)referencedPackageFiles.add(norm(found.name));else if(gameTexturePath(path))issues.push(issue('info',`Texture ${i} uses an in-game Warcraft path not included in this package: ${path}`,`Texture ${i}`));else if(!rid)issues.push(issue('severe',`Custom texture is referenced but missing from the checked package: ${path}`,`Texture ${i}`));}
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
        if(n.filterMode<0||n.filterMode>4)issues.push(issue('warning',`ParticleEmitter2 ${n.id} has invalid filter mode ${n.filterMode}.`,`ParticleEmitter2 ${n.id}`));
        if(n.replaceableId&&!REPLACEABLE_IDS.has(n.replaceableId))issues.push(issue('error',`ParticleEmitter2 ${n.id} has invalid ReplaceableId ${n.replaceableId}.`,`ParticleEmitter2 ${n.id}`));
        if((n.flags&0x100000)&&(n.speed===0||n.latitude===0))issues.push(issue('severe',`ParticleEmitter2 ${n.id} is XYQuad but speed/latitude is zero.`,`ParticleEmitter2 ${n.id}`));
        if(n.timeMiddle<0||n.timeMiddle>1)issues.push(issue('severe',`ParticleEmitter2 ${n.id} Time is ${n.timeMiddle}, expected 0..1.`,`ParticleEmitter2 ${n.id}`));
        if(n.squirt&&!(n.tracks&&n.tracks.KP2E))issues.push(issue('severe',`ParticleEmitter2 ${n.id} uses Squirt without animated emission rate.`,`ParticleEmitter2 ${n.id}`));
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
    return{name:entry.name,type:'model',size:entry.data.byteLength||entry.data.length||0,meta:{format:`${parsed.type} v${version}`,textures:textures.length,materials:materials.length,geosets:geosets.length,sequences:sequences.length,nodes:nodes.length,effects:nodes.filter(n=>!['Bone','Helper'].includes(n.type)).length,vertices:geosets.reduce((n,g)=>n+(g.vertices||[]).length,0),triangles:geosets.reduce((n,g)=>n+(g.faces||[]).length,0),unknownChunks:(parsed.unknownChunks||[]).length},issues,status:worstSeverity(issues),parsed};
  }

  async function analyzeModelEntry(entry,index,referencedPackageFiles){
    const issues=[];
    try{
      const buffer=abOf(entry); const parsed=ext(entry.name)==='mdl'?core.parseMDL(buffer):core.parseMDX(buffer);
      return analyzeModelParsed(entry,parsed,index,referencedPackageFiles);
    }catch(err){
      issues.push(issue('error',`Model parser failed: ${err.message}`));
      return {name:entry.name,type:'model',size:entry.data.byteLength||entry.data.length||0,meta:{format:ext(entry.name).toUpperCase()},issues,status:'error'};
    }
  }

  async function analyzeEntries(entries,sourceLabel){
    const clean=entries.filter(e=>e&&e.name&&!String(e.name).endsWith('/')&&e.data);
    const index=makeIndex(clean); const referencedPackageFiles=new Set(); const report=[];
    const models=clean.filter(e=>MODEL_EXT.has(ext(e.name)));
    const textures=clean.filter(e=>IMAGE_EXT.has(ext(e.name)));
    const other=clean.filter(e=>!MODEL_EXT.has(ext(e.name))&&!IMAGE_EXT.has(ext(e.name)));
    for(const e of models) report.push(await analyzeModelEntry(e,index,referencedPackageFiles));
    for(const e of textures) report.push(await analyzeTextureEntry(e));
    for(const e of other) report.push({name:e.name,type:'other',size:e.data.byteLength||e.data.length||0,meta:{format:ext(e.name).toUpperCase()||'FILE'},issues:[issue('info','File is present in the package but is not analyzed by this checker.')],status:'info'});

    const modelRefs=new Set();
    for(const r of report.filter(r=>r.type==='model'&&r.parsed)) for(const t of (r.parsed.textureDefs||[])){ const found=resolveRef(index,t.path||''); if(found) modelRefs.add(norm(found.name)); }
    for(const r of report.filter(r=>r.type==='texture')){
      if(models.length && !modelRefs.has(norm(r.name))){ r.issues.push(issue('unused','Texture file is not referenced by any model in this checked batch.')); r.status=worstSeverity(r.issues); }
    }

    const counts={error:0,severe:0,warning:0,unused:0,info:0};
    for(const r of report) for(const it of r.issues) if(counts[it.severity]!=null) counts[it.severity]++;
    return {sourceLabel:sourceLabel||'Files',entries:clean,report,counts,models:models.length,textures:textures.length,other:other.length};
  }

  async function entriesFromFiles(files){
    const out=[];
    for(const file of Array.from(files||[])){ const ab=await file.arrayBuffer(); out.push({name:file.webkitRelativePath||file.name,data:new Uint8Array(ab)}); }
    return out;
  }

  async function entriesFromZip(file){
    const ab=await file.arrayBuffer();
    return core.unzipEntries(ab);
  }

  function cardMeta(r){
    const m=r.meta||{};
    if(r.type==='model') return `${m.format||'MODEL'} · ${m.geosets||0} geosets · ${m.triangles||0} triangles · ${m.textures||0} texture slots · ${fmtBytes(r.size)}`;
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
      if(guide) guide.classList.remove('hidden');
      list.classList.add('empty'); list.textContent='';
      return;
    }
    if(guide) guide.classList.add('hidden');
    $('#sanityErrors').textContent=batch.counts.error; $('#sanitySevere').textContent=batch.counts.severe; $('#sanityWarnings').textContent=batch.counts.warning; $('#sanityUnused').textContent=batch.counts.unused;
    $('#sanityFileCount').textContent=`${batch.report.length} file${batch.report.length===1?'':'s'}`;
    $('#sanityBatchInfo').textContent=`${batch.sourceLabel}\n${batch.models} model(s) · ${batch.textures} texture(s) · ${batch.other} other file(s)\n${batch.counts.error} errors · ${batch.counts.severe} severe · ${batch.counts.warning} warnings · ${batch.counts.unused} unused`;
    list.classList.remove('empty'); list.innerHTML='';
    const ordered=[...batch.report].sort((a,b)=>(ORDER[worstSeverity(b.issues)]||0)-(ORDER[worstSeverity(a.issues)]||0)||a.name.localeCompare(b.name));
    for(const r of ordered){
      const card=document.createElement('div'); card.className='sanity-file-card'; card.dataset.search=(r.name+' '+r.issues.map(i=>i.message).join(' ')).toLowerCase();
      const st=worstSeverity(r.issues);
      card.innerHTML=`<div class="sanity-file-head" role="button" tabindex="0"><span class="sanity-card-chevron">▾</span><strong>${escapeHtml(r.name)}</strong><span class="sanity-file-status ${st==='info'||st==='unused'?'':st}">${st==='ok'?'OK':st.toUpperCase()}</span></div><div class="sanity-file-meta">${escapeHtml(cardMeta(r))}</div><div class="sanity-issue-list"></div>`;
      const il=card.querySelector('.sanity-issue-list');
      for(const it of r.issues){
        const row=document.createElement('div'); row.className=`sanity-issue ${it.severity}`; row.dataset.severity=it.severity;
        row.innerHTML=`<div class="sev">${escapeHtml(it.severity)}</div><div class="msg">${escapeHtml(it.message)}</div>`; il.appendChild(row);
      }
      const toggle=()=>card.classList.toggle('is-collapsed');
      const head=card.querySelector('.sanity-file-head'); head.addEventListener('click',toggle); head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
      list.appendChild(card);
    }
    applyFilters();
  }

  function escapeHtml(str){ return String(str||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function applyFilters(){
    const term=($('#sanitySearch').value||'').trim().toLowerCase(); const allowed=new Set($$('.sanity-filter-check:checked').map(x=>x.value));
    $$('#sanityResults .sanity-file-card').forEach(card=>{
      let visibleIssues=0;
      card.querySelectorAll('.sanity-issue').forEach(row=>{ const show=allowed.has(row.dataset.severity);row.classList.toggle('hidden-result',!show);if(show)visibleIssues++; });
      const textOk=!term||card.dataset.search.includes(term); card.classList.toggle('hidden-result',!textOk||visibleIssues===0);
    });
  }

  function exportReport(){
    if(!state.batch) return;
    const b=state.batch, lines=[];
    lines.push('BLP Paint Reforged — Sanity Checker Report');lines.push(`Source: ${b.sourceLabel}`);lines.push(`Files: ${b.report.length}`);lines.push(`Errors: ${b.counts.error} | Severe: ${b.counts.severe} | Warnings: ${b.counts.warning} | Unused: ${b.counts.unused}`);lines.push('');
    for(const r of b.report){ lines.push(`[${r.type.toUpperCase()}] ${r.name}`);lines.push(`  ${cardMeta(r)}`);for(const it of r.issues)lines.push(`  - ${it.severity.toUpperCase()}: ${it.message}`);lines.push(''); }
    const blob=new Blob([lines.join('\n')],{type:'text/plain'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sanity-report.txt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function runEntries(entries,label){
    app.showBusy('Running Warcraft sanity checks…');
    try{ state.batch=await analyzeEntries(entries,label);state.entries=entries;render();app.setStatus(`Sanity check complete · ${state.batch.counts.error} errors · ${state.batch.counts.severe} severe`); }
    catch(e){console.error(e);alert('Sanity check failed.\n\n'+e.message);}
    finally{app.hideBusy();}
  }

  async function runFiles(files){ const arr=Array.from(files||[]); if(!arr.length)return; await runEntries(await entriesFromFiles(arr),arr.length===1?arr[0].name:`${arr.length} selected files`); }
  async function runZip(file){ if(!file)return;app.showBusy('Reading ZIP package…');try{const entries=await entriesFromZip(file);app.hideBusy();await runEntries(entries,file.name);}catch(e){app.hideBusy();alert('Could not read ZIP package.\n\n'+e.message);} }

  function openSanity(){ core.setMode('sanity'); }

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
  $('#sanityClearBtn').addEventListener('click',()=>{state.batch=null;state.entries=[];render();});
  $('#sanityExportBtn').addEventListener('click',exportReport);
  $('#sanitySearch').addEventListener('input',applyFilters);
  $$('.sanity-filter-check').forEach(x=>x.addEventListener('change',applyFilters));
  const dz=$('#sanityDropZone');
  ['dragenter','dragover'].forEach(type=>dz.addEventListener(type,e=>{e.preventDefault();dz.classList.add('dragging');}));
  ['dragleave','drop'].forEach(type=>dz.addEventListener(type,e=>{e.preventDefault();dz.classList.remove('dragging');}));
  dz.addEventListener('drop',e=>{const fs=Array.from(e.dataTransfer.files||[]);if(fs.length===1&&ext(fs[0].name)==='zip')runZip(fs[0]);else runFiles(fs);});

  window.WC3_SANITY_CORE={analyzeEntries,analyzeTextureEntry,analyzeModelEntry,entriesFromZip};
  window.SANITY_API={checkFiles:runFiles,checkZip:runZip,open:openSanity,getBatch:()=>state.batch};
  render();
})();
