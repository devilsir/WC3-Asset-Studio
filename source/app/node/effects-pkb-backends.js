'use strict';
const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');

function readJson(file,fallback={}){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){return{...fallback};}}
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2),'utf8');}
function existsFile(file){try{return !!file&&fs.statSync(file).isFile();}catch(_){return false;}}
function existsDir(file){try{return !!file&&fs.statSync(file).isDirectory();}catch(_){return false;}}
function normalized(file){return file?path.resolve(String(file)):'';}
function runProcess(exe,args,{cwd='',timeout=180000,env={}}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args.map(String),{cwd:cwd||path.dirname(exe),windowsHide:true,env:{...process.env,...env}});
    let stdout='',stderr='',done=false;const cap=1024*1024;
    const append=(cur,b)=>{cur+=b.toString();return cur.length>cap?cur.slice(-cap):cur;};
    child.stdout?.on('data',b=>stdout=append(stdout,b));child.stderr?.on('data',b=>stderr=append(stderr,b));
    const timer=setTimeout(()=>{if(done)return;done=true;try{child.kill();}catch(_){}reject(new Error(`PKB backend timed out after ${Math.round(timeout/1000)}s.`));},timeout);
    child.on('error',err=>{if(done)return;done=true;clearTimeout(timer);reject(err);});
    child.on('close',code=>{if(done)return;done=true;clearTimeout(timer);const result={ok:code===0,code,stdout:stdout.trim(),stderr:stderr.trim(),exe,args:[...args]};if(code===0)resolve(result);else{const e=new Error(result.stderr||result.stdout||`PKB backend exited with code ${code}`);e.result=result;reject(e);}});
  });
}
function createEffectsBackendManager({settingsPath,devRuntimePath='',isPackaged=false,logger=()=>{}}={}){
  const defaults={schema:1,mode:'auto',externalCli:'',cfxLibrary:'',contract:'auto',legacyDesigner:''};
  const load=()=>({...defaults,...readJson(settingsPath,defaults)});
  const save=s=>{const next={...defaults,...s};writeJson(settingsPath,next);return next;};
  function inferContract(exe,configured='auto'){
    if(configured&&configured!=='auto')return configured;
    const base=path.basename(exe||'').toLowerCase();
    if(base.includes('cornsyrup'))return'cornsyrup';
    return'subcommands';
  }
  function siblingLibrary(exe){const dir=exe?path.dirname(exe):'';for(const candidate of [path.join(dir,'cfxlib'),path.join(dir,'lib','cfxlib')])if(existsDir(candidate))return candidate;return'';}
  function resolve(){
    const s=load(),envCli=normalized(process.env.WC3_EFFECTS_CLI||process.env.CORNSYRUP_CLI||process.env.EFFECTSRT_PATH||'');
    const configured=normalized(s.externalCli||'');
    if(s.mode==='external'&&existsFile(configured))return{id:'external-cli',label:'External CFX / PKB CLI',ready:true,executable:configured,contract:inferContract(configured,s.contract),libraryPath:normalized(s.cfxLibrary)||siblingLibrary(configured),distributable:false,source:'user-configured'};
    if(s.mode!=='disabled'&&existsFile(envCli))return{id:'external-cli',label:'External CFX / PKB CLI',ready:true,executable:envCli,contract:inferContract(envCli,s.contract),libraryPath:normalized(s.cfxLibrary)||siblingLibrary(envCli),distributable:false,source:'environment'};
    if(!isPackaged&&s.mode!=='disabled'&&existsFile(devRuntimePath))return{id:'dev-local-unverified',label:'Local development PKB backend',ready:true,executable:normalized(devRuntimePath),contract:'subcommands',libraryPath:normalized(s.cfxLibrary)||siblingLibrary(devRuntimePath),distributable:false,source:'development-only',warning:'Unverified local backend is available only in source/development builds and is not packaged.'};
    return{id:'none',label:'No PKB backend configured',ready:false,executable:'',contract:'none',libraryPath:'',distributable:true,source:'none'};
  }
  function status(){const s=load(),selected=resolve();return{ready:selected.ready,selected,settings:{mode:s.mode,externalCli:s.externalCli,cfxLibrary:s.cfxLibrary,contract:s.contract,legacyDesigner:s.legacyDesigner},nativeBackend:{id:'native-pkb',label:'Native PKB backend',ready:false,status:'planned'},thirdPartyBundled:false,distributionPolicy:'WC3 Asset Studio does not package the unverified PKB compiler/decompiler, cfxlib, or legacy Effect Designer. Configure an external CLI to build/decompile PKB files.'};}
  function configureExternal(executable,{libraryPath='',contract='auto'}={}){const exe=normalized(executable);if(!existsFile(exe))throw new Error('Choose a valid CFX / PKB CLI executable.');const s=load();save({...s,mode:'external',externalCli:exe,cfxLibrary:normalized(libraryPath)||s.cfxLibrary||'',contract:contract||'auto'});return status();}
  function configureLibrary(libraryPath){const p=normalized(libraryPath);if(p&&!existsDir(p))throw new Error('Choose a valid CFX library folder.');const s=load();save({...s,cfxLibrary:p});return status();}
  function clearExternal(){const s=load();save({...s,mode:'auto',externalCli:'',contract:'auto'});return status();}
  function setDisabled(disabled=true){const s=load();save({...s,mode:disabled?'disabled':'auto'});return status();}
  function setLegacyDesigner(executable){const exe=normalized(executable);if(exe&&!existsFile(exe))throw new Error('Choose a valid legacy Effect Designer executable.');const s=load();save({...s,legacyDesigner:exe});return status();}
  async function tryRun(exe,args,opts){logger('debug','PKB backend attempt',{exe,args});return runProcess(exe,args,opts);}
  async function run(command,args=[],opts={}){
    const b=resolve();if(!b.ready)throw new Error('No PKB backend is configured. Choose an external CornSyrup/CFX-compatible CLI in Effects Lab.');
    const env={};if(b.libraryPath)env.EFFECTSRT_CFX_PATH=b.libraryPath;
    const cwd=opts.cwd||path.dirname(b.executable),baseOpts={...opts,cwd,env:{...env,...(opts.env||{})}};
    const direct=[command,...args];
    if(b.contract==='subcommands')return tryRun(b.executable,direct,baseOpts);
    if(b.contract==='cornsyrup'){
      // CornSyrup's distributed CLI has changed syntax across releases. Prefer
      // explicit subcommands, then fall back to direct input/output conversion.
      try{return await tryRun(b.executable,direct,baseOpts);}catch(first){
        if((command==='decompile'||command==='build')&&args.length>=2){try{return await tryRun(b.executable,[args[0],args[1]],baseOpts);}catch(second){second.cause=first;throw second;}}
        throw first;
      }
    }
    return tryRun(b.executable,direct,baseOpts);
  }
  async function selfTest(){const b=resolve();if(!b.ready)return{ready:false,...status()};for(const args of [['help'],['--help'],[]]){try{const run=await tryRun(b.executable,args,{timeout:10000,cwd:path.dirname(b.executable),env:b.libraryPath?{EFFECTSRT_CFX_PATH:b.libraryPath}:{}});return{ready:true,...status(),run,output:(run.stdout||run.stderr||'').trim(),probe:args.join(' ')||'(no args)'};}catch(e){logger('debug','PKB backend probe failed',{exe:b.executable,args,message:e.message});}}return{ready:false,...status(),error:'Backend executable exists but did not respond to help probes.'};}
  return Object.freeze({status,resolve,configureExternal,configureLibrary,clearExternal,setDisabled,setLegacyDesigner,run,selfTest,loadSettings:load});
}
module.exports={createEffectsBackendManager,runProcess};
