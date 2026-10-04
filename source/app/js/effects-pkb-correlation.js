(function(root,factory){
  'use strict';
  let SR=root?.WC3_EFFECTS_PKB_STRUCTURED_READER||null;
  if(typeof module==='object'&&module.exports){
    try{SR=SR||require('./effects-pkb-structured-reader.js');}catch(_){ }
    module.exports=factory(SR);
  }else if(root){
    root.WC3_EFFECTS_PKB_CORRELATION=factory(SR);
  }
})(typeof window!=='undefined'?window:globalThis,function(SR){
  'use strict';
  const VERSION=1;
  const SCHEMA='wc3.effects.pkb-correlation';
  const uniq=a=>[...new Set((a||[]).filter(v=>v!=null&&v!==''))];
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const hex=n=>'0x'+Math.max(0,Number(n)||0).toString(16).padStart(8,'0');
  const toU8=data=>data instanceof Uint8Array?data:data instanceof ArrayBuffer?new Uint8Array(data):ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):Array.isArray(data)?Uint8Array.from(data):new Uint8Array(0);
  const hashString=s=>{let h=2166136261>>>0;const t=String(s);for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h.toString(16).padStart(8,'0');};

  function bytesFor(file){
    const u8=toU8(file?._bytes||file?.data||file?._sourceBytes);
    return u8.length?u8:null;
  }
  function setDiff(a=[],b=[]){
    const A=new Set(a||[]),B=new Set(b||[]);
    return {added:[...B].filter(x=>!A.has(x)).sort(),removed:[...A].filter(x=>!B.has(x)).sort(),shared:[...A].filter(x=>B.has(x)).sort()};
  }
  function semanticDelta(a,b){
    const A=a?.fingerprint||{},B=b?.fingerprint||{};
    return {
      attributes:setDiff(A.attrs,B.attrs),
      renderers:setDiff(A.renderers,B.renderers),
      samplers:setDiff(A.samplers,B.samplers),
      interfaces:setDiff(A.interfaces,B.interfaces),
      xrefTargets:setDiff(A.xrefTargets,B.xrefTargets)
    };
  }
  function deltaCount(d){
    let n=0;
    for(const v of Object.values(d||{}))if(v&&typeof v==='object')n+=(v.added?.length||0)+(v.removed?.length||0);
    return n;
  }
  function diffRuns(a,b,maxRuns=1024){
    a=toU8(a);b=toU8(b);
    const min=Math.min(a.length,b.length),runs=[];
    let start=-1,changed=0;
    const close=end=>{if(start<0)return;runs.push({offset:start,end,size:end-start});start=-1;};
    for(let i=0;i<min;i++){
      if(a[i]!==b[i]){changed++;if(start<0)start=i;}else close(i);
      if(runs.length>=maxRuns)break;
    }
    close(min);
    if(a.length!==b.length){runs.push({offset:min,end:Math.max(a.length,b.length),size:Math.abs(a.length-b.length),sizeDelta:true});changed+=Math.abs(a.length-b.length);}
    return {changedBytes:changed,runs:runs.slice(0,maxRuns),sizeA:a.length,sizeB:b.length,sizeDelta:b.length-a.length,exact:a.length===b.length&&changed===0};
  }
  function scalarValue(bytes,offset,type){
    const u8=toU8(bytes),width={u8:1,u16:2,u32:4,i32:4,f32:4}[type]||0;
    if(!width||offset<0||offset+width>u8.length)return null;
    const dv=new DataView(u8.buffer,u8.byteOffset+offset,width);
    if(type==='u8')return dv.getUint8(0);
    if(type==='u16')return dv.getUint16(0,true);
    if(type==='u32')return dv.getUint32(0,true);
    if(type==='i32')return dv.getInt32(0,true);
    if(type==='f32')return dv.getFloat32(0,true);
    return null;
  }
  function plausible(type,a,b){
    if(type==='f32')return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)<=1e8&&Math.abs(b)<=1e8;
    if(type==='u32'||type==='i32'||type==='u16'||type==='u8')return Number.isInteger(a)&&Number.isInteger(b);
    return false;
  }
  function stableNeighborhood(a,b,offset,width,radius=12){
    const start=Math.max(0,offset-radius),end=Math.min(a.length,b.length,offset+width+radius);
    let same=0,total=0;
    for(let i=start;i<end;i++){
      if(i>=offset&&i<offset+width)continue;
      total++;if(a[i]===b[i])same++;
    }
    return total?same/total:0;
  }
  function nearbyAnchors(file,offset,distance=48){
    return (file?.recordAnchors||[])
      .filter(r=>Number.isInteger(r.offset)&&Math.abs(r.offset-offset)<=distance)
      .sort((x,y)=>Math.abs(x.offset-offset)-Math.abs(y.offset-offset))
      .slice(0,6)
      .map(r=>({offset:r.offset,signature:r.signature||'',kind:r.kind||'',text:r.text||r.targetText||''}));
  }
  function familyKey(a,b){
    const A=a?.fingerprint||{},B=b?.fingerprint||{};
    const shared={
      size:a?.size===b?.size?a?.size:0,
      renderers:setDiff(A.renderers,B.renderers).shared,
      samplers:setDiff(A.samplers,B.samplers).shared,
      attrs:setDiff(A.attrs,B.attrs).shared,
      interfaces:setDiff(A.interfaces,B.interfaces).shared
    };
    return hashString(JSON.stringify(shared));
  }
  function candidateOffsets(run,minSize){
    const out=new Set(),start=Math.max(0,run.offset-3),end=Math.min(minSize,run.end+3);
    for(let o=start;o<end;o++){out.add(o);out.add(o-(o%4));}
    return [...out].filter(o=>o>=0&&o<minSize).sort((a,b)=>a-b);
  }
  function comparePair(a,b,opts={}){
    const A=bytesFor(a),B=bytesFor(b);
    if(!A||!B)return {schema:SCHEMA,version:VERSION,available:false,reason:'raw-bytes-not-attached',a:a?.name||'',b:b?.name||'',candidates:[]};
    const diff=diffRuns(A,B,Number(opts.maxRuns)||1024);
    const semantic=semanticDelta(a,b),semCount=deltaCount(semantic),sameSize=A.length===B.length,minSize=Math.min(A.length,B.length),family=familyKey(a,b),seen=new Set(),candidates=[];
    const types=opts.types||['u32','i32','f32'];
    for(const run of diff.runs){
      if(run.sizeDelta)continue;
      for(const offset of candidateOffsets(run,minSize)){
        for(const type of types){
          const width=type==='u16'?2:type==='u8'?1:4;
          if(offset+width>minSize)continue;
          const key=`${offset}:${type}`;if(seen.has(key))continue;seen.add(key);
          const av=scalarValue(A,offset,type),bv=scalarValue(B,offset,type);
          if(Object.is(av,bv)||!plausible(type,av,bv))continue;
          if(!(offset<run.end&&offset+width>run.offset))continue;
          const anchorRows=[...nearbyAnchors(a,offset),...nearbyAnchors(b,offset)];
          const anchors=uniq(anchorRows.map(x=>x.signature));
          const anchorContext=anchorRows.map(x=>({...x,delta:offset-x.offset})).sort((x,y)=>Math.abs(x.delta)-Math.abs(y.delta)||String(x.signature).localeCompare(String(y.signature))).slice(0,8);
          const stability=stableNeighborhood(A,B,offset,width,12),aligned=offset%width===0,isIsolated=run.size<=8;
          let score=.08+(sameSize?0.15:0)+(aligned?0.12:0)+(isIsolated?0.15:0)+(stability*0.2)+(anchors.length?0.15:0)+(semCount>0&&semCount<=2?0.1:0);
          if(type==='f32'&&Math.abs(av)<=100000&&Math.abs(bv)<=100000)score+=0.08;
          if(run.size===width)score+=0.07;
          score=clamp(score,0,0.99);
          const signature=`field:${family}:${type}:${hex(offset)}`;
          candidates.push({
            signature,kind:'numeric-field-candidate',family,type,width,offset,offsetHex:hex(offset),aValue:av,bValue:bv,
            delta:type==='f32'?bv-av:Number(bv)-Number(av),score:Number(score.toFixed(4)),stability:Number(stability.toFixed(4)),
            run:{offset:run.offset,end:run.end,size:run.size},anchors,anchorContext,semanticDelta:semantic,evidenceStatus:'heuristic',
            evidenceReasons:[sameSize?'same-size pair':'size differs',aligned?'aligned':'unaligned',isIsolated?'isolated diff run':'wide diff run',anchors.length?`${anchors.length} nearby semantic/xref anchor(s)`:'no nearby semantic/xref anchor',`neighbor stability ${(stability*100).toFixed(0)}%`,semCount?`${semCount} semantic delta(s)`:'no semantic delta']
          });
        }
      }
    }
    candidates.sort((x,y)=>y.score-x.score||x.offset-y.offset||x.type.localeCompare(y.type));
    return {schema:SCHEMA,version:VERSION,available:true,a:{id:a.id||'',name:a.name||'',size:A.length,hash:a.hash||''},b:{id:b.id||'',name:b.name||'',size:B.length,hash:b.hash||''},sameSize,diff,semanticDelta:semantic,semanticDeltaCount:semCount,family,candidates:candidates.slice(0,Number(opts.maxCandidates)||240)};
  }
  function analyzeCorpus(corpus,opts={}){
    const files=corpus?.files||[],maxPairs=Math.max(1,Math.min(4096,Number(opts.maxPairs)||768)),pairs=[],aggregate=new Map();
    let considered=0;
    for(let i=0;i<files.length&&considered<maxPairs;i++){
      for(let j=i+1;j<files.length&&considered<maxPairs;j++){
        const a=files[i],b=files[j];
        if(!bytesFor(a)||!bytesFor(b))continue;
        if(opts.sameSizeOnly!==false&&a.size!==b.size)continue;
        considered++;
        const r=comparePair(a,b,{maxCandidates:120});if(!r.available)continue;
        pairs.push({a:a.id,b:b.id,aName:a.name,bName:b.name,changedBytes:r.diff.changedBytes,sameSize:r.sameSize,semanticDeltaCount:r.semanticDeltaCount,candidateCount:r.candidates.length,family:r.family});
        for(const c of r.candidates){
          let x=aggregate.get(c.signature);
          if(!x){x={signature:c.signature,kind:c.kind,label:`${c.type.toUpperCase()} ${c.offsetHex}`,type:c.type,width:c.width,offset:c.offset,offsetHex:c.offsetHex,family:c.family,pairs:new Set(),files:new Set(),scores:[],examples:[],anchors:new Set()};aggregate.set(c.signature,x);}
          x.pairs.add(`${a.id}|${b.id}`);x.files.add(a.id);x.files.add(b.id);x.scores.push(c.score);for(const an of c.anchors||[])x.anchors.add(an);
          if(x.examples.length<8)x.examples.push({a:a.name,b:b.name,aValue:c.aValue,bValue:c.bValue,score:c.score,run:c.run});
        }
      }
    }
    const order={probable:0,heuristic:1};
    const candidates=[...aggregate.values()].map(x=>{
      const pairCount=x.pairs.size,fileCount=x.files.size,avg=x.scores.reduce((n,v)=>n+v,0)/Math.max(1,x.scores.length),max=Math.max(...x.scores,0),status=pairCount>=2&&fileCount>=3&&avg>=.55?'probable':'heuristic';
      return {signature:x.signature,kind:x.kind,label:x.label,type:x.type,width:x.width,offset:x.offset,offsetHex:x.offsetHex,family:x.family,pairCount,fileCount,averageScore:Number(avg.toFixed(4)),maxScore:Number(max.toFixed(4)),anchors:[...x.anchors].slice(0,12),examples:x.examples,status};
    }).sort((a,b)=>(order[a.status]-order[b.status])||b.pairCount-a.pairCount||b.averageScore-a.averageScore||a.offset-b.offset);
    return {schema:'wc3.effects.pkb-corpus-correlation',version:VERSION,createdAt:new Date().toISOString(),available:files.some(bytesFor),files:files.length,pairsConsidered:considered,pairs,candidates:candidates.slice(0,512),counts:{probable:candidates.filter(x=>x.status==='probable').length,heuristic:candidates.filter(x=>x.status!=='probable').length}};
  }
  function applyRegistry(correlation,registry){
    if(!correlation)return correlation;
    const map=new Map((registry?.entries||[]).map(e=>[e.signature,e]));
    for(const c of correlation.candidates||[]){const e=map.get(c.signature);if(e){c.evidenceStatus=e.status||c.status||'heuristic';c.evidenceNote=e.note||'';c.evidenceFiles=e.fileCount||c.fileCount||0;}else c.evidenceStatus=c.status||'heuristic';}
    return correlation;
  }
  function publicSnapshot(v){return v?JSON.parse(JSON.stringify(v)):null;}
  function reportText(r){
    if(!r)return 'No PKB correlation analysis available.';
    return ['PKB STRUCTURAL CORRELATION · v1.5',`${r.files||0} corpus file(s) · ${r.pairsConsidered||0} same-size pair(s) compared`,`Field candidates: ${r.candidates?.length||0} · probable ${r.counts?.probable||0} · heuristic ${r.counts?.heuristic||0}`,'','Candidates are correlations, not decoded PKB fields. Repeated offsets never become confirmed automatically. Confirm a candidate only after controlled runtime/external validation.'].join('\n');
  }
  return Object.freeze({VERSION,SCHEMA,diffRuns,scalarValue,comparePair,analyzeCorpus,applyRegistry,publicSnapshot,reportText,bytesFor,semanticDelta});
});
