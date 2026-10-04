(function(root,factory){
  'use strict';
  let PC=root?.WC3_EFFECTS_PKB_CORPUS||null,EX=root?.WC3_EFFECTS_PKB_EXPERIMENTS||null;
  if(typeof module==='object'&&module.exports){
    try{PC=PC||require('./effects-pkb-corpus.js');}catch(_){}
    try{EX=EX||require('./effects-pkb-experiments.js');}catch(_){}
    module.exports=factory(PC,EX);
  }else if(root)root.WC3_EFFECTS_PKB_BAKE_ORACLE=factory(PC,EX);
})(typeof window!=='undefined'?window:globalThis,function(PC,EX){
  'use strict';
  const VERSION=1,SCHEMA='wc3.effects.pkb-bake-oracle';
  const NUMBER='[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?';
  const TARGETS=Object.freeze([
    {id:'size',label:'Size',keys:['Size','SizeScale','ParticleSize'],types:['f32']},
    {id:'emission-rate',label:'Emission Rate',keys:['EmissionRate','SpawnRate','ParticleRate','Rate'],types:['f32','u32']},
    {id:'life-span',label:'Life Span',keys:['LifeSpan','Lifetime','ParticleLife','Duration'],types:['f32'],inverseLife:true},
    {id:'speed',label:'Speed',keys:['Speed','ParticleSpeed'],types:['f32']},
    {id:'gravity',label:'Gravity',keys:['Gravity'],types:['f32']},
    {id:'drag',label:'Drag',keys:['Drag'],types:['f32']},
    {id:'spread',label:'Spread',keys:['Spread'],types:['f32']},
    {id:'rotation',label:'Rotation',keys:['Rotation'],types:['f32']},
    {id:'alpha',label:'Alpha',keys:['Alpha','Opacity'],types:['f32'],colorComponent:3},
    {id:'color-r',label:'Color R',keys:[],types:['f32'],colorComponent:0},
    {id:'color-g',label:'Color G',keys:[],types:['f32'],colorComponent:1},
    {id:'color-b',label:'Color B',keys:[],types:['f32'],colorComponent:2},
    {id:'custom',label:'Custom scalar',keys:[],types:['f32','u32','i32','u16','u8']}
  ]);
  const clone=v=>JSON.parse(JSON.stringify(v));
  const targetFor=(id,label='')=>{const t=TARGETS.find(x=>x.id===id)||TARGETS[TARGETS.length-1];return{...t,keys:[...(t.keys||[])],types:[...(t.types||[])],label:t.id==='custom'&&String(label).trim()?String(label).trim():t.label};};
  function lineInfo(src,index){const before=src.slice(0,index),line=before.split(/\r?\n/).length,column=index-(before.lastIndexOf('\n')+1)+1;return{line,column};}
  function context(src,start,end){const a=Math.max(0,src.lastIndexOf('\n',Math.max(0,start-1))+1),next=src.indexOf('\n',end),b=next<0?src.length:next;return src.slice(a,b).trim().slice(0,220);}
  function scalarOccurrences(file,src,target,customLabel=''){
    const out=[],keys=target.id==='custom'?(String(customLabel||'').trim()?[String(customLabel).trim()]:[]):target.keys;
    for(const key of keys){const re=new RegExp(`\\b(${key.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')})\\s*=\\s*(${NUMBER})(?=\\s*;)`,'gi');let m;while((m=re.exec(src))){const raw=m[2],rel=m[0].lastIndexOf(raw),start=m.index+rel,end=start+raw.length,li=lineInfo(src,start);out.push({id:`${file}:${start}:${target.id}`,propertyId:target.id,propertyLabel:target.label,file,key:m[1],kind:'scalar',start,end,value:Number(raw),raw,line:li.line,column:li.column,context:context(src,start,end)});}}
    if(target.inverseLife){const re=new RegExp(`\\bself\\.invLife\\s*=\\s*rcp\\s*\\(\\s*(${NUMBER})\\s*\\)`,'gi');let m;while((m=re.exec(src))){const raw=m[1],rel=m[0].indexOf(raw),start=m.index+rel,end=start+raw.length,li=lineInfo(src,start);out.push({id:`${file}:${start}:${target.id}:rcp`,propertyId:target.id,propertyLabel:target.label,file,key:'self.invLife/rcp',kind:'inverse-life-source',start,end,value:Number(raw),raw,line:li.line,column:li.column,context:context(src,start,end)});}}
    return out;
  }
  function colorOccurrences(file,src,target){
    if(!Number.isInteger(target.colorComponent))return[];const out=[],re=new RegExp(`\\b(Color|ColorMultiplier|Tint)\\s*=\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*,\\s*(${NUMBER})(?:\\s*,\\s*(${NUMBER}))?\\s*\\)`,'gi');let m;
    while((m=re.exec(src))){const comp=target.colorComponent,group=2+comp;if(comp===3&&!m[group])continue;const raw=m[group],rel=m[0].indexOf(raw),start=m.index+rel,end=start+raw.length,li=lineInfo(src,start);out.push({id:`${file}:${start}:${target.id}:color`,propertyId:target.id,propertyLabel:target.label,file,key:`${m[1]}[${comp}]`,kind:'color-component',component:comp,start,end,value:Number(raw),raw,line:li.line,column:li.column,context:context(src,start,end)});}
    return out;
  }
  function scanBundle(files,{property='size',propertyLabel=''}={}){
    const target=targetFor(property,propertyLabel),out=[];for(const [file,src0] of Object.entries(files||{})){const src=String(src0||'');if(!src)continue;out.push(...scalarOccurrences(file,src,target,propertyLabel),...colorOccurrences(file,src,target));}
    out.sort((a,b)=>a.file.localeCompare(b.file)||a.start-b.start);return{schema:SCHEMA,version:VERSION,target,occurrences:out,available:out.length>0};
  }
  function scanAll(files){const rows=[];for(const t of TARGETS.filter(x=>x.id!=='custom')){const r=scanBundle(files,{property:t.id});if(r.occurrences.length)rows.push({propertyId:t.id,label:t.label,count:r.occurrences.length,occurrences:r.occurrences});}return{schema:SCHEMA,version:VERSION,targets:rows,total:rows.reduce((n,x)=>n+x.count,0)};}
  function mutate(files,occurrence,value){const n=Number(value);if(!Number.isFinite(n))throw new Error('Bake Oracle values must be finite numbers.');const next={...(files||{})},file=String(occurrence?.file||''),src=String(next[file]??'');if(!file||!src)throw new Error('Bake Oracle source occurrence no longer exists.');const start=Number(occurrence.start),end=Number(occurrence.end);if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>src.length)throw new Error('Bake Oracle source range is invalid.');const current=src.slice(start,end);if(String(occurrence.raw)!==current)throw new Error('Bake Oracle source changed after the occurrence was selected. Refresh targets before baking.');next[file]=src.slice(0,start)+String(n)+src.slice(end);return next;}
  function makeVariants(files,occurrence,values=[]){const nums=(values||[]).map(Number).filter(Number.isFinite);if(nums.length<2)throw new Error('Bake Oracle requires at least two numeric values.');const unique=[];for(const n of nums)if(!unique.some(x=>Object.is(x,n)))unique.push(n);if(unique.length<2)throw new Error('Bake Oracle values must contain at least two distinct numbers.');return unique.slice(0,8).map((value,i)=>({label:String.fromCharCode(65+i),value,files:mutate(files,occurrence,value)}));}
  function payloadEntry(x,i){return{name:x.name||`oracle_${i}.pkb`,path:x.path||'',source:'bake-oracle',data:x.data};}
  function analyzeBakes(bakes,{property='custom',propertyLabel='',values=[],tolerance=1e-5,previousCatalog=null}={}){
    if(!PC?.scanEntries||!EX?.controlledExperiment||!EX?.buildCatalog)throw new Error('Bake Oracle analysis modules are unavailable.');if(!Array.isArray(bakes)||bakes.length<2)throw new Error('Bake Oracle needs at least two baked PKBs.');const nums=values.map(Number);if(nums.length!==bakes.length||nums.some(x=>!Number.isFinite(x)))throw new Error('Bake Oracle bake/value counts do not match.');const corpus=PC.scanEntries(bakes.map(payloadEntry),{name:'Bake Oracle controlled variants'}),tag=`oracle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,experiments=[];for(let i=0;i<corpus.files.length;i++)corpus.files[i].id=`${tag}-${i}`;for(let i=1;i<corpus.files.length;i++){let exp=EX.controlledExperiment(corpus,{aId:corpus.files[0].id,bId:corpus.files[i].id,property,propertyLabel,expectedA:nums[0],expectedB:nums[i],tolerance,allowReverse:false});let valueTransform='identity';const target=targetFor(property,propertyLabel);if(exp.status!=='matched'&&target.inverseLife&&nums[0]!==0&&nums[i]!==0){const inv=EX.controlledExperiment(corpus,{aId:corpus.files[0].id,bId:corpus.files[i].id,property,propertyLabel,expectedA:1/nums[0],expectedB:1/nums[i],tolerance,allowReverse:false});if(inv.status==='matched'){exp=inv;valueTransform='reciprocal';}}exp.oracle={baseline:0,variant:i,valueTransform,sourceA:nums[0],sourceB:nums[i]};experiments.push(exp);}const catalog=EX.buildCatalog(experiments,previousCatalog||null),matched=experiments.filter(x=>x.status==='matched').length;return{schema:SCHEMA,version:VERSION,createdAt:new Date().toISOString(),property:targetFor(property,propertyLabel),values:nums,corpus,experiments,catalog,summary:{variants:bakes.length,pairs:experiments.length,matched,unmatched:experiments.length-matched,probable:catalog.counts?.probable||0,confirmed:catalog.counts?.confirmed||0,heuristic:catalog.counts?.heuristic||0}};
  }
  function mergeRun(previous,run){const runs=[...(previous?.runs||[]),clone({createdAt:run.createdAt,property:run.property,values:run.values,summary:run.summary,experiments:run.experiments})].slice(-64),experiments=runs.flatMap(x=>x.experiments||[]),catalog=EX?.buildCatalog?EX.buildCatalog(experiments,previous?.catalog||run.catalog||null):(run.catalog||null);return{schema:SCHEMA,version:VERSION,updatedAt:new Date().toISOString(),runs,experiments,catalog,summary:{runs:runs.length,experiments:experiments.length,matched:experiments.filter(x=>x.status==='matched').length,probable:catalog?.counts?.probable||0,confirmed:catalog?.counts?.confirmed||0,heuristic:catalog?.counts?.heuristic||0}};}
  function reportText(model){if(!model)return'Bake Oracle is ready. Choose a source property and bake controlled variants.';const s=model.summary||{};return['BAKE ORACLE / BYTE LAB',`${s.runs||0} run(s) · ${s.experiments||0} controlled pair(s) · ${s.matched||0} matched`, `Catalog: ${s.confirmed||0} confirmed · ${s.probable||0} probable · ${s.heuristic||0} heuristic`,'','The oracle never auto-confirms a byte mapping. Repeated controlled bakes can promote evidence to probable; confirmed still requires an explicit validation note.'].join('\n');}
  return Object.freeze({VERSION,SCHEMA,TARGETS,targetFor,scanBundle,scanAll,mutate,makeVariants,analyzeBakes,mergeRun,reportText});
});
