(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.WC3_EFFECTS_ATLAS_TOOLS=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const MODES=Object.freeze(['loop','ping-pong','random','once']);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function normalize(cfg={}){const cols=clamp(Math.round(Number(cfg.cols)||1),1,64),rows=clamp(Math.round(Number(cfg.rows)||1),1,64),total=cols*rows,frames=clamp(Math.round(Number(cfg.frames)||total),1,total),fps=clamp(Number(cfg.fps)||12,.1,240),mode=MODES.includes(cfg.mode)?cfg.mode:'loop';return{cols,rows,frames,fps,mode,padding:clamp(Math.round(Number(cfg.padding)||0),0,128)};}
  function sequence(cfg={},elapsed=0,seed=0){const c=normalize(cfg),step=Math.max(0,Math.floor(Math.max(0,Number(elapsed)||0)*c.fps));if(c.mode==='once')return Math.min(c.frames-1,step);if(c.mode==='random'){let x=(step+1)*1103515245+(Number(seed)||0)*12345;x=(x^(x>>>16))>>>0;return x%c.frames;}if(c.mode==='ping-pong'&&c.frames>1){const span=c.frames*2-2,n=step%span;return n<c.frames?n:span-n;}return step%c.frames;}
  function frameRect(width,height,cfg={},frame=0){const c=normalize(cfg),cellW=Number(width||0)/c.cols,cellH=Number(height||0)/c.rows,i=clamp(Math.floor(Number(frame)||0),0,c.frames-1),col=i%c.cols,row=Math.floor(i/c.cols),p=Math.min(c.padding,Math.max(0,Math.floor(Math.min(cellW,cellH)/2)-1));return{x:col*cellW+p,y:row*cellH+p,width:Math.max(1,cellW-p*2),height:Math.max(1,cellH-p*2),col,row,index:i};}
  return Object.freeze({MODES,normalize,sequence,frameRect});
});
