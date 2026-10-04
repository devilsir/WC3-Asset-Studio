(function(root,factory){
  'use strict';
  let CR=root?.WC3_EFFECTS_PKB_CORRELATION||null;
  if(typeof module==='object'&&module.exports){
    try{CR=CR||require('./effects-pkb-correlation.js');}catch(_){ }
    module.exports=factory(CR);
  }else if(root)root.WC3_EFFECTS_PKB_EXPERIMENTS=factory(CR);
})(typeof window!=='undefined'?window:globalThis,function(CR){
  'use strict';
  const VERSION=1;
  const SCHEMA='wc3.effects.pkb-field-experiments';
  const CATALOG_SCHEMA='wc3.effects.pkb-semantic-field-catalog';
  const PROPERTIES=Object.freeze([
    {id:'size',label:'Size',types:['f32']},
    {id:'emission-rate',label:'Emission Rate',types:['f32','u32']},
    {id:'life-span',label:'Life Span',types:['f32']},
    {id:'speed',label:'Speed',types:['f32']},
    {id:'alpha',label:'Alpha',types:['f32']},
    {id:'rotation',label:'Rotation',types:['f32']},
    {id:'color-r',label:'Color R',types:['f32']},
    {id:'color-g',label:'Color G',types:['f32']},
    {id:'color-b',label:'Color B',types:['f32']},
    {id:'custom',label:'Custom field',types:['f32','u32','i32','u16','u8']}
  ]);
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const uniq=a=>[...new Set((a||[]).filter(v=>v!=null&&v!==''))];
  const hashString=s=>{let h=2166136261>>>0;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h.toString(16).padStart(8,'0');};
  const bytesFor=f=>CR?.bytesFor?.(f)||f?._bytes||null;
  function prop(id,label=''){
    const p=PROPERTIES.find(x=>x.id===id)||PROPERTIES[PROPERTIES.length-1];
    return{id:p.id,label:p.id==='custom'&&String(label).trim()?String(label).trim():p.label,types:[...p.types]};
  }
  function setSimilarity(a=[],b=[]){const A=new Set(a||[]),B=new Set(b||[]),all=new Set([...A,...B]);if(!all.size)return 1;let same=0;for(const x of all)if(A.has(x)&&B.has(x))same++;return same/all.size;}
  function semanticSimilarity(a,b){const A=a?.fingerprint||{},B=b?.fingerprint||{};const vals=[setSimilarity(A.attrs,B.attrs),setSimilarity(A.renderers,B.renderers),setSimilarity(A.samplers,B.samplers),setSimilarity(A.interfaces,B.interfaces),setSimilarity(A.xrefTargets,B.xrefTargets)];return vals.reduce((n,v)=>n+v,0)/vals.length;}
  function findNearTwins(corpus,opts={}){
    if(!CR?.comparePair)throw new Error('PKB correlation module is unavailable.');
    const files=(corpus?.files||[]).filter(f=>bytesFor(f)),maxPairs=Math.max(1,Math.min(4096,Number(opts.maxPairs)||1024)),maxChanged=Math.max(1,Number(opts.maxChangedBytes)||8192),maxRatio=Math.max(.000001,Math.min(.25,Number(opts.maxChangedRatio)||.03)),rows=[];let considered=0;
    for(let i=0;i<files.length&&considered<maxPairs;i++)for(let j=i+1;j<files.length&&considered<maxPairs;j++){
      const a=files[i],b=files[j];if(a.size!==b.size)continue;considered++;
      const pair=CR.comparePair(a,b,{maxCandidates:48});if(!pair.available||pair.diff.exact)continue;
      const ratio=pair.diff.changedBytes/Math.max(1,a.size),sem=semanticSimilarity(a,b);if(pair.diff.changedBytes>maxChanged&&ratio>maxRatio)continue;
      const narrow=Math.max(0,1-Math.min(1,ratio/Math.max(maxRatio,.000001))),runCount=pair.diff.runs?.length||0,smallRuns=runCount?pair.diff.runs.filter(r=>!r.sizeDelta&&r.size<=8).length/runCount:0;
      const score=clamp(.38*sem+.34*narrow+.16*smallRuns+.12*(pair.semanticDeltaCount<=2?1:0));
      rows.push({id:`${a.id}|${b.id}`,a:a.id,b:b.id,aName:a.name,bName:b.name,size:a.size,changedBytes:pair.diff.changedBytes,changedRatio:Number(ratio.toFixed(6)),runCount,semanticSimilarity:Number(sem.toFixed(4)),semanticDeltaCount:pair.semanticDeltaCount,score:Number(score.toFixed(4)),family:pair.family});
    }
    rows.sort((x,y)=>y.score-x.score||x.changedBytes-y.changedBytes||x.aName.localeCompare(y.aName));
    return{schema:'wc3.effects.pkb-near-twins',version:VERSION,createdAt:new Date().toISOString(),considered,total:rows.length,pairs:rows.slice(0,Number(opts.limit)||256)};
  }
  function closeNum(a,b,tol=1e-5){a=Number(a);b=Number(b);if(!Number.isFinite(a)||!Number.isFinite(b))return false;const scale=Math.max(1,Math.abs(a),Math.abs(b));return Math.abs(a-b)<=Math.max(Number(tol)||0,scale*(Number(tol)||0));}
  function valueMatch(candidate,a,b,tol){
    if(candidate.type==='f32')return closeNum(candidate.aValue,a,tol)&&closeNum(candidate.bValue,b,tol);
    return Number(candidate.aValue)===Number(a)&&Number(candidate.bValue)===Number(b);
  }
  function reverseMatch(candidate,a,b,tol){
    if(candidate.type==='f32')return closeNum(candidate.aValue,b,tol)&&closeNum(candidate.bValue,a,tol);
    return Number(candidate.aValue)===Number(b)&&Number(candidate.bValue)===Number(a);
  }
  function contextSignature(candidate){
    if(!candidate)return'';
    const anchors=(candidate.anchorContext||[]).map(a=>({kind:a.kind||'',signature:a.signature||'',delta:Number(a.delta)||0}));
    const core={type:candidate.type,width:candidate.width||0,family:candidate.family||'',anchors:anchors.slice(0,6)};
    if(!anchors.length)core.offset=Number(candidate.offset)||0;
    return hashString(JSON.stringify(core));
  }
  function controlledExperiment(corpus,{aId,bId,property='custom',propertyLabel='',expectedA,expectedB,tolerance=1e-5,allowReverse=false}={}){
    if(!CR?.comparePair)throw new Error('PKB correlation module is unavailable.');
    const a=(corpus?.files||[]).find(f=>f.id===aId),b=(corpus?.files||[]).find(f=>f.id===bId);if(!a||!b)throw new Error('Choose two corpus PKBs for the controlled experiment.');
    const p=prop(property,propertyLabel),ea=Number(expectedA),eb=Number(expectedB);if(!Number.isFinite(ea)||!Number.isFinite(eb))throw new Error('Controlled experiment requires numeric A and B values.');if(Object.is(ea,eb))throw new Error('Controlled experiment A and B values must differ.');
    const pair=CR.comparePair(a,b,{maxCandidates:320,types:p.types});if(!pair.available)throw new Error(pair.reason||'PKB pair is unavailable for correlation.');
    const matches=[];
    for(const c of pair.candidates||[]){let reversed=false;if(valueMatch(c,ea,eb,tolerance))reversed=false;else if(allowReverse&&reverseMatch(c,ea,eb,tolerance))reversed=true;else continue;const exactBoost=.28,runBoost=c.run?.size===c.width?.08:0,score=clamp((Number(c.score)||0)*.66+exactBoost+runBoost);matches.push({...c,experimentScore:Number(score.toFixed(4)),expectedA:ea,expectedB:eb,reversed,contextSignature:contextSignature(c)});}
    matches.sort((x,y)=>y.experimentScore-x.experimentScore||y.score-x.score||x.offset-y.offset);
    const top=matches[0]||null;
    return{schema:SCHEMA,version:VERSION,id:`exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,createdAt:new Date().toISOString(),property:p,a:{id:a.id,name:a.name,value:ea},b:{id:b.id,name:b.name,value:eb},tolerance:Number(tolerance)||1e-5,pair:{sameSize:pair.sameSize,changedBytes:pair.diff?.changedBytes||0,runCount:pair.diff?.runs?.length||0,family:pair.family,semanticDeltaCount:pair.semanticDeltaCount},matches:matches.slice(0,64),topMatch:top?{signature:top.signature,contextSignature:top.contextSignature,type:top.type,width:top.width,offset:top.offset,offsetHex:top.offsetHex,aValue:top.aValue,bValue:top.bValue,score:top.score,experimentScore:top.experimentScore,anchors:top.anchors||[],anchorContext:top.anchorContext||[]}:null,status:top?'matched':'no-match'};
  }
  function previousManual(prev){const m=new Map();for(const e of prev?.entries||[])if(e.manualStatus||e.status==='confirmed')m.set(e.id,{status:e.manualStatus||e.status,note:e.note||''});return m;}
  function buildCatalog(experiments=[],previous=null){
    const manual=previousManual(previous),map=new Map();
    for(const exp of experiments||[]){const m=exp?.topMatch;if(!m||exp.status!=='matched')continue;const key=`${exp.property?.id||'custom'}:${m.contextSignature||m.signature}:${m.type}`,id=`semantic-field:${key}`;let row=map.get(id);if(!row){row={id,propertyId:exp.property?.id||'custom',propertyLabel:exp.property?.label||'Custom field',type:m.type,width:m.width,contextSignature:m.contextSignature||'',offsets:new Set(),files:new Set(),experimentIds:[],scores:[],examples:[]};map.set(id,row);}row.offsets.add(m.offset);row.files.add(exp.a.id);row.files.add(exp.b.id);row.experimentIds.push(exp.id);row.scores.push(Number(m.experimentScore)||0);if(row.examples.length<10)row.examples.push({a:exp.a.name,b:exp.b.name,aValue:exp.a.value,bValue:exp.b.value,offset:m.offset,offsetHex:m.offsetHex,score:m.experimentScore});}
    const entries=[...map.values()].map(r=>{const experimentsCount=r.experimentIds.length,fileCount=r.files.size,avg=r.scores.reduce((n,v)=>n+v,0)/Math.max(1,r.scores.length),man=manual.get(r.id);let status=man?.status||((experimentsCount>=2&&fileCount>=3&&avg>=.65)?'probable':'heuristic');if(status==='confirmed'&&!man)status='probable';return{id:r.id,propertyId:r.propertyId,propertyLabel:r.propertyLabel,type:r.type,width:r.width,contextSignature:r.contextSignature,offsets:[...r.offsets].sort((a,b)=>a-b),experimentCount:experimentsCount,fileCount,averageScore:Number(avg.toFixed(4)),status,manualStatus:man?.status||'',note:man?.note||'',experimentIds:r.experimentIds,examples:r.examples};}).sort((a,b)=>({confirmed:0,probable:1,heuristic:2}[a.status]-{confirmed:0,probable:1,heuristic:2}[b.status])||b.experimentCount-a.experimentCount||b.averageScore-a.averageScore);
    return{schema:CATALOG_SCHEMA,version:VERSION,updatedAt:new Date().toISOString(),entries,counts:{confirmed:entries.filter(e=>e.status==='confirmed').length,probable:entries.filter(e=>e.status==='probable').length,heuristic:entries.filter(e=>e.status==='heuristic').length}};
  }
  function setCatalogStatus(catalog,id,status,note=''){
    if(!catalog||!Array.isArray(catalog.entries))throw new Error('Semantic field catalog is unavailable.');if(!['heuristic','probable','confirmed'].includes(status))throw new Error('Catalog status must be heuristic, probable or confirmed.');const e=catalog.entries.find(x=>x.id===id);if(!e)throw new Error(`Semantic field mapping not found: ${id}`);if(status==='confirmed'&&!String(note).trim())throw new Error('A validation note is required before confirming a semantic PKB field.');e.status=status;e.manualStatus=status;e.note=String(note||'');catalog.updatedAt=new Date().toISOString();catalog.counts={confirmed:catalog.entries.filter(x=>x.status==='confirmed').length,probable:catalog.entries.filter(x=>x.status==='probable').length,heuristic:catalog.entries.filter(x=>x.status==='heuristic').length};return e;
  }
  function publicSnapshot(v){return v?JSON.parse(JSON.stringify(v)):null;}
  function reportText({nearTwins=null,experiments=[],catalog=null}={}){return['PKB CONTROLLED FIELD LAB · v1.5',`Near-twin pairs: ${nearTwins?.pairs?.length||0}`,`Experiments: ${experiments?.length||0}`,`Semantic field catalog: ${catalog?.entries?.length||0} · confirmed ${catalog?.counts?.confirmed||0} · probable ${catalog?.counts?.probable||0}`,'','A controlled experiment matches known A→B property values against binary candidates. A match is evidence, not proof. Confirmation remains manual and must include a validation note.'].join('\n');}
  return Object.freeze({VERSION,SCHEMA,CATALOG_SCHEMA,PROPERTIES,findNearTwins,controlledExperiment,buildCatalog,setCatalogStatus,contextSignature,publicSnapshot,reportText,semanticSimilarity});
});
