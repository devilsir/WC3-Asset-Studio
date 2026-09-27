(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const workspaceButtons = () => $$('#workspaceTabs .workspace-tab');
  const titles = {
    texture: 'Texture Paint',
    model: 'Model Lab',
    effects: 'Effects Lab',
    casc: 'CASC',
    sanity: 'Sanity Checker',
    buttons: 'WC3 Buttons',
    log: 'Log'
  };

  function updateHeaderForModule(module){
    const openBtn=$('#openBtn');
    const importBtn=$('#importLayerBtn');
    const newBtn=$('#newBtn');
    const saveBtn=$('#saveProjectBtn');
    const exportBtns=['exportBlpBtn','exportTgaBtn','exportPngBtn','exportGameBtn'].map(id=>$('#'+id)).filter(Boolean);
    const exportGroup=document.querySelector('.header-export-actions');
    if(openBtn){ openBtn.textContent = module==='model' ? 'Open Model' : module==='buttons' ? 'Open Source' : module==='sanity' ? 'Open Files' : 'Open'; openBtn.style.display=(module==='log'||module==='casc'||module==='effects')?'none':''; }
    if(importBtn){ importBtn.textContent = module==='model' ? 'Add Textures' : 'Import Layer'; importBtn.style.display = (module==='sanity'||module==='buttons'||module==='log'||module==='casc'||module==='effects') ? 'none' : ''; }
    if(newBtn) newBtn.style.display = (module==='model' || module==='sanity' || module==='buttons' || module==='log' || module==='casc' || module==='effects') ? 'none' : '';
    if(saveBtn) saveBtn.style.display = (module==='sanity'||module==='buttons'||module==='log'||module==='casc'||module==='effects') ? 'none' : '';
    const showExports = module==='texture';
    if(exportGroup) exportGroup.style.display = showExports ? 'flex' : 'none';
    exportBtns.forEach(el=>el.style.display = showExports ? '' : 'none');
  }

  function setActive(module, opts={}){
    if(!titles[module]) module = 'texture';
    document.body.dataset.module = module;
    updateHeaderForModule(module);
    $$('.module-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.module === module));
    workspaceButtons().forEach(b => b.classList.toggle('active', b.dataset.module === module));
    const label = $('#activeModuleTitle');
    if(label) label.textContent = titles[module];
    const top = $('#activeModuleTitleTop');
    if(top) top.textContent = titles[module];
    if(!opts.silent && window.BLP_PAINT_APP?.setStatus){
      window.BLP_PAINT_APP.setStatus(`${titles[module]} workspace`);
    }
    window.WC3_LOG?.info?.('Workspace',`Switched to ${titles[module]}`,{module});
    if(module==='log'){ window.WC3_LOG?.importMain?.(); window.WC3_LOG?.render?.(); }
    window.BLP_PAINT_APP?.refreshUndoUi?.();
  }

  function clickPanel(tab){
    const btn = $(`#rightPanelTabs button[data-panel-tab="${tab}"]`);
    if(btn) btn.click();
  }

  function openModule(module){
    if(module === 'texture'){
      clickPanel('inspector');
      setActive('texture');
      return;
    }
    if(module === 'model'){
      clickPanel('model');
      setActive('model');
      return;
    }
    if(module === 'effects'){
      setActive('effects');
      window.WC3_EFFECTS_LAB?.prepare?.();
      return;
    }
    if(module === 'casc'){
      setActive('casc');
      window.WC3_MODEL_LAB_PRO?.prepareCascWorkspace?.();
      return;
    }
    if(module === 'sanity'){
      const bridge = $('#sanityCheckerBtn');
      if(bridge) bridge.click(); else clickPanel('sanity');
      setActive('sanity');
      return;
    }
    if(module === 'buttons'){
      clickPanel('inspector');
      setActive('buttons');
      const bridge = $('#warcraftButtonsBtn');
      if(bridge) bridge.click();
      return;
    }
    if(module === 'log'){
      setActive('log');
    }
  }

  $('#moduleNav')?.addEventListener('click', e => {
    const btn = e.target.closest('.module-nav-btn[data-module]');
    if(btn) openModule(btn.dataset.module);
  });

  $('#workspaceTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.workspace-tab[data-module]');
    if(btn) openModule(btn.dataset.module);
  });

  $('#rightPanelTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-panel-tab]');
    if(!btn) return;
    const map = {inspector:'texture', model:'model', sanity:'sanity'};
    if(map[btn.dataset.panelTab]) setActive(map[btn.dataset.panelTab], {silent:true});
  });

  document.addEventListener('keydown', e => {
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    const map = {'1':'texture','2':'model','3':'effects','4':'casc','5':'sanity','6':'buttons','7':'log'};
    const module = map[e.key];
    if(module){ e.preventDefault(); openModule(module); }
  });


  const creditsBtn = $('#creditsBtn');
  const creditsDialog = $('#creditsDialog');
  creditsBtn?.addEventListener('click', ()=> creditsDialog?.showModal());
  creditsDialog?.addEventListener('click', e => {
    if(e.target === creditsDialog) creditsDialog.close();
  });
  const startupModule = (()=>{
    try{
      const requested=new URLSearchParams(window.location.search).get('startup');
      return requested==='model'||requested==='texture'?requested:'texture';
    }catch(_){return 'texture';}
  })();
  window.WC3_WORKSPACE_UI = {openModule, setActive};
  if(startupModule==='model') openModule('model');
  else setActive('texture', {silent:true});

  // Claim any file that launched the app only after every workspace script has
  // registered its API. The first launch uses this pull/claim path so the file
  // cannot be lost before the renderer installs its event listener. Files opened
  // while the app is already running still arrive through onOpenFile.
  (async()=>{
    try{
      const state=await window.WC3_FILE_ASSOCIATIONS?.ready?.();
      const paths=Array.isArray(state?.paths)?state.paths.filter(Boolean):[];
      if(!paths.length)return;
      await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
      for(const filePath of paths){
        if(window.WC3_ASSOCIATED_FILES?.openPath) await window.WC3_ASSOCIATED_FILES.openPath(filePath);
        else window.WC3_LOG?.error?.('Windows Association','Associated-file opener is unavailable',{filePath});
      }
    }catch(error){
      window.WC3_LOG?.error?.('Windows Association','Could not claim startup associated files',error);
    }
  })();
})();
