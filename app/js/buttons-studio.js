(function(){
  'use strict';
  const app=window.BLP_PAINT_APP;
  if(!app||!app.iconTools)return;
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const state={raw:null,label:'Current Texture Paint',meta:'',kind:'texture',variant:'BTN',zoom:100,panX:0,panY:0,mounted:false};

  function cloneCanvas(source){
    const c=document.createElement('canvas'); c.width=Math.max(1,source.width||1); c.height=Math.max(1,source.height||1);
    c.getContext('2d',{willReadFrequently:true}).drawImage(source,0,0); return c;
  }
  function canvasFromImageData(imageData){
    const c=document.createElement('canvas'); c.width=imageData.width; c.height=imageData.height;
    c.getContext('2d',{willReadFrequently:true}).putImageData(imageData,0,0); return c;
  }
  function setSource(canvas,label,meta='',kind='custom'){
    state.raw=cloneCanvas(canvas); state.label=label||'Button source'; state.meta=meta||`${state.raw.width} × ${state.raw.height}`; state.kind=kind;
    state.zoom=100;state.panX=0;state.panY=0;syncControls();applyFraming();
  }
  function processedSource(){
    const src=state.raw||app.getCompositeCanvas();
    const out=document.createElement('canvas');out.width=512;out.height=512;
    const ctx=out.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,512,512);
    const base=Math.max(512/src.width,512/src.height),scale=base*(state.zoom/100),dw=src.width*scale,dh=src.height*scale;
    const freeX=Math.max(64,Math.abs(dw-512)*.5+128),freeY=Math.max(64,Math.abs(dh-512)*.5+128);
    const dx=(512-dw)/2+(state.panX/100)*freeX,dy=(512-dh)/2+(state.panY/100)*freeY;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(src,dx,dy,dw,dh);
    return out;
  }
  function drawSourceThumb(){
    const c=$('#buttonSourceThumb');if(!c)return;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#080c10';ctx.fillRect(0,0,c.width,c.height);
    const src=state.raw||app.getCompositeCanvas();if(src&&src.width){const s=Math.min(c.width/src.width,c.height/src.height),w=src.width*s,h=src.height*s;ctx.drawImage(src,(c.width-w)/2,(c.height-h)/2,w,h);}
    const name=$('#buttonSourceName'),meta=$('#buttonSourceMeta');if(name)name.textContent=state.label;if(meta)meta.textContent=state.meta||`${src.width} × ${src.height}`;
  }
  function applyFraming(){
    const p=processedSource();app.iconTools.setSourceCanvas(p,state.label);drawSourceThumb();renderPreviews();
  }
  function renderPreviews(){
    const tools=app.iconTools,size=tools.expectedIconSize(),variant=state.variant||'BTN';
    const preview=$('#buttonStudioPreview');if(preview){const icon=tools.makeIconCanvas(variant,size),ctx=preview.getContext('2d');ctx.clearRect(0,0,preview.width,preview.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(icon,0,0,preview.width,preview.height);}
    $$('#buttonVariantStrip [data-button-variant]').forEach(btn=>{const v=btn.dataset.buttonVariant,cv=btn.querySelector('canvas');if(!cv)return;const icon=tools.makeIconCanvas(v,size),x=cv.getContext('2d');x.clearRect(0,0,cv.width,cv.height);x.drawImage(icon,0,0,cv.width,cv.height);btn.classList.toggle('active',v===variant);});
    $$('#buttonVariantTabs [data-button-variant]').forEach(btn=>btn.classList.toggle('active',btn.dataset.buttonVariant===variant));
  }
  function syncControls(){
    const z=$('#buttonCropZoom'),x=$('#buttonCropX'),y=$('#buttonCropY');if(z)z.value=state.zoom;if(x)x.value=state.panX;if(y)y.value=state.panY;
    if($('#buttonCropZoomLabel'))$('#buttonCropZoomLabel').textContent=`${state.zoom}%`;if($('#buttonCropXLabel'))$('#buttonCropXLabel').textContent=String(state.panX);if($('#buttonCropYLabel'))$('#buttonCropYLabel').textContent=String(state.panY);
  }
  const DEFAULT_FRAME={normalStyle:'classic',passiveStyle:'classic',autocastStyle:'classic',frameColor:'#7f8995',autocastColor:'#f6c84d',artBleed:2,trimTransparent:true};
  function syncFrameControls(){
    const o=app.iconTools.getFrameOptions?.()||DEFAULT_FRAME;
    const set=(id,v)=>{const el=$(id);if(el)el.value=v;};
    set('#iconNormalFrameStyle',o.normalStyle);set('#iconPassiveFrameStyle',o.passiveStyle);set('#iconAutocastFrameStyle',o.autocastStyle);
    set('#iconFrameColor',o.frameColor);set('#iconFrameColorHex',String(o.frameColor||'').toUpperCase());set('#iconAutocastColor',o.autocastColor);set('#iconAutocastColorHex',String(o.autocastColor||'').toUpperCase());
    set('#iconArtBleed',o.artBleed);if($('#iconArtBleedLabel'))$('#iconArtBleedLabel').textContent=`${Number(o.artBleed).toFixed(Number(o.artBleed)%1?1:0)}%`;
    if($('#iconTrimTransparent'))$('#iconTrimTransparent').checked=!!o.trimTransparent;
  }
  function applyFrameOptions(partial){app.iconTools.setFrameOptions?.(partial);syncFrameControls();renderPreviews();}
  function validHex(v){return /^#[0-9a-f]{6}$/i.test(String(v||'').trim());}
  function bindFrameControls(){
    $('#iconNormalFrameStyle')?.addEventListener('change',e=>applyFrameOptions({normalStyle:e.target.value}));
    $('#iconPassiveFrameStyle')?.addEventListener('change',e=>applyFrameOptions({passiveStyle:e.target.value}));
    $('#iconAutocastFrameStyle')?.addEventListener('change',e=>applyFrameOptions({autocastStyle:e.target.value}));
    const colorPair=(pickerId,hexId,key)=>{
      $(pickerId)?.addEventListener('input',e=>applyFrameOptions({[key]:e.target.value}));
      $(hexId)?.addEventListener('change',e=>{const v=String(e.target.value||'').trim();if(validHex(v))applyFrameOptions({[key]:v});else syncFrameControls();});
      $(hexId)?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();}});
    };
    colorPair('#iconFrameColor','#iconFrameColorHex','frameColor');colorPair('#iconAutocastColor','#iconAutocastColorHex','autocastColor');
    $('#iconArtBleed')?.addEventListener('input',e=>applyFrameOptions({artBleed:+e.target.value}));
    $('#iconTrimTransparent')?.addEventListener('change',e=>applyFrameOptions({trimTransparent:e.target.checked}));
    $('#iconFrameResetBtn')?.addEventListener('click',()=>applyFrameOptions(DEFAULT_FRAME));
    syncFrameControls();
  }
  async function loadFile(file){
    if(!file)return;app.showBusy('Loading button source…');
    try{const d=await app.decodeFileToImageData(file);setSource(canvasFromImageData(d.imageData),file.name,`${d.width||d.imageData.width} × ${d.height||d.imageData.height} · ${d.meta?.encoding||'image'}`,'file');app.setStatus(`Button source: ${file.name}`);}catch(e){console.error(e);alert('Could not use this file as a button source.\n\n'+e.message);}finally{app.hideBusy();}
  }
  function useTexturePaint(){const src=app.getCompositeCanvas();setSource(src,app.getCurrentName?.()||'Texture Paint',`${src.width} × ${src.height} · current Texture Paint document`,'texture');app.setStatus('Button source: current Texture Paint document');}
  function useModelTexture(){const src=window.MODEL_LAB_API?.getSelectedTextureCanvas?.();if(!src){alert('No resolved Model Lab texture is selected yet. Open a model, load its texture, and select that texture first.');return;}const name=window.MODEL_LAB_API?.getSelectedTextureName?.()||'Model texture';setSource(src,name,`${src.width} × ${src.height} · selected Model Lab texture`,'model-texture');app.setStatus(`Button source: ${name}`);}
  function chooseVariant(v){if(!app.iconTools.variants.includes(v))return;state.variant=v;const sel=$('#iconVariant');if(sel){sel.value=v;sel.dispatchEvent(new Event('change',{bubbles:true}));}renderPreviews();}
  function openPhotoMode(){
    if(!window.MODEL_LAB_API){alert('Model Lab is not ready.');return;}
    window.WC3_WORKSPACE_UI?.openModule('model');
    requestAnimationFrame(()=>{window.MODEL_LAB_API.setPhotoMode?.(true);if(!window.MODEL_LAB_API.getModel?.())app.setStatus('Photo Mode · open a model, frame it, then use the camera as a button');else app.setStatus('Photo Mode · frame the model and click “Use camera as button”');});
  }
  function acceptPhotoCanvas(canvas,label='Model Lab camera take'){setSource(canvas,label,`${canvas.width} × ${canvas.height} · Model Lab Photo Mode`,'photo');app.setStatus('Button source captured from Model Lab camera');}

  function mount(){
    if(state.mounted)return;state.mounted=true;
    const host=$('#buttonsExportHost'),panel=$('#iconPanel');if(host&&panel)host.appendChild(panel);
    const profile=$('#buttonStudioProfile'),wc=$('#wcProfile');if(profile&&wc){profile.value=wc.value;profile.addEventListener('change',()=>{wc.value=profile.value;wc.dispatchEvent(new Event('change',{bubbles:true}));renderPreviews();});wc.addEventListener('change',()=>{profile.value=wc.value;renderPreviews();});}
    bindFrameControls();
    $('#buttonImportSourceBtn')?.addEventListener('click',()=>$('#buttonSourceInput')?.click());$('#buttonSourceDropZone')?.addEventListener('click',()=>$('#buttonSourceInput')?.click());
    $('#buttonSourceInput')?.addEventListener('change',e=>{loadFile(e.target.files?.[0]);e.target.value='';});
    $('#buttonUseTextureBtn')?.addEventListener('click',useTexturePaint);$('#buttonUseModelTextureBtn')?.addEventListener('click',useModelTexture);$('#buttonOpenPhotoModeBtn')?.addEventListener('click',openPhotoMode);
    const dz=$('#buttonSourceDropZone');if(dz){['dragenter','dragover'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.add('dragging');}));['dragleave','drop'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.remove('dragging');}));dz.addEventListener('drop',e=>loadFile(e.dataTransfer?.files?.[0]));}
    $('#buttonVariantTabs')?.addEventListener('click',e=>{const b=e.target.closest('[data-button-variant]');if(b)chooseVariant(b.dataset.buttonVariant);});
    $('#buttonVariantStrip')?.addEventListener('click',e=>{const b=e.target.closest('[data-button-variant]');if(b)chooseVariant(b.dataset.buttonVariant);});
    const range=(id,key,label,fmt=v=>String(v))=>{$('#'+id)?.addEventListener('input',e=>{state[key]=+e.target.value;const o=$('#'+label);if(o)o.textContent=fmt(state[key]);applyFraming();});};
    range('buttonCropZoom','zoom','buttonCropZoomLabel',v=>`${v}%`);range('buttonCropX','panX','buttonCropXLabel');range('buttonCropY','panY','buttonCropYLabel');
    $('#buttonCropResetBtn')?.addEventListener('click',()=>{state.zoom=100;state.panX=0;state.panY=0;syncControls();applyFraming();});
    $('#iconVariant')?.addEventListener('change',e=>{state.variant=e.target.value;renderPreviews();});
    $('#iconOutputFormat')?.addEventListener('change',renderPreviews);$('#iconBaseName')?.addEventListener('input',renderPreviews);
    $$('.icon-set-check').forEach(x=>x.addEventListener('change',renderPreviews));
    window.addEventListener('wc3-editor-change',()=>{if(!state.raw||state.kind==='texture')useTexturePaint();});
    if(!state.raw)useTexturePaint();else applyFraming();
  }
  function activate(){mount();syncFrameControls();renderPreviews();drawSourceThumb();}

  window.WC3_BUTTON_STUDIO={activate,acceptPhotoCanvas,useTexturePaint,useModelTexture,openPhotoMode,renderPreviews,getState:()=>state};
  mount();
})();
