(function(root,factory){
  'use strict';
  let inspector=root?.WC3_EFFECTS_PKB_INSPECTOR||null;
  if(typeof module==='object'&&module.exports){
    try{inspector=inspector||require('./effects-pkb-inspector.js');}catch(_){ }
    module.exports=factory(inspector);
  }else if(root)root.WC3_EFFECTS_PKB_STRUCTURED_READER=factory(inspector);
})(typeof window!=='undefined'?window:globalThis,function(PI){
  'use strict';
  const VERSION=3,SCHEMA='wc3.effects.pkb-structure';
  const toU8=data=>PI?.toU8?PI.toU8(data):(data instanceof Uint8Array?data:data instanceof ArrayBuffer?new Uint8Array(data):ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):Array.isArray(data)?Uint8Array.from(data):new Uint8Array(0));
  const hash=data=>PI?.fnv1a64?PI.fnv1a64(data):(()=>{const u8=toU8(data);let h=0xcbf29ce484222325n,p=0x100000001b3n;for(const b of u8){h^=BigInt(b);h=BigInt.asUintN(64,h*p);}return h.toString(16).padStart(16,'0');})();
  const uniq=a=>[...new Set((a||[]).filter(Boolean))];
  const clean=v=>String(v??'').replace(/\0/g,'').trim();
  function classifyStrings(rows=[]){
    const all=rows.map(r=>({offset:r.offset,text:clean(r.text),encoding:r.encoding})).filter(r=>r.text);
    const attrs=[],interfaces=[],rendererTypes=[],samplerTypes=[],graphHints=[],vmHints=[];
    const rendererWords=['Billboard','Ribbon','Mesh','Light','Sound'];
    const samplerWords=['Curve','Shape','Image','Text','VectorField','EventStream','Box','Sphere','Cylinder','Capsule','Plane'];
    for(const r of all){
      const s=r.text;
      const am=s.match(/(?:__a_)?Game\.[A-Za-z0-9_.]+/g);if(am)for(const x of am)attrs.push(x.replace(/^__a_/,''));
      const im=s.match(/_pksi_[A-Za-z0-9_.]+/g);if(im)interfaces.push(...im);
      for(const w of rendererWords)if(new RegExp(`(?:^|[^A-Za-z])${w}(?:$|[^A-Za-z])`,'i').test(s))rendererTypes.push(w);
      for(const w of samplerWords)if(new RegExp(`(?:^|[^A-Za-z])${w}(?:$|[^A-Za-z])`,'i').test(s))samplerTypes.push(w);
      if(/\b(layer|spawner|spawn|event|payload|graph|root)\b/i.test(s))graphHints.push(s.slice(0,180));
      if(/\b(init|evolve|bind|bytecode|opcode|vm|script)\b/i.test(s)||/^__/.test(s))vmHints.push(s.slice(0,180));
    }
    return {attributes:uniq(attrs).sort(),simulationInterfaces:uniq(interfaces).sort(),rendererTypes:uniq(rendererTypes),samplerTypes:uniq(samplerTypes),graphHints:uniq(graphHints).slice(0,120),vmHints:uniq(vmHints).slice(0,120)};
  }
  function buildXrefs(data,targets,max=1200){
    const u8=toU8(data);if(u8.length<4||!targets?.length)return[];
    const wanted=new Map();for(const t of targets.slice(0,512))if(Number.isInteger(t.offset)&&t.offset>=0&&t.offset<=0xffffffff)wanted.set(t.offset,t);
    const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength),out=[];
    for(let o=0;o+4<=u8.length;o+=4){const v=dv.getUint32(o,true),target=wanted.get(v);if(target){out.push({offset:o,targetOffset:v,targetText:String(target.text||'').slice(0,160),alignment:4});if(out.length>=max)break;}}
    return out;
  }
  function lengthFieldCandidates(data,max=256){
    const u8=toU8(data);if(u8.length<12)return[];const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength),out=[];
    for(let o=0;o+8<=u8.length;o+=4){const n=dv.getUint32(o,true);if(n<8||n>1024*1024||o+4+n>u8.length)continue;let printable=0,probe=Math.min(n,64);for(let i=0;i<probe;i++){const b=u8[o+4+i];if((b>=32&&b<=126)||b===0||b===9||b===10||b===13)printable++;}const ratio=probe?printable/probe:0;if(ratio<.28&&n<32)continue;out.push({offset:o,length:n,payloadOffset:o+4,end:o+4+n,confidence:ratio>.7?'medium':'low',printableProbe:Number(ratio.toFixed(3))});if(out.length>=max)break;}
    return out;
  }
  function nonOverlappingCandidates(report,size){
    const candidates=(report?.chunks||[]).filter(c=>Number.isInteger(c.offset)&&Number.isInteger(c.end)&&c.offset>=0&&c.end<=size&&c.end>c.offset).sort((a,b)=>a.offset-b.offset||(b.end-b.offset)-(a.end-a.offset));
    const out=[];let cursor=-1;for(const c of candidates){if(c.offset<cursor)continue;out.push(c);cursor=c.end;}return out;
  }
  function buildSegments(report,size,strings=[],deps=[]){
    const picks=nonOverlappingCandidates(report,size),segments=[];let cursor=0,id=0;
    const push=(type,start,end,extra={})=>{if(end<=start)return;const withinStrings=strings.filter(s=>s.offset>=start&&s.offset<end),withinDeps=deps.filter(d=>(d.offsets||[]).some(o=>o>=start&&o<end));segments.push({id:`seg-${id++}`,type,offset:start,size:end-start,end,stringCount:withinStrings.length,dependencyCount:withinDeps.length,...extra});};
    for(const c of picks){if(c.offset>cursor)push('raw',cursor,c.offset,{confidence:'lossless'});push('candidate-block',c.offset,c.end,{tag:c.tag,confidence:c.confidence||'heuristic',payloadOffset:c.payloadOffset,candidatePayloadSize:c.size});cursor=c.end;}
    if(cursor<size)push('raw',cursor,size,{confidence:'lossless'});if(!segments.length&&size)push('raw',0,size,{confidence:'lossless'});return segments;
  }
  function recordKind(text){
    const s=String(text||'');
    if(/^(?:__a_)?Game\./.test(s))return'attribute-string';
    if(/^_pksi_/.test(s))return'simulation-interface-string';
    if(/^(Billboard|Ribbon|Mesh|Light|Sound)$/i.test(s))return'renderer-string';
    if(/^(Curve|Shape|Image|Text|VectorField|EventStream|Box|Sphere|Cylinder|Capsule|Plane)$/i.test(s))return'sampler-string';
    if(/\.(?:pkb|pkfx|pkmm|dds|blp|tga|mdx|mdl|wav|mp3|ogg)$/i.test(s))return'dependency-string';
    if(/\b(layer|spawner|spawn|event|payload|graph|root)\b/i.test(s))return'graph-string';
    if(/\b(init|evolve|bind|bytecode|opcode|vm|script)\b/i.test(s)||/^__/.test(s))return'vm-string';
    return'interesting-string';
  }
  function buildRecords(strings=[],xrefs=[]){
    const rows=(strings||[]).filter(r=>r&&Number.isInteger(r.offset)&&clean(r.text));
    const records=[];
    for(const r of rows){const kind=recordKind(clean(r.text));if(kind==='interesting-string'&&!/Game\.|_pksi_|Billboard|Ribbon|Mesh|Light|Curve|Shape|Layer|Event|Spawner|\.pkb|\.dds|\.blp/i.test(clean(r.text)))continue;const text=clean(r.text),signature=kind==='attribute-string'?`attribute:${text.replace(/^__a_/,'')}`:kind==='renderer-string'?`renderer:${text}`:kind==='sampler-string'?`sampler:${text}`:kind==='simulation-interface-string'?`interface:${text}`:`string:${kind}:${text}`;records.push({id:`str-${r.offset}`,type:'string',kind,offset:r.offset,encoding:r.encoding||'ascii',text,signature,evidenceStatus:'heuristic',editableSameLength:true});}
    for(const x of xrefs||[]){records.push({id:`xref-${x.offset}`,type:'xref',kind:'offset-xref',offset:x.offset,targetOffset:x.targetOffset,targetText:x.targetText||'',alignment:x.alignment||4,signature:`xref-target:${String(x.targetText||'').slice(0,80)}`,evidenceStatus:'heuristic',editableSameLength:false});}
    return records;
  }
  function applyRegistry(doc,registry){
    if(!doc)return doc;const map=new Map((registry?.entries||[]).map(e=>[e.signature,e]));
    for(const r of doc.records||[]){const e=map.get(r.signature);if(e){r.evidenceStatus=e.status||'heuristic';r.evidenceFiles=e.fileCount||0;r.evidenceCoverage=e.coverage||0;r.evidenceNote=e.note||'';}}
    doc.research=doc.research||{};doc.research.registryApplied=!!registry;doc.research.registryCounts=registry?.counts||null;return doc;
  }
  function encodeString(text,encoding='ascii'){
    const s=String(text||'');if(String(encoding).toLowerCase().includes('utf16')){const out=new Uint8Array(s.length*2);for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);out[i*2]=c&255;out[i*2+1]=(c>>>8)&255;}return out;}return Uint8Array.from([...s].map(ch=>ch.charCodeAt(0)&255));
  }
  function patchStringSameLength(doc,record,newText,opts={}){
    if(!record||record.type!=='string')throw new Error('A structured string record is required.');
    const required=String(opts.requireStatus||'confirmed');if(required&&record.evidenceStatus!==required)throw new Error(`String patch requires ${required} evidence; current status is ${record.evidenceStatus||'heuristic'}.`);
    const oldBytes=encodeString(record.text,record.encoding),nextBytes=encodeString(newText,record.encoding);if(oldBytes.length!==nextBytes.length)throw new Error(`Lossless string patch must keep byte length ${oldBytes.length}; replacement is ${nextBytes.length}.`);
    return patchSameLength(doc,record.offset,nextBytes,oldBytes);
  }
  function publicSnapshot(doc){
    if(!doc)return null;const out=JSON.parse(JSON.stringify(doc,(k,v)=>k.startsWith('_')?undefined:v));return out;
  }
  function parse(data,meta={}){
    const u8=toU8(data),base=PI?.inspect?PI.inspect(u8,meta):{size:u8.length,strings:{preview:[]},dependencies:[],chunks:[],hash:{algorithm:'fnv1a64',value:hash(u8)},entropy:0};
    const strings=base.strings?.preview||[],semantic=classifyStrings(strings),interesting=[...strings.filter(s=>/Game\.|_pksi_|\.pkb$|\.dds$|\.blp$|Billboard|Ribbon|Curve|Shape|Layer|Event|Spawner/i.test(String(s.text||''))).slice(0,512)];
    const xrefs=buildXrefs(u8,interesting),lengthCandidates=lengthFieldCandidates(u8),segments=buildSegments(base,u8.length,strings,base.dependencies||[]),covered=segments.reduce((n,s)=>n+s.size,0),rawBytes=segments.filter(s=>s.type==='raw').reduce((n,s)=>n+s.size,0),candidateBytes=covered-rawBytes;
    const records=buildRecords(strings,xrefs),doc={schema:SCHEMA,version:VERSION,name:String(meta.name||base.name||''),path:String(meta.path||base.path||''),size:u8.length,sourceHash:{algorithm:'fnv1a64',value:hash(u8)},preservation:{mode:'copy-through',coverageBytes:covered,coveragePercent:u8.length?Number((covered/u8.length*100).toFixed(6)):100,rawBytes,candidateBytes,segmentCount:segments.length,exactRebuildExpected:covered===u8.length},segments,semantic,xrefs,records,lengthFieldCandidates:lengthCandidates,dependencies:base.dependencies||[],strings:{total:base.strings?.total||strings.length,preview:strings.slice(0,240)},research:{targets:['layer graph','spawners','event payloads','curves','shapes','spatial layers','particle VM bytecode','numeric fixed-width fields'],decoded:[],status:'lossless-structure-map-v3'},notes:['All bytes are preserved by copy-through spans. Candidate blocks and length fields remain heuristic until validated against multiple real Warcraft III PKBs.','Semantic hints are string evidence only; they are not yet decoded runtime records.']};
    Object.defineProperty(doc,'_sourceBytes',{value:Uint8Array.from(u8),enumerable:false,writable:false});
    return doc;
  }
  function rebuildLossless(doc){
    const src=doc?._sourceBytes;if(!(src instanceof Uint8Array))throw new Error('Lossless source bytes are not attached. Re-open the PKB before rebuilding.');const out=new Uint8Array(doc.size);let cursor=0;for(const s of doc.segments||[]){if(s.offset!==cursor)throw new Error(`Segment coverage gap/overlap at 0x${cursor.toString(16)}.`);out.set(src.subarray(s.offset,s.end),s.offset);cursor=s.end;}if(cursor!==doc.size)throw new Error(`Segment coverage ended at ${cursor}, expected ${doc.size}.`);return out;
  }
  function verifyLossless(doc){
    const src=doc?._sourceBytes;if(!(src instanceof Uint8Array))return{ok:false,exact:false,reason:'source-bytes-missing',size:doc?.size||0};const rebuilt=rebuildLossless(doc);let first=-1,changed=0;for(let i=0;i<src.length;i++)if(src[i]!==rebuilt[i]){changed++;if(first<0)first=i;}return{ok:changed===0,exact:changed===0,size:src.length,sourceHash:hash(src),rebuiltHash:hash(rebuilt),changedBytes:changed,firstDifference:first,coveragePercent:doc.preservation?.coveragePercent??0,segments:doc.segments?.length||0,rawSegments:doc.segments?.filter(s=>s.type==='raw').length||0,candidateSegments:doc.segments?.filter(s=>s.type!=='raw').length||0};
  }
  function locateSegment(doc,offset){return (doc?.segments||[]).find(s=>offset>=s.offset&&offset<s.end)||null;}
  function diffAgainst(doc,other){
    const a=doc?._sourceBytes,b=toU8(other);if(!(a instanceof Uint8Array))throw new Error('Structured source bytes are not attached.');const min=Math.min(a.length,b.length),regions=[];let start=-1,changed=0;const close=end=>{if(start<0)return;const seg=locateSegment(doc,start);regions.push({offset:start,end,size:end-start,segmentId:seg?.id||'',segmentType:seg?.type||'out-of-range',tag:seg?.tag||''});start=-1;};for(let i=0;i<min;i++){if(a[i]!==b[i]){changed++;if(start<0)start=i;}else close(i);}close(min);if(a.length!==b.length){const s=min,e=Math.max(a.length,b.length);regions.push({offset:s,end:e,size:e-s,segmentId:'',segmentType:'size-delta',tag:''});changed+=e-s;}return{schema:'wc3.effects.pkb-structured-diff',version:VERSION,exact:a.length===b.length&&changed===0,sizeA:a.length,sizeB:b.length,changedBytes:changed,regions:regions.slice(0,512),rawRegions:regions.filter(r=>r.segmentType==='raw').length,candidateRegions:regions.filter(r=>r.segmentType==='candidate-block').length,sourceHash:hash(a),otherHash:hash(b)};
  }
  function patchSameLength(doc,offset,replacement,expected){
    const src=doc?._sourceBytes;if(!(src instanceof Uint8Array))throw new Error('Structured source bytes are not attached.');const rep=toU8(replacement);if(offset<0||offset+rep.length>src.length)throw new RangeError('Patch is outside the PKB range.');if(expected!=null){const exp=toU8(expected);if(exp.length!==rep.length)throw new Error('Expected and replacement patch lengths must match.');for(let i=0;i<exp.length;i++)if(src[offset+i]!==exp[i])throw new Error(`Patch expectation mismatch at 0x${(offset+i).toString(16)}.`);}const out=Uint8Array.from(src);out.set(rep,offset);const next=parse(out,{name:doc.name,path:doc.path});next.patch={offset,size:rep.length,sourceHash:doc.sourceHash?.value||hash(src)};return next;
  }

  const SCALAR_WIDTH=Object.freeze({u8:1,u16:2,u32:4,i32:4,f32:4});
  function readScalar(docOrBytes,offset,type){
    const src=docOrBytes?._sourceBytes instanceof Uint8Array?docOrBytes._sourceBytes:toU8(docOrBytes),width=SCALAR_WIDTH[type]||0;if(!width)throw new Error(`Unsupported scalar type: ${type}`);if(offset<0||offset+width>src.length)throw new RangeError('Scalar read is outside the PKB range.');const dv=new DataView(src.buffer,src.byteOffset+offset,width);if(type==='u8')return dv.getUint8(0);if(type==='u16')return dv.getUint16(0,true);if(type==='u32')return dv.getUint32(0,true);if(type==='i32')return dv.getInt32(0,true);if(type==='f32')return dv.getFloat32(0,true);throw new Error(`Unsupported scalar type: ${type}`);
  }
  function scalarBytes(type,value){
    const width=SCALAR_WIDTH[type]||0;if(!width)throw new Error(`Unsupported scalar type: ${type}`);const out=new Uint8Array(width),dv=new DataView(out.buffer);if(type==='u8'){if(!Number.isInteger(Number(value))||Number(value)<0||Number(value)>255)throw new Error('u8 value must be an integer from 0 to 255.');dv.setUint8(0,Number(value));}else if(type==='u16'){if(!Number.isInteger(Number(value))||Number(value)<0||Number(value)>65535)throw new Error('u16 value must be an integer from 0 to 65535.');dv.setUint16(0,Number(value),true);}else if(type==='u32'){if(!Number.isInteger(Number(value))||Number(value)<0||Number(value)>0xffffffff)throw new Error('u32 value must be an integer from 0 to 4294967295.');dv.setUint32(0,Number(value),true);}else if(type==='i32'){if(!Number.isInteger(Number(value))||Number(value)<-2147483648||Number(value)>2147483647)throw new Error('i32 value is out of range.');dv.setInt32(0,Number(value),true);}else if(type==='f32'){const n=Number(value);if(!Number.isFinite(n))throw new Error('f32 value must be finite.');dv.setFloat32(0,n,true);}return out;
  }
  function patchScalarSameLength(doc,candidate,newValue,opts={}){
    if(!candidate||!Number.isInteger(Number(candidate.offset)))throw new Error('A numeric field candidate with an offset is required.');const type=String(candidate.type||'');if(!SCALAR_WIDTH[type])throw new Error(`Unsupported scalar candidate type: ${type||'?'}`);const required=String(opts.requireStatus||'confirmed');const status=String(candidate.evidenceStatus||candidate.status||'heuristic');if(required&&status!==required)throw new Error(`Scalar patch requires ${required} evidence; current status is ${status}.`);const offset=Number(candidate.offset),current=readScalar(doc,offset,type),expected=opts.expected!==undefined?opts.expected:(candidate.aValue!==undefined?candidate.aValue:current);if(type==='f32'){const eps=Number(opts.epsilon)||1e-6;if(!(Math.abs(Number(current)-Number(expected))<=eps||Object.is(current,expected)))throw new Error(`Scalar expectation mismatch at 0x${offset.toString(16)}: ${current} != ${expected}.`);}else if(Number(current)!==Number(expected))throw new Error(`Scalar expectation mismatch at 0x${offset.toString(16)}: ${current} != ${expected}.`);const next=patchSameLength(doc,offset,scalarBytes(type,newValue),scalarBytes(type,current));next.patch={kind:'scalar',signature:candidate.signature||'',type,offset,size:SCALAR_WIDTH[type],before:current,after:readScalar(next,offset,type),sourceHash:doc.sourceHash?.value||hash(doc._sourceBytes)};return next;
  }
  function createPatchPlan(doc,ops=[]){
    if(!(doc?._sourceBytes instanceof Uint8Array))throw new Error('Structured source bytes are not attached.');const normalized=(ops||[]).map((op,i)=>{const kind=String(op?.kind||'scalar');if(kind!=='scalar')throw new Error(`Unsupported patch-plan operation ${kind}.`);const c=op.candidate||op,width=SCALAR_WIDTH[c.type]||0;if(!width)throw new Error(`Patch-plan operation ${i+1} has unsupported type ${c.type}.`);const status=String(c.evidenceStatus||c.status||'heuristic');return{id:`op-${i}`,kind:'scalar',signature:c.signature||'',type:c.type,offset:Number(c.offset),width,status,expected:op.expected!==undefined?op.expected:(c.aValue!==undefined?c.aValue:readScalar(doc,Number(c.offset),c.type)),value:op.value};});normalized.sort((a,b)=>a.offset-b.offset);for(let i=0;i<normalized.length;i++){const x=normalized[i];if(!Number.isInteger(x.offset)||x.offset<0||x.offset+x.width>doc.size)throw new Error(`Patch-plan operation ${x.id} is outside the PKB range.`);if(i&&normalized[i-1].offset+normalized[i-1].width>x.offset)throw new Error(`Patch-plan operations overlap at 0x${x.offset.toString(16)}.`);}return{schema:'wc3.effects.pkb-patch-plan',version:1,sourceHash:doc.sourceHash?.value||hash(doc._sourceBytes),sourceSize:doc.size,createdAt:new Date().toISOString(),operations:normalized};
  }
  function applyPatchPlan(doc,plan,opts={}){
    if(!plan||plan.schema!=='wc3.effects.pkb-patch-plan')throw new Error('Invalid PKB patch plan.');if(plan.sourceHash&&plan.sourceHash!==(doc.sourceHash?.value||hash(doc._sourceBytes)))throw new Error('Patch plan source hash does not match the open PKB.');let bytes=Uint8Array.from(doc._sourceBytes),applied=[];for(const op of plan.operations||[]){const required=String(opts.requireStatus||'confirmed');if(required&&op.status!==required)throw new Error(`Patch-plan operation ${op.signature||op.id} requires ${required} evidence; current status is ${op.status}.`);const temp=parse(bytes,{name:doc.name,path:doc.path}),current=readScalar(temp,op.offset,op.type);if(op.type==='f32'){const eps=Number(opts.epsilon)||1e-6;if(Math.abs(Number(current)-Number(op.expected))>eps)throw new Error(`Patch-plan expectation mismatch at 0x${op.offset.toString(16)}.`);}else if(Number(current)!==Number(op.expected))throw new Error(`Patch-plan expectation mismatch at 0x${op.offset.toString(16)}.`);bytes.set(scalarBytes(op.type,op.value),op.offset);applied.push({...op,before:current,after:op.value});}const next=parse(bytes,{name:doc.name,path:doc.path});next.patchPlan={sourceHash:plan.sourceHash,operationCount:applied.length,operations:applied};return next;
  }

  function reportText(doc,verification=null){
    if(!doc)return'No structured PKB read loaded.';const s=doc.semantic||{},p=doc.preservation||{};return [
      'STRUCTURED PKB READER v3 · LOSSLESS RESEARCH MODE',
      `${doc.name||'(unnamed)'} · ${Number(doc.size||0).toLocaleString()} bytes`,
      `Source hash: ${doc.sourceHash?.value||'—'}`,
      `Coverage: ${p.coveragePercent??0}% · ${p.segmentCount||0} spans · raw ${Number(p.rawBytes||0).toLocaleString()} B · candidate ${Number(p.candidateBytes||0).toLocaleString()} B`,
      `Lossless rebuild: ${verification?verification.exact?'EXACT':'DIFFERS':p.exactRebuildExpected?'ready to verify':'incomplete'}`,
      `Attributes: ${s.attributes?.length?s.attributes.join(', '):'none found'}`,
      `Simulation interfaces: ${s.simulationInterfaces?.length?s.simulationInterfaces.join(', '):'none found'}`,
      `Renderer hints: ${s.rendererTypes?.length?s.rendererTypes.join(', '):'none found'}`,
      `Sampler hints: ${s.samplerTypes?.length?s.samplerTypes.join(', '):'none found'}`,
      `Aligned offset xrefs: ${doc.xrefs?.length||0}`,
      `Length-field candidates: ${doc.lengthFieldCandidates?.length||0}`,
      `Structured evidence records: ${doc.records?.length||0} · confirmed ${(doc.records||[]).filter(r=>r.evidenceStatus==='confirmed').length} · probable ${(doc.records||[]).filter(r=>r.evidenceStatus==='probable').length}`,
      '',
      'Important: candidate blocks are not treated as verified PKB records. Unknown bytes remain byte-for-byte copy-through data.'
    ].join('\n');
  }
  return Object.freeze({VERSION,SCHEMA,parse,publicSnapshot,rebuildLossless,verifyLossless,diffAgainst,patchSameLength,patchStringSameLength,readScalar,scalarBytes,patchScalarSameLength,createPatchPlan,applyPatchPlan,applyRegistry,locateSegment,reportText,classifyStrings,buildXrefs,lengthFieldCandidates,buildRecords,recordKind});
});
