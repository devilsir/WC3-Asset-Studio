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
  const MATH_MOTION_PRESETS=Object.freeze([
    {name:'Math · Sine wave',variable:'x',min:-6.283185307179586,max:6.283185307179586,x:'x * 0.35',y:'sin(x * a) * radius',z:'cos(x * b) * height * 0.25',params:{a:1,b:2,c:0,d:1}},
    {name:'Math · Lissajous',variable:'x',min:0,max:6.283185307179586,x:'sin(x * a) * radius',y:'sin(x * b + c) * radius',z:'sin(x * d) * height * 0.5',params:{a:3,b:2,c:1.5707963267948966,d:1}},
    {name:'Math · Rose spiral',variable:'x',min:0,max:12.566370614359172,x:'cos(x) * cos(a * x) * radius',y:'sin(x) * cos(a * x) * radius',z:'t * height',params:{a:2.5,b:1,c:0,d:1}},
    {name:'Math · Polynomial arch',variable:'x',min:-1,max:2,x:'x',y:'0',z:'x^2 + 2',params:{a:1,b:1,c:0,d:1}},
    {name:'Custom math',variable:'x',min:-1,max:1,x:'x',y:'0',z:'0',params:{a:1,b:1,c:0,d:1}}
  ]);
  const MATH_INIT_PRESETS=Object.freeze([
    {name:'Math · Ring wave',variable:'x',min:0,max:6.283185307179586,x:'cos(x) * radius',y:'sin(x) * radius',z:'sin(x * a) * height * 0.2',params:{a:3,b:1,c:0,d:1}},
    {name:'Math · Double helix',variable:'x',min:0,max:12.566370614359172,x:'cos(x * a) * radius',y:'sin(x * a) * radius',z:'(t - 0.5) * height',params:{a:1,b:1,c:0,d:1}},
    {name:'Math · Flower',variable:'x',min:0,max:6.283185307179586,x:'cos(x) * cos(a * x) * radius',y:'sin(x) * cos(a * x) * radius',z:'sin(b * x) * height * 0.12',params:{a:4,b:2,c:0,d:1}},
    {name:'Math · Twisted line',variable:'x',min:-2,max:2,x:'x',y:'sin(x * a) * radius * 0.35',z:'cos(x * b) * height * 0.35',params:{a:3,b:2,c:0,d:1}},
    {name:'Custom math',variable:'x',min:-1,max:1,x:'x',y:'0',z:'0',params:{a:1,b:1,c:0,d:1}}
  ]);
  const COLOR_MOD_PRESETS=Object.freeze([
    {name:'Off',enabled:false,mode:'off',period:1,interval:1,colorA:'#ffffff',colorB:'#ffffff',easing:'smooth',params:{a:1,b:1,c:0,d:1},r:'r0',g:'g0',bExpr:'b0',alpha:'a0'},
    {name:'Two-color step',enabled:true,mode:'step',period:2,interval:1,colorA:'#ff5b2e',colorB:'#36a7ff',easing:'step',params:{a:1,b:1,c:0,d:1},r:'r0',g:'g0',bExpr:'b0',alpha:'a0'},
    {name:'Smooth ping-pong',enabled:true,mode:'crossfade',period:2,colorA:'#ff3f81',colorB:'#48d8ff',easing:'smooth',params:{a:1,b:1,c:0,d:1},r:'r0',g:'g0',bExpr:'b0',alpha:'a0'},
    {name:'Neon pulse',enabled:true,mode:'math',period:2,colorA:'#ff3df2',colorB:'#4de7ff',easing:'smooth',params:{a:2,b:1,c:0,d:1},r:'lerp(ar,br,0.5 + 0.5*sin(time*a))',g:'lerp(ag,bg,0.5 + 0.5*sin(time*a))',bExpr:'lerp(ab,bb,0.5 + 0.5*sin(time*a))',alpha:'lerp(aa,ba,0.5 + 0.5*sin(time*b)^2)'},
    {name:'Fire flicker',enabled:true,mode:'math',period:1,colorA:'#ff6a22',colorB:'#ffd85b',easing:'smooth',params:{a:8,b:3,c:0,d:1},r:'lerp(ar,br,0.2 + 0.8*abs(sin(time*a + seed)))',g:'lerp(ag,bg,0.2 + 0.8*abs(sin(time*a + seed)))',bExpr:'lerp(ab,bb,0.2 + 0.8*triangle(time*b + seed))',alpha:'lerp(aa,ba,0.72 + 0.28*abs(sin(time*a*0.5 + seed)))'},
    {name:'Custom math',enabled:true,mode:'math',period:2,colorA:'#ffffff',colorB:'#ffffff',easing:'smooth',params:{a:1,b:1,c:0,d:1},r:'ar',g:'ag',bExpr:'ab',alpha:'aa'}
  ]);
  const RENDER_SHAPE_PRESETS=Object.freeze([
    {name:'Off',enabled:false,variable:'theta',min:0,max:Math.PI*2,samples:40,params:{a:5,b:1,c:0,d:1},x:'cos(theta)',y:'sin(theta)'},
    {name:'Circle',enabled:true,variable:'theta',min:0,max:Math.PI*2,samples:48,params:{a:1,b:1,c:0,d:1},x:'cos(theta)',y:'sin(theta)'},
    {name:'Star 5',enabled:true,variable:'theta',min:0,max:Math.PI*2,samples:80,params:{a:5,b:0.32,c:0,d:1},x:'cos(theta) * (1 - b + b*cos(a*theta))',y:'sin(theta) * (1 - b + b*cos(a*theta))'},
    {name:'Flower pulse',enabled:true,variable:'theta',min:0,max:Math.PI*2,samples:84,params:{a:6,b:0.25,c:2,d:1},x:'cos(theta) * (1 + b*cos(a*theta + time*c))',y:'sin(theta) * (1 + b*cos(a*theta + time*c))'},
    {name:'Wobble',enabled:true,variable:'theta',min:0,max:Math.PI*2,samples:72,params:{a:3,b:0.18,c:2,d:1},x:'cos(theta) * (1 + b*sin(a*theta + time*c))',y:'sin(theta) * (1 + b*sin(a*theta + time*c))'},
    {name:'Superellipse',enabled:true,variable:'theta',min:0,max:Math.PI*2,samples:96,params:{a:0.45,b:1,c:0,d:1},x:'sign(cos(theta))*abs(cos(theta))^a',y:'sign(sin(theta))*abs(sin(theta))^a'},
    {name:'Custom math',enabled:true,variable:'theta',min:0,max:Math.PI*2,samples:64,params:{a:1,b:1,c:0,d:1},x:'cos(theta)',y:'sin(theta)'}
  ]);
  const MOTIONS=['None','Line','Circle','Parabola','Helix','Spiral rise',...MATH_MOTION_PRESETS.map(x=>x.name)];
  const INIT_SHAPES=['None','Random point','Circle','Helix','Sphere','Parabolic',...MATH_INIT_PRESETS.map(x=>x.name)];

  function text(v,d=''){return v==null?d:String(v)}
  function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
  const MATH_CONSTANTS=Object.freeze({pi:Math.PI,e:Math.E,tau:Math.PI*2,phi:(1+Math.sqrt(5))/2});
  const MATH_FUNCTIONS=Object.freeze({
    sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,atan:Math.atan,atan2:Math.atan2,
    sqrt:Math.sqrt,abs:Math.abs,exp:Math.exp,log:Math.log,ln:Math.log,log10:Math.log10,
    floor:Math.floor,ceil:Math.ceil,round:Math.round,trunc:Math.trunc,sign:Math.sign,
    min:Math.min,max:Math.max,pow:Math.pow,hypot:Math.hypot,
    clamp:(v,a,b)=>Math.max(Math.min(a,b),Math.min(Math.max(a,b),v)),
    lerp:(a,b,t)=>a+(b-a)*t,
    smoothstep:(a,b,x)=>{if(a===b)return x<a?0:1;const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);},
    fract:v=>v-Math.floor(v),mod:(a,b)=>b===0?NaN:((a%b)+b)%b,
    step:(edge,x)=>x<edge?0:1,pulse:(x,width=.5)=>((x-Math.floor(x))<Math.max(0,Math.min(1,width))?1:0),
    saw:x=>x-Math.floor(x),triangle:x=>{const f=x-Math.floor(x);return 1-Math.abs(f*2-1);},mix:(a,b,t)=>a+(b-a)*Math.max(0,Math.min(1,t))
  });
  function mathTokenize(source){
    const s=text(source).trim(),tokens=[];let i=0;
    while(i<s.length){const ch=s[i];if(/\s/.test(ch)){i++;continue;}const nm=s.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);if(nm){tokens.push({type:'number',value:Number(nm[0]),raw:nm[0],index:i});i+=nm[0].length;continue;}const im=s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);if(im){tokens.push({type:'id',value:im[0],index:i});i+=im[0].length;continue;}if('+-*/%^(),'.includes(ch)){tokens.push({type:ch,value:ch,index:i});i++;continue;}const e=new Error(`Unexpected character "${ch}" at column ${i+1}`);e.index=i;throw e;}tokens.push({type:'eof',value:'',index:s.length});return tokens;
  }
  function compileMathExpression(source){
    const raw=text(source).trim();if(!raw){const e=new Error('Expression is empty');e.index=0;throw e;}const tokens=mathTokenize(raw);let pos=0;const peek=()=>tokens[pos],take=(type)=>{const t=peek();if(t.type!==type){const e=new Error(`Expected ${type} at column ${t.index+1}`);e.index=t.index;throw e;}pos++;return t;};
    const primary=()=>{const t=peek();if(t.type==='number'){pos++;return{kind:'num',value:t.value};}if(t.type==='id'){pos++;const name=t.value.toLowerCase();if(peek().type==='('){take('(');const args=[];if(peek().type!==')'){for(;;){args.push(expr());if(peek().type!==',')break;take(',');}}take(')');if(!Object.prototype.hasOwnProperty.call(MATH_FUNCTIONS,name)){const e=new Error(`Unknown math function: ${t.value}`);e.index=t.index;throw e;}return{kind:'call',name,args};}return{kind:'var',name};}if(t.type==='('){take('(');const n=expr();take(')');return n;}const e=new Error(`Expected a number, variable or function at column ${t.index+1}`);e.index=t.index;throw e;};
    const unary=()=>{const t=peek();if(t.type==='+'||t.type==='-'){pos++;return{kind:'unary',op:t.type,arg:unary()};}return primary();};
    const power=()=>{let left=unary();if(peek().type==='^'){pos++;left={kind:'binary',op:'^',left,right:power()};}return left;};
    const mul=()=>{let left=power();while(['*','/','%'].includes(peek().type)){const op=peek().type;pos++;left={kind:'binary',op,left,right:power()};}return left;};
    const add=()=>{let left=mul();while(['+','-'].includes(peek().type)){const op=peek().type;pos++;left={kind:'binary',op,left,right:mul()};}return left;};
    const expr=()=>add();const ast=expr();if(peek().type!=='eof'){const t=peek(),e=new Error(`Unexpected token "${t.value}" at column ${t.index+1}`);e.index=t.index;throw e;}
    const evalNode=(n,vars)=>{switch(n.kind){case'num':return n.value;case'var':{if(Object.prototype.hasOwnProperty.call(vars,n.name))return Number(vars[n.name]);if(Object.prototype.hasOwnProperty.call(MATH_CONSTANTS,n.name))return MATH_CONSTANTS[n.name];throw new Error(`Unknown math variable: ${n.name}`);}case'unary':{const v=evalNode(n.arg,vars);return n.op==='-'?-v:+v;}case'binary':{const a=evalNode(n.left,vars),b=evalNode(n.right,vars);if(n.op==='+')return a+b;if(n.op==='-')return a-b;if(n.op==='*')return a*b;if(n.op==='/')return a/b;if(n.op==='%')return a%b;if(n.op==='^')return Math.pow(a,b);return NaN;}case'call':return MATH_FUNCTIONS[n.name](...n.args.map(x=>evalNode(x,vars)));default:return NaN;}};
    return Object.freeze({source:raw,evaluate(vars={}){const normalized={};for(const [k,v] of Object.entries(vars||{}))normalized[String(k).toLowerCase()]=Number(v);const out=evalNode(ast,normalized);if(!Number.isFinite(out))throw new Error(`Expression produced a non-finite result: ${raw}`);return out;}});
  }
  function validateMathExpression(source,vars={x:0,t:.5,i:0,count:10,radius:1,height:1,turns:1,length:1,a:1,b:1,c:0,d:1}){try{const c=compileMathExpression(source),value=c.evaluate(vars);return{ok:true,value,error:null};}catch(e){return{ok:false,value:NaN,error:{message:e.message||String(e),index:Number.isFinite(e.index)?e.index:0}};}}
  function mathPreset(kind,scope='motion'){const list=scope==='init'?MATH_INIT_PRESETS:MATH_MOTION_PRESETS;return list.find(x=>x.name===kind)||list.find(x=>x.name==='Custom math')||list[0];}
  function mathCurvePoints(kind,opts={},scope='motion'){
    const preset=mathPreset(kind,scope),count=Math.max(8,Math.min(scope==='init'?160:240,Math.trunc(num(opts.count,scope==='init'?40:80)))),cfg=opts.math||{},variable=(text(cfg.variable,preset.variable||'x').trim().match(/^[A-Za-z_][A-Za-z0-9_]*$/)?.[0]||'x').toLowerCase(),min=num(cfg.min,preset.min),max=num(cfg.max,preset.max),params={...preset.params,...(cfg.params||{}),...(Object.fromEntries(['a','b','c','d'].filter(k=>cfg[k]!=null).map(k=>[k,cfg[k]])))},exprs={x:text(cfg.x,preset.x),y:text(cfg.y,preset.y),z:text(cfg.z,preset.z)},compiled={x:compileMathExpression(exprs.x),y:compileMathExpression(exprs.y),z:compileMathExpression(exprs.z)},radius=Math.max(0,Math.abs(num(opts.radius,1))),height=num(opts.height,1.5),turns=num(opts.turns,2.5),length=Math.max(0,Math.abs(num(opts.length,3))),pts=[];
    for(let i=0;i<count;i++){const t=count<=1?0:i/(count-1),domain=min+(max-min)*t,vars={x:domain,u:domain,v:domain,t,i,count,radius,height,turns,length,a:num(params.a,1),b:num(params.b,1),c:num(params.c,0),d:num(params.d,1)};vars[variable]=domain;pts.push({x:compiled.x.evaluate(vars),y:compiled.y.evaluate(vars),z:compiled.z.evaluate(vars),t});}return pts;
  }
  function colorModPreset(name){return COLOR_MOD_PRESETS.find(x=>x.name===name)||COLOR_MOD_PRESETS[0];}
  function renderShapePreset(name){return RENDER_SHAPE_PRESETS.find(x=>x.name===name)||RENDER_SHAPE_PRESETS[0];}
  function hexRgba(value,fallback=[1,1,1,1]){const m=text(value).trim().match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i);if(!m)return [...fallback];const h=m[1],out=[parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255];out.push(h.length===8?parseInt(h.slice(6,8),16)/255:1);return out;}
  function studioDirective(source,key,fallback=null){const s=text(source),safe=String(key).replace(/[^A-Za-z0-9_-]/g,''),re=new RegExp(`^\\s*//\\s*@studio-${safe}\\s+(.+?)\\s*$`,'mi'),m=re.exec(s);if(!m)return{value:fallback,error:null,index:-1,raw:''};try{return{value:JSON.parse(m[1]),error:null,index:m.index,raw:m[0]};}catch(e){return{value:fallback,error:e,index:m.index,raw:m[0]};}}
  function setStudioDirective(source,key,value){const src=text(source),safe=String(key).replace(/[^A-Za-z0-9_-]/g,''),line=`    // @studio-${safe} ${JSON.stringify(value)}`,re=new RegExp(`^\\s*//\\s*@studio-${safe}\\s+.*$`,'mi');if(re.test(src))return src.replace(re,line);const open=src.indexOf('{');if(open<0)return src;return src.slice(0,open+1)+`\n${line}`+src.slice(open+1);}
  function validateStudioConfig(key,cfg){const errors=[];if(!cfg||typeof cfg!=='object')return['Studio configuration must be a JSON object.'];if(key==='color'){const mode=text(cfg.mode,'off').toLowerCase();if(!['off','step','crossfade','math'].includes(mode))errors.push(`Unknown color mode: ${cfg.mode}`);if((mode==='step'||mode==='crossfade')&&!(num(mode==='step'?cfg.interval:cfg.period,0)>0))errors.push(`${mode==='step'?'interval':'period'} must be > 0`);if(mode!=='off'){if(!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(text(cfg.colorA,'#ffffff')))errors.push('colorA must be #RRGGBB or #RRGGBBAA');if(!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(text(cfg.colorB,'#ffffff')))errors.push('colorB must be #RRGGBB or #RRGGBBAA');}if(mode==='math'){const A=hexRgba(cfg.colorA),B=hexRgba(cfg.colorB);for(const [label,expr] of [['R',cfg.r],['G',cfg.g],['B',cfg.bExpr],['A',cfg.alpha]])try{compileMathExpression(text(expr,label==='A'?'aa':'0')).evaluate({time:.25,t:.5,age:.5,seed:1,r0:1,g0:1,b0:1,a0:1,ar:A[0],ag:A[1],ab:A[2],aa:A[3],br:B[0],bg:B[1],bb:B[2],ba:B[3],a:num(cfg.params?.a,1),b:num(cfg.params?.b,1),c:num(cfg.params?.c,0),d:num(cfg.params?.d,1)});}catch(e){errors.push(`${label}: ${e.message||e}`);}}}
    if(key==='shape'&&cfg.enabled!==false){const samples=Math.trunc(num(cfg.samples,0));if(samples<8||samples>256)errors.push('shape samples must be between 8 and 256');for(const [axis,expr] of [['X',cfg.x],['Y',cfg.y]])try{compileMathExpression(text(expr,'')).evaluate({theta:.5,x:.5,u:.5,time:.25,t:.5,age:.5,seed:1,a:num(cfg.params?.a,1),b:num(cfg.params?.b,1),c:num(cfg.params?.c,0),d:num(cfg.params?.d,1)});}catch(e){errors.push(`${axis}: ${e.message||e}`);}}
    return errors;}
  function evaluateColorModulation(spec,vars={}){const base=Array.isArray(vars.base)?vars.base:[1,1,1,1],cfg=spec&&typeof spec==='object'?spec:{enabled:false,mode:'off'},mode=text(cfg.mode,'off').toLowerCase();if(cfg.enabled===false||mode==='off')return base.map((v,i)=>Math.max(0,Math.min(1,num(v,i===3?1:1))));const time=num(vars.time,0),age=num(vars.age,0),seed=num(vars.seed,0),A=hexRgba(cfg.colorA,base),B=hexRgba(cfg.colorB,base);if(mode==='step'){const interval=Math.max(.001,num(cfg.interval,1)),pick=Math.abs(Math.floor(time/interval))%2?B:A;return pick.slice(0,4);}if(mode==='crossfade'){const period=Math.max(.001,num(cfg.period,2)),cycle=((time/period)%2+2)%2,k0=cycle<=1?cycle:2-cycle,k=text(cfg.easing,'smooth').toLowerCase()==='linear'?k0:k0*k0*(3-2*k0);return A.map((v,i)=>Math.max(0,Math.min(1,v+(B[i]-v)*k)));}if(mode==='math'){const params={a:1,b:1,c:0,d:1,...(cfg.params||{})},mvars={time,t:age,age,seed,r0:num(base[0],1),g0:num(base[1],1),b0:num(base[2],1),a0:num(base[3],1),ar:A[0],ag:A[1],ab:A[2],aa:A[3],br:B[0],bg:B[1],bb:B[2],ba:B[3],a:num(params.a,1),b:num(params.b,1),c:num(params.c,0),d:num(params.d,1)},exprs=[text(cfg.r,'ar'),text(cfg.g,'ag'),text(cfg.bExpr,'ab'),text(cfg.alpha,'aa')];return exprs.map((expr,i)=>{try{return Math.max(0,Math.min(1,compileMathExpression(expr).evaluate(mvars)));}catch(_){return Math.max(0,Math.min(1,num(base[i],i===3?1:1)));}});}return base.slice(0,4);}
  function rendererShapePoints(spec,vars={},countOverride=0){const cfg=spec&&typeof spec==='object'?spec:null;if(!cfg||cfg.enabled===false)return[];const count=Math.max(8,Math.min(256,Math.trunc(num(countOverride||cfg.samples,64)))),variable=(text(cfg.variable,'theta').trim().match(/^[A-Za-z_][A-Za-z0-9_]*$/)?.[0]||'theta').toLowerCase(),min=num(cfg.min,0),max=num(cfg.max,Math.PI*2),params={a:1,b:1,c:0,d:1,...(cfg.params||{})},cx=compileMathExpression(text(cfg.x,'cos(theta)')),cy=compileMathExpression(text(cfg.y,'sin(theta)')),out=[];for(let i=0;i<count;i++){const u=count<=1?0:i/(count-1),domain=min+(max-min)*u,mvars={theta:domain,x:domain,u,time:num(vars.time,0),t:num(vars.age,0),age:num(vars.age,0),seed:num(vars.seed,0),a:num(params.a,1),b:num(params.b,1),c:num(params.c,0),d:num(params.d,1)};mvars[variable]=domain;out.push({x:cx.evaluate(mvars),y:cy.evaluate(mvars),u});}return out;}
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
    if(String(kind||'').startsWith('Math ·')||kind==='Custom math'||kind==='Mathematical')return mathCurvePoints(kind,opts,'motion');
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
    if(String(kind||'').startsWith('Math ·')||kind==='Custom math'||kind==='Mathematical')return mathCurvePoints(kind,opts,'init');
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
    const layers=balancedBlocks(normalized['code.cfx'],'layer').map(b=>({...b,renderers:[...b.text.matchAll(/Renderers\s*=\s*\[([^\]]*)\]/gi)].flatMap(m=>[...m[1].matchAll(/&([A-Za-z0-9_.-]+)/g)].map(x=>x[1]))}));
    let samplers=balancedBlocks(normalized['samplers.cfx'],'sampler');
    if(!samplers.length)samplers=['curve','shape','turbulence','eventstream'].flatMap(k=>balancedBlocks(normalized['samplers.cfx'],k).map(b=>({...b,subtype:b.subtype||k[0].toUpperCase()+k.slice(1)})));
    const renderers=balancedBlocks(normalized['renderers.cfx'],'renderer').map(b=>{const props={};for(const m of b.body.matchAll(/([A-Za-z0-9_.]+)\s*=\s*([^;]+);/g))props[m[1]]=m[2].trim();return{...b,properties:props};});
    const events=parseEventsCfx(normalized['events.cfx']);
    return{files:normalized,presentFiles:bundleFileList(files),...effect,layers,samplers,renderers,events};
  }
  function lineColumnFromIndex(source,index){const before=text(source).slice(0,Math.max(0,index));const lines=before.split('\n');return{line:lines.length,column:(lines.at(-1)||'').length+1};}
  function validateCfxSource(source,file='code.cfx'){
    const s=text(source).replace(/\r\n?/g,'\n'),issues=[],stack=[];let quote='',quoteStart=-1,lineComment=false,blockComment=false,blockStart=-1;
    const push=(severity,index,message,code)=>{const p=lineColumnFromIndex(s,index);issues.push({file,severity,line:p.line,column:p.column,message,code});};
    const pairs={'}':'{',')':'(',']':'['};for(let i=0;i<s.length;i++){const ch=s[i],nx=s[i+1];if(lineComment){if(ch==='\n')lineComment=false;continue;}if(blockComment){if(ch==='*'&&nx==='/'){blockComment=false;i++;}continue;}if(quote){if(ch==='\\'){i++;continue;}if(ch===quote){quote='';quoteStart=-1;}continue;}if(ch==='/'&&nx==='/'){lineComment=true;i++;continue;}if(ch==='/'&&nx==='*'){blockComment=true;blockStart=i;i++;continue;}if(ch==='"'||ch==="'"){quote=ch;quoteStart=i;continue;}if(ch==='{'||ch==='('||ch==='['){stack.push({ch,index:i});continue;}if(ch==='}'||ch===')'||ch===']'){const top=stack.at(-1);if(!top||top.ch!==pairs[ch])push('error',i,`Unexpected closing ${ch}`,'unexpected-close');else stack.pop();}}
    if(quote)push('error',quoteStart>=0?quoteStart:s.length-1,'Unterminated string literal','unterminated-string');if(blockComment)push('error',blockStart>=0?blockStart:s.length-1,'Unterminated block comment','unterminated-comment');for(const item of stack)push('error',item.index,`Unclosed ${item.ch}`,'unclosed-delimiter');
    const seen=new Map();for(const kind of ['layer','renderer','sampler','curve','shape','turbulence','eventstream'])for(const b of balancedBlocks(s,kind)){const key=`${kind}:${keyNorm(b.name)}`;if(seen.has(key))push('error',b.start,`Duplicate ${kind} name: ${b.name}`,'duplicate-block');else seen.set(key,b.start);}
    s.split('\n').forEach((raw,idx)=>{const t=raw.trim(),studio=t.match(/^\/\/\s*@studio-(color|shape)\s+(.+)$/i);if(studio){try{const cfg=JSON.parse(studio[2]);for(const msg of validateStudioConfig(studio[1].toLowerCase(),cfg))issues.push({file,severity:'error',line:idx+1,column:1,message:`Studio ${studio[1]}: ${msg}`,code:'studio-'+studio[1].toLowerCase()});}catch(e){issues.push({file,severity:'error',line:idx+1,column:1,message:`Invalid @studio-${studio[1]} JSON: ${e.message||e}`,code:'studio-json'});}return;}if(!t||t.startsWith('//')||t.startsWith('/*')||t.startsWith('*'))return;if(/^renderer\s+\S+\s*:\s*\S+\s*$/i.test(t)||/^(?:layer|sampler|curve|shape|turbulence|eventstream)\s+\S+\s*$/i.test(t))issues.push({file,severity:'warning',line:idx+1,column:1,message:'Block declaration has no opening { on this line. Verify the next line.',code:'block-open-next-line'});});
    return issues.sort((a,b)=>a.line-b.line||a.column-b.column);
  }
  function validateBundleFiles(files){
    const normalized={};for(const name of bundleFileList(files||{}))normalized[name]=text(files?.[name]);for(const name of CORE_BUNDLE_FILES)if(!(name in normalized))normalized[name]='';const byFile={};for(const [name,src] of Object.entries(normalized))byFile[name]=validateCfxSource(src,name);const parsed=parseBundle(normalized),layers=new Set((parsed.layers||[]).map(x=>x.name)),renderers=new Set((parsed.renderers||[]).map(x=>x.name));
    const issue=(file,severity,line,column,message,code)=>{(byFile[file]||(byFile[file]=[])).push({file,severity,line,column,message,code});};
    for(const name of CORE_BUNDLE_FILES)if(!Object.prototype.hasOwnProperty.call(files||{},name))issue(name,'error',1,1,`Required bundle file is missing: ${name}`,'missing-file');
    const code=text(normalized['code.cfx']);for(const l of parsed.layers||[])for(const ref of l.renderers||[])if(!renderers.has(ref)){const idx=Math.max(0,code.indexOf('&'+ref,l.start));const p=lineColumnFromIndex(code,idx);issue('code.cfx','error',p.line,p.column,`Layer ${l.name} references missing renderer &${ref}`,'missing-renderer');}
    const effect=text(normalized['effect.cfx']);for(const name of parsed.graph?.spawns||[])if(!layers.has(name)){const idx=Math.max(0,effect.indexOf('&'+name)),p=lineColumnFromIndex(effect,idx);issue('effect.cfx','error',p.line,p.column,`Graph spawns missing layer &${name}`,'missing-layer');}
    for(const e of parsed.graph?.emits||[]){for(const name of [e.from,...(Array.isArray(e.to)?e.to:[e.to]).filter(Boolean)])if(name&&!layers.has(name)){const idx=Math.max(0,effect.indexOf('&'+name)),p=lineColumnFromIndex(effect,idx);issue('effect.cfx','warning',p.line,p.column,`Graph reference &${name} does not match a layer in code.cfx`,'unknown-graph-ref');}}
    let errors=0,warnings=0;for(const arr of Object.values(byFile)){arr.sort((a,b)=>a.line-b.line||a.column-b.column);errors+=arr.filter(x=>x.severity==='error').length;warnings+=arr.filter(x=>x.severity==='warning').length;}return{files:byFile,errors,warnings,total:errors+warnings,valid:errors===0};
  }
  function replaceBlock(source,block,replacement){if(!block||!Number.isInteger(block.start)||!Number.isInteger(block.end))return text(source);return text(source).slice(0,block.start)+text(replacement)+text(source).slice(block.end)}
  function blankBundle(){
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
    &EmissionLayer emits "__e_Child" -> &ParticleLayer;
    &RootLayer emits "Signal" -> &EmissionLayer;
    entry;
    entry "Root" fires &RootLayer."Signal";
}
`,
      'code.cfx':`layer EmissionLayer extends EventMultiplier {
    using {
        "_t_EmissionRate" = 20.0;
    }
}

layer RootLayer extends RootLayerTemplate {
    using {
        "_sd_eventStream" = sd0;
    }
}

layer ParticleLayer {
    properties {
        Renderers = [&MainBillboard];
        sampler "SpawnShape" : Shape = &SpawnShape;
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
        self.invLife = rcp(1.5);
        let spawnPos : f32x3 = SpawnShape.samplePosition();
        PositionState = spawnPos;
        Position = coord_space.world_base_position() + PositionState;
        Velocity = #f32x3(0.0, 0.0, 1.25);
        Size = 0.75;
        Color = #f32x4(1.0, 1.0, 1.0, 1.0);
        Enabled = true;
    }
    evolve physics {
        needs {
            "Position" : f32x3;
            "PositionState" : f32x3;
            "Velocity" : f32x3;
        }
        physics.integrate(position = PositionState, velocity = Velocity, acceleration = #f32x3(0.0, 0.0, 0.0));
        Position = coord_space.world_base_position() + PositionState;
    }
    bind MainBillboard {
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

sampler SpawnShape : Shape {
    SampleDimensionality = 3;
    ShapeType = Sphere;
    Radius = 0.15;
}
`,
      'renderers.cfx':`renderer MainBillboard : Billboard {
    Transparent = true;
    Diffuse = true;
    EnableRendering = true;
    BillboardingMode = ScreenAligned;
    Transparent.Type = Additive;
    Diffuse.DiffuseMap = "_hd.w3mod/textures/fx/flare/flaresimple_bw.dds";
    SoftParticles = true;
    SoftParticles.SoftnessDistance = 0.05;
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
  function propValue(properties,key,fallback=''){
    const props=properties||{},want=keyNorm(key);for(const [k,v] of Object.entries(props))if(keyNorm(k)===want)return v;return fallback;
  }
  function scalarLiteral(value,fallback=0){const m=text(value).match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);return m?num(m[0],fallback):fallback}
  function tupleLiteral(value,count=2,fallback=[]){const vals=[...text(value).matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)].map(m=>num(m[0],0));const out=[];for(let i=0;i<count;i++)out.push(Number.isFinite(vals[i])?vals[i]:(fallback[i]??0));return out}
  function boolLiteral(value,fallback=true){const v=keyNorm(value);if(v==='true'||v==='1'||v==='yes')return true;if(v==='false'||v==='0'||v==='no')return false;return fallback}
  function literalNumber(value){
    const src=text(value).trim(),m=src.match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/);return m?num(m[0],NaN):NaN;
  }
  function literalTuple(value,count){
    let src=text(value).trim();
    src=src.replace(/^#?(?:f32x[234]|float[234]|vec[234])\s*/i,'').trim();
    const open=src[0],close=src[src.length-1];if(!((open==='('&&close===')')||(open==='['&&close===']')))return[];
    const parts=src.slice(1,-1).split(',').map(x=>x.trim());if(parts.length!==count)return[];const vals=parts.map(literalNumber);return vals.every(Number.isFinite)?vals:[];
  }
  function scalarPreviewLiteral(value){
    const src=text(value).trim(),direct=literalNumber(src);if(Number.isFinite(direct))return direct;
    const rand=src.match(/^rand\s*\(\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*,\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*\)$/i);
    if(rand){const a=num(rand[1],NaN),b=num(rand[2],NaN);if(Number.isFinite(a)&&Number.isFinite(b))return(a+b)*.5;}return NaN;
  }
  function randomPreviewRange(value){
    const src=text(value).trim(),m=src.match(/^rand\s*\(\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*,\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*\)$/i);if(!m)return null;const a=num(m[1],NaN),b=num(m[2],NaN);if(!Number.isFinite(a)||!Number.isFinite(b))return null;return[Math.min(a,b),Math.max(a,b)];
  }
  function assignmentExpression(source,names){
    const src=text(source);for(const raw of names){const key=String(raw).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),re=new RegExp(`(?:\\bself\\.)?\\b${key}\\b\\s*=\\s*([^;\\n]+)`,'i'),m=src.match(re);if(m)return m[1].trim();}return'';
  }
  function assignmentLiteral(source,names,count=1){
    const expr=assignmentExpression(source,names);if(!expr)return count>1?[]:NaN;if(count>1){const tuple=literalTuple(expr,count);return tuple.length===count?tuple:[];}const scalar=scalarPreviewLiteral(expr);return Number.isFinite(scalar)?scalar:NaN;
  }
  function eventMultiplierEmission(layer){
    if(!/EventMultiplier/i.test(String(layer?.subtype||'')))return NaN;const src=text(layer?.text),m=src.match(/["']?_t_EmissionRate["']?\s*=\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/i);return m?num(m[1],NaN):NaN;
  }
  function rendererSummary(r){return{type:r.subtype||'Unknown',name:r.name,blend:propValue(r.properties,'Transparent.Type',''),texture:text(propValue(r.properties,'Diffuse.DiffuseMap',propValue(r.properties,'DiffuseMap',''))).replace(/^"|"$/g,''),atlas:propValue(r.properties,'Atlas.SubDiv','')}}
  function rendererPreviewSpec(r){
    const sm=rendererSummary(r),sub=tupleLiteral(sm.atlas,2,[1,1]),cols=Math.max(1,Math.min(64,Math.round(sub[0]||1))),rows=Math.max(1,Math.min(64,Math.round(sub[1]||1))),type=sm.type||'Unknown';
    const colorMeta=studioDirective(r?.text,'color',colorModPreset('Off')).value||colorModPreset('Off'),shapeMeta=studioDirective(r?.text,'shape',renderShapePreset('Off')).value||renderShapePreset('Off');if(!colorMeta.preset&&colorMeta.name)colorMeta.preset=colorMeta.name;if(!shapeMeta.preset&&shapeMeta.name)shapeMeta.preset=shapeMeta.name;
    return{name:r?.name||'',type,enabled:boolLiteral(propValue(r?.properties,'EnableRendering','true'),true),blend:sm.blend||'AlphaBlend',texture:sm.texture||'',atlas:{cols,rows,frames:cols*rows},atlasEnabled:boolLiteral(propValue(r?.properties,'Atlas',cols*rows>1?'true':'false'),cols*rows>1),drawOrder:Math.round(scalarLiteral(propValue(r?.properties,'DrawOrder','0'),0)),billboarding:text(propValue(r?.properties,'BillboardingMode','ScreenAligned')),softParticles:boolLiteral(propValue(r?.properties,'SoftParticles','false'),false),softness:Math.max(0,scalarLiteral(propValue(r?.properties,'SoftParticles.SoftnessDistance','0.5'),.5)),studioColor:colorMeta,studioShape:shapeMeta};
  }
  function samplerShapePreviewSpec(sampler){
    if(!sampler||!/shape/i.test(String(sampler.subtype||'')))return null;const src=text(sampler.body||sampler.text),shapeType=(src.match(/\bShapeType\s*=\s*([A-Za-z0-9_]+)/i)||[])[1]||'Sphere',radius=scalarLiteral((src.match(/\bRadius\s*=\s*([^;]+);/i)||[])[1],1),height=scalarLiteral((src.match(/\bHeight\s*=\s*([^;]+);/i)||[])[1],0);return{name:sampler.name||'',type:'Shape',shapeType,radius:Math.max(0,Number.isFinite(radius)?radius:1),height:Number.isFinite(height)?height:0};
  }
  function sourceMotionPreviewSpec(source){
    const src=text(source),vecExpr=expr=>{const m=text(expr).match(/#?(?:f32x3|float3|vec3)\s*\(\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*\)/i);return m?[num(m[1],NaN),num(m[2],NaN),num(m[3],NaN)]:[];},namedVec=name=>{const key=String(name||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),m=src.match(new RegExp(`(?:let\\s+)?${key}(?:\\s*:\s*[^=;]+)?\\s*=\\s*(#?(?:f32x3|float3|vec3)\\s*\\([^;]+\\))\\s*;`,'i'));return m?vecExpr(m[1]):[];};
    const positionState=(src.match(/\bPositionState\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/i)||[])[1]||'',sampleOf=name=>{if(!name)return'';const key=String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),m=src.match(new RegExp(`(?:let\\s+)?${key}(?:\\s*:\s*[^=;]+)?\\s*=\\s*([A-Za-z_][A-Za-z0-9_]*)\\.samplePosition\\(\\)\\s*;`,'i'));return m?m[1]:'';},spawnSampler=sampleOf(positionState);
    let directVelocity=assignmentLiteral(src,['Velocity','velocity'],3),baseVelocity=directVelocity.length===3?directVelocity:[],spreadSampler='',spreadScale=[];const velAlias=(src.match(/\bVelocity\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/i)||[])[1]||'';
    if(velAlias){const key=velAlias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),m=src.match(new RegExp(`(?:let\\s+)?${key}(?:\\s*:\s*[^=;]+)?\\s*=\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\*\\s*(#?(?:f32x3|float3|vec3)\\s*\\([^;]+?\\))\\s*\\+\\s*(#?(?:f32x3|float3|vec3)\\s*\\([^;]+?\\))\\s*;`,'i'));if(m){const spreadVar=m[1];spreadSampler=sampleOf(spreadVar);spreadScale=vecExpr(m[2]);baseVelocity=vecExpr(m[3]);}}
    const integrate=src.match(/physics\.integrate\s*\([\s\S]*?acceleration\s*=\s*([^,\n\r\)]+(?:\([^\)]*\))?)[\s\S]*?\)/i);let acceleration=[];if(integrate){const expr=String(integrate[1]||'').trim(),direct=vecExpr(expr);if(direct.length===3)acceleration=direct;else if(/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr))acceleration=namedVec(expr);}if(!acceleration.length){const gravityAlias=(src.match(/(?:let\s+)?gravity(?:\s*:\s*[^=;]+)?\s*=\s*(#?(?:f32x3|float3|vec3)\s*\([^;]+\))\s*;/i)||[])[1];if(gravityAlias)acceleration=vecExpr(gravityAlias);}
    const hasPhysics=!!(spawnSampler||spreadSampler||baseVelocity.length===3||acceleration.length===3||/physics\.integrate/i.test(src));return{hasPhysics,spawnSampler,spreadSampler,spreadScale:spreadScale.length===3?spreadScale:[1,1,1],baseVelocity:baseVelocity.length===3?baseVelocity:null,acceleration:acceleration.length===3?acceleration:null};
  }
  function layerPreviewSpec(layer){
    const src=text(layer?.text),inv=src.match(/\bself\.invLife\s*=\s*rcp\s*\(\s*([-+0-9.eE]+)\s*\)/i),duration=assignmentLiteral(src,['LifeSpan','Lifetime','Life','Duration','ParticleLife']),rate=assignmentLiteral(src,['EmissionRate','SpawnRate','Rate','ParticleRate']),sizeExpr=assignmentExpression(src,['Size','SizeScale','Scale','ParticleSize']),size=scalarPreviewLiteral(sizeExpr),sizeRange=randomPreviewRange(sizeExpr),gravity=assignmentLiteral(src,['Gravity','gravity']),velocity=assignmentLiteral(src,['Velocity','velocity'],3),position=assignmentLiteral(src,['Position','position'],3),color=assignmentLiteral(src,['Color','color','ColorMultiplier'],4),sourceMotion=sourceMotionPreviewSpec(src);
    let life=inv?num(inv[1],1.5):duration;life=Number.isFinite(life)&&life>0?Math.min(20,Math.max(.05,life)):1.5;
    const emission=Number.isFinite(rate)&&rate>0?Math.min(240,Math.max(.5,rate)):18;
    const scale=Number.isFinite(size)&&size>0?Math.min(16,Math.max(.05,size)):1;
    const sourceVelocity=sourceMotion.baseVelocity,vel=velocity.length===3?velocity:(sourceVelocity?.length===3?sourceVelocity:[0,0,NaN]),pos=position.length===3?position:[0,0,0],rgba=color.length===4?color:[1,1,1,1];
    const hasVelocity=vel.every(Number.isFinite),accel=sourceMotion.acceleration,motion=/\b(?:sin|cos)\s*\(/i.test(src)?'orbit':(sourceMotion.hasPhysics&&accel?.some(v=>Math.abs(v)>1e-9))?'ballistic':hasVelocity?'velocity':'drift';
    return{name:layer?.name||'',renderers:[...(layer?.renderers||[])],life,emission,size:scale,sizeRange,gravity:Number.isFinite(gravity)?Math.max(-100,Math.min(100,gravity)):(accel?.length===3?Math.max(-100,Math.min(100,accel[2])):0),velocity:hasVelocity?vel:[0,0,.7],position:pos.map(v=>Number.isFinite(v)?v:0),color:rgba.map((v,i)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):(i===3?1:1)),motion,sourceMotion,sourceDerived:{life:!!inv||Number.isFinite(duration),emission:Number.isFinite(rate),size:Number.isFinite(size),sizeRange:!!sizeRange,velocity:hasVelocity,color:color.length===4,gravity:Number.isFinite(gravity)||!!accel,sourceMotion:sourceMotion.hasPhysics}};
  }
  function buildLivePreviewDescriptor(bundle){
    const b=bundle||{},renderers=(b.renderers||[]).map(rendererPreviewSpec),byName=new Map(renderers.map(r=>[r.name,r])),layers=b.layers||[],shapeSamplers=new Map((b.samplers||[]).map(s=>[s.name,samplerShapePreviewSpec(s)]).filter(([,v])=>v)),layerSpecs=new Map(layers.map(layer=>[layer.name,layerPreviewSpec(layer)])),eventRates=new Map(),emitters=[];let id=0;
    for(const edge of b.graph?.emits||[]){if(!edge?.to)continue;const source=layers.find(x=>x.name===edge.from),rate=eventMultiplierEmission(source);if(!Number.isFinite(rate)||rate<=0)continue;const previous=eventRates.get(edge.to);eventRates.set(edge.to,Number.isFinite(previous)?previous+rate:rate);}
    for(const layer of layers){const base=layerSpecs.get(layer.name)||layerPreviewSpec(layer),incoming=eventRates.get(layer.name),lp={...base,sourceDerived:{...(base.sourceDerived||{})},sourceMotion:{...(base.sourceMotion||{})}};if(lp.sourceMotion){lp.sourceMotion.spawnShape=shapeSamplers.get(lp.sourceMotion.spawnSampler)||null;lp.sourceMotion.spreadShape=shapeSamplers.get(lp.sourceMotion.spreadSampler)||null;}if(!lp.sourceDerived.emission&&Number.isFinite(incoming)&&incoming>0){lp.emission=Math.min(240,Math.max(.5,incoming));lp.sourceDerived.emission=true;lp.sourceDerived.emissionFromEventMultiplier=true;lp.continuousEmission=true;lp.emissionSource='EventMultiplier';}for(const rendererName of lp.renderers){const r=byName.get(rendererName);if(!r||!r.enabled)continue;emitters.push({id:id++,layer:lp.name,renderer:r,...lp});}}
    if(!emitters.length){for(const r of renderers)if(r.enabled)emitters.push({id:id++,layer:'Preview',renderer:r,name:'Preview',renderers:[r.name],life:1.5,emission:18,size:1,sizeRange:null,gravity:0,velocity:[0,0,.7],position:[0,0,0],color:[1,1,1,1],motion:'drift',continuousEmission:false,sourceDerived:{}});}
    const textures=[...new Set(emitters.map(e=>e.renderer.texture).filter(Boolean))],supported=emitters.filter(e=>/^(?:Billboard|Ribbon|Light|Mesh)$/i.test(e.renderer.type)).length;
    return{emitters,textures,rendererCount:renderers.length,supported,unsupported:Math.max(0,emitters.length-supported),graphRoots:[...(b.graph?.spawns||[])],sourceLayers:layers.length};
  }


  return Object.freeze({CORE_BUNDLE_FILES,OPTIONAL_BUNDLE_FILES,KNOWN_BUNDLE_FILES,EFFECT_TYPES,MOTIONS,INIT_SHAPES,MATH_MOTION_PRESETS,MATH_INIT_PRESETS,COLOR_MOD_PRESETS,RENDER_SHAPE_PRESETS,MATH_CONSTANTS,MATH_FUNCTIONS,compileMathExpression,validateMathExpression,mathCurvePoints,mathPreset,colorModPreset,renderShapePreset,hexRgba,studioDirective,setStudioDirective,validateStudioConfig,evaluateColorModulation,rendererShapePoints,parseIni,serializeIni,cloneIni,findSection,ensureSection,getIniValue,setIniValue,deleteIniValue,deleteSection,renameSection,epfLayerParts,epfStuffParts,epfStuffLayerSection,epfStuffsForLayer,inferEpfStuffType,epfStuffField,setEpfStuffField,parseEpf,createDefaultEpf,addEpfLayer,removeEpfLayer,addEpfStuff,motionPoints,initialShapePoints,generateEffectScript,balancedBlocks,parseEffectCfx,parseEventsCfx,bundleFileList,parseBundle,validateCfxSource,validateBundleFiles,replaceBlock,blankBundle,rendererSummary,rendererPreviewSpec,layerPreviewSpec,buildLivePreviewDescriptor});
});
