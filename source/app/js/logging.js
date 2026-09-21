(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const entries=[];
  const maxEntries=3000;
  let seq=0;
  let mainImported=false;
  const persistentSeen=new Set();
  const originals={log:console.log.bind(console),info:console.info.bind(console),warn:console.warn.bind(console),error:console.error.bind(console),debug:console.debug.bind(console)};

  function safe(value,depth=0){
    if(value==null)return value;
    if(value instanceof Error)return {name:value.name,message:value.message,stack:value.stack||''};
    if(value instanceof ArrayBuffer)return `[ArrayBuffer ${value.byteLength} bytes]`;
    if(ArrayBuffer.isView(value))return `[${value.constructor&&value.constructor.name||'TypedArray'} ${value.byteLength} bytes]`;
    if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;
    if(depth>3)return '[…]';
    if(Array.isArray(value))return value.slice(0,40).map(v=>safe(v,depth+1));
    if(typeof value==='object'){
      const out={};let n=0;
      for(const [k,v] of Object.entries(value)){if(n++>60){out.__truncated='…';break;}try{out[k]=safe(v,depth+1);}catch(_){out[k]='[unavailable]';}}
      return out;
    }
    return String(value);
  }
  function detailText(detail){
    if(detail==null||detail==='')return '';
    if(typeof detail==='string')return detail;
    try{return JSON.stringify(safe(detail),null,2);}catch(_){return String(detail);}
  }
  function normalizeMessage(args){
    return args.map(v=>typeof v==='string'?v:detailText(v)).join(' ');
  }
  function add(level,source,message,detail='',opts={}){
    const entry={id:++seq,time:opts.time||new Date().toISOString(),level:String(level||'info').toLowerCase(),source:String(source||'App'),message:String(message||''),detail:detailText(detail)};
    entries.push(entry);if(entries.length>maxEntries)entries.splice(0,entries.length-maxEntries);
    if(opts.persist!==false && window.WC3_DIAGNOSTICS?.append){
      window.WC3_DIAGNOSTICS.append({level:entry.level,source:entry.source,message:entry.message,detail:entry.detail}).catch(()=>{});
    }
    renderSoon();
    window.dispatchEvent(new CustomEvent('wc3-log-entry',{detail:entry}));
    return entry;
  }
  function levelAllowed(level){
    const el=$(`#logLevel${level[0].toUpperCase()+level.slice(1)}`);return !el||el.checked;
  }
  let renderPending=false;
  function renderSoon(){if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;render();});}
  function render(){
    const host=$('#logEntries');if(!host)return;
    const q=($('#logSearch')?.value||'').trim().toLowerCase();
    const filtered=entries.filter(e=>levelAllowed(e.level)&&(!q||`${e.time} ${e.level} ${e.source} ${e.message} ${e.detail}`.toLowerCase().includes(q)));
    const frag=document.createDocumentFragment();
    const start=Math.max(0,filtered.length-800);
    for(const e of filtered.slice(start)){
      const row=document.createElement('div');row.className=`log-row level-${e.level}`;
      const time=document.createElement('span');time.className='log-time';time.textContent=new Date(e.time).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const level=document.createElement('span');level.className='log-level';level.textContent=e.level.toUpperCase();
      const source=document.createElement('span');source.className='log-source';source.textContent=e.source;
      const msg=document.createElement('span');msg.className='log-message';msg.textContent=e.message;
      row.append(time,level,source,msg);
      if(e.detail){const d=document.createElement('pre');d.className='log-detail';d.textContent=e.detail;row.appendChild(d);row.addEventListener('click',()=>row.classList.toggle('expanded'));}
      frag.appendChild(row);
    }
    host.replaceChildren(frag);
    const count=$('#logCount');if(count)count.textContent=`${filtered.length}/${entries.length}`;
    if($('#logAutoScroll')?.checked)host.scrollTop=host.scrollHeight;
  }
  function textDump(){return entries.map(e=>`[${e.time}] [${e.level.toUpperCase()}] [${e.source}] ${e.message}${e.detail?`\n${e.detail}`:''}`).join('\n');}
  async function importMain(){
    if(mainImported||!window.WC3_DIAGNOSTICS?.read)return;
    mainImported=true;
    try{
      const r=await window.WC3_DIAGNOSTICS.read();
      const lines=String(r&&r.text||'').split(/\r?\n/).filter(Boolean);
      for(const line of lines){if(persistentSeen.has(line))continue;persistentSeen.add(line);try{const e=JSON.parse(line);add(e.level||'info',e.source||'Main',e.message||'',e.detail||'',{persist:false,time:e.time});}catch(_){add('info','Main',line,'',{persist:false});}}
      add('info','Log','Persistent runtime log attached',{path:r&&r.path||''},{persist:false});
    }catch(e){add('warn','Log','Could not read persistent runtime log',e,{persist:false});}
  }

  console.log=(...args)=>{originals.log(...args);add('info','Console',normalizeMessage(args),'');};
  console.info=(...args)=>{originals.info(...args);add('info','Console',normalizeMessage(args),'');};
  console.warn=(...args)=>{originals.warn(...args);add('warn','Console',normalizeMessage(args),'');};
  console.error=(...args)=>{originals.error(...args);const err=args.find(x=>x instanceof Error);add('error','Console',normalizeMessage(args),err||'');};
  console.debug=(...args)=>{originals.debug(...args);add('debug','Console',normalizeMessage(args),'');};

  window.addEventListener('error',e=>add('error','Window',e.message||'Uncaught error',{filename:e.filename,lineno:e.lineno,colno:e.colno,error:e.error}));
  window.addEventListener('unhandledrejection',e=>add('error','Promise','Unhandled promise rejection',e.reason));

  document.addEventListener('click',e=>{
    const b=e.target.closest('button,[role="button"],summary');if(!b)return;
    const label=(b.textContent||b.getAttribute('title')||b.id||b.tagName).trim().replace(/\s+/g,' ').slice(0,120);
    add('debug','UI',`Click · ${label}`,{id:b.id||'',module:document.body.dataset.module||''});
  },true);
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.id)return;
    let value=t.type==='file'?Array.from(t.files||[]).map(f=>({name:f.name,size:f.size,type:f.type})):t.type==='checkbox'?t.checked:t.value;
    add('debug','UI',`Change · ${t.id}`,{value,module:document.body.dataset.module||''});
  },true);

  $('#logSearch')?.addEventListener('input',renderSoon);
  ['Info','Warn','Error','Debug'].forEach(x=>$('#logLevel'+x)?.addEventListener('change',renderSoon));
  $('#logAutoScroll')?.addEventListener('change',renderSoon);
  $('#logClearBtn')?.addEventListener('click',async()=>{entries.length=0;persistentSeen.clear();render();try{await window.WC3_DIAGNOSTICS?.clear?.();}catch(_){}add('info','Log','Log cleared','',{persist:false});});
  $('#logCopyBtn')?.addEventListener('click',async()=>{const txt=textDump();try{await navigator.clipboard.writeText(txt);add('info','Log','Log copied to clipboard',{characters:txt.length});}catch(e){add('error','Log','Could not copy log',e);}});
  $('#logExportBtn')?.addEventListener('click',()=>{const blob=new Blob([textDump()],{type:'text/plain;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`WC3-Asset-Studio-log-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);add('info','Log','Log export requested');});
  $('#logRefreshBtn')?.addEventListener('click',async()=>{mainImported=false;await importMain();render();});

  window.WC3_DIAGNOSTICS?.onMainLog?.(entry=>{if(entry)add(entry.level||'info',entry.source||'Main',entry.message||'',entry.detail||'',{persist:false,time:entry.time});});
  window.WC3_LOG=Object.freeze({
    add,
    info:(source,message,detail)=>add('info',source,message,detail),
    warn:(source,message,detail)=>add('warn',source,message,detail),
    error:(source,message,detail)=>add('error',source,message,detail),
    debug:(source,message,detail)=>add('debug',source,message,detail),
    render,entries:()=>entries.slice(),importMain,textDump
  });
  importMain().finally(()=>add('info','App','Renderer diagnostics online',{userAgent:navigator.userAgent,devicePixelRatio:window.devicePixelRatio},{persist:true}));
})();
