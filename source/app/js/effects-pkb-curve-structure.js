(function(root,factory){
  'use strict';
  let SR=root?.WC3_EFFECTS_PKB_STRUCTURED_READER||null;
  if(typeof module==='object'&&module.exports){
    try{SR=SR||require('./effects-pkb-structured-reader.js');}catch(_){}
    module.exports=factory(SR);
  }else if(root)root.WC3_EFFECTS_PKB_CURVE_STRUCTURE=factory(SR);
})(typeof window!=='undefined'?window:globalThis,function(SR){
  'use strict';
  const SCHEMA='wc3.effects.pkb-curve-structure',VERSION=1;
  const MODES=Object.freeze(['linear','step','hermite']);
  const TYPES=Object.freeze(['u8','u16','u32']);
  const WIDTH=Object.freeze({u8:1,u16:2,u32:4});
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'');
  const hex=n=>'0x'+Math.max(0,Number(n)||0).toString(16).padStart(8,'0');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rank={confirmed:0,probable:1,heuristic:2};
  function bytesOf(doc){return doc?._sourceBytes instanceof Uint8Array?doc._sourceBytes:null;}
  function offsetsForEntry(entry,fileName=''){
    const name=text(fileName).toLowerCase(),hits=[];
    if(name)for(const ex of entry?.examples||[])if(text(ex.a).toLowerCase()===name||text(ex.b).toLowerCase()===name)hits.push(Number(ex.offset));
    const rows=hits.length?hits:(entry?.offsets||[]).map(Number);
    return[...new Set(rows.filter(Number.isInteger))].sort((a,b)=>a-b);
  }
  function curveMeta(entry){
    const c=entry?.curve||entry?.metadata?.curve||null;
    if(!c)return null;
    const channel=text(c.channel||c.property||'').toLowerCase();
    if(!channel)return null;
    return{channel,index:Number(c.index),time:Number.isFinite(Number(c.time))?Number(c.time):null,count:Number(c.count)||0,role:text(c.role||'value').toLowerCase(),interpolation:text(c.interpolation||'').toLowerCase(),candidateId:text(c.candidateId||''),group:text(c.group||''),layout:text(c.layout||'')};
  }
  function interpolationMeta(entry){
    const m=entry?.curveInterpolation||entry?.metadata?.curveInterpolation||null;
    if(!m)return null;
    const channel=text(m.channel||'').toLowerCase(),map=m.mapping&&typeof m.mapping==='object'?m.mapping:{};
    if(!channel)return null;
    return{channel,recordId:text(m.recordId||''),relativeOffset:Number.isFinite(Number(m.relativeOffset))?Number(m.relativeOffset):null,mapping:{linear:Number(map.linear),step:Number(map.step),hermite:Number(map.hermite)}};
  }
  function recordAt(records,offset){
    return(records||[]).filter(r=>offset>=Number(r?.range?.offset)&&offset<Number(r?.range?.end)).sort((a,b)=>(Number(a.range?.end)-Number(a.range?.offset))-(Number(b.range?.end)-Number(b.range?.offset)))[0]||null;
  }
  function descriptorMap(layout){return new Map((layout?.recordDescriptors||[]).map(x=>[x.recordId,x]));}
  function arrayForRecord(layout,recordId){return(layout?.arrayDescriptors||[]).find(a=>a.kind==='array-layout'&&(a.itemRecordIds||[]).includes(recordId))||null;}
  function candidateById(discovery,id){return[...(discovery?.complexCandidates||[]),...(discovery?.candidates||[])].find(x=>x.id===id)||null;}
  function knownRanges(catalog,discovery,fileName=''){
    const out=[];
    for(const entry of catalog?.entries||[]){
      if(entry.status!=='confirmed')continue;
      const cm=curveMeta(entry);if(!cm)continue;
      const width=Number(entry.width)||4;
      for(const off of offsetsForEntry(entry,fileName))out.push({offset:off,end:off+width,kind:'curve-value',channel:cm.channel});
      const c=candidateById(discovery,cm.candidateId);
      if(c?.samples)for(const s of c.samples){if(Number.isInteger(s.timeOffset))out.push({offset:s.timeOffset,end:s.timeOffset+4,kind:'curve-time'});for(const x of s.componentOffsets||[])if(Number.isInteger(x))out.push({offset:x,end:x+4,kind:'curve-component'});if(Number.isInteger(s.valueOffset))out.push({offset:s.valueOffset,end:s.valueOffset+4,kind:'curve-value'});}
    }
    return out;
  }
  function curveGroups(catalog,semantic,layout,discovery,fileName=''){
    const groups=new Map();
    for(const entry of catalog?.entries||[]){
      if(entry.status!=='confirmed')continue;
      const meta=curveMeta(entry);if(!meta)continue;
      const key=meta.group||meta.candidateId||`${meta.channel}:${meta.layout||'curve'}`;
      let g=groups.get(key);if(!g){g={id:`curve-group-${groups.size}`,key,candidateId:meta.candidateId,group:meta.group,layout:meta.layout,channels:new Set(),interpolations:new Set(),entries:[],offsets:[],recordIds:new Set(),sampleCount:0};groups.set(key,g);}
      g.channels.add(meta.channel);if(MODES.includes(meta.interpolation))g.interpolations.add(meta.interpolation);g.entries.push(entry);g.sampleCount=Math.max(g.sampleCount,meta.count||meta.index+1||0);
      for(const off of offsetsForEntry(entry,fileName)){g.offsets.push(off);const r=recordAt(semantic?.records,off);if(r)g.recordIds.add(r.id);}
    }
    const dmap=descriptorMap(layout);
    return[...groups.values()].map(g=>{
      const recordIds=[...g.recordIds],arrays=[...new Set(recordIds.map(id=>arrayForRecord(layout,id)?.id).filter(Boolean))],descriptors=recordIds.map(id=>dmap.get(id)).filter(Boolean),status=recordIds.length===1&&descriptors[0]?.status==='confirmed'?'confirmed':recordIds.length?'probable':'heuristic';
      return{id:g.id,key:g.key,candidateId:g.candidateId,group:g.group,layout:g.layout,channels:[...g.channels].sort(),interpolations:[...g.interpolations],sampleCount:g.sampleCount,entryCount:g.entries.length,offsets:[...new Set(g.offsets)].sort((a,b)=>a-b),recordIds,arrayDescriptorIds:arrays,status,recordDescriptors:descriptors.map(x=>({id:x.id,recordId:x.recordId,recordType:x.recordType,status:x.status,offset:x.offset,end:x.end}))};
    }).sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||a.offsets[0]-b.offsets[0]);
  }
  function chains(semantic,hierarchy,layout,groups){
    const records=new Map((semantic?.records||[]).map(r=>[r.id,r])),links=hierarchy?.links||[],rs=links.filter(l=>l.sourceType==='Renderer'&&l.targetType==='Sampler'),sc=links.filter(l=>l.sourceType==='Sampler'&&l.targetType==='Curve'),rc=links.filter(l=>l.sourceType==='Renderer'&&l.targetType==='Curve'),byCurve=new Map();
    for(const g of groups)for(const id of g.recordIds){const a=byCurve.get(id)||[];a.push(g.id);byCurve.set(id,a);}
    const out=[];
    for(const a of rs){for(const b of sc.filter(x=>x.sourceRecordId===a.targetRecordId)){const curveGroups=byCurve.get(b.targetRecordId)||[],statuses=[a.status,b.status,records.get(a.sourceRecordId)?.status,records.get(a.targetRecordId)?.status,records.get(b.targetRecordId)?.status],status=statuses.every(x=>x==='confirmed')?'confirmed':statuses.filter(Boolean).every(x=>x==='confirmed'||x==='probable')?'probable':'heuristic';out.push({id:`chain-${out.length}`,rendererRecordId:a.sourceRecordId,samplerRecordId:a.targetRecordId,curveRecordId:b.targetRecordId,rendererLabel:records.get(a.sourceRecordId)?.label||a.sourceLabel||a.sourceRecordId,samplerLabel:records.get(a.targetRecordId)?.label||a.targetLabel||a.targetRecordId,curveLabel:records.get(b.targetRecordId)?.label||b.targetLabel||b.targetRecordId,rendererSamplerLinkId:a.id,samplerCurveLinkId:b.id,curveGroupIds:curveGroups,status,arrayIds:{renderer:arrayForRecord(layout,a.sourceRecordId)?.id||'',sampler:arrayForRecord(layout,a.targetRecordId)?.id||'',curve:arrayForRecord(layout,b.targetRecordId)?.id||''}});}}
    for(const a of rc){if(out.some(x=>x.rendererRecordId===a.sourceRecordId&&x.curveRecordId===a.targetRecordId))continue;out.push({id:`chain-${out.length}`,rendererRecordId:a.sourceRecordId,samplerRecordId:'',curveRecordId:a.targetRecordId,rendererLabel:records.get(a.sourceRecordId)?.label||a.sourceLabel||a.sourceRecordId,samplerLabel:'—',curveLabel:records.get(a.targetRecordId)?.label||a.targetLabel||a.targetRecordId,rendererCurveLinkId:a.id,curveGroupIds:byCurve.get(a.targetRecordId)||[],status:a.status==='confirmed'?'probable':'heuristic',arrayIds:{renderer:arrayForRecord(layout,a.sourceRecordId)?.id||'',sampler:'',curve:arrayForRecord(layout,a.targetRecordId)?.id||''}});}
    return out.sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||a.rendererLabel.localeCompare(b.rendererLabel));
  }
  function readSmall(src,offset,type){const dv=new DataView(src.buffer,src.byteOffset+offset,WIDTH[type]);if(type==='u8')return dv.getUint8(0);if(type==='u16')return dv.getUint16(0,true);return dv.getUint32(0,true);}
  function overlaps(ranges,offset,width){return(ranges||[]).some(r=>offset<r.end&&offset+width>r.offset);}
  function interpolationCandidates(doc,semantic,hierarchy,layout,catalog,discovery,opts={}){
    const src=bytesOf(doc);if(!src)return[];const maxValue=Math.max(2,Number(opts.maxEnumValue)||7),padding=Math.max(0,Math.min(64,Number(opts.padding)||8)),known=knownRanges(catalog,discovery,doc.name||''),pointerRanges=(hierarchy?.links||[]).map(l=>({offset:Number(l.offset),end:Number(l.offset)+4,kind:'pointer'})),descs=descriptorMap(layout),curveRecords=(semantic?.records||[]).filter(r=>r.type==='Curve'),groups=new Map();
    for(const r of curveRecords){const d=descs.get(r.id),base=Number(d?.offset??r.range?.offset)||0,start=Math.max(0,base-padding),end=Math.min(src.length,Number(d?.end??r.range?.end)+padding);for(const type of TYPES){const width=WIDTH[type],aligned=type==='u8'?start:Math.ceil(start/width)*width;for(let off=aligned;off+width<=end;off+=type==='u8'?1:width){if(overlaps(known,off,width)||overlaps(pointerRanges,off,width))continue;let value;try{value=readSmall(src,off,type);}catch(_){continue;}if(!Number.isInteger(value)||value<0||value>maxValue)continue;const rel=off-base,key=`${type}:${rel}`;let g=groups.get(key);if(!g){g={type,width,relativeOffset:rel,occurrences:[],values:new Set()};groups.set(key,g);}g.occurrences.push({recordId:r.id,recordLabel:r.label||r.id,recordStatus:r.status,offset:off,offsetHex:hex(off),value,arrayId:arrayForRecord(layout,r.id)?.id||''});g.values.add(value);}}}
    const total=Math.max(1,curveRecords.length),out=[];
    for(const g of groups.values()){
      const n=g.occurrences.length,distinct=[...g.values].sort((a,b)=>a-b),coverage=n/total;let score=.28+.2*Math.min(1,coverage)+.12*Math.min(1,n/3);if(distinct.length>=2&&distinct.length<=4)score+=.16;if(distinct.every(v=>v<=3))score+=.12;if(g.relativeOffset>=0&&g.relativeOffset<=32)score+=.06;score=clamp(score,0,1);const status=n>=2&&distinct.length>=2&&score>=.72?'probable':'heuristic';out.push({id:`interp:${g.type}:${g.relativeOffset}`,kind:'interpolation-enum-candidate',type:g.type,width:g.width,relativeOffset:g.relativeOffset,relativeOffsetHex:(g.relativeOffset<0?'-':'')+hex(Math.abs(g.relativeOffset)),occurrences:g.occurrences,distinctValues:distinct,recordCoverage:Number(coverage.toFixed(4)),score:Number(score.toFixed(4)),status,manualStatus:'',note:'',confidenceReasons:[`${n}/${total} Curve record(s) share relative offset`,`${distinct.length} distinct small integer value(s)`,distinct.every(v=>v<=3)?'values fit common 0..3 enum range':'values exceed common 0..3 enum range']});
    }
    return out.sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||b.score-a.score||Math.abs(a.relativeOffset)-Math.abs(b.relativeOffset)||a.type.localeCompare(b.type)).slice(0,Math.max(8,Number(opts.limit)||96));
  }
  function summary(model){return{curveGroups:model.curveGroups?.length||0,chains:model.chains?.length||0,confirmedChains:(model.chains||[]).filter(x=>x.status==='confirmed').length,probableChains:(model.chains||[]).filter(x=>x.status==='probable').length,curveArrays:(model.arrays||[]).filter(x=>x.recordType==='Curve').length,samplerArrays:(model.arrays||[]).filter(x=>x.recordType==='Sampler').length,interpolationCandidates:model.interpolationCandidates?.length||0,probableInterpolation:(model.interpolationCandidates||[]).filter(x=>x.status==='probable').length};}
  function buildModel(doc,{catalog=null,semantic=null,hierarchy=null,layout=null,curveDiscovery=null,previous=null}={}){
    if(!doc||!bytesOf(doc))throw new Error('Curve Structure v6 requires a Structured PKB document with source bytes.');const groups=curveGroups(catalog,semantic,layout,curveDiscovery,doc.name||''),chainRows=chains(semantic,hierarchy,layout,groups),arrays=(layout?.arrayDescriptors||[]).filter(x=>x.kind==='array-layout'&&['Renderer','Sampler','Curve'].includes(x.recordType)).map(clone),interp=interpolationCandidates(doc,semantic,hierarchy,layout,catalog,curveDiscovery,{}),manual=new Map((previous?.interpolationCandidates||[]).filter(x=>x.manualStatus).map(x=>[x.id,x]));for(const x of interp){const p=manual.get(x.id);if(p){x.status=p.manualStatus||p.status;x.manualStatus=x.status;x.note=p.note||'';}}
    const model={schema:SCHEMA,version:VERSION,createdAt:new Date().toISOString(),source:{name:doc.name||'',path:doc.path||'',hash:doc.sourceHash?.value||'',size:doc.size||0},curveGroups:groups,chains:chainRows,arrays,interpolationCandidates:interp,notes:['Renderer → Sampler → Curve associations are structural evidence derived from decoded record links.','Array membership is read from the existing Structural Layout Decoder; no array is created or relocated here.','Interpolation enum candidates are small integer fields repeated at the same relative offset across Curve records. Candidate discovery never assigns semantic meanings automatically.','Binary interpolation writes require an explicit mapping for Linear, Step and Hermite plus a validation note.']};model.summary=summary(model);return model;
  }
  function interpolationEntries(candidate,{channel='',mapping={},status='confirmed',note='',fileName=''}={}){
    if(!candidate)throw new Error('Choose an interpolation enum candidate first.');if(!channel)throw new Error('Choose a curve channel for the interpolation mapping.');if(!['probable','confirmed'].includes(status))throw new Error('Interpolation mapping status must be probable or confirmed.');if(status==='confirmed'&&!text(note).trim())throw new Error('A validation note is required before confirming an interpolation enum mapping.');const values={linear:Number(mapping.linear),step:Number(mapping.step),hermite:Number(mapping.hermite)};for(const mode of MODES)if(!Number.isInteger(values[mode])||values[mode]<0||values[mode]>Math.pow(2,candidate.width*8)-1)throw new Error(`${mode} enum value is invalid for ${candidate.type}.`);if(new Set(MODES.map(m=>values[m])).size!==3)throw new Error('Linear, Step and Hermite must use three distinct enum values.');
    return(candidate.occurrences||[]).map((o,i)=>({id:`curve-interpolation:${channel}:${candidate.type}:${candidate.relativeOffset}:${o.recordId}`,propertyId:`curve-interpolation:${channel}:${o.recordId}`,propertyLabel:`${channel} interpolation enum`,type:candidate.type,width:candidate.width,contextSignature:`curve-interpolation:${candidate.type}:${candidate.relativeOffset}`,offsets:[o.offset],experimentCount:0,fileCount:1,averageScore:Number(candidate.score)||0,status,manualStatus:status,note:text(note),curveInterpolation:{channel,recordId:o.recordId,relativeOffset:candidate.relativeOffset,mapping:values,candidateId:candidate.id,source:'v6-curve-structure'},experimentIds:[],examples:[{a:fileName,b:'',aValue:o.value,bValue:null,offset:o.offset,offsetHex:o.offsetHex,score:candidate.score}]}));
  }
  function mergeCatalog(catalog,entries=[]){const base=catalog&&Array.isArray(catalog.entries)?clone(catalog):{schema:'wc3.effects.pkb-semantic-field-catalog',version:1,updatedAt:'',entries:[],counts:{confirmed:0,probable:0,heuristic:0}},map=new Map((base.entries||[]).map(e=>[e.id,e]));for(const e of entries)map.set(e.id,clone(e));base.entries=[...map.values()].sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||text(a.propertyLabel).localeCompare(text(b.propertyLabel)));base.updatedAt=new Date().toISOString();base.counts={confirmed:base.entries.filter(e=>e.status==='confirmed').length,probable:base.entries.filter(e=>e.status==='probable').length,heuristic:base.entries.filter(e=>e.status==='heuristic').length};return base;}
  function reportText(model){if(!model)return'CURVE STRUCTURE v6 · no analysis yet.';const s=model.summary||{},top=model.chains?.[0],ic=model.interpolationCandidates?.[0];return[`CURVE STRUCTURE v6`,`${model.source?.name||'PKB'} · ${model.source?.hash||'no hash'}`,`Curve groups: ${s.curveGroups||0} · structural chains ${s.chains||0} · confirmed ${s.confirmedChains||0} · probable ${s.probableChains||0}`,`Arrays: Curve ${s.curveArrays||0} · Sampler ${s.samplerArrays||0}`,`Interpolation enum candidates: ${s.interpolationCandidates||0} · probable ${s.probableInterpolation||0}`,top?`Top chain: ${top.rendererLabel} → ${top.samplerLabel} → ${top.curveLabel} · ${top.status.toUpperCase()}`:'Top chain: none',ic?`Top enum candidate: ${ic.type.toUpperCase()} rel ${ic.relativeOffsetHex} · values ${ic.distinctValues.join('/')} · score ${ic.score}`:'Top enum candidate: none','','Policy: structure and enum discovery remain evidence. Interpolation writes are locked until Linear/Step/Hermite values are explicitly mapped and CONFIRMED with a validation note.'].join('\n');}
  function publicSnapshot(model){return model?clone(model):null;}
  return Object.freeze({SCHEMA,VERSION,MODES,TYPES,buildModel,curveGroups,chains,interpolationCandidates,interpolationEntries,mergeCatalog,interpolationMeta,publicSnapshot,reportText});
});
