(function(root,factory){
  'use strict';
  const api=factory(root?.WC3_EFFECTS_PROJECT_MODEL,root?.WC3_EFFECTS_CORE);
  if(typeof module==='object'&&module.exports){
    const PM=require('./effects-project-model.js');
    const C=require('./effects-lab-core.js');
    module.exports=factory(PM,C);
  }
  if(root)root.WC3_EFFECTS_CFX_ADAPTER=api;
})(typeof window!=='undefined'?window:globalThis,function(PM,C){
  'use strict';
  if(!PM||!C)return null;
  const ID='cornsyrup-cfx';
  const FORMAT='cfx/1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function normalizeFiles(files={}){const out={...C.blankBundle()};for(const name of C.bundleFileList(files))out[name]=String(files[name]??'');return out;}
  function importFiles(files={},meta={}){
    const normalized=normalizeFiles(files),parsed=C.parseBundle(normalized),validation=C.validateBundleFiles?.(normalized)||{errors:0,warnings:0,valid:true,files:{}};
    const textures=[...new Set((parsed.renderers||[]).map(r=>C.rendererSummary?.(r)?.texture||'').filter(Boolean))];
    let project=PM.emptyProject({name:meta.name||'Effect',path:meta.path||'',sourceKind:'adapter',adapter:ID,sourcePath:meta.path||'',epfText:meta.epfText||''});
    project.attributes=(parsed.attributes||[]).map((x,i)=>({id:x.name||`attribute-${i}`,name:x.name||`Attribute ${i+1}`,type:x.type||'',properties:clone(x.properties||{}),adapterRef:{adapter:ID,file:'effect.cfx'}}));
    project.layers=(parsed.layers||[]).map((x,i)=>({id:x.name||`layer-${i}`,name:x.name||`Layer ${i+1}`,rendererRefs:[...(x.renderers||[])],events:[],properties:clone(x.properties||{}),adapterRef:{adapter:ID,file:'code.cfx',name:x.name}}));
    project.graph={roots:[...(parsed.graph?.spawns||[])],edges:(parsed.graph?.emits||[]).map(e=>({from:e.from||'',event:e.event||'',to:e.to||''})),entries:(parsed.graph?.entries||[]).map(clone)};
    project.samplers=(parsed.samplers||[]).map((x,i)=>({id:x.name||`sampler-${i}`,name:x.name||`Sampler ${i+1}`,type:x.subtype||'Unknown',properties:clone(x.properties||{}),adapterRef:{adapter:ID,file:'samplers.cfx',name:x.name}}));
    project.renderers=(parsed.renderers||[]).map((x,i)=>{const color=C.studioDirective?.(x.text,'color',{})?.value||{},shape=C.studioDirective?.(x.text,'shape',{})?.value||{};return{id:x.name||`renderer-${i}`,name:x.name||`Renderer ${i+1}`,type:x.subtype||'Unknown',properties:clone(x.properties||{}),studio:{color:clone(color),shape:clone(shape)},adapterRef:{adapter:ID,file:'renderers.cfx',name:x.name}};});
    project.events=(parsed.events||[]).map((x,i)=>({id:`${x.layer||'event'}:${x.name||i}`,name:x.name||`Event ${i+1}`,layer:x.layer||'',root:!!x.root,properties:clone(x.properties||{}),adapterRef:{adapter:ID,file:'events.cfx'}}));
    project.resources.textures=textures;
    project.adapters[ID]={format:FORMAT,files:clone(normalized),presentFiles:[...(parsed.presentFiles||[])],validation:clone(validation),importedAt:new Date().toISOString()};
    project.extensions.compatBundle=clone({layers:parsed.layers,attributes:parsed.attributes,graph:parsed.graph,samplers:parsed.samplers,renderers:parsed.renderers,events:parsed.events,presentFiles:parsed.presentFiles});
    return PM.normalize(project);
  }
  function exportFiles(project){
    const p=PM.normalize(project),adapter=p.adapters?.[ID];
    if(adapter?.files)return clone(adapter.files);
    return C.blankBundle();
  }
  function refresh(project,files,meta={}){const old=PM.normalize(project),next=importFiles(files,{name:meta.name||old.meta.name,path:meta.path||old.meta.path,epfText:meta.epfText||old.authoring.epfText});next.curves=clone(old.curves||[]);next.inspections=clone(old.inspections||{pkb:null,roundTrip:null,dependencies:null});next.authoring={...next.authoring,motion:clone(old.authoring?.motion)||null,initShape:clone(old.authoring?.initShape)||null,notes:String(old.authoring?.notes||'')};next.extensions={...clone(old.extensions||{}),...clone(next.extensions||{})};return PM.normalize(next);}
  function compatBundle(project){const p=PM.normalize(project),files=exportFiles(p);return C.parseBundle(files);}
  function validation(project){const p=PM.normalize(project);return clone(p.adapters?.[ID]?.validation)||C.validateBundleFiles(exportFiles(p));}
  return Object.freeze({ID,FORMAT,importFiles,exportFiles,refresh,compatBundle,validation,normalizeFiles});
});
