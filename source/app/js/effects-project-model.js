(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.WC3_EFFECTS_PROJECT_MODEL=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const SCHEMA='wc3.effects.project';
  const VERSION=1;
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'');
  const list=v=>Array.isArray(v)?v:[];
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  function emptyProject(meta={}){
    return normalize({
      schema:SCHEMA,version:VERSION,
      meta:{name:text(meta.name||'NewEffect'),path:text(meta.path||''),createdBy:'WC3 Asset Studio Effects Lab',updatedAt:new Date().toISOString()},
      source:{kind:text(meta.sourceKind||'native'),adapter:text(meta.adapter||''),path:text(meta.sourcePath||meta.path||'')},
      authoring:{epfText:text(meta.epfText||''),motion:null,initShape:null,notes:''},
      attributes:[],layers:[],graph:{roots:[],edges:[],entries:[]},samplers:[],renderers:[],events:[],curves:[],resources:{textures:[],models:[],sounds:[]},
      inspections:{pkb:null,roundTrip:null,structure:null,structuredDiff:null,nativePopcorn:null,nativeCompile:null,cfxVmCompile:null,corpus:null,structureRegistry:null,semanticDiff:null,correlation:null,nearTwins:null,fieldExperiments:[],fieldCatalog:null,bakeOracle:null,curveDiscovery:null,curveStructure:null,fieldPatchExperiment:null,semanticRecords:null,semanticRecordPatch:null,recordHierarchy:null,structuralLayout:null,relocationExperiment:null,relocationDomains:null,domainTransaction:null,multiArrayDomains:null,multiArrayTransaction:null,nativeRecordSynthesis:null,nativeWritePlan:null,nativeWriteResult:null,incrementalCompiler:null,incrementalCompilePlan:null,incrementalCompileResult:null,dependencies:null},extensions:{},adapters:{}
    });
  }
  function normalize(project={}){
    const p=obj(project),meta=obj(p.meta),source=obj(p.source),authoring=obj(p.authoring),graph=obj(p.graph),resources=obj(p.resources),adapters=obj(p.adapters),inspections=obj(p.inspections);
    return {
      schema:SCHEMA,version:VERSION,
      meta:{name:text(meta.name||'NewEffect'),path:text(meta.path||''),createdBy:text(meta.createdBy||'WC3 Asset Studio Effects Lab'),updatedAt:text(meta.updatedAt||new Date().toISOString())},
      source:{kind:text(source.kind||'native'),adapter:text(source.adapter||''),path:text(source.path||'')},
      authoring:{epfText:text(authoring.epfText||''),motion:clone(authoring.motion)||null,initShape:clone(authoring.initShape)||null,notes:text(authoring.notes||'')},
      attributes:list(p.attributes).map(x=>clone(x)),
      layers:list(p.layers).map((x,i)=>({id:text(x?.id||x?.name||`layer-${i}`),name:text(x?.name||`Layer ${i+1}`),rendererRefs:list(x?.rendererRefs).map(text),events:list(x?.events).map(clone),properties:clone(obj(x?.properties)),adapterRef:clone(x?.adapterRef)||null})),
      graph:{roots:list(graph.roots).map(text),edges:list(graph.edges).map(clone),entries:list(graph.entries).map(clone)},
      samplers:list(p.samplers).map((x,i)=>({id:text(x?.id||x?.name||`sampler-${i}`),name:text(x?.name||`Sampler ${i+1}`),type:text(x?.type||'Unknown'),properties:clone(obj(x?.properties)),adapterRef:clone(x?.adapterRef)||null})),
      renderers:list(p.renderers).map((x,i)=>({id:text(x?.id||x?.name||`renderer-${i}`),name:text(x?.name||`Renderer ${i+1}`),type:text(x?.type||'Unknown'),properties:clone(obj(x?.properties)),studio:clone(obj(x?.studio)),adapterRef:clone(x?.adapterRef)||null})),
      events:list(p.events).map((x,i)=>({id:text(x?.id||x?.name||`event-${i}`),name:text(x?.name||`Event ${i+1}`),layer:text(x?.layer||''),root:!!x?.root,properties:clone(obj(x?.properties)),adapterRef:clone(x?.adapterRef)||null})),
      curves:list(p.curves).map((x,i)=>({id:text(x?.id||`curve-${i}`),name:text(x?.name||x?.kind||`Curve ${i+1}`),kind:text(x?.kind||'curve'),domain:clone(obj(x?.domain)),samples:Number.isFinite(Number(x?.samples))?Number(x.samples):0,channels:list(x?.channels).map(clone),source:clone(x?.source)||null,createdAt:text(x?.createdAt||'')})),
      resources:{textures:[...new Set(list(resources.textures).map(text).filter(Boolean))],models:[...new Set(list(resources.models).map(text).filter(Boolean))],sounds:[...new Set(list(resources.sounds).map(text).filter(Boolean))]},
      inspections:{pkb:clone(inspections.pkb)||null,roundTrip:clone(inspections.roundTrip)||null,structure:clone(inspections.structure)||null,structuredDiff:clone(inspections.structuredDiff)||null,nativePopcorn:clone(inspections.nativePopcorn)||null,nativeCompile:clone(inspections.nativeCompile)||null,cfxVmCompile:clone(inspections.cfxVmCompile)||null,corpus:clone(inspections.corpus)||null,structureRegistry:clone(inspections.structureRegistry)||null,semanticDiff:clone(inspections.semanticDiff)||null,correlation:clone(inspections.correlation)||null,nearTwins:clone(inspections.nearTwins)||null,fieldExperiments:list(inspections.fieldExperiments).map(clone),fieldCatalog:clone(inspections.fieldCatalog)||null,bakeOracle:clone(inspections.bakeOracle)||null,curveDiscovery:clone(inspections.curveDiscovery)||null,curveStructure:clone(inspections.curveStructure)||null,fieldPatchExperiment:clone(inspections.fieldPatchExperiment)||null,semanticRecords:clone(inspections.semanticRecords)||null,semanticRecordPatch:clone(inspections.semanticRecordPatch)||null,recordHierarchy:clone(inspections.recordHierarchy)||null,structuralLayout:clone(inspections.structuralLayout)||null,relocationExperiment:clone(inspections.relocationExperiment)||null,relocationDomains:clone(inspections.relocationDomains)||null,domainTransaction:clone(inspections.domainTransaction)||null,multiArrayDomains:clone(inspections.multiArrayDomains)||null,multiArrayTransaction:clone(inspections.multiArrayTransaction)||null,nativeRecordSynthesis:clone(inspections.nativeRecordSynthesis)||null,nativeWritePlan:clone(inspections.nativeWritePlan)||null,nativeWriteResult:clone(inspections.nativeWriteResult)||null,incrementalCompiler:clone(inspections.incrementalCompiler)||null,incrementalCompilePlan:clone(inspections.incrementalCompilePlan)||null,incrementalCompileResult:clone(inspections.incrementalCompileResult)||null,dependencies:clone(inspections.dependencies)||null},extensions:clone(obj(p.extensions)),adapters:clone(adapters)
    };
  }
  function touch(project,patch={}){const p=normalize({...project,...patch});p.meta.updatedAt=new Date().toISOString();return p;}
  function setAdapter(project,id,data){const p=normalize(project);p.adapters[id]=clone(data);p.meta.updatedAt=new Date().toISOString();return p;}
  function adapter(project,id){return clone(obj(project?.adapters?.[id]));}
  function semanticSnapshot(project){const p=normalize(project);return {schema:p.schema,version:p.version,name:p.meta.name,source:p.source,layers:p.layers.map(x=>({name:x.name,rendererRefs:[...x.rendererRefs]})),graph:clone(p.graph),samplers:p.samplers.map(x=>({name:x.name,type:x.type})),renderers:p.renderers.map(x=>({name:x.name,type:x.type,studio:clone(x.studio)})),events:p.events.map(x=>({name:x.name,layer:x.layer,root:x.root})),curves:p.curves.map(x=>({id:x.id,name:x.name,kind:x.kind,samples:x.samples,channels:x.channels.map(c=>({name:c.name,sourceSamples:c.sourceSamples,reducedSamples:c.reducedSamples}))})),resources:clone(p.resources)};}
  return Object.freeze({SCHEMA,VERSION,emptyProject,normalize,touch,setAdapter,adapter,semanticSnapshot,clone});
});
