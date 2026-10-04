(function(root,factory){
  'use strict';
  let MD=root?.WC3_EFFECTS_PKB_MULTI_ARRAY_TRANSACTIONS||null;
  if(typeof module==='object'&&module.exports){
    try{MD=MD||require('./effects-pkb-multi-array-transactions.js');}catch(_){}
    module.exports=factory(MD);
  }else if(root)root.WC3_EFFECTS_PKB_CURVE_TREE=factory(MD);
})(typeof window!=='undefined'?window:globalThis,function(MD){
  'use strict';
  const SCHEMA='wc3.effects.pkb-curve-tree',TX_SCHEMA='wc3.effects.pkb-curve-tree-transaction',VERSION=1;
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'');
  const rank={confirmed:0,probable:1,heuristic:2};
  function arrayMap(layout){return new Map((layout?.arrayDescriptors||[]).filter(a=>a.kind==='array-layout').map(a=>[a.id,a]));}
  function domainForArrays(multi,arrayIds){const ids=[...new Set((arrayIds||[]).filter(Boolean))];return(multi?.domains||[]).filter(d=>ids.every(id=>(d.arrayDescriptorIds||[]).includes(id))).sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||(a.arrayCount||0)-(b.arrayCount||0))[0]||null;}
  function memberIndex(array,recordId){return(array?.itemRecordIds||[]).indexOf(recordId);}
  function buildTree(curveStructure,layout,multi,opts={}){
    const arrays=arrayMap(layout),groups=new Map((curveStructure?.curveGroups||[]).map(g=>[g.id,g])),rows=[];
    for(const chain of curveStructure?.chains||[]){
      const roles=[['renderer',chain.rendererRecordId,chain.arrayIds?.renderer],['sampler',chain.samplerRecordId,chain.arrayIds?.sampler],['curve',chain.curveRecordId,chain.arrayIds?.curve]],members={};
      for(const [role,recordId,arrayId] of roles){const a=arrays.get(arrayId);members[role]={recordId:recordId||'',arrayId:arrayId||'',index:a&&recordId?memberIndex(a,recordId):-1,count:Number(a?.count)||0,stride:Number(a?.stride)||0,status:a?.status||'heuristic',recordType:a?.recordType||''};}
      const requiredArrayIds=[members.renderer.arrayId,members.sampler.arrayId,members.curve.arrayId].filter(Boolean),domain=domainForArrays(multi,requiredArrayIds),boundGroups=(chain.curveGroupIds||[]).map(id=>groups.get(id)).filter(Boolean),complete=!!members.renderer.recordId&&!!members.sampler.recordId&&!!members.curve.recordId&&requiredArrayIds.length===3,indicesValid=complete&&['renderer','sampler','curve'].every(k=>members[k].index>=0),writable=chain.status==='confirmed'&&indicesValid&&domain?.status==='confirmed';
      rows.push({id:chain.id,rendererLabel:chain.rendererLabel||chain.rendererRecordId,samplerLabel:chain.samplerLabel||chain.samplerRecordId,curveLabel:chain.curveLabel||chain.curveRecordId,rendererRecordId:chain.rendererRecordId||'',samplerRecordId:chain.samplerRecordId||'',curveRecordId:chain.curveRecordId||'',status:chain.status||'heuristic',members,domainId:domain?.id||'',domainStatus:domain?.status||'',domainArrayIds:clone(domain?.arrayDescriptorIds||[]),groups:boundGroups.map(g=>({id:g.id,key:g.key,channels:[...(g.channels||[])],sampleCount:g.sampleCount||0,status:g.status||'heuristic',layout:g.layout||'',candidateId:g.candidateId||''})),writable,blockedReasons:[...(complete?[]:['complete Renderer → Sampler → Curve chain is required']),...(indicesValid?[]:['chain records are not members of confirmed contiguous arrays']),...(domain?[]:['no multi-array domain covers the chain arrays']),...(domain?.status==='confirmed'?[]:['multi-array domain is not CONFIRMED']),...(chain.status==='confirmed'?[]:['structural chain is not CONFIRMED'])]});
    }
    rows.sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||a.rendererLabel.localeCompare(b.rendererLabel));
    const model={schema:SCHEMA,version:VERSION,createdAt:new Date().toISOString(),source:clone(curveStructure?.source||{}),branches:rows,summary:{branches:rows.length,writable:rows.filter(x=>x.writable).length,confirmed:rows.filter(x=>x.status==='confirmed').length,groups:rows.reduce((n,x)=>n+x.groups.length,0)},notes:['The v7 tree is derived from confirmed Curve Structure chains and never invents structural links.','Branch duplication/removal is enabled only when Renderer, Sampler and Curve are all members of one CONFIRMED multi-array domain.','Transactions are delegated to the existing append-only multi-array shadow writer.']};return model;
  }
  function branch(model,id){return(model?.branches||[]).find(x=>x.id===id)||null;}
  function operationRows(row,operation){
    if(!row)throw new Error('Select a structural curve branch first.');if(!['duplicate','remove'].includes(operation))throw new Error('Branch operation must be duplicate or remove.');if(!row.writable)throw new Error(`Branch operation blocked: ${(row.blockedReasons||[]).join('; ')||'structural evidence is not confirmed'}.`);
    const out=[];for(const role of ['renderer','sampler','curve']){const m=row.members?.[role];if(!m?.arrayId||m.index<0)throw new Error(`Branch operation blocked: ${role} array membership is unavailable.`);out.push({arrayId:m.arrayId,operation,index:operation==='duplicate'?m.index+1:m.index,templateIndex:m.index});}return out;
  }
  function createBranchPlan(doc,tree,layout,hierarchy,multi,branchId,operation,opts={}){
    if(!MD?.createTransactionPlan)throw new Error('Multi-array transaction writer is unavailable.');const row=branch(tree,branchId);if(!row)throw new Error(`Curve-tree branch not found: ${branchId}`);const operations=operationRows(row,operation),tx=MD.createTransactionPlan(doc,multi,layout,hierarchy,row.domainId,operations,{alignment:Math.max(4,Number(opts.alignment)||16)}),plan={schema:TX_SCHEMA,version:VERSION,createdAt:new Date().toISOString(),sourceHash:doc?.sourceHash?.value||'',sourceSize:doc?.size||0,branchId:row.id,operation,domainId:row.domainId,operations,transactionPlan:tx,summary:{arrays:tx.arrayPlans?.length||0,touchedArrays:operations.length,oldSize:doc?.size||0,newSize:tx.newSize||0,appendedBytes:Math.max(0,(tx.newSize||0)-(doc?.size||0))},notes:['Duplicate copies the selected Renderer/Sampler/Curve records together so confirmed internal pointers are remapped to the inserted copies.','Remove is permitted only when the underlying multi-array eligibility check proves that no surviving/external reference is broken.']};return plan;
  }
  function applyBranchPlan(doc,plan){if(plan?.schema!==TX_SCHEMA)throw new Error('Invalid Curve Tree v7 transaction plan.');if(!MD?.applyTransactionPlan)throw new Error('Multi-array transaction writer is unavailable.');const applied=MD.applyTransactionPlan(doc,plan.transactionPlan);return{schema:'wc3.effects.pkb-curve-tree-result',version:VERSION,bytes:applied.bytes,verification:{...applied.verification,branchId:plan.branchId,operation:plan.operation,curveTree:true}};}
  function reportText(model,plan=null,result=null){
    if(!model)return'CURVE TREE v7 · no structural model.';const s=model.summary||{},lines=[`CURVE TREE v7`,`Branches: ${s.branches||0} · confirmed ${s.confirmed||0} · writable ${s.writable||0} · bound groups ${s.groups||0}`,''];for(const b of model.branches||[])lines.push(`${b.writable?'WRITABLE':b.status.toUpperCase()} ${b.id} · ${b.rendererLabel} → ${b.samplerLabel} → ${b.curveLabel} · domain ${b.domainId||'—'} · groups ${b.groups.length}`);if(plan){lines.push('','STAGED TRANSACTION',`${plan.operation.toUpperCase()} ${plan.branchId} · domain ${plan.domainId}`,`Arrays in shadow transaction: ${plan.summary.arrays} · targeted records: ${plan.summary.touchedArrays}`,`Size: ${plan.summary.oldSize} → ${plan.summary.newSize} B · appended ${plan.summary.appendedBytes} B`);}if(result){const v=result.verification||{};lines.push('',`PREVIEW VERIFIED · existing changed bytes ${v.changedExistingBytes||0} · appended ${v.appendedBytes||0} B · arrays ${v.arrayCount||0}`,`Existing bytes outside confirmed metadata preserved: ${v.sourcePreservedOutsideMetadata?'YES':'NO'}`);}lines.push('','Structural writes stay blocked unless both the R→S→C chain and its multi-array domain are CONFIRMED.');return lines.join('\n');
  }
  return Object.freeze({SCHEMA,TX_SCHEMA,VERSION,buildTree,branch,domainForArrays,operationRows,createBranchPlan,applyBranchPlan,reportText,publicSnapshot:model=>model?clone(model):null});
});
