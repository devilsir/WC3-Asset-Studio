'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const required = [
  'main.js',
  'preload.js',
  'package.json',
  'app/index.html',
  'app/js/app.js',
  'app/js/editor.js',
  'app/js/model-lab.js',
  'app/js/model-lab-pro.js',
  'app/js/model-lab-autotest.js',
  'app/js/model-save.js',
  'app/js/model-animation-save.js',
  'app/js/war3-model-core.js',
  'app/js/model-lab-geometry.js',
  'app/js/effects-lab-core.js',
  'app/js/effects-lab.js',
  'app/js/effects-lab-autotest.js',
  'app/css/effects-lab.css',
  'app/js/buttons-studio.js',
  'app/js/sanity.js',
  'app/css/app.css',
  'app/css/model-lab.css',
  'app/THIRD_PARTY_LICENSES.md',
  'assets/icon.ico',
  'assets/file-model.ico',
  'assets/file-texture.ico',
  'tools/casc-reader.ps1',
  'tools/casc-cdn-reader.js',
  'tools/effects-lab/effects-runtime.exe',
  'tools/effects-lab/effect-designer/Effect Designer.exe',
  'tools/effects-lab/cfxlib/stdlib/prelude.cfx'
];

const missing = required.filter(rel => !fs.existsSync(path.join(root, rel)));
if (missing.length) {
  console.error('Build verification failed. Missing required files:');
  for (const rel of missing) console.error(`  - ${rel}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== '1.4.0') {
  console.error(`Build verification failed. package.json version is ${pkg.version}, expected 1.4.0.`);
  process.exit(1);
}

const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
if (!main.includes("const PRODUCT = 'WC3 Asset Studio v1.4'")) {
  console.error('Build verification failed. main.js product version is not v1.4.');
  process.exit(1);
}

if (!main.includes('function sessionLogStamp(') || !main.includes('`session-${sessionLogStamp()}.log`') || main.includes("path.join(portableData, 'Logs', 'runtime.log')")) {
  console.error('Build verification failed. runtime logs are not isolated per application session.');
  process.exit(1);
}


const editor = fs.readFileSync(path.join(root, 'app/js/editor.js'), 'utf8');
const modelLab = fs.readFileSync(path.join(root, 'app/js/model-lab.js'), 'utf8');
const modelCore = fs.readFileSync(path.join(root, 'app/js/war3-model-core.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app/js/app.js'), 'utf8');
const modelHtml = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
const workspaceUi = fs.readFileSync(path.join(root, 'app/js/workspace-ui.js'), 'utf8');
const effectsCore = fs.readFileSync(path.join(root, 'app/js/effects-lab-core.js'), 'utf8');
const effectsLab = fs.readFileSync(path.join(root, 'app/js/effects-lab.js'), 'utf8');
const effectsAutoTest = fs.readFileSync(path.join(root, 'app/js/effects-lab-autotest.js'), 'utf8');
const effectsCss = fs.readFileSync(path.join(root, 'app/css/effects-lab.css'), 'utf8');
const installerPath = path.resolve(root, '..', 'WC3_Asset_Studio_v1.4.iss');
if (!editor.includes('this.maxHistory = 75;') || !modelLab.includes('maxModelHistory: 75,')) {
  console.error('Build verification failed. Undo/Redo history is not configured for 75 states.');
  process.exit(1);
}
if (!main.includes('wc3-file:read-associated') || !preload.includes('WC3_FILE_ASSOCIATIONS')) {
  console.error('Build verification failed. Windows file-association handoff is incomplete.');
  process.exit(1);
}
const unsavedGuardChecks = {
  mainClose: main.includes("mainWindow.on('close'") && main.includes('Close without saving') && main.includes('unsavedRendererState.dirty'),
  nativeOpenConfirm: main.includes("wc3-unsaved:confirm-discard") && preload.includes('confirmDiscard:') && appJs.includes('confirmDiscardUnsavedNative'),
  dirtyBridge: main.includes("wc3-unsaved:set-state") && preload.includes('setState:') && appJs.includes('markUnsaved(scope'),
  completedSave: main.includes("wc3-download:result") && preload.includes('onDownloadResult:') && appJs.includes('registerPendingSave') && modelLab.includes("downloadModelBlob(blob,name,saveScopes=[]"),
  modelOpenGuard: modelLab.includes("await guardModelReplacement('open another model'") && modelLab.includes("await guardModelReplacement('open another model package'"),
  modelMutation: modelLab.includes("markModelUnsaved('model'") && modelLab.includes("markModelUnsaved('modelTextures'")
};
if (!Object.values(unsavedGuardChecks).every(Boolean)) {
  console.error('Build verification failed. Unsaved-change guard / completed-save tracking is incomplete.');
  for (const [name, ok] of Object.entries(unsavedGuardChecks)) console.error(`  ${name}: ${ok ? 'OK' : 'MISSING'}`);
  process.exit(1);
}
if (!main.includes("wc3-unsaved:set-state") || !main.includes("Close without saving") || !main.includes("mainWindow.on('close'") || !preload.includes('WC3_UNSAVED') || !appJs.includes('confirmDiscardUnsaved') || !modelLab.includes('guardModelReplacement')) {
  console.error('Build verification failed. Unsaved-change close/model-replacement guard is incomplete.');
  process.exit(1);
}
const readinessChecks = {
  main: /ipcMain\.handle\(\s*['"]wc3-file:renderer-ready['"]/.test(main),
  claim: /pendingAssociatedPaths\.splice\(0\)/.test(main) && /return \{ok:true,pending:paths\.length,paths\}/.test(main),
  preload: /ready\s*:\s*\(\s*\)\s*=>\s*ipcRenderer\.invoke\(\s*['"]wc3-file:renderer-ready['"]/.test(preload),
  workspace: /state\?\.paths/.test(workspaceUi) && /WC3_ASSOCIATED_FILES\?\.openPath/.test(workspaceUi),
  opener: /window\.WC3_ASSOCIATED_FILES=Object\.freeze/.test(appJs) && /enqueueWindowsAssociatedPath/.test(appJs)
};
if (!Object.values(readinessChecks).every(Boolean)) {
  console.error('Build verification failed. Deterministic associated-file startup handoff is incomplete.');
  for (const [name, ok] of Object.entries(readinessChecks)) console.error(`  ${name}: ${ok ? 'OK' : 'MISSING'}`);
  process.exit(1);
}
if (!main.includes('startup=${encodeURIComponent(startupModule)}') || !appJs.includes("routeAssociatedWorkspace('model')") || !appJs.includes("routeAssociatedWorkspace('texture')")) {
  console.error('Build verification failed. Associated files are not routed directly to Model Lab / Texture Paint.');
  process.exit(1);
}
if (!fs.existsSync(installerPath) || !fs.readFileSync(installerPath, 'utf8').includes('Software\\RegisteredApplications')) {
  console.error('Build verification failed. Inno Setup file-association registration is missing.');
  process.exit(1);
}
const installerText = fs.readFileSync(installerPath, 'utf8');
const extraResources = Array.isArray(pkg.build?.extraResources) ? pkg.build.extraResources : [];
const packagedModelIcon = extraResources.some(x => x?.from === 'assets/file-model.ico' && x?.to === 'file-icons/model.ico');
const packagedTextureIcon = extraResources.some(x => x?.from === 'assets/file-texture.ico' && x?.to === 'file-icons/texture.ico');
if (!packagedModelIcon || !packagedTextureIcon || !main.includes('associationIconPath(ext)') || !installerText.includes('resources\\file-icons\\model.ico') || !installerText.includes('resources\\file-icons\\texture.ico')) {
  console.error('Build verification failed. Separate model/texture Windows file icons are not fully packaged or registered.');
  process.exit(1);
}


const cascCdn = fs.readFileSync(path.join(root, 'tools/casc-cdn-reader.js'), 'utf8');
const packagedCdnHelper = extraResources.some(x => x?.from === 'tools/casc-cdn-reader.js' && x?.to === 'tools/casc-cdn-reader.js');
if (!packagedCdnHelper || !main.includes('runCascCdnProcess(') || !main.includes("backend:'cdn'") || !main.includes('probeCascCdn(')) {
  console.error('Build verification failed. Blizzard CASC CDN fallback is not fully wired or packaged.');
  process.exit(1);
}
if (!main.includes('Native setup crash escaped normal recovery; forcing Blizzard CDN backend') || !main.includes('nativeCrashRememberedForBuild') || !main.includes('Safe path first: use Blizzard')) {
  console.error('Build verification failed. CASC safe-backend / hard-crash guard is missing.');
  process.exit(1);
}
if (!main.includes('installPath: normalizeWarcraftRoot(extra.installPath') || !main.includes("...(extra && typeof extra==='object' ? extra : {})")) {
  console.error('Build verification failed. CASC helper payload forwarding is incomplete.');
  process.exit(1);
}
if (!main.includes("status.backend === 'cdn'") || !main.includes("status.nativeReady === false") || !main.includes("Direct asset read") || !main.includes("nativeAttempted") || !main.includes('detectWarcraftRoot(')) {
  console.error('Build verification failed. CASC direct-CDN routing / local install auto-detection is incomplete.');
  process.exit(1);
}
if (!cascCdn.includes("const PRODUCT = 'w3';") || !cascCdn.includes('decodeBlte(') || !cascCdn.includes('parseWar3Root(') || !cascCdn.includes('Range:`bytes=${loc.offset}-${loc.offset+loc.size-1}`') || !cascCdn.includes('readLocalBuildInfo(') || !cascCdn.includes('localConfigPath(') || !cascCdn.includes('sourceBuild')) {
  console.error('Build verification failed. CASC TACT reader / local-build bootstrap is incomplete.');
  process.exit(1);
}
if (!cascCdn.includes('async locatePlans(plans)') || !cascCdn.includes('archive-group lookup wanted=') || !cascCdn.includes("pushCandidate('fixed16'") || !cascCdn.includes("pushCandidate('dynamic'") || !cascCdn.includes("pushCandidate('compact'") || !cascCdn.includes('parseGroupIndex(') || !cascCdn.includes('offsetBytes !== 5') || !cascCdn.includes('candidateHosts()') || !cascCdn.includes('dataCandidates(') || !cascCdn.includes('index batch plans=') || !cascCdn.includes('location map build targets=') || !cascCdn.includes('location map saved entries=') || !cascCdn.includes('stale location invalidated') || !cascCdn.includes('archive location retry plans=') || !cascCdn.includes('unresolved.length>=6&&!this.locationMapComplete&&!this.archiveGroup') || !cascCdn.includes('readCachedAsset(eKey)') || !cascCdn.includes('modelBrowseRank')) {
  console.error('Build verification failed. CASC archive-group / batched fallback optimization is missing.');
  process.exit(1);
}
try {
  const os = require('os');
  const { W3Cdn, modelCategoryMatches, normalizeArtSet, logicalVirtualPath, artSetPreference, parseGroupIndex, parseIndexFooter } = require(path.join(root, 'tools/casc-cdn-reader.js'));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3as-casc-locmap-'));
  try {
    const cdnHash='1'.repeat(32),archives=['2'.repeat(32),'3'.repeat(32)],eKey='4'.repeat(32);
    const writer=new W3Cdn('us',temp);writer.cdnHash=cdnHash;writer.archives=archives;writer.locationCache.set(eKey,{archiveHash:archives[1],offset:123456,size:7890});writer.saveLocationMap();
    const reader=new W3Cdn('us',temp);reader.cdnHash=cdnHash;reader.archives=archives;
    if(!reader.loadLocationMap()||!reader.locationMapComplete||reader.locationCache.get(eKey)?.archiveHash!==archives[1]||reader.locationCache.get(eKey)?.offset!==123456||reader.locationCache.get(eKey)?.size!==7890)throw new Error('location-map round-trip mismatch');

    // Exercise both TACT footer families seen in Blizzard tooling:
    // dynamic checksum-sized TOC hashes (TACT.Net) and fixed 16-byte TOC
    // hashes with a variable footer hash (CascLib). Also verify legacy BE
    // ElementCount so a live archive-group cannot silently fall back to 191
    // individual archive indices.
    const buildGroupFixture=({layout='dynamic',hashBytes=8,countEndian='le',offsetBytes=6}={})=>{
      const page=4096,entrySize=16+4+offsetBytes,perPage=Math.floor(page/entrySize),entryCount=perPage+3,pageCount=Math.ceil(entryCount/perPage),footerSize=layout==='fixed16'?28+hashBytes:layout==='compact'?12+hashBytes*2:12+hashBytes*3,tocBytes=pageCount*16,pageHashBytes=(layout==='compact'?pageCount:Math.max(0,pageCount-1))*hashBytes,total=page*pageCount+tocBytes+pageHashBytes+footerSize,group=Buffer.alloc(total),footerAt=total-footerSize,meta=layout==='fixed16'?footerAt+16:layout==='compact'?footerAt+hashBytes:footerAt+hashBytes*2,targetIndex=perPage+1,targetKey=(BigInt(targetIndex+1)<<120n).toString(16).padStart(32,'0').slice(-32),targetPos=page+(targetIndex-perPage)*entrySize,archiveIndexBytes=offsetBytes-4;
      for(let i=0;i<entryCount;i++){const pos=Math.floor(i/perPage)*page+(i%perPage)*entrySize,keyHex=(BigInt(i+1)<<120n).toString(16).padStart(32,'0').slice(-32);Buffer.from(keyHex,'hex').copy(group,pos);group.writeUInt32BE(100+i,pos+16);group.writeUIntBE(0,pos+20,archiveIndexBytes);group.writeUInt32BE(1000+i,pos+20+archiveIndexBytes);}
      group.writeUInt32BE(7890,targetPos+16);group.writeUIntBE(1,targetPos+20,archiveIndexBytes);group.writeUInt32BE(123456,targetPos+20+archiveIndexBytes);
      group[meta]=1;group[meta+1]=0;group[meta+2]=0;group[meta+3]=4;group[meta+4]=offsetBytes;group[meta+5]=4;group[meta+6]=16;group[meta+7]=hashBytes;
      if(countEndian==='be')group.writeUInt32BE(entryCount,meta+8);else group.writeUInt32LE(entryCount,meta+8);
      return{group,entryCount,targetKey,footerSize,layout,hashBytes,countEndian,offsetBytes};
    };
    for(const opts of [{layout:'dynamic',hashBytes:8,countEndian:'le',offsetBytes:6},{layout:'dynamic',hashBytes:8,countEndian:'be',offsetBytes:6},{layout:'fixed16',hashBytes:16,countEndian:'be',offsetBytes:6},{layout:'compact',hashBytes:8,countEndian:'le',offsetBytes:5}]){
      const fx=buildGroupFixture(opts),parsedFooter=parseIndexFooter(fx.group);
      if(!parsedFooter||parsedFooter.entryCount!==fx.entryCount||parsedFooter.offsetBytes!==fx.offsetBytes||(fx.layout!=='compact'&&parsedFooter.footerSize!==fx.footerSize)||(fx.hashBytes!==8&&parsedFooter.layout!==fx.layout)||parsedFooter.countEndian!==fx.countEndian)throw new Error(`archive-group footer mismatch ${JSON.stringify(opts)} -> ${JSON.stringify(parsedFooter)}`);
      const found=new Map(),wanted=new Set([fx.targetKey]);
      if(!parseGroupIndex(fx.group,archives,wanted,found)||found.get(fx.targetKey)?.archiveHash!==archives[1]||found.get(fx.targetKey)?.offset!==123456||found.get(fx.targetKey)?.size!==7890)throw new Error(`archive-group parser mismatch ${JSON.stringify(opts)}`);
    }
    const hostProbe=new W3Cdn('us',temp);hostProbe.host='level3.blizzard.com';hostProbe.hosts=['level3.blizzard.com','us.cdn.blizzard.com'];hostProbe.cdnPath='tpr/war3';
    const candidateUrls=hostProbe.dataCandidates('a'.repeat(32),false);
    if(!candidateUrls.some(x=>x.includes('us.cdn.blizzard.com'))||!candidateUrls.some(x=>x.includes('level3.ssl.blizzard.com')))throw new Error('CDN alternate-host fallback candidates missing');

    const categoryCases=[
      ['model-units','units\\human\\footman\\footman.mdx'],
      ['heroes','units\\human\\heroarchmage\\heroarchmage.mdx'],
      ['buildings','buildings\\human\\farm\\farm.mdx'],
      ['doodads','doodads\\ashenvale\\props\\banner.mdx'],
      ['effects','abilities\\spells\\human\\thunderclap\\thunderclapcaster.mdx'],
      ['projectiles','abilities\\weapons\\arrow\\arrowmissile.mdx'],
      ['items','objects\\inventoryitems\\potiongreen\\potiongreen.mdx'],
      ['environment','environment\\sky\\sky.mdx'],
      ['portraits','units\\human\\heroarchmage\\heroarchmage_portrait.mdx']
    ];
    for(const [mode,asset] of categoryCases)if(!modelCategoryMatches(mode,asset))throw new Error(`model category mismatch: ${mode} -> ${asset}`);
    if(modelCategoryMatches('model-units',categoryCases[1][1])||modelCategoryMatches('heroes',categoryCases[0][1])||modelCategoryMatches('heroes',categoryCases[8][1]))throw new Error('model category exclusivity mismatch');
    const categoryReader=new W3Cdn('us',temp);categoryReader.root=new Map(categoryCases.map(([,asset])=>[asset,{}]));
    for(const [mode,asset] of categoryCases){const pageResult=categoryReader.searchPaths('',mode,50,0);if(pageResult.total!==1||pageResult.results[0]!==asset)throw new Error(`searchPaths category filter mismatch: ${mode}`);}

    // Art-set search must collapse namespace duplicates and choose the requested
    // SD / HD / DE variant instead of mixing root overlays in one gallery.
    const logical='units\\human\\footman\\footman.mdx';
    const artRows=[
      `war3.w3mod:${logical}`,
      `war3sd.w3mod:${logical}`,
      `war3.w3mod:_hd.w3mod:${logical}`,
      `war3.w3mod:_de.w3mod:${logical}`,
      `war3.w3mod:_fr.w3mod:${logical}`
    ];
    const artReader=new W3Cdn('us',temp);artReader.root=new Map(artRows.map(asset=>[asset,{}]));
    const expectedArt={sd:'war3sd.w3mod:',hd:'war3.w3mod:_hd.w3mod:',de:'war3.w3mod:_de.w3mod:'};
    for(const [artSet,prefix] of Object.entries(expectedArt)){
      const pageResult=artReader.searchPaths('', 'models', 20, 0, artSet);
      if(pageResult.artSet!==artSet||pageResult.total!==1||pageResult.results.length!==1||!pageResult.results[0].toLowerCase().startsWith(prefix))throw new Error(`searchPaths art-set routing mismatch: ${artSet} -> ${JSON.stringify(pageResult)}`);
    }
    if(normalizeArtSet('AUTO-HD')!=='hd'||normalizeArtSet('classic')!=='sd'||logicalVirtualPath(artRows[2])!==logical||artSetPreference(artRows[2],'hd')!==0||artSetPreference(artRows[4],'hd')<1000)throw new Error('CASC art-set helper normalization / overlay exclusion mismatch');
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
} catch (e) {
  console.error(`Build verification failed. CASC optimized index/cache round-trip failed: ${e.message||e}`);
  process.exit(1);
}

const cascReader = fs.readFileSync(path.join(root, 'tools/casc-reader.ps1'), 'utf8');
if (!main.includes('probeCascStorage(') || !main.includes('0xC0000409') || !main.includes('runCascReaderResilient(') || !main.includes('probeOnly=false, extra={}')) {
  console.error('Build verification failed. CASC native-crash recovery / isolated reader arguments are missing.');
  process.exit(1);
}
if (!main.includes('`${root}*w3`') || !main.includes('`${root}*w3t`')) {
  console.error('Build verification failed. CASC documented *product storage candidates are missing.');
  process.exit(1);
}
if (!main.includes('/^war3mapimported[\\\\/]/i.test(cleaned)') || !modelLab.includes('isLikelyWarcraftStockTextureRef')) {
  console.error('Build verification failed. CASC stock-texture filtering is missing.');
  process.exit(1);
}
if (!cascReader.includes('$storageParam = [string]$payload.storageParam') || !cascReader.includes('CASC_STAGE') || !cascReader.includes('open exactly one storage parameter')) {
  console.error('Build verification failed. CASC helper isolation / stage diagnostics are missing.');
  process.exit(1);
}


if (!modelLab.includes("kind:'texture'") || !modelLab.includes('searchCascTextureCandidates') || !modelLab.includes('CASC texture index search completed') || !modelLab.includes('requestedPath:item.ref') || !modelLab.includes("reason:'effects-tab'") || !modelHtml.includes('Search CASC')) {
  console.error('Build verification failed. On-demand Warcraft texture / CASC index fallback / Effects asset access is incomplete.');
  process.exit(1);
}
if (!main.includes("kind === 'texture' || kind === 'effect-texture'") || !main.includes("rel0.replace(/\\.dds$/i, '.blp')") || !main.includes("rel0.replace(/\\.tga$/i, '.dds')")) {
  console.error('Build verification failed. CASC texture-format aliases are incomplete.');
  process.exit(1);
}

if (!main.includes("kind === 'model' || kind === 'effect-model' || kind === 'reference-model' || kind === 'unit-model'")) {
  console.error('Build verification failed. Warcraft Library model requests are blocked by the CASC request filter.');
  process.exit(1);
}

const modelPro = fs.readFileSync(path.join(root, 'app/js/model-lab-pro.js'), 'utf8');
const modelAutoTest = fs.readFileSync(path.join(root, 'app/js/model-lab-autotest.js'), 'utf8');
if (!modelPro.includes('Timeline / Keyframes') || !modelPro.includes('Rig Editor') || !modelPro.includes('Material / PBR Editor') || !modelPro.includes('Scene Outliner') || !modelPro.includes('Warcraft Library / Object Editor')) {
  console.error('Build verification failed. v1.4 workflow suite is incomplete.');
  process.exit(1);
}
if (!modelPro.includes('Model Beside Target / Copy Source') || !modelPro.includes('proAssetPreviewCanvas') || !modelPro.includes('proAssetPreviewGlCanvas') || !modelPro.includes('proAssetPreviewStage') || !modelPro.includes('proAssetReference') || !modelPro.includes('proReferenceCopySelected') || !modelPro.includes('proQuickUnits') || !modelPro.includes('proQuickEffects') || !modelPro.includes('proQuickModels') || !modelPro.includes('proQuickTextures') || !modelPro.includes('Units / Creatures') || !modelLab.includes('setReferenceModel') || !modelLab.includes('copyReferenceGeoset') || !modelLab.includes('copyReferenceObject') || !modelLab.includes('addEffectAttachmentFromPath') || !modelLab.includes('drawReferenceModelOverlay')) {
  console.error('Build verification failed. Object Editor-style reference model / Warcraft asset preview / partial-copy workflow is incomplete.');
  process.exit(1);
}
if (!modelLab.includes('prepareReferenceModelRuntime') || !modelLab.includes('drawRuntimeAssetPreview') || !modelLab.includes('Full CASC reference runtime ready') || !modelLab.includes('runtime:options.runtime||null') || !modelLab.includes('state.referenceModel?.runtime?.trackCount') || !modelPro.includes('assetPreviewRuntime') || !modelPro.includes('FULL CASC RUNTIME') || !modelPro.includes('REFERENCE ONLY')) {
  console.error('Build verification failed. Full textured/animated Warcraft reference runtime is incomplete.');
  process.exit(1);
}
if (!modelLab.includes('renderGlReferenceModel') || !modelLab.includes('referenceLayerPolicy') || !modelLab.includes('referenceLayerStackPolicy') || !modelLab.includes('gl.depthFunc(gl.LEQUAL)') || !modelLab.includes('gl.depthFunc(gl.LESS)') || !modelLab.includes('missingExpectedTextures') || !modelLab.includes('GPU depth-buffer reference renderer active') || !modelLab.includes('gpuDepthRendered') || !modelLab.includes('gpuLayerStats') || !modelLab.includes('meshes:!gpuDepth') || !modelPro.includes('runtime:pro.assetPreviewRuntime,opacity:1')) {
  console.error('Build verification failed. Reference model WebGL depth-buffer / coplanar-material-layer rendering is incomplete.');
  process.exit(1);
}
if (!modelPro.includes('assetSearchSeq') || !modelPro.includes('requestId!==pro.assetSearchSeq') || !modelPro.includes("?'model':'texture'")) {
  console.error('Build verification failed. Warcraft Library stale-search protection / model read routing is incomplete.');
  process.exit(1);
}
if (!cascCdn.includes("mode==='units'||mode==='unit'")) {
  console.error('Build verification failed. Warcraft unit/creature model search mode is missing.');
  process.exit(1);
}
if (!modelLab.includes('renderRuntimeAssetPreviewGl') || !modelLab.includes('GPU depth-buffer preview renderer active') || !modelLab.includes('runtime.previewGpuDepthRendered=true') || !modelLab.includes('gl.depthFunc(gl.LEQUAL)') || !modelPro.includes("previewCanvas('gl')") || !modelPro.includes("setAssetPreviewMode('model')")) {
  console.error('Build verification failed. Unit / Effect Viewer GPU depth preview pipeline is incomplete.');
  process.exit(1);
}
if (!modelLab.includes('hdMaterialInfo') || !modelLab.includes('hdMaterialSample') || !modelLab.includes('u_normalTex') || !modelLab.includes('u_ormTex') || !modelLab.includes('u_emissiveTex') || !modelLab.includes('u_teamTex') || !modelLab.includes('teamMask=clamp(orm.a') || !modelLab.includes('hdMaterials:0') || !modelLab.includes('pbrTexturesBound:0')) {
  console.error('Build verification failed. Reforged HD / DE combined-material preview shading is incomplete.');
  process.exit(1);
}
if (!modelLab.includes('modelPrimaryLod') || !modelLab.includes('modelRenderableGeosetEntries') || !modelLab.includes('renderableModelBounds') || !modelLab.includes('alternate LOD meshes as extra geosets') || !modelLab.includes('lod:modelLodSummary(model)')) {
  console.error('Build verification failed. Reforged HD / DE primary-LOD filtering is incomplete.');
  process.exit(1);
}
if (!modelCore.includes('shaderTypeId') || !modelCore.includes('isHdCombined') || !modelCore.includes("formatVersion>=1100") || !modelCore.includes("formatVersion>=1000") || !modelCore.includes("formatVersion>=900")) {
  console.error('Build verification failed. Reforged v900/v1000/v1100+ material parsing/version gates are incomplete.');
  process.exit(1);
}
if (!modelCore.includes('function readSkinChunk(') || !modelCore.includes('formatVersion>=1800') || !modelCore.includes('view.getUint16(start+i*2,true)') || !modelCore.includes('skinElementBytes') || !modelLab.includes('dontRotation=!!(flags&0x2),dontScaling=!!(flags&0x4)')) {
  console.error('Build verification failed. MDX1800 uint16 SKIN / node inheritance compatibility is incomplete.');
  process.exit(1);
}
try {
  const ctx={window:{},TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView,console};
  vm.createContext(ctx);vm.runInContext(modelCore,ctx);
  const readSkin=ctx.window.WAR3_MODEL_CORE?.helpers?.readSkinChunk;
  if(typeof readSkin!=='function')throw new Error('readSkinChunk helper unavailable');
  const values=[1,2,3,4,64,64,64,63],modern=new Uint8Array(8+values.length*2+8),mv=new DataView(modern.buffer);
  modern.set(Buffer.from('SKIN'),0);mv.setUint32(4,values.length,true);values.forEach((v,k)=>mv.setUint16(8+k*2,v,true));modern.set(Buffer.from('UVAS'),8+values.length*2);mv.setUint32(12+values.length*2,0,true);
  const a=readSkin(modern,0,modern.length,1800);
  if(a?.elementBytes!==2||!a?.uvAligned||JSON.stringify(a.skin)!==JSON.stringify(values))throw new Error('MDX1800 uint16 SKIN fixture failed');
  const legacy=new Uint8Array(8+values.length+8),lv=new DataView(legacy.buffer);legacy.set(Buffer.from('SKIN'),0);lv.setUint32(4,values.length,true);values.forEach((v,k)=>legacy[8+k]=v);legacy.set(Buffer.from('UVAS'),8+values.length);lv.setUint32(12+values.length,0,true);
  const b=readSkin(legacy,0,legacy.length,1200);if(b?.elementBytes!==1||!b?.uvAligned)throw new Error('Legacy byte SKIN fixture regressed');
  const mdl=`Version { FormatVersion 800, }\nModel "VerifyMDL" { NumGeosets 1, MinimumExtent { 0, 0, 0 }, MaximumExtent { 1, 1, 1 }, BoundsRadius 2, }\nSequences 1 { Anim "Stand" { Interval { 0, 100 }, } }\nTextures 1 { Bitmap { Image "", ReplaceableId 1, } }\nMaterials 1 { Material { Layer { FilterMode None, static TextureID 0, } } }\nGeoset { Vertices 3 { { 0, 0, 0 }, { 1, 0, 0 }, { 0, 1, 0 }, } Normals 3 { { 0,0,1 }, { 0,0,1 }, { 0,0,1 }, } TVertices 3 { {0,0}, {1,0}, {0,1}, } VertexGroup { 0,0,0 }, Faces 1 3 { Triangles { {0,1,2}, } } Groups 1 1 { Matrices { 0 }, } MaterialID 0, }\nBone "Root" { ObjectId 0, GeosetId 0, GeosetAnimId None, }\nParticleEmitter2 "Fx" { ObjectId 1, Parent 0, static Speed 1, static Variation 0, static Latitude 0, static Gravity 0, LifeSpan 1, static EmissionRate 1, static Width 1, static Length 1, Blend, Rows 1, Columns 1, Head, TailLength 0, Time .5, TextureID 0, PriorityPlane 0, ReplaceableId 0, }\nPivotPoints 2 { {0,0,0}, {0,0,0}, }`;
  const mdlParsed=ctx.window.WAR3_MODEL_CORE.parseMDL(mdl);
  if(mdlParsed?.particleEmitters2?.length!==1||mdlParsed?.bones?.length!==1||mdlParsed?.nodes?.length!==2)throw new Error('MDL typed node arrays are incomplete');
} catch (error) {
  console.error('Build verification failed. MDX1800 SKIN fixture:',error?.message||error);
  process.exit(1);
}
const advancedModelSave = fs.readFileSync(path.join(root, 'app/js/model-save.js'), 'utf8');
if (!advancedModelSave.includes('geo.skinElementBytes===2||formatVersion>=1800') || !advancedModelSave.includes('v.setUint16(8+k*2') || !advancedModelSave.includes('view.setUint16(start+k*2')) {
  console.error('Build verification failed. MDX1800 uint16 SKIN save/patch preservation is incomplete.');
  process.exit(1);
}
const effectsUiStart=modelHtml.indexOf('id="effectsLabPanels"'), effectsUiEnd=modelHtml.indexOf('id="sanityPanels"',effectsUiStart);
const effectsUiMarkup=effectsUiStart>=0?modelHtml.slice(effectsUiStart,effectsUiEnd>effectsUiStart?effectsUiEnd:undefined):'';
if (/Effect Designer|PopcornFX/i.test(effectsUiMarkup) || effectsUiMarkup.includes('effectsLaunchDesignerBtn')) {
  console.error('Build verification failed. Effects Lab still exposes third-party product branding/launcher in its visible UI.');
  process.exit(1);
}
if (!effectsUiMarkup.includes('CFX / PKB PIPELINE') || !effectsUiMarkup.includes('Effects backend status will appear here.')) {
  console.error('Build verification failed. Effects Lab neutral integrated UI labels are incomplete.');
  process.exit(1);
}
const cascMoreCssEarly=fs.readFileSync(path.join(root,'app/css/app.css'),'utf8');
if (!cascMoreCssEarly.includes('body[data-module="casc"] .header-more-popover>#convertBtn') || !cascMoreCssEarly.includes('body[data-module="casc"] .header-more-popover>#defaultFileTypesBtn') || !cascMoreCssEarly.includes('width:300px!important') || !cascMoreCssEarly.includes('grid-template-columns:minmax(0,1fr)!important')) {
  console.error('Build verification failed. CASC More compact/relevant-menu styling is incomplete.');
  process.exit(1);
}
if (!modelPro.includes('Added / Copied Object Tools') || !modelPro.includes('proAddedClone') || !modelPro.includes('proAddedApply') || !modelPro.includes('proAddedAttachBone') || !modelLab.includes('applyAddedObjectTransform') || !modelLab.includes('cloneAddedObject') || !modelLab.includes('attachAddedObjectToBone') || !modelLab.includes('detachAddedObjectFromBone') || !modelLab.includes('ensureAddedTransformHelper')) {
  console.error('Build verification failed. Added/copied object clone/transform/bone tools are incomplete.');
  process.exit(1);
}
if (!modelPro.includes('ParticleEmitter2 Advanced Editor') || !modelPro.includes('proFxTiming') || !modelPro.includes('proFxSequences') || !modelPro.includes('proFxVariation') || !modelLab.includes('setParticleEmitterTiming') || !modelLab.includes("tag:'KP2V'") || !advancedModelSave.includes('KP2V')) {
  console.error('Build verification failed. Advanced ParticleEmitter2 timing / animation visibility workflow is incomplete.');
  process.exit(1);
}
if (!main.includes('ensureFirstRunWarcraftInstallFolder') || !main.includes('chooseWarcraftInstallFolder') || !main.includes('installPathConfirmed:true') || !main.includes("wc3-casc:install-folder-state") || !main.includes("wc3-casc:choose-install-folder") || !preload.includes('installFolderState:') || !preload.includes('chooseInstallFolder:') || !modelHtml.includes('modelCascChooseFolderBtn') || !modelLab.includes('modelCascChooseFolderBtn')) {
  console.error('Build verification failed. First-run Warcraft installation folder selection / persistence is incomplete.');
  process.exit(1);
}
if (!advancedModelSave.includes('geosetRecordMdx') || !advancedModelSave.includes('appendImportedGeosetsMdx') || !advancedModelSave.includes('appendImportedGeosetAnimationsMdx') || !advancedModelSave.includes('geosetImports:imports.length') || !modelLab.includes('delete copy.__clonedFromIndex') || !modelLab.includes('state.model.__rigEdited=true')) {
  console.error('Build verification failed. Reference-import geoset save/reparse persistence is incomplete.');
  process.exit(1);
}
if (!modelLab.includes('textureReplaceableInfo') || !modelLab.includes('replaceabletextures\\/teamcolor') || !modelLab.includes('makeTeamReplaceableCanvas(rid===2,rep.index)')) {
  console.error('Build verification failed. Explicit Warcraft TeamColor/TeamGlow texture runtime handling is incomplete.');
  process.exit(1);
}
if (!preload.includes('searchAssets:') || !main.includes("wc3-casc:search-assets") || !cascCdn.includes('searchPaths(query')) {
  console.error('Build verification failed. CASC asset browser search bridge is incomplete.');
  process.exit(1);
}
if (!preload.includes("searchAssets: (query, type='all', limit=200, offset=0, artSet='sd')") || !preload.includes('offset:Math.max(0,Number(offset)||0)') || !preload.includes("artSet:String(artSet||'sd').toLowerCase()") || !main.includes('const offset=Math.max(0,Math.min(100000') || !main.includes("['sd','hd','de'].includes") || !main.includes('search:{query,type,limit,offset,artSet}') || !main.includes('total:Number(result.total)') || !cascCdn.includes('total:rows.length') || !cascCdn.includes("searchPaths(query='', type='all', limit=200, offset=0, artSet='sd')") || !cascCdn.includes('artSetPreference(') || !modelHtml.includes('cascGalleryTab') || !modelHtml.includes('cascModelGallery') || !modelHtml.includes('cascGalleryProgressBar') || !modelHtml.includes('cascGalleryProgressFill') || !modelPro.includes('queueGalleryThumbnail') || !modelPro.includes('queueGalleryPageThumbnails') || !modelPro.includes('IntersectionObserver') || !modelPro.includes('galleryThumbCache') || !modelPro.includes('galleryBatchSize:12') || !modelPro.includes('galleryTextureBatchSize:8') || !modelPro.includes('loadGalleryBaseThumbnailBatch') || !modelPro.includes('scheduleGalleryBasePump') || !modelPro.includes('upgradeGalleryThumbnailBatch') || !modelPro.includes('galleryTextureQueue.findIndex') || !modelPro.includes('galleryBaseActiveGeneration') || !modelPro.includes('galleryTextureActiveGeneration') || !modelPro.includes("rec?.state==='loading'") || !modelLab.includes('prepareReferenceModelRuntimesBatch') || !modelLab.includes('createGalleryThumbnailModel') || !modelLab.includes('galleryLite:true') || !modelPro.includes('I.createGalleryThumbnailModel?I.createGalleryThumbnailModel(full):full') || !modelLab.includes('referenceTextures:new Map()') || !modelLab.includes('rememberReferenceTexture')) {
  console.error('Build verification failed. CASC Model Gallery paging / batched model+texture thumbnail pipeline is incomplete.');
  process.exit(1);
}
if (!modelHtml.includes('id="cascGalleryProgress"') || !fs.readFileSync(path.join(root, 'app/css/model-lab.css'), 'utf8').includes('.casc-gallery-progress-track') || !modelPro.includes('queueGalleryPageThumbnails') || !modelPro.includes("state:'texture-loading'") || !modelPro.includes("CASC thumbnails: textured full page preload.")) {
  fail('Model Gallery full-page Thumbnail Lite preload/progress contract is missing.');
}
if (!modelLab.includes('Effects tab explicitly prefers the texture decoded from Warcraft CASC/CDN') || !modelLab.includes('getEmitterTextureCanvas,effectSourceForNode')) {
  fail('Model Lab Effects CASC/CDN texture-priority contract is missing.');
}

if (!modelHtml.includes('id="cascGalleryFilters"') || !modelHtml.includes('data-gallery-category="heroes"') || !modelHtml.includes('data-gallery-category="buildings"') || !modelHtml.includes('data-gallery-category="doodads"') || !modelHtml.includes('data-gallery-category="effects"') || !modelHtml.includes('data-gallery-category="projectiles"') || !modelPro.includes('GALLERY_CATEGORIES') || !modelPro.includes('setGalleryCategory') || !modelPro.includes("type:'model-units'") || !cascCdn.includes('modelCategoryMatches(') || !cascCdn.includes("mode === 'heroes'") || !cascCdn.includes("mode === 'buildings'") || !cascCdn.includes("mode === 'doodads'")) {
  console.error('Build verification failed. CASC Model Gallery category filters are incomplete.');
  process.exit(1);
}
if (!modelHtml.includes('id="cascThumbnailQuality"') || !modelHtml.includes('id="cascThumbnailTextureMode"') || !modelHtml.includes('Lite textured · Stand + particles') || !modelHtml.includes('minimal rig, Stand and PE2 only') || !modelHtml.includes('value="96"') || !modelHtml.includes('value="128"') || !modelHtml.includes('value="192"') || !modelHtml.includes('value="256"') || !modelHtml.includes('value="320" selected') || !modelPro.includes('const CASC_DEFAULT_THUMB_SIZE=320') || !modelPro.includes("localStorage.setItem('wc3.cascThumbnailSize'") || !modelPro.includes("localStorage.setItem('wc3.cascThumbnailTextureMode'") || !modelPro.includes('galleryTextureMode') || !modelPro.includes("pro.galleryTextureMode==='textured'") || !modelPro.includes('setGalleryThumbSize') || !modelPro.includes('setGalleryTextureMode')) {
  console.error('Build verification failed. CASC thumbnail performance controls / Original 320 px default / visible-only texture optimization are incomplete.');
  process.exit(1);
}
if (!modelPro.includes("stage.addEventListener('pointerdown'") || !modelPro.includes("stage.addEventListener('pointermove'") || !modelPro.includes("stage.addEventListener('wheel'") || !modelPro.includes("stage.addEventListener('dblclick'") || !modelPro.includes('assetPreviewView') || !modelPro.includes('redrawAssetPreview') || !modelLab.includes('updateAssetPreviewGlGeometry(r,nowMs,view={})') || !modelLab.includes('drawRuntimeAssetPreview(glCanvas,overlayCanvas,runtime,nowMs=performance.now(),view={})')) {
  console.error('Build verification failed. Interactive CASC model Viewer orbit/pan/zoom camera routing is incomplete.');
  process.exit(1);
}
if (!modelPro.includes("addPropPanel('particles','Particles'") || !modelPro.includes('Warcraft FX / Object Editor Import') || !modelPro.includes('ParticleEmitter2 Advanced Editor') || !modelPro.includes("b.dataset.modelPanel=\'particles\'") || !modelLab.includes('particleCompositeMode') || !modelLab.includes('particleSpriteTexture') || !modelLab.includes('peak<=3?0:Math.min(d[i+3],peak)') || (modelLab.match(/globalCompositeOperation=particleCompositeMode\(n\)/g)||[]).length<2 || (modelLab.match(/particleSpriteTexture\(n,tex\)/g)||[]).length<2) {
  console.error('Build verification failed. Particles workspace / Warcraft FX import / particle blend-mode preview fix is incomplete.');
  process.exit(1);
}
if (!modelHtml.includes('id="cascArtSetSwitch"') || !modelHtml.includes('data-casc-artset="sd"') || !modelHtml.includes('data-casc-artset="hd"') || !modelHtml.includes('data-casc-artset="de"') || !modelPro.includes('setCascArtSet') || !modelPro.includes("localStorage.setItem('wc3.cascArtSet'") || !main.includes("artSet === 'de'") || !cascCdn.includes('logicalVirtualPath') || !cascCdn.includes('virtualArtSetInfo')) {
  console.error('Build verification failed. CASC SD / HD / DE art-set selector/routing is incomplete.');
  process.exit(1);
}
const objectEditorAutoTests = [
  'Warcraft Library entry points + CASC-only FX UI',
  'Object Editor Assets workspace + controls',
  'Particles sub-tab + Warcraft FX import controls',
  'CASC additive particle black-background suppression',
  'CASC More thumbnail performance controls',
  'CASC Viewer interactive orbit / pan / zoom / reset',
  'CASC action matrix by asset type',
  'CASC SD / HD / DE art-set selector + routing',
  'MDX1800 uint16 SKIN preserves UVAS alignment',
  'Node DontInherit rotation / scaling bit mapping',
  'Reforged HD / DE combined material slot composition',
  'Legacy Shader_HD_DefaultUnit six-slot condensation',
  'Reforged CASC viewer renders only primary LOD geosets',
  'Unified workspace menu palette',
  'CASC asset extension classifier matrix',
  'CASC results UI + Enter search + selection + double-click preview',
  'CASC copy game path + clipboard fallback',
  'CASC stale search result protection + error recovery',
  'CASC Model Gallery auto-load + paging + selection',
  'CASC Model Gallery category filter matrix + query preservation',
  'CASC Model Gallery category paging stays scoped',
  'CASC Model Gallery stale category search protection',
  'CASC Model Gallery category switch drops stale thumbnail work',
  'CASC Model Gallery category cache reuse avoids duplicate reads',
  'CASC Model Gallery thumbnail queue + cache metadata',
  'CASC Model Gallery preloads whole page + progress',
  'CASC texture preview',
  'CASC texture import routes to Model Lab + Texture Paint',
  'CASC sound preview + preview cleanup',
  'CASC export selected + preserve-path routing',
  'CASC model dependency export filtering + dedupe + 64-request cap',
  'CASC preview/export failure + cancel recovery',
  'CASC Open in Editor model routing',
  'Warcraft unit/model search + preview',
  'Warcraft effect search + preview',
  'Load as Reference + viewer controls',
  'Reference GPU depth + coplanar material layer composition',
  'Copy geoset from reference via UI + Undo/Redo',
  'Added/copied object tools clone / move / scale / rotate / bone + Undo',
  'Copy FX from reference via UI + Undo/Redo',
  'Copy all FX from reference via UI + Undo cleanup',
  'Insert stock Warcraft effect as Attachment + Undo',
  'Reference imports save/reparse persistence'
];
if (!modelAutoTest.includes('MDX1800 uint16 SKIN preserves UVAS alignment') || !modelAutoTest.includes('Node DontInherit rotation / scaling bit mapping') || !modelAutoTest.includes('Reforged HD / DE combined material slot composition') || !modelAutoTest.includes('Legacy Shader_HD_DefaultUnit six-slot condensation') || !modelAutoTest.includes('Reforged CASC viewer renders only primary LOD geosets') || !modelAutoTest.includes('did not enter the combined-material render path') || !modelAutoTest.includes('bound only diffuse textures instead of the HD/DE material slots') || !modelAutoTest.includes('alternate LOD meshes simultaneously')) {
  console.error('Build verification failed. HD / DE visual material + LOD regression Auto Test coverage is missing.');
  process.exit(1);
}
if (!modelAutoTest.includes('ParticleEmitter2 advanced timing / duration / animation visibility + save round-trip')) {
  console.error('Build verification failed. Advanced ParticleEmitter2 duration/timing Auto Test coverage is missing.');
  process.exit(1);
}
if (!objectEditorAutoTests.every(x => modelAutoTest.includes(x)) || !modelAutoTest.includes("$('#proReferenceCopySelected').click()") || !modelAutoTest.includes("$('#proReferenceCopyFx').click()") || !modelAutoTest.includes("$('#proAssetAttach').click()") || !modelAutoTest.includes("!$('#modelFxPreviewBtn')") || !modelHtml.includes('modelOpenWarcraftLibraryBtn') || modelHtml.includes('id="modelFxPreviewBtn"')) {
  console.error('Build verification failed. Object Editor / Asset Browser UI Auto Test coverage is incomplete.');
  process.exit(1);
}
if (!modelAutoTest.includes('full CASC texture/animation runtime was not created') || !modelAutoTest.includes('Warcraft unit preview loaded geometry but no CASC textures') || !modelAutoTest.includes('Warcraft unit preview still uses the old Canvas2D painter renderer instead of WebGL depth buffer') || !modelAutoTest.includes('Warcraft unit preview is not composing coplanar material layers with LEQUAL depth') || !modelAutoTest.includes('Warcraft unit preview has material layers whose expected CASC texture was not bound') || !modelAutoTest.includes('Reference model fell back to the old static mesh renderer') || !modelAutoTest.includes('Reference model has no animation sequences') || !modelAutoTest.includes('Reference model must load fully opaque by default') || !modelAutoTest.includes('Reference model did not render through the WebGL depth buffer') || !modelAutoTest.includes('Opaque reference layers must depth-test/write without blending') || !modelAutoTest.includes('Reference renderer must allow later coplanar material layers to pass depth') || !modelAutoTest.includes('Reference GPU renderer has material layers whose expected texture was not bound') || !modelAutoTest.includes('Units mode still exposes Insert as Attachment')) {
  console.error('Build verification failed. Warcraft unit reference runtime Auto Test coverage is incomplete.');
  process.exit(1);
}
if (!modelAutoTest.includes('Warcraft install folder first-run persistence bridge') || !modelAutoTest.includes('installFolderState') || !modelAutoTest.includes('firstRunPending')) {
  console.error('Build verification failed. First-run Warcraft folder Auto Test coverage is missing.');
  process.exit(1);
}
if (!modelAutoTest.includes('nativeAttempted') || !modelAutoTest.includes('incorrectly attempted native CascLib before CDN')) {
  console.error('Build verification failed. CASC CDN-first runtime Auto Test coverage is missing.');
  process.exit(1);
}
const cascWorkspaceAutoTests = [
  'CASC More thumbnail performance controls',
  'CASC Viewer interactive orbit / pan / zoom / reset',
  'CASC action matrix by asset type',
  'CASC asset extension classifier matrix',
  'CASC results UI + Enter search + selection + double-click preview',
  'CASC copy game path + clipboard fallback',
  'CASC stale search result protection + error recovery',
  'CASC Model Gallery fixture reset cancels in-flight real search',
  'CASC texture preview',
  'CASC texture import routes to Model Lab + Texture Paint',
  'CASC sound preview + preview cleanup',
  'CASC export selected + preserve-path routing',
  'CASC model dependency export filtering + dedupe + 64-request cap',
  'CASC preview/export failure + cancel recovery',
  'CASC Open in Editor model routing'
];
if (!cascWorkspaceAutoTests.every(x => modelAutoTest.includes(x))) {
  console.error('Build verification failed. Dedicated CASC workspace Auto Test coverage is incomplete.');
  process.exit(1);
}
if (!modelPro.includes('__autoTest:Object.freeze') || !modelPro.includes('setCascBridgeForAutoTest') || !modelPro.includes('setAssetFixtureForAutoTest') || !modelPro.includes('modelTextureAssetPaths') || !modelPro.includes('copySelectedAssetPath')) {
  console.error('Build verification failed. CASC deterministic Auto Test hooks are incomplete.');
  process.exit(1);
}
if (!modelPro.includes('.load-texture')) {
  console.error('Build verification failed. CASC Open Texture in Paint is not wired to the current Model Lab .load-texture action.');
  process.exit(1);
}
if (!preload.includes('exportAssets:') || !main.includes("wc3-casc:export-assets") || !main.includes('exportCascAssets(payload={})') || !modelPro.includes('EXPORT SELECTED TO FOLDER') || !modelPro.includes('EXPORT MODEL + TEXTURES')) {
  console.error('Build verification failed. Game Storage folder export bridge/UI is incomplete.');
  process.exit(1);
}
const cascExportSafetyChecks = {
  requestCap: main.includes('filter(allowedCascRequest).slice(0,64)'),
  traversalFilter: main.includes("filter(part=>part!=='.'&&part!=='..')"),
  invalidCharSanitize: main.includes("part.replace(/[<>:\"|?*\\x00-\\x1F]/g,'_')"),
  duplicatePathGuard: main.includes('function uniqueExportPath(') && main.includes("`${base}_${i}${ext}`"),
  directoryPicker: main.includes("properties:['openDirectory','createDirectory']"),
  emptyRequestReject: main.includes("error:'No supported Warcraft assets were selected for export.'"),
  readBeforeWrite: main.includes('const read=await readCascAssets({requests});'),
  recursiveMkdir: main.includes('fs.promises.mkdir(path.dirname(target),{recursive:true})'),
  fileWrite: main.includes('await fs.promises.writeFile(target,data);'),
  missingCount: main.includes('missing:Math.max(0,requests.length-files.length)'),
  soundRequestKinds: main.includes("if (kind === 'sound' || kind === 'audio')") && main.includes("'.wav', '.mp3', '.ogg', '.flac', '.opus'"),
  reforgedTifTextureFallback: main.includes("'.tif', '.tiff'") && main.includes("rel0.replace(/\\.tiff?$/i, '.dds')"),
  replaceableDependencyGuard: modelPro.includes('replaceabletextures') && modelPro.includes('team(color|glow)') && modelPro.includes('const k=p.toLowerCase();if(seen.has(k))return')
};
if (!Object.values(cascExportSafetyChecks).every(Boolean)) {
  console.error('Build verification failed. CASC export safety / dependency guards are incomplete.');
  for (const [name, ok] of Object.entries(cascExportSafetyChecks)) console.error(`  ${name}: ${ok ? 'OK' : 'MISSING'}`);
  process.exit(1);
}
if (!modelLab.includes('wc3-model-refresh') || !modelPro.includes('wc3-model-refresh')) {
  console.error('Build verification failed. Model Lab pro refresh handshake is missing.');
  process.exit(1);
}
if (!modelPro.includes('window.WC3_MODEL_LAB_PRO=Object.freeze') || !modelPro.includes('buildProjectBlob') || !modelPro.includes('geoOp')) {
  console.error('Build verification failed. v1.4 Pro dry-run/test API is missing.');
  process.exit(1);
}
if (!modelLab.includes('translateSelectedGeoset,scaleSelectedGeoset,rotateSelectedGeoset,cloneSelectedGeoset')) {
  console.error('Build verification failed. Geoset transform hooks required by the automatic test are missing.');
  process.exit(1);
}
if (!effectsAutoTest.includes('Motion preview repeated workspace cycles + resize + DPR matrix')) {
  console.error('Build verification failed. Effects Lab repeated reflow / DPR coverage is missing.');
  process.exit(1);
}
const sanityUi = fs.readFileSync(path.join(root, 'app/js/sanity.js'), 'utf8');
if (!sanityUi.includes("document.body.dataset.module!=='sanity'") || !sanityUi.includes("WC3_WORKSPACE_UI?.setActive?.('sanity'") || !modelAutoTest.includes("$('#workspaceSanity')") || !modelAutoTest.includes("Sanity workspace panel is still hidden")) {
  console.error('Build verification failed. Sanity workspace state synchronization / UI coverage is incomplete.');
  process.exit(1);
}
if (!modelLab.includes('particleHeartbeatDecision') || !modelLab.includes('keepaliveMs=60000') || !modelLab.includes("reason:decision.changed?'changed':'keepalive'") || !sanityUi.includes('restPoseGeometryStats') || !sanityUi.includes('rootTranslationStats') || !sanityUi.includes('Rest-pose geometry is') || !sanityUi.includes('Root animation raises Z')) {
  console.error('Build verification failed. FX heartbeat throttling / problematic-MDX spatial diagnostics are incomplete.');
  process.exit(1);
}
if (!sanityUi.includes('repairModelParsed') || !sanityUi.includes('normalizeBuriedRestPose') || !sanityUi.includes('allowSpatialRepair=true') || !sanityUi.includes('shiftPivotObjectsOnce') || !sanityUi.includes('spatialNormalizationProof') || !sanityUi.includes('allNodesUnderCandidate') || !sanityUi.includes('Verified coordinate-basis repair') || !sanityUi.includes('allowAnimationBoundaryFixes=false') || !sanityUi.includes('allowRigBindingFixes=false') || !sanityUi.includes('repairAnimationTracks') || !sanityUi.includes('closingKeyRepairTargets') || !sanityUi.includes('repairGeosetAnimations') || !sanityUi.includes('repairSkinWeights') || !sanityUi.includes('repairGeometryBindings') || !sanityUi.includes('recalculateGeosetNormals') || !sanityUi.includes('safetySummary') || !sanityUi.includes("profile:'smart-safe-v4.1'") || !sanityUi.includes('scanStandaloneModelTextures') || !sanityUi.includes('standaloneTextureResolved') || !sanityUi.includes('sourceFile:file') || !sanityUi.includes('not found beside the standalone model') || !sanityUi.includes('sanity-severity-tabs') || !sanityUi.includes('Model repair serialized and reparsed') || !sanityUi.includes('saveAutoFixOutput') || !sanityUi.includes('state.fixRunning') || !sanityUi.includes('sanityAutoFixBound') || !sanityUi.includes('sanityConservativeFixes') || !fs.readFileSync(path.join(root, 'app/js/model-save.js'), 'utf8').includes('geosetAnimationsData')) {
  console.error('Build verification failed. Sanity Smart Auto Fix v4.1 / result tabs / standalone texture resolver pipeline is incomplete.');
  process.exit(1);
}
const preloadJs = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
if (!preloadJs.includes("saveBinary:") || !preloadJs.includes("wc3-file:save-binary") || !main.includes("function saveBinaryFile") || !main.includes("function bindDownloadHandler") || !main.includes("removeListener('will-download'") || !main.includes("ipcMain.handle('wc3-file:save-binary'")) {
  console.error('Build verification failed. Native single-save bridge / idempotent download handler is incomplete.');
  process.exit(1);
}
if ((modelAutoTest.match(/await test\(/g)||[]).length < 160) {
  console.error('Build verification failed. v1.4 automatic model suite coverage unexpectedly dropped below 160 tests.');
  process.exit(1);
}
const autoTestChecks = [
  'WC3_MODEL_AUTOTEST',
  'Model pack parser / serializer matrix',
  'Paint texture + model sync',
  'Texture Paint tool palette (all tools)',
  'Texture Paint Eraser actual pixel mutation + restore',
  'Texture Paint Clone actual pixel copy + restore',
  'Texture Paint Bucket + Eyedropper actual pixel behavior + restore',
  'Texture Paint Line / Rect / Ellipse actual drawing + restore',
  'Texture Paint Blur + Smudge actual pixel mutation + restore',
  'Texture Paint brush/options controls',
  'Texture Paint layer lifecycle',
  'Texture Paint layer/document transforms',
  'Geo Select shelf + list selection + hide/show + Undo',
  'Geo Clone shelf action + Undo + Redo',
  'Geo Move / Drag / Scale / Rotate shelf + geometry mutation + Undo',
  'Geometry utilities: Mirror XYZ / Flip / Center + Undo',
  'Timeline keyframe add/update + Undo',
  'Timeline Delete / Reverse / Retime + Undo',
  'Rig editor Apply + Undo',
  'Rig create Bone / Helper / delete Helper + Undo',
  'Material / PBR editor Apply + Undo',
  'Model Analyze + Safe Cleanup smoke',
  'Batch Analyzer current model',
  'Add ParticleEmitter2 button + serialization + Undo',
  'Add effect attachment button + serialization + Undo',
  'FX Renderer heartbeat change / keepalive throttling',
  'WC3 Buttons workspace + all icon variants',
  'WC3 Buttons ZIP exports BLP + TGA with import paths',
  'Sanity Checker engine dry run on serialized model',
  'Sanity detects buried rest pose + root-lift dependency',
  'Sanity detects invalid ParticleEmitter2 Time range',
  'Sanity detects missing sequence opening animation key',
  'Sanity Auto Fix repairs safe targeted MDX compatibility issues',
  'Sanity Auto Fix healthy-model no-op + second-pass idempotence',
  'Sanity spatial repair multi-bone world-space animation invariance',
  'MDL parse → Sanity → Auto Fix → serialize → reparse end-to-end',
  'Sanity real filesystem standalone texture resolver',
  'Sanity known-good baseline has zero error / severe',
  'Sanity Inspection Results four-tab behavior + real scrolling + collapse persistence',
  'Sanity Auto Fix one click = one native save + re-entry / cancel / error recovery',
  'Model parser defensive corruption + unknown chunk preservation',
  'Sanity verified spatial Auto Fix preserves animation basis while normalizing buried mesh',
  'Sanity spatial repair compensates Bezier root controls and aliased pivots exactly once',
  'Sanity caller can explicitly disable verified spatial normalization',
  'Sanity Auto Fix single-save bridge + re-entry guard UI contract',
  'Sanity Auto Fix animation track hygiene matrix',
  'Sanity Auto Fix extents + GeosetAnimation / Bone reference matrix',
  'Sanity Auto Fix ParticleEmitter2 / material / texture / pivot fields',
  'Sanity Auto Fix HD SKIN4 weight normalization',
  'Sanity Auto Fix detailed audit contract',
  'Sanity Auto Fix geometry normals + classic matrix reference repair',
  'Sanity Auto Fix deterministic material / texture reference fallbacks',
  'Sanity Auto Fix valid global-sequence out-of-range key cleanup',
  'Sanity Auto Fix SKIN4 invalid influence cleanup',
  'Sanity Auto Fix serializer round-trip preserves repaired reference tables',
  'Sanity standalone model without disk context avoids false missing-texture severe',
  'Sanity standalone texture folder resolver uses Model Lab local lookup contract',
  'Sanity standalone texture lookup found / missing severity contract',
  'Current model MDX compatibility diagnostic summary',
  'Sanity workspace UI + filters + report export text',
  'Sanity ZIP / batch package workflow',
  'Texture/image conversion decode matrix PNG / JPG / JPEG / BLP / TGA / DDS',
  'Standalone texture save builders BLP / TGA / DDS + quality / resize',
  'PNG export artifact + decode round-trip',
  'Layered Texture Paint project save artifact',
  'Texture export builders dry run',
  'Save Textures ZIP matrix keep / BLP / DDS / TGA',
  'Save Model artifact + reparse',
  'Save Model + Textures ZIP paths + round-trip',
  'Compare model + partial action import + Undo',
  'Crash recovery database read-only probe',
  'Workspace .wc3asset dry run',
  'Save serializer dry run + reparse',
  'CASC Asset Browser real search + asset read',
  'Missing texture resolver searches exact path + CASC index fallback',
  'Warcraft Library entry points + CASC-only FX UI',
  'Object Editor Assets workspace + controls',
  'Warcraft unit/model search + preview',
  'Warcraft effect search + preview',
  'Load as Reference + viewer controls',
  'Copy geoset from reference via UI + Undo/Redo',
  'Copy FX from reference via UI + Undo/Redo',
  'Copy all FX from reference via UI + Undo cleanup',
  'Insert stock Warcraft effect as Attachment + Undo',
  'Reference imports save/reparse persistence',
  'Unsaved changes guard state + save scope behavior',
  'Effects Lab motion preview reflows after workspace round-trip',
  '75-step Undo capacity configuration',
  'Warcraft install folder first-run persistence bridge',
  'Feature coverage audit'
];
if (!autoTestChecks.every(x => modelAutoTest.includes(x))) {
  console.error('Build verification failed. v1.4 automatic model-test coverage is incomplete.');
  process.exit(1);
}
if (!modelLab.includes('editorTextureLoading') || !modelLab.includes('wc3-texture-paint-ready') || !modelAutoTest.includes("waitEvent(window,'wc3-texture-paint-ready'") || !modelAutoTest.includes('state.editorTextureLoading===false')) {
  console.error('Build verification failed. Texture Paint asynchronous-load event/test guard is missing.');
  process.exit(1);
}
if (!modelPro.includes('historyTransaction') || !modelPro.includes('pushHistoryWithoutUiReset')) {
  console.error('Build verification failed. Pro editor Apply/history transaction guard is missing.');
  process.exit(1);
}
const appCss = fs.readFileSync(path.join(root, 'app/css/app.css'), 'utf8');
const modelCss = fs.readFileSync(path.join(root, 'app/css/model-lab.css'), 'utf8');
const appHtml = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
if (!appCss.includes('More popup overflow guard + CASC performance controls') || !appCss.includes('max-width:calc(100vw - 16px)') || !appCss.includes('overflow-x:hidden!important') || !appCss.includes('max-width:100%!important')) {
  console.error('Build verification failed. More popup overflow containment is incomplete.');
  process.exit(1);
}

if (!appCss.includes('compact CASC More menu (no scrollbars)') || !appCss.includes('width:220px!important') || !appCss.includes('width:176px!important') || !appCss.includes('overflow:visible!important') || !appCss.includes('.unified-menubar.onebar:has(.header-more-menu[open])') || !appCss.includes('height:23px!important')) {
  console.error('Build verification failed. Compact scrollbar-free CASC More menu is incomplete.');
  process.exit(1);
}
if (!appCss.includes('unified menu palette across every workspace') || !appCss.includes('body:is([data-module="texture"],[data-module="model"],[data-module="effects"],[data-module="casc"],[data-module="sanity"],[data-module="buttons"],[data-module="log"]) .workspace-tab.active') || !modelCss.includes('CASC art-set switch + Texture Paint menu palette') || !modelCss.includes('.casc-artset-btn.active')) {
  console.error('Build verification failed. Unified Texture Paint top-menu palette / CASC art-set styling is incomplete.');
  process.exit(1);
}
if (!appCss.includes('body[data-module="texture"] .drop-hint{z-index:8') ||
    !appCss.includes('body[data-module="texture"] .canvas-scroll{position:absolute;inset:42px 0 0 0;overflow-x:auto;overflow-y:auto') ||
    !appCss.includes('body[data-module="texture"] .canvas-stage{overflow:hidden!important') ||
    !appHtml.includes('class="canvas-scroll" id="canvasScroll"') ||
    !appJs.includes("$('#canvasScroll') || $('#canvasStage')") ||
    !editor.includes("closest('.canvas-scroll') || this.displayCanvas.closest('.canvas-stage')")) {
  console.error('Build verification failed. Texture Paint fixed hint / inner scroll viewport guard is missing.');
  process.exit(1);
}
if (!modelAutoTest.includes('inspectModelPack') || !modelAutoTest.includes('highest feature richness score') || !modelAutoTest.includes('MODEL PACK MATRIX')) {
  console.error('Build verification failed. ZIP multi-model parser/serializer matrix is incomplete.');
  process.exit(1);
}
if (!modelPro.includes("parseMDL(new TextDecoder().decode(ab),file.name)") || !modelPro.includes('return pro.batchRows.map')) {
  console.error('Build verification failed. Batch Analyzer MDL compatibility / test return bridge is missing.');
  process.exit(1);
}
if (!modelLab.includes('buildTextureExportFiles,clonedModelForPaths,serializeCurrentModel,buildEditedModelArtifact,buildTexturePackageArtifact,buildModelPackageArtifact') || !modelPro.includes('openCompare') || !modelPro.includes('getRecovery')) {
  console.error('Build verification failed. Expanded safe dry-run Auto Test bridges are missing.');
  process.exit(1);
}
const sanityJs = fs.readFileSync(path.join(root, 'app/js/sanity.js'), 'utf8');
if (!appJs.includes('buildIconSetPackage') || !appJs.includes('buildStandaloneTextureArtifact') || !appJs.includes('buildPngArtifact') || !appJs.includes('buildLayeredProjectBlob') || !sanityJs.includes('buildReportText') || !sanityJs.includes('runEntries')) {
  console.error('Build verification failed. Buttons / texture-save / layered-project / Sanity artifact-test APIs are missing.');
  process.exit(1);
}
if (!appCss.includes('.sanity-severity-tabs') || !appCss.includes('overflow-y:scroll!important') || !appCss.includes('scrollbar-gutter:stable') || !appCss.includes('max-height:calc(100vh - 220px)!important') || !modelHtml.includes('Standalone models automatically search nearby texture files')) {
  console.error('Build verification failed. Sanity Inspection Results scrollbar / per-model severity sub-tabs / standalone texture lookup UI is incomplete.');
  process.exit(1);
}
if (!modelLab.includes("captureModelEditSnapshot('Add ParticleEmitter2')") || !modelLab.includes("captureModelEditSnapshot('Add effect attachment')") || !modelLab.includes('pushModelHistorySnapshot(historySnap)')) {
  console.error('Build verification failed. Effect authoring creation is not covered by Undo history.');
  process.exit(1);
}
const indexHtml = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
if (!indexHtml.includes('Content-Security-Policy') || !indexHtml.includes("script-src 'self' wc3asset:") || /script-src[^\n>]*unsafe-eval/i.test(indexHtml)) {
  console.error('Build verification failed. Electron renderer CSP is missing or still permits unsafe-eval.');
  process.exit(1);
}
if (!modelAutoTest.includes('function readCanvasPixels(') || !modelAutoTest.includes("getContext('2d',{willReadFrequently:true})") || modelAutoTest.includes("canvas.getContext('2d',{willReadFrequently:true}).getImageData")) {
  console.error('Build verification failed. Auto Test canvas readback optimization / warning guard is incomplete.');
  process.exit(1);
}
if (!indexHtml.includes('sanityFixBtn') || !indexHtml.includes('sanityConservativeFixes') || !indexHtml.includes('Smart Auto Fix v4.1') || !indexHtml.includes('Auto Fix Models') || !indexHtml.includes('model-lab-pro.js') || !indexHtml.includes('WC3 Asset Studio v1.4')) {
  console.error('Build verification failed. v1.4 UI/script registration is incomplete.');
  process.exit(1);
}
if (!indexHtml.includes('model-lab-autotest.js') || !indexHtml.includes('modelAutoTestBtn') || !indexHtml.includes('modelAutoTestFileInput') || !indexHtml.includes('modelAutoTestResults')) {
  console.error('Build verification failed. v1.4 automatic model-test UI/script registration is incomplete.');
  process.exit(1);
}
if (!sanityJs.includes('current>0&&current!==wanted')) {
  fail('Sanity sequence-extent Auto Fix must stay idempotent for absent MDL/MDX extent tables.');
}
if (!sanityJs.includes("particleEmitterTextureRefsFixed") || !sanityJs.includes("Invalid ReplaceableId cleared after resolving a valid texture reference.")) {
  console.error('Build verification failed. Sanity ParticleEmitter2 texture/ReplaceableId repair ordering guard is missing.');
  process.exit(1);
}

const icon = fs.statSync(path.join(root, 'assets/icon.ico'));
if (icon.size < 1024) {
  console.error('Build verification failed. assets/icon.ico looks invalid.');
  process.exit(1);
}


const effectsResourceExe = extraResources.some(x => x?.from === 'tools/effects-lab/effects-runtime.exe' && x?.to === 'tools/effects-lab/effects-runtime.exe');
const effectsResourceLib = extraResources.some(x => x?.from === 'tools/effects-lab/cfxlib' && x?.to === 'tools/effects-lab/cfxlib');
const effectsResourceDesigner = extraResources.some(x => x?.from === 'tools/effects-lab/effect-designer' && x?.to === 'tools/effects-lab/effect-designer');
const effectsRuntimeBinary = fs.readFileSync(path.join(root,'tools/effects-lab/effects-runtime.exe'));
const effectsRuntimeUsesNeutralMarkers = effectsRuntimeBinary.includes(Buffer.from('EFFECTSRT_','ascii')) && effectsRuntimeBinary.includes(Buffer.from('effectsrt','ascii'));
const effectsChecks = {
  workspaceTab: modelHtml.includes('id="workspaceEffects"') && modelHtml.includes('id="effectsLabPanels"'),
  scripts: modelHtml.includes('effects-lab-core.js') && modelHtml.includes('effects-lab.js') && modelHtml.includes('effects-lab-autotest.js') && modelHtml.includes('effects-lab.css'),
  autoTestUi: modelHtml.includes('id="effectsAutoTestBtn"') && modelHtml.includes('id="effectsAutoTestStatus"') && effectsCss.includes('.effects-test-status'),
  workspaceRouting: workspaceUi.includes("effects: 'Effects Lab'") && workspaceUi.includes("module === 'effects'") && workspaceUi.includes("WC3_EFFECTS_LAB?.prepare"),
  preload: preload.includes("exposeInMainWorld('WC3_EFFECTS'") && preload.includes("wc3-effects:decompile") && preload.includes("wc3-effects:build") && preload.includes('launchDesigner:') && preload.includes('selfTest:'),
  mainIpc: main.includes("ipcMain.handle('wc3-effects:status'") && main.includes("ipcMain.handle('wc3-effects:decompile'") && main.includes("ipcMain.handle('wc3-effects:build'") && main.includes("ipcMain.handle('wc3-effects:launch-designer'") && main.includes("ipcMain.handle('wc3-effects:self-test'"),
  effectsRuntime: main.includes("runEffectsTool(['decompile'") && main.includes("runEffectsTool(['build'") && main.includes("runEffectsTool(['help']") && main.includes('effectsRuntimePath') && main.includes('runtimePath') && main.includes('cwd:cwd||st.toolRoot'),
  packaged: effectsResourceExe && effectsResourceLib && effectsResourceDesigner,
  runtimeBinaryNeutral: effectsRuntimeUsesNeutralMarkers,
  epf: effectsCore.includes('parseEpf') && effectsCore.includes('serializeIni') && effectsCore.includes('generateEffectScript'),
  cfx: effectsCore.includes('CORE_BUNDLE_FILES') && effectsCore.includes('OPTIONAL_BUNDLE_FILES') && effectsCore.includes('parseEventsCfx') && effectsCore.includes('bundleFileList') && effectsCore.includes('balancedBlocks') && effectsCore.includes('rendererSummary'),
  ui: effectsLab.includes('renderGraph') && effectsLab.includes('renderSamplers') && effectsLab.includes('renderRenderers') && effectsLab.includes('effectsOpenEpfBtn') && effectsLab.includes('snapshotState') && effectsLab.includes('restoreState'),
  layoutReflow: effectsLab.includes('motionCanvasLayout') && effectsLab.includes('scheduleEffectsLayoutRefresh') && effectsLab.includes('ResizeObserver') && effectsLab.includes('Motion preview layout synchronized'),
  dedicatedSuite: effectsAutoTest.includes('WC3_EFFECTS_AUTOTEST') && effectsAutoTest.includes('CFX sampler declaration syntax matrix') && effectsAutoTest.includes('Motion preview reflows after workspace hide / show') && effectsAutoTest.includes('PKB decompile mocked workflow') && effectsAutoTest.includes('Generated script Save busy guard prevents duplicate writes') && effectsAutoTest.includes('Generated script Save cancel/error-safe recovery') && effectsAutoTest.includes('Effects Lab UI uses neutral runtime branding') && effectsAutoTest.includes('Packaged effects backend live self-test') && effectsAutoTest.includes("await lab.refreshToolStatus()") && effectsAutoTest.includes("Backend status refresh after tests failed") && effectsAutoTest.includes("Effects Lab UI does not report READY") && (effectsAutoTest.match(/await test\(/g)||[]).length >= 48,
  aggregateSuite: modelAutoTest.includes('Effects Lab dedicated regression suite') && modelAutoTest.includes('Effects Lab motion preview reflows after workspace round-trip') && modelAutoTest.includes('window.WC3_EFFECTS_AUTOTEST'),
  hiddenModelPause: modelLab.includes("const modelWorkspaceActive = document.body?.dataset?.module === 'model'") && modelLab.includes("state.mode === 'model' && modelWorkspaceActive"),
  style: effectsCss.includes('body[data-module="effects"]') && effectsCss.includes('.effects-designer-grid')
};
if (!Object.values(effectsChecks).every(Boolean)) {
  console.error('Build verification failed. Effects Lab integration is incomplete.');
  for (const [name, ok] of Object.entries(effectsChecks)) console.error(`  ${name}: ${ok ? 'OK' : 'MISSING'}`);
  process.exit(1);
}
try {
  const E = require(path.join(root,'app/js/effects-lab-core.js'));
  const epf=E.createDefaultEpf();
  E.setIniValue(epf.doc,'FutureSection','Keep','yes');
  const round=E.parseEpf(E.serializeIni(epf.doc));
  if(E.getIniValue(round.doc,'FutureSection','Keep','')!=='yes'||round.layers.length<1)throw new Error('EPF round-trip failed');

  // Corpus regression: every project bundled with the original Effect Designer
  // must survive parse -> serialize -> parse without losing sections or values.
  const epfDir=path.join(root,'tools/effects-lab/effect-designer/projects');
  const epfFiles=fs.readdirSync(epfDir).filter(x=>/\.epf$/i.test(x));
  if(epfFiles.length<10)throw new Error(`Effect Designer EPF corpus unexpectedly small (${epfFiles.length})`);
  const iniSignature=doc=>JSON.stringify({
    preamble:(doc.preamble||[]).map(e=>e.type==='kv'?['kv',e.key,e.value]:['raw',e.raw]),
    sections:(doc.sections||[]).map(sec=>[sec.name,(sec.entries||[]).map(e=>e.type==='kv'?['kv',e.key,e.value]:['raw',e.raw])])
  });
  for(const file of epfFiles){
    const source=fs.readFileSync(path.join(epfDir,file),'latin1');
    const a=E.parseEpf(source),serialized=E.serializeIni(a.doc),b=E.parseEpf(serialized);
    if(iniSignature(a.doc)!==iniSignature(b.doc))throw new Error(`EPF corpus semantic round-trip failed: ${file}`);
    if(a.layers.length!==b.layers.length||a.stuffs.length!==b.stuffs.length)throw new Error(`EPF corpus object count changed: ${file}`);
  }

  const blank=E.blankBundle(),blankList=E.bundleFileList(blank);
  if(blankList.length!==5||blankList.includes('functions.cfx'))throw new Error('New CFX bundle must contain five core files and no synthetic functions.cfx');
  const bundle=E.parseBundle(blank);
  if(bundle.layers.length<2||bundle.renderers.length<1||!bundle.graph.spawns.includes('RootLayer'))throw new Error('CFX parser template failed');

  const modernFiles={...blank,
    'effect.cfx':`header { format = "cfx/1"; }\nattributes { "A" : f32 { default = { 1, 2, 3 }; } }\ngraph { spawn &L0; &L0 emits "Spawn" -> [&L1, &L2]; &L2 emits "Death"; entry "Start" fires &L0."Spawn"; }`,
    'samplers.cfx':`sampler C : Curve { Value = 1; }\nsampler S : Shape { ShapeType = Sphere; }\nsampler T : Turbulence { Strength = 2; }\nsampler E : EventStream { Event = "Hit"; }`,
    'renderers.cfx':`renderer B : Billboard { Transparent.Type = Additive; Diffuse.DiffuseMap = "a.dds"; }\nrenderer R : Ribbon { Transparent.Type = AlphaBlend; }\nrenderer L : Light { Intensity = 2; }\nrenderer M : Mesh { Model = "x.mdx"; }`,
    'events.cfx':`layer L0 { event Spawn { flags = 1; } event "Space Event"; root; }\nlayer L1 { root { event Nested; } }`
  };
  const modern=E.parseBundle(modernFiles);
  if(modern.samplers.length!==4||!modern.samplers.some(x=>x.subtype==='Shape'))throw new Error('Current Effects Runtime sampler syntax parser failed');
  if(modern.renderers.length!==4||!modern.renderers.some(x=>x.subtype==='Mesh'))throw new Error('Renderer syntax matrix parser failed');
  if(modern.graph.emits.filter(x=>x.from==='L0'&&x.event==='Spawn').length!==2||!modern.graph.emits.some(x=>x.from==='L2'&&x.to===''))throw new Error('Graph list/no-target parser failed');
  if(!modern.graph.entries.some(x=>x.name==='Start'&&x.layer==='L0'))throw new Error('Graph entry parser failed');
  if(!modern.events.some(x=>x.name==='Space Event')||!modern.events.some(x=>x.root))throw new Error('events.cfx parser failed');

  const optional=E.parseBundle({...blank,'functions.cfx':'fn helper() { return; }'});
  if(!optional.presentFiles.includes('functions.cfx')||E.bundleFileList(optional.files).length!==6)throw new Error('Optional functions.cfx compatibility failed');

  const named=E.createDefaultEpf();E.setIniValue(named.doc,'General','Name','123 Fire!');
  const lua=E.generateEffectScript(E.parseEpf(E.serializeIni(named.doc)),'lua'),jass=E.generateEffectScript(E.parseEpf(E.serializeIni(named.doc)),'jass');
  if(!lua.includes('local _123_Fire_')||!jass.includes('function _123_Fire__Tick'))throw new Error('Generated script identifier sanitization failed');
  const pts=E.motionPoints('Helix',{count:32,height:2});if(pts.length!==32||pts[0].z===pts[31].z)throw new Error('motion generator failed');
} catch (error) {
  console.error('Build verification failed. Effects Lab core/corpus self-test failed:', error?.message || error);
  process.exit(1);
}

if (!effectsLab.includes("Generated script save failed") || !effectsLab.includes("Script save failed:")) { console.error('Build verification failed. Effects Lab generated-script save rejection recovery is missing.'); process.exit(1); }
if (!modelPro.includes('refreshBrowserForArtSet') || !modelPro.includes('updating viewer…') || !modelPro.includes('preserveLogical') || !modelAutoTest.includes('CASC art-set switch refreshes active viewer automatically')) { console.error('Build verification failed. CASC art-set viewer auto-refresh regression coverage is missing.'); process.exit(1); }
const modelSave = fs.readFileSync(path.join(root, 'app/js/model-save.js'), 'utf8');
if (!modelLab.includes('sy=yl;') || !modelSave.includes('DontInherit { Scaling }') || !modelSave.includes('DontInherit { Rotation }')) { console.error('Build verification failed. DontInherit scale/rotation decomposition or MDL serialization fix is missing.'); process.exit(1); }
console.log('WC3 Asset Studio v1.4 build verification passed.');
