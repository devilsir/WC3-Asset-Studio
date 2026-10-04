(function(root,factory){
  'use strict';
  let SR=root?.WC3_EFFECTS_PKB_STRUCTURED_READER||null;
  if(typeof module==='object'&&module.exports){
    try{SR=SR||require('./effects-pkb-structured-reader.js');}catch(_){ }
    module.exports=factory(SR);
  }else if(root)root.WC3_EFFECTS_PKB_CORPUS=factory(SR);
})(typeof window!=='undefined'?window:globalThis,function(SR){
  'use strict';
  const VERSION=2,SCHEMA='wc3.effects.pkb-corpus',REGISTRY_SCHEMA='wc3.effects.pkb-structure-registry';
  const uniq=a=>[...new Set((a||[]).filter(v=>v!=null&&v!==''))];
  const canonical=v=>Array.isArray(v)?v.map(canonical):(v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v);
  const stable=v=>JSON.stringify(canonical(v));
  const hashString=s=>{let h=2166136261>>>0;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h.toString(16).padStart(8,'0');};
  const bucket=n=>{n=Math.max(0,Number(n)||0);if(n<16)return'<16';if(n<32)return'16-31';if(n<64)return'32-63';if(n<128)return'64-127';if(n<256)return'128-255';if(n<512)return'256-511';if(n<1024)return'512-1023';if(n<4096)return'1K-4K';if(n<16384)return'4K-16K';if(n<65536)return'16K-64K';return'>=64K';};
  function multiset(values=[]){const m={};for(const v of values)m[v]=(m[v]||0)+1;return m;}
  function semanticFingerprint(doc){
    const s=doc?.semantic||{},segments=doc?.segments||[],deps=doc?.dependencies||[];
    const tags=segments.filter(x=>x.type==='candidate-block').map(x=>String(x.tag||'?'));
    const depExt=deps.map(d=>String(d.path||d.requested||'').toLowerCase().match(/\.[a-z0-9]+$/)?.[0]||'').filter(Boolean);
    const shape={
      attrs:uniq(s.attributes).sort(),interfaces:uniq(s.simulationInterfaces).sort(),renderers:uniq(s.rendererTypes).sort(),samplers:uniq(s.samplerTypes).sort(),
      tags:multiset(tags),depExt:multiset(depExt),segmentBuckets:multiset(segments.map(x=>`${x.type}:${bucket(x.size)}`)),
      lengthBuckets:multiset((doc?.lengthFieldCandidates||[]).map(x=>bucket(x.length))),xrefTargets:uniq((doc?.xrefs||[]).map(x=>String(x.targetText||'').slice(0,80))).sort()
    };
    return{...shape,signature:hashString(stable(shape))};
  }
  const toU8=data=>data instanceof Uint8Array?data:data instanceof ArrayBuffer?new Uint8Array(data):ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):Array.isArray(data)?Uint8Array.from(data):new Uint8Array(0);
  function normalizeEntry(entry,i=0){return{name:String(entry?.name||`effect_${i+1}.pkb`),path:String(entry?.path||''),source:String(entry?.source||'local'),warcraftPath:String(entry?.warcraftPath||''),data:entry?.data};}
  function scanEntries(entries=[],opts={}){
    if(!SR?.parse)throw new Error('Structured PKB Reader is unavailable.');
    const files=[];let totalBytes=0;
    for(let i=0;i<entries.length;i++){
      const e=normalizeEntry(entries[i],i);if(!e.data)continue;
      const doc=SR.parse(e.data,{name:e.name,path:e.path||e.warcraftPath});
      const verify=SR.verifyLossless?.(doc)||null,fingerprint=semanticFingerprint(doc);
      const file={id:`pkb-${files.length}`,name:e.name,path:e.path,warcraftPath:e.warcraftPath,source:e.source,size:doc.size,hash:doc.sourceHash?.value||'',exactLossless:!!verify?.exact,semantic:doc.semantic||{},dependencies:doc.dependencies||[],fingerprint,segments:(doc.segments||[]).map(s=>({type:s.type,tag:s.tag||'',size:s.size,confidence:s.confidence||''})),lengthFieldCandidates:(doc.lengthFieldCandidates||[]).map(x=>({length:x.length,confidence:x.confidence||''})),xrefs:(doc.xrefs||[]).map(x=>({offset:x.offset,targetOffset:x.targetOffset,targetText:x.targetText||'',alignment:x.alignment||0})),recordAnchors:(doc.records||[]).filter(r=>r.type==='string'||r.type==='xref').slice(0,1024).map(r=>({type:r.type,kind:r.kind||'',offset:r.offset,targetOffset:r.targetOffset,signature:r.signature||'',text:r.text||'',targetText:r.targetText||''}))};
      const raw=toU8(e.data);if(raw.length)Object.defineProperty(file,'_bytes',{value:Uint8Array.from(raw),enumerable:false,writable:false});files.push(file);
      totalBytes+=doc.size||0;
    }
    const corpus={schema:SCHEMA,version:VERSION,createdAt:new Date().toISOString(),name:String(opts.name||'PKB Corpus'),source:String(opts.source||'mixed'),files,totalFiles:files.length,totalBytes,summary:summarize(files)};
    corpus.registry=buildRegistry(corpus,opts.previousRegistry||null);corpus.clusters=clusterCorpus(corpus);return corpus;
  }
  function summarize(files=[]){
    const attrs=[],renderers=[],samplers=[],interfaces=[],deps=[];let exact=0;
    for(const f of files){if(f.exactLossless)exact++;attrs.push(...(f.semantic?.attributes||[]));renderers.push(...(f.semantic?.rendererTypes||[]));samplers.push(...(f.semantic?.samplerTypes||[]));interfaces.push(...(f.semantic?.simulationInterfaces||[]));deps.push(...(f.dependencies||[]).map(d=>d.path||d.requested||''));}
    return{losslessExact:exact,attributes:multiset(attrs),renderers:multiset(renderers),samplers:multiset(samplers),interfaces:multiset(interfaces),dependencyExtensions:multiset(deps.map(x=>String(x).toLowerCase().match(/\.[a-z0-9]+$/)?.[0]||'').filter(Boolean))};
  }
  function registryEvidence(files=[]){
    const map=new Map(),add=(signature,kind,label,file,detail={})=>{if(!signature)return;let r=map.get(signature);if(!r){r={signature,kind,label,files:new Set(),occurrences:0,details:[]};map.set(signature,r);}r.files.add(file.id);r.occurrences++;if(r.details.length<12)r.details.push({file:file.name,...detail});};
    for(const f of files){
      for(const x of f.semantic?.attributes||[])add(`attribute:${x}`,'attribute',x,f);
      for(const x of f.semantic?.rendererTypes||[])add(`renderer:${x}`,'renderer-hint',x,f);
      for(const x of f.semantic?.samplerTypes||[])add(`sampler:${x}`,'sampler-hint',x,f);
      for(const x of f.semantic?.simulationInterfaces||[])add(`interface:${x}`,'simulation-interface',x,f);
      for(const [tag,count] of Object.entries(f.fingerprint?.tags||{}))add(`block-tag:${tag}`,'block-tag',tag,f,{count});
      for(const [b,count] of Object.entries(f.fingerprint?.lengthBuckets||{}))add(`length-bucket:${b}`,'length-field-shape',b,f,{count});
      for(const x of f.fingerprint?.xrefTargets||[])add(`xref-target:${x}`,'offset-xref-target',x,f);
    }
    return[...map.values()];
  }
  function previousManualMap(prev){const m=new Map();for(const e of prev?.entries||[])if(e.manualStatus||e.status==='confirmed')m.set(e.signature,{status:e.manualStatus||e.status,note:e.note||''});return m;}
  function buildRegistry(corpus,previous=null){
    const files=corpus?.files||[],total=Math.max(1,files.length),manual=previousManualMap(previous),entries=[];
    for(const e of registryEvidence(files)){
      const fileCount=e.files.size,ratio=fileCount/total,man=manual.get(e.signature);
      let status=man?.status||'heuristic';
      if(!man&&fileCount>=2&&ratio>=.35)status='probable';
      entries.push({signature:e.signature,kind:e.kind,label:e.label,status,manualStatus:man?.status||'',note:man?.note||'',fileCount,corpusFiles:files.length,occurrences:e.occurrences,coverage:Number(ratio.toFixed(4)),details:e.details});
    }
    for(const c of corpus?.correlation?.candidates||[]){
      const man=manual.get(c.signature),fileCount=Number(c.fileCount)||0,ratio=fileCount/total;
      let status=man?.status||c.status||'heuristic';if(status==='confirmed'&&!man)status='probable';
      entries.push({signature:c.signature,kind:'numeric-field-candidate',label:c.label||`${String(c.type||'field').toUpperCase()} @ ${c.offsetHex||c.offset}`,status,manualStatus:man?.status||'',note:man?.note||'',fileCount,corpusFiles:files.length,occurrences:Number(c.pairCount)||0,coverage:Number(ratio.toFixed(4)),details:(c.examples||[]).slice(0,12),field:{type:c.type,width:c.width,offset:c.offset,offsetHex:c.offsetHex,family:c.family,averageScore:c.averageScore,maxScore:c.maxScore}});
    }
    entries.sort((a,b)=>(({confirmed:0,probable:1,heuristic:2}[a.status])-({confirmed:0,probable:1,heuristic:2}[b.status])||b.fileCount-a.fileCount||a.signature.localeCompare(b.signature)));
    return{schema:REGISTRY_SCHEMA,version:VERSION,updatedAt:new Date().toISOString(),corpusFiles:files.length,entries,counts:{confirmed:entries.filter(x=>x.status==='confirmed').length,probable:entries.filter(x=>x.status==='probable').length,heuristic:entries.filter(x=>x.status==='heuristic').length}};
  }
  function setRegistryStatus(registry,signature,status,note=''){
    if(!registry||!Array.isArray(registry.entries))throw new Error('Structure registry is unavailable.');if(!['heuristic','probable','confirmed'].includes(status))throw new Error('Registry status must be heuristic, probable or confirmed.');
    const e=registry.entries.find(x=>x.signature===signature);if(!e)throw new Error(`Registry evidence not found: ${signature}`);e.status=status;e.manualStatus=status;e.note=String(note||'');registry.updatedAt=new Date().toISOString();registry.counts={confirmed:registry.entries.filter(x=>x.status==='confirmed').length,probable:registry.entries.filter(x=>x.status==='probable').length,heuristic:registry.entries.filter(x=>x.status==='heuristic').length};return e;
  }
  function clusterCorpus(corpus){const m=new Map();for(const f of corpus?.files||[]){const k=f.fingerprint?.signature||'unknown';if(!m.has(k))m.set(k,[]);m.get(k).push(f);}return[...m.entries()].map(([signature,files])=>({signature,count:files.length,files:files.map(f=>f.name),renderers:uniq(files.flatMap(f=>f.semantic?.rendererTypes||[])),samplers:uniq(files.flatMap(f=>f.semantic?.samplerTypes||[])),attributes:uniq(files.flatMap(f=>f.semantic?.attributes||[]))})).sort((a,b)=>b.count-a.count||a.signature.localeCompare(b.signature));}
  function setDiff(a=[],b=[]){const A=new Set(a||[]),B=new Set(b||[]);return{added:[...B].filter(x=>!A.has(x)).sort(),removed:[...A].filter(x=>!B.has(x)).sort(),shared:[...A].filter(x=>B.has(x)).sort()};}
  function multisetDiff(a={},b={}){const keys=uniq([...Object.keys(a||{}),...Object.keys(b||{})]).sort(),changed=[];for(const k of keys){const av=a?.[k]||0,bv=b?.[k]||0;if(av!==bv)changed.push({key:k,a:av,b:bv,delta:bv-av});}return changed;}
  function compareFiles(a,b){
    if(!a||!b)throw new Error('Two corpus files are required.');const A=a.fingerprint||{},B=b.fingerprint||{};
    return{schema:'wc3.effects.pkb-semantic-diff',version:VERSION,a:{name:a.name,size:a.size,hash:a.hash,signature:A.signature},b:{name:b.name,size:b.size,hash:b.hash,signature:B.signature},sizeDelta:(b.size||0)-(a.size||0),sameFingerprint:A.signature===B.signature,attributes:setDiff(A.attrs,B.attrs),interfaces:setDiff(A.interfaces,B.interfaces),renderers:setDiff(A.renderers,B.renderers),samplers:setDiff(A.samplers,B.samplers),xrefTargets:setDiff(A.xrefTargets,B.xrefTargets),blockTags:multisetDiff(A.tags,B.tags),segmentShapes:multisetDiff(A.segmentBuckets,B.segmentBuckets),lengthShapes:multisetDiff(A.lengthBuckets,B.lengthBuckets),dependencyExtensions:multisetDiff(A.depExt,B.depExt)};
  }
  function publicSnapshot(corpus){return corpus?JSON.parse(JSON.stringify(corpus)):null;}
  function reportText(corpus){if(!corpus)return'No PKB corpus loaded.';const r=corpus.registry||{},s=corpus.summary||{};return[
    'PKB CORPUS SCANNER · STRUCTURED DECODER RESEARCH',
    `${corpus.totalFiles||0} file(s) · ${Number(corpus.totalBytes||0).toLocaleString()} bytes · ${s.losslessExact||0} exact lossless rebuild(s)`,
    `Clusters: ${corpus.clusters?.length||0}`,
    `Registry: ${r.counts?.confirmed||0} confirmed · ${r.counts?.probable||0} probable · ${r.counts?.heuristic||0} heuristic`,
    `Renderer evidence: ${Object.entries(s.renderers||{}).map(([k,v])=>`${k}×${v}`).join(', ')||'none'}`,
    `Sampler evidence: ${Object.entries(s.samplers||{}).map(([k,v])=>`${k}×${v}`).join(', ')||'none'}`,
    `Game.* attributes: ${Object.keys(s.attributes||{}).join(', ')||'none'}`,
    '',
    'Probable = repeated evidence across the scanned corpus. Numeric field candidates are correlations only. Confirmed is never assigned automatically; it requires an explicit manual promotion after controlled external/runtime validation.'
  ].join('\n');}
  return Object.freeze({VERSION,SCHEMA,REGISTRY_SCHEMA,scanEntries,semanticFingerprint,buildRegistry,setRegistryStatus,clusterCorpus,compareFiles,publicSnapshot,reportText,bucket});
});
