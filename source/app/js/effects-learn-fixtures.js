(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else if(root)root.WC3_EFFECTS_LEARN_FIXTURES=factory();
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const VERSION=3;
  const CONFIG=Object.freeze({
    'lesson-blue-orb-dual':Object.freeze({title:'Blue Orb · Real Editor vs Native PKB',effectId:'blue-orb',name:'learn_blue_orb_dual.pkb',alpha:1,size:1.25,life:2,emission:18,speed:1.5,color:[.12,.55,1],curve:[1.25,.08],alphaCurve:[1,0],mode:2,kind:'dual'}),
    'lesson-safe-pkb':Object.freeze({title:'Safe PKB Editing',effectId:'soft-glow-bloom',name:'learn_safe_editing.pkb',alpha:.82,size:1.1,life:2.4,emission:18,speed:.9,curve:[1,.35],mode:0,kind:'mapped'}),
    'lesson-curve-editor':Object.freeze({title:'Curve Editor Workflow',effectId:'fade-trail',name:'learn_curve_editor.pkb',alpha:.9,size:.85,life:2.1,emission:28,speed:1.15,curve:[1,0],mode:2,kind:'mapped'}),
    'lesson-curve-discovery':Object.freeze({title:'Curve Discovery & Confirmation',effectId:'pulse-ring',name:'learn_curve_discovery.pkb',alpha:.75,size:1.4,life:1.8,emission:16,speed:.7,curve:[.2,1],mode:0,kind:'discovery'}),
    'lesson-new-branch':Object.freeze({title:'Create a New Branch',effectId:'fast-burst',name:'learn_new_branch.pkb',alpha:.8,size:.72,life:.8,emission:64,speed:1.5,curve:[1,.15],mode:0,kind:'structure'}),
    'lesson-structural-session':Object.freeze({title:'Structural Session',effectId:'orbit-halo',name:'learn_structural_session.pkb',alpha:.72,size:.95,life:2.8,emission:24,speed:.8,curve:[.35,1.35],mode:2,kind:'structure'}),
    'lesson-presets':Object.freeze({title:'PKB Presets & Cookbook',effectId:'velocity-kick',name:'learn_presets.pkb',alpha:.88,size:.78,life:1.3,emission:26,speed:1.4,curve:[.35,1.25],mode:0,kind:'mapped'})
  });
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const rel=(dv,off,target)=>dv.setInt32(off,target-(off+4),true);
  function bytesFor(cfg){
    const bytes=new Uint8Array(512),dv=new DataView(bytes.buffer),enc=new TextEncoder();
    bytes.set([0x50,0x4b,0x42,0x00],0);
    dv.setUint32(4,64,true);dv.setUint32(8,2,true);dv.setUint32(12,192,true);dv.setUint32(16,2,true);dv.setUint32(20,256,true);dv.setUint32(24,2,true);
    const renderer=(base,mul)=>{const color=cfg.color||[1,.6,.25];dv.setFloat32(base,cfg.size*mul,true);dv.setFloat32(base+4,cfg.life*mul,true);dv.setFloat32(base+8,cfg.emission*mul,true);dv.setFloat32(base+12,cfg.speed*mul,true);dv.setFloat32(base+16,Math.max(0,Math.min(1,cfg.alpha*mul)),true);dv.setFloat32(base+20,color[0],true);dv.setFloat32(base+24,color[1],true);dv.setFloat32(base+28,color[2],true);dv.setFloat32(base+32,0,true);dv.setFloat32(base+36,1,true);dv.setFloat32(base+40,1,true);};
    renderer(64,1);renderer(128,.75);rel(dv,112,192);rel(dv,176,224);rel(dv,192,256);rel(dv,224,320);
    const curve=(base,a,b,mode)=>{dv.setUint8(base+2,mode);dv.setFloat32(base+8,0,true);dv.setFloat32(base+12,a,true);dv.setFloat32(base+16,0,true);dv.setFloat32(base+20,0,true);dv.setFloat32(base+24,1,true);dv.setFloat32(base+28,b,true);dv.setFloat32(base+32,0,true);dv.setFloat32(base+36,0,true);bytes[base+44]=0xab;};
    curve(256,cfg.curve[0],cfg.curve[1],cfg.mode);const alphaCurve=cfg.alphaCurve||[1,1];curve(320,alphaCurve[0],alphaCurve[1],cfg.alphaCurve?cfg.mode:0);
    const path='_hd.w3mod\\textures\\fx\\flare\\flaresimple_bw.dds';bytes.set(enc.encode(path+'\0'),400);
    return bytes;
  }
  function scalarEntries(name){
    const defs=[['size','Size',64,128],['life-span','Life span',68,132],['emission-rate','Emission rate',72,136],['speed','Speed',76,140],['alpha','Alpha',80,144],['color-r','Color R',84,148],['color-g','Color G',88,152],['color-b','Color B',92,156],['rotation','Rotation',96,160],['scale-x','Scale X',100,164],['scale-y','Scale Y',104,168]];
    return defs.map(([propertyId,propertyLabel,a,b])=>({id:`learn:${propertyId}`,propertyId,propertyLabel,type:'f32',width:4,status:'confirmed',manualStatus:'confirmed',note:'Validated WC3 Asset Studio lesson fixture mapping.',offsets:[a,b],examples:[{a:name,offset:a},{a:name,offset:b}]}));
  }
  function curveEntries(name){
    const values=[{offset:268,index:0,time:0},{offset:284,index:1,time:1}],ins=[{offset:272,index:0,time:0},{offset:288,index:1,time:1}],outs=[{offset:276,index:0,time:0},{offset:292,index:1,time:1}],rows=[];
    for(const x of values)rows.push({id:`learn:size:value:${x.index}`,propertyId:`curve:size:${x.index}`,propertyLabel:`Size curve sample ${x.index}`,type:'f32',width:4,status:'confirmed',manualStatus:'confirmed',note:'Validated inline lesson curve sample.',offsets:[x.offset],curve:{channel:'size',index:x.index,time:x.time,count:2,role:'value',candidateId:'learn-size-a',group:'size-a',layout:'hermite-vector3',interpolation:'hermite'},examples:[{a:name,offset:x.offset}]});
    for(const x of ins)rows.push({id:`learn:size:in:${x.index}`,propertyId:`curve:size:${x.index}:in`,propertyLabel:`Size in tangent ${x.index}`,type:'f32',width:4,status:'confirmed',manualStatus:'confirmed',note:'Validated inline lesson tangent.',offsets:[x.offset],curve:{channel:'size',index:x.index,time:x.time,count:2,role:'in-tangent',candidateId:'learn-size-a',group:'size-a',layout:'hermite-vector3',interpolation:'hermite'},examples:[{a:name,offset:x.offset}]});
    for(const x of outs)rows.push({id:`learn:size:out:${x.index}`,propertyId:`curve:size:${x.index}:out`,propertyLabel:`Size out tangent ${x.index}`,type:'f32',width:4,status:'confirmed',manualStatus:'confirmed',note:'Validated inline lesson tangent.',offsets:[x.offset],curve:{channel:'size',index:x.index,time:x.time,count:2,role:'out-tangent',candidateId:'learn-size-a',group:'size-a',layout:'hermite-vector3',interpolation:'hermite'},examples:[{a:name,offset:x.offset}]});
    rows.push({id:'learn:size:interpolation',propertyId:'curve-interpolation:size:c1',propertyLabel:'Size interpolation',type:'u8',width:1,status:'confirmed',manualStatus:'confirmed',note:'Validated lesson interpolation enum.',offsets:[258],curveInterpolation:{channel:'size',recordId:'c1',relativeOffset:2,mapping:{linear:0,step:1,hermite:2}},examples:[{a:name,offset:258}]});
    return rows;
  }
  function alphaCurveEntries(name){
    const values=[{offset:332,index:0,time:0},{offset:348,index:1,time:1}],ins=[{offset:336,index:0,time:0},{offset:352,index:1,time:1}],outs=[{offset:340,index:0,time:0},{offset:356,index:1,time:1}],rows=[];
    for(const x of values)rows.push({id:`learn:alpha:value:${x.index}`,propertyId:`curve:alpha:${x.index}`,propertyLabel:`Alpha curve sample ${x.index}`,type:'f32',width:4,status:'confirmed',manualStatus:'confirmed',note:'Validated inline Blue Orb alpha sample.',offsets:[x.offset],curve:{channel:'alpha',index:x.index,time:x.time,count:2,role:'value',candidateId:'learn-alpha-a',group:'alpha-a',layout:'hermite-vector3',interpolation:'hermite'},examples:[{a:name,offset:x.offset}]});
    for(const x of ins)rows.push({id:`learn:alpha:in:${x.index}`,propertyId:`curve:alpha:${x.index}:in`,propertyLabel:`Alpha in tangent ${x.index}`,type:'f32',width:4,status:'confirmed',manualStatus:'confirmed',note:'Validated inline Blue Orb alpha tangent.',offsets:[x.offset],curve:{channel:'alpha',index:x.index,time:x.time,count:2,role:'in-tangent',candidateId:'learn-alpha-a',group:'alpha-a',layout:'hermite-vector3',interpolation:'hermite'},examples:[{a:name,offset:x.offset}]});
    for(const x of outs)rows.push({id:`learn:alpha:out:${x.index}`,propertyId:`curve:alpha:${x.index}:out`,propertyLabel:`Alpha out tangent ${x.index}`,type:'f32',width:4,status:'confirmed',manualStatus:'confirmed',note:'Validated inline Blue Orb alpha tangent.',offsets:[x.offset],curve:{channel:'alpha',index:x.index,time:x.time,count:2,role:'out-tangent',candidateId:'learn-alpha-a',group:'alpha-a',layout:'hermite-vector3',interpolation:'hermite'},examples:[{a:name,offset:x.offset}]});
    rows.push({id:'learn:alpha:interpolation',propertyId:'curve-interpolation:alpha:c2',propertyLabel:'Alpha interpolation',type:'u8',width:1,status:'confirmed',manualStatus:'confirmed',note:'Validated Blue Orb alpha interpolation enum.',offsets:[322],curveInterpolation:{channel:'alpha',recordId:'c2',relativeOffset:2,mapping:{linear:0,step:1,hermite:2}},examples:[{a:name,offset:322}]});
    return rows;
  }
  function hierarchy(){return{schema:'wc3.effects.pkb-record-hierarchy',version:1,links:[
    {id:'rb',offset:4,pointerKind:'absolute-u32',targetOffset:64,targetRecordId:'r1',sourceRecordId:'',sourceType:'Header',targetType:'Renderer',status:'confirmed'},
    {id:'sb',offset:12,pointerKind:'absolute-u32',targetOffset:192,targetRecordId:'s1',sourceRecordId:'',sourceType:'Header',targetType:'Sampler',status:'confirmed'},
    {id:'cb',offset:20,pointerKind:'absolute-u32',targetOffset:256,targetRecordId:'c1',sourceRecordId:'',sourceType:'Header',targetType:'Curve',status:'confirmed'},
    {id:'r1s1',offset:112,pointerKind:'relative-i32',targetOffset:192,targetRecordId:'s1',sourceRecordId:'r1',sourceType:'Renderer',targetType:'Sampler',status:'confirmed'},
    {id:'r2s2',offset:176,pointerKind:'relative-i32',targetOffset:224,targetRecordId:'s2',sourceRecordId:'r2',sourceType:'Renderer',targetType:'Sampler',status:'confirmed'},
    {id:'s1c1',offset:192,pointerKind:'relative-i32',targetOffset:256,targetRecordId:'c1',sourceRecordId:'s1',sourceType:'Sampler',targetType:'Curve',status:'confirmed'},
    {id:'s2c2',offset:224,pointerKind:'relative-i32',targetOffset:320,targetRecordId:'c2',sourceRecordId:'s2',sourceType:'Sampler',targetType:'Curve',status:'confirmed'}
  ],arrays:[],pointerTables:[],counts:[],summary:{confirmed:7}};}
  function layout(catalog){
    const field=(propertyId,propertyLabel,offset,type='f32',width=4)=>({id:`field:${propertyId}:${offset}`,propertyId,propertyLabel,type,width,offset,value:0,evidenceStatus:'confirmed',relativeOffset:offset%64});
    const r1Fields=(catalog.entries||[]).filter(x=>!x.curve&&!x.curveInterpolation).flatMap(x=>(x.offsets||[]).filter(o=>o>=64&&o<128).map(o=>field(x.propertyId,x.propertyLabel,o,x.type,x.width)));
    const c1Fields=(catalog.entries||[]).filter(x=>x.curve||x.curveInterpolation).flatMap(x=>(x.offsets||[]).filter(o=>o>=256&&o<320).map(o=>field(x.propertyId,x.propertyLabel,o,x.type,x.width)));
    const c2Fields=(catalog.entries||[]).filter(x=>x.curve||x.curveInterpolation).flatMap(x=>(x.offsets||[]).filter(o=>o>=320&&o<384).map(o=>field(x.propertyId,x.propertyLabel,o,x.type,x.width)));
    return{schema:'wc3.effects.pkb-structural-layout',version:1,recordDescriptors:[
      {id:'dr1',recordId:'r1',recordType:'Renderer',offset:64,end:128,size:64,status:'confirmed',fields:r1Fields},{id:'dr2',recordId:'r2',recordType:'Renderer',offset:128,end:192,size:64,status:'confirmed',fields:[]},
      {id:'ds1',recordId:'s1',recordType:'Sampler',offset:192,end:224,size:32,status:'confirmed',fields:[]},{id:'ds2',recordId:'s2',recordType:'Sampler',offset:224,end:256,size:32,status:'confirmed',fields:[]},
      {id:'dc1',recordId:'c1',recordType:'Curve',offset:256,end:320,size:64,status:'confirmed',fields:c1Fields},{id:'dc2',recordId:'c2',recordType:'Curve',offset:320,end:384,size:64,status:'confirmed',fields:c2Fields}
    ],arrayDescriptors:[
      {id:'ra',kind:'array-layout',recordType:'Renderer',status:'confirmed',count:2,stride:64,baseOffset:64,basePointerLinkId:'rb',countOffset:8,itemRecordIds:['r1','r2']},
      {id:'sa',kind:'array-layout',recordType:'Sampler',status:'confirmed',count:2,stride:32,baseOffset:192,basePointerLinkId:'sb',countOffset:16,itemRecordIds:['s1','s2']},
      {id:'ca',kind:'array-layout',recordType:'Curve',status:'confirmed',count:2,stride:64,baseOffset:256,basePointerLinkId:'cb',countOffset:24,itemRecordIds:['c1','c2']}
    ],headers:[{id:'rh',collectionId:'ra',status:'confirmed'},{id:'sh',collectionId:'sa',status:'confirmed'},{id:'ch',collectionId:'ca',status:'confirmed'}],ownershipEdges:[],hierarchy:{paths:[]},summary:{records:6,arrays:3,confirmed:6}};
  }
  function semantic(){return{schema:'wc3.effects.pkb-semantic-records',version:1,records:[
    {id:'r1',key:'r1',type:'Renderer',label:'Lesson Renderer',status:'confirmed',range:{offset:64,end:128},fields:[]},{id:'r2',key:'r2',type:'Renderer',label:'Spare Renderer',status:'confirmed',range:{offset:128,end:192},fields:[]},
    {id:'s1',key:'s1',type:'Sampler',label:'Lesson Sampler',status:'confirmed',range:{offset:192,end:224},fields:[]},{id:'s2',key:'s2',type:'Sampler',label:'Spare Sampler',status:'confirmed',range:{offset:224,end:256},fields:[]},
    {id:'c1',key:'c1',type:'Curve',label:'Lesson Curve',status:'confirmed',range:{offset:256,end:320},fields:[]},{id:'c2',key:'c2',type:'Curve',label:'Spare Curve',status:'confirmed',range:{offset:320,end:384},fields:[]}
  ],summary:{total:6,renderer:2,sampler:2,curve:2,confirmed:6}};}
  function multi(){return{schema:'wc3.effects.pkb-multi-array-domains',version:1,domains:[{id:'multi-lesson',status:'confirmed',arrayDescriptorIds:['ra','sa','ca'],arrayCount:3,recordTypes:['Renderer','Sampler','Curve'],note:'Validated WC3 Asset Studio lesson domain.'}],summary:{domains:1,arrays:3,confirmed:1}};}
  function curveStructure(name,includeAlpha=false){const curveGroups=[{id:'g1',key:'size-a',candidateId:'learn-size-a',layout:'hermite-vector3',channels:['size'],sampleCount:2,status:'confirmed'}],chains=[{id:'chain-lesson',rendererRecordId:'r1',samplerRecordId:'s1',curveRecordId:'c1',rendererLabel:'Blue Orb Renderer',samplerLabel:'Size Sampler',curveLabel:'Size Curve',curveGroupIds:['g1'],status:'confirmed',arrayIds:{renderer:'ra',sampler:'sa',curve:'ca'}}];if(includeAlpha){curveGroups.push({id:'g2',key:'alpha-a',candidateId:'learn-alpha-a',layout:'hermite-vector3',channels:['alpha'],sampleCount:2,status:'confirmed'});chains.push({id:'chain-alpha',rendererRecordId:'r2',samplerRecordId:'s2',curveRecordId:'c2',rendererLabel:'Blue Orb Renderer · Alpha',samplerLabel:'Alpha Sampler',curveLabel:'Alpha Curve',curveGroupIds:['g2'],status:'confirmed',arrayIds:{renderer:'ra',sampler:'sa',curve:'ca'}});}return{schema:'wc3.effects.pkb-curve-structure',version:1,source:{name},curveGroups,chains,summary:{curveGroups:curveGroups.length,chains:chains.length,confirmed:chains.length,curveArrays:1,samplerArrays:1}};}

  function blueOrbFiles(){return{
    'effect.cfx':`header {
    format = "cfx/1";
    cfx_version = 100;
    family = Warcraft3;
    LayerGraphCompileCache = &graph;
    AttributeFlatList = &attrs;
}

attributes {
    "Game.SpeedMultiplier" : f32 { default = (1, 0, 0, 0); }
    "Game.ColorMultiplier" : f32x4 { Semantic = 2; default = (1, 1, 1, 1); }
    "Game.TeamColor" : f32x4 { Semantic = 2; default = (1, 1, 1, 1); }
    "Game.TargetPosition" : f32x3 { Semantic = 1; }
    "Game.EmissionRateMultiplier" : f32 { default = (1, 0, 0, 0); }
    "Game.LifespanMultiplier" : f32 { default = (1, 0, 0, 0); }
    "Game.Scale" : f32 { Semantic = 1; default = (1, 0, 0, 0); }
}

graph {
    coordsys = (1, 5, 3, 1);
    spawn &RootLayer;
    &EmissionLayer emits "__e_Child" -> &BlueOrb;
    &RootLayer emits "Signal" -> &EmissionLayer;
    entry;
    entry "Root" fires &RootLayer."Signal";
}
`,
    'code.cfx':`layer EmissionLayer extends EventMultiplier {
    using {
        "_t_EmissionRate" = 18.0;
    }
}

layer RootLayer extends RootLayerTemplate {
    using {
        "_sd_eventStream" = sd0;
    }
}

layer BlueOrb {
    properties {
        Renderers = [&BlueOrbGlow];
        sampler "SizeCurve" : Curve = &BlueOrbSize;
        sampler "AlphaCurve" : Curve = &BlueOrbAlpha;
        metaData;
    }
    root auto;
    init {
        needs {
            "Position" : f32x3;
            "PositionState" : f32x3;
            "Velocity" : f32x3;
            "Size" : f32;
            "Color" : f32x4;
            "Enabled" : bool;
            "self.invLife" : f32;
        }
        self.invLife = rcp(2.0);
        PositionState = #f32x3(0.0, 0.0, 0.0);
        Position = coord_space.world_base_position() + PositionState;
        Velocity = #f32x3(0.0, 0.0, 1.5);
        Size = 1.25;
        Color = #f32x4(0.12, 0.55, 1.0, 1.0);
        Enabled = true;
    }
    evolve physics {
        needs {
            "Position" : f32x3;
            "PositionState" : f32x3;
            "Velocity" : f32x3;
            "Size" : f32;
            "Color" : f32x4;
            "self.lifeRatio" : f32;
            "SizeCurve" : samplerCurve1C;
            "AlphaCurve" : samplerCurve1C;
        }
        physics.integrate(position = PositionState, velocity = Velocity, acceleration = #f32x3(0.0, 0.0, 0.0));
        let sizeNow : f32 = SizeCurve.sample(self.lifeRatio);
        let alphaNow : f32 = AlphaCurve.sample(self.lifeRatio);
        Size = sizeNow;
        Color = #f32x4(0.12, 0.55, 1.0, alphaNow);
        Position = coord_space.world_base_position() + PositionState;
    }
    bind BlueOrbGlow {
        "Position" -> Position;
        "Enabled" -> Enabled;
        "Size" -> SizeScale;
        "Color" -> Color;
    }
}
`,
    'samplers.cfx':`sampler sd0 : EventStream {
    Times = [0];
}

sampler BlueOrbSize : Curve {
    keys 2 {
        0 = 1.25 in 0 out 0
        1 = 0.08 in 0 out 0
    }
}

sampler BlueOrbAlpha : Curve {
    keys 2 {
        0 = 1 in 0 out 0
        1 = 0 in 0 out 0
    }
}
`,
    'renderers.cfx':`renderer BlueOrbGlow : Billboard {
    EnableRendering = true;
    Transparent = true;
    Transparent.Type = Additive;
    Diffuse = true;
    Diffuse.DiffuseMap = "_hd.w3mod/textures/fx/flare/flaresimple_bw.dds";
    SoftParticles = true;
    SoftParticles.SoftnessDistance = 0.05;
    DrawOrder = 0;
}
`,
    'events.cfx':'',
    'functions.cfx':`import "stdlib/physics.cfx";
import "stdlib/life.cfx";
import "stdlib/space.cfx";
import "stdlib/color.cfx";
import "stdlib/templates.cfx";
`
  };}
  function bundleFiles(cfg){
    if(cfg.kind==='dual')return blueOrbFiles();
    const renderer='LessonRenderer',texture='_hd.w3mod\\textures\\fx\\flare\\flaresimple_bw.dds',rtype=cfg.effectId==='fade-trail'||cfg.effectId==='orbit-halo'?'Ribbon':cfg.effectId==='pulse-ring'?'Light':'Billboard',blend=cfg.effectId==='fade-trail'?'AlphaBlend':cfg.effectId==='pulse-ring'?'Screen':'Additive';
    return{
      'effect.cfx':`header {
    format = "cfx/1";
    cfx_version = 100;
    family = Warcraft3;
    LayerGraphCompileCache = &graph;
    AttributeFlatList = &attrs;
}

attributes {
    "Game.SpeedMultiplier" : f32 { default = (1, 0, 0, 0); }
    "Game.ColorMultiplier" : f32x4 { Semantic = 2; default = (1, 1, 1, 1); }
    "Game.TeamColor" : f32x4 { Semantic = 2; default = (1, 1, 1, 1); }
    "Game.TargetPosition" : f32x3 { Semantic = 1; }
    "Game.EmissionRateMultiplier" : f32 { default = (1, 0, 0, 0); }
    "Game.LifespanMultiplier" : f32 { default = (1, 0, 0, 0); }
    "Game.Scale" : f32 { Semantic = 1; default = (1, 0, 0, 0); }
}

graph {
    coordsys = (1, 5, 3, 1);
    spawn &RootLayer;
    &EmissionLayer emits "__e_Child" -> &LessonParticle;
    &RootLayer emits "Signal" -> &EmissionLayer;
    entry;
    entry "Root" fires &RootLayer."Signal";
}
`,
      'code.cfx':`layer EmissionLayer extends EventMultiplier {
    using {
        "_t_EmissionRate" = ${Number(cfg.emission).toFixed(1)};
    }
}

layer RootLayer extends RootLayerTemplate {
    using {
        "_sd_eventStream" = sd0;
    }
}

layer LessonParticle {
    properties {
        Renderers = [&${renderer}];
        sampler "SpawnShape" : Shape = &LessonShape;
        sampler "LifeCurve" : Curve = &LessonLife;
        metaData;
    }
    root auto;
    init {
        needs {
            "Position" : f32x3;
            "PositionState" : f32x3;
            "Velocity" : f32x3;
            "Size" : f32;
            "Color" : f32x4;
            "Enabled" : bool;
            "SpawnShape" : samplerShape_2C;
            "self.invLife" : f32;
        }
        self.invLife = rcp(${cfg.life});
        let spawnPos : f32x3 = SpawnShape.samplePosition();
        PositionState = spawnPos;
        Position = coord_space.world_base_position() + PositionState;
        Velocity = #f32x3(0.0, 0.0, 0.75);
        Size = ${cfg.size};
        Color = #f32x4(1.0, 1.0, 1.0, 1.0);
        Enabled = true;
    }
    evolve physics {
        needs {
            "Position" : f32x3;
            "PositionState" : f32x3;
            "Velocity" : f32x3;
            "Size" : f32;
            "self.lifeRatio" : f32;
            "LifeCurve" : samplerCurve1C;
        }
        physics.integrate(position = PositionState, velocity = Velocity, acceleration = #f32x3(0.0, 0.0, 0.0));
        Size = LifeCurve.sample(self.lifeRatio) * ${cfg.size};
        Position = coord_space.world_base_position() + PositionState;
    }
    bind ${renderer} {
        "Position" -> Position;
        "Enabled" -> Enabled;
        "Size" -> SizeScale;
        "Color" -> Color;
    }
}
`,
      'samplers.cfx':`sampler sd0 : EventStream {
    Times = [0];
}

sampler LessonLife : Curve {
    keys 2 {
        0 = ${cfg.curve[0]} in 0 out 0
        1 = ${cfg.curve[1]} in 0 out 0
    }
}

sampler LessonShape : Shape {
    SampleDimensionality = 3;
    ShapeType = Sphere;
    Radius = 1;
}
`,
      'renderers.cfx':`renderer ${renderer} : ${rtype} {
    EnableRendering = true;
    Transparent = true;
    Transparent.Type = ${blend};
    Diffuse = true;
    Diffuse.DiffuseMap = "${texture}";
    DrawOrder = 0;
}
`,
      'events.cfx':'',
      'functions.cfx':`import "stdlib/physics.cfx";
import "stdlib/life.cfx";
import "stdlib/space.cfx";
import "stdlib/color.cfx";
import "stdlib/templates.cfx";
`
    };
  }
  function create(id){
    const cfg=CONFIG[id];if(!cfg)throw new Error(`Unknown Learn fixture: ${id}`);
    const bytes=bytesFor(cfg),entries=scalarEntries(cfg.name),mapped=cfg.kind!=='discovery';if(mapped)entries.push(...curveEntries(cfg.name));if(cfg.kind==='dual')entries.push(...alphaCurveEntries(cfg.name));
    const catalog={schema:'wc3.effects.pkb-semantic-field-catalog',version:1,entries};
    const lay=layout(catalog),hier=hierarchy(),sem=semantic(),mul=multi(),curve=mapped?curveStructure(cfg.name,cfg.kind==='dual'):null;
    return{id,title:cfg.title,effectId:cfg.effectId,name:cfg.name,bundleName:cfg.name.replace(/\.pkb$/i,'.cfxb'),bundleFiles:bundleFiles(cfg),bytes,catalog,semantic:sem,hierarchy:hier,layout:lay,multi:mul,curveStructure:curve,kind:cfg.kind,selectedCurve:'size',editorPreset:id==='lesson-presets'?'soft-glow':'custom',curvePreset:id==='lesson-blue-orb-dual'?'shrink':id==='lesson-curve-editor'?'fade-out':id==='lesson-presets'?'grow':'flat',interpolation:cfg.mode===2?'hermite':'linear',assetPath:`examples/learn/${cfg.name}`};
  }
  return Object.freeze({VERSION,ids:Object.freeze(Object.keys(CONFIG)),config:id=>CONFIG[id]?clone(CONFIG[id]):null,create});
});
