(function(){
  'use strict';

  const EPS = 1e-8;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
  const mul=(a,s)=>({x:a.x*s,y:a.y*s,z:a.z*s});
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});

  function viewportMetrics(canvas){
    if(!canvas) return {rect:{left:0,top:0,width:1,height:1},contentLeft:0,contentTop:0,cssWidth:1,cssHeight:1,canvasWidth:1,canvasHeight:1,cssToCanvasX:1,cssToCanvasY:1};
    const rect=canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : {left:0,top:0,width:canvas.clientWidth||canvas.width||1,height:canvas.clientHeight||canvas.height||1};
    let bl=0,br=0,bt=0,bb=0,pl=0,pr=0,pt=0,pb=0;
    if(typeof getComputedStyle==='function'){
      const cs=getComputedStyle(canvas);
      bl=parseFloat(cs.borderLeftWidth)||0;br=parseFloat(cs.borderRightWidth)||0;bt=parseFloat(cs.borderTopWidth)||0;bb=parseFloat(cs.borderBottomWidth)||0;
      pl=parseFloat(cs.paddingLeft)||0;pr=parseFloat(cs.paddingRight)||0;pt=parseFloat(cs.paddingTop)||0;pb=parseFloat(cs.paddingBottom)||0;
    }
    const cssWidth=Math.max(1,rect.width-bl-br-pl-pr),cssHeight=Math.max(1,rect.height-bt-bb-pt-pb);
    const canvasWidth=Math.max(1,canvas.width||1),canvasHeight=Math.max(1,canvas.height||1);
    return {rect,contentLeft:rect.left+bl+pl,contentTop:rect.top+bt+pt,cssWidth,cssHeight,canvasWidth,canvasHeight,cssToCanvasX:canvasWidth/cssWidth,cssToCanvasY:canvasHeight/cssHeight};
  }

  function clientToCanvas(canvas,clientX,clientY,doClamp=true){
    const m=viewportMetrics(canvas);
    let x=(clientX-m.contentLeft)*m.cssToCanvasX;
    let y=(clientY-m.contentTop)*m.cssToCanvasY;
    if(doClamp){x=clamp(x,0,m.canvasWidth);y=clamp(y,0,m.canvasHeight);}
    return {x,y,metrics:m};
  }

  function cameraBasis(camera){
    const yaw=camera.yaw||0,pitch=camera.pitch||0,roll=camera.roll||0;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
    // Warcraft world: X/Y ground plane, Z up. These vectors are derived once and are
    // shared by WebGL, overlay projection, picking and gizmos.
    const right={x:cy*cr+sy*sp*sr,y:-sy*cr+cy*sp*sr,z:-cp*sr};
    const up={x:cy*sr-sy*sp*cr,y:-sy*sr-cy*sp*cr,z:cp*cr};
    const forward={x:sy*cp,y:cy*cp,z:sp};
    return {right,up,forward};
  }

  function createOrthoTransform(camera,canvas,overrides={}){
    const target={x:Number.isFinite(camera.targetX)?camera.targetX:0,y:Number.isFinite(camera.targetY)?camera.targetY:0,z:Number.isFinite(camera.targetZ)?camera.targetZ:0};
    const basis=cameraBasis({...camera,...overrides});
    const norm=Math.max(1,Number.isFinite(overrides.norm)?overrides.norm:(camera.norm||1));
    const zoom=Math.max(EPS,Number.isFinite(overrides.zoom)?overrides.zoom:(camera.zoom||1));
    const m=viewportMetrics(canvas);
    const pxScale=(m.canvasHeight*0.34/norm)*zoom;
    const panCssX=Number.isFinite(overrides.panX)?overrides.panX:(camera.panX||0),panCssY=Number.isFinite(overrides.panY)?overrides.panY:(camera.panY||0);
    const pan={x:panCssX*m.cssToCanvasX,y:panCssY*m.cssToCanvasY};
    const center={x:m.canvasWidth*0.5,y:m.canvasHeight*0.5};
    const worldToView=(p)=>{const d=sub(p,target);return {x:dot(d,basis.right),y:dot(d,basis.up),z:dot(d,basis.forward)};};
    const viewToScreen=(v)=>({x:center.x+pan.x+v.x*pxScale,y:center.y+pan.y-v.y*pxScale,z:v.z,w:1,invW:1});
    const worldToScreen=(p)=>viewToScreen(worldToView(p));
    const screenToRay=(p)=>{
      const vx=(p.x-center.x-pan.x)/pxScale;
      const vy=-(p.y-center.y-pan.y)/pxScale;
      const far=Math.max(64,norm*8);
      const plane=add(target,add(mul(basis.right,vx),mul(basis.up,vy)));
      return {origin:add(plane,mul(basis.forward,far)),direction:mul(basis.forward,-1),viewX:vx,viewY:vy};
    };
    return {target,norm,zoom,basis,metrics:m,pxScale,pan,center,worldToView,viewToScreen,worldToScreen,screenToRay};
  }

  function rayTriangle(ray,a,b,c,cullBackface=false){
    const e1=sub(b,a),e2=sub(c,a),p=cross(ray.direction,e2),det=dot(e1,p);
    if(cullBackface){if(det<=EPS)return null;} else if(Math.abs(det)<=EPS)return null;
    const inv=1/det,tv=sub(ray.origin,a),u=dot(tv,p)*inv;
    if(u<-EPS||u>1+EPS)return null;
    const q=cross(tv,e1),v=dot(ray.direction,q)*inv;
    if(v<-EPS||u+v>1+EPS)return null;
    const t=dot(e2,q)*inv;
    if(t<-EPS)return null;
    return {t,bary:[1-u-v,u,v],point:add(ray.origin,mul(ray.direction,t)),det};
  }

  function wrap01(n){return ((n%1)+1)%1;}
  function normalizeUv(uv,textureDef){
    let u=Number.isFinite(uv&&uv.u)?uv.u:0,v=Number.isFinite(uv&&uv.v)?uv.v:0;
    u=textureDef&&textureDef.wrapWidth?wrap01(u):clamp(u,0,1);
    v=textureDef&&textureDef.wrapHeight?wrap01(v):clamp(v,0,1);
    return {u,v};
  }

  // Canonical Model Lab convention: UV (0,0) is the top-left of the decoded image,
  // exactly like HTML canvas. GPU upload uses UNPACK_FLIP_Y_WEBGL=false and the
  // shader samples authored V directly. Parser, paint, CPU and GPU share one convention.
  function uvToTexel(uv,width,height,textureDef){
    const n=normalizeUv(uv,textureDef),w=Math.max(1,width||1),h=Math.max(1,height||1);
    return {u:n.u,v:n.v,x:clamp(n.u*w-0.5,0,w-1),y:clamp(n.v*h-0.5,0,h-1)};
  }

  function texelToUv(x,y,width,height){
    const w=Math.max(1,width||1),h=Math.max(1,height||1);
    return {u:(x+0.5)/w,v:(y+0.5)/h};
  }

  window.MODEL_LAB_GEOMETRY={version:'1.0',viewportMetrics,clientToCanvas,cameraBasis,createOrthoTransform,rayTriangle,normalizeUv,uvToTexel,texelToUv};
})();
