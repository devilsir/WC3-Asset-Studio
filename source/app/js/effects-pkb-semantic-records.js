(function(root,factory){
  'use strict';
  let SR=root?.WC3_EFFECTS_PKB_STRUCTURED_READER||null;
  if(typeof module==='object'&&module.exports){
    try{SR=SR||require('./effects-pkb-structured-reader.js');}catch(_){ }
    module.exports=factory(SR);
  }else if(root)root.WC3_EFFECTS_PKB_SEMANTIC_RECORDS=factory(SR);
})(typeof window!=='undefined'?window:globalThis,function(SR){
  'use strict';
  const VERSION=1;
  const SCHEMA='wc3.effects.pkb-semantic-records';
  const PATCH_SCHEMA='wc3.effects.pkb-semantic-record-patch';
  const TYPES=Object.freeze(['Emitter','Renderer','Sampler','Curve','Unknown']);
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'');
  const uniq=a=>[...new Set((a||[]).filter(Boolean))];
  const hex=n=>'0x'+Math.max(0,Number(n)||0).toString(16).padStart(8,'0');
  const statusRank={confirmed:0,probable:1,heuristic:2};
  const propertyFallback=Object.freeze({
    'size':'Emitter','emission-rate':'Emitter','life-span':'Emitter','speed':'Emitter',
    'alpha':'Renderer','rotation':'Renderer','color-r':'Renderer','color-g':'Renderer','color-b':'Renderer'
  });
  function sourceBytes(doc){return doc?._sourceBytes instanceof Uint8Array?doc._sourceBytes:null;}
  function anchorType(anchor){
    const kind=text(anchor?.kind).toLowerCase(),value=`${text(anchor?.signature)} ${text(anchor?.text)} ${text(anchor?.targetText)}`;
    if(kind==='renderer-string'||/\brenderer:|\b(?:Billboard|Ribbon|Mesh|Light)\b/i.test(value))return'Renderer';
    if(/\bCurve\b/i.test(value))return'Curve';
    if(kind==='sampler-string'||/\bsampler:|\b(?:Shape|Image|VectorField|EventStream|Sphere|Box|Cylinder|Capsule|Plane)\b/i.test(value))return'Sampler';
    if(kind==='graph-string'||/\b(?:layer|spawner|spawn|emitter|particle|event|payload|root)\b/i.test(value))return'Emitter';
    return'';
  }
  function candidateAnchors(doc,offset,maxDistance=384){
    return (doc?.records||[]).filter(r=>Number.isInteger(r.offset)&&r.type!=='xref'&&Math.abs(r.offset-offset)<=maxDistance).map(r=>({
      id:r.id||'',kind:r.kind||'',signature:r.signature||'',text:r.text||r.targetText||'',offset:r.offset,distance:Math.abs(r.offset-offset),recordType:anchorType(r),evidenceStatus:r.evidenceStatus||'heuristic'
    })).filter(r=>r.recordType).sort((a,b)=>a.distance-b.distance||(statusRank[a.evidenceStatus]??9)-(statusRank[b.evidenceStatus]??9)||a.offset-b.offset);
  }
  function offsetsForCatalogEntry(entry,fileName=''){
    const name=text(fileName).toLowerCase(),fromExamples=[];
    if(name)for(const ex of entry?.examples||[]){if(text(ex.a).toLowerCase()===name||text(ex.b).toLowerCase()===name)fromExamples.push(Number(ex.offset));}
    const rows=fromExamples.length?fromExamples:(entry?.offsets||[]).map(Number);
    return uniq(rows.filter(Number.isInteger)).sort((a,b)=>a-b);
  }
  function classifyField(entry,doc,offset,opts={}){
    const anchors=candidateAnchors(doc,offset,Number(opts.anchorDistance)||384),anchor=anchors[0]||null,fallback=propertyFallback[entry?.propertyId]||'Unknown';
    let recordType=anchor?.recordType||fallback,classification='heuristic',reason='property fallback';
    if(anchor){classification=anchor.evidenceStatus==='confirmed'?'confirmed':'probable';reason=`nearest ${anchor.recordType} anchor ${anchor.signature||anchor.text} at ${hex(anchor.offset)} (${anchor.distance} B)`;}
    else if(fallback!=='Unknown'){classification='probable';reason=`semantic field ${entry.propertyLabel||entry.propertyId} maps naturally to ${fallback}`;}
    return{recordType,classification,reason,anchor,anchors:anchors.slice(0,6)};
  }
  function fieldRows(doc,catalog,meta={}){
    if(!SR?.readScalar)throw new Error('Structured PKB Reader scalar API is unavailable.');
    const fileName=text(meta.fileName||doc?.name),rows=[];
    for(const entry of catalog?.entries||[]){
      if(entry.status!=='confirmed')continue;
      for(const offset of offsetsForCatalogEntry(entry,fileName)){
        const width=Number(entry.width)||({u8:1,u16:2,u32:4,i32:4,f32:4}[entry.type]||0);if(!width||offset<0||offset+width>Number(doc?.size||0))continue;
        let value;try{value=SR.readScalar(doc,offset,entry.type);}catch(_){continue;}
        const cls=classifyField(entry,doc,offset,meta);
        rows.push({
          id:`field:${entry.propertyId}:${entry.type}:${offset}`,catalogId:entry.id||'',propertyId:entry.propertyId||'custom',propertyLabel:entry.propertyLabel||entry.propertyId||'Field',type:entry.type,width,offset,offsetHex:hex(offset),value,
          evidenceStatus:entry.status,validationNote:entry.note||'',recordType:cls.recordType,classificationStatus:cls.classification,classificationReason:cls.reason,anchor:cls.anchor,anchors:cls.anchors,contextSignature:entry.contextSignature||''
        });
      }
    }
    return rows;
  }
  function recordKey(field){
    if(field.anchor?.signature)return`${field.recordType}:anchor:${field.anchor.signature}`;
    return`${field.recordType}:window:${Math.floor(field.offset/128)}`;
  }
  function previousRecordMap(previous){const m=new Map();for(const r of previous?.records||[])if(r.manualStatus||r.status==='confirmed')m.set(r.key||r.id,{status:r.manualStatus||r.status,note:r.note||''});return m;}
  function buildRecords(doc,catalog,meta={}){
    if(!doc)throw new Error('Structured PKB document is required.');
    const fields=fieldRows(doc,catalog,meta),groups=new Map(),manual=previousRecordMap(meta.previous||null);
    for(const f of fields){const key=recordKey(f);let g=groups.get(key);if(!g){g={key,type:f.recordType,fields:[],anchors:[],classificationReasons:[]};groups.set(key,g);}g.fields.push(f);if(f.anchor)g.anchors.push(f.anchor);g.classificationReasons.push(f.classificationReason);}
    const records=[...groups.values()].map((g,i)=>{
      g.fields.sort((a,b)=>a.offset-b.offset);const start=Math.min(...g.fields.map(f=>f.offset)),end=Math.max(...g.fields.map(f=>f.offset+f.width)),anchor=g.anchors.sort((a,b)=>a.distance-b.distance)[0]||null,man=manual.get(g.key);
      let status=man?.status||'probable';if(g.type==='Unknown'||g.fields.some(f=>f.classificationStatus==='heuristic'))status=man?.status||'heuristic';if(status==='confirmed'&&!man)status='probable';
      const gaps=[];for(let p=start,idx=0;idx<g.fields.length;idx++){const f=g.fields[idx];if(f.offset>p)gaps.push({offset:p,end:f.offset,size:f.offset-p});p=Math.max(p,f.offset+f.width);if(idx===g.fields.length-1&&p<end)gaps.push({offset:p,end,size:end-p});}
      return{id:`record-${i}-${g.type.toLowerCase()}`,key:g.key,type:g.type,label:anchor?.text||anchor?.signature||`${g.type} record @ ${hex(start)}`,status,manualStatus:man?.status||'',note:man?.note||'',range:{offset:start,end,size:end-start},anchor,anchors:g.anchors.slice(0,8),fields:g.fields,unknownGaps:gaps,fieldCount:g.fields.length,classificationReasons:uniq(g.classificationReasons)};
    }).sort((a,b)=>(statusRank[a.status]??9)-(statusRank[b.status]??9)||a.range.offset-b.range.offset);
    const summary={total:records.length,confirmed:records.filter(r=>r.status==='confirmed').length,probable:records.filter(r=>r.status==='probable').length,heuristic:records.filter(r=>r.status==='heuristic').length};for(const t of TYPES)summary[t.toLowerCase()]=records.filter(r=>r.type===t).length;
    return{schema:SCHEMA,version:VERSION,createdAt:new Date().toISOString(),source:{fileId:text(meta.fileId||''),name:doc.name||'',path:doc.path||'',size:doc.size||0,hash:doc.sourceHash?.value||''},summary,records,orphanFields:fields.filter(f=>f.recordType==='Unknown'),notes:['Only CONFIRMED semantic field-catalog entries are promoted into fields. Record grouping remains probable until manually validated.','Unknown bytes between fields are never interpreted or rewritten.']};
  }
  function setRecordStatus(model,id,status,note=''){
    if(!model||!Array.isArray(model.records))throw new Error('Semantic record model is unavailable.');if(!['heuristic','probable','confirmed'].includes(status))throw new Error('Record status must be heuristic, probable or confirmed.');const r=model.records.find(x=>x.id===id||x.key===id);if(!r)throw new Error(`Semantic record not found: ${id}`);if(status==='confirmed'&&!text(note).trim())throw new Error('A validation note is required before confirming a semantic record.');r.status=status;r.manualStatus=status;r.note=text(note);model.updatedAt=new Date().toISOString();model.summary.confirmed=model.records.filter(x=>x.status==='confirmed').length;model.summary.probable=model.records.filter(x=>x.status==='probable').length;model.summary.heuristic=model.records.filter(x=>x.status==='heuristic').length;return r;
  }
  function recordValues(record){return Object.fromEntries((record?.fields||[]).map(f=>[f.propertyId,f.value]));}
  function createRecordPatch(doc,record,changes={}){
    if(!SR?.createPatchPlan||!SR?.applyPatchPlan)throw new Error('Structured PKB patch-plan API is unavailable.');if(!record)throw new Error('Choose a semantic record first.');if(record.status!=='confirmed')throw new Error(`Semantic record patch requires CONFIRMED record evidence; current status is ${record.status||'heuristic'}.`);
    const ops=[];for(const f of record.fields||[]){const key=(f.id in changes)?f.id:f.propertyId;if(!(key in changes))continue;const next=Number(changes[key]);if(!Number.isFinite(next))throw new Error(`${f.propertyLabel} replacement must be numeric.`);if(Object.is(Number(f.value),next))continue;if(f.evidenceStatus!=='confirmed')throw new Error(`${f.propertyLabel} is not a confirmed semantic field.`);ops.push({kind:'scalar',candidate:{signature:`semantic-record:${record.key}:${f.propertyId}`,type:f.type,width:f.width,offset:f.offset,evidenceStatus:'confirmed',aValue:f.value},expected:f.value,value:next});}
    if(!ops.length)throw new Error('No semantic record field values changed.');const plan=SR.createPatchPlan(doc,ops),next=SR.applyPatchPlan(doc,plan,{requireStatus:'confirmed'}),diff=SR.diffAgainst(doc,next._sourceBytes);return{schema:PATCH_SCHEMA,version:VERSION,recordId:record.id,recordKey:record.key,recordType:record.type,recordLabel:record.label,sourceHash:doc.sourceHash?.value||'',plan,diff,losslessOutsideFields:diff.changedBytes<=plan.operations.reduce((n,o)=>n+o.width,0),next};
  }
  function reportText(model){if(!model)return'No semantic records decoded.';const s=model.summary||{};return[
    'PKB SEMANTIC RECORD DECODER v1',
    `${model.source?.name||'(unnamed)'} · ${model.source?.hash||'no hash'}`,
    `Records: ${s.total||0} · Emitter ${s.emitter||0} · Renderer ${s.renderer||0} · Sampler ${s.sampler||0} · Curve ${s.curve||0} · Unknown ${s.unknown||0}`,
    `Evidence: confirmed ${s.confirmed||0} · probable ${s.probable||0} · heuristic ${s.heuristic||0}`,
    '',
    'Only fields already CONFIRMED by the Controlled Field Lab are grouped. Record grouping itself remains probable until manually validated. Unknown bytes stay copy-through and are never rewritten.'
  ].join('\n');}
  function publicSnapshot(model){return model?clone(model):null;}
  return Object.freeze({VERSION,SCHEMA,PATCH_SCHEMA,TYPES,buildRecords,setRecordStatus,recordValues,createRecordPatch,publicSnapshot,reportText,classifyField,candidateAnchors});
});
