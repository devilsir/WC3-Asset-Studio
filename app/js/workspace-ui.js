(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const workspaceButtons = () => $$('#workspaceTabs .workspace-tab');
  const titles = {
    texture: 'Texture Paint',
    model: 'Model Lab',
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
    if(openBtn){ openBtn.textContent = module==='model' ? 'Open Model' : module==='buttons' ? 'Open Source' : module==='sanity' ? 'Open Files' : 'Open'; openBtn.style.display=module==='log'?'none':''; }
    if(importBtn){ importBtn.textContent = module==='model' ? 'Add Textures' : 'Import Layer'; importBtn.style.display = (module==='sanity'||module==='buttons'||module==='log') ? 'none' : ''; }
    if(newBtn) newBtn.style.display = (module==='model' || module==='sanity' || module==='buttons' || module==='log') ? 'none' : '';
    if(saveBtn) saveBtn.style.display = (module==='sanity'||module==='buttons'||module==='log') ? 'none' : '';
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
    const map = {'1':'texture','2':'model','3':'sanity','4':'buttons','5':'log'};
    const module = map[e.key];
    if(module){ e.preventDefault(); openModule(module); }
  });


  const creditsBtn = $('#creditsBtn');
  const creditsDialog = $('#creditsDialog');
  creditsBtn?.addEventListener('click', ()=> creditsDialog?.showModal());
  creditsDialog?.addEventListener('click', e => {
    if(e.target === creditsDialog) creditsDialog.close();
  });
  setActive('texture', {silent:true});
  window.WC3_WORKSPACE_UI = {openModule, setActive};
})();
