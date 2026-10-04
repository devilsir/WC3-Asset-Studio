(function(root,factory){
  'use strict';
  let SR=root?.WC3_EFFECTS_PKB_STRUCTURED_READER||null,RD=root?.WC3_EFFECTS_PKB_SEMANTIC_RECORDS||null,PI=root?.WC3_EFFECTS_PKB_INSPECTOR||null,CS=root?.WC3_EFFECTS_PKB_CURVE_STRUCTURE||null,CT=root?.WC3_EFFECTS_PKB_CURVE_TREE||null,BA=root?.WC3_EFFECTS_PKB_BRANCH_AUTHORING||null,SS=root?.WC3_EFFECTS_PKB_STRUCTURAL_SESSION||null;
  if(typeof module==='object'&&module.exports){
    try{SR=SR||require('./effects-pkb-structured-reader.js');}catch(_){}
    try{RD=RD||require('./effects-pkb-semantic-records.js');}catch(_){}
    try{PI=PI||require('./effects-pkb-inspector.js');}catch(_){}
    try{CS=CS||require('./effects-pkb-curve-structure.js');}catch(_){}
    try{CT=CT||require('./effects-pkb-curve-tree.js');}catch(_){}
    try{BA=BA||require('./effects-pkb-branch-authoring.js');}catch(_){}
    try{SS=SS||require('./effects-pkb-structural-session.js');}catch(_){}
    module.exports=factory(null,SR,RD,PI,CS,CT,BA,SS);
  }else if(root)root.WC3_EFFECTS_REAL_EDITOR=factory(root,SR,RD,PI,CS,CT,BA,SS);
})(typeof window!=='undefined'?window:globalThis,function(root,SR,RD,PI,CS,CT,BA,SS){
  'use strict';
  const SCHEMA='wc3.effects.real-editor',VERSION=9;
  const CAPABILITIES=Object.freeze({curveEditor:3,curveDiscovery:4,complexCurves:5,tangentPreview:5,velocityXYZ:5,structuralCurveGraph:6,interpolationWrite:6,structuralTree:7,branchTransactions:7,scopedCurveEditing:7,branchAuthoring:8,templateSynthesis:8,initialCurvePreset:8,structuralSession:9,batchSessionCompile:9,virtualBranchEditing:9});
  const COMMON=Object.freeze([
    ['size','Size','Emitter'],['life-span','Life span','Emitter'],['emission-rate','Emission rate','Emitter'],['speed','Speed','Emitter'],
    ['gravity','Gravity','Emitter'],['drag','Drag','Emitter'],['spread','Spread','Emitter'],
    ['alpha','Alpha','Renderer'],['rotation','Rotation','Renderer'],['scale-x','Scale X','Renderer'],['scale-y','Scale Y','Renderer'],
    ['color-r','Color R','Renderer'],['color-g','Color G','Renderer'],['color-b','Color B','Renderer']
  ]);
  const PRESETS=Object.freeze([
    Object.freeze({id:'custom',label:'Custom',motion:'source',factors:{}}),
    Object.freeze({id:'source',label:'Source values',motion:'source',reset:true,factors:{}}),
    Object.freeze({id:'soft-glow',label:'Soft Glow',motion:'source',factors:{size:1.35,'life-span':1.15,alpha:.72,'emission-rate':.82}}),
    Object.freeze({id:'burst',label:'Fast Burst',motion:'linear',factors:{size:.86,'life-span':.64,'emission-rate':2.4,speed:1.4,alpha:1}}),
    Object.freeze({id:'orbit-halo',label:'Orbit Halo',motion:'orbit',factors:{size:.9,'life-span':1.35,'emission-rate':1.45,speed:.78,alpha:.86}})
  ]);
  const CURVE_CHANNELS=Object.freeze([
    Object.freeze({id:'size',label:'Size',min:0,max:3,unit:'×'}),
    Object.freeze({id:'alpha',label:'Alpha',min:0,max:1,unit:'×'}),
    Object.freeze({id:'velocity',label:'Velocity',min:0,max:3,unit:'×'}),
    Object.freeze({id:'velocity-x',label:'Velocity X',min:0,max:3,unit:'×'}),
    Object.freeze({id:'velocity-y',label:'Velocity Y',min:0,max:3,unit:'×'}),
    Object.freeze({id:'velocity-z',label:'Velocity Z',min:0,max:3,unit:'×'}),
    Object.freeze({id:'color-r',label:'Color R',min:0,max:1,unit:'×'}),
    Object.freeze({id:'color-g',label:'Color G',min:0,max:1,unit:'×'}),
    Object.freeze({id:'color-b',label:'Color B',min:0,max:1,unit:'×'})
  ]);
  const CURVE_INTERPOLATIONS=Object.freeze([Object.freeze({id:'linear',label:'Linear'}),Object.freeze({id:'step',label:'Step'}),Object.freeze({id:'hermite',label:'Hermite'})]);
  const CURVE_PRESETS=Object.freeze([
    Object.freeze({id:'flat',label:'Flat',points:[[0,1],[1,1]]}),
    Object.freeze({id:'fade-in',label:'Fade In',points:[[0,0],[.28,.32],[.65,.78],[1,1]]}),
    Object.freeze({id:'fade-out',label:'Fade Out',points:[[0,1],[.35,.86],[.72,.36],[1,0]]}),
    Object.freeze({id:'bell',label:'Bell',points:[[0,0],[.18,.55],[.42,1],[.62,.92],[.82,.38],[1,0]]}),
    Object.freeze({id:'pulse',label:'Pulse',points:[[0,.15],[.12,1],[.3,.28],[.5,1],[.7,.28],[.88,1],[1,.12]]}),
    Object.freeze({id:'grow',label:'Grow',points:[[0,.2],[.3,.45],[.7,1],[1,1.55]]}),
    Object.freeze({id:'shrink',label:'Shrink',points:[[0,1.55],[.3,1.2],[.72,.55],[1,.08]]})
  ]);
  const commonMap=new Map(COMMON.map(x=>[x[0],{id:x[0],label:x[1],recordType:x[2]}]));
  const curveMap=new Map(CURVE_CHANNELS.map(x=>[x.id,x]));
  const text=v=>String(v??'');
  const safe=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanUiVersion=v=>text(v).replace(/\bv\d+\b/gi,'').replace(/[ \t]{2,}/g,' ').replace(/ +\n/g,'\n').trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const hex=n=>'0x'+Math.max(0,Number(n)||0).toString(16).padStart(8,'0');
  const encodedLength=(s,encoding='ascii')=>String(encoding).toLowerCase().includes('utf16')?text(s).length*2:text(s).length;
  const sameNumber=(a,b)=>Object.is(Number(a),Number(b))||Math.abs(Number(a)-Number(b))<=1e-9;
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function offsetsForEntry(entry,fileName=''){
    const name=text(fileName).toLowerCase(),hits=[];
    if(name)for(const ex of entry?.examples||[])if(text(ex.a).toLowerCase()===name||text(ex.b).toLowerCase()===name)hits.push(Number(ex.offset));
    const rows=hits.length?hits:(entry?.offsets||[]).map(Number);
    return [...new Set(rows.filter(Number.isInteger))].sort((a,b)=>a-b);
  }
  function normalizeCurveChannel(v){
    const s=text(v).toLowerCase().replace(/_/g,'-').replace(/\./g,'-');
    if(s==='colorr'||s==='color-r'||s==='r')return'color-r';
    if(s==='colorg'||s==='color-g'||s==='g')return'color-g';
    if(s==='colorb'||s==='color-b'||s==='b')return'color-b';
    if(s==='speed')return'velocity';
    if(['velocityx','velocity-x','speedx','speed-x','x-velocity'].includes(s))return'velocity-x';
    if(['velocityy','velocity-y','speedy','speed-y','y-velocity'].includes(s))return'velocity-y';
    if(['velocityz','velocity-z','speedz','speed-z','z-velocity'].includes(s))return'velocity-z';
    return curveMap.has(s)?s:'';
  }
  function curveEntryMeta(entry){
    const raw=entry?.curve||entry?.metadata?.curve||null;
    let channel=normalizeCurveChannel(raw?.channel||raw?.property||''),index=Number(raw?.index),time=num(raw?.time),count=Number(raw?.count),role=text(raw?.role||'value').toLowerCase(),interpolation=text(raw?.interpolation||'').toLowerCase();
    if(!channel){
      const id=text(entry?.propertyId||entry?.id||'').toLowerCase();
      const m=id.match(/(?:^|[:._-])curve[:._-]?(size|alpha|velocity(?:[-_.]?[xyz])?|speed|color[-_.]?[rgb])[:._-]?(\d+)(?:[:._-]?(in|out|in-tangent|out-tangent))?(?:$|[:._-])/i)||id.match(/^(size|alpha|velocity(?:[-_.]?[xyz])?|speed|color[-_.]?[rgb])[-_.]?over[-_.]?life[-_.]?(\d+)$/i);
      if(m){channel=normalizeCurveChannel(m[1]);index=Number(m[2]);if(m[3])role=/^in/.test(m[3])?'in-tangent':'out-tangent';}
    }
    if(!channel||!Number.isInteger(index)||index<0)return null;
    if(!['value','in-tangent','out-tangent'].includes(role))role='value';
    if(!Number.isFinite(time))time=null;
    if(!Number.isInteger(count)||count<2)count=null;
    if(!['linear','step','hermite'].includes(interpolation))interpolation=role==='value'?'':'hermite';
    const candidateId=text(raw?.candidateId||''),group=text(raw?.group||''),layout=text(raw?.layout||''),groupKey=group||candidateId||`${channel}:${layout||'curve'}`;return{channel,index,time,count,role,interpolation,candidateId,group,layout,groupKey};
  }
  function isCurveEntry(entry){return!!curveEntryMeta(entry);}
  function normalizeCurvePoints(points,channelId='size'){
    const ch=curveMap.get(channelId)||CURVE_CHANNELS[0],rows=[];
    for(const p of points||[]){
      const t=num(Array.isArray(p)?p[0]:p?.t),v=num(Array.isArray(p)?p[1]:p?.v),tin=num(Array.isArray(p)?null:p?.in),tout=num(Array.isArray(p)?null:p?.out);
      if(t==null||v==null)continue;
      rows.push({t:clamp(t,0,1),v:clamp(v,ch.min,ch.max),...(tin!=null?{in:tin}:{}),...(tout!=null?{out:tout}:{})});
    }
    rows.sort((a,b)=>a.t-b.t);
    const out=[];
    for(const p of rows){const last=out[out.length-1];if(last&&Math.abs(last.t-p.t)<1e-6)out[out.length-1]=p;else out.push(p);}
    if(!out.length)return[{t:0,v:1},{t:1,v:1}];
    if(out.length===1)return[{t:0,v:out[0].v,in:out[0].in,out:out[0].out},{t:1,v:out[0].v,in:out[0].in,out:out[0].out}];
    if(out[0].t>0)out.unshift({t:0,v:out[0].v,in:out[0].in,out:out[0].out});else out[0].t=0;
    if(out[out.length-1].t<1){const q=out[out.length-1];out.push({t:1,v:q.v,in:q.in,out:q.out});}else out[out.length-1].t=1;
    return out;
  }
  function sampleCurve(points,t,channelId='size',mode='linear'){
    const rows=normalizeCurvePoints(points,channelId),x=clamp(Number(t)||0,0,1),kind=['linear','step','hermite'].includes(mode)?mode:'linear';
    if(x<=rows[0].t)return rows[0].v;
    for(let i=1;i<rows.length;i++)if(x<=rows[i].t){
      const a=rows[i-1],b=rows[i],d=Math.max(1e-9,b.t-a.t),u=(x-a.t)/d;
      if(kind==='step')return a.v;
      if(kind==='hermite'){
        const slope=(b.v-a.v)/d,m0=Number.isFinite(Number(a.out))?Number(a.out):slope,m1=Number.isFinite(Number(b.in))?Number(b.in):slope,u2=u*u,u3=u2*u,h00=2*u3-3*u2+1,h10=u3-2*u2+u,h01=-2*u3+3*u2,h11=u3-u2;
        return h00*a.v+h10*m0*d+h01*b.v+h11*m1*d;
      }
      return a.v+(b.v-a.v)*u;
    }
    return rows[rows.length-1].v;
  }
  function curvePresetPoints(channelId,presetId='flat'){
    const p=CURVE_PRESETS.find(x=>x.id===presetId)||CURVE_PRESETS[0];
    return normalizeCurvePoints(p.points.map(x=>({t:x[0],v:x[1]})),channelId);
  }
  function curvesEqual(a,b,channelId='size'){
    const x=normalizeCurvePoints(a,channelId),y=normalizeCurvePoints(b,channelId);
    if(x.length!==y.length)return false;
    return x.every((p,i)=>Math.abs(p.t-y[i].t)<=1e-6&&Math.abs(p.v-y[i].v)<=1e-6&&(p.in==null&&y[i].in==null||sameNumber(p.in,y[i].in))&&(p.out==null&&y[i].out==null||sameNumber(p.out,y[i].out)));
  }
  function curveBindings(doc,catalog,fileName=''){
    if(!SR?.readScalar)return[];
    const out=[];
    for(const entry of catalog?.entries||[]){
      if(entry?.status!=='confirmed')continue;
      const meta=curveEntryMeta(entry);
      if(!meta)continue;
      const offsets=offsetsForEntry(entry,fileName),type=text(entry.type),width=Number(entry.width)||({u8:1,u16:2,u32:4,i32:4,f32:4}[type]||0);
      for(let j=0;j<offsets.length;j++){
        const offset=Number(offsets[j]),index=meta.index+j;
        if(!width||offset<0||offset+width>Number(doc?.size||0))continue;
        let value;
        try{value=SR.readScalar(doc,offset,type);}catch(_){continue;}
        let time=meta.time;
        if(time==null&&meta.count)time=clamp(index/Math.max(1,meta.count-1),0,1);
        out.push({id:`curve:${meta.channel}:${index}:${meta.role}:${type}:${offset}`,channel:meta.channel,index,time,role:meta.role||'value',interpolation:meta.interpolation||'',groupKey:meta.groupKey||'',candidateId:meta.candidateId||'',group:meta.group||'',layout:meta.layout||'',type,width,offset,offsetHex:hex(offset),value,evidenceStatus:'confirmed',validationNote:entry.note||'',sourceEntryId:entry.id||entry.propertyId||''});
      }
    }
    const groups=new Map();
    for(const b of out){if(!groups.has(b.channel))groups.set(b.channel,[]);groups.get(b.channel).push(b);}
    for(const rows of groups.values()){
      rows.sort((a,b)=>a.index-b.index||a.offset-b.offset);
      const maxIndex=Math.max(...rows.map(x=>x.index));
      for(let i=0;i<rows.length;i++)if(rows[i].time==null)rows[i].time=maxIndex>0?clamp(rows[i].index/maxIndex,0,1):(rows.length>1?i/(rows.length-1):0);
    }
    return out.sort((a,b)=>a.channel.localeCompare(b.channel)||a.time-b.time||a.offset-b.offset);
  }
  function interpolationEntryMeta(entry){
    const m=entry?.curveInterpolation||entry?.metadata?.curveInterpolation||null;if(!m)return null;const channel=normalizeCurveChannel(m.channel||'');if(!channel)return null;const map=m.mapping&&typeof m.mapping==='object'?m.mapping:{};return{channel,recordId:text(m.recordId||''),relativeOffset:num(m.relativeOffset),mapping:{linear:Number(map.linear),step:Number(map.step),hermite:Number(map.hermite)}};
  }
  function isInterpolationEntry(entry){return!!interpolationEntryMeta(entry);}
  function curveModeBindings(doc,catalog,fileName=''){
    if(!SR?.readScalar)return[];const out=[];for(const entry of catalog?.entries||[]){if(entry?.status!=='confirmed')continue;const meta=interpolationEntryMeta(entry);if(!meta)continue;const type=text(entry.type),width=Number(entry.width)||({u8:1,u16:2,u32:4,i32:4,f32:4}[type]||0);for(const offset of offsetsForEntry(entry,fileName)){if(!width||offset<0||offset+width>Number(doc?.size||0))continue;let value;try{value=SR.readScalar(doc,offset,type);}catch(_){continue;}const mode=['linear','step','hermite'].find(x=>Number(meta.mapping[x])===Number(value))||'';out.push({id:`curve-mode:${meta.channel}:${type}:${offset}`,channel:meta.channel,recordId:meta.recordId,type,width,offset,offsetHex:hex(offset),value,mode,mapping:clone(meta.mapping),evidenceStatus:'confirmed',validationNote:entry.note||'',sourceEntryId:entry.id||entry.propertyId||''});}}return out.sort((a,b)=>a.channel.localeCompare(b.channel)||a.offset-b.offset);
  }
  function curveSourcesFromBindings(bindings){
    const out={};
    for(const ch of CURVE_CHANNELS){
      const rows=(bindings||[]).filter(x=>x.channel===ch.id&&x.role==='value').sort((a,b)=>a.time-b.time||a.index-b.index),ins=new Map((bindings||[]).filter(x=>x.channel===ch.id&&x.role==='in-tangent').map(x=>[x.index,x.value])),outs=new Map((bindings||[]).filter(x=>x.channel===ch.id&&x.role==='out-tangent').map(x=>[x.index,x.value]));
      out[ch.id]=rows.length>=2?normalizeCurvePoints(rows.map(x=>({t:x.time,v:x.value,...(ins.has(x.index)?{in:ins.get(x.index)}:{}),...(outs.has(x.index)?{out:outs.get(x.index)}:{})})),ch.id):curvePresetPoints(ch.id,'flat');
    }
    return out;
  }
  function curveModesFromBindings(bindings,modeBindings=[]){
    const out={};
    for(const ch of CURVE_CHANNELS){const mode=(modeBindings||[]).find(x=>x.channel===ch.id&&['linear','step','hermite'].includes(x.mode))?.mode,rows=(bindings||[]).filter(x=>x.channel===ch.id),explicit=rows.map(x=>x.interpolation).find(x=>['linear','step','hermite'].includes(x));out[ch.id]=mode||explicit||(rows.some(x=>x.role==='in-tangent'||x.role==='out-tangent')?'hermite':'linear');}
    return out;
  }
  function flatFields(doc,catalog,fileName=''){
    if(!SR?.readScalar)return[];
    const out=[];
    for(const entry of catalog?.entries||[]){
      if(entry?.status!=='confirmed'||isCurveEntry(entry))continue;
      for(const offset of offsetsForEntry(entry,fileName)){
        const type=text(entry.type),width=Number(entry.width)||({u8:1,u16:2,u32:4,i32:4,f32:4}[type]||0);
        if(!width||offset<0||offset+width>Number(doc?.size||0))continue;
        let value;
        try{value=SR.readScalar(doc,offset,type);}catch(_){continue;}
        const c=commonMap.get(entry.propertyId)||{id:entry.propertyId||'custom',label:entry.propertyLabel||entry.propertyId||'Custom field',recordType:'Unknown'};
        out.push({id:`field:${entry.propertyId}:${type}:${offset}`,propertyId:entry.propertyId||'custom',propertyLabel:entry.propertyLabel||c.label,type,width,offset,offsetHex:hex(offset),value,evidenceStatus:'confirmed',validationNote:entry.note||'',recordType:c.recordType,recordId:'',recordLabel:'Un-grouped confirmed field'});
      }
    }
    return out;
  }
  function semanticFields(doc,catalog,fileName=''){
    const filtered={...(catalog||{}),entries:(catalog?.entries||[]).filter(e=>!isCurveEntry(e)&&!isInterpolationEntry(e))};
    if(!RD?.buildRecords||!filtered.entries.some(e=>e.status==='confirmed'))return{records:[],fields:flatFields(doc,filtered,fileName)};
    let model=null;
    try{model=RD.buildRecords(doc,filtered,{fileName});}catch(_){return{records:[],fields:flatFields(doc,filtered,fileName)}}
    const fields=[];
    for(const r of model.records||[])for(const f of r.fields||[])fields.push({...f,recordId:r.id,recordLabel:r.label,recordStatus:r.status});
    return{records:(model.records||[]).map(r=>({id:r.id,type:r.type,label:r.label,status:r.status,offset:r.range?.offset||0,end:r.range?.end||0,fieldCount:r.fieldCount||0})),fields};
  }
  function textureRows(doc,inspection){
    const deps=(inspection?.dependencies||doc?.dependencies||[]).filter(d=>d.kind==='texture'),records=doc?.records||[],out=[];
    for(const d of deps){
      const exact=records.filter(r=>r.type==='string'&&r.kind==='dependency-string'&&text(r.text).toLowerCase()===text(d.path).toLowerCase());
      if(exact.length){
        for(const r of exact)out.push({id:r.id,path:d.path,offset:r.offset,encoding:r.encoding||'ascii',byteLength:encodedLength(r.text,r.encoding),record:{...r},writable:true});
      }else{
        for(const offset of d.offsets||[])out.push({id:`dep-${offset}`,path:d.path,offset,encoding:'unknown',byteLength:null,record:null,writable:false});
      }
    }
    return out;
  }
  function buildModel({doc,catalog,inspection,name}={}){
    if(!doc)return{schema:SCHEMA,version:VERSION,ready:false,name:'',records:[],fields:[],textures:[],curveBindings:[],curveModeBindings:[],curveSources:curveSourcesFromBindings([]),curveModes:curveModesFromBindings([],[]),summary:{fields:0,common:0,records:0,textures:0,confirmedCatalog:0,curveBindings:0,curveChannels:0,curveModeBindings:0}};
    const sem=semanticFields(doc,catalog,name||doc.name||''),textures=textureRows(doc,inspection),bindings=curveBindings(doc,catalog,name||doc.name||''),modeBindings=curveModeBindings(doc,catalog,name||doc.name||''),sources=curveSourcesFromBindings(bindings),modes=curveModesFromBindings(bindings,modeBindings),fields=sem.fields.map(f=>{
      const c=commonMap.get(f.propertyId);
      return{...f,propertyLabel:f.propertyLabel||c?.label||f.propertyId,recordType:f.recordType||c?.recordType||'Unknown',common:!!c};
    });
    return{schema:SCHEMA,version:VERSION,ready:true,name:name||doc.name||'',sourceHash:doc.sourceHash?.value||'',size:doc.size||0,records:sem.records,fields,textures,curveBindings:bindings,curveModeBindings:modeBindings,curveSources:sources,curveModes:modes,summary:{fields:fields.length,common:fields.filter(f=>f.common).length,records:sem.records.length,textures:textures.length,confirmedCatalog:(catalog?.entries||[]).filter(e=>e.status==='confirmed').length,curveBindings:bindings.length,curveChannels:new Set(bindings.map(x=>x.channel)).size,curveModeBindings:modeBindings.length},notes:['Numeric PKB writes are allowed only for CONFIRMED semantic field mappings.','Texture replacement is limited to exact dependency strings with identical byte length.','Curve writes require CONFIRMED per-sample curve mappings; interpolation writes additionally require a CONFIRMED enum mapping.','Unknown bytes remain untouched.']};
  }
  function scopeModel(model,scopeKey='',recordId=''){
    if(!model||!scopeKey)return model;const bindings=(model.curveBindings||[]).filter(x=>x.groupKey===scopeKey),modeBindings=(model.curveModeBindings||[]).filter(x=>!recordId||x.recordId===recordId),sources=curveSourcesFromBindings(bindings),modes=curveModesFromBindings(bindings,modeBindings);return{...model,curveBindings:bindings,curveModeBindings:modeBindings,curveSources:sources,curveModes:modes,summary:{...(model.summary||{}),curveBindings:bindings.length,curveChannels:new Set(bindings.map(x=>x.channel)).size,curveModeBindings:modeBindings.length}};
  }
  function sourceValues(model){
    const out={};
    for(const f of model?.fields||[])out[f.id]=String(f.value);
    return out;
  }
  function sourceCurves(model){
    const out={};
    for(const ch of CURVE_CHANNELS)out[ch.id]=normalizeCurvePoints(model?.curveSources?.[ch.id]||curvePresetPoints(ch.id,'flat'),ch.id);
    return out;
  }
  function sourceCurveModes(model){
    const out={};
    for(const ch of CURVE_CHANNELS){const m=text(model?.curveModes?.[ch.id]||'linear').toLowerCase();out[ch.id]=['linear','step','hermite'].includes(m)?m:'linear';}
    return out;
  }
  function pointForBinding(points,binding,channelId){
    const rows=normalizeCurvePoints(points,channelId),exact=Number.isFinite(Number(binding.time))?rows.reduce((best,p)=>!best||Math.abs(p.t-binding.time)<Math.abs(best.t-binding.time)?p:best,null):rows[Math.max(0,Math.min(rows.length-1,binding.index))];
    return exact||rows[Math.max(0,Math.min(rows.length-1,binding.index))]||null;
  }
  function buildCurveChangeSet(model,curves={},curveModes={}){
    const sources=sourceCurves(model),sourceModes=sourceCurveModes(model),channels=[],writes=[],modeWrites=[],previewOnly=[];
    for(const ch of CURVE_CHANNELS){
      const src=sources[ch.id],draft=normalizeCurvePoints(curves?.[ch.id]||src,ch.id),mode=['linear','step','hermite'].includes(curveModes?.[ch.id])?curveModes[ch.id]:sourceModes[ch.id],curveChanged=!curvesEqual(src,draft,ch.id),modeChanged=mode!==sourceModes[ch.id];
      if(!curveChanged&&!modeChanged)continue;
      const bindings=(model?.curveBindings||[]).filter(x=>x.channel===ch.id).sort((a,b)=>a.index-b.index||a.offset-b.offset),values=bindings.filter(x=>x.role==='value'),tangents=bindings.filter(x=>x.role!=='value'),modeBindings=(model?.curveModeBindings||[]).filter(x=>x.channel===ch.id),writable=values.length>=2,modeWritable=modeChanged&&modeBindings.length>0&&modeBindings.every(x=>Number.isInteger(Number(x.mapping?.[mode])));
      const row={channel:ch.id,label:ch.label,source:src,draft,mode,sourceMode:sourceModes[ch.id],modeChanged,modeWritable,modeBindingCount:modeBindings.length,points:draft.length,writable,bindingCount:bindings.length,valueBindings:values.length,tangentBindings:tangents.length,writes:0,modeWrites:0};
      if(writable&&curveChanged){
        for(const b of values){
          const value=sampleCurve(draft,b.time,ch.id,mode);
          if(sameNumber(value,b.value))continue;
          writes.push({kind:'curve',role:'value',channel:ch.id,label:ch.label,bindingId:b.id,before:Number(b.value),after:value,type:b.type,width:b.width,offset:b.offset,offsetHex:b.offsetHex,time:b.time,index:b.index});
          row.writes++;
        }
        if(mode==='hermite')for(const b of tangents){
          const p=pointForBinding(draft,b,ch.id),key=b.role==='in-tangent'?'in':'out',value=num(p?.[key]);
          if(value==null||sameNumber(value,b.value))continue;
          writes.push({kind:'curve',role:b.role,channel:ch.id,label:`${ch.label} ${b.role}`,bindingId:b.id,before:Number(b.value),after:value,type:b.type,width:b.width,offset:b.offset,offsetHex:b.offsetHex,time:b.time,index:b.index});
          row.writes++;
        }
      }
      if(modeWritable)for(const b of modeBindings){const value=Number(b.mapping[mode]);if(sameNumber(value,b.value))continue;modeWrites.push({kind:'curve-mode',channel:ch.id,label:`${ch.label} interpolation`,bindingId:b.id,before:Number(b.value),after:value,beforeMode:b.mode||sourceModes[ch.id],afterMode:mode,type:b.type,width:b.width,offset:b.offset,offsetHex:b.offsetHex});row.modeWrites++;}
      if(!writable||(modeChanged&&!modeWritable)||(mode==='hermite'&&curveChanged&&tangents.length<2))previewOnly.push(ch.id);
      channels.push(row);
    }
    return{channels,writes,modeWrites,previewOnly,summary:{changedChannels:channels.length,mappedChannels:channels.filter(x=>x.writable).length,previewOnlyChannels:new Set(previewOnly).size,writes:writes.length,modeWrites:modeWrites.length,modeChanges:channels.filter(x=>x.modeChanged).length,writableModeChanges:channels.filter(x=>x.modeChanged&&x.modeWritable).length,tangentWrites:writes.filter(x=>x.role!=='value').length}};
  }
  function buildChangeSet(model,values={},textureId='',texturePath='',curves={},curveModes={}){
    const scalars=[],invalid=[];
    for(const f of model?.fields||[]){
      const raw=Object.prototype.hasOwnProperty.call(values,f.id)?values[f.id]:String(f.value),next=num(raw);
      if(next==null){invalid.push({kind:'scalar',fieldId:f.id,propertyId:f.propertyId,label:f.propertyLabel,value:raw,reason:'Value must be a finite number.'});continue;}
      if(!sameNumber(f.value,next))scalars.push({kind:'scalar',fieldId:f.id,propertyId:f.propertyId,label:f.propertyLabel,before:Number(f.value),after:next,type:f.type,width:f.width,offset:f.offset,offsetHex:hex(f.offset),recordId:f.recordId||'',recordLabel:f.recordLabel||''});
    }
    const row=(model?.textures||[]).find(x=>x.id===textureId)||null,replacement=text(texturePath).trim(),textureChanged=!!row&&replacement!==text(row.path);
    let texture=null;
    if(row&&textureChanged){
      const beforeBytes=row.writable?Number(row.byteLength||0):null,afterBytes=row.writable?encodedLength(replacement,row.encoding):null,safeWrite=!!row.writable&&!!replacement&&beforeBytes===afterBytes;
      texture={kind:'texture',textureId:row.id,before:row.path,after:replacement,offset:row.offset,offsetHex:hex(row.offset),encoding:row.encoding,beforeBytes,afterBytes,writable:!!row.writable,binarySafe:safeWrite,previewOnly:!safeWrite,reason:!replacement?'Texture path is empty.':!row.writable?'Exact dependency string encoding is not confirmed.':beforeBytes!==afterBytes?`Binary replacement requires ${beforeBytes} bytes; draft uses ${afterBytes}.`:''};
      if(!replacement)invalid.push({...texture,reason:'Texture path is empty.'});
    }
    const curveChanges=buildCurveChangeSet(model,curves,curveModes),binaryDirty=scalars.length+(texture?.binarySafe?1:0)+curveChanges.writes.length+curveChanges.modeWrites.length,previewOnly=(texture?.previewOnly?1:0)+curveChanges.summary.previewOnlyChannels,dirty=scalars.length+(texture?1:0)+curveChanges.summary.changedChannels;
    return{schema:'wc3.effects.real-editor-change-set',version:VERSION,scalars,texture,curves:curveChanges,invalid,summary:{scalarChanges:scalars.length,textureChanges:texture?1:0,curveChanges:curveChanges.summary.changedChannels,curveWrites:curveChanges.writes.length,curveModeWrites:curveChanges.modeWrites.length,dirty,binaryDirty,invalid:invalid.length,binarySafe:binaryDirty>0&&invalid.length===0&&(!texture||texture.binarySafe),previewOnly}};
  }
  function scalarEdits(model,values={}){
    const changes=buildChangeSet(model,values);
    return changes.scalars.map(c=>{
      const f=(model?.fields||[]).find(x=>x.id===c.fieldId);
      return{kind:'scalar',candidate:{signature:`real-editor:${f.propertyId}:${f.offset}`,type:f.type,width:f.width,offset:f.offset,evidenceStatus:'confirmed',aValue:f.value},expected:f.value,value:c.after,fieldId:f.id,propertyId:f.propertyId,label:f.propertyLabel};
    });
  }
  function curveEdits(model,curves={},curveModes={}){
    const c=buildCurveChangeSet(model,curves,curveModes);
    return c.writes.map(w=>{
      const b=(model?.curveBindings||[]).find(x=>x.id===w.bindingId);
      return{kind:'scalar',editKind:'curve',candidate:{signature:`real-editor-curve:${w.channel}:${w.index}:${w.role||'value'}:${w.offset}`,type:w.type,width:w.width,offset:w.offset,evidenceStatus:'confirmed',aValue:b?.value??w.before},expected:b?.value??w.before,value:w.after,channel:w.channel,label:w.label,time:w.time,index:w.index,role:w.role||'value'};
    });
  }
  function curveModeEdits(model,curves={},curveModes={}){
    const c=buildCurveChangeSet(model,curves,curveModes);
    return c.modeWrites.map(w=>{const b=(model?.curveModeBindings||[]).find(x=>x.id===w.bindingId);return{kind:'scalar',editKind:'curve-mode',candidate:{signature:`real-editor-curve-mode:${w.channel}:${w.offset}`,type:w.type,width:w.width,offset:w.offset,evidenceStatus:'confirmed',aValue:b?.value??w.before},expected:b?.value??w.before,value:w.after,channel:w.channel,label:w.label,beforeMode:w.beforeMode,afterMode:w.afterMode};});
  }
  function exactDependencyRecord(doc,row){
    if(!row)return null;
    return(doc?.records||[]).find(r=>r.type==='string'&&Number(r.offset)===Number(row.offset)&&text(r.text)===text(row.path))||row.record||null;
  }
  function validatePatchResult(doc,model,result,changes){
    const checks=[];
    const add=(id,label,ok,detail='')=>checks.push({id,label,ok:!!ok,detail:text(detail)});
    add('source-hash','Source hash unchanged',!!model?.sourceHash&&model.sourceHash===doc?.sourceHash?.value,model?.sourceHash||'missing');
    add('source-size','Source size matches editor model',Number(model?.size)===Number(doc?.size),`${model?.size||0} B`);
    add('output-size','Output size preserved',Number(result?.next?.size)===Number(doc?.size),`${result?.next?.size||0} B`);
    add('unknown-regions','Unknown regions untouched',Number(result?.diff?.outsideMappedRegions||0)===0,`${result?.diff?.outsideMappedRegions||0} outside`);
    add('mapped-scalars','All scalar writes mapped',Number(result?.scalarPlan?.operations?.length||0)===Number(changes?.scalars?.length||0),`${result?.scalarPlan?.operations?.length||0}/${changes?.scalars?.length||0}`);
    add('mapped-curves','All curve sample writes mapped',Number(result?.curvePlan?.operations?.length||0)===Number(changes?.curves?.writes?.length||0),`${result?.curvePlan?.operations?.length||0}/${changes?.curves?.writes?.length||0}`);
    add('mapped-curve-modes','All interpolation enum writes mapped',Number(result?.curveModePlan?.operations?.length||0)===Number(changes?.curves?.modeWrites?.length||0),`${result?.curveModePlan?.operations?.length||0}/${changes?.curves?.modeWrites?.length||0}`);
    add('curve-preview-only','Unmapped curve drafts excluded safely',true,`${changes?.curves?.summary?.previewOnlyChannels||0} preview-only channel(s)`);
    add('texture-width','Texture width safe',!changes?.texture||changes.texture.binarySafe,changes?.texture?`${changes.texture.beforeBytes} → ${changes.texture.afterBytes} B`:'unchanged');
    const safe=checks.every(c=>c.ok)&&!!result?.safe;
    return{schema:'wc3.effects.real-editor-validation',version:VERSION,safe,status:safe?'SAFE':'BLOCKED',checks,summary:{pass:checks.filter(c=>c.ok).length,fail:checks.filter(c=>!c.ok).length,total:checks.length}};
  }
  function applyEdits(doc,model,{values={},textureId='',texturePath='',curves={},curveModes={}}={}){
    if(!(doc?._sourceBytes instanceof Uint8Array))throw new Error('Open or inspect a real PKB before previewing edits.');
    if(!SR?.createPatchPlan||!SR?.applyPatchPlan||!SR?.diffAgainst)throw new Error('Structured PKB writer is unavailable.');
    const changes=buildChangeSet(model,values,textureId,texturePath,curves,curveModes);
    if(changes.invalid.length)throw new Error(changes.invalid[0].reason||'One or more edits are invalid.');
    if(changes.texture?.previewOnly)throw new Error(changes.texture.reason||'Texture replacement is preview-only.');
    const scalarOps=scalarEdits(model,values),curveOps=curveEdits(model,curves,curveModes),curveModeOps=curveModeEdits(model,curves,curveModes),numericOps=[...scalarOps,...curveOps,...curveModeOps];
    let next=doc,numericPlan=null,scalarPlan=null,curvePlan=null,curveModePlan=null,texturePatch=null,allowed=[];
    if(numericOps.length){
      numericPlan=SR.createPatchPlan(doc,numericOps);
      next=SR.applyPatchPlan(doc,numericPlan,{requireStatus:'confirmed'});
      const scalarOffsets=new Set(scalarOps.map(x=>Number(x.candidate.offset))),curveOffsets=new Set(curveOps.map(x=>Number(x.candidate.offset))),curveModeOffsets=new Set(curveModeOps.map(x=>Number(x.candidate.offset)));
      scalarPlan={...numericPlan,operations:numericPlan.operations.filter(x=>scalarOffsets.has(Number(x.offset)))};
      curvePlan={...numericPlan,operations:numericPlan.operations.filter(x=>curveOffsets.has(Number(x.offset)))};
      curveModePlan={...numericPlan,operations:numericPlan.operations.filter(x=>curveModeOffsets.has(Number(x.offset)))};
      allowed.push(...numericPlan.operations.map(x=>({offset:x.offset,end:x.offset+x.width,kind:curveModeOffsets.has(Number(x.offset))?'curve-mode':curveOffsets.has(Number(x.offset))?'curve':'scalar'})));
    }
    if(changes.texture?.binarySafe){
      const row=(model?.textures||[]).find(x=>x.id===textureId);
      if(!row)throw new Error('Selected texture dependency is no longer available.');
      const record=exactDependencyRecord(next,row);
      if(!record)throw new Error('Exact dependency string record was not found.');
      next=SR.patchStringSameLength(next,{...record,evidenceStatus:'confirmed'},changes.texture.after,{requireStatus:'confirmed'});
      texturePatch={offset:row.offset,before:row.path,after:changes.texture.after,encoding:row.encoding,bytes:changes.texture.beforeBytes};
      allowed.push({offset:row.offset,end:row.offset+changes.texture.beforeBytes,kind:'texture'});
    }
    if(!numericOps.length&&!texturePatch)throw new Error(changes.curves.summary.changedChannels?'Curve drafts are preview-only until their PKB sample layout is confirmed.':'No binary-mapped field changed.');
    const diff=SR.diffAgainst(doc,next._sourceBytes),outside=(diff.regions||[]).filter(r=>!allowed.some(a=>r.offset>=a.offset&&r.end<=a.end));
    if(outside.length)throw new Error(`Safety verification failed: ${outside.length} changed region(s) fall outside mapped fields.`);
    const exactSize=next.size===doc.size,result={schema:'wc3.effects.real-editor-patch',version:VERSION,sourceHash:doc.sourceHash?.value||'',sourceSize:doc.size,numericPlan,scalarPlan,curvePlan,curveModePlan,texturePatch,allowed,diff:{...diff,outsideMappedRegions:outside.length},safe:exactSize&&!outside.length,next,changes};
    result.validation=validatePatchResult(doc,model,result,changes);
    if(!result.validation.safe)throw new Error(`Patch validation blocked export: ${result.validation.summary.fail} safety check(s) failed.`);
    return result;
  }
  function previewOverrides(model,values={},motion='source',texturePath='',curves={},curveModes={}){
    const byProp={};
    for(const f of model?.fields||[]){
      if(Object.prototype.hasOwnProperty.call(values,f.id)){
        const v=num(values[f.id]);
        if(v!=null&&!(f.propertyId in byProp))byProp[f.propertyId]=v;
      }
    }
    const curvePayload={};
    for(const ch of CURVE_CHANNELS){const mode=['linear','step','hermite'].includes(curveModes?.[ch.id])?curveModes[ch.id]:text(model?.curveModes?.[ch.id]||'linear');curvePayload[ch.id]={mode:['linear','step','hermite'].includes(mode)?mode:'linear',points:normalizeCurvePoints(curves?.[ch.id]||model?.curveSources?.[ch.id]||curvePresetPoints(ch.id,'flat'),ch.id)};}
    return{enabled:true,size:byProp.size??null,lifetime:byProp['life-span']??null,emission:byProp['emission-rate']??null,speed:byProp.speed??null,alpha:byProp.alpha??null,color:[byProp['color-r']??null,byProp['color-g']??null,byProp['color-b']??null],motion:['source','linear','orbit'].includes(motion)?motion:'source',texture:text(texturePath).trim(),curves:curvePayload};
  }
  function applyPresetValues(model,presetId){
    const preset=PRESETS.find(p=>p.id===presetId)||PRESETS[0],values=sourceValues(model);
    if(preset.reset||preset.id==='custom')return{preset:preset.id,motion:preset.motion,values};
    for(const f of model?.fields||[]){
      const factor=preset.factors[f.propertyId];
      if(factor==null)continue;
      let next=Number(f.value)*Number(factor);
      if(['alpha','color-r','color-g','color-b'].includes(f.propertyId))next=Math.max(0,Math.min(1,next));
      if(Number.isFinite(next))values[f.id]=String(Number(next.toFixed(6)));
    }
    return{preset:preset.id,motion:preset.motion,values};
  }
  if(!root)return Object.freeze({SCHEMA,VERSION,CAPABILITIES,COMMON,PRESETS,CURVE_CHANNELS,CURVE_INTERPOLATIONS,CURVE_PRESETS,buildModel,scopeModel,sourceValues,sourceCurves,sourceCurveModes,buildCurveChangeSet,buildChangeSet,applyEdits,validatePatchResult,previewOverrides,applyPresetValues,offsetsForEntry,encodedLength,normalizeCurvePoints,sampleCurve,curvePresetPoints,curveBindings,curveEntryMeta,curveModeBindings,interpolationEntryMeta});

  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const ui={model:null,patchedBytes:null,patch:null,selectedRecord:'all',selectedTexture:'',bound:false,lastSourceHash:'',values:{},textureDrafts:{},preset:'custom',curves:{},curveModes:{},selectedCurve:'size',curvePreset:'flat',curveDrag:null,curveSelected:0,selectedCurveChain:'',selectedInterpolationCandidate:'',curveScopeKey:'',curveScopeRecordId:'',curveTree:null,selectedTreeBranch:'',treeOperation:'',treePlan:null,treeResult:null,treePatchedBytes:null,branchAuthorPlan:null,branchAuthorResult:null,branchAuthorBytes:null,branchAuthorValues:{},branchAuthorPreset:'source',branchAuthorInterpolation:'inherit',branchAuthorChannel:'',structSession:null,selectedSessionDraft:'',structSessionPlan:null,structSessionResult:null,structSessionBytes:null};
  const lab=()=>root.WC3_EFFECTS_LAB;
  const state=()=>lab()?.getState?.()||null;
  const status=msg=>root.BLP_PAINT_APP?.setStatus?.(msg);
  function currentDoc(){return state()?.pkbStructure||null;}
  function sourceName(){return state()?.pkbPayload?.name||currentDoc()?.name||'';}
  function seedDrafts(force=false){
    if(!ui.model)return;
    if(force)ui.values={};
    for(const f of ui.model.fields||[])if(force||!Object.prototype.hasOwnProperty.call(ui.values,f.id))ui.values[f.id]=String(f.value);
    const ids=new Set((ui.model.fields||[]).map(f=>f.id));
    for(const id of Object.keys(ui.values))if(!ids.has(id))delete ui.values[id];
    if(force)ui.textureDrafts={};
    for(const t of ui.model.textures||[])if(force||!Object.prototype.hasOwnProperty.call(ui.textureDrafts,t.id))ui.textureDrafts[t.id]=t.path;
    const tids=new Set((ui.model.textures||[]).map(t=>t.id));
    for(const id of Object.keys(ui.textureDrafts))if(!tids.has(id))delete ui.textureDrafts[id];
    const src=sourceCurves(ui.model),modes=sourceCurveModes(ui.model);
    if(force){ui.curves={};ui.curveModes={};}
    for(const ch of CURVE_CHANNELS){if(force||!Array.isArray(ui.curves[ch.id]))ui.curves[ch.id]=clone(src[ch.id]);if(force||!['linear','step','hermite'].includes(ui.curveModes[ch.id]))ui.curveModes[ch.id]=modes[ch.id]||'linear';}
  }
  function rebuild(){
    const s=state(),doc=currentDoc(),previousHash=ui.lastSourceHash;
    ui.model=buildModel({doc,catalog:s?.pkbFieldCatalog,inspection:s?.pkbInspection,name:sourceName()});
    const changedSource=previousHash!==ui.model.sourceHash;
    ui.patchedBytes=null;
    ui.patch=null;
    ui.lastSourceHash=ui.model.sourceHash||'';
    if(!ui.model.records.some(r=>r.id===ui.selectedRecord))ui.selectedRecord='all';
    if(!ui.model.textures.some(t=>t.id===ui.selectedTexture))ui.selectedTexture=ui.model.textures[0]?.id||'';
    if(changedSource){ui.preset='custom';ui.curvePreset='flat';ui.selectedCurve='size';ui.curveSelected=0;ui.curveScopeKey='';ui.curveScopeRecordId='';ui.curveTree=null;ui.selectedTreeBranch='';ui.treeOperation='';ui.treePlan=null;ui.treeResult=null;ui.treePatchedBytes=null;ui.branchAuthorPlan=null;ui.branchAuthorResult=null;ui.branchAuthorBytes=null;ui.branchAuthorValues={};ui.branchAuthorPreset='source';ui.branchAuthorInterpolation='inherit';ui.branchAuthorChannel='';ui.structSession=null;ui.selectedSessionDraft='';ui.structSessionPlan=null;ui.structSessionResult=null;ui.structSessionBytes=null;}
    seedDrafts(changedSource);
    render();
    return ui.model;
  }
  function selectedFields(){if(!ui.model)return[];return ui.selectedRecord==='all'?ui.model.fields:ui.model.fields.filter(f=>f.recordId===ui.selectedRecord);}
  function selectedTextureRow(){return ui.model?.textures.find(x=>x.id===ui.selectedTexture)||ui.model?.textures[0]||null;}
  function textureDraft(row=selectedTextureRow()){return row?text(ui.textureDrafts[row.id]??row.path):'';}
  function activeModel(){return scopeModel(ui.model,ui.curveScopeKey,ui.curveScopeRecordId);}
  function activeCurveDrafts(){const m=activeModel();if(!ui.curveScopeKey)return{curves:ui.curves,modes:ui.curveModes};const curves=sourceCurves(m),modes=sourceCurveModes(m);curves[ui.selectedCurve]=normalizeCurvePoints(ui.curves[ui.selectedCurve]||curves[ui.selectedCurve],ui.selectedCurve);modes[ui.selectedCurve]=ui.curveModes[ui.selectedCurve]||modes[ui.selectedCurve]||'linear';return{curves,modes};}
  function selectedCurveDef(){return curveMap.get(ui.selectedCurve)||CURVE_CHANNELS[0];}
  function selectedCurveMode(){const m=ui.curveModes?.[ui.selectedCurve]||sourceCurveModes(activeModel())[ui.selectedCurve]||'linear';return['linear','step','hermite'].includes(m)?m:'linear';}
  function selectedCurvePoints(){return normalizeCurvePoints(ui.curves[ui.selectedCurve]||sourceCurves(activeModel())[ui.selectedCurve]||curvePresetPoints(ui.selectedCurve,'flat'),ui.selectedCurve);}
  function curveBindingsFor(channel=ui.selectedCurve){return(activeModel()?.curveBindings||[]).filter(x=>x.channel===channel).sort((a,b)=>a.time-b.time||a.index-b.index);}
  function curveModeBindingsFor(channel=ui.selectedCurve){return(activeModel()?.curveModeBindings||[]).filter(x=>x.channel===channel).sort((a,b)=>a.offset-b.offset);}
  function invalidatePatch(refresh=true){ui.patch=null;ui.patchedBytes=null;if(refresh)refreshDirtyUi();}
  function currentChanges(){
    const row=selectedTextureRow(),m=activeModel(),draft=activeCurveDrafts();
    return buildChangeSet(m,ui.values,row?.id||'',textureDraft(row),draft.curves,draft.modes);
  }
  function changeRows(changes=currentChanges()){
    const rows=[...(changes.scalars||[]).map(c=>({kind:'scalar',title:c.label,meta:`${c.type.toUpperCase()} · ${c.offsetHex}`,before:String(c.before),after:String(c.after),safe:true}))];
    if(changes.texture)rows.push({kind:'texture',title:'Texture',meta:`${changes.texture.offsetHex} · ${changes.texture.binarySafe?'PKB-safe':'preview-only'}`,before:changes.texture.before,after:changes.texture.after,safe:changes.texture.binarySafe});
    for(const c of changes.curves?.channels||[])rows.push({kind:'curve',title:`${c.label} over life`,meta:`${c.points} point(s) · ${c.writable?`${c.bindingCount} confirmed sample(s)`:'preview-only'}`,before:'source curve',after:`edited · ${c.writes} binary write(s)`,safe:c.writable});
    for(const bad of changes.invalid||[])rows.push({kind:'invalid',title:bad.label||'Invalid edit',meta:'BLOCKED',before:'',after:bad.reason||'Invalid value',safe:false});
    return rows;
  }
  function reportText(){
    const m=ui.model||buildModel(),changes=currentChanges();
    if(ui.patch){
      const v=ui.patch.validation||{checks:[],summary:{pass:0,fail:0,total:0},status:ui.patch.safe?'SAFE':'BLOCKED'};
      return`REAL EFFECT EDITOR · ${v.status}\nSource: ${m.name}\nChanged bytes: ${ui.patch.diff.changedBytes}\nChanged regions: ${ui.patch.diff.regions?.length||0}\nScalar writes: ${ui.patch.scalarPlan?.operations?.length||0}\nCurve sample writes: ${ui.patch.curvePlan?.operations?.length||0}\nInterpolation enum writes: ${ui.patch.curveModePlan?.operations?.length||0}\nTexture: ${ui.patch.texturePatch?`${ui.patch.texturePatch.before} → ${ui.patch.texturePatch.after}`:'unchanged'}\nPreview-only curve channels excluded: ${changes.curves?.summary?.previewOnlyChannels||0}\nUnknown regions changed: ${ui.patch.diff.outsideMappedRegions||0}\nSize preserved: ${ui.patch.sourceSize===ui.patchedBytes?.length?'YES':'NO'}\nSafety checks: ${v.summary?.pass||0}/${v.summary?.total||0} PASS\n${(v.checks||[]).map(c=>`${c.ok?'PASS':'FAIL'} · ${c.label}${c.detail?` · ${c.detail}`:''}`).join('\n')}`;
    }
    if(!m.ready)return'Inspect a real Warcraft PKB to populate this editor.';
    return`REAL EFFECT EDITOR\n${m.summary.fields} confirmed numeric field(s) · ${m.summary.records} semantic record(s) · ${m.summary.textures} texture dependency string(s).\nCurve mappings: ${m.summary.curveBindings} confirmed sample(s) across ${m.summary.curveChannels} channel(s) · ${m.summary.curveModeBindings||0} interpolation enum binding(s).\nStaged edits: ${changes.summary.dirty} · binary writes: ${changes.summary.binaryDirty} · invalid: ${changes.summary.invalid} · preview-only: ${changes.summary.previewOnly}\nCurve drafts persist across record switches. A curve becomes PKB-writable only when its per-sample offsets are confirmed; otherwise it remains live-preview only.`;
  }
  function renderChangeList(){
    const box=$('#effectsRealChanges');
    if(!box)return;
    const rows=changeRows();
    box.innerHTML=rows.length?rows.map(r=>`<div class="effects-real-change${r.safe?'':' bad'}"><strong>${safe(r.title)}</strong><span>${safe(r.meta)}</span><em>${safe(r.before)} → ${safe(r.after)}</em></div>`).join(''):'<div class="effects-real-empty compact">No staged edits.</div>';
  }
  function refreshDirtyUi(){
    const changes=currentChanges(),dirty=new Set(changes.scalars.map(c=>c.fieldId));
    $$('[data-real-field]').forEach(el=>{
      const card=el.closest('.effects-real-field');
      card?.classList.toggle('dirty',dirty.has(el.dataset.realField));
      card?.classList.toggle('invalid',changes.invalid.some(x=>x.fieldId===el.dataset.realField));
    });
    const tex=$('#effectsRealTexturePath');
    tex?.classList.toggle('dirty',!!changes.texture);
    tex?.classList.toggle('bad',!!changes.texture&&!changes.texture.binarySafe);
    const staged=$('#effectsRealDirtyCount');
    if(staged)staged.textContent=String(changes.summary.dirty);
    const changed=$('#effectsRealPatchBytes');
    if(changed)changed.textContent=String(ui.patch?.diff?.changedBytes||0);
    const previewBtn=$('#effectsRealPreviewPatchBtn');
    if(previewBtn)previewBtn.disabled=!ui.model?.ready||!changes.summary.binaryDirty||!!changes.summary.invalid||!!changes.texture?.previewOnly;
    const save=$('#effectsRealSavePkbBtn');
    if(save)save.disabled=!(ui.patchedBytes instanceof Uint8Array);
    const report=$('#effectsRealEditorReport');
    if(report)report.textContent=reportText();
    updateTextureLength();
    renderChangeList();
    updateCurveStatus(changes);
  }
  function render(){
    const m=ui.model||buildModel(),ready=!!m.ready,by=(id,v)=>{const el=$('#'+id);if(el)el.textContent=String(v)};
    seedDrafts(false);
    by('effectsRealSource',ready?`${m.name} · ${Number(m.size||0).toLocaleString()} B`:'No inspected PKB');
    by('effectsRealMappedCount',m.summary?.fields||0);
    by('effectsRealRecordCount',m.summary?.records||0);
    by('effectsRealTextureCount',m.summary?.textures||0);
    by('effectsRealPatchBytes',ui.patch?.diff?.changedBytes||0);
    const badge=$('#effectsRealEditorBadge');
    if(badge){badge.textContent=ready?(m.summary.fields||m.summary.curveBindings?'READY':'READ-ONLY'):'NO PKB';badge.classList.toggle('warn',ready&&!m.summary.fields&&!m.summary.curveBindings);}
    const rec=$('#effectsRealRecordSelect');
    if(rec){rec.innerHTML='<option value="all">All confirmed fields</option>'+m.records.map(r=>`<option value="${safe(r.id)}">${safe(r.status.toUpperCase())} · ${safe(r.type)} · ${safe(r.label)} · ${r.fieldCount} field(s)</option>`).join('');if(!['all',...m.records.map(r=>r.id)].includes(ui.selectedRecord))ui.selectedRecord='all';rec.value=ui.selectedRecord;rec.disabled=!ready;}
    const preset=$('#effectsRealPreset');
    if(preset){preset.innerHTML=PRESETS.map(p=>`<option value="${safe(p.id)}">${safe(p.label)}</option>`).join('');const demo=state()?.exampleEditorPreset||'';const wanted=ready?ui.preset:(PRESETS.some(p=>p.id===demo)?demo:ui.preset);preset.value=PRESETS.some(p=>p.id===wanted)?wanted:'custom';preset.disabled=!ready;}
    const fields=$('#effectsRealFields');
    if(fields){
      const rows=selectedFields();
      fields.innerHTML=rows.length?rows.map(f=>{
        const v=ui.values[f.id]??String(f.value);
        return`<label class="effects-real-field" data-field-card="${safe(f.id)}"><span>${safe(f.propertyLabel)} <em>${safe(f.recordType||'Unknown')} · ${safe(f.type.toUpperCase())} · ${safe(f.offsetHex)}</em></span><input data-real-field="${safe(f.id)}" inputmode="decimal" value="${safe(v)}"/><button class="btn micro ghost effects-real-reset-field" type="button" data-real-reset="${safe(f.id)}" title="Reset to source value">↺</button><small>CONFIRMED mapping${f.recordStatus?` · record ${safe(f.recordStatus)}`:''}</small></label>`;
      }).join(''):`<div class="effects-real-empty">${ready?'No confirmed numeric mappings for this selection. Use Controlled Field Lab to confirm a mapping before binary editing.':'Inspect a PKB to start editing.'}</div>`;
    }
    const texSel=$('#effectsRealTextureSelect');
    if(texSel){texSel.innerHTML=m.textures.length?m.textures.map(t=>`<option value="${safe(t.id)}">${safe(t.path)} · ${t.writable?t.byteLength+' B':'preview-only'} @ ${safe(hex(t.offset))}</option>`).join(''):'<option value="">No texture dependency detected</option>';texSel.value=ui.selectedTexture||'';texSel.disabled=!m.textures.length;}
    const t=selectedTextureRow(),tex=$('#effectsRealTexturePath');
    if(tex&&document.activeElement!==tex)tex.value=textureDraft(t);
    const report=$('#effectsRealEditorReport');
    if(report)report.textContent=reportText();
    renderCurveEditor();
    renderCurveDiscovery();
    renderCurveStructure();
    renderCurveTree();
    refreshDirtyUi();
  }
  function updateTextureLength(){
    const t=selectedTextureRow(),el=$('#effectsRealTextureLength'),v=$('#effectsRealTexturePath')?.value??textureDraft(t);
    if(!el)return;
    if(!t){el.textContent='No texture string selected';el.classList.remove('bad');return;}
    if(!t.writable){el.textContent='Encoding not confirmed · preview only';el.classList.add('bad');return;}
    const n=encodedLength(v,t.encoding);
    el.textContent=`${t.byteLength} → ${n} bytes${t.byteLength===n?' · PKB-safe':' · preview only until same length'}`;
    el.classList.toggle('bad',t.byteLength!==n);
  }
  function resetField(id){
    const f=ui.model?.fields.find(x=>x.id===id);
    if(!f)return;
    ui.values[id]=String(f.value);
    invalidatePatch(false);
    const el=$$('[data-real-field]').find(x=>x.dataset.realField===id);
    if(el)el.value=ui.values[id];
    ui.preset='custom';
    const p=$('#effectsRealPreset');
    if(p)p.value='custom';
    refreshDirtyUi();
  }
  function resetDrafts(){
    seedDrafts(true);
    ui.preset='source';
    ui.curvePreset='flat';
    const p=$('#effectsRealPreset');
    if(p)p.value='source';
    const motion=$('#effectsRealMotion');
    if(motion)motion.value='source';
    invalidatePatch(false);
    render();
    status('Real Effect Editor drafts and curves reset to source values.');
  }
  function applyPreset(id){
    if(!ui.model?.ready)return;
    const p=applyPresetValues(ui.model,id);
    ui.values={...p.values};
    ui.preset=id;
    const motion=$('#effectsRealMotion');
    if(motion)motion.value=p.motion||'source';
    invalidatePatch(false);
    render();
    status(`Real Effect Editor preset: ${PRESETS.find(x=>x.id===id)?.label||id}.`);
  }
  function curveCanvasCoords(e,canvas){
    const r=canvas.getBoundingClientRect(),ch=selectedCurveDef(),x=clamp((e.clientX-r.left)/Math.max(1,r.width),0,1),yn=clamp((e.clientY-r.top)/Math.max(1,r.height),0,1),v=ch.max-(ch.max-ch.min)*yn;
    return{t:x,v:clamp(v,ch.min,ch.max),x:(e.clientX-r.left),y:(e.clientY-r.top),width:r.width,height:r.height};
  }
  function setCurvePoints(points,{renderAll=true}={}){
    ui.curves[ui.selectedCurve]=normalizeCurvePoints(points,ui.selectedCurve);
    ui.curvePreset='custom';
    invalidatePatch(false);
    if(renderAll)renderCurveEditor();
    refreshDirtyUi();
  }
  function applyCurvePreset(id){
    ui.curvePreset=id;
    setCurvePoints(curvePresetPoints(ui.selectedCurve,id));
    const sel=$('#effectsRealCurvePreset');if(sel)sel.value=id;
    status(`Curve preset: ${CURVE_PRESETS.find(x=>x.id===id)?.label||id} · ${selectedCurveDef().label}.`);
  }
  function resetCurve(channel=ui.selectedCurve){
    const src=sourceCurves(ui.model)[channel];
    ui.curves[channel]=clone(src);
    ui.curveModes[channel]=sourceCurveModes(ui.model)[channel]||'linear';
    ui.curvePreset='flat';
    ui.curveSelected=0;
    invalidatePatch(false);
    renderCurveEditor();
    refreshDirtyUi();
  }
  function resetAllCurves(){
    ui.curves=sourceCurves(ui.model);
    ui.curveModes=sourceCurveModes(ui.model);
    ui.curvePreset='flat';
    ui.curveSelected=0;
    invalidatePatch(false);
    renderCurveEditor();
    refreshDirtyUi();
    status('All over-life curves reset to their source/default values.');
  }
  function addCurvePoint(t=.5,v=null){
    const ch=selectedCurveDef(),pts=selectedCurvePoints(),value=v==null?sampleCurve(pts,t,ch.id,selectedCurveMode()):v;
    pts.push({t:clamp(t,.001,.999),v:clamp(value,ch.min,ch.max)});
    const next=normalizeCurvePoints(pts,ch.id);
    ui.curveSelected=Math.max(1,next.findIndex(p=>Math.abs(p.t-t)<.02));
    setCurvePoints(next);
  }
  function deleteCurvePoint(index=ui.curveSelected){
    const pts=selectedCurvePoints();
    if(index<=0||index>=pts.length-1)return;
    pts.splice(index,1);
    ui.curveSelected=Math.max(0,Math.min(index-1,pts.length-1));
    setCurvePoints(pts);
  }
  function drawCurveEditor(){
    const canvas=$('#effectsRealCurveCanvas');
    if(!canvas)return;
    const rect=canvas.getBoundingClientRect(),dpr=Math.max(1,Math.min(2,Number(root.devicePixelRatio)||1)),W=Math.max(280,Math.round(rect.width||640)),H=Math.max(180,Math.round(rect.height||230));
    if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}
    const ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    const ch=selectedCurveDef(),pad={l:38,r:14,t:14,b:28},cw=W-pad.l-pad.r,chh=H-pad.t-pad.b,py=v=>pad.t+(1-(v-ch.min)/Math.max(1e-9,ch.max-ch.min))*chh,px=t=>pad.l+t*cw;
    ctx.fillStyle='#060c10';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#20303a';ctx.lineWidth=1;
    for(let i=0;i<=4;i++){const x=pad.l+cw*i/4;ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+chh);ctx.stroke();const y=pad.t+chh*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cw,y);ctx.stroke();}
    ctx.fillStyle='#6f8492';ctx.font='9px Consolas, monospace';ctx.fillText('0%',pad.l-5,H-9);ctx.fillText('100%',W-pad.r-28,H-9);ctx.fillText(ch.max.toFixed(ch.max<=1?1:1),4,pad.t+4);ctx.fillText(ch.min.toFixed(1),4,pad.t+chh+3);
    const strokeCurve=(pts,mode,color,width,dash=[])=>{ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.lineWidth=width;ctx.beginPath();for(let i=0;i<=96;i++){const t=i/96,x=px(t),y=py(sampleCurve(pts,t,ch.id,mode));if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();ctx.setLineDash([]);};
    const src=sourceCurves(ui.model)[ch.id]||curvePresetPoints(ch.id,'flat'),srcMode=sourceCurveModes(ui.model)[ch.id]||'linear';strokeCurve(src,srcMode,'#465863',1.2,[4,4]);
    const pts=selectedCurvePoints();strokeCurve(pts,selectedCurveMode(),'#d0aa54',2);
    pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(px(p.t),py(p.v),i===ui.curveSelected?6:4.5,0,Math.PI*2);ctx.fillStyle=i===ui.curveSelected?'#f3cf79':'#9f7d34';ctx.fill();ctx.strokeStyle='#131a1f';ctx.lineWidth=1;ctx.stroke();});
  }
  function renderCurvePointList(){
    const box=$('#effectsRealCurvePoints');if(!box)return;const pts=selectedCurvePoints(),ch=selectedCurveDef(),hermite=selectedCurveMode()==='hermite';
    box.innerHTML=pts.map((p,i)=>`<div class="effects-real-curve-point${i===ui.curveSelected?' selected':''}${hermite?' hermite':''}" data-curve-row="${i}"><button type="button" class="effects-real-curve-index" data-curve-select="${i}">${String(i+1).padStart(2,'0')}</button><label>Life<input type="number" min="0" max="1" step="0.01" data-curve-time="${i}" value="${Number(p.t.toFixed(4))}" ${i===0||i===pts.length-1?'disabled':''}></label><label>${safe(ch.unit)}<input type="number" min="${ch.min}" max="${ch.max}" step="0.01" data-curve-value="${i}" value="${Number(p.v.toFixed(5))}"></label>${hermite?`<label>In tan<input type="number" step="0.01" data-curve-in="${i}" value="${Number((num(p.in)??0).toFixed(5))}"></label><label>Out tan<input type="number" step="0.01" data-curve-out="${i}" value="${Number((num(p.out)??0).toFixed(5))}"></label>`:''}<button class="btn micro ghost" type="button" data-curve-delete="${i}" ${i===0||i===pts.length-1?'disabled':''}>×</button></div>`).join('');
  }
  function updateCurveStatus(changes=currentChanges()){
    const ch=selectedCurveDef(),bindings=curveBindingsFor(ch.id),modeBindings=curveModeBindingsFor(ch.id),values=bindings.filter(x=>x.role==='value'),tangents=bindings.filter(x=>x.role!=='value'),curveChange=changes.curves?.channels?.find(x=>x.channel===ch.id),badge=$('#effectsRealCurveBadge'),points=$('#effectsRealCurveCount'),mapped=$('#effectsRealCurveMappedCount'),mode=$('#effectsRealCurveMode'),binaryReady=values.length>=2;
    if(points)points.textContent=String(selectedCurvePoints().length);
    if(mapped)mapped.textContent=String(values.length+(selectedCurveMode()==='hermite'?tangents.length:0)+modeBindings.length);
    if(mode)mode.textContent=binaryReady?`${selectedCurveMode().toUpperCase()} · PKB + PREVIEW${modeBindings.length?' · MODE WRITABLE':''}`:`${selectedCurveMode().toUpperCase()} · PREVIEW ONLY`;
    if(badge){badge.textContent=binaryReady?`PKB MAPPED · ${values.length} VALUES${tangents.length?` + ${tangents.length} TANGENTS`:''}${modeBindings.length?` + ${modeBindings.length} MODE`:''}`:'PREVIEW ONLY';badge.classList.toggle('ok',binaryReady);badge.classList.toggle('warn',!binaryReady);}
    $('#effectsRealCurveEditor')?.classList.toggle('dirty',!!curveChange);
  }
  function renderCurveEditor(){
    const channel=$('#effectsRealCurveChannel');
    if(channel){channel.innerHTML=CURVE_CHANNELS.map(x=>`<option value="${x.id}">${safe(x.label)}</option>`).join('');channel.value=ui.selectedCurve;channel.disabled=!ui.model?.ready;}
    const preset=$('#effectsRealCurvePreset');
    if(preset){preset.innerHTML='<option value="custom">Custom</option>'+CURVE_PRESETS.map(x=>`<option value="${x.id}">${safe(x.label)}</option>`).join('');const demo=state()?.exampleCurvePreset||'';const wanted=ui.model?.ready?ui.curvePreset:(CURVE_PRESETS.some(x=>x.id===demo)?demo:ui.curvePreset);preset.value=['custom',...CURVE_PRESETS.map(x=>x.id)].includes(wanted)?wanted:'custom';preset.disabled=!ui.model?.ready;}
    const interpolation=$('#effectsRealCurveInterpolation');if(interpolation){interpolation.innerHTML=CURVE_INTERPOLATIONS.map(x=>`<option value="${x.id}">${safe(x.label)}</option>`).join('');interpolation.value=selectedCurveMode();interpolation.disabled=!ui.model?.ready;}
    const ch=selectedCurveDef(),label=$('#effectsRealCurveChannelLabel');if(label)label.textContent=`${ch.label} · ${ch.unit} over normalized particle life · ${selectedCurveMode().toUpperCase()}${ui.curveScopeKey?` · SCOPED ${ui.curveScopeKey}`:''}`;
    renderCurvePointList();drawCurveEditor();updateCurveStatus();
  }
  function discoveryRows(){const s=state(),m=s?.pkbCurveDiscovery;return[...(m?.complexCandidates||[]),...(m?.candidates||[])].sort((a,b)=>(b.pairEvidence?.supported?1:0)-(a.pairEvidence?.supported?1:0)||Number(b.score||0)-Number(a.score||0)||Number(a.offset||0)-Number(b.offset||0));}
  function discoveryCandidate(){const s=state(),rows=discoveryRows();return rows.find(x=>x.id===s?.selectedCurveDiscoveryCandidate)||rows[0]||null;}
  function renderCurveDiscovery(){
    const s=state(),model=s?.pkbCurveDiscovery,rows=discoveryRows(),candidate=discoveryCandidate(),channel=$('#effectsCurveDiscoveryChannel'),target=$('#effectsCurveDiscoveryComplexTarget'),note=$('#effectsCurveDiscoveryNote'),list=$('#effectsCurveDiscoveryList'),report=$('#effectsCurveDiscoveryReport'),badge=$('#effectsCurveDiscoveryBadge'),CD=root.WC3_EFFECTS_LAB?.pkbCurveDiscovery;
    if(channel){channel.innerHTML=CURVE_CHANNELS.map(x=>`<option value="${x.id}">${safe(x.label)}</option>`).join('');const preferred=s?.curveDiscoveryChannel||candidate?.suggestedChannel||'size';channel.value=CURVE_CHANNELS.some(x=>x.id===preferred)?preferred:'size';channel.disabled=candidate?.kind==='complex';}
    if(target){const targets=CD?.COMPLEX_TARGETS||[];target.innerHTML=targets.map(x=>`<option value="${safe(x.id)}">${safe(x.label)}</option>`).join('');const preferred=s?.curveDiscoveryTarget||candidate?.suggestedTarget||targets[0]?.id||'color-rgb';target.value=targets.some(x=>x.id===preferred)?preferred:(targets[0]?.id||'color-rgb');target.disabled=candidate?.kind!=='complex';}
    if(note&&document.activeElement!==note&&note.value==null)note.value='';
    const set=(id,v)=>{const el=$(id);if(el)el.textContent=String(v)};set('#effectsCurveDiscoveryCount',model?.summary?.candidates||0);set('#effectsCurveDiscoveryComplexCount',model?.summary?.complexCandidates||0);set('#effectsCurveDiscoveryPairCount',(model?.summary?.pairSupported||0)+(model?.summary?.complexPairSupported||0));set('#effectsCurveDiscoveryProbableCount',(model?.summary?.probable||0)+(model?.summary?.complexProbable||0));const promoted=(s?.pkbFieldCatalog?.entries||[]).filter(e=>/curve-discovery/.test(e?.curve?.source||''));set('#effectsCurveDiscoveryMappedCount',promoted.filter(e=>e.status==='confirmed').length);
    if(badge){badge.textContent=model?(candidate?.pairEvidence?.supported?(candidate?.kind==='complex'?'COMPLEX PAIR':'PAIR EVIDENCE'):(candidate?.kind==='complex'?'COMPLEX READY':'SCAN READY')):'NO SCAN';badge.classList.toggle('ok',!!candidate?.pairEvidence?.supported);badge.classList.toggle('warn',!candidate?.pairEvidence?.supported);}
    if(list)list.innerHTML=rows.length?rows.slice(0,160).map(c=>`<button type="button" class="effects-pkb-row effects-curve-discovery-row${c.id===s.selectedCurveDiscoveryCandidate?' active':''}" data-curve-discovery-id="${safe(c.id)}"><span>${safe(c.status.toUpperCase())} · score ${Number(c.score||0).toFixed(2)} · ${c.sampleCount} samples${c.kind==='complex'?` · ${c.componentCount}C`:''}${c.pairEvidence?.supported?' · PAIR':''}</span><strong>${safe(c.layout)} · ${safe(c.offsetHex)}${c.kind==='complex'?(c.suggestedTarget?` · hint ${safe(c.suggestedTarget)}`:''):(c.suggestedChannel?` · hint ${safe(c.suggestedChannel)}`:'')}</strong></button>`).join(''):'Scan the current PKB or compare a selected corpus pair to find conservative scalar/vector curve candidates.';
    list?.querySelectorAll?.('[data-curve-discovery-id]')?.forEach(btn=>btn.addEventListener('click',()=>{s.selectedCurveDiscoveryCandidate=btn.dataset.curveDiscoveryId||'';const c=discoveryCandidate();if(c?.kind==='complex'&&c.suggestedTarget&&target){s.curveDiscoveryTarget=c.suggestedTarget;target.value=c.suggestedTarget;}if(c?.kind!=='complex'&&c?.suggestedChannel&&channel){s.curveDiscoveryChannel=c.suggestedChannel;channel.value=c.suggestedChannel;}renderCurveDiscovery();}));
    if(report){const head=cleanUiVersion(CD?.reportText?.(model)||'CURVE DISCOVERY · no scan yet.');let detail='';if(candidate){const offsets=candidate.kind==='complex'?(candidate.samples||[]).map(x=>x.componentOffsetHex?.join('/')||'').join(', '):(candidate.samples||[]).map(x=>x.valueOffsetHex).join(', '),suggestion=candidate.kind==='complex'?`${candidate.suggestedTarget||'none'}${candidate.targetReason?` · ${candidate.targetReason}`:''}`:`${candidate.suggestedChannel||'none'}${candidate.channelReason?` · ${candidate.channelReason}`:''}`;detail=['','SELECTED CANDIDATE',`Kind: ${candidate.kind==='complex'?`COMPLEX · ${candidate.componentCount} component(s)`:'SCALAR'}`,`Layout: ${candidate.layout}`,`Offset: ${candidate.offsetHex} · ${candidate.byteLength} bytes`,`Samples: ${candidate.sampleCount} · score ${candidate.score}`,`Suggested mapping: ${suggestion}`,`Times: ${(candidate.samples||[]).map(x=>Number(x.normalizedTime).toFixed(3)).join(', ')}`,`Value offsets: ${offsets}`,candidate.pairEvidence?.supported?`Pair evidence: ${candidate.pairEvidence.changedCount} value component/sample change(s) while time samples stayed stable.`:'Pair evidence: not established.',candidate.kind==='complex'&&candidate.interpretations?.length?`Interpretations: ${candidate.interpretations.join(' · ')}`:'',candidate.hints?.length?`Nearby strings: ${candidate.hints.join(' · ')}`:'Nearby strings: none'].filter(Boolean).join('\n');}report.textContent=head+detail;}
  }
  async function scanCurveDiscovery(pair=false){const fn=pair?lab()?.scanCurveCorpusPair:lab()?.scanCurrentPkbCurves;if(typeof fn!=='function')throw new Error('Curve Discovery bridge is unavailable.');const r=fn.call(lab());renderCurveDiscovery();return r;}
  function promoteCurveDiscovery(statusValue){const r=lab()?.promoteCurveDiscoveryCandidate?.(statusValue);renderCurveDiscovery();render();return r;}
  function buildCurveStructureV6(){
    if(!CS?.buildModel)throw new Error('Curve Structure module is unavailable.');const s=state(),doc=currentDoc();if(!doc?._sourceBytes)throw new Error('Inspect a real PKB first.');let semantic=s?.pkbSemanticRecords||null,hierarchy=s?.pkbRecordHierarchy||null,layout=s?.pkbStructuralLayout||null;
    if(!semantic&&RD?.buildRecords)semantic=RD.buildRecords(doc,s?.pkbFieldCatalog,{fileName:sourceName(),previous:s?.pkbSemanticRecords});
    const RH=lab()?.pkbRecordHierarchy,LD=lab()?.pkbLayoutDecoder;if(!hierarchy&&RH?.buildHierarchy&&semantic?.records?.length)hierarchy=RH.buildHierarchy(doc,semantic,{previous:s?.pkbRecordHierarchy,maxFullScanBytes:8*1024*1024});if(!layout&&LD?.buildLayout&&semantic?.records?.length&&hierarchy?.links)layout=LD.buildLayout(doc,semantic,hierarchy,{previous:s?.pkbStructuralLayout});
    const model=CS.buildModel(doc,{catalog:s?.pkbFieldCatalog,semantic,hierarchy,layout,curveDiscovery:s?.pkbCurveDiscovery,previous:s?.pkbCurveStructure});lab()?.setCurveStructureModel?.(model);ui.selectedCurveChain=model.chains?.[0]?.id||'';ui.selectedInterpolationCandidate=model.interpolationCandidates?.[0]?.id||'';renderCurveStructure();status(`Curve Structure: ${model.summary?.chains||0} Renderer→Sampler→Curve chain(s) · ${model.summary?.interpolationCandidates||0} interpolation enum candidate(s).`);return model;
  }
  function curveStructureModel(){return state()?.pkbCurveStructure||null;}
  function selectedInterpolationCandidate(){const m=curveStructureModel();return(m?.interpolationCandidates||[]).find(x=>x.id===ui.selectedInterpolationCandidate)||m?.interpolationCandidates?.[0]||null;}
  function renderCurveStructure(){
    const m=curveStructureModel(),badge=$('#effectsCurveStructureBadge'),chains=$('#effectsCurveStructureChains'),list=$('#effectsCurveInterpolationList'),report=$('#effectsCurveStructureReport'),channel=$('#effectsCurveInterpolationChannel');const set=(id,v)=>{const el=$(id);if(el)el.textContent=String(v)};set('#effectsCurveStructureGroupCount',m?.summary?.curveGroups||0);set('#effectsCurveStructureChainCount',m?.summary?.chains||0);set('#effectsCurveStructureCurveArrays',m?.summary?.curveArrays||0);set('#effectsCurveStructureSamplerArrays',m?.summary?.samplerArrays||0);set('#effectsCurveStructureInterpCount',m?.summary?.interpolationCandidates||0);set('#effectsCurveStructureModeMapped',ui.model?.summary?.curveModeBindings||0);
    if(channel){channel.innerHTML=CURVE_CHANNELS.map(x=>`<option value="${x.id}">${safe(x.label)}</option>`).join('');if(!CURVE_CHANNELS.some(x=>x.id===channel.value))channel.value=ui.selectedCurve||'size';}
    if(badge){badge.textContent=m?(m.summary?.confirmedChains?'STRUCTURE CONFIRMED':m.summary?.chains?'STRUCTURE READY':'NO CHAIN'):'NO ANALYSIS';badge.classList.toggle('ok',!!m?.summary?.confirmedChains);badge.classList.toggle('warn',!m?.summary?.confirmedChains);}
    if(chains)chains.innerHTML=m?.chains?.length?m.chains.slice(0,80).map(x=>`<button type="button" class="effects-pkb-row effects-curve-structure-row${x.id===ui.selectedCurveChain?' active':''}" data-curve-chain="${safe(x.id)}"><span>${safe(x.status.toUpperCase())} · ${x.curveGroupIds?.length||0} curve group(s)</span><strong>${safe(x.rendererLabel)} → ${safe(x.samplerLabel)} → ${safe(x.curveLabel)}</strong></button>`).join(''):'No Renderer → Sampler → Curve chain decoded yet. Confirm semantic records and hierarchy links, then rebuild.';chains?.querySelectorAll?.('[data-curve-chain]')?.forEach(b=>b.addEventListener('click',()=>{ui.selectedCurveChain=b.dataset.curveChain||'';renderCurveStructure();}));
    const rows=m?.interpolationCandidates||[];if(list)list.innerHTML=rows.length?rows.slice(0,120).map(x=>`<button type="button" class="effects-pkb-row effects-curve-interp-row${x.id===ui.selectedInterpolationCandidate?' active':''}" data-curve-interp="${safe(x.id)}"><span>${safe(x.status.toUpperCase())} · ${safe(x.type.toUpperCase())} · rel ${safe(x.relativeOffsetHex)} · score ${Number(x.score||0).toFixed(2)}</span><strong>values ${safe((x.distinctValues||[]).join(' / '))} · ${x.occurrences?.length||0} record(s)</strong></button>`).join(''):'No small-integer interpolation enum candidate found inside decoded Curve records.';list?.querySelectorAll?.('[data-curve-interp]')?.forEach(b=>b.addEventListener('click',()=>{ui.selectedInterpolationCandidate=b.dataset.curveInterp||'';renderCurveStructure();}));
    const c=selectedInterpolationCandidate();if(report)report.textContent=cleanUiVersion(CS?.reportText?.(m)||'CURVE STRUCTURE · no analysis yet.')+(c?`\n\nSELECTED INTERPOLATION CANDIDATE\n${c.type.toUpperCase()} · relative ${c.relativeOffsetHex} · ${c.occurrences.length} occurrence(s)\nObserved values: ${c.distinctValues.join(', ')}\n${(c.occurrences||[]).slice(0,16).map(o=>`${o.recordLabel} · ${o.offsetHex} = ${o.value}`).join('\n')}\n\nAssign enum values only after a controlled Linear/Step/Hermite comparison.`:'');
  }
  function selectedTreeBranch(){return(ui.curveTree?.branches||[]).find(x=>x.id===ui.selectedTreeBranch)||ui.curveTree?.branches?.[0]||null;}
  function clearCurveScope(){ui.curveScopeKey='';ui.curveScopeRecordId='';ui.curveSelected=0;const src=sourceCurves(ui.model),modes=sourceCurveModes(ui.model);for(const ch of CURVE_CHANNELS){ui.curves[ch.id]=clone(src[ch.id]);ui.curveModes[ch.id]=modes[ch.id]||'linear';}invalidatePatch(false);renderCurveEditor();renderCurveTree();refreshDirtyUi();status('Curve scope cleared · Curve Editor returned to all confirmed mappings.');}
  function activateCurveScope(branchId,groupId,channel){const branch=(ui.curveTree?.branches||[]).find(x=>x.id===branchId);if(!branch)throw new Error('Curve Tree branch is unavailable.');const group=(branch.groups||[]).find(x=>x.id===groupId);if(!group)throw new Error('Curve group is unavailable in the selected branch.');if(!(group.channels||[]).includes(channel))throw new Error(`Curve group does not contain ${channel}.`);ui.selectedTreeBranch=branch.id;ui.selectedCurveChain=branch.id;ui.curveScopeKey=group.key;ui.curveScopeRecordId=branch.curveRecordId||'';ui.selectedCurve=channel;ui.curveSelected=0;ui.curvePreset='custom';const m=activeModel(),src=sourceCurves(m),modes=sourceCurveModes(m);ui.curves[channel]=clone(src[channel]);ui.curveModes[channel]=modes[channel]||'linear';invalidatePatch(false);renderCurveEditor();renderCurveTree();refreshDirtyUi();status(`Curve Tree: ${channel} scoped to ${branch.rendererLabel} → ${branch.samplerLabel} → ${branch.curveLabel}.`);return{branch,group,channel};}
  function buildCurveTreeV7(){if(!CT?.buildTree)throw new Error('Curve Tree module is unavailable.');const s=state();let structure=s?.pkbCurveStructure||null;if(!structure)structure=buildCurveStructureV6();const tree=CT.buildTree(structure,s?.pkbStructuralLayout,s?.pkbMultiArrayDomains);ui.curveTree=tree;if(!tree.branches.some(x=>x.id===ui.selectedTreeBranch))ui.selectedTreeBranch=tree.branches[0]?.id||'';ui.treeOperation='';ui.treePlan=null;ui.treeResult=null;ui.treePatchedBytes=null;ui.branchAuthorPlan=null;ui.branchAuthorResult=null;ui.branchAuthorBytes=null;renderCurveTree();status(`Curve Tree: ${tree.summary?.branches||0} branch(es) · ${tree.summary?.writable||0} structurally writable.`);return tree;}
  function stageCurveTreeOperation(operation){if(!CT?.createBranchPlan)throw new Error('Curve Tree transaction writer is unavailable.');const s=state(),doc=currentDoc(),tree=ui.curveTree||buildCurveTreeV7(),row=selectedTreeBranch();if(!row)throw new Error('Select a structural branch first.');const plan=CT.createBranchPlan(doc,tree,s?.pkbStructuralLayout,s?.pkbRecordHierarchy,s?.pkbMultiArrayDomains,row.id,operation,{alignment:16});ui.treeOperation=operation;ui.treePlan=plan;ui.treeResult=null;ui.treePatchedBytes=null;renderCurveTree();status(`Curve Tree staged ${operation}: ${row.rendererLabel} → ${row.samplerLabel} → ${row.curveLabel}.`);return plan;}
  function clearCurveTreeOperation(){ui.treeOperation='';ui.treePlan=null;ui.treeResult=null;ui.treePatchedBytes=null;renderCurveTree();status('Curve Tree structural operation cleared.');}
  function previewCurveTreeTransaction(){if(!ui.treePlan)throw new Error('Stage Duplicate branch or Remove branch first.');const result=CT.applyBranchPlan(currentDoc(),ui.treePlan);ui.treeResult=result;ui.treePatchedBytes=Uint8Array.from(result.bytes);renderCurveTree();status(`Curve Tree preview verified · ${result.verification.changedExistingBytes||0} existing byte(s) changed · ${result.verification.appendedBytes||0} byte(s) appended.`);return result;}
  async function saveCurveTreePkb(){if(!(ui.treePatchedBytes instanceof Uint8Array)||!ui.treeResult?.verification?.sourcePreservedOutsideMetadata)throw new Error('Preview and verify a structural transaction first.');const base=text(sourceName()||'effect.pkb').replace(/\.(pkb|particles)$/i,''),name=`${base}_CURVE_TREE.pkb`,r=await root.WC3_LOCAL_FILES?.saveBinary?.(name,ui.treePatchedBytes,[{name:'Warcraft PopcornFX',extensions:['pkb']}]);if(!r?.canceled)status(`Saved ${r?.name||name}`);return r;}
  function branchAuthorGroup(row,channel=''){const groups=row?.groups||[],ch=channel||ui.branchAuthorChannel||groups.flatMap(g=>g.channels||[])[0]||'';return groups.find(g=>(g.channels||[]).includes(ch))||null;}
  function branchAuthorScopedModel(row,channel=''){const g=branchAuthorGroup(row,channel);return g?scopeModel(ui.model,g.key,row?.curveRecordId||''):null;}
  function clearBranchAuthoring(renderNow=true){ui.branchAuthorPlan=null;ui.branchAuthorResult=null;ui.branchAuthorBytes=null;if(renderNow)renderBranchAuthoring();}
  function renderBranchAuthoring(){const row=selectedTreeBranch(),section=$('#effectsBranchAuthorSection'),badge=$('#effectsBranchAuthorBadge'),channel=$('#effectsBranchAuthorChannel'),preset=$('#effectsBranchAuthorPreset'),mode=$('#effectsBranchAuthorInterpolation'),fields=$('#effectsBranchAuthorFields'),report=$('#effectsBranchAuthorReport'),stage=$('#effectsBranchAuthorStageBtn'),preview=$('#effectsBranchAuthorPreviewBtn'),save=$('#effectsBranchAuthorSaveBtn'),set=(id,v)=>{const el=$(id);if(el)el.textContent=String(v)};if(!section)return;const channels=[...new Set((row?.groups||[]).flatMap(g=>g.channels||[]))];if(!channels.includes(ui.branchAuthorChannel))ui.branchAuthorChannel=channels[0]||'';if(channel){channel.innerHTML=channels.length?channels.map(ch=>`<option value="${safe(ch)}">${safe(curveMap.get(ch)?.label||ch)}</option>`).join(''):'<option value="">No confirmed curve channel</option>';channel.value=ui.branchAuthorChannel||'';channel.disabled=!channels.length;}if(preset){preset.innerHTML=(BA?.PRESETS||[]).map(x=>`<option value="${safe(x.id)}">${safe(x.label)}</option>`).join('');if(!(BA?.PRESETS||[]).some(x=>x.id===ui.branchAuthorPreset))ui.branchAuthorPreset='source';preset.value=ui.branchAuthorPreset;preset.disabled=!row?.writable;}if(mode){mode.value=ui.branchAuthorInterpolation||'inherit';mode.disabled=!row?.writable;}let info=null,scoped=null;try{if(row&&BA?.templateInfo){scoped=branchAuthorScopedModel(row,ui.branchAuthorChannel);info=BA.templateInfo(currentDoc(),ui.curveTree,state()?.pkbStructuralLayout,state()?.pkbRecordHierarchy,row.id,{curveBindings:scoped?.curveBindings||[],curveModeBindings:scoped?.curveModeBindings||[]});}}catch(_){}const editable=(info?.fields||[]).filter(f=>!f.isCurve&&!f.isInterpolation);if(fields)fields.innerHTML=editable.length?editable.map(f=>{const val=ui.branchAuthorValues[f.key]??'';return`<label class="effects-branch-author-field"><span>${safe(f.role.toUpperCase())} · ${safe(f.propertyLabel)} <em>${safe(f.type.toUpperCase())} · ${safe(f.offsetHex)}</em></span><input data-branch-author-field="${safe(f.key)}" inputmode="decimal" value="${safe(val)}" placeholder="inherit ${safe(Number.isFinite(Number(f.value))?String(f.value):'source')}"/><button class="btn micro ghost" type="button" data-branch-author-reset="${safe(f.key)}">↺</button></label>`;}).join(''):'<div class="effects-real-empty compact">No confirmed non-curve scalar fields are available in this template branch.</div>';set('#effectsBranchAuthorTemplate',row?`${row.rendererLabel} → ${row.samplerLabel} → ${row.curveLabel}`:'NONE');set('#effectsBranchAuthorStorage',info?.curveIsolation||'—');set('#effectsBranchAuthorWrites',ui.branchAuthorPlan?.summary?.scalarWrites||0);set('#effectsBranchAuthorNewSize',ui.branchAuthorPlan?.summary?.newSize||0);if(badge){const ready=!!row?.writable&&!!channels.length&&!!info?.strictLinks;badge.textContent=ready?'TEMPLATE READY':'BLOCKED';badge.classList.toggle('ok',ready);badge.classList.toggle('warn',!ready);}if(stage)stage.disabled=!row?.writable||!channels.length||!info?.strictLinks;if(preview)preview.disabled=!ui.branchAuthorPlan;if(save)save.disabled=!(ui.branchAuthorBytes instanceof Uint8Array);if(report){let txt=cleanUiVersion(BA?.reportText?.(ui.branchAuthorPlan,ui.branchAuthorResult)||'NEW BRANCH · no staged branch.');if(info)txt+=`\n\nTEMPLATE EVIDENCE\nCurve storage: ${info.curveIsolation}\nInline confirmed curve bindings: ${info.inlineCurveBindings?.length||0}\nInline interpolation mappings: ${info.inlineModeBindings?.length||0}\nStrict R→S→C template links: ${info.strictLinks?'YES':'NO'}`;report.textContent=txt;}}
  function stageBranchAuthoringV8(){if(!BA?.createBranchPlan)throw new Error('New Branch module is unavailable.');const row=selectedTreeBranch();if(!row)throw new Error('Select a structural template branch first.');const channel=$('#effectsBranchAuthorChannel')?.value||ui.branchAuthorChannel||'',group=branchAuthorGroup(row,channel);if(!group)throw new Error('Selected branch has no confirmed curve group for this channel.');ui.branchAuthorChannel=channel;ui.branchAuthorPreset=$('#effectsBranchAuthorPreset')?.value||ui.branchAuthorPreset||'source';ui.branchAuthorInterpolation=$('#effectsBranchAuthorInterpolation')?.value||ui.branchAuthorInterpolation||'inherit';const scoped=scopeModel(ui.model,group.key,row.curveRecordId||''),points=ui.branchAuthorPreset==='source'?sourceCurves(scoped)[channel]:ui.branchAuthorPreset==='custom'?clone(ui.curves[channel]||sourceCurves(scoped)[channel]):BA.presetPoints(ui.branchAuthorPreset,channel),s=state(),plan=BA.createBranchPlan(currentDoc(),ui.curveTree,s?.pkbStructuralLayout,s?.pkbRecordHierarchy,s?.pkbMultiArrayDomains,row.id,{channel,preset:ui.branchAuthorPreset,interpolation:ui.branchAuthorInterpolation,curvePoints:points,curveBindings:scoped?.curveBindings||[],curveModeBindings:scoped?.curveModeBindings||[],scalarOverrides:ui.branchAuthorValues,alignment:16});ui.branchAuthorPlan=plan;ui.branchAuthorResult=null;ui.branchAuthorBytes=null;renderBranchAuthoring();status(`New Branch staged · ${channel} · ${ui.branchAuthorPreset} · ${plan.summary?.scalarWrites||0} confirmed scalar write(s).`);return plan;}
  function previewBranchAuthoringV8(){if(!ui.branchAuthorPlan)throw new Error('Stage a new branch first.');const result=BA.applyBranchPlan(currentDoc(),ui.branchAuthorPlan);ui.branchAuthorResult=result;ui.branchAuthorBytes=Uint8Array.from(result.bytes);renderBranchAuthoring();status(`New Branch preview verified · Renderer/Sampler/Curve inserted · ${result.verification?.appendedBytes||0} byte(s) appended.`);return result;}
  async function saveBranchAuthoringV8(){if(!(ui.branchAuthorBytes instanceof Uint8Array)||!ui.branchAuthorResult?.verification?.sourcePreservedOutsideMetadata)throw new Error('Preview and verify a new-branch transaction first.');const base=text(sourceName()||'effect.pkb').replace(/\.(pkb|particles)$/i,''),name=`${base}_BRANCH.pkb`,r=await root.WC3_LOCAL_FILES?.saveBinary?.(name,ui.branchAuthorBytes,[{name:'Warcraft PopcornFX',extensions:['pkb']}]);if(!r?.canceled)status(`Saved ${r?.name||name}`);return r;}
  function invalidateStructuralSessionV9(renderNow=true){ui.structSessionPlan=null;ui.structSessionResult=null;ui.structSessionBytes=null;if(renderNow){renderStructuralSessionV9();renderCurveTree();}}
  function ensureStructuralSessionV9(){if(!SS?.createSession)throw new Error('Structural Session module is unavailable.');if(!ui.curveTree)buildCurveTreeV7();if(!ui.structSession)ui.structSession=SS.createSession(currentDoc(),{label:'Real Effect Editor'});SS.ensureSession?.(ui.structSession,currentDoc());return ui.structSession;}
  function collectBranchAuthorDraftV9(){const row=selectedTreeBranch();if(!row)throw new Error('Select a writable structural template first.');const channel=$('#effectsBranchAuthorChannel')?.value||ui.branchAuthorChannel||'',group=branchAuthorGroup(row,channel);if(!group)throw new Error('Selected template has no confirmed curve group for this channel.');const scoped=scopeModel(ui.model,group.key,row.curveRecordId||''),preset=$('#effectsBranchAuthorPreset')?.value||ui.branchAuthorPreset||'source',interpolation=$('#effectsBranchAuthorInterpolation')?.value||ui.branchAuthorInterpolation||'inherit',points=preset==='source'?null:preset==='custom'?clone(ui.curves[channel]||sourceCurves(scoped)[channel]):BA.presetPoints(preset,channel);return{templateBranchId:row.id,label:`${row.rendererLabel} · ${curveMap.get(channel)?.label||channel}`,channel,preset,interpolation,scalarOverrides:clone(ui.branchAuthorValues),curvePoints:clone(points),curveBindings:clone(scoped?.curveBindings||[]),curveModeBindings:clone(scoped?.curveModeBindings||[])};}
  function addCurrentBranchToSessionV9(){const session=ensureStructuralSessionV9(),draft=collectBranchAuthorDraftV9();const added=SS.addDraft(session,ui.curveTree,draft.templateBranchId,draft);ui.selectedSessionDraft=added.id;invalidateStructuralSessionV9(false);loadStructuralSessionDraftV9(added.id,{render:false});renderCurveTree();status(`Structural Session: added ${added.id} · ${added.channel} · ${added.preset}.`);return added;}
  function loadStructuralSessionDraftV9(id,{render=true}={}){const session=ensureStructuralSessionV9(),d=(session.drafts||[]).find(x=>x.id===id);if(!d)throw new Error(`Virtual branch draft not found: ${id}`);ui.selectedSessionDraft=d.id;session.selectedId=d.id;ui.selectedTreeBranch=d.templateBranchId;ui.branchAuthorChannel=d.channel;ui.branchAuthorPreset=d.preset;ui.branchAuthorInterpolation=d.interpolation;ui.branchAuthorValues=clone(d.scalarOverrides||{});const row=selectedTreeBranch(),g=branchAuthorGroup(row,d.channel);if(g){ui.curveScopeKey=g.key;ui.curveScopeRecordId=row.curveRecordId||'';ui.selectedCurve=d.channel;ui.curveSelected=0;const scoped=scopeModel(ui.model,g.key,row.curveRecordId||''),src=sourceCurves(scoped),modes=sourceCurveModes(scoped),pts=d.curvePoints?.length?d.curvePoints:d.preset==='source'?src[d.channel]:BA.presetPoints(d.preset,d.channel);ui.curves[d.channel]=normalizeCurvePoints(pts||src[d.channel],d.channel);ui.curveModes[d.channel]=d.interpolation==='inherit'?(modes[d.channel]||'linear'):d.interpolation;}clearBranchAuthoring(false);if(render){renderCurveEditor();renderCurveTree();refreshDirtyUi();}return d;}
  function updateStructuralSessionDraftV9(){const session=ensureStructuralSessionV9(),id=ui.selectedSessionDraft||session.selectedId;if(!id)throw new Error('Select a virtual branch draft first.');const draft=collectBranchAuthorDraftV9(),next=SS.updateDraft(session,ui.curveTree,id,draft);ui.selectedSessionDraft=next.id;invalidateStructuralSessionV9(false);renderCurveTree();status(`Structural Session: updated ${next.id}.`);return next;}
  function duplicateStructuralSessionDraftV9(){const session=ensureStructuralSessionV9(),id=ui.selectedSessionDraft||session.selectedId;if(!id)throw new Error('Select a virtual branch draft first.');const d=SS.duplicateDraft(session,ui.curveTree,id);ui.selectedSessionDraft=d.id;invalidateStructuralSessionV9(false);loadStructuralSessionDraftV9(d.id,{render:false});renderCurveTree();status(`Structural Session: duplicated ${id} → ${d.id}.`);return d;}
  function removeStructuralSessionDraftV9(){const session=ensureStructuralSessionV9(),id=ui.selectedSessionDraft||session.selectedId;if(!id)throw new Error('Select a virtual branch draft first.');const d=SS.removeDraft(session,id);ui.selectedSessionDraft=session.selectedId||'';invalidateStructuralSessionV9(false);if(ui.selectedSessionDraft)loadStructuralSessionDraftV9(ui.selectedSessionDraft,{render:false});renderCurveTree();status(`Structural Session: removed ${d.id}.`);return d;}
  function clearStructuralSessionV9(){if(ui.structSession)SS?.clearDrafts?.(ui.structSession);ui.structSession=null;ui.selectedSessionDraft='';ui.structSessionPlan=null;ui.structSessionResult=null;ui.structSessionBytes=null;renderCurveTree();status('Structural Session cleared.');}
  function compileStructuralSessionV9(){const session=ensureStructuralSessionV9(),s=state(),plan=SS.compileSession(currentDoc(),ui.curveTree,s?.pkbStructuralLayout,s?.pkbRecordHierarchy,s?.pkbMultiArrayDomains,session,{alignment:16}),result=SS.applySession(currentDoc(),plan);ui.structSessionPlan=plan;ui.structSessionResult=result;ui.structSessionBytes=Uint8Array.from(result.bytes);session.lastPlan={summary:clone(plan.summary),revision:plan.revision};session.lastResult={verification:clone(result.verification),branches:clone(result.branches)};renderCurveTree();status(`Structural Session compiled · ${plan.summary.virtualBranches} branch(es) · ${result.verification.nativeInsertCount||0} native record(s) · ${result.verification.appendedBytes||0} B appended.`);return result;}
  async function saveStructuralSessionV9(){if(!(ui.structSessionBytes instanceof Uint8Array)||!ui.structSessionResult?.verification?.sourcePreservedOutsideMetadata)throw new Error('Compile and verify the Structural Session first.');const base=text(sourceName()||'effect.pkb').replace(/\.(pkb|particles)$/i,''),name=`${base}_SESSION.pkb`,r=await root.WC3_LOCAL_FILES?.saveBinary?.(name,ui.structSessionBytes,[{name:'Warcraft PopcornFX',extensions:['pkb']}]);if(!r?.canceled)status(`Saved ${r?.name||name}`);return r;}
  function renderStructuralSessionV9(){const section=$('#effectsStructuralSessionSection');if(!section)return;const session=ui.structSession,badge=$('#effectsStructuralSessionBadge'),list=$('#effectsStructuralSessionList'),report=$('#effectsStructuralSessionReport'),set=(id,v)=>{const el=$(id);if(el)el.textContent=String(v)};set('#effectsStructuralSessionDraftCount',session?.drafts?.length||0);set('#effectsStructuralSessionDomain',session?.domainId||'—');set('#effectsStructuralSessionRevision',session?.revision||0);set('#effectsStructuralSessionSize',ui.structSessionPlan?.summary?.newSize||currentDoc()?.size||0);if(badge){badge.textContent=!session?'NO SESSION':ui.structSessionResult?'COMPILED':session.drafts?.length?'DRAFT SESSION':'EMPTY SESSION';badge.classList.toggle('ok',!!ui.structSessionResult);badge.classList.toggle('warn',!ui.structSessionResult);}if(list)list.innerHTML=session?.drafts?.length?session.drafts.map(d=>{const compiled=(ui.structSessionResult?.branches||[]).find(x=>x.id===d.id);return`<button type="button" class="effects-session-row${d.id===ui.selectedSessionDraft?' active':''}" data-session-draft="${safe(d.id)}"><span>${safe(compiled?'COMPILED':'VIRTUAL')} · ${safe(d.id)} · ${safe(d.channel)} · ${safe(d.preset)} · ${safe(d.interpolation)}</span><strong>${safe(d.label)}</strong>${compiled?`<em>R ${safe(compiled.renderer?.offset??'—')} → S ${safe(compiled.sampler?.offset??'—')} → C ${safe(compiled.curve?.offset??'—')}</em>`:''}</button>`;}).join(''):'Add the current Branch Authoring draft to start a virtual structural session.';list?.querySelectorAll?.('[data-session-draft]')?.forEach(b=>b.addEventListener('click',()=>{try{loadStructuralSessionDraftV9(b.dataset.sessionDraft||'');}catch(e){status(`Structural Session load failed: ${e.message||e}`);}}));const selected=!!(session?.drafts||[]).find(x=>x.id===ui.selectedSessionDraft),compile=$('#effectsStructuralSessionCompileBtn'),save=$('#effectsStructuralSessionSaveBtn'),update=$('#effectsStructuralSessionUpdateBtn'),dup=$('#effectsStructuralSessionDuplicateBtn'),rem=$('#effectsStructuralSessionRemoveBtn');if(compile)compile.disabled=!(session?.drafts?.length);if(save)save.disabled=!(ui.structSessionBytes instanceof Uint8Array);if(update)update.disabled=!selected;if(dup)dup.disabled=!selected;if(rem)rem.disabled=!selected;if(report)report.textContent=cleanUiVersion(SS?.reportText?.(session,ui.structSessionPlan,ui.structSessionResult)||'STRUCTURAL SESSION · no active session.');}
  function renderCurveTree(){const tree=ui.curveTree,virtual=SS?.buildVirtualTree?SS.buildVirtualTree(tree,ui.structSession,ui.structSessionResult):{branches:tree?.branches||[],virtualCount:0},box=$('#effectsCurveTreeList'),report=$('#effectsCurveTreeReport'),badge=$('#effectsCurveTreeBadge'),scope=$('#effectsCurveTreeScope');const set=(id,v)=>{const el=$(id);if(el)el.textContent=String(v)};set('#effectsCurveTreeBranchCount',virtual?.branches?.length||0);set('#effectsCurveTreeWritableCount',(tree?.summary?.writable||0)+(virtual?.virtualCount||0));set('#effectsCurveTreeGroupCount',(tree?.summary?.groups||0)+(ui.structSession?.drafts?.length||0));set('#effectsCurveTreeOperation',ui.treeOperation?ui.treeOperation.toUpperCase():'NONE');if(scope)scope.textContent=ui.selectedSessionDraft?`VIRTUAL · ${ui.selectedSessionDraft}`:ui.curveScopeKey?`${ui.selectedCurve} · ${ui.curveScopeKey}`:'ALL MAPPINGS';if(badge){badge.textContent=tree?(tree.summary?.writable?'TREE WRITABLE':'TREE READ-ONLY'):'NO TREE';badge.classList.toggle('ok',!!tree?.summary?.writable);badge.classList.toggle('warn',!tree?.summary?.writable);}if(box)box.innerHTML=virtual?.branches?.length?virtual.branches.map(b=>b.virtual?`<div class="effects-curve-tree-branch virtual${b.draftId===ui.selectedSessionDraft?' active':''}"><button type="button" class="effects-curve-tree-main" data-session-tree-draft="${safe(b.draftId)}"><span>${safe(b.status.toUpperCase())} · domain ${safe(b.domainId||'—')} · ${safe(b.channel)} · ${safe(b.preset)}</span><strong>${safe(b.rendererLabel)} → ${safe(b.samplerLabel)} → ${safe(b.curveLabel)}</strong></button><div class="effects-curve-tree-groups"><div><em>VIRTUAL · ${b.groups?.[0]?.sampleCount||0} confirmed template samples</em><button type="button" class="btn micro primary" data-session-tree-draft="${safe(b.draftId)}">${safe(curveMap.get(b.channel)?.label||b.channel)}</button></div></div>${b.offsets?`<small class="effects-curve-tree-compiled">R ${safe(b.offsets.renderer??'—')} → S ${safe(b.offsets.sampler??'—')} → C ${safe(b.offsets.curve??'—')}</small>`:''}</div>`:`<div class="effects-curve-tree-branch${b.id===ui.selectedTreeBranch&&!ui.selectedSessionDraft?' active':''}"><button type="button" class="effects-curve-tree-main" data-tree-branch="${safe(b.id)}"><span>${safe(b.writable?'WRITABLE':b.status.toUpperCase())} · domain ${safe(b.domainId||'—')}${b.domainStatus?` · ${safe(b.domainStatus.toUpperCase())}`:''}</span><strong>${safe(b.rendererLabel)} → ${safe(b.samplerLabel)} → ${safe(b.curveLabel)}</strong></button><div class="effects-curve-tree-groups">${(b.groups||[]).map(g=>`<div><em>${safe(g.status.toUpperCase())} · ${g.sampleCount} samples</em>${(g.channels||[]).map(ch=>`<button type="button" class="btn micro${ui.curveScopeKey===g.key&&ui.selectedCurve===ch&&!ui.selectedSessionDraft?' primary':''}" data-tree-scope="${safe(b.id)}" data-tree-group="${safe(g.id)}" data-tree-channel="${safe(ch)}">${safe(curveMap.get(ch)?.label||ch)}</button>`).join('')}</div>`).join('')||'<small>No confirmed curve group bound to this Curve record.</small>'}</div>${b.blockedReasons?.length?`<small class="effects-curve-tree-blocked">${safe(b.blockedReasons.join(' · '))}</small>`:''}</div>`).join(''):'Build Curve Structure first; the tree only displays decoded structural evidence.';box?.querySelectorAll?.('[data-tree-branch]')?.forEach(b=>b.addEventListener('click',()=>{ui.selectedSessionDraft='';if(ui.structSession)ui.structSession.selectedId='';ui.selectedTreeBranch=b.dataset.treeBranch||'';ui.branchAuthorValues={};clearBranchAuthoring(false);renderCurveTree();}));box?.querySelectorAll?.('[data-tree-scope]')?.forEach(b=>b.addEventListener('click',()=>{try{ui.selectedSessionDraft='';activateCurveScope(b.dataset.treeScope||'',b.dataset.treeGroup||'',b.dataset.treeChannel||'size');}catch(e){status(`Curve scope failed: ${e.message||e}`);}}));box?.querySelectorAll?.('[data-session-tree-draft]')?.forEach(b=>b.addEventListener('click',()=>{try{loadStructuralSessionDraftV9(b.dataset.sessionTreeDraft||'');}catch(e){status(`Virtual branch load failed: ${e.message||e}`);}}));const dup=$('#effectsCurveTreeDuplicateBtn'),rem=$('#effectsCurveTreeRemoveBtn'),prev=$('#effectsCurveTreePreviewBtn'),save=$('#effectsCurveTreeSaveBtn'),selected=selectedTreeBranch(),virtualSelected=!!ui.selectedSessionDraft;if(dup)dup.disabled=virtualSelected||!selected?.writable;if(rem)rem.disabled=virtualSelected||!selected?.writable;if(prev)prev.disabled=!ui.treePlan;if(save)save.disabled=!(ui.treePatchedBytes instanceof Uint8Array);if(report)report.textContent=cleanUiVersion(CT?.reportText?.(tree,ui.treePlan,ui.treeResult)||'CURVE TREE · no structural tree yet.');renderBranchAuthoring();renderStructuralSessionV9();}
  function confirmInterpolationMapping(){
    if(!CS?.interpolationEntries)throw new Error('Curve Structure interpolation writer is unavailable.');const s=state(),candidate=selectedInterpolationCandidate();if(!candidate)throw new Error('Choose an interpolation enum candidate first.');const channel=$('#effectsCurveInterpolationChannel')?.value||ui.selectedCurve||'size',mapping={linear:Number($('#effectsCurveEnumLinear')?.value),step:Number($('#effectsCurveEnumStep')?.value),hermite:Number($('#effectsCurveEnumHermite')?.value)},note=$('#effectsCurveInterpolationNote')?.value||'',entries=CS.interpolationEntries(candidate,{channel,mapping,status:'confirmed',note,fileName:sourceName()}),catalog=CS.mergeCatalog(s?.pkbFieldCatalog,entries);lab()?.setFieldCatalogModel?.(catalog);rebuild();buildCurveStructureV6();status(`Confirmed interpolation mapping for ${channel}: Linear=${mapping.linear}, Step=${mapping.step}, Hermite=${mapping.hermite} · ${entries.length} PKB field(s).`);return entries;
  }
  function handleCurveCanvasDown(e){
    const canvas=e.currentTarget;if(!ui.model?.ready)return;const pos=curveCanvasCoords(e,canvas),pts=selectedCurvePoints(),ch=selectedCurveDef(),r=canvas.getBoundingClientRect(),pad={l:38,r:14,t:14,b:28},cw=Math.max(1,r.width-pad.l-pad.r),hh=Math.max(1,r.height-pad.t-pad.b),px=t=>pad.l+t*cw,py=v=>pad.t+(1-(v-ch.min)/Math.max(1e-9,ch.max-ch.min))*hh;
    let best=-1,dist=Infinity;pts.forEach((p,i)=>{const d=Math.hypot(px(p.t)-pos.x,py(p.v)-pos.y);if(d<dist){dist=d;best=i;}});if(dist>14)return;ui.curveSelected=best;ui.curveDrag={index:best,pointerId:e.pointerId};canvas.setPointerCapture?.(e.pointerId);renderCurveEditor();
  }
  function handleCurveCanvasMove(e){
    if(!ui.curveDrag||ui.curveDrag.pointerId!==e.pointerId)return;const pts=selectedCurvePoints(),i=ui.curveDrag.index,pos=curveCanvasCoords(e,e.currentTarget);if(!pts[i])return;pts[i].v=pos.v;if(i>0&&i<pts.length-1)pts[i].t=clamp(pos.t,pts[i-1].t+.005,pts[i+1].t-.005);ui.curves[ui.selectedCurve]=normalizeCurvePoints(pts,ui.selectedCurve);ui.curvePreset='custom';invalidatePatch(false);renderCurvePointList();drawCurveEditor();refreshDirtyUi();
  }
  function handleCurveCanvasUp(e){if(ui.curveDrag&&ui.curveDrag.pointerId===e.pointerId)ui.curveDrag=null;}
  async function openPkb(){
    const api=root.WC3_EFFECTS;
    if(!api?.choosePkb)throw new Error('PKB picker is unavailable.');
    const picked=await api.choosePkb();
    if(!picked||picked.canceled)return null;
    lab()?.inspectPkbPayload?.(picked);
    rebuild();
    lab()?.setView?.('pkb');
    status(`Real Effect Editor: ${picked.name} loaded.`);
    return picked;
  }
  async function applyPreview(){
    if(!ui.model?.ready)throw new Error('Inspect a PKB first.');
    const changes=currentChanges();
    if(changes.invalid.length)throw new Error(changes.invalid[0].reason||'Fix invalid values before preview.');
    const motion=$('#effectsRealMotion')?.value||'source',texture=textureDraft(),m=activeModel(),draft=activeCurveDrafts(),over=previewOverrides(m,ui.values,motion,texture,draft.curves,draft.modes);
    await lab()?.setRealEditorPreview?.(over,{loadTexture:true});
    lab()?.setView?.('designer');
    lab()?.setPreviewMode?.('live');
    status(`Real Effect Editor preview applied · ${changes.summary.dirty} staged edit(s) · ${changes.summary.curveChanges} curve channel(s). Binary source is unchanged.`);
    return over;
  }
  function previewPatch(){
    if(!ui.model?.ready)throw new Error('Inspect a PKB first.');
    const doc=currentDoc(),row=selectedTextureRow(),textureId=row?.id||'',texturePath=textureDraft(row),m=activeModel(),draft=activeCurveDrafts(),result=applyEdits(doc,m,{values:ui.values,textureId,texturePath,curves:draft.curves,curveModes:draft.modes});
    ui.patch={...result,next:undefined};
    ui.patchedBytes=Uint8Array.from(result.next._sourceBytes);
    render();
    status(`Real Effect Editor safe patch: ${result.diff.changedBytes} changed byte(s), ${result.curvePlan?.operations?.length||0} curve write(s), ${result.curveModePlan?.operations?.length||0} mode write(s), ${result.validation.summary.pass}/${result.validation.summary.total} safety checks passed.`);
    return ui.patch;
  }
  async function savePkb(){
    if(!(ui.patchedBytes instanceof Uint8Array)||!ui.patch?.validation?.safe)throw new Error('Preview a validated safe patch first.');
    const base=text(sourceName()||'effect.pkb').replace(/\.(pkb|particles)$/i,''),name=`${base}_REAL_EDITOR.pkb`;
    const r=await root.WC3_LOCAL_FILES?.saveBinary?.(name,ui.patchedBytes,[{name:'Warcraft PopcornFX',extensions:['pkb']}]);
    if(!r?.canceled)status(`Saved ${r?.name||name}`);
    return r;
  }
  function resetPreview(){lab()?.setRealEditorPreview?.({enabled:false},{loadTexture:false});status('Real Effect Editor preview overrides cleared.');}
  function useLiveTexture(){
    const v=$('#effectsLiveTexture')?.value||'';
    if(!v)return status('Live Effect has no texture path to copy.');
    const t=selectedTextureRow();
    if(t)ui.textureDrafts[t.id]=v;
    const el=$('#effectsRealTexturePath');
    if(el)el.value=v;
    invalidatePatch(false);
    refreshDirtyUi();
  }
  function bind(){
    if(ui.bound)return;
    ui.bound=true;
    $('#effectsRealOpenPkbBtn')?.addEventListener('click',()=>openPkb().catch(e=>status(`Real Effect Editor open failed: ${e.message||e}`)));
    $('#effectsRealRefreshBtn')?.addEventListener('click',rebuild);
    $('#effectsRealResetDraftBtn')?.addEventListener('click',resetDrafts);
    $('#effectsRealRecordSelect')?.addEventListener('change',e=>{ui.selectedRecord=e.target.value||'all';render();});
    $('#effectsRealPreset')?.addEventListener('change',e=>applyPreset(e.target.value||'custom'));
    $('#effectsRealMotion')?.addEventListener('change',e=>{const motion=e.target.value||'source';if(!ui.model?.ready)return;applyPreview().then(()=>status(`Preview motion: ${motion}.`)).catch(err=>status(`Preview motion failed: ${err.message||err}`));});
    $('#effectsRealTextureSelect')?.addEventListener('change',e=>{ui.selectedTexture=e.target.value||'';const t=selectedTextureRow(),p=$('#effectsRealTexturePath');if(p)p.value=textureDraft(t);refreshDirtyUi();status(`Texture dependency: ${t?.path||'none'}.`);});
    $('#effectsRealTexturePath')?.addEventListener('input',e=>{const t=selectedTextureRow();if(t)ui.textureDrafts[t.id]=e.target.value;ui.preset='custom';const p=$('#effectsRealPreset');if(p)p.value='custom';invalidatePatch(false);refreshDirtyUi();});
    $('#effectsRealUseLiveTextureBtn')?.addEventListener('click',useLiveTexture);
    $('#effectsRealFields')?.addEventListener('input',e=>{const id=e.target?.dataset?.realField;if(!id)return;ui.values[id]=e.target.value;ui.preset='custom';const p=$('#effectsRealPreset');if(p)p.value='custom';invalidatePatch(false);refreshDirtyUi();});
    $('#effectsRealFields')?.addEventListener('click',e=>{const id=e.target?.dataset?.realReset;if(id)resetField(id);});
    $('#effectsRealCurveChannel')?.addEventListener('change',e=>{ui.selectedCurve=e.target.value||'size';ui.curveSelected=0;ui.curvePreset='custom';renderCurveEditor();refreshDirtyUi();});
    $('#effectsRealCurvePreset')?.addEventListener('change',e=>{const id=e.target.value||'custom';if(id!=='custom')applyCurvePreset(id);else ui.curvePreset='custom';});
    $('#effectsRealCurveInterpolation')?.addEventListener('change',e=>{ui.curveModes[ui.selectedCurve]=['linear','step','hermite'].includes(e.target.value)?e.target.value:'linear';ui.curvePreset='custom';invalidatePatch(false);renderCurveEditor();refreshDirtyUi();});
    $('#effectsRealCurveAddBtn')?.addEventListener('click',()=>addCurvePoint(.5));
    $('#effectsRealCurveDeleteBtn')?.addEventListener('click',()=>deleteCurvePoint());
    $('#effectsRealCurveResetBtn')?.addEventListener('click',()=>resetCurve());
    $('#effectsRealCurveResetAllBtn')?.addEventListener('click',resetAllCurves);
    $('#effectsRealCurvePoints')?.addEventListener('click',e=>{const select=e.target?.dataset?.curveSelect,del=e.target?.dataset?.curveDelete;if(select!=null){ui.curveSelected=Number(select);renderCurveEditor();}else if(del!=null)deleteCurvePoint(Number(del));});
    $('#effectsRealCurvePoints')?.addEventListener('input',e=>{const ti=e.target?.dataset?.curveTime,vi=e.target?.dataset?.curveValue,ii=e.target?.dataset?.curveIn,oi=e.target?.dataset?.curveOut,pts=selectedCurvePoints(),ch=selectedCurveDef();if(ti!=null&&pts[Number(ti)])pts[Number(ti)].t=clamp(Number(e.target.value)||0,0,1);if(vi!=null&&pts[Number(vi)])pts[Number(vi)].v=clamp(Number(e.target.value)||0,ch.min,ch.max);if(ii!=null&&pts[Number(ii)])pts[Number(ii)].in=Number(e.target.value)||0;if(oi!=null&&pts[Number(oi)])pts[Number(oi)].out=Number(e.target.value)||0;setCurvePoints(pts,{renderAll:false});renderCurvePointList();drawCurveEditor();});
    const canvas=$('#effectsRealCurveCanvas');
    canvas?.addEventListener('pointerdown',handleCurveCanvasDown);canvas?.addEventListener('pointermove',handleCurveCanvasMove);canvas?.addEventListener('pointerup',handleCurveCanvasUp);canvas?.addEventListener('pointercancel',handleCurveCanvasUp);canvas?.addEventListener('dblclick',e=>{const p=curveCanvasCoords(e,e.currentTarget);addCurvePoint(p.t,p.v);});
    root.addEventListener?.('resize',()=>drawCurveEditor());
    $('#effectsCurveDiscoveryScanBtn')?.addEventListener('click',()=>{try{scanCurveDiscovery(false);}catch(e){status(`Curve discovery failed: ${e.message||e}`);}});
    $('#effectsCurveDiscoveryPairBtn')?.addEventListener('click',()=>{try{scanCurveDiscovery(true);}catch(e){status(`Curve pair discovery failed: ${e.message||e}`);}});
    $('#effectsCurveDiscoveryChannel')?.addEventListener('change',e=>{const s=state();if(s)s.curveDiscoveryChannel=e.target.value||'size';renderCurveDiscovery();});
    $('#effectsCurveDiscoveryComplexTarget')?.addEventListener('change',e=>{const s=state();if(s)s.curveDiscoveryTarget=e.target.value||'color-rgb';renderCurveDiscovery();});
    $('#effectsCurveDiscoveryProbableBtn')?.addEventListener('click',()=>{try{promoteCurveDiscovery('probable');}catch(e){status(`Curve promotion failed: ${e.message||e}`);}});
    $('#effectsCurveDiscoveryConfirmBtn')?.addEventListener('click',()=>{try{promoteCurveDiscovery('confirmed');}catch(e){status(`Curve confirmation failed: ${e.message||e}`);}});
    $('#effectsCurveStructureBuildBtn')?.addEventListener('click',()=>{try{buildCurveStructureV6();}catch(e){status(`Curve Structure failed: ${e.message||e}`);}});
    $('#effectsCurveTreeBuildBtn')?.addEventListener('click',()=>{try{buildCurveTreeV7();}catch(e){status(`Curve Tree failed: ${e.message||e}`);}});
    $('#effectsCurveTreeClearScopeBtn')?.addEventListener('click',clearCurveScope);
    $('#effectsCurveTreeDuplicateBtn')?.addEventListener('click',()=>{try{stageCurveTreeOperation('duplicate');}catch(e){status(`Duplicate branch blocked: ${e.message||e}`);}});
    $('#effectsCurveTreeRemoveBtn')?.addEventListener('click',()=>{try{stageCurveTreeOperation('remove');}catch(e){status(`Remove branch blocked: ${e.message||e}`);}});
    $('#effectsCurveTreeClearOpBtn')?.addEventListener('click',clearCurveTreeOperation);
    $('#effectsCurveTreePreviewBtn')?.addEventListener('click',()=>{try{previewCurveTreeTransaction();}catch(e){ui.treeResult=null;ui.treePatchedBytes=null;renderCurveTree();status(`Curve Tree preview blocked: ${e.message||e}`);}});
    $('#effectsCurveTreeSaveBtn')?.addEventListener('click',()=>saveCurveTreePkb().catch(e=>status(`Curve Tree save failed: ${e.message||e}`)));
    $('#effectsBranchAuthorChannel')?.addEventListener('change',e=>{ui.branchAuthorChannel=e.target.value||'';clearBranchAuthoring(false);renderBranchAuthoring();});
    $('#effectsBranchAuthorPreset')?.addEventListener('change',e=>{ui.branchAuthorPreset=e.target.value||'source';clearBranchAuthoring(false);renderBranchAuthoring();});
    $('#effectsBranchAuthorInterpolation')?.addEventListener('change',e=>{ui.branchAuthorInterpolation=e.target.value||'inherit';clearBranchAuthoring(false);renderBranchAuthoring();});
    $('#effectsBranchAuthorFields')?.addEventListener('input',e=>{const k=e.target?.dataset?.branchAuthorField;if(!k)return;ui.branchAuthorValues[k]=e.target.value;clearBranchAuthoring(false);const p=$('#effectsBranchAuthorPreviewBtn'),sv=$('#effectsBranchAuthorSaveBtn'),r=$('#effectsBranchAuthorReport');if(p)p.disabled=true;if(sv)sv.disabled=true;if(r)r.textContent='NEW BRANCH · draft changed; stage the new branch again.';});
    $('#effectsBranchAuthorFields')?.addEventListener('change',()=>renderBranchAuthoring());
    $('#effectsBranchAuthorFields')?.addEventListener('click',e=>{const k=e.target?.dataset?.branchAuthorReset;if(!k)return;delete ui.branchAuthorValues[k];clearBranchAuthoring(false);renderBranchAuthoring();});
    $('#effectsBranchAuthorStageBtn')?.addEventListener('click',()=>{try{stageBranchAuthoringV8();}catch(e){status(`New Branch blocked: ${e.message||e}`);}});
    $('#effectsBranchAuthorClearBtn')?.addEventListener('click',()=>{ui.branchAuthorValues={};ui.branchAuthorPreset='source';ui.branchAuthorInterpolation='inherit';clearBranchAuthoring();status('New Branch draft cleared.');});
    $('#effectsBranchAuthorPreviewBtn')?.addEventListener('click',()=>{try{previewBranchAuthoringV8();}catch(e){ui.branchAuthorResult=null;ui.branchAuthorBytes=null;renderBranchAuthoring();status(`New Branch preview blocked: ${e.message||e}`);}});
    $('#effectsBranchAuthorSaveBtn')?.addEventListener('click',()=>saveBranchAuthoringV8().catch(e=>status(`New Branch save failed: ${e.message||e}`)));
    $('#effectsStructuralSessionAddBtn')?.addEventListener('click',()=>{try{addCurrentBranchToSessionV9();}catch(e){status(`Structural Session add blocked: ${e.message||e}`);}});
    $('#effectsStructuralSessionUpdateBtn')?.addEventListener('click',()=>{try{updateStructuralSessionDraftV9();}catch(e){status(`Structural Session update blocked: ${e.message||e}`);}});
    $('#effectsStructuralSessionDuplicateBtn')?.addEventListener('click',()=>{try{duplicateStructuralSessionDraftV9();}catch(e){status(`Structural Session duplicate blocked: ${e.message||e}`);}});
    $('#effectsStructuralSessionRemoveBtn')?.addEventListener('click',()=>{try{removeStructuralSessionDraftV9();}catch(e){status(`Structural Session remove blocked: ${e.message||e}`);}});
    $('#effectsStructuralSessionCompileBtn')?.addEventListener('click',()=>{try{compileStructuralSessionV9();}catch(e){ui.structSessionPlan=null;ui.structSessionResult=null;ui.structSessionBytes=null;renderCurveTree();status(`Structural Session compile blocked: ${e.message||e}`);}});
    $('#effectsStructuralSessionClearBtn')?.addEventListener('click',clearStructuralSessionV9);
    $('#effectsStructuralSessionSaveBtn')?.addEventListener('click',()=>saveStructuralSessionV9().catch(e=>status(`Structural Session save failed: ${e.message||e}`)));
    $('#effectsCurveInterpolationChannel')?.addEventListener('change',e=>{const ch=e.target.value||'size';if(curveMap.has(ch)){ui.selectedCurve=ch;ui.curveSelected=0;renderCurveEditor();}status(`Interpolation mapping channel: ${curveMap.get(ch)?.label||ch}.`);});
    $('#effectsCurveInterpolationConfirmBtn')?.addEventListener('click',()=>{try{confirmInterpolationMapping();}catch(e){status(`Interpolation mapping blocked: ${e.message||e}`);}});
    $('#effectsRealApplyPreviewBtn')?.addEventListener('click',()=>applyPreview().catch(e=>status(`Preview failed: ${e.message||e}`)));
    $('#effectsRealResetPreviewBtn')?.addEventListener('click',resetPreview);
    $('#effectsRealPreviewPatchBtn')?.addEventListener('click',()=>{try{previewPatch();}catch(e){ui.patch=null;ui.patchedBytes=null;refreshDirtyUi();status(`Safe patch blocked: ${e.message||e}`);}});
    $('#effectsRealSavePkbBtn')?.addEventListener('click',()=>savePkb().catch(e=>status(`Real Effect Editor save failed: ${e.message||e}`)));
  }
  function init(){bind();rebuild();}
  const api=Object.freeze({SCHEMA,VERSION,CAPABILITIES,COMMON,PRESETS,CURVE_CHANNELS,CURVE_INTERPOLATIONS,CURVE_PRESETS,buildModel,scopeModel,sourceValues,sourceCurves,sourceCurveModes,buildCurveChangeSet,buildChangeSet,applyEdits,validatePatchResult,previewOverrides,applyPresetValues,offsetsForEntry,encodedLength,normalizeCurvePoints,sampleCurve,curvePresetPoints,curveBindings,curveEntryMeta,curveModeBindings,interpolationEntryMeta,init,rebuild,render,renderCurveEditor,renderCurveDiscovery,renderCurveStructure,buildCurveStructureV6,renderCurveTree,buildCurveTreeV7,activateCurveScope,clearCurveScope,stageCurveTreeOperation,clearCurveTreeOperation,previewCurveTreeTransaction,saveCurveTreePkb,renderBranchAuthoring,stageBranchAuthoringV8,previewBranchAuthoringV8,saveBranchAuthoringV8,clearBranchAuthoring,renderStructuralSessionV9,ensureStructuralSessionV9,addCurrentBranchToSessionV9,loadStructuralSessionDraftV9,updateStructuralSessionDraftV9,duplicateStructuralSessionDraftV9,removeStructuralSessionDraftV9,compileStructuralSessionV9,saveStructuralSessionV9,clearStructuralSessionV9,confirmInterpolationMapping,openPkb,applyPreview,previewPatch,savePkb,resetDrafts,resetCurve,resetAllCurves,getState:()=>ui});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  return api;
});
