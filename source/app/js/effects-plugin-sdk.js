(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.WC3_EFFECTS_PLUGIN_SDK=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const VERSION=1,TYPES=Object.freeze(['importer','exporter','validator','preset','backend','panel']),registry=new Map();
  const text=v=>String(v??'').trim();
  function validatePlugin(p){if(!p||typeof p!=='object')throw new Error('Plugin descriptor must be an object.');const id=text(p.id),type=text(p.type);if(!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(id))throw new Error('Plugin id is invalid.');if(!TYPES.includes(type))throw new Error(`Unsupported plugin type: ${type}`);if(typeof p.run!=='function'&&typeof p.activate!=='function')throw new Error('Plugin must expose run() or activate().');return{id,type,name:text(p.name||id),version:text(p.version||'0.0.0'),description:text(p.description||''),capabilities:Array.isArray(p.capabilities)?p.capabilities.map(text).filter(Boolean):[],run:p.run,activate:p.activate,deactivate:p.deactivate,source:text(p.source||'runtime')};}
  function register(plugin){const p=validatePlugin(plugin);if(registry.has(p.id))throw new Error(`Plugin already registered: ${p.id}`);registry.set(p.id,p);return summary(p);}
  function unregister(id){const p=registry.get(text(id));if(!p)return false;try{p.deactivate?.();}catch(_){}registry.delete(p.id);return true;}
  function summary(p){return{id:p.id,type:p.type,name:p.name,version:p.version,description:p.description,capabilities:[...p.capabilities],source:p.source};}
  function list(type=''){return[...registry.values()].filter(p=>!type||p.type===type).map(summary);}
  function get(id){return registry.get(text(id))||null;}
  async function run(id,context={}){const p=get(id);if(!p)throw new Error(`Plugin not found: ${id}`);if(p.activate&&!p.__active){await p.activate(context);p.__active=true;}if(typeof p.run==='function')return p.run(context);return null;}
  async function runType(type,context={}){const out=[];for(const p of registry.values())if(p.type===type)out.push({plugin:summary(p),result:await run(p.id,context)});return out;}
  return Object.freeze({VERSION,TYPES,register,unregister,list,get,run,runType});
});
