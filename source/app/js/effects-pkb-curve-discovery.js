(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.WC3_EFFECTS_PKB_CURVE_DISCOVERY=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const SCHEMA='wc3.effects.pkb-curve-discovery',VERSION=2;
  const CHANNELS=Object.freeze([
    {id:'size',label:'Size',keywords:['size','scale']},
    {id:'alpha',label:'Alpha',keywords:['alpha','opacity']},
    {id:'velocity',label:'Velocity',keywords:['velocity','speed']},
    {id:'velocity-x',label:'Velocity X',keywords:['velocity x','speed x','velocityx']},
    {id:'velocity-y',label:'Velocity Y',keywords:['velocity y','speed y','velocityy']},
    {id:'velocity-z',label:'Velocity Z',keywords:['velocity z','speed z','velocityz']},
    {id:'color-r',label:'Color R',keywords:['color r','red','colorr']},
    {id:'color-g',label:'Color G',keywords:['color g','green','colorg']},
    {id:'color-b',label:'Color B',keywords:['color b','blue','colorb']}
  ]);
  const COMPLEX_TARGETS=Object.freeze([
    {id:'color-rgb',label:'Color RGB',kind:'vector',channels:['color-r','color-g','color-b']},
    {id:'color-rgba',label:'Color RGBA',kind:'vector',channels:['color-r','color-g','color-b','alpha']},
    {id:'velocity-xyz',label:'Velocity XYZ',kind:'vector',channels:['velocity-x','velocity-y','velocity-z']},
    {id:'hermite-size',label:'Hermite Size',kind:'hermite',channel:'size'},
    {id:'hermite-alpha',label:'Hermite Alpha',kind:'hermite',channel:'alpha'},
    {id:'hermite-velocity',label:'Hermite Velocity',kind:'hermite',channel:'velocity'}
  ]);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const text=v=>String(v??'');
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const hex=n=>'0x'+Math.max(0,Number(n)||0).toString(16).padStart(8,'0');
  const hashString=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h.toString(16).padStart(8,'0');};
  const finite=v=>Number.isFinite(v)&&Math.abs(v)<=1e9;
  function bytesFor(doc){const b=doc?._sourceBytes;return b instanceof Uint8Array?b:null;}
  function readF32(bytes,offset){if(!bytes||offset<0||offset+4>bytes.length)return NaN;return new DataView(bytes.buffer,bytes.byteOffset+offset,4).getFloat32(0,true);}
  function near(a,b,tol=.0005){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b));}
  function nearbyStrings(doc,offset,radius=384){
    const out=[];
    for(const r of doc?.records||[]){
      if(r?.type!=='string')continue;
      const ro=Number(r.offset)||0;
      if(Math.abs(ro-offset)>radius)continue;
      const s=text(r.text).trim();
      if(s)out.push({text:s,offset:ro,distance:Math.abs(ro-offset)});
    }
    return out.sort((a,b)=>a.distance-b.distance).slice(0,8);
  }
  function inferChannel(hints=[]){
    const hay=hints.map(x=>text(x.text||x)).join(' ').toLowerCase();
    let best={channel:'',score:0,reason:''};
    for(const ch of CHANNELS)for(const k of ch.keywords){
      if(hay.includes(k)){
        const score=k.length>=6?.95:.82;
        if(score>best.score)best={channel:ch.id,score,reason:`context contains “${k}”`};
      }
    }
    return best;
  }
  function inferComplexTarget(hints=[]){
    const hay=hints.map(x=>text(x.text||x)).join(' ').toLowerCase();
    if(/color|colour|rgb|tint/.test(hay))return{target:'color-rgb',score:.96,reason:'context suggests RGB color data'};
    if(/velocity|speed|motion/.test(hay))return{target:'velocity-xyz',score:.94,reason:'context suggests XYZ velocity data'};
    if(/alpha|opacity/.test(hay))return{target:'hermite-alpha',score:.84,reason:'context suggests scalar alpha curve data'};
    if(/size|scale/.test(hay))return{target:'hermite-size',score:.84,reason:'context suggests scalar size curve data'};
    return{target:'',score:0,reason:''};
  }
  function timeQuality(times){
    if(!times?.length||Math.abs(times[0])>.05)return null;
    for(let i=0;i<times.length;i++)if(!finite(times[i]))return null;
    for(let i=1;i<times.length;i++)if(!(times[i]>times[i-1]+1e-7))return null;
    const last=times[times.length-1];
    if(last<=.05||last>120)return null;
    const normalized=last<=1.05&&times[0]>=-.05,norm=times.map(t=>clamp(t/last,0,1)),endpoint=clamp(1-Math.abs(norm[norm.length-1]-1)*4,0,1),spacing=norm.length<3?1:1-Math.min(1,norm.slice(1).reduce((sum,t,i)=>sum+Math.abs((t-norm[i])-1/(norm.length-1)),0)/(norm.length-1));
    return{normalized,last,points:norm,score:.5+.22*(normalized?1:.65)+.16*endpoint+.12*clamp(spacing,0,1)};
  }
  function valueQuality(values){
    if(!values?.length||values.some(v=>!finite(v)))return null;
    const min=Math.min(...values),max=Math.max(...values),span=max-min,abs=Math.max(...values.map(Math.abs));
    if(abs>1e7)return null;
    const plausible=abs<=4?1:abs<=64?.8:abs<=4096?.55:.25,varied=span>1e-6?1:.45;
    return{min,max,span,score:.65*plausible+.35*varied};
  }
  function makeCandidate(doc,{layout,offset,times,values,timeOffsets,valueOffsets,timeInfo,valueInfo}={}){
    const hints=nearbyStrings(doc,offset),hint=inferChannel(hints),sampleCount=values.length,baseScore=clamp(.58*timeInfo.score+.27*valueInfo.score+.15*hint.score,0,1),signature=hashString(JSON.stringify({layout,sampleCount,delta:valueOffsets.map((x,i)=>x-timeOffsets[Math.min(i,timeOffsets.length-1)]),hint:hint.channel||'',timeShape:timeInfo.points.map(x=>Number(x.toFixed(3)))})),samples=values.map((v,i)=>({index:i,time:times[i],normalizedTime:timeInfo.points[i],value:v,timeOffset:timeOffsets[i],valueOffset:valueOffsets[i],timeOffsetHex:hex(timeOffsets[i]),valueOffsetHex:hex(valueOffsets[i])}));
    return{id:`curve-candidate:${layout}:${offset}:${sampleCount}:${signature}`,signature,kind:'scalar',layout,offset,offsetHex:hex(offset),byteLength:sampleCount*8,sampleCount,times:[...times],values:[...values],samples,score:Number(baseScore.toFixed(4)),timeScore:Number(timeInfo.score.toFixed(4)),valueScore:Number(valueInfo.score.toFixed(4)),suggestedChannel:hint.channel,suggestedChannelScore:Number(hint.score.toFixed(4)),channelReason:hint.reason,hints:hints.map(x=>x.text),pairEvidence:null,status:baseScore>=.86?'probable':'heuristic'};
  }
  function makeComplexCandidate(doc,{layout,offset,times,timeOffsets,components,componentOffsets,timeInfo,valueInfo}={}){
    const hints=nearbyStrings(doc,offset),hint=inferComplexTarget(hints),sampleCount=times.length,componentCount=components.length,flat=components.flat(),baseScore=clamp(.54*timeInfo.score+.27*valueInfo.score+.19*hint.score,0,1),signature=hashString(JSON.stringify({layout,sampleCount,componentCount,timeShape:timeInfo.points.map(x=>Number(x.toFixed(3))),offsetShape:componentOffsets.map(row=>row.map(x=>x-offset)),hint:hint.target||''})),samples=times.map((t,i)=>({index:i,time:t,normalizedTime:timeInfo.points[i],timeOffset:timeOffsets[i],timeOffsetHex:hex(timeOffsets[i]),componentValues:components.map(row=>row[i]),componentOffsets:componentOffsets.map(row=>row[i]),componentOffsetHex:componentOffsets.map(row=>hex(row[i]))}));
    return{id:`curve-complex:${layout}:${offset}:${sampleCount}:${componentCount}:${signature}`,signature,kind:'complex',layout,offset,offsetHex:hex(offset),byteLength:sampleCount*(componentCount+1)*4,sampleCount,componentCount,times:[...times],timeOffsets:[...timeOffsets],components:components.map(x=>[...x]),componentOffsets:componentOffsets.map(x=>[...x]),samples,score:Number(baseScore.toFixed(4)),timeScore:Number(timeInfo.score.toFixed(4)),valueScore:Number(valueInfo.score.toFixed(4)),suggestedTarget:hint.target,suggestedTargetScore:Number(hint.score.toFixed(4)),targetReason:hint.reason,hints:hints.map(x=>x.text),interpretations:componentCount===3?['vector3','hermite-scalar']:['vector'],pairEvidence:null,status:baseScore>=.86?'probable':'heuristic',flatValues:flat};
  }
  function scanInterleaved(doc,bytes,limit,opts,out){
    const maxSamples=Math.max(2,Math.min(16,Number(opts.maxSamples)||8));
    for(let offset=0;offset+16<=limit;offset+=4){
      const t0=readF32(bytes,offset),t1=readF32(bytes,offset+8);
      if(!finite(t0)||Math.abs(t0)>.05||!finite(t1)||t1<=t0+1e-7||t1>120)continue;
      const times=[],values=[],timeOffsets=[],valueOffsets=[];let best=null;
      for(let i=0;i<maxSamples&&offset+i*8+8<=limit;i++){
        const to=offset+i*8,vo=to+4,t=readF32(bytes,to),v=readF32(bytes,vo);
        if(!finite(t)||!finite(v))break;
        times.push(t);values.push(v);timeOffsets.push(to);valueOffsets.push(vo);
        if(times.length<2)continue;
        const ti=timeQuality(times),vi=valueQuality(values);
        if(!ti||!vi)break;
        const c=makeCandidate(doc,{layout:'interleaved-f32',offset,times:[...times],values:[...values],timeOffsets:[...timeOffsets],valueOffsets:[...valueOffsets],timeInfo:ti,valueInfo:vi});
        if(!best||c.score>best.score||c.sampleCount>best.sampleCount)best=c;
      }
      if(best&&best.score>=Number(opts.minScore||.68)){out.push(best);offset+=Math.max(0,best.byteLength-8);}
    }
  }
  function scanSplit(doc,bytes,limit,opts,out){
    const maxSamples=Math.max(2,Math.min(12,Number(opts.maxSamples)||8));
    for(let offset=0;offset+16<=limit;offset+=4){
      const t0=readF32(bytes,offset),t1=readF32(bytes,offset+4);
      if(!finite(t0)||Math.abs(t0)>.05||!finite(t1)||t1<=t0+1e-7||t1>120)continue;
      for(let count=maxSamples;count>=2;count--){
        if(offset+count*8>limit)continue;
        const times=[],values=[],timeOffsets=[],valueOffsets=[];
        for(let i=0;i<count;i++){timeOffsets.push(offset+i*4);times.push(readF32(bytes,offset+i*4));}
        const ti=timeQuality(times);if(!ti)continue;
        const valueBase=offset+count*4;
        for(let i=0;i<count;i++){valueOffsets.push(valueBase+i*4);values.push(readF32(bytes,valueBase+i*4));}
        const vi=valueQuality(values);if(!vi)continue;
        const c=makeCandidate(doc,{layout:'split-f32',offset,times,values,timeOffsets,valueOffsets,timeInfo:ti,valueInfo:vi});
        if(c.score>=Number(opts.minScore||.7)){out.push(c);offset+=Math.max(0,c.byteLength-8);break;}
      }
    }
  }
  function scanVectorInterleaved(doc,bytes,limit,opts,out){
    const maxSamples=Math.max(2,Math.min(12,Number(opts.maxSamples)||8)),minScore=Number(opts.complexMinScore||.7);
    for(const componentCount of [3,4,2]){
      const stride=(componentCount+1)*4;
      for(let offset=0;offset+stride*2<=limit;offset+=4){
        const t0=readF32(bytes,offset),t1=readF32(bytes,offset+stride);
        if(!finite(t0)||Math.abs(t0)>.05||!finite(t1)||t1<=t0+1e-7||t1>120)continue;
        const times=[],timeOffsets=[],components=Array.from({length:componentCount},()=>[]),componentOffsets=Array.from({length:componentCount},()=>[]);let best=null;
        for(let i=0;i<maxSamples&&offset+(i+1)*stride<=limit;i++){
          const base=offset+i*stride,t=readF32(bytes,base);if(!finite(t))break;
          times.push(t);timeOffsets.push(base);
          let bad=false;
          for(let c=0;c<componentCount;c++){
            const vo=base+4+c*4,v=readF32(bytes,vo);if(!finite(v)){bad=true;break;}
            components[c].push(v);componentOffsets[c].push(vo);
          }
          if(bad)break;
          if(times.length<2)continue;
          const ti=timeQuality(times),vi=valueQuality(components.flat());if(!ti||!vi)break;
          const candidate=makeComplexCandidate(doc,{layout:`interleaved-vector${componentCount}-f32`,offset,times:[...times],timeOffsets:[...timeOffsets],components:components.map(x=>[...x]),componentOffsets:componentOffsets.map(x=>[...x]),timeInfo:ti,valueInfo:vi});
          if(!best||candidate.score>best.score||candidate.sampleCount>best.sampleCount)best=candidate;
        }
        if(best&&best.score>=minScore){out.push(best);offset+=Math.max(0,best.byteLength-stride);}
      }
    }
  }
  function scanVectorSplit(doc,bytes,limit,opts,out){
    const maxSamples=Math.max(2,Math.min(10,Number(opts.maxSamples)||8)),minScore=Number(opts.complexMinScore||.72);
    for(let offset=0;offset+24<=limit;offset+=4){
      const t0=readF32(bytes,offset),t1=readF32(bytes,offset+4);
      if(!finite(t0)||Math.abs(t0)>.05||!finite(t1)||t1<=t0+1e-7||t1>120)continue;
      for(let count=maxSamples;count>=2;count--){
        const times=[],timeOffsets=[];
        for(let i=0;i<count;i++){times.push(readF32(bytes,offset+i*4));timeOffsets.push(offset+i*4);}
        const ti=timeQuality(times);if(!ti)continue;
        let accepted=false;
        for(const componentCount of [3,4,2]){
          const total=count*(componentCount+1)*4;if(offset+total>limit)continue;
          const components=Array.from({length:componentCount},()=>[]),componentOffsets=Array.from({length:componentCount},()=>[]);
          let bad=false;
          for(let c=0;c<componentCount;c++)for(let i=0;i<count;i++){
            const vo=offset+count*4+(c*count+i)*4,v=readF32(bytes,vo);if(!finite(v)){bad=true;break;}
            components[c].push(v);componentOffsets[c].push(vo);
          }
          if(bad)continue;
          const vi=valueQuality(components.flat());if(!vi)continue;
          const candidate=makeComplexCandidate(doc,{layout:`split-vector${componentCount}-f32`,offset,times,timeOffsets,components,componentOffsets,timeInfo:ti,valueInfo:vi});
          if(candidate.score>=minScore){out.push(candidate);offset+=Math.max(0,candidate.byteLength-8);accepted=true;break;}
        }
        if(accepted)break;
      }
    }
  }
  function dedupeCandidates(rows,maxCandidates=256){
    rows.sort((a,b)=>b.score-a.score||b.sampleCount-a.sampleCount||a.offset-b.offset);const kept=[];
    for(const c of rows){
      const overlaps=kept.some(k=>Math.max(c.offset,k.offset)<Math.min(c.offset+c.byteLength,k.offset+k.byteLength)&&c.layout===k.layout);
      if(!overlaps)kept.push(c);
      if(kept.length>=maxCandidates)break;
    }
    return kept.sort((a,b)=>b.score-a.score||a.offset-b.offset);
  }
  function dedupeComplex(rows,maxCandidates=160){
    rows.sort((a,b)=>b.score-a.score||b.componentCount-a.componentCount||b.sampleCount-a.sampleCount||a.offset-b.offset);const kept=[];
    for(const c of rows){
      const overlaps=kept.some(k=>Math.max(c.offset,k.offset)<Math.min(c.offset+c.byteLength,k.offset+k.byteLength)&&c.componentCount===k.componentCount&&c.layout===k.layout);
      if(!overlaps)kept.push(c);
      if(kept.length>=maxCandidates)break;
    }
    return kept.sort((a,b)=>b.score-a.score||a.offset-b.offset);
  }
  function scanDocument(doc,opts={}){
    const bytes=bytesFor(doc);if(!bytes)throw new Error('Curve discovery requires a parsed PKB document with source bytes.');
    const limit=Math.min(bytes.length,Math.max(64*1024,Math.min(Number(opts.maxBytes)||6*1024*1024,bytes.length))),rows=[],complex=[];
    scanInterleaved(doc,bytes,limit,opts,rows);scanSplit(doc,bytes,limit,opts,rows);scanVectorInterleaved(doc,bytes,limit,opts,complex);scanVectorSplit(doc,bytes,limit,opts,complex);
    const candidates=dedupeCandidates(rows,Number(opts.maxCandidates)||256),complexCandidates=dedupeComplex(complex,Number(opts.maxComplexCandidates)||160),pairSupported=candidates.filter(x=>x.pairEvidence?.supported).length,complexPairSupported=complexCandidates.filter(x=>x.pairEvidence?.supported).length;
    return{schema:SCHEMA,version:VERSION,createdAt:new Date().toISOString(),source:{name:doc.name||'',path:doc.path||'',size:bytes.length,scannedBytes:limit,hash:doc.sourceHash?.value||''},candidates,complexCandidates,summary:{candidates:candidates.length,complexCandidates:complexCandidates.length,probable:candidates.filter(x=>x.status==='probable').length,complexProbable:complexCandidates.filter(x=>x.status==='probable').length,pairSupported,complexPairSupported,layouts:{interleaved:candidates.filter(x=>x.layout==='interleaved-f32').length,split:candidates.filter(x=>x.layout==='split-f32').length,vectorInterleaved:complexCandidates.filter(x=>x.layout.startsWith('interleaved-vector')).length,vectorSplit:complexCandidates.filter(x=>x.layout.startsWith('split-vector')).length}}};
  }
  function sampleAt(bytes,c){const values=[],times=[];for(const s of c.samples||[]){times.push(readF32(bytes,s.timeOffset));values.push(readF32(bytes,s.valueOffset));}return{times,values};}
  function complexAt(bytes,c){const times=[],components=Array.from({length:c.componentCount||0},()=>[]);for(const s of c.samples||[]){times.push(readF32(bytes,s.timeOffset));for(let i=0;i<components.length;i++)components[i].push(readF32(bytes,s.componentOffsets[i]));}return{times,components};}
  function applyScalarPairEvidence(c,bytes,tol,aName,bName){
    const other=sampleAt(bytes,c);if(other.times.some(v=>!finite(v))||other.values.some(v=>!finite(v)))return;
    const timesSame=c.times.every((v,i)=>near(v,other.times[i],tol)),changed=[];for(let i=0;i<c.values.length;i++)if(!near(c.values[i],other.values[i],tol))changed.push(i);
    if(!timesSame||!changed.length)return;
    const changedRatio=changed.length/c.sampleCount,pairScore=clamp(c.score+.12+.12*Math.min(1,changedRatio*2),0,1);c.pairEvidence={supported:true,changedSamples:changed,changedCount:changed.length,changedRatio:Number(changedRatio.toFixed(4)),otherValues:other.values,pairScore:Number(pairScore.toFixed(4)),aName,bName};c.score=Number(pairScore.toFixed(4));c.status=c.score>=.82?'probable':c.status;
  }
  function applyComplexPairEvidence(c,bytes,tol,aName,bName){
    const other=complexAt(bytes,c);if(other.times.some(v=>!finite(v))||other.components.flat().some(v=>!finite(v)))return;
    const timesSame=c.times.every((v,i)=>near(v,other.times[i],tol)),changed=[];
    for(let comp=0;comp<c.componentCount;comp++)for(let i=0;i<c.sampleCount;i++)if(!near(c.components[comp][i],other.components[comp][i],tol))changed.push({component:comp,index:i});
    if(!timesSame||!changed.length)return;
    const total=Math.max(1,c.componentCount*c.sampleCount),changedRatio=changed.length/total,pairScore=clamp(c.score+.12+.12*Math.min(1,changedRatio*3),0,1);c.pairEvidence={supported:true,changed,changedCount:changed.length,changedRatio:Number(changedRatio.toFixed(4)),otherComponents:other.components,pairScore:Number(pairScore.toFixed(4)),aName,bName};c.score=Number(pairScore.toFixed(4));c.status=c.score>=.82?'probable':c.status;
  }
  function comparePair(docA,docB,opts={}){
    const a=bytesFor(docA),b=bytesFor(docB);if(!a||!b)throw new Error('Curve pair discovery requires two parsed PKBs with source bytes.');if(a.length!==b.length)throw new Error('Curve pair discovery currently requires same-size PKBs.');
    const discovery=scanDocument(docA,opts),tol=Number(opts.tolerance)||1e-5,aName=docA.name||'',bName=docB.name||'';
    for(const c of discovery.candidates)applyScalarPairEvidence(c,b,tol,aName,bName);
    for(const c of discovery.complexCandidates||[])applyComplexPairEvidence(c,b,tol,aName,bName);
    discovery.candidates.sort((x,y)=>(y.pairEvidence?.supported?1:0)-(x.pairEvidence?.supported?1:0)||y.score-x.score||x.offset-y.offset);
    discovery.complexCandidates.sort((x,y)=>(y.pairEvidence?.supported?1:0)-(x.pairEvidence?.supported?1:0)||y.score-x.score||x.offset-y.offset);
    discovery.pair={a:{name:aName,hash:docA.sourceHash?.value||''},b:{name:bName,hash:docB.sourceHash?.value||''},sameSize:true};
    discovery.summary.pairSupported=discovery.candidates.filter(x=>x.pairEvidence?.supported).length;discovery.summary.complexPairSupported=discovery.complexCandidates.filter(x=>x.pairEvidence?.supported).length;
    return discovery;
  }
  function candidateEntries(candidate,{channel='',status='probable',note='',fileName=''}={}){
    const ch=CHANNELS.find(x=>x.id===channel);if(!ch)throw new Error('Choose a valid curve channel before promoting a candidate.');if(!candidate?.samples?.length||candidate.samples.length<2)throw new Error('Curve candidate needs at least two samples.');if(!['probable','confirmed'].includes(status))throw new Error('Curve candidate can only be promoted as probable or confirmed.');if(status==='confirmed'&&!text(note).trim())throw new Error('A validation note is required before confirming a curve mapping.');
    return candidate.samples.map((s,i)=>({id:`curve-discovery:${candidate.signature}:${channel}:${i}`,propertyId:`curve:${channel}:${i}`,propertyLabel:`${ch.label} curve sample ${i}`,type:'f32',width:4,contextSignature:candidate.signature,offsets:[s.valueOffset],experimentCount:candidate.pairEvidence?.supported?1:0,fileCount:1,averageScore:Number(candidate.score)||0,status,manualStatus:status,note:text(note),curve:{channel,index:i,time:s.normalizedTime,count:candidate.sampleCount,layout:candidate.layout,candidateId:candidate.id,source:'v5-curve-discovery',role:'value',interpolation:'linear'},experimentIds:[],examples:[{a:fileName||candidate.pairEvidence?.aName||'',b:candidate.pairEvidence?.bName||'',aValue:s.value,bValue:candidate.pairEvidence?.otherValues?.[i],offset:s.valueOffset,offsetHex:s.valueOffsetHex,score:candidate.score}]}));
  }
  function complexCandidateEntries(candidate,{target='',status='probable',note='',fileName=''}={}){
    const cfg=COMPLEX_TARGETS.find(x=>x.id===target);if(!cfg)throw new Error('Choose a valid complex curve target before promoting a candidate.');if(!candidate?.samples?.length||candidate.samples.length<2)throw new Error('Complex curve candidate needs at least two samples.');if(!['probable','confirmed'].includes(status))throw new Error('Complex curve candidate can only be promoted as probable or confirmed.');if(status==='confirmed'&&!text(note).trim())throw new Error('A validation note is required before confirming a complex curve mapping.');
    const requiredComponents=cfg.kind==='vector'?(cfg.channels?.length||3):3;if((candidate.componentCount||0)<requiredComponents)throw new Error(`The selected complex mapping requires at least ${requiredComponents} float components per sample.`);
    const entries=[];
    if(cfg.kind==='vector'){
      cfg.channels.forEach((channel,component)=>{
        const ch=CHANNELS.find(x=>x.id===channel);
        candidate.samples.forEach((s,i)=>entries.push({id:`curve-discovery:${candidate.signature}:${target}:${component}:${i}`,propertyId:`curve:${channel}:${i}`,propertyLabel:`${ch?.label||channel} curve sample ${i}`,type:'f32',width:4,contextSignature:candidate.signature,offsets:[s.componentOffsets[component]],experimentCount:candidate.pairEvidence?.supported?1:0,fileCount:1,averageScore:Number(candidate.score)||0,status,manualStatus:status,note:text(note),curve:{channel,index:i,time:s.normalizedTime,count:candidate.sampleCount,layout:candidate.layout,candidateId:candidate.id,source:'v5-complex-curve-discovery',role:'value',component,group:target,interpolation:'linear'},experimentIds:[],examples:[{a:fileName||candidate.pairEvidence?.aName||'',b:candidate.pairEvidence?.bName||'',aValue:s.componentValues[component],bValue:candidate.pairEvidence?.otherComponents?.[component]?.[i],offset:s.componentOffsets[component],offsetHex:s.componentOffsetHex[component],score:candidate.score}]}));
      });
    }else{
      const channel=cfg.channel,ch=CHANNELS.find(x=>x.id===channel),roles=['value','in-tangent','out-tangent'];
      candidate.samples.forEach((s,i)=>roles.forEach((role,component)=>entries.push({id:`curve-discovery:${candidate.signature}:${target}:${role}:${i}`,propertyId:role==='value'?`curve:${channel}:${i}`:`curve:${channel}:${i}:${role==='in-tangent'?'in':'out'}`,propertyLabel:`${ch?.label||channel} ${role} ${i}`,type:'f32',width:4,contextSignature:candidate.signature,offsets:[s.componentOffsets[component]],experimentCount:candidate.pairEvidence?.supported?1:0,fileCount:1,averageScore:Number(candidate.score)||0,status,manualStatus:status,note:text(note),curve:{channel,index:i,time:s.normalizedTime,count:candidate.sampleCount,layout:candidate.layout,candidateId:candidate.id,source:'v5-complex-curve-discovery',role,component,group:target,interpolation:'hermite'},experimentIds:[],examples:[{a:fileName||candidate.pairEvidence?.aName||'',b:candidate.pairEvidence?.bName||'',aValue:s.componentValues[component],bValue:candidate.pairEvidence?.otherComponents?.[component]?.[i],offset:s.componentOffsets[component],offsetHex:s.componentOffsetHex[component],score:candidate.score}]})));
    }
    return entries;
  }
  function mergeCatalog(catalog,entries=[]){
    const base=catalog&&Array.isArray(catalog.entries)?clone(catalog):{schema:'wc3.effects.pkb-semantic-field-catalog',version:1,updatedAt:'',entries:[],counts:{confirmed:0,probable:0,heuristic:0}},map=new Map((base.entries||[]).map(e=>[e.id,e]));
    for(const e of entries)map.set(e.id,clone(e));
    base.entries=[...map.values()].sort((a,b)=>({confirmed:0,probable:1,heuristic:2}[a.status]??9)-({confirmed:0,probable:1,heuristic:2}[b.status]??9)||text(a.propertyLabel).localeCompare(text(b.propertyLabel)));base.updatedAt=new Date().toISOString();base.counts={confirmed:base.entries.filter(e=>e.status==='confirmed').length,probable:base.entries.filter(e=>e.status==='probable').length,heuristic:base.entries.filter(e=>e.status==='heuristic').length};return base;
  }
  function publicSnapshot(v){return clone(v);}
  function reportText(model){
    if(!model)return'CURVE DISCOVERY v5 · no scan yet.';
    const s=model.summary||{},top=model.candidates?.[0],complex=model.complexCandidates?.[0];
    return[`CURVE DISCOVERY v5`,`Source: ${model.source?.name||'PKB'} · ${(model.source?.scannedBytes||0).toLocaleString()} / ${(model.source?.size||0).toLocaleString()} bytes scanned`,`Scalar candidates: ${s.candidates||0} · probable ${s.probable||0} · pair-supported ${s.pairSupported||0}`,`Complex candidates: ${s.complexCandidates||0} · probable ${s.complexProbable||0} · pair-supported ${s.complexPairSupported||0}`,`Layouts: scalar interleaved ${s.layouts?.interleaved||0} · scalar split ${s.layouts?.split||0} · vector interleaved ${s.layouts?.vectorInterleaved||0} · vector split ${s.layouts?.vectorSplit||0}`,top?`Top scalar: ${top.layout} · ${top.sampleCount} samples · ${top.offsetHex} · score ${top.score}${top.suggestedChannel?` · hint ${top.suggestedChannel}`:''}`:'Top scalar: none',complex?`Top complex: ${complex.layout} · ${complex.sampleCount}×${complex.componentCount} · ${complex.offsetHex} · score ${complex.score}${complex.suggestedTarget?` · hint ${complex.suggestedTarget}`:''}`:'Top complex: none','','Policy: discovery is evidence only. PKB curve writes remain locked until a candidate is manually CONFIRMED with a validation note.'].join('\n');
  }
  return Object.freeze({SCHEMA,VERSION,CHANNELS,COMPLEX_TARGETS,scanDocument,comparePair,candidateEntries,complexCandidateEntries,mergeCatalog,publicSnapshot,reportText,inferChannel,inferComplexTarget,timeQuality,valueQuality});
});
