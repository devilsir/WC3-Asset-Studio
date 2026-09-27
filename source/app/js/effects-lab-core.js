(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.WC3_EFFECTS_CORE=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const CORE_BUNDLE_FILES=['effect.cfx','code.cfx','samplers.cfx','renderers.cfx','events.cfx'];
  const OPTIONAL_BUNDLE_FILES=['functions.cfx'];
  const KNOWN_BUNDLE_FILES=[...CORE_BUNDLE_FILES,...OPTIONAL_BUNDLE_FILES];
  const EFFECT_TYPES=['Unit / Dummy','Effect','Lightning','Weather','Image','Destructable','Camera','Camera Noise','Sound','TextTag','Sky','UberSplat','Terrain Deformation','Terrain Type'];
  const MOTIONS=['None','Line','Circle','Parabola','Helix','Spiral rise'];
  const INIT_SHAPES=['None','Random point','Circle','Helix','Sphere','Parabolic'];

  function text(v,d=''){return v==null?d:String(v)}
  function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
  function keyNorm(v){return text(v).trim().toLowerCase()}
  function stripBom(s){return text(s).replace(/^\uFEFF/,'')}

  function parseIni(input){
    const source=stripBom(input).replace(/\r\n?/g,'\n'),lines=source.split('\n');
    const doc={preamble:[],sections:[],eol:'\r\n'};
    let section=null;
    lines.forEach((raw,i)=>{
      if(i===lines.length-1&&raw==='')return;
      const sm=raw.match(/^\s*\[([^\]]+)\]\s*$/);
      if(sm){section={name:sm[1],entries:[],headerRaw:raw};doc.sections.push(section);return;}
      const km=raw.match(/^\s*([^=;#][^=]*?)\s*=\s*(.*)$/);
      const entry=km?{type:'kv',key:km[1].trim(),value:km[2],raw}:{type:'raw',raw};
      if(section)section.entries.push(entry);else doc.preamble.push(entry);
    });
    return doc;
  }
  function cloneIni(doc){return JSON.parse(JSON.stringify(doc||{preamble:[],sections:[]}))}
  function findSection(doc,name){const n=keyNorm(name);return (doc?.sections||[]).find(s=>keyNorm(s.name)===n)||null}
  function ensureSection(doc,name){let s=findSection(doc,name);if(!s){s={name:text(name),entries:[],headerRaw:`[${text(name)}]`};(doc.sections||(doc.sections=[])).push(s);}return s}
  function getIniValue(doc,section,key,fallback=''){const s=findSection(doc,section);if(!s)return fallback;const n=keyNorm(key);const e=s.entries.find(x=>x.type==='kv'&&keyNorm(x.key)===n);return e?e.value:fallback}
  function setIniValue(doc,section,key,value){const s=ensureSection(doc,section),n=keyNorm(key);let e=s.entries.find(x=>x.type==='kv'&&keyNorm(x.key)===n);if(!e){e={type:'kv',key:text(key),value:text(value),raw:''};s.entries.push(e);}else e.value=text(value);e.raw='';return e}
  function deleteSection(doc,name){const n=keyNorm(name);doc.sections=(doc.sections||[]).filter(s=>keyNorm(s.name)!==n)}
  function deleteIniValue(doc,section,key){const s=findSection(doc,section);if(!s)return false;const n=keyNorm(key),before=s.entries.length;s.entries=s.entries.filter(x=>!(x.type==='kv'&&keyNorm(x.key)===n));return s.entries.length!==before}
  function renameSection(doc,oldName,newName){const s=findSection(doc,oldName);if(!s||keyNorm(oldName)===keyNorm(newName))return s;s.name=text(newName);s.headerRaw=`[${text(newName)}]`;return s}
  function epfLayerParts(sectionName){const m=text(sectionName).match(/^Layer(\d)(\d)$/i);return m?{phase:+m[1],layer:+m[2],code:`${m[1]}${m[2]}`}:null}
  function epfStuffParts(sectionName){const m=text(sectionName).match(/^(Stuff|Trans)(\d)(\d)(\d+)$/i);return m?{kind:m[1],phase:+m[2],layer:+m[3],object:+m[4],code:`${m[2]}${m[3]}`}:null}
  function epfStuffLayerSection(sectionName){const p=epfStuffParts(sectionName);return p?`Layer${p.code}`:''}
  function serializeIni(doc){
    const lines=[];
    for(const e of doc?.preamble||[])lines.push(e.type==='kv'?`${e.key}=${e.value}`:text(e.raw));
    for(const s of doc?.sections||[]){
      lines.push(`[${s.name}]`);
      for(const e of s.entries||[])lines.push(e.type==='kv'?`${e.key}=${e.value}`:text(e.raw));
    }
    return lines.join(doc?.eol||'\r\n')+(lines.length?(doc?.eol||'\r\n'):'');
  }
  function sectionObject(section){const out={};for(const e of section?.entries||[])if(e.type==='kv')out[e.key]=e.value;return out}
  function parseEpf(input){
    const doc=parseIni(input);
    const general=sectionObject(findSection(doc,'General'));
    const header=sectionObject(findSection(doc,'Header'));
    const grimex=sectionObject(findSection(doc,'Grimex'));
    const ui=sectionObject(findSection(doc,'UI'));
    const layers=(doc.sections||[]).filter(s=>/^Layer\d+$/i.test(s.name)).map((s,index)=>({section:s.name,index,values:sectionObject(s)}));
    const stuffs=(doc.sections||[]).filter(s=>/^Stuff\d+$/i.test(s.name)).map((s,index)=>({section:s.name,index,layerSection:epfStuffLayerSection(s.name),values:sectionObject(s)}));
    return {doc,header,general,grimex,ui,layers,stuffs};
  }
  function createDefaultEpf(){
    return parseEpf(`; WC3 Asset Studio Effects Lab project\r\n[Header]\r\nApp=WC3 Asset Studio Effects Lab\r\n[General]\r\nName=NewEffect\r\nPeriod=0.03\r\nHashtable=ht\r\nObjectType=0\r\nInitTrigger=1\r\nTriggerType=0\r\nAbilityId=A000\r\nHeroAbility=0\r\nHasProbability=0\r\nProbability=100.00\r\n[UI]\r\nPhase0=1\r\n[Layer00]\r\nLayerType=0\r\nCorrLayer=\r\nStartTime=0.00\r\nDurTime=2.00\r\nIntv=0.03\r\nRefPoint=0\r\nLayerName=Layer 1\r\nLayerDur=2.00\r\nInitEqList=\r\nStuffCount=1\r\nTransCount=0\r\n[Stuff000]\r\nEffectType=Effect\r\nModelPath=Abilities\\Spells\\Other\\TalkToMe\\TalkToMe.mdl\r\nScale=1.00\r\nLifeSpan=2.00\r\nEffectAdd=1\r\nEffectModelName=Abilities\\Spells\\Other\\TalkToMe\\TalkToMe.mdl\r\nEffectCount=1\r\nEffectCountUp=2\r\nEffectNumRand=0\r\nEffectLifeMode=0\r\nEffectLifeSpan=2.00\r\nEffectLifePhase=\r\nEffectModelFile=\r\nAttrsCount=0\r\n`);
  }
  function epfStuffsForLayer(project,layerSection){const code=epfLayerParts(layerSection)?.code;if(!code)return[];const p=project?.stuffs?project:parseEpf(serializeIni(project?.doc||project));return (p.stuffs||[]).filter(x=>epfStuffParts(x.section)?.code===code)}
  function phaseLayerSections(doc,phase){return (doc.sections||[]).filter(s=>{const p=epfLayerParts(s.name);return p&&p.phase===phase;}).sort((a,b)=>epfLayerParts(a.name).layer-epfLayerParts(b.name).layer)}
  function syncPhaseCount(doc,phase){setIniValue(doc,'UI',`Phase${phase}`,String(phaseLayerSections(doc,phase).length))}
  function addEpfLayer(project,nearSection=''){
    const doc=project.doc||project,near=epfLayerParts(nearSection),phase=near?near.phase:0,used=new Set(phaseLayerSections(doc,phase).map(s=>epfLayerParts(s.name).layer));
    let idx=0;while(used.has(idx)&&idx<10)idx++;if(idx>9)throw new Error(`Phase ${phase} already has the maximum 10 layers supported by legacy EPF numbering.`);
    const name=`Layer${phase}${idx}`;ensureSection(doc,name);
    const vals={LayerType:'0',CorrLayer:'',StartTime:'0.00',DurTime:'2.00',Intv:getIniValue(doc,'General','Period','0.03'),RefPoint:'0',LayerName:`Layer ${phase}.${idx+1}`,LayerDur:'2.00',InitEqList:'',StuffCount:'0',TransCount:'0'};
    Object.entries(vals).forEach(([k,v])=>setIniValue(doc,name,k,v));syncPhaseCount(doc,phase);
    return parseEpf(serializeIni(doc));
  }
  function removeEpfLayer(project,sectionName){
    const doc=project.doc||project,parts=epfLayerParts(sectionName);if(!parts){deleteSection(doc,sectionName);return parseEpf(serializeIni(doc));}
    const code=parts.code;
    doc.sections=(doc.sections||[]).filter(s=>s.name!==sectionName&&!new RegExp(`^(?:Stuff|Trans)${code}\\d+$`,'i').test(s.name));
    const remaining=phaseLayerSections(doc,parts.phase);
    remaining.forEach((section,newIndex)=>{const old=epfLayerParts(section.name);if(!old||old.layer===newIndex)return;const oldCode=old.code,newCode=`${parts.phase}${newIndex}`;renameSection(doc,section.name,`Layer${newCode}`);for(const dep of doc.sections||[]){const m=dep.name.match(new RegExp(`^(Stuff|Trans)${oldCode}(\\d+)$`,'i'));if(m)renameSection(doc,dep.name,`${m[1]}${newCode}${m[2]}`);}});
    syncPhaseCount(doc,parts.phase);return parseEpf(serializeIni(doc));
  }
  function inferEpfStuffType(v={}){if(v.EffectType)return v.EffectType;if(v.AddDest==='1'||v.DestId)return'Destructable';if(v.EffectAdd==='1'||v.EffectModelName)return'Effect';if(v.UnitId||v.UnitModel||v.UnitInitSel!=null)return'Unit / Dummy';if(v.LightningId)return'Lightning';if(v.SoundPath)return'Sound';return'Effect'}
  function epfStuffField(v={},field){
    const type=inferEpfStuffType(v);if(field==='type')return type;
    if(field==='path'){
      if(type==='Effect')return v.EffectModelName||v.EffectPath||v.ModelPath||'';
      if(type==='Unit / Dummy')return v.UnitModel||v.ModelPath||'';
      if(type==='Destructable')return v.DestModel||v.DestModelFile||v.ModelPath||'';
      if(type==='Sound')return v.SoundPath||v.ModelPath||'';
      return v.ModelPath||v.EffectModelName||v.EffectPath||v.UnitModel||v.DestModel||v.DestModelFile||v.SoundPath||'';
    }
    if(field==='scale')return type==='Destructable'?(v.DestScale||v.Scale||'1'):(v.Scale||v.DestScale||'1');
    if(field==='life'){
      if(type==='Effect')return v.EffectLifeSpan||v.LifeSpan||'2';
      if(type==='Unit / Dummy')return v.UnitLifeSpan||v.LifeSpan||'2';
      if(type==='Destructable')return v.DestLifeSpan||v.LifeSpan||'2';
      return v.LifeSpan||v.EffectLifeSpan||v.UnitLifeSpan||v.DestLifeSpan||'2';
    }
    if(field==='animation')return type==='Destructable'?(v.DestAnimation||v.Animation||''):(v.Animation||v.DestAnimation||'');
    return'';
  }
  function setEpfStuffField(doc,section,field,value){
    const current=sectionObject(findSection(doc,section)),type=field==='type'?text(value):inferEpfStuffType(current),v=text(value);
    if(field==='type'){
      setIniValue(doc,section,'EffectType',v);
      // Legacy Effect Designer keys are authoritative for old .epf readers. Always
      // clear the mutually-exclusive toggles before enabling the selected kind so
      // changing an existing object cannot leave it simultaneously Effect+Dest.
      setIniValue(doc,section,'EffectAdd',v==='Effect'?'1':'0');
      setIniValue(doc,section,'AddDest',v==='Destructable'?'1':'0');
      return;
    }
    const generic={path:'ModelPath',scale:'Scale',life:'LifeSpan',animation:'Animation'}[field];if(generic)setIniValue(doc,section,generic,v);
    if(field==='path'){if(type==='Effect')setIniValue(doc,section,'EffectModelName',v);else if(type==='Unit / Dummy')setIniValue(doc,section,'UnitModel',v);else if(type==='Destructable')setIniValue(doc,section,'DestModel',v);else if(type==='Sound')setIniValue(doc,section,'SoundPath',v);}
    if(field==='scale'&&type==='Destructable')setIniValue(doc,section,'DestScale',v);
    if(field==='life'){if(type==='Effect')setIniValue(doc,section,'EffectLifeSpan',v);else if(type==='Unit / Dummy')setIniValue(doc,section,'UnitLifeSpan',v);else if(type==='Destructable')setIniValue(doc,section,'DestLifeSpan',v);}
    if(field==='animation'&&type==='Destructable')setIniValue(doc,section,'DestAnimation',v);
  }
  function addEpfStuff(project,layerSection,type='Effect'){
    const doc=project.doc||project,parts=epfLayerParts(layerSection);if(!parts)throw new Error(`Invalid EPF layer section: ${layerSection}`);let idx=0;while(findSection(doc,`Stuff${parts.code}${idx}`))idx++;if(idx>99)throw new Error(`${layerSection} has too many objects.`);
    const name=`Stuff${parts.code}${idx}`;ensureSection(doc,name);setEpfStuffField(doc,name,'type',type);setEpfStuffField(doc,name,'path','');setEpfStuffField(doc,name,'scale','1.00');setEpfStuffField(doc,name,'life','2.00');setIniValue(doc,name,'AttrsCount','0');
    if(type==='Effect'){setIniValue(doc,name,'EffectCount','1');setIniValue(doc,name,'EffectCountUp','2');setIniValue(doc,name,'EffectNumRand','0');setIniValue(doc,name,'EffectLifeMode','0');setIniValue(doc,name,'EffectModelFile','');}
    const parsed=parseEpf(serializeIni(doc)),count=epfStuffsForLayer(parsed,layerSection).length;setIniValue(doc,layerSection,'StuffCount',String(count));return parseEpf(serializeIni(doc));
  }

  function motionPoints(kind,opts={}){
    const count=Math.max(8,Math.min(240,Math.trunc(num(opts.count,80)))),radius=Math.max(0,Math.abs(num(opts.radius,1))),height=num(opts.height,1.5),turns=Math.max(0,Math.abs(num(opts.turns,2.5))),length=Math.max(0,Math.abs(num(opts.length,3)));
    const pts=[];
    for(let i=0;i<count;i++){
      const t=count<=1?0:i/(count-1),a=t*Math.PI*2*turns,theta=t*Math.PI*2;
      let x=0,y=0,z=0;
      switch(kind){case 'None':break;case 'Line':x=(t-.5)*length;break;case 'Circle':x=Math.cos(theta)*radius;y=Math.sin(theta)*radius;break;case 'Parabola':x=(t-.5)*length;z=4*height*t*(1-t);break;case 'Helix':x=Math.cos(a)*radius;y=Math.sin(a)*radius;z=(t-.5)*height;break;case 'Spiral rise':{const r=radius*(.15+.85*t);x=Math.cos(a)*r;y=Math.sin(a)*r;z=t*height;break;}default:break;}
      pts.push({x,y,z,t});
    }
    return pts;
  }
  function initialShapePoints(kind,opts={}){
    const count=Math.max(8,Math.min(160,Math.trunc(num(opts.count,40)))),radius=Math.max(0,Math.abs(num(opts.radius,1))),height=num(opts.height,1.5),turns=Math.max(.001,Math.abs(num(opts.turns,2.5))),pts=[];
    if(kind==='None')return pts;
    for(let i=0;i<count;i++){
      const t=count<=1?0:i/(count-1),a=t*Math.PI*2*turns,theta=t*Math.PI*2,golden=i*2.399963229728653;let x=0,y=0,z=0;
      switch(kind){
        case 'Random point':{const r=radius*Math.sqrt(Math.abs(Math.sin((i+1)*12.9898))),ang=golden;x=Math.cos(ang)*r;y=Math.sin(ang)*r;z=(Math.sin((i+1)*78.233)*.5)*height;break;}
        case 'Circle':x=Math.cos(theta)*radius;y=Math.sin(theta)*radius;break;
        case 'Helix':x=Math.cos(a)*radius;y=Math.sin(a)*radius;z=(t-.5)*height;break;
        case 'Sphere':{const zz=1-2*(i+.5)/count,rr=Math.sqrt(Math.max(0,1-zz*zz));x=Math.cos(golden)*rr*radius;y=Math.sin(golden)*rr*radius;z=zz*radius;break;}
        case 'Parabolic':x=(t-.5)*radius*2;z=4*height*t*(1-t);break;
        default:break;
      }
      pts.push({x,y,z,t});
    }
    return pts;
  }

  function generateEffectScript(project,language='lua'){
    const p=project?.general?project:parseEpf(serializeIni(project?.doc||project));
    const sanitized=(p.general.Name||'GeneratedEffect').replace(/[^A-Za-z0-9_]/g,'_');
    const name=/^[A-Za-z_]/.test(sanitized)?sanitized:`_${sanitized}`;
    const period=Math.max(.01,num(p.general.Period,.03));
    const triggerMap={0:'Cast',1:'Attack',2:'Attacked',3:'Damaged',4:'Dead',5:'UseItem'};
    const layers=p.layers.map((l,i)=>({name:l.values.LayerName||`Layer_${i+1}`,start:num(l.values.StartTime,0),duration:num(l.values.LayerDur||l.values.DurTime,2),interval:num(l.values.Intv,period),ref:l.values.RefPoint||'0'}));
    if(String(language).toLowerCase()==='jass'){
      const lines=[`// Generated by WC3 Asset Studio · Effects Lab`,`function ${name}_Tick takes nothing returns nothing`,`    local timer t = GetExpiredTimer()`,`    // Project trigger: ${triggerMap[p.general.TriggerType]||p.general.TriggerType||'Cast'}`];
      layers.forEach((l,i)=>lines.push(`    // Layer ${i+1}: ${l.name} · start ${l.start.toFixed(2)} · duration ${l.duration.toFixed(2)} · interval ${l.interval.toFixed(2)}`));
      lines.push('endfunction','',`function ${name}_Start takes unit caster, unit target returns nothing`,`    local timer t = CreateTimer()`,`    call TimerStart(t, ${period.toFixed(3)}, true, function ${name}_Tick)`,'endfunction');return lines.join('\n');
    }
    const lines=[`-- Generated by WC3 Asset Studio · Effects Lab`,`local ${name} = { period = ${period.toFixed(3)}, trigger = ${JSON.stringify(triggerMap[p.general.TriggerType]||p.general.TriggerType||'Cast')}, layers = {`];
    layers.forEach(l=>lines.push(`  { name = ${JSON.stringify(l.name)}, start = ${l.start.toFixed(3)}, duration = ${l.duration.toFixed(3)}, interval = ${l.interval.toFixed(3)}, refPoint = ${JSON.stringify(l.ref)} },`));
    lines.push('} }','',`function ${name}.start(caster, target)`,`  local elapsed = 0.0`,`  TimerStart(CreateTimer(), ${name}.period, true, function()`,`    elapsed = elapsed + ${name}.period`,`    -- Add generated layer bodies / object operations here.`,`  end)`,`end`,'',`return ${name}`);return lines.join('\n');
  }

  function balancedBlocks(source,keyword){
    const s=text(source),out=[],re=new RegExp(`\\b${keyword}\\s+([^\\s:{]+)(?:\\s*(?::|extends)\\s*([^\\s{]+))?\\s*\\{`,'g');let m;
    while((m=re.exec(s))){let depth=1,i=re.lastIndex,quote='',lineComment=false,blockComment=false;for(;i<s.length&&depth;i++){const ch=s[i],nx=s[i+1];if(lineComment){if(ch==='\n')lineComment=false;continue;}if(blockComment){if(ch==='*'&&nx==='/'){blockComment=false;i++;}continue;}if(quote){if(ch==='\\')i++;else if(ch===quote)quote='';continue;}if(ch==='/'&&nx==='/'){lineComment=true;i++;continue;}if(ch==='/'&&nx==='*'){blockComment=true;i++;continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='{')depth++;else if(ch==='}')depth--;}
      if(depth===0)out.push({kind:keyword,name:m[1],subtype:m[2]||'',start:m.index,end:i,text:s.slice(m.index,i),body:s.slice(re.lastIndex,i-1)});re.lastIndex=Math.max(i,re.lastIndex);
    }return out;
  }
  function anonymousBlockBody(source,keyword){
    const s=text(source),re=new RegExp(`\\b${keyword}\\s*\\{`,'g'),m=re.exec(s);if(!m)return'';let depth=1,i=re.lastIndex,quote='',lineComment=false,blockComment=false;for(;i<s.length&&depth;i++){const ch=s[i],nx=s[i+1];if(lineComment){if(ch==='\n')lineComment=false;continue;}if(blockComment){if(ch==='*'&&nx==='/'){blockComment=false;i++;}continue;}if(quote){if(ch==='\\')i++;else if(ch===quote)quote='';continue;}if(ch==='/'&&nx==='/'){lineComment=true;i++;continue;}if(ch==='/'&&nx==='*'){blockComment=true;i++;continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='{')depth++;else if(ch==='}')depth--;}return depth===0?s.slice(re.lastIndex,i-1):'';
  }
  function parseEffectCfx(source){
    const s=text(source),attrsBody=anonymousBlockBody(s,'attributes'),attrs=[];if(attrsBody){const ar=/"([^"]+)"\s*:\s*([A-Za-z0-9_]+)/g;let m;while((m=ar.exec(attrsBody)))attrs.push({name:m[1],type:m[2]});}
    const graph=anonymousBlockBody(s,'graph');
    const spawns=[...graph.matchAll(/spawn\s+&([^;\s]+)/g)].map(m=>m[1]);
    const emits=[];const er=/&([^\s]+)\s+emits\s+"([^"]+)"(?:\s*->\s*(\[[^\]]*\]|&[^;\s]+))?\s*;/g;let em;
    while((em=er.exec(graph))){const targets=em[3]?[...em[3].matchAll(/&([A-Za-z0-9_.-]+)/g)].map(x=>x[1]):[];if(targets.length)targets.forEach(to=>emits.push({from:em[1],event:em[2],to,targets:[...targets]}));else emits.push({from:em[1],event:em[2],to:'',targets:[]});}
    const entries=[...graph.matchAll(/\bentry(?:\s+"([^"]*)")?(?:\s+fires\s+&([^.;\s]+)\."([^"]+)")?\s*;/g)].map(m=>({name:m[1]||'',layer:m[2]||'',event:m[3]||''}));
    return{attributes:attrs,graph:{spawns,emits,entries,raw:graph}};
  }
  function parseEventsCfx(source){
    const layers=balancedBlocks(text(source),'layer'),out=[];
    function scanNamedBlock(body,kind,re,layerName,root=false){let m;while((m=re.exec(body))){let depth=1,i=re.lastIndex,quote='',lineComment=false,blockComment=false;for(;i<body.length&&depth;i++){const ch=body[i],nx=body[i+1];if(lineComment){if(ch==='\n')lineComment=false;continue;}if(blockComment){if(ch==='*'&&nx==='/'){blockComment=false;i++;}continue;}if(quote){if(ch==='\\')i++;else if(ch===quote)quote='';continue;}if(ch==='/'&&nx==='/'){lineComment=true;i++;continue;}if(ch==='/'&&nx==='*'){blockComment=true;i++;continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='{')depth++;else if(ch==='}')depth--;}if(depth===0){const rawName=root?'root':m[1];out.push({kind,name:root?'root':String(rawName).replace(/^"|"$/g,''),subtype:'',start:m.index,end:i,text:body.slice(m.index,i),body:body.slice(re.lastIndex,i-1),layer:layerName,root,flags:root?'':(m[2]||'')});}re.lastIndex=Math.max(i,re.lastIndex);}}
    for(const layer of layers){
      scanNamedBlock(layer.body,'event',/\bevent\s+("[^"]+"|[^;\s{]+)(?:\s+flags\s+(\d+))?\s*\{/g,layer.name,false);
      const bare=/\bevent\s+("[^"]+"|[^;\s{]+)(?:\s+flags\s+(\d+))?\s*;/g;let m;while((m=bare.exec(layer.body)))out.push({kind:'event',name:m[1].replace(/^"|"$/g,''),subtype:'',text:m[0],body:'',layer:layer.name,root:false,flags:m[2]||''});
      scanNamedBlock(layer.body,'root',/\broot\s*\{/g,layer.name,true);
      if(/\broot\s*;/.test(layer.body))out.push({kind:'root',name:'root',subtype:'',text:'root;',body:'',layer:layer.name,root:true});
    }
    return out;
  }
  function bundleFileList(files={}){const list=[...CORE_BUNDLE_FILES];for(const name of OPTIONAL_BUNDLE_FILES)if(Object.prototype.hasOwnProperty.call(files,name)&&text(files[name]).length)list.push(name);return list;}
  function parseBundle(files={}){
    const normalized={};for(const name of KNOWN_BUNDLE_FILES)normalized[name]=text(files[name]||'');
    const effect=parseEffectCfx(normalized['effect.cfx']);
    const layers=balancedBlocks(normalized['code.cfx'],'layer').map(b=>({...b,renderers:[...b.text.matchAll(/Renderers\s*=\s*\[([^\]]*)\]/g)].flatMap(m=>[...m[1].matchAll(/&([A-Za-z0-9_.-]+)/g)].map(x=>x[1]))}));
    let samplers=balancedBlocks(normalized['samplers.cfx'],'sampler');
    if(!samplers.length)samplers=['curve','shape','turbulence','eventstream'].flatMap(k=>balancedBlocks(normalized['samplers.cfx'],k).map(b=>({...b,subtype:b.subtype||k[0].toUpperCase()+k.slice(1)})));
    const renderers=balancedBlocks(normalized['renderers.cfx'],'renderer').map(b=>{const props={};for(const m of b.body.matchAll(/^\s*([A-Za-z0-9_.]+)\s*=\s*([^;]+);/gm))props[m[1]]=m[2].trim();return{...b,properties:props};});
    const events=parseEventsCfx(normalized['events.cfx']);
    return{files:normalized,presentFiles:bundleFileList(files),...effect,layers,samplers,renderers,events};
  }
  function replaceBlock(source,block,replacement){if(!block||!Number.isInteger(block.start)||!Number.isInteger(block.end))return text(source);return text(source).slice(0,block.start)+text(replacement)+text(source).slice(block.end)}
  function blankBundle(){
    return{
      'effect.cfx':`header {\n    format = "cfx/1";\n    cfx_version = 100;\n    family = Warcraft3;\n    LayerGraphCompileCache = &graph;\n    AttributeFlatList = &attrs;\n}\n\nattributes {\n    "Game.ColorMultiplier" : f32x4 { default = (1, 1, 1, 1); }\n    "Game.Scale" : f32 { default = (1, 0, 0, 0); }\n}\n\ngraph {\n    spawn &RootLayer;\n    &RootLayer emits "Spawn" -> &ParticleLayer;\n    entry;\n    entry "Root" fires &RootLayer."Spawn";\n}\n`,
      'code.cfx':`layer RootLayer {\n    event Spawn;\n}\n\nlayer ParticleLayer {\n    properties { Renderers = [&MainBillboard]; metaData; }\n    root auto;\n    init {\n        needs { "Position" : f32x3; "Size" : f32; "Enabled" : bool; }\n        Position = coord_space.world_base_position();\n        Size = 1.0;\n        Enabled = true;\n    }\n    bind MainBillboard { "Position" -> Position; "Enabled" -> Enabled; "Size" -> SizeScale; }\n}\n`,
      'samplers.cfx':'// Curves, shapes, turbulence and event streams.\n',
      'renderers.cfx':`renderer MainBillboard : Billboard {\n    Transparent = true;\n    Diffuse = true;\n    EnableRendering = true;\n    BillboardingMode = ScreenAligned;\n    Transparent.Type = Additive;\n    Diffuse.DiffuseMap = "_hd.w3mod/textures/fx/flare/flaresimple_bw.dds";\n}\n`,
      'events.cfx':'// Effect events.\n'
    };
  }
  function rendererSummary(r){return{type:r.subtype||'Unknown',name:r.name,blend:r.properties?.['Transparent.Type']||'',texture:(r.properties?.['Diffuse.DiffuseMap']||r.properties?.['DiffuseMap']||'').replace(/^"|"$/g,''),atlas:r.properties?.['Atlas.SubDiv']||''}}

  return Object.freeze({CORE_BUNDLE_FILES,OPTIONAL_BUNDLE_FILES,KNOWN_BUNDLE_FILES,EFFECT_TYPES,MOTIONS,INIT_SHAPES,parseIni,serializeIni,cloneIni,findSection,ensureSection,getIniValue,setIniValue,deleteIniValue,deleteSection,renameSection,epfLayerParts,epfStuffParts,epfStuffLayerSection,epfStuffsForLayer,inferEpfStuffType,epfStuffField,setEpfStuffField,parseEpf,createDefaultEpf,addEpfLayer,removeEpfLayer,addEpfStuff,motionPoints,initialShapePoints,generateEffectScript,balancedBlocks,parseEffectCfx,parseEventsCfx,bundleFileList,parseBundle,replaceBlock,blankBundle,rendererSummary});
});
