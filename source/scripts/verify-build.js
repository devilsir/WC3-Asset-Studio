'use strict';

const fs = require('fs');
const path = require('path');

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
  'app/js/buttons-studio.js',
  'app/js/sanity.js',
  'app/css/app.css',
  'app/css/model-lab.css',
  'app/THIRD_PARTY_LICENSES.md',
  'assets/icon.ico',
  'assets/file-model.ico',
  'assets/file-texture.ico',
  'tools/casc-reader.ps1',
  'tools/casc-cdn-reader.js'
];

const missing = required.filter(rel => !fs.existsSync(path.join(root, rel)));
if (missing.length) {
  console.error('Build verification failed. Missing required files:');
  for (const rel of missing) console.error(`  - ${rel}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== '1.3.0') {
  console.error(`Build verification failed. package.json version is ${pkg.version}, expected 1.3.0.`);
  process.exit(1);
}

const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
if (!main.includes("const PRODUCT = 'WC3 Asset Studio v1.3'")) {
  console.error('Build verification failed. main.js product version is not v1.3.');
  process.exit(1);
}


const editor = fs.readFileSync(path.join(root, 'app/js/editor.js'), 'utf8');
const modelLab = fs.readFileSync(path.join(root, 'app/js/model-lab.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app/js/app.js'), 'utf8');
const modelHtml = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
const workspaceUi = fs.readFileSync(path.join(root, 'app/js/workspace-ui.js'), 'utf8');
const installerPath = path.resolve(root, '..', 'WC3_Asset_Studio_v1.3.iss');
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
if (!cascCdn.includes('const concurrency = 12;') || !cascCdn.includes('stop as soon as one encoding key can be located')) {
  console.error('Build verification failed. CASC interactive archive-index lookup optimization is missing.');
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
  console.error('Build verification failed. v1.3 workflow suite is incomplete.');
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
const advancedModelSave = fs.readFileSync(path.join(root, 'app/js/model-save.js'), 'utf8');
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
const objectEditorAutoTests = [
  'Warcraft Library entry points + CASC-only FX UI',
  'Object Editor Assets workspace + controls',
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
if (!modelLab.includes('wc3-model-refresh') || !modelPro.includes('wc3-model-refresh')) {
  console.error('Build verification failed. Model Lab pro refresh handshake is missing.');
  process.exit(1);
}
if (!modelPro.includes('window.WC3_MODEL_LAB_PRO=Object.freeze') || !modelPro.includes('buildProjectBlob') || !modelPro.includes('geoOp')) {
  console.error('Build verification failed. v1.3 Pro dry-run/test API is missing.');
  process.exit(1);
}
if (!modelLab.includes('translateSelectedGeoset,scaleSelectedGeoset,rotateSelectedGeoset,cloneSelectedGeoset')) {
  console.error('Build verification failed. Geoset transform hooks required by the automatic test are missing.');
  process.exit(1);
}
const sanityUi = fs.readFileSync(path.join(root, 'app/js/sanity.js'), 'utf8');
if (!sanityUi.includes("document.body.dataset.module!=='sanity'") || !sanityUi.includes("WC3_WORKSPACE_UI?.setActive?.('sanity'") || !modelAutoTest.includes("$('#workspaceSanity')") || !modelAutoTest.includes("Sanity workspace panel is still hidden")) {
  console.error('Build verification failed. Sanity workspace state synchronization / UI coverage is incomplete.');
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
  'WC3 Buttons workspace + all icon variants',
  'WC3 Buttons ZIP exports BLP + TGA with import paths',
  'Sanity Checker engine dry run on serialized model',
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
  '75-step Undo capacity configuration',
  'Warcraft install folder first-run persistence bridge',
  'Feature coverage audit'
];
if (!autoTestChecks.every(x => modelAutoTest.includes(x))) {
  console.error('Build verification failed. v1.3 automatic model-test coverage is incomplete.');
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
const appHtml = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
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
if (!modelLab.includes("captureModelEditSnapshot('Add ParticleEmitter2')") || !modelLab.includes("captureModelEditSnapshot('Add effect attachment')") || !modelLab.includes('pushModelHistorySnapshot(historySnap)')) {
  console.error('Build verification failed. Effect authoring creation is not covered by Undo history.');
  process.exit(1);
}
const indexHtml = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
if (!indexHtml.includes('model-lab-pro.js') || !indexHtml.includes('WC3 Asset Studio v1.3')) {
  console.error('Build verification failed. v1.3 UI/script registration is incomplete.');
  process.exit(1);
}
if (!indexHtml.includes('model-lab-autotest.js') || !indexHtml.includes('modelAutoTestBtn') || !indexHtml.includes('modelAutoTestFileInput') || !indexHtml.includes('modelAutoTestResults')) {
  console.error('Build verification failed. v1.3 automatic model-test UI/script registration is incomplete.');
  process.exit(1);
}

const icon = fs.statSync(path.join(root, 'assets/icon.ico'));
if (icon.size < 1024) {
  console.error('Build verification failed. assets/icon.ico looks invalid.');
  process.exit(1);
}

console.log('WC3 Asset Studio v1.3 build verification passed.');
