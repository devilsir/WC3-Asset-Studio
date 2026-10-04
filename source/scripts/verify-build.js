'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
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
  'app/js/effects-project-model.js',
  'app/js/effects-cfx-adapter.js',
  'app/js/effects-pkb-inspector.js',
  'app/js/effects-pkb-structured-reader.js',
  'app/js/effects-pkb-native-popcorn.js',
  'app/js/effects-pkb-native-compiler.js',
  'app/js/effects-cfx-vm-compiler.js',
  'app/js/effects-cfx-bundle-compiler.js',
  'app/js/effects-compat-corpus.js',
  'app/js/effects-pkb-relocation-domains.js',
  'app/js/effects-pkb-multi-array-transactions.js',
  'app/js/effects-pkb-native-write-plan.js',
  'app/js/effects-pkb-incremental-compiler.js',
  'app/js/effects-math-baker.js',
  'app/js/effects-lab.js',
  'app/js/effects-lab-autotest.js',
  'app/node/effects-warcraft-runtime-test.js',
  'app/css/effects-lab.css',
  'app/js/buttons-studio.js',
  'app/js/sanity.js',
  'app/css/app.css',
  'app/css/model-lab.css',
  'app/THIRD_PARTY_LICENSES.md',
  'app/licenses/W3ModelViewer-MIT.txt',
  'app/EFFECTS_PKB_NATIVE_POPCORN_DECODER.md',
  'app/examples/compat/w3modelviewer/PkBakeFile.cs',
  'app/examples/compat/w3modelviewer/PkRuntime.cs',
  'app/examples/compat/w3modelviewer/PkEffectDef.cs',
  'app/examples/compat/w3modelviewer/PkScript.cs',
  'app/examples/compat/w3modelviewer/LICENSE',
  'app/EFFECTS_CFX_VM_COMPILER.md',
  'app/EFFECTS_BACKEND_AND_LICENSE_AUDIT.md',
  'app/EFFECTS_PKB_CORPUS_RESEARCH.md',
  'app/EFFECTS_PKB_RELOCATION_DOMAINS.md',
  'app/EFFECTS_PKB_MULTI_ARRAY_NATIVE_SYNTHESIS.md',
  'app/EFFECTS_PKB_NATIVE_WRITE_PLAN.md',
  'EFFECTS_PKB_SUBTREE_INCREMENTAL_COMPILER.md',
  'RELEASE_NOTES_v1.5.md',
  'app/node/effects-pkb-backends.js',
  'REMOVE_UNVERIFIED_EFFECTS_TOOLS.ps1',
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
if (pkg.version !== '1.5.0') {
  console.error(`Build verification failed. package.json version is ${pkg.version}, expected 1.5.0.`);
  process.exit(1);
}

const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
if (!main.includes("const PRODUCT = 'WC3 Asset Studio v1.5'")) {
  console.error('Build verification failed. main.js product version is not v1.5.');
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
const effectsProjectModel = fs.readFileSync(path.join(root, 'app/js/effects-project-model.js'), 'utf8');
const effectsCfxAdapter = fs.readFileSync(path.join(root, 'app/js/effects-cfx-adapter.js'), 'utf8');
const effectsPkbInspector = fs.readFileSync(path.join(root, 'app/js/effects-pkb-inspector.js'), 'utf8');
const effectsPkbStructured = fs.readFileSync(path.join(root, 'app/js/effects-pkb-structured-reader.js'), 'utf8');
const effectsPkbNativePopcorn = fs.readFileSync(path.join(root, 'app/js/effects-pkb-native-popcorn.js'), 'utf8');
const effectsPkbNativeCompiler = fs.readFileSync(path.join(root, 'app/js/effects-pkb-native-compiler.js'), 'utf8');
const effectsCfxVmCompiler = fs.readFileSync(path.join(root, 'app/js/effects-cfx-vm-compiler.js'), 'utf8');
const effectsCfxBundleCompiler = fs.readFileSync(path.join(root, 'app/js/effects-cfx-bundle-compiler.js'), 'utf8');
const effectsCompatCorpus = fs.readFileSync(path.join(root, 'app/js/effects-compat-corpus.js'), 'utf8');
const effectsCoreModule = require(path.join(root, 'app/js/effects-lab-core.js'));
const effectsCompatCorpusModule = require(path.join(root, 'app/js/effects-compat-corpus.js'));
const effectsLearnFixtures = require(path.join(root, 'app/js/effects-learn-fixtures.js'));
const effectsBundleCompilerModule = require(path.join(root, 'app/js/effects-cfx-bundle-compiler.js'));
const effectsPkbCorpus = fs.readFileSync(path.join(root, 'app/js/effects-pkb-corpus.js'), 'utf8');
const effectsPkbCorrelation = fs.readFileSync(path.join(root, 'app/js/effects-pkb-correlation.js'), 'utf8');
const effectsPkbExperiments = fs.readFileSync(path.join(root, 'app/js/effects-pkb-experiments.js'), 'utf8');
const effectsPkbSemanticRecords = fs.readFileSync(path.join(root, 'app/js/effects-pkb-semantic-records.js'), 'utf8');
const effectsPkbRecordHierarchy = fs.readFileSync(path.join(root, 'app/js/effects-pkb-record-hierarchy.js'), 'utf8');
const effectsPkbLayout = fs.readFileSync(path.join(root, 'app/js/effects-pkb-layout-decoder.js'), 'utf8');
const effectsPkbDomains = fs.readFileSync(path.join(root, 'app/js/effects-pkb-relocation-domains.js'), 'utf8');
const effectsPkbMulti = fs.readFileSync(path.join(root, 'app/js/effects-pkb-multi-array-transactions.js'), 'utf8');
const effectsPkbNativeWrite = fs.readFileSync(path.join(root, 'app/js/effects-pkb-native-write-plan.js'), 'utf8');
const effectsPkbIncremental = fs.readFileSync(path.join(root, 'app/js/effects-pkb-incremental-compiler.js'), 'utf8');
const effectsMathBaker = fs.readFileSync(path.join(root, 'app/js/effects-math-baker.js'), 'utf8');
const effectsBackends = fs.readFileSync(path.join(root, 'app/node/effects-pkb-backends.js'), 'utf8');
const effectsLab = fs.readFileSync(path.join(root, 'app/js/effects-lab.js'), 'utf8');
const effectsAutoTest = fs.readFileSync(path.join(root, 'app/js/effects-lab-autotest.js'), 'utf8');
const effectsCss = fs.readFileSync(path.join(root, 'app/css/effects-lab.css'), 'utf8');
const effectsRuntimeTest = require(path.join(root, 'app/node/effects-warcraft-runtime-test.js'));
const warcraftMapMpq = require(path.join(root, 'app/node/warcraft-map-mpq.js'));

if (!effectsCfxVmCompiler.includes("SCHEMA='wc3.effects.cfx-vm-compiler'") || !effectsCfxVmCompiler.includes('compileProgram') || !effectsCfxVmCompiler.includes('compileToPkb') || !effectsPkbNativeCompiler.includes('externalRecordRefs')) {
  console.error('Build verification failed. Native CFX → VM compiler or native symbol relinking is incomplete.');
  process.exit(1);
}
if (!effectsCfxBundleCompiler.includes("SCHEMA='wc3.effects.cfx-bundle-compiler'") || !effectsCfxBundleCompiler.includes('function preprocess(') || !effectsCfxBundleCompiler.includes('validateRuntimeProfile') || !effectsCfxBundleCompiler.includes('warcraft-reforged-simple-effect-v1') || !effectsCompatCorpus.includes('compat-nature-tornado') || !effectsCompatCorpus.includes('viewerSourceFiles')) {
  console.error('Build verification failed. Standalone CFX bundle compiler / Warcraft compatibility corpus is incomplete.');
  process.exit(1);
}
if (!effectsLab.includes("id:'blue-orb'") || !effectsLab.includes("id:'lesson-blue-orb-dual'") || !effectsLab.includes('data-pkb-subtab') || !effectsCss.includes('.effects-pkb-subtabs') || !effectsAutoTest.includes('Blue Orb dual Learn keeps the Real Editor and standalone Native PKB on the same effect')) {
  console.error('Build verification failed. Blue Orb dual-workflow Learn lesson or organized PKB Editor subtabs are incomplete.');
  process.exit(1);
}
try {
  const libs=effectsCompatCorpusModule.libraries(),runtimeRows=[];
  for(const id of effectsLearnFixtures.ids){
    const fx=effectsLearnFixtures.create(id),built=effectsBundleCompilerModule.build(fx.bundleFiles,{libraries:libs,name:`${id}_verify.pkb`}),bundleDir=path.join(root,'app/examples/learn',fx.bundleName);
    if(effectsLearnFixtures.VERSION<3||!fs.existsSync(bundleDir)||Object.entries(fx.bundleFiles).some(([name,text])=>!fs.existsSync(path.join(bundleDir,name))||fs.readFileSync(path.join(bundleDir,name),'utf8')!==text)||!built?.verification?.decodeClean||!built?.verification?.runtimeReady||built?.runtimeProfile?.errors?.length||built?.summary?.layers!==3||built?.summary?.samplers!==3||built?.summary?.renderers!==1||built?.summary?.scripts!==7)throw new Error(`Learn runtime fixture/build mismatch: ${id}`);
    if(!/extends EventMultiplier/.test(fx.bundleFiles['code.cfx']||'')||!/extends RootLayerTemplate/.test(fx.bundleFiles['code.cfx']||'')||!/entry "Root" fires &RootLayer\."Signal"/.test(fx.bundleFiles['effect.cfx']||'')||!/sampler sd0 : EventStream/.test(fx.bundleFiles['samplers.cfx']||'')||!String(fx.bundleFiles['functions.cfx']||'').includes('stdlib/templates.cfx'))throw new Error(`Learn runtime topology mismatch: ${id}`);
    runtimeRows.push({id,layers:built.summary.layers,scripts:built.summary.scripts,profile:built.runtimeProfile.profile});
  }
  const fx=effectsLearnFixtures.create('lesson-blue-orb-dual'),pkbPath=path.join(root,'app/examples/learn/learn_blue_orb_dual.pkb');
  if(!fs.existsSync(pkbPath)||!fs.readFileSync(pkbPath).equals(Buffer.from(fx.bytes)))throw new Error('Blue Orb Real Editor PKB teaching fixture changed unexpectedly');
  if(!(fx.curveStructure?.curveGroups||[]).some(x=>x.channels?.includes('size'))||!(fx.curveStructure?.curveGroups||[]).some(x=>x.channels?.includes('alpha')))throw new Error('Blue Orb Real Editor fixture is missing Size/Alpha curve mappings');
  if(runtimeRows.length!==effectsLearnFixtures.ids.length)throw new Error('Learn runtime fixture matrix is incomplete');
} catch (error) {
  console.error('Build verification failed. Learn runtime/dual-workflow self-test failed:', error?.message || error);
  process.exit(1);
}
try {
  const sandbox={console,setTimeout,clearTimeout,window:{WC3_EFFECTS_CORE:effectsCoreModule,WC3_EFFECTS_LEARN_FIXTURES:effectsLearnFixtures,WC3_EFFECTS_COMPAT_CORPUS:effectsCompatCorpusModule,WC3_EFFECTS_CFX_BUNDLE_COMPILER:effectsBundleCompilerModule},document:{readyState:'loading',addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];}},requestAnimationFrame(){return 0;},cancelAnimationFrame(){}};
  sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;vm.createContext(sandbox);vm.runInContext(effectsLab,sandbox,{filename:'effects-lab.js'});
  const lab=sandbox.window.WC3_EFFECTS_LAB,presets=lab?.getExamplePresets?.()||[],rows=[];
  if(presets.length<11)throw new Error(`Built-in Effects example gallery is incomplete: ${presets.length}`);
  for(const preset of presets){
    const files=lab.getExampleBundle(preset.id),built=effectsBundleCompilerModule.build(files,{libraries:effectsCompatCorpusModule.libraries(),name:`${preset.id}_verify.pkb`});
    if(!/extends EventMultiplier/.test(files?.['code.cfx']||'')||!/extends RootLayerTemplate/.test(files?.['code.cfx']||'')||!/entry "Root" fires &RootLayer\."Signal"/.test(files?.['effect.cfx']||'')||!/sampler sd0 : EventStream/.test(files?.['samplers.cfx']||'')||!String(files?.['functions.cfx']||'').includes('stdlib/templates.cfx'))throw new Error(`Built-in example runtime topology mismatch: ${preset.id}`);
    if(!built.verification.decodeClean||!built.verification.runtimeReady||built.runtimeProfile?.errors?.length||built.summary.layers!==3||built.summary.renderers!==1)throw new Error(`Built-in example Full Build/runtime gate failed: ${preset.id}`);
    rows.push({id:preset.id,layers:built.summary.layers,scripts:built.summary.scripts,profile:built.runtimeProfile.profile});
  }
  if(rows.length!==presets.length)throw new Error('Built-in example runtime matrix is incomplete');
} catch (error) {
  console.error('Build verification failed. Built-in Effects runtime-profile matrix failed:', error?.message || error);
  process.exit(1);
}
if (!modelHtml.includes('effectsCfxVmCompilerSection') || !modelHtml.includes('effectsCfxVmSource') || !effectsLab.includes('previewNativeCfxVmCompile')) {
  console.error('Build verification failed. CFX → VM compiler UI is incomplete.');
  process.exit(1);
}
if (!main.includes("wc3-effects:test-in-warcraft") || !main.includes('Map file (.w3m / .w3x)') || !preload.includes('testInWarcraft:') || !modelHtml.includes('effectsWarcraftTestBtn') || !modelHtml.includes('packed MPQ or unpacked folder') || !effectsLab.includes('testCurrentEffectInWarcraft') || !effectsAutoTest.includes('Warcraft III runtime test UI builds, injects and launches through the one-click bridge')) {
  console.error('Build verification failed. Warcraft III one-click Effects Lab runtime-test pipeline is incomplete.');
  process.exit(1);
}
try {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wc3as-effects-runtime-')),source=path.join(tmp,'Source.w3x'),dest=path.join(tmp,'Runtime.w3x');
  fs.mkdirSync(source,{recursive:true});
  fs.writeFileSync(path.join(source,'war3map.lua'),'function main()\nend\n','utf8');
  fs.writeFileSync(path.join(source,'war3map.w3i'),Buffer.alloc(16));
  const prepared=effectsRuntimeTest.prepareRuntimeMap({sourceMapPath:source,destinationMapPath:dest,pkbData:Uint8Array.from([0x11,0x0b,0x00,0xca,2,5,1,1]),effectName:'verify'});
  const carrier=fs.readFileSync(path.join(dest,'wc3asset','test_carrier.mdx')),script=fs.readFileSync(path.join(dest,'war3map.lua'),'utf8');
  if(prepared.mapKind!=='unpacked'||prepared.spawnMode!=='camera-target'||prepared.spawnDelaySeconds!==0.75||prepared.spawnAssetKind!=='pkb-direct'||prepared.spawnAssetVirtualPath!=='wc3asset\\test_effect.pkb'||!prepared.runtimeMapPath.endsWith('Runtime.w3x')||!fs.existsSync(path.join(dest,'wc3asset','test_effect.pkb'))||!fs.existsSync(path.join(dest,'wc3asset','test_effect.pkfx'))||!fs.readFileSync(path.join(dest,'wc3asset','test_effect.pkb')).equals(fs.readFileSync(path.join(dest,'wc3asset','test_effect.pkfx')))||carrier.subarray(0,4).toString('ascii')!=='MDLX'||carrier.indexOf(Buffer.from('CORN'))<0||carrier.indexOf(Buffer.from('wc3asset\\test_effect.pkfx'))<0||!script.includes(effectsRuntimeTest.LUA_MARKER)||!script.includes('AddSpecialEffect("wc3asset\\\\test_effect.pkb"')||!script.includes('FX HERE')||!script.includes('PingMinimapEx'))throw new Error('Unpacked runtime map direct-PKB injection/spawn-marker generation failed');
  const cornAt=carrier.indexOf(Buffer.from('CORN'));if(cornAt<0||carrier.readUInt32LE(cornAt+104)!==0x1000||prepared.cornEffectPath!=='wc3asset\\test_effect.pkfx')throw new Error('CORN carrier must use ParticleEmitter node flags and a .pkfx source path that resolves to the injected .pkb bake');
  if(effectsRuntimeTest.parseWarcraftPreferences('hd=0\n').mode!=='classic'||effectsRuntimeTest.parseWarcraftPreferences('[Video]\nhd=1\n').mode!=='reforged'||effectsRuntimeTest.parseWarcraftPreferences('texquality=2\n').mode!=='unknown')throw new Error('Warcraft graphics-mode preference parser failed');
  const jass=effectsRuntimeTest.patchMapScript('function main takes nothing returns nothing\n    call MeleeInitVictoryDefeat()\nendfunction\n','jass');
  if(!jass.includes(effectsRuntimeTest.JASS_MARKER)||!jass.includes('TimerStart')||!jass.includes('FX HERE')||!jass.includes('PingMinimapEx')||/^\s*call\s+MeleeInitVictoryDefeat\s*\(\s*\)\s*$/im.test(jass))throw new Error('JASS runtime bootstrap/spawn marker/victory suppression generation failed');
  if(warcraftMapMpq.hashString('(hash table)',3)!==0xc3af3770||warcraftMapMpq.hashString('(block table)',3)!==0xec83b3a3)throw new Error('MPQ Storm hash implementation failed known-vector verification');
  const pkb=Buffer.from([0x11,0x0b,0x00,0xca,9,8,7,6]);
  for(const spec of [{ext:'.w3m',script:'war3map.j',body:'function main takes nothing returns nothing\n'+'call BJDebugMsg(\"runtime verify\")\n'.repeat(800)+'endfunction\n',marker:effectsRuntimeTest.JASS_MARKER,compression:'zlib-sectors'},{ext:'.w3x',script:'war3map.lua',body:'function main()\n'+'print(\"runtime verify\")\n'.repeat(800)+'end\n',marker:effectsRuntimeTest.LUA_MARKER,compression:'zlib-single'}]){
    const packedSource=path.join(tmp,'PackedSource'+spec.ext),packedDest=path.join(tmp,'PackedRuntime'+spec.ext);
    const archive=warcraftMapMpq.buildArchive({[spec.script]:Buffer.from(spec.body), 'war3map.w3i':Buffer.alloc(32), 'war3map.w3e':Buffer.alloc(32), 'custom\\keep.bin':Buffer.from([4,3,2,1])},{hashTableSize:16,compression:spec.compression});
    const prefixed=Buffer.concat([Buffer.alloc(512,0x5a),archive]);
    fs.writeFileSync(packedSource,prefixed);
    const before=fs.readFileSync(packedSource),valid=effectsRuntimeTest.validateMap(packedSource);
    if(!valid.ok||valid.kind!=='packed'||valid.extension!==spec.ext||valid.language!==(spec.script.endsWith('.j')?'jass':'lua')||valid.archiveHeaderOffset!==512)throw new Error(`Packed ${spec.ext} validation failed`);
    const built=effectsRuntimeTest.prepareRuntimeMap({sourceMapPath:packedSource,destinationMapPath:packedDest,pkbData:pkb,effectName:`verify-${spec.ext}`});
    if(built.mapKind!=='packed'||built.mapExtension!==spec.ext||built.runtimeMapPath!==packedDest||!fs.existsSync(packedDest))throw new Error(`Packed ${spec.ext} runtime path failed`);
    if(!fs.readFileSync(packedSource).equals(before))throw new Error(`Packed ${spec.ext} source map was modified`);
    const opened=warcraftMapMpq.open(fs.readFileSync(packedDest)),gotPkb=warcraftMapMpq.readFile(opened,'wc3asset\\test_effect.pkb'),gotPkfx=warcraftMapMpq.readFile(opened,'wc3asset\\test_effect.pkfx'),gotCarrier=warcraftMapMpq.readFile(opened,'wc3asset\\test_carrier.mdx'),gotScript=warcraftMapMpq.readFile(opened,spec.script),kept=warcraftMapMpq.readFile(opened,'custom\\keep.bin');
    if(!gotPkb?.equals(pkb)||!gotPkfx?.equals(pkb)||gotCarrier?.subarray(0,4).toString('ascii')!=='MDLX'||gotCarrier.indexOf(Buffer.from('wc3asset\\test_effect.pkfx'))<0||!gotScript?.toString('utf8').includes(spec.marker)||!gotScript?.toString('utf8').includes('wc3asset\\\\test_effect.pkb')||!kept?.equals(Buffer.from([4,3,2,1])))throw new Error(`Packed ${spec.ext} MPQ direct-PKB injection verification failed`);
  }
  const unpackedW3m=path.join(tmp,'UnpackedSource.w3m');fs.mkdirSync(unpackedW3m,{recursive:true});fs.writeFileSync(path.join(unpackedW3m,'war3map.j'),'function main takes nothing returns nothing\nendfunction\n');fs.writeFileSync(path.join(unpackedW3m,'war3map.w3i'),Buffer.alloc(16));
  const unpackedInfo=effectsRuntimeTest.validateMap(unpackedW3m);if(!unpackedInfo.ok||unpackedInfo.kind!=='unpacked'||unpackedInfo.extension!=='.w3m'||effectsRuntimeTest.runtimeMapExtension(unpackedW3m)!=='.w3m')throw new Error('Unpacked .w3m detection failed');
  const fakeInstall=path.join(tmp,'Warcraft III'),fakeExe=path.join(fakeInstall,'x86_64','Warcraft III.exe');fs.mkdirSync(path.dirname(fakeExe),{recursive:true});fs.writeFileSync(fakeExe,'');
  if(effectsRuntimeTest.findWarcraftExe(fakeInstall)!==fakeExe)throw new Error('Warcraft III executable detection failed');
  fs.rmSync(tmp,{recursive:true,force:true});

} catch (error) {
  console.error('Build verification failed. Warcraft III runtime-test self-test failed:', error?.message || error);
  process.exit(1);
}
try {
  const checkDescriptor=(id,files)=>{
    const descriptor=effectsCoreModule.buildLivePreviewDescriptor(effectsCoreModule.parseBundle(files));
    if(!descriptor.emitters.length)throw new Error(`${id}: no preview emitters`);
    for(const emitter of descriptor.emitters){
      if(!Array.isArray(emitter.color)||emitter.color.length!==4||!emitter.color.every(Number.isFinite)||emitter.color[3]<=0)throw new Error(`${id}: preview color is transparent/non-finite`);
      if(!Array.isArray(emitter.velocity)||!emitter.velocity.every(Number.isFinite)||Math.max(...emitter.velocity.map(v=>Math.abs(v)))>=100)throw new Error(`${id}: preview velocity leaked non-literal source numbers`);
      if(!Array.isArray(emitter.position)||!emitter.position.every(Number.isFinite))throw new Error(`${id}: preview position is non-finite`);
    }
    return descriptor;
  };
  const synthetic={...effectsCoreModule.blankBundle(),'code.cfx':`layer PreviewLayer {
    properties { Renderers = [&Glow]; metaData; }
    root auto;
    init {
      self.invLife = rcp(2);
      EmissionRate = 12;
      Size = rand(0.3, 0.5);
      Position = coord_space.world_base_position();
      Velocity = physicsNode_6152.output * #f32x3(1, 2, 3);
      Color = hueSampler3.sample(self.lifeRatio);
    }
  }`,'renderers.cfx':`renderer Glow : Billboard { EnableRendering = true; Transparent.Type = Additive; }`};
  const syntheticDescriptor=checkDescriptor('synthetic-nonliteral',synthetic),syntheticEmitter=syntheticDescriptor.emitters[0];
  if(Math.abs(syntheticEmitter.size-.4)>1e-6||syntheticEmitter.color.join(',')!=='1,1,1,1'||syntheticEmitter.velocity.join(',')!=='0,0,0.7')throw new Error('Non-literal preview fallback regression');
  for(const row of effectsCompatCorpusModule.list())checkDescriptor(row.id,effectsCompatCorpusModule.bundle(row.id));
  for(const id of effectsLearnFixtures.ids){
    const fx=effectsLearnFixtures.create(id);
    checkDescriptor(id,fx.bundleFiles);
  }
} catch (error) {
  console.error('Build verification failed. Effects preview/Motion Debug compatibility self-test failed:', error?.message || error);
  process.exit(1);
}
const installerPath = path.resolve(root, '..', 'WC3_Asset_Studio_v1.5.iss');
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
if (!installerText.includes('#define MyAppVersion \"1.5\"') || !installerText.includes('VersionInfoVersion=1.5.0.0') || !installerText.includes('OutputBaseFilename=WC3 Asset Studio v1.5 Setup')) {
  console.error('Build verification failed. v1.5 installer metadata is incomplete.');
  process.exit(1);
}
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
  console.error('Build verification failed. v1.5 workflow suite is incomplete.');
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
if (!effectsUiMarkup.includes('IMPORT / EXPORT') || !effectsUiMarkup.includes('PKB BACKEND') || !effectsUiMarkup.includes('NATIVE IR') || !effectsUiMarkup.includes('Effects backend status will appear here.')) {
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
  console.error('Build verification failed. v1.5 Pro dry-run/test API is missing.');
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
  console.error('Build verification failed. Sanity Smart Auto Fix pipeline / result tabs / standalone texture resolver pipeline is incomplete.');
  process.exit(1);
}
const preloadJs = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
if (!preloadJs.includes("saveBinary:") || !preloadJs.includes("wc3-file:save-binary") || !main.includes("function saveBinaryFile") || !main.includes("function bindDownloadHandler") || !main.includes("removeListener('will-download'") || !main.includes("ipcMain.handle('wc3-file:save-binary'")) {
  console.error('Build verification failed. Native single-save bridge / idempotent download handler is incomplete.');
  process.exit(1);
}
if ((modelAutoTest.match(/await test\(/g)||[]).length < 168) {
  console.error('Build verification failed. v1.5 automatic model suite coverage unexpectedly dropped below 168 tests.');
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
  'Effects Lab live CFX preview descriptor + particle simulation',
  'Effects Lab live preview CASC texture decode contract',
  '75-step Undo capacity configuration',
  'Warcraft install folder first-run persistence bridge',
  'Feature coverage audit'
];
if (!autoTestChecks.every(x => modelAutoTest.includes(x))) {
  console.error('Build verification failed. v1.5 automatic model-test coverage is incomplete.');
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
const smartAutoFixWipUi = indexHtml.includes('<div class="sanity-fix-note"><strong>Smart Auto Fix</strong><span>Still in work, may contain unknown bugs</span></div>');
if (!indexHtml.includes('sanityFixBtn') || !indexHtml.includes('sanityConservativeFixes') || !smartAutoFixWipUi || indexHtml.includes('Smart Auto Fix v4.1') || !indexHtml.includes('Auto Fix Models') || !indexHtml.includes('model-lab-pro.js') || !indexHtml.includes('WC3 Asset Studio v1.5')) {
  console.error('Build verification failed. v1.5 UI/script registration is incomplete.');
  console.error(`  Smart Auto Fix WIP UI: ${smartAutoFixWipUi ? 'OK' : 'MISSING'}`);
  process.exit(1);
}
if (!indexHtml.includes('model-lab-autotest.js') || !indexHtml.includes('modelAutoTestBtn') || !indexHtml.includes('modelAutoTestFileInput') || !indexHtml.includes('modelAutoTestResults')) {
  console.error('Build verification failed. v1.5 automatic model-test UI/script registration is incomplete.');
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


const effectsResourceExe = extraResources.some(x => String(x?.from||'').startsWith('tools/effects-lab/effects-runtime'));
const effectsResourceLib = extraResources.some(x => String(x?.from||'').startsWith('tools/effects-lab/cfxlib'));
const effectsResourceDesigner = extraResources.some(x => String(x?.from||'').startsWith('tools/effects-lab/effect-designer'));
const unverifiedEffectsExcluded = !effectsResourceExe && !effectsResourceLib && !effectsResourceDesigner;
if (!unverifiedEffectsExcluded) {
  console.error('Build verification failed. Unverified Effects Lab third-party binaries/libraries are still packaged in extraResources.');
  process.exit(1);
}
if (!effectsBackends.includes('No PKB backend is configured') || !effectsBackends.includes('CornSyrup') || !effectsBackends.includes('development-only')) {
  console.error('Build verification failed. Pluggable external PKB backend isolation is incomplete.');
  process.exit(1);
}
const effectsChecks = {
  workspaceTab: modelHtml.includes('id="workspaceEffects"') && modelHtml.includes('id="effectsLabPanels"'),
  scripts: modelHtml.includes('effects-lab-core.js') && modelHtml.includes('effects-project-model.js') && modelHtml.includes('effects-cfx-adapter.js') && modelHtml.includes('effects-pkb-inspector.js') && modelHtml.includes('effects-pkb-structured-reader.js') && modelHtml.includes('effects-pkb-native-popcorn.js') && modelHtml.includes('effects-pkb-native-compiler.js') && modelHtml.includes('effects-cfx-vm-compiler.js') && modelHtml.includes('effects-pkb-corpus.js') && modelHtml.includes('effects-pkb-correlation.js') && modelHtml.includes('effects-pkb-experiments.js') && modelHtml.includes('effects-pkb-semantic-records.js') && modelHtml.includes('effects-pkb-record-hierarchy.js') && modelHtml.includes('effects-pkb-layout-decoder.js') && modelHtml.includes('effects-pkb-relocation-domains.js') && modelHtml.includes('effects-pkb-multi-array-transactions.js') && modelHtml.includes('effects-pkb-native-write-plan.js') && modelHtml.includes('effects-pkb-incremental-compiler.js') && modelHtml.includes('effects-math-baker.js') && modelHtml.includes('effects-lab.js') && modelHtml.includes('effects-lab-autotest.js') && modelHtml.includes('effects-lab.css'),
  autoTestUi: modelHtml.includes('id="effectsAutoTestBtn"') && modelHtml.includes('id="effectsAutoTestStatus"') && effectsCss.includes('.effects-test-status'),
  workspaceRouting: workspaceUi.includes("effects: 'Effects Lab'") && workspaceUi.includes("module === 'effects'") && workspaceUi.includes("WC3_EFFECTS_LAB?.prepare"),
  preload: preload.includes("exposeInMainWorld('WC3_EFFECTS'") && preload.includes("wc3-effects:decompile") && preload.includes("wc3-effects:build") && preload.includes('chooseBackend:') && preload.includes('clearBackend:') && preload.includes('selfTest:') && preload.includes('choosePkbCorpus:'),
  mainIpc: main.includes("ipcMain.handle('wc3-effects:status'") && main.includes("ipcMain.handle('wc3-effects:decompile'") && main.includes("ipcMain.handle('wc3-effects:build'") && main.includes("ipcMain.handle('wc3-effects:choose-backend'") && main.includes("ipcMain.handle('wc3-effects:self-test'") && main.includes("ipcMain.handle('wc3-effects:choose-pkb-corpus'"),
  effectsRuntime: main.includes('createEffectsBackendManager') && main.includes("effectsBackendManager.run('decompile'") && main.includes("effectsBackendManager.run('build'") && effectsBackends.includes('external-cli') && effectsBackends.includes('CORNSYRUP_CLI') && effectsBackends.includes('thirdPartyBundled:false'),
  thirdPartyExcluded: unverifiedEffectsExcluded,
  nativeProjectModel: effectsProjectModel.includes("SCHEMA='wc3.effects.project'") && effectsProjectModel.includes('curves:[]') && effectsProjectModel.includes('inspections:') && effectsCfxAdapter.includes("ID='cornsyrup-cfx'") && effectsLab.includes('projectModel') && effectsLab.includes('exportCfxAdapterFiles'),
  pkbResearch: effectsPkbInspector.includes("wc3.effects.pkb-inspection") && effectsPkbInspector.includes('function inspect(') && effectsPkbInspector.includes('function compare(') && effectsPkbInspector.includes('dependencyRequests') && effectsLab.includes('inspectSelectedCorn') && effectsLab.includes('exportPkbDependencies') && modelHtml.includes('effectsPkbInspectorSection') && modelHtml.includes('effectsInspectPkbBtn') && modelHtml.includes('effectsComparePkbBtn'),
  nativePopcornDecoder: effectsPkbNativePopcorn.includes("SCHEMA='wc3.effects.native-popcorn'") && effectsPkbNativePopcorn.includes('0xCA000B11') && effectsPkbNativePopcorn.includes("project:'W3ModelViewer'") && effectsPkbNativePopcorn.includes("license:'MIT'") && effectsPkbNativePopcorn.includes('function decodeScript(') && effectsPkbNativePopcorn.includes('function decodeEffect(') && effectsLab.includes('renderNativePopcorn') && effectsLab.includes('decodeNativePopcorn') && effectsProjectModel.includes('nativePopcorn') && modelHtml.includes('effectsNativePopcornSection') && modelHtml.includes('effectsNativePopcornVm') && fs.readFileSync(path.join(root,'app/THIRD_PARTY_LICENSES.md'),'utf8').includes('W3ModelViewer — Darithos'),
  structuredPkb: effectsPkbStructured.includes("SCHEMA='wc3.effects.pkb-structure'") && effectsPkbStructured.includes('function rebuildLossless(') && effectsPkbStructured.includes('function verifyLossless(') && effectsPkbStructured.includes('function diffAgainst(') && effectsPkbStructured.includes('function patchSameLength(') && effectsPkbStructured.includes('function patchScalarSameLength(') && effectsPkbStructured.includes('function createPatchPlan(') && effectsPkbStructured.includes('function applyPatchPlan(') && effectsLab.includes('verifyStructuredPkb') && modelHtml.includes('effectsVerifyPkbStructureBtn') && modelHtml.includes('effectsPkbSegments') && modelHtml.includes('effectsPkbSemanticHints'),
  corpusDecoderV3: effectsPkbCorpus.includes("SCHEMA='wc3.effects.pkb-corpus'") && effectsPkbCorpus.includes('function scanEntries(') && effectsPkbCorpus.includes('function buildRegistry(') && effectsPkbCorpus.includes('function compareFiles(') && effectsPkbStructured.includes('function applyRegistry(') && effectsPkbStructured.includes('function patchStringSameLength(') && effectsPkbCorrelation.includes("SCHEMA='wc3.effects.pkb-correlation'") && effectsPkbCorrelation.includes('function comparePair(') && effectsPkbCorrelation.includes('function analyzeCorpus(') && effectsPkbExperiments.includes("SCHEMA='wc3.effects.pkb-field-experiments'") && effectsPkbExperiments.includes('function findNearTwins(') && effectsPkbExperiments.includes('function controlledExperiment(') && effectsPkbExperiments.includes('function buildCatalog(') && effectsPkbSemanticRecords.includes("SCHEMA='wc3.effects.pkb-semantic-records'") && effectsPkbSemanticRecords.includes('function buildRecords(') && effectsPkbSemanticRecords.includes('function createRecordPatch(') && effectsPkbRecordHierarchy.includes("SCHEMA='wc3.effects.pkb-record-hierarchy'") && effectsPkbRecordHierarchy.includes('function buildHierarchy(') && effectsPkbRecordHierarchy.includes('function scanPointers(') && effectsPkbRecordHierarchy.includes('function inferRecordArrays(') && effectsPkbRecordHierarchy.includes('function inferPointerTables(') && effectsLab.includes('buildRecordHierarchy') && modelHtml.includes('effectsRecordHierarchyDecoder') && effectsLab.includes('scanLocalPkbCorpus') && effectsLab.includes('scanCascPkbCorpus') && effectsLab.includes('correlateCorpusSelection') && effectsLab.includes('findCorpusNearTwins') && effectsLab.includes('runControlledFieldExperiment') && effectsLab.includes('confirmControlledFieldMapping') && effectsLab.includes('applyConfirmedFieldPatch') && modelHtml.includes('effectsPkbCorpusSection') && modelHtml.includes('effectsRegistryApplyBtn') && modelHtml.includes('effectsCorpusCompareBtn') && modelHtml.includes('effectsCorrelationCandidateSelect') && modelHtml.includes('effectsControlledFieldLab') && modelHtml.includes('effectsExperimentCandidateSelect'),
  structuralLayoutV6: effectsPkbLayout.includes("SCHEMA='wc3.effects.pkb-structural-layout'") && effectsPkbLayout.includes('function buildLayout(') && effectsPkbLayout.includes('function buildRecordDescriptors(') && effectsPkbLayout.includes('function buildOwnership(') && effectsPkbLayout.includes('function buildArrayDescriptors(') && effectsPkbLayout.includes('function buildHeaderCandidates(') && effectsPkbLayout.includes('function createRelocationPlan(') && effectsPkbLayout.includes('function applyRelocationPlan(') && effectsLab.includes('buildStructuralLayout') && effectsLab.includes('previewShadowRelocation') && modelHtml.includes('effectsStructuralLayoutDecoder') && modelHtml.includes('effectsPreviewRelocationBtn'),

  relocationDomainsV7: effectsPkbDomains.includes("SCHEMA='wc3.effects.pkb-relocation-domains'") && effectsPkbDomains.includes("TX_SCHEMA='wc3.effects.pkb-domain-transaction'") && effectsPkbDomains.includes('function buildDomains(') && effectsPkbDomains.includes('function arrayMutationEligibility(') && effectsPkbDomains.includes('function createArrayMutationPlan(') && effectsPkbDomains.includes('function applyArrayMutationPlan(') && effectsLab.includes('buildRelocationDomains') && effectsLab.includes('previewDomainTransaction') && effectsLab.includes('saveDomainTransactionPkb') && modelHtml.includes('effectsBuildRelocationDomainsBtn') && modelHtml.includes('effectsPreviewDomainTransactionBtn'),
  multiArrayDomainsV8: effectsPkbMulti.includes("SCHEMA='wc3.effects.pkb-multi-array-domains'") && effectsPkbMulti.includes("TX_SCHEMA='wc3.effects.pkb-multi-array-transaction'") && effectsPkbMulti.includes("SYNTH_SCHEMA='wc3.effects.pkb-native-record-synthesis'") && effectsPkbMulti.includes('function buildDomains(') && effectsPkbMulti.includes('function synthesizeNativeRecord(') && effectsPkbMulti.includes('function createTransactionPlan(') && effectsPkbMulti.includes('function applyTransactionPlan(') && effectsLab.includes('buildMultiArrayDomains') && effectsLab.includes('previewMultiArrayTransaction') && effectsLab.includes('saveMultiArrayTransactionPkb') && modelHtml.includes('effectsBuildMultiDomainsBtn') && modelHtml.includes('effectsPreviewMultiTransactionBtn') && effectsProjectModel.includes('multiArrayDomains') && effectsProjectModel.includes('nativeRecordSynthesis'),
  nativeSubtreeIncrementalV10: effectsPkbNativeWrite.includes("SCHEMA='wc3.effects.pkb-native-write-plan'") && effectsPkbNativeWrite.includes('function graphSubtrees(') && effectsPkbNativeWrite.includes('function chooseSubtreeTemplates(') && effectsPkbNativeWrite.includes('function buildSubtreePlan(') && effectsPkbMulti.includes('function createBatchTransactionPlan(') && effectsPkbIncremental.includes("SCHEMA='wc3.effects.pkb-incremental-compiler'") && effectsPkbIncremental.includes('function analyze(') && effectsPkbIncremental.includes('function buildPlan(') && effectsPkbIncremental.includes('function applyPlan(') && effectsLab.includes('buildNativeWritePlan') && effectsLab.includes('onNativeGraphChanged') && modelHtml.includes('effectsNativeWritePlanSection') && modelHtml.includes('effectsIncrementalCompilerSection') && effectsProjectModel.includes('incrementalCompiler'),
  curveBaker: effectsMathBaker.includes('bakeMathXYZ') && effectsMathBaker.includes('bakeColor') && effectsMathBaker.includes('bakeShape') && effectsMathBaker.includes('simplify') && effectsLab.includes('bakeCurrentSource') && effectsLab.includes('installBakeCurveEditor') && modelHtml.includes('effectsBakeCurveBtn') && modelHtml.includes('effectsBakeCurveCanvas'),
  nativeProjectPersistence: main.includes('wc3-effects:choose-native-project') && main.includes('wc3-effects:save-native-project') && preload.includes('chooseNativeProject:') && preload.includes('saveNativeProject:') && effectsLab.includes('openNativeProject') && effectsLab.includes('saveNativeProject'),
  epf: effectsCore.includes('parseEpf') && effectsCore.includes('serializeIni') && effectsCore.includes('generateEffectScript'),
  cfx: effectsCore.includes('CORE_BUNDLE_FILES') && effectsCore.includes('OPTIONAL_BUNDLE_FILES') && effectsCore.includes('parseEventsCfx') && effectsCore.includes('bundleFileList') && effectsCore.includes('balancedBlocks') && effectsCore.includes('rendererSummary') && effectsCore.includes('rendererPreviewSpec') && effectsCore.includes('layerPreviewSpec') && effectsCore.includes('buildLivePreviewDescriptor'),
  ui: effectsLab.includes('renderGraph') && effectsLab.includes('renderSamplers') && effectsLab.includes('renderRenderers') && effectsLab.includes('effectsOpenEpfBtn') && effectsLab.includes('snapshotState') && effectsLab.includes('restoreState') && modelHtml.includes('effectsPreviewCard') && modelHtml.includes('data-effects-preview-mode="live"') && modelHtml.includes('effectsPreviewReloadTexturesBtn') && modelHtml.includes('effectsHelpDialog') && modelHtml.includes('effectsCascPickerDialog') && modelHtml.includes('effectsBrowseCascBtn') && modelHtml.includes('effectsInspectorTabs'),
  layoutReflow: effectsLab.includes('motionCanvasLayout') && effectsLab.includes('scheduleEffectsLayoutRefresh') && effectsLab.includes('ResizeObserver') && effectsLab.includes('Effects preview layout synchronized'),
  dedicatedSuite: effectsAutoTest.includes('WC3_EFFECTS_AUTOTEST') && effectsAutoTest.includes('CFX sampler declaration syntax matrix') && effectsAutoTest.includes('Motion preview reflows after workspace hide / show') && effectsAutoTest.includes('Live preview descriptor parses renderer atlas blend and layer lifetime') && effectsAutoTest.includes('Live Effect preview resolves and decodes renderer texture through CASC') && effectsAutoTest.includes('Live Effect missing CASC texture keeps particle fallback alive') && effectsAutoTest.includes('Live Effect camera reset and hidden workspace suspend animation loop') && effectsAutoTest.includes('PKB decompile mocked workflow') && effectsAutoTest.includes('Generated script Save busy guard prevents duplicate writes') && effectsAutoTest.includes('Generated script Save cancel/error-safe recovery') && effectsAutoTest.includes('Effects Lab UI uses neutral runtime branding') && (effectsAutoTest.includes('Configured PKB backend live self-test') || effectsAutoTest.includes('PKB backend live self-test') || effectsAutoTest.includes('Packaged effects backend live self-test')) && effectsAutoTest.includes('Designer UX uses scoped inspector, help dialog and large collapsed preview') && effectsAutoTest.includes('Designer CASC resource picker searches Warcraft storage and writes selected EPF path') && effectsAutoTest.includes('Live preview descriptor prunes stale texture cache between bundles') && effectsAutoTest.includes("await lab.refreshToolStatus()") && effectsAutoTest.includes("Backend status refresh after tests failed") && effectsAutoTest.includes("Healthy PKB backend is not reported READY") && effectsAutoTest.includes('Live Effect and Motion Debug share viewer + generated-code chrome') && effectsAutoTest.includes('All built-in Examples and Learn effects actually render particles in Live Viewer and Motion Debug') && effectsAutoTest.includes('Live renderer structured editor add/configure/disable/duplicate/delete synchronizes CFX + preview') && effectsAutoTest.includes('Live renderer CASC picker writes texture path and refreshes structured editor') && effectsAutoTest.includes('Renderers tab + Effect / Duplicate / Delete actions share live renderer state') && effectsAutoTest.includes('Import / Export adapter overview metrics + file-chip navigation') && effectsAutoTest.includes('CFX Graph seeds native nodes / edges and graph selection persists') && effectsAutoTest.includes('All six Effects authoring tabs retain functional controls after round-trip') && effectsAutoTest.includes('PKB Inspector extracts embedded Warcraft dependencies without a compiler backend') && effectsAutoTest.includes('PKB Round-trip Analyzer distinguishes exact and modified binaries') && effectsAutoTest.includes('Math Baker samples and simplifies editable XYZ curves') && effectsAutoTest.includes('Effects Lab curve bake action stores native curve and renders editable channel') && effectsAutoTest.includes('Native .wc3fx open/save bridge surface is exposed') && effectsAutoTest.includes('Structured PKB Reader maps 100% of bytes and rebuilds byte-identical') && effectsAutoTest.includes('Structured PKB same-length patch keeps unknown bytes and maps changed regions') && effectsAutoTest.includes('PKB Corpus Scanner clusters repeated semantic fingerprints without auto-confirming evidence') && effectsAutoTest.includes('PKB Structure Registry manual confirmation gates lossless string editing') && effectsAutoTest.includes('PKB Structured Diff v2 compares semantic fingerprints across corpus files') && effectsAutoTest.includes('Effects Lab CASC PKB corpus scanner searches effect paths and reads batches') && effectsAutoTest.includes('v1.5 PKB Field Correlation locates aligned numeric candidates in controlled pairs') && effectsAutoTest.includes('v1.5 corpus correlation promotes repeated numeric offsets only to probable') && effectsAutoTest.includes('v1.5 Structured Reader scalar writer requires confirmed evidence and preserves outside bytes') && effectsAutoTest.includes('v1.5 PKB patch plan applies multiple confirmed fixed-width fields atomically') && effectsAutoTest.includes('v1.5 confirmed field experiment previews a bounded PKB patch before save') && effectsAutoTest.includes('v1.5 Near-Twin Finder ranks sparse same-size PKB deltas') && effectsAutoTest.includes('v1.5 Controlled Field Lab maps known Size A→B values to binary candidate') && effectsAutoTest.includes('v1.5 semantic field catalog promotes repeated controlled matches only to probable') && effectsAutoTest.includes('v1.5 Effects Lab controlled experiment confirms mapping and unlocks bounded writer') && effectsAutoTest.includes('Math color presets actually use Color A / Color B palette') && effectsAutoTest.includes('Color A / Color B UI writes palette used by live math renderer') && effectsAutoTest.includes('v1.5 Semantic Record Decoder groups confirmed scalar fields into Emitter / Renderer records') && effectsAutoTest.includes('v1.5 Semantic Record patch requires record confirmation and preserves unknown gaps') && effectsAutoTest.includes('v1.5 Semantic Record Decoder UI and native project persistence are mounted') && effectsAutoTest.includes('v1.5 Record Hierarchy Decoder resolves absolute and relative pointers between confirmed records') && effectsAutoTest.includes('v1.5 Record Hierarchy infers arrays, pointer tables and count candidates without auto-confirming') && effectsAutoTest.includes('v1.5 Record Hierarchy manual confirmation requires validation notes') && effectsAutoTest.includes('v1.5 Record Hierarchy tree exposes Emitter to Renderer child relationship') && effectsAutoTest.includes('v1.5 Record Hierarchy UI and native project persistence are mounted') && effectsAutoTest.includes('v1.5 Structural Layout Decoder builds record descriptors and ownership paths') && effectsAutoTest.includes('v1.5 Structural Layout Decoder captures array base/count/stride and compact header candidates') && effectsAutoTest.includes('v1.5 Structural Layout evidence confirmation requires notes') && effectsAutoTest.includes('v1.5 Shadow relocation blocks array/table members even with confirmed record layout') && effectsAutoTest.includes('v1.5 Transactional shadow relocation rewrites confirmed pointers and preserves original bytes') && effectsAutoTest.includes('v1.5 Structural Layout UI, project persistence and public API are mounted') && effectsAutoTest.includes('v1.5 Relocation Domains group confirmed ownership and array evidence without auto-confirming') && effectsAutoTest.includes('v1.5 Relocation Domain confirmation requires an explicit validation note') && effectsAutoTest.includes('v1.5 Relocation Domain duplicate transaction updates base/count and confirmed internal/external pointers') && effectsAutoTest.includes('v1.5 Relocation Domain remove transaction shrinks confirmed array while preserving stride and old block') && effectsAutoTest.includes('v1.5 Relocation Domain blocks removal of externally referenced array member') && effectsAutoTest.includes('v1.5 Relocation Domain UI, native persistence and public API are mounted') && effectsAutoTest.includes('v1.5 Multi-Array Domains group connected confirmed arrays without auto-confirming') && effectsAutoTest.includes('v1.5 Multi-Array Domain confirmation requires a validation note') && effectsAutoTest.includes('v1.5 Multi-Array transaction remaps paired Renderer and Sampler inserts atomically') && effectsAutoTest.includes('v1.5 Native Record Synthesis patches only confirmed Renderer fields inside a template stride') && effectsAutoTest.includes('v1.5 Multi-Array transaction blocks removal when another participating array still references the target') && effectsAutoTest.includes('v1.5 Multi-Array UI, native synthesis persistence and public API are mounted') && effectsAutoTest.includes('v1.5 Native Graph supports explicit Renderer to Sampler to Curve authoring chains') && effectsAutoTest.includes('v1.5 Native PKB Write Plan auto-selects connected confirmed templates and stages three native inserts') && effectsAutoTest.includes('v1.5 Native PKB Write Plan applies paired Renderer Sampler Curve pointers losslessly') && effectsAutoTest.includes('v1.5 Native PKB Write Plan blocks incomplete graph chains and unconfirmed domains') && effectsAutoTest.includes('v1.5 Native PKB Write Plan UI, project persistence and public API are mounted') && effectsAutoTest.includes('v1.5 Native Graph subtree supports Emitter fan-out to two complete Renderer branches') && effectsAutoTest.includes('v1.5 Subtree Write Plan batches Emitter plus two Renderer Sampler Curve branches losslessly') && effectsAutoTest.includes('v1.5 Incremental Compiler analyzes NEW subtree and binds every inserted Graph node after preview') && effectsAutoTest.includes('v1.5 Incremental Compiler detects changed bound subtree and blocks unsafe replacement') && effectsAutoTest.includes('v1.5 Incremental Compiler UI, auto-plan hook, project persistence and API are mounted') && effectsAutoTest.includes('CFX VM Compiler lowers typed source into fresh native VM instructions') && effectsAutoTest.includes('PKB Editor CFX VM panel loads a starter and compiles source into saveable PKB bytes') && effectsAutoTest.includes('CFX VM Compiler writes Reg1 Reg2 Reg3 counts into the native blob header') && effectsAutoTest.includes('CFX starter omits implicit Popcorn runtime contexts and preserves evolve scope kind') && effectsAutoTest.includes('CFX native compile verification requires structural parity and a clean decoder pass') && (effectsAutoTest.match(/await test\(/g)||[]).length >= 219,
  aggregateSuite: modelAutoTest.includes('Effects Lab dedicated regression suite') && modelAutoTest.includes('Effects Lab motion preview reflows after workspace round-trip') && modelAutoTest.includes('Effects Lab live CFX preview descriptor + particle simulation') && modelAutoTest.includes('Effects Lab live preview CASC texture decode contract') && modelAutoTest.includes('Effects Lab Designer UX large preview + help / scoped inspector') && modelAutoTest.includes('Effects Lab Designer CASC resource picker contract') && modelAutoTest.includes('Effects Lab unified Live/Motion viewer + generated-code chrome') && modelAutoTest.includes('Effects Lab structured renderer authoring syncs renderers.cfx + live descriptor') && modelAutoTest.includes('Effects Lab live renderer CASC texture picker contract') && modelAutoTest.includes('Effects Lab six authoring tabs functional-control matrix') && modelAutoTest.includes('window.WC3_EFFECTS_AUTOTEST'),
  hiddenModelPause: modelLab.includes("const modelWorkspaceActive = document.body?.dataset?.module === 'model'") && modelLab.includes("state.mode === 'model' && modelWorkspaceActive"),
  designerUx: effectsLab.includes('setInspectorTab') && effectsLab.includes('setScriptOpen') && effectsLab.includes('searchCascPicker') && effectsLab.includes('epfPathFromCasc') && effectsLab.includes('addLiveRenderer') && effectsLab.includes('duplicateLiveRenderer') && effectsLab.includes('deleteLiveRenderer') && effectsLab.includes('updateLiveRendererField') && modelHtml.includes('effectsLiveControls') && modelHtml.includes('effectsLiveAddRendererBtn') && modelHtml.includes('effectsRendererAddBtn') && effectsCss.includes('.effects-inspector-tabs') && effectsCss.includes('.effects-casc-picker-results') && effectsCss.includes('[data-script-open="true"]') && effectsCss.includes('.effects-live-controls'),
  livePreview: effectsLab.includes('reloadLiveTextures') && effectsLab.includes("kind:'effect-texture'") && effectsLab.includes('liveTextureCache') && effectsLab.includes('startLivePreviewLoop') && effectsLab.includes('stepLivePreview') && effectsLab.includes('getLivePreviewSnapshot') && effectsLab.includes('setPreviewMode') && effectsCss.includes('data-preview-mode="live"') && effectsCss.includes('.effects-preview-modebar'),
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
  const epfFiles=fs.existsSync(epfDir)?fs.readdirSync(epfDir).filter(x=>/\.epf$/i.test(x)):[];
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
  if(blankList.length!==6||!blankList.includes('functions.cfx')||!String(blank['functions.cfx']||'').includes('stdlib/templates.cfx'))throw new Error('Runtime-proven CFX starter must expose the five core files plus functions.cfx stdlib imports');
  const bundle=E.parseBundle(blank);
  if(bundle.layers.length<2||bundle.renderers.length<1||!bundle.graph.spawns.includes('RootLayer'))throw new Error('CFX parser template failed');
  const live=E.buildLivePreviewDescriptor(bundle);
  if(!live.emitters.length||!live.rendererCount||!live.textures.some(x=>/flaresimple_bw\.dds$/i.test(x)))throw new Error('Live Effect preview descriptor failed on default CFX bundle');
  const liveRenderer=E.rendererPreviewSpec(bundle.renderers[0]);
  if(liveRenderer.type!=='Billboard'||!liveRenderer.texture||!liveRenderer.atlas)throw new Error('Live Effect renderer preview spec failed');

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

  const PM=require(path.join(root,'app/js/effects-project-model.js'));
  const CA=require(path.join(root,'app/js/effects-cfx-adapter.js'));
  const ir=CA.importFiles(blank,{name:'VerifyProject'});
  if(ir.schema!=='wc3.effects.project'||ir.layers.length<2||ir.renderers.length<1||ir.adapters?.['cornsyrup-cfx']?.format!=='cfx/1')throw new Error('Native Effects Project / CFX adapter import failed');
  const exported=CA.exportFiles(ir);if(E.bundleFileList(exported).length!==6||!exported['code.cfx'].includes('ParticleLayer')||!exported['functions.cfx'].includes('stdlib/templates.cfx'))throw new Error('CFX adapter export failed');

  const PI=require(path.join(root,'app/js/effects-pkb-inspector.js'));
  const SR=require(path.join(root,'app/js/effects-pkb-structured-reader.js'));
  const ND=require(path.join(root,'app/js/effects-pkb-native-popcorn.js'));
  const CB=require(path.join(root,'app/js/effects-cfx-bundle-compiler.js'));
  const CV=require(path.join(root,'app/js/effects-cfx-vm-compiler.js'));
  const CC=require(path.join(root,'app/js/effects-compat-corpus.js'));
  const PC=require(path.join(root,'app/js/effects-pkb-corpus.js'));
  const CR=require(path.join(root,'app/js/effects-pkb-correlation.js'));
  const EX=require(path.join(root,'app/js/effects-pkb-experiments.js'));
  const RD=require(path.join(root,'app/js/effects-pkb-semantic-records.js'));
  const RH=require(path.join(root,'app/js/effects-pkb-record-hierarchy.js'));
  const LD=require(path.join(root,'app/js/effects-pkb-layout-decoder.js'));
  const DR=require(path.join(root,'app/js/effects-pkb-relocation-domains.js'));
  const MD=require(path.join(root,'app/js/effects-pkb-multi-array-transactions.js'));const NP=require(path.join(root,'app/js/effects-pkb-native-write-plan.js'));const NG=require(path.join(root,'app/js/effects-node-graph.js'));
  const MB=require(path.join(root,'app/js/effects-math-baker.js'));
  const nativeProbe=Buffer.alloc(0x24);nativeProbe.writeUInt32LE(0xCA000B11,0);if(ND.SCHEMA!=='wc3.effects.native-popcorn'||ND.SOURCE?.license!=='MIT'||!ND.looksLike(nativeProbe)||typeof ND.decode!=='function'||typeof ND.disassemble!=='function')throw new Error('Native Popcorn Decoder / W3ModelViewer MIT integration failed');
  const tupleAst=CV.parse('init { needs { "Position" : f32x3; "Color" : f32x4; } Position = (0, 0, 0.75); Color = (1, 1, 1, 1); }');if(tupleAst.body.length!==2||tupleAst.body[0]?.expr?.kind!=='tuple'||tupleAst.body[0]?.expr?.args?.length!==3||tupleAst.body[1]?.expr?.kind!=='tuple'||tupleAst.body[1]?.expr?.args?.length!==4)throw new Error('CFX VM shorthand tuple parser regression');
  const shortTupleBundle=E.blankBundle();shortTupleBundle['code.cfx']='layer RootLayer { event Spawn; }\nlayer ParticleLayer { properties { Renderers = [&MainBillboard]; metaData; } root auto; init { self.invLife = rcp(2.4); EmissionRate = 18; Position = (0, 0, 0); Velocity = (0, 0, 0.75); Size = 1.25; Color = (1, 1, 1, 1); Enabled = true; } bind MainBillboard { "Position" -> Position; "Enabled" -> Enabled; "Size" -> SizeScale; } }';const shortTupleBuilt=CB.build(shortTupleBundle,{name:'verify_shorthand_tuple.pkb'});if(!shortTupleBuilt.verification.decodeClean||shortTupleBuilt.verification.fieldWalkFailures!==0||shortTupleBuilt.verification.warnings!==0)throw new Error('CFX shorthand tuple / inferred particle-field Full Build regression');
  let unresolvedRuntimeTemplateBlocked=false,unresolvedRuntimeTemplateMessage='';try{CB.build(E.blankBundle(),{name:'verify_missing_stdlib.pkb'});}catch(e){unresolvedRuntimeTemplateBlocked=true;unresolvedRuntimeTemplateMessage=String(e?.message||e);}if(!unresolvedRuntimeTemplateBlocked||!/Unresolved CFX template/.test(unresolvedRuntimeTemplateMessage)||!/EventMultiplier|RootLayerTemplate/.test(unresolvedRuntimeTemplateMessage))throw new Error('Full Build must block runtime starter compilation when required CornSyrup stdlib templates are unresolved');
  const runtimeStarter=CB.build(E.blankBundle(),{libraries:CC.libraries(),name:'verify_runtime_starter.pkb'});if(!runtimeStarter.verification.decodeClean||!runtimeStarter.verification.runtimeReady||runtimeStarter.runtimeProfile?.profile!==CB.RUNTIME_PROFILE.id||runtimeStarter.runtimeProfile?.errors?.length)throw new Error('Runtime-proven default CFX starter failed Warcraft runtime profile');
  const compatRows=[];for(const meta of CC.list()){const built=CB.build(CC.bundle(meta.id),{libraries:CC.libraries(),name:`${meta.id}.pkb`});if(!built.verification.decodeClean||!built.verification.runtimeReady||built.runtimeProfile?.errors?.length||built.verification.fieldWalkFailures!==0||built.verification.warnings!==0)throw new Error(`Warcraft compatibility corpus decode/runtime gate failed: ${meta.id}`);for(const key of ['layers','scripts','samplers','renderers','events'])if(Number.isFinite(Number(meta.expected?.[key]))&&built.summary[key]!==Number(meta.expected[key]))throw new Error(`Warcraft compatibility topology changed: ${meta.id}/${key} ${built.summary[key]} != ${meta.expected[key]}`);compatRows.push(built);}
  if(compatRows.length!==7)throw new Error('Warcraft compatibility corpus must contain seven CornSyrup bundles');
  const compatRef=ND.decode(CC.referencePkb('compat-simple-effect'),{name:'simple_effect_2.pkb'}),compatBuilt=compatRows[CC.list().findIndex(x=>x.id==='compat-simple-effect')],compatKeys=['layers','slots','events','scripts','samplers','curves','shapes','renderers'];for(const key of compatKeys)if(compatBuilt.decoded.summary[key]!==compatRef.summary[key])throw new Error(`CornSyrup simple_effect structural parity failed: ${key}`);
  const golden=compatBuilt.runtimeProfile,goldenConstants=golden.layers.map(x=>x.constantCount).join(','),goldenRanges=golden.layers.map(x=>x.rangeCount).join(','),goldenStrides=golden.layers.map(x=>x.stride).join(',');if(!golden.ready||golden.profile!==CB.RUNTIME_PROFILE.id||golden.root?.record!==0||golden.root?.className!=='CParticleEffect'||golden.root?.classZero!=='CParticleEffect'||goldenConstants!=='2,4,0'||goldenRanges!=='28,72,28'||goldenStrides!=='4,6,4'||!golden.scripts.length||golden.scripts.some(x=>x.entryName!=='Root'||x.declaredCodeLength<=0))throw new Error(`Confirmed simple_effect C golden runtime profile regressed: constants ${goldenConstants}, ranges ${goldenRanges}, strides ${goldenStrides}`);
  const compatBake=ND.Bake.load(Buffer.from(compatBuilt.bytes)),compatBlobs=compatBake.ofClass('CCompilerBlobCache'),compatEntryPoints=compatBake.ofClass('CCompilerBlobCacheEntryPoint');if(!compatBlobs.length||compatEntryPoints.length!==compatBlobs.length)throw new Error(`Standalone CFX runtime VM entry-point synthesis failed: ${compatBlobs.length} blob(s), ${compatEntryPoints.length} entry point(s)`);for(const blobRecord of compatBlobs){const ep=compatBake.Ref(blobRecord,5),script=ND.decodeScript(compatBake,blobRecord);if(ep<0||compatBake.classOf(ep)!=='CCompilerBlobCacheEntryPoint'||compatBake.String(ep,0)!=='Root'||compatBake.U32(ep,2)!==script.byteLength)throw new Error(`Standalone CFX runtime entry point mismatch for CCompilerBlobCache record ${blobRecord}`);for(const ins of script.code||[])if(ins.op==='Call'){const isVoid=ins.dst?.space===255||ins.dst?.spaceName==='None';if(isVoid&&Number(ins.sub)!==0)throw new Error(`Standalone CFX void Call must use sub=0 in blob ${blobRecord}`);if(!isVoid&&Number(ins.sub)!==2)throw new Error(`Standalone CFX value-returning Call must use native sub=2 in blob ${blobRecord}`);}}
  const compatRefBake=ND.Bake.load(Buffer.from(CC.referencePkb('compat-simple-effect'))),runtimeShapeClasses=['CParticleEffect','CParticleAttributeList','CParticleAttributeDeclaration','CLayerGraphCompileCache_EventSlot','CLayerGraphCompileCache_EntrySlot','CLayerGraphCompileCache','CLayerCompileCache','CLayerCompileCacheSampler','CLayerCompileCacheAttrib','CParticleNodeSamplerData_EventStream','CParticleNodeSamplerData_Shape','CParticleNodeSamplerData_Curve','CLayerCompileCacheRenderer','CLayerCompileCacheRendererProperty','CCompilerBlobCacheExternal','CCompilerBlobCacheEntryPoint','CCompilerBlobCache','CLayerCompileCacheField','CLayerCompileCacheRendererParticleInput','CLayerCompileCacheEvent','CLayerCompileCacheEventPayload','CLayerGraphCompileCache_LayerSlot'];for(const cls of runtimeShapeClasses)if(compatBake.ofClass(cls).length!==compatRefBake.ofClass(cls).length)throw new Error(`CornSyrup runtime-shape parity failed: ${cls} ${compatBake.ofClass(cls).length} != ${compatRefBake.ofClass(cls).length}`);const initBlob=compatBlobs.find(r=>{const s=ND.decodeScript(compatBake,r);return(s.functionNames||[]).filter(n=>n==='samplePosition').length>=2;});if(initBlob==null)throw new Error('Standalone CFX runtime ABI fixture has no dual samplePosition script');const initScript=ND.decodeScript(compatBake,initBlob),sampleCalls=(initScript.code||[]).filter(x=>x.op==='Call'&&initScript.functionNames?.[x.slot]==='samplePosition'),sampleDefs=compatBake.Refs(initBlob,4).filter(fr=>compatBake.String(fr,0)==='samplePosition');if(sampleCalls.length<2||new Set(sampleCalls.map(x=>x.thisSlot)).size<2||sampleDefs.length<2||new Set(sampleDefs.map(fr=>compatBake.U32(fr,1))).size<2)throw new Error('Standalone CFX method-call definitions are not specialized per sampler this-slot');const rr=compatBake.ofClass('CLayerCompileCacheRenderer')[0];if(rr==null||compatBake.String(rr,3)!=='Popcorn/Library/PopcornFXCore/Materials/Default_Billboard.pkma'||compatBake.Refs(rr,2).length!==21)throw new Error('Standalone CFX Billboard runtime material/property synthesis diverged from CornSyrup');
  const runtimeHex=x=>Buffer.from(x||[]).toString('hex'),runtimeArrayCount=(bake,record,field)=>{const raw=bake.raw(record,field);return raw.length>=4?new DataView(raw.buffer,raw.byteOffset,raw.byteLength).getUint32(0,true):-1;},refRuntimeLayers=compatRefBake.ofClass('CLayerCompileCache'),outRuntimeLayers=compatBake.ofClass('CLayerCompileCache');if(refRuntimeLayers.length!==outRuntimeLayers.length)throw new Error('CornSyrup mandatory runtime layer-data parity failed: layer count');for(let i=0;i<refRuntimeLayers.length;i++){for(const f of [0,1])if(runtimeArrayCount(compatRefBake,refRuntimeLayers[i],f)!==runtimeArrayCount(compatBake,outRuntimeLayers[i],f)||runtimeHex(compatRefBake.raw(refRuntimeLayers[i],f))!==runtimeHex(compatBake.raw(outRuntimeLayers[i],f)))throw new Error(`CornSyrup mandatory runtime layer-data parity failed: layer ${i} field ${f}`);const rf=compatRefBake.Refs(refRuntimeLayers[i],2),cf=compatBake.Refs(outRuntimeLayers[i],2);if(rf.length!==cf.length)throw new Error(`CornSyrup field ABI parity failed: layer ${i} field count`);for(let j=0;j<rf.length;j++){if(compatRefBake.String(rf[j],0)!==compatBake.String(cf[j],0))throw new Error(`CornSyrup field ABI parity failed: layer ${i}/${j} name`);for(const f of [1,2,3,4,5])if(compatRefBake.has(rf[j],f)!==compatBake.has(cf[j],f)||(compatRefBake.has(rf[j],f)&&runtimeHex(compatRefBake.raw(rf[j],f))!==runtimeHex(compatBake.raw(cf[j],f))))throw new Error(`CornSyrup field ABI parity failed: ${compatRefBake.String(rf[j],0)} field ${f}`);}}
  const refEvents=compatRefBake.ofClass('CLayerCompileCacheEvent'),outEvents=compatBake.ofClass('CLayerCompileCacheEvent');if(refEvents.length!==outEvents.length)throw new Error('CornSyrup event default-omission parity failed: count');for(let i=0;i<refEvents.length;i++)if(compatRefBake.fieldsOf(refEvents[i]).map(x=>x.field).join(',')!==compatBake.fieldsOf(outEvents[i]).map(x=>x.field).join(','))throw new Error(`CornSyrup event default-omission parity failed: event ${i}`);const refLayerSlots=compatRefBake.ofClass('CLayerGraphCompileCache_LayerSlot'),outLayerSlots=compatBake.ofClass('CLayerGraphCompileCache_LayerSlot');for(let i=0;i<refLayerSlots.length;i++)if(compatRefBake.fieldsOf(refLayerSlots[i]).map(x=>x.field).join(',')!==compatBake.fieldsOf(outLayerSlots[i]).map(x=>x.field).join(','))throw new Error(`CornSyrup graph empty-array omission parity failed: layer slot ${i}`);if(compatBake.strings.includes(''))throw new Error('Standalone CFX build must not intern default empty strings');const extraRuntimeStrings=compatBake.strings.filter(x=>!compatRefBake.strings.includes(x)).sort();if(extraRuntimeStrings.join('|')!=='hsv2rgb|rgb2hsv|sample')throw new Error(`Unexpected standalone-only runtime strings: ${extraRuntimeStrings.join(', ')}`);
  const runtimeScripts=(bake,layer)=>{const out=bake.Refs(layer,10).slice(),death=bake.Ref(layer,9);if(death>=0)out.push(death);return out;},runtimeExternalMap=(bake,record)=>{const out=new Map();for(const e of bake.Refs(record,3))out.set(bake.String(e,0),{type:bake.String(e,1),kind:bake.U32(e,2),size:bake.U32(e,3),meta:bake.U32(e,4),attr:bake.has(e,5)?bake.U32(e,5):null,access:bake.U32(e,6)});return out;};for(let li=0;li<refRuntimeLayers.length;li++){const a=runtimeScripts(compatRefBake,refRuntimeLayers[li]),c=runtimeScripts(compatBake,outRuntimeLayers[li]);if(a.length!==c.length)throw new Error(`CornSyrup external ABI parity failed: layer ${li} script count`);for(let si=0;si<a.length;si++){const am=runtimeExternalMap(compatRefBake,a[si]),cm=runtimeExternalMap(compatBake,c[si]);if(am.size!==cm.size)throw new Error(`CornSyrup external ABI parity failed: layer ${li} script ${si} external count`);for(const [name,row] of am)if(JSON.stringify(row)!==JSON.stringify(cm.get(name)))throw new Error(`CornSyrup external ABI parity failed: layer ${li} script ${si} ${name}`);}}
  const viewerContract=CC.viewerContract(),viewerDir=path.join(root,'app/examples/compat/w3modelviewer'),viewerBake=fs.readFileSync(path.join(viewerDir,'PkBakeFile.cs'),'utf8'),viewerRuntime=fs.readFileSync(path.join(viewerDir,'PkRuntime.cs'),'utf8'),viewerEffect=fs.readFileSync(path.join(viewerDir,'PkEffectDef.cs'),'utf8'),viewerScript=fs.readFileSync(path.join(viewerDir,'PkScript.cs'),'utf8'),viewerLicense=fs.readFileSync(path.join(viewerDir,'LICENSE'),'utf8');if(!viewerBake.includes('private const uint Magic = 0xCA000B11;')||!viewerBake.includes('["CParticleEffect"]')||!viewerBake.includes('["CCompilerBlobCache"]'))throw new Error('Packaged W3ModelViewer PkBakeFile oracle changed unexpectedly');if(!viewerRuntime.includes('"samplePosition" => Fn.SamplePosition')||!viewerRuntime.includes('"appendPayload" when objType == "particleEvent"')||!viewerRuntime.includes('extractPayloadElementF4'))throw new Error('Packaged W3ModelViewer PkRuntime oracle changed unexpectedly');for(const gap of viewerContract.knownRuntimeGaps||[])if(viewerRuntime.includes(`"${gap}" =>`))throw new Error(`W3ModelViewer runtime gap ${gap} is no longer a gap; update the compatibility contract`);if(!viewerEffect.includes('CCompilerBlobCache')||!viewerScript.includes('CCompilerBlobCache')||!viewerLicense.includes('Permission is hereby granted'))throw new Error('Packaged W3ModelViewer semantic/script/license oracle is incomplete');
  const fakePkb=Buffer.concat([Buffer.from('PKFX\0\0\0\0','binary'),Buffer.from('Textures\\Fx\\Glow.dds\0SharedFX\\Boss.pkb\0Models\\Shard.pkmm\0','ascii')]);
  const inspected=PI.inspect(fakePkb,{name:'verify.pkb'});
  if(inspected.schema!=='wc3.effects.pkb-inspection'||inspected.dependencies.length<3||!inspected.hash?.value)throw new Error('PKB Inspector clean-room dependency scan failed');
  const exactCmp=PI.compare(fakePkb,fakePkb);
  const changed=Buffer.from(fakePkb);changed[0]^=1;const changedCmp=PI.compare(fakePkb,changed);
  if(!exactCmp.exact||changedCmp.exact||changedCmp.changedBytes<1)throw new Error('PKB round-trip analyzer failed');
  const structured=SR.parse(fakePkb,{name:'verify.pkb'}),structuredVerify=SR.verifyLossless(structured);
  if(structured.schema!=='wc3.effects.pkb-structure'||structured.preservation.coveragePercent!==100||!structuredVerify.exact)throw new Error('Structured PKB lossless reader/rebuild failed');
  const structuredPatch=SR.patchSameLength(structured,0,Uint8Array.from([fakePkb[0]^1])),structuredDiff=SR.diffAgainst(structured,structuredPatch._sourceBytes);
  if(structuredDiff.exact||structuredDiff.changedBytes!==1||structuredDiff.regions[0]?.offset!==0)throw new Error('Structured PKB diff/raw-preservation failed');
  const corpus=PC.scanEntries([{name:'one.pkb',data:Buffer.concat([fakePkb,Buffer.from('Game.Scale\0Billboard\0Curve\0','ascii')])},{name:'two.pkb',data:Buffer.concat([fakePkb,Buffer.from('Game.Scale\0Billboard\0Curve\0','ascii')])},{name:'three.pkb',data:Buffer.from('Game.TeamColor\0Ribbon\0Shape\0','ascii')}],{name:'Verify Corpus'});
  if(corpus.totalFiles!==3||corpus.clusters.length<2||corpus.registry.counts.confirmed!==0||corpus.registry.counts.probable<1)throw new Error('PKB Corpus Scanner / Structure Registry verification failed');
  const semanticDiff=PC.compareFiles(corpus.files[0],corpus.files[2]);if(semanticDiff.sameFingerprint)throw new Error('Structured semantic diff v2 failed');
  const fieldFixture=value=>{const b=Buffer.alloc(96);b.writeFloatLE(value,16);Buffer.from('Billboard\0Curve\0','ascii').copy(b,48);return b;};
  const fieldCorpus=PC.scanEntries([{name:'field_a.pkb',data:fieldFixture(1)},{name:'field_b.pkb',data:fieldFixture(2)},{name:'field_c.pkb',data:fieldFixture(3)}],{name:'Verify v1.5 Field Corpus'});
  fieldCorpus.correlation=CR.analyzeCorpus(fieldCorpus);
  fieldCorpus.registry=PC.buildRegistry(fieldCorpus,fieldCorpus.registry);
  CR.applyRegistry(fieldCorpus.correlation,fieldCorpus.registry);
  const field=fieldCorpus.correlation.candidates.find(x=>x.type==='f32'&&x.offset===16);
  if(!field||field.pairCount<2||field.fileCount<3)throw new Error('PKB v1.5 field correlation aggregation failed');
  const fieldReg=fieldCorpus.registry.entries.find(x=>x.signature===field.signature);
  if(fieldReg?.status!=='probable'||fieldCorpus.registry.counts.confirmed!==0)throw new Error('PKB v1.5 field registry auto-confirm safety failed');
  const fieldDoc=SR.parse(fieldFixture(1),{name:'field_a.pkb'});
  let blocked=false;try{SR.patchScalarSameLength(fieldDoc,{...field,evidenceStatus:'heuristic',aValue:1},4);}catch(_){blocked=true;}
  if(!blocked)throw new Error('PKB v1.5 scalar writer allowed an unconfirmed field');
  PC.setRegistryStatus(fieldCorpus.registry,field.signature,'confirmed','Build verifier controlled scalar fixture.');
  const confirmed={...field,evidenceStatus:'confirmed',aValue:1};
  const patchedField=SR.patchScalarSameLength(fieldDoc,confirmed,4),fieldDiff=SR.diffAgainst(fieldDoc,patchedField._sourceBytes);
  if(Math.abs(SR.readScalar(patchedField,16,'f32')-4)>1e-6||fieldDiff.regions.some(r=>r.offset<16||r.end>20))throw new Error('PKB v1.5 confirmed scalar patch escaped its fixed-width field');
  const plan=SR.createPatchPlan(fieldDoc,[{candidate:confirmed,value:5}]),planned=SR.applyPatchPlan(fieldDoc,plan);
  if(Math.abs(SR.readScalar(planned,16,'f32')-5)>1e-6)throw new Error('PKB v1.5 patch-plan application failed');
  const nearTwins=EX.findNearTwins(fieldCorpus,{maxChangedBytes:32,maxChangedRatio:.1});
  if(!nearTwins.pairs.length)throw new Error('PKB v1.5 Near-Twin Finder failed');
  const controlled=EX.controlledExperiment(fieldCorpus,{aId:'pkb-0',bId:'pkb-1',property:'size',expectedA:1,expectedB:2,tolerance:1e-6});
  if(controlled.topMatch?.type!=='f32'||controlled.topMatch?.offset!==16)throw new Error('PKB v1.5 controlled field experiment failed');
  const controlled2=EX.controlledExperiment(fieldCorpus,{aId:'pkb-0',bId:'pkb-2',property:'size',expectedA:1,expectedB:3,tolerance:1e-6});
  const fieldCatalog=EX.buildCatalog([controlled,controlled2]);const mapped=fieldCatalog.entries.find(x=>x.propertyId==='size');
  if(mapped?.status!=='probable'||fieldCatalog.counts.confirmed!==0)throw new Error('PKB v1.5 semantic field catalog evidence policy failed');
  let confirmBlocked=false;try{EX.setCatalogStatus(fieldCatalog,mapped.id,'confirmed','');}catch(_){confirmBlocked=true;}if(!confirmBlocked)throw new Error('PKB v1.5 semantic field catalog confirmed without evidence note');
  EX.setCatalogStatus(fieldCatalog,mapped.id,'confirmed','Build verifier controlled semantic field fixture.');if(mapped.status!=='confirmed')throw new Error('PKB v1.5 semantic field catalog manual confirmation failed');
  const recordBytes=Buffer.alloc(192);recordBytes.writeFloatLE(1,16);recordBytes.writeFloatLE(12,20);recordBytes.writeFloatLE(.5,96);Buffer.from('Spawner\0','ascii').copy(recordBytes,48);Buffer.from('Billboard\0','ascii').copy(recordBytes,120);const recordDoc=SR.parse(recordBytes,{name:'record_verify.pkb'}),recordCatalog={entries:[{id:'size',propertyId:'size',propertyLabel:'Size',type:'f32',width:4,status:'confirmed',note:'fixture',offsets:[16]},{id:'rate',propertyId:'emission-rate',propertyLabel:'Emission Rate',type:'f32',width:4,status:'confirmed',note:'fixture',offsets:[20]},{id:'red',propertyId:'color-r',propertyLabel:'Color R',type:'f32',width:4,status:'confirmed',note:'fixture',offsets:[96]}]},recordModel=RD.buildRecords(recordDoc,recordCatalog,{fileName:'record_verify.pkb'});if(!recordModel.records.some(r=>r.type==='Emitter')||!recordModel.records.some(r=>r.type==='Renderer'))throw new Error('PKB v1.5 semantic record grouping failed');const emitterRecord=recordModel.records.find(r=>r.type==='Emitter');RD.setRecordStatus(recordModel,emitterRecord.id,'confirmed','Build verifier semantic record boundary fixture.');const changes={};for(const f of emitterRecord.fields)changes[f.id]=f.propertyId==='size'?2:f.propertyId==='emission-rate'?24:f.value;const recordPatch=RD.createRecordPatch(recordDoc,emitterRecord,changes);if(!recordPatch.losslessOutsideFields||recordPatch.plan.operations.length<2)throw new Error('PKB v1.5 semantic record patch failed');
  const hierarchyBytes=Buffer.alloc(256);hierarchyBytes.writeUInt32LE(64,24);hierarchyBytes.writeUInt32LE(3,28);hierarchyBytes.writeInt32LE(28,32);hierarchyBytes.writeUInt32LE(64,160);hierarchyBytes.writeUInt32LE(96,164);hierarchyBytes.writeUInt32LE(128,168);const hierarchyDoc=SR.parse(hierarchyBytes,{name:'hierarchy_verify.pkb'}),mkRecord=(id,type,offset,end)=>({id,key:id,type,label:id,status:'confirmed',range:{offset,end},fields:[]}),hierarchySemantic={records:[mkRecord('emit','Emitter',16,20),mkRecord('r1','Renderer',64,72),mkRecord('r2','Renderer',96,104),mkRecord('r3','Renderer',128,136)]},hierarchy=RH.buildHierarchy(hierarchyDoc,hierarchySemantic);if(!hierarchy.links.some(x=>x.pointerKind==='absolute-u32'&&x.offset===24&&x.targetRecordId==='r1')||!hierarchy.links.some(x=>x.pointerKind==='relative-i32'&&x.offset===32&&x.targetRecordId==='r1'))throw new Error('PKB v1.5 record hierarchy pointer decode failed');if(!hierarchy.arrays.some(x=>x.count===3&&x.stride===32)||!hierarchy.pointerTables.some(x=>x.count===3)||!hierarchy.countCandidates.some(x=>x.value===3&&x.offset===28))throw new Error('PKB v1.5 record hierarchy array/table/count inference failed');if(hierarchy.summary.confirmedLinks!==0||hierarchy.summary.confirmedArrays!==0)throw new Error('PKB v1.5 record hierarchy auto-confirm safety failed');const hierarchyLink=hierarchy.links.find(x=>x.offset===24);let hierarchyBlocked=false;try{RH.setLinkStatus(hierarchy,hierarchyLink.id,'confirmed','');}catch(_){hierarchyBlocked=true;}if(!hierarchyBlocked)throw new Error('PKB v1.5 record hierarchy confirmed a link without validation note');RH.setLinkStatus(hierarchy,hierarchyLink.id,'confirmed','Build verifier controlled pointer relationship.');if(hierarchy.summary.confirmedLinks!==1)throw new Error('PKB v1.5 record hierarchy manual confirmation failed');
  const layoutBytes=Buffer.alloc(160);layoutBytes.writeUInt32LE(32,4);layoutBytes.writeFloatLE(1,32);layoutBytes.writeInt32LE(24,36);layoutBytes.writeFloatLE(.5,64);const layoutDoc=SR.parse(layoutBytes,{name:'layout_verify.pkb'}),layoutSemantic={records:[{id:'root',key:'root',type:'Unknown',label:'Root',status:'confirmed',range:{offset:0,end:8},fields:[]},{id:'emit',key:'emit',type:'Emitter',label:'Emitter',status:'confirmed',range:{offset:32,end:48},fields:[{id:'size',propertyId:'size',propertyLabel:'Size',type:'f32',width:4,offset:32,value:1,evidenceStatus:'confirmed'}]},{id:'rend',key:'rend',type:'Renderer',label:'Renderer',status:'confirmed',range:{offset:64,end:72},fields:[{id:'alpha',propertyId:'alpha',propertyLabel:'Alpha',type:'f32',width:4,offset:64,value:.5,evidenceStatus:'confirmed'}]}]},layoutHierarchy=RH.buildHierarchy(layoutDoc,layoutSemantic),layoutIncoming=layoutHierarchy.links.find(x=>x.offset===4&&x.pointerKind==='absolute-u32'&&x.targetRecordId==='emit'),layoutOutgoing=layoutHierarchy.links.find(x=>x.offset===36&&x.pointerKind==='relative-i32'&&x.targetRecordId==='rend');if(!layoutIncoming||!layoutOutgoing)throw new Error('PKB v1.5 structural layout pointer fixture failed');RH.setLinkStatus(layoutHierarchy,layoutIncoming.id,'confirmed','Build verifier root/emitter pointer.');RH.setLinkStatus(layoutHierarchy,layoutOutgoing.id,'confirmed','Build verifier emitter/renderer pointer.');const layoutModel=LD.buildLayout(layoutDoc,layoutSemantic,layoutHierarchy);if(!layoutModel.ownershipEdges.some(x=>x.sourceRecordId==='emit'&&x.targetRecordId==='rend')||!layoutModel.hierarchy.paths.some(p=>p.map(x=>x.type).join('>')==='Emitter>Renderer'))throw new Error('PKB v1.5 structural ownership/layout decode failed');const layoutEmitter=layoutModel.recordDescriptors.find(x=>x.recordId==='emit');let layoutConfirmBlocked=false;try{LD.setRecordDescriptorStatus(layoutModel,layoutEmitter.id,'confirmed','');}catch(_){layoutConfirmBlocked=true;}if(!layoutConfirmBlocked)throw new Error('PKB v1.5 structural record confirmed without validation note');LD.setRecordDescriptorStatus(layoutModel,layoutEmitter.id,'confirmed','Build verifier standalone emitter layout.');const relocatePlan=LD.createRelocationPlan(layoutDoc,layoutModel,layoutHierarchy,'emit',{alignment:16}),relocated=LD.applyRelocationPlan(layoutDoc,relocatePlan),relocatedView=new DataView(relocated.bytes.buffer),relPtrOff=relocatePlan.newOffset+4,relTarget=relPtrOff+4+relocatedView.getInt32(relPtrOff,true);if(relocatedView.getUint32(4,true)!==relocatePlan.newOffset||relTarget!==64||!relocated.verification.sourcePreservedOutsideIncoming)throw new Error('PKB v1.5 transactional shadow relocation verification failed');
  const domainBytes=new Uint8Array(192),domainDv=new DataView(domainBytes.buffer);domainDv.setUint32(4,64,true);domainDv.setUint32(8,2,true);domainDv.setUint32(12,96,true);domainDv.setInt32(68,24,true);domainDv.setInt32(100,-40,true);
  const domainDoc=SR.parse(domainBytes,{name:'domain_verify.pkb'}),domainLayout={source:{name:'domain_verify.pkb'},recordDescriptors:[{id:'dr1',recordId:'r1',recordType:'Renderer',offset:64,end:72,size:8,status:'confirmed'},{id:'dr2',recordId:'r2',recordType:'Renderer',offset:96,end:104,size:8,status:'confirmed'}],ownershipEdges:[],arrayDescriptors:[{id:'da1',kind:'array-layout',recordType:'Renderer',status:'confirmed',count:2,stride:32,baseOffset:64,basePointerLinkId:'dbase',countOffset:8,itemRecordIds:['r1','r2']}],headers:[{id:'dh1',collectionId:'da1',status:'confirmed'}]},domainHierarchy={links:[{id:'dbase',offset:4,pointerKind:'absolute-u32',targetOffset:64,targetRecordId:'r1',sourceRecordId:'',status:'confirmed'},{id:'dext',offset:12,pointerKind:'absolute-u32',targetOffset:96,targetRecordId:'r2',sourceRecordId:'',status:'confirmed'},{id:'di1',offset:68,pointerKind:'relative-i32',targetOffset:96,targetRecordId:'r2',sourceRecordId:'r1',status:'confirmed'},{id:'di2',offset:100,pointerKind:'relative-i32',targetOffset:64,targetRecordId:'r1',sourceRecordId:'r2',status:'confirmed'}]},domainModel=DR.buildDomains(domainDoc,domainLayout,domainHierarchy),domain=domainModel.domains[0];if(domain.status==='confirmed')throw new Error('PKB v1.5 relocation domain auto-confirm safety failed');let domainBlocked=false;try{DR.setDomainStatus(domainModel,domain.id,'confirmed','');}catch(_){domainBlocked=true;}if(!domainBlocked)throw new Error('PKB v1.5 relocation domain confirmed without note');DR.setDomainStatus(domainModel,domain.id,'confirmed','Build verifier confirmed relocation-domain fixture.');
  const dupPlan=DR.createArrayMutationPlan(domainDoc,domainModel,domainLayout,domainHierarchy,'da1',{operation:'duplicate',index:1,templateIndex:0,alignment:16}),dupApplied=DR.applyArrayMutationPlan(domainDoc,dupPlan),dupView=new DataView(dupApplied.bytes.buffer),dupResolve=off=>off+4+dupView.getInt32(off,true);if(dupPlan.newCount!==3||dupView.getUint32(4,true)!==dupPlan.newBase||dupView.getUint32(8,true)!==3||dupView.getUint32(12,true)!==dupPlan.newBase+64||dupResolve(dupPlan.newBase+4)!==dupPlan.newBase+64||dupResolve(dupPlan.newBase+36)!==dupPlan.newBase+64||dupResolve(dupPlan.newBase+68)!==dupPlan.newBase||!dupApplied.verification.sourcePreservedOutsideMetadata)throw new Error('PKB v1.5 relocation-domain duplicate transaction failed');
  const rmBytes=new Uint8Array(160),rmDv=new DataView(rmBytes.buffer);rmDv.setUint32(4,64,true);rmDv.setUint32(8,2,true);rmBytes.fill(17,64,96);rmBytes.fill(33,96,128);const rmDoc=SR.parse(rmBytes,{name:'domain_remove_verify.pkb'}),rmLayout={recordDescriptors:[{id:'rs1',recordId:'s1',recordType:'Sampler',offset:64,end:72,size:8,status:'confirmed'},{id:'rs2',recordId:'s2',recordType:'Sampler',offset:96,end:104,size:8,status:'confirmed'}],ownershipEdges:[],arrayDescriptors:[{id:'ra1',kind:'array-layout',recordType:'Sampler',status:'confirmed',count:2,stride:32,baseOffset:64,basePointerLinkId:'rbase',countOffset:8,itemRecordIds:['s1','s2']}],headers:[{id:'rh1',collectionId:'ra1',status:'confirmed'}]},rmHierarchy={links:[{id:'rbase',offset:4,pointerKind:'absolute-u32',targetOffset:64,targetRecordId:'s1',sourceRecordId:'',status:'confirmed'}]},rmModel=DR.buildDomains(rmDoc,rmLayout,rmHierarchy);DR.setDomainStatus(rmModel,rmModel.domains[0].id,'confirmed','Build verifier sampler array fixture.');const rmPlan=DR.createArrayMutationPlan(rmDoc,rmModel,rmLayout,rmHierarchy,'ra1',{operation:'remove',index:1,alignment:16}),rmApplied=DR.applyArrayMutationPlan(rmDoc,rmPlan),rmView=new DataView(rmApplied.bytes.buffer);if(rmPlan.newCount!==1||rmView.getUint32(8,true)!==1||rmView.getUint32(4,true)!==rmPlan.newBase||!rmApplied.verification.sourcePreservedOutsideMetadata)throw new Error('PKB v1.5 relocation-domain remove transaction failed');
  const multiBytes=new Uint8Array(256),multiDv=new DataView(multiBytes.buffer);multiDv.setUint32(4,64,true);multiDv.setUint32(8,2,true);multiDv.setUint32(12,128,true);multiDv.setUint32(16,2,true);multiDv.setInt32(68,56,true);multiDv.setInt32(100,56,true);multiDv.setInt32(132,-72,true);multiDv.setInt32(164,-72,true);
  const multiDoc=SR.parse(multiBytes,{name:'multi_verify.pkb'}),multiLayout={recordDescriptors:[{id:'mr1d',recordId:'mr1',recordType:'Renderer',offset:64,end:80,size:16,status:'confirmed',fields:[{id:'alpha',propertyId:'alpha',propertyLabel:'Alpha',type:'f32',width:4,offset:64,value:0,evidenceStatus:'confirmed'},{id:'r',propertyId:'color-r',propertyLabel:'Color R',type:'f32',width:4,offset:68,value:0,evidenceStatus:'confirmed'},{id:'g',propertyId:'color-g',propertyLabel:'Color G',type:'f32',width:4,offset:72,value:0,evidenceStatus:'confirmed'},{id:'b',propertyId:'color-b',propertyLabel:'Color B',type:'f32',width:4,offset:76,value:0,evidenceStatus:'confirmed'}]},{id:'mr2d',recordId:'mr2',recordType:'Renderer',offset:96,end:112,size:16,status:'confirmed',fields:[]},{id:'ms1d',recordId:'ms1',recordType:'Sampler',offset:128,end:136,size:8,status:'confirmed',fields:[]},{id:'ms2d',recordId:'ms2',recordType:'Sampler',offset:160,end:168,size:8,status:'confirmed',fields:[]}],ownershipEdges:[{id:'mo1',sourceRecordId:'mr1',targetRecordId:'ms1',status:'confirmed'},{id:'mo2',sourceRecordId:'mr2',targetRecordId:'ms2',status:'confirmed'}],arrayDescriptors:[{id:'mra',kind:'array-layout',recordType:'Renderer',status:'confirmed',count:2,stride:32,baseOffset:64,basePointerLinkId:'mrb',countOffset:8,itemRecordIds:['mr1','mr2']},{id:'msa',kind:'array-layout',recordType:'Sampler',status:'confirmed',count:2,stride:32,baseOffset:128,basePointerLinkId:'msb',countOffset:16,itemRecordIds:['ms1','ms2']}],headers:[{id:'mrh',collectionId:'mra',status:'confirmed'},{id:'msh',collectionId:'msa',status:'confirmed'}]},multiHierarchy={links:[{id:'mrb',offset:4,pointerKind:'absolute-u32',targetOffset:64,targetRecordId:'mr1',sourceRecordId:'',status:'confirmed'},{id:'msb',offset:12,pointerKind:'absolute-u32',targetOffset:128,targetRecordId:'ms1',sourceRecordId:'',status:'confirmed'},{id:'mr1s1',offset:68,pointerKind:'relative-i32',targetOffset:128,targetRecordId:'ms1',sourceRecordId:'mr1',status:'confirmed'},{id:'mr2s2',offset:100,pointerKind:'relative-i32',targetOffset:160,targetRecordId:'ms2',sourceRecordId:'mr2',status:'confirmed'},{id:'ms1r1',offset:132,pointerKind:'relative-i32',targetOffset:64,targetRecordId:'mr1',sourceRecordId:'ms1',status:'confirmed'},{id:'ms2r2',offset:164,pointerKind:'relative-i32',targetOffset:96,targetRecordId:'mr2',sourceRecordId:'ms2',status:'confirmed'}]},multiRel=DR.buildDomains(multiDoc,multiLayout,multiHierarchy);DR.setDomainStatus(multiRel,multiRel.domains[0].id,'confirmed','Build verifier paired array domain.');const multiModel=MD.buildDomains(multiDoc,multiRel,multiLayout,multiHierarchy);if(!multiModel.domains.length||multiModel.domains[0].status==='confirmed')throw new Error('PKB v1.5 multi-array domain formation/auto-confirm safety failed');let multiBlocked=false;try{MD.setDomainStatus(multiModel,multiModel.domains[0].id,'confirmed','');}catch(_){multiBlocked=true;}if(!multiBlocked)throw new Error('PKB v1.5 multi-array domain confirmed without note');MD.setDomainStatus(multiModel,multiModel.domains[0].id,'confirmed','Build verifier paired Renderer/Sampler evidence.');const multiPlan=MD.createTransactionPlan(multiDoc,multiModel,multiLayout,multiHierarchy,multiModel.domains[0].id,[{arrayId:'mra',operation:'duplicate',index:1,templateIndex:0},{arrayId:'msa',operation:'duplicate',index:1,templateIndex:0}],{alignment:16}),multiApplied=MD.applyTransactionPlan(multiDoc,multiPlan),mra=multiPlan.arrayPlans.find(x=>x.arrayId==='mra'),msa=multiPlan.arrayPlans.find(x=>x.arrayId==='msa'),multiOut=new DataView(multiApplied.bytes.buffer),multiResolve=off=>off+4+multiOut.getInt32(off,true),newRenderer=mra.newBase+32,newSampler=msa.newBase+32;if(mra.newCount!==3||msa.newCount!==3||multiResolve(newRenderer+4)!==newSampler||multiResolve(newSampler+4)!==newRenderer||!multiApplied.verification.sourcePreservedOutsideMetadata)throw new Error('PKB v1.5 multi-array paired insertion/remap failed');
  const nativeProject={renderers:[{id:'native-renderer',name:'Native Renderer',properties:{Color:'(0.25, 0.5, 0.75, 0.9)'}}]},nativeBytes=new Uint8Array(128);nativeBytes.fill(0x5a,80,96);const nativeDoc=SR.parse(nativeBytes,{name:'native_synth_verify.pkb'}),nativeLayout={recordDescriptors:[{id:'nrd',recordId:'nr',recordType:'Renderer',offset:64,end:80,size:16,status:'confirmed',fields:[{id:'na',propertyId:'alpha',propertyLabel:'Alpha',type:'f32',width:4,offset:64,value:0,evidenceStatus:'confirmed'},{id:'nr',propertyId:'color-r',propertyLabel:'Color R',type:'f32',width:4,offset:68,value:0,evidenceStatus:'confirmed'},{id:'ng',propertyId:'color-g',propertyLabel:'Color G',type:'f32',width:4,offset:72,value:0,evidenceStatus:'confirmed'},{id:'nb',propertyId:'color-b',propertyLabel:'Color B',type:'f32',width:4,offset:76,value:0,evidenceStatus:'confirmed'}]}],arrayDescriptors:[{id:'nra',kind:'array-layout',recordType:'Renderer',status:'confirmed',count:1,stride:32,baseOffset:64,itemRecordIds:['nr']}]},synth=MD.synthesizeNativeRecord(nativeDoc,nativeLayout,'nra',0,nativeProject,'native-renderer');if(synth.writes.length!==4||Math.abs(new DataView(Uint8Array.from(synth.bytes).buffer).getFloat32(0,true)-0.9)>1e-5||!synth.bytes.slice(16,32).every(x=>x===0x5a))throw new Error('PKB v1.5 native template synthesis verification failed');

  const npBytes=new Uint8Array(320),npDv=new DataView(npBytes.buffer);npDv.setUint32(4,64,true);npDv.setUint32(8,2,true);npDv.setUint32(12,128,true);npDv.setUint32(16,2,true);npDv.setUint32(20,192,true);npDv.setUint32(24,2,true);const npRel=(o,t)=>npDv.setInt32(o,t-(o+4),true);npRel(80,128);npRel(112,160);npRel(128,192);npRel(160,224);const npDoc=SR.parse(npBytes,{name:'native_write_verify.pkb'}),npRF=base=>[{id:'a'+base,propertyId:'alpha',propertyLabel:'Alpha',type:'f32',width:4,offset:base,evidenceStatus:'confirmed'},{id:'r'+base,propertyId:'color-r',propertyLabel:'Color R',type:'f32',width:4,offset:base+4,evidenceStatus:'confirmed'},{id:'g'+base,propertyId:'color-g',propertyLabel:'Color G',type:'f32',width:4,offset:base+8,evidenceStatus:'confirmed'},{id:'b'+base,propertyId:'color-b',propertyLabel:'Color B',type:'f32',width:4,offset:base+12,evidenceStatus:'confirmed'}],npLayout={recordDescriptors:[{id:'rd1',recordId:'r1',recordType:'Renderer',offset:64,end:84,size:20,status:'confirmed',fields:npRF(64)},{id:'rd2',recordId:'r2',recordType:'Renderer',offset:96,end:116,size:20,status:'confirmed',fields:npRF(96)},{id:'sd1',recordId:'s1',recordType:'Sampler',offset:128,end:136,size:8,status:'confirmed',fields:[]},{id:'sd2',recordId:'s2',recordType:'Sampler',offset:160,end:168,size:8,status:'confirmed',fields:[]},{id:'cd1',recordId:'c1',recordType:'Curve',offset:192,end:200,size:8,status:'confirmed',fields:[]},{id:'cd2',recordId:'c2',recordType:'Curve',offset:224,end:232,size:8,status:'confirmed',fields:[]}],arrayDescriptors:[{id:'ra',kind:'array-layout',recordType:'Renderer',status:'confirmed',count:2,stride:32,baseOffset:64,basePointerLinkId:'rb',countOffset:8,itemRecordIds:['r1','r2']},{id:'sa',kind:'array-layout',recordType:'Sampler',status:'confirmed',count:2,stride:32,baseOffset:128,basePointerLinkId:'sb',countOffset:16,itemRecordIds:['s1','s2']},{id:'ca',kind:'array-layout',recordType:'Curve',status:'confirmed',count:2,stride:32,baseOffset:192,basePointerLinkId:'cb',countOffset:24,itemRecordIds:['c1','c2']}],headers:[{id:'rh',collectionId:'ra',status:'confirmed'},{id:'sh',collectionId:'sa',status:'confirmed'},{id:'ch',collectionId:'ca',status:'confirmed'}]},npHierarchy={links:[{id:'rb',offset:4,pointerKind:'absolute-u32',targetOffset:64,targetRecordId:'r1',sourceRecordId:'',status:'confirmed'},{id:'sb',offset:12,pointerKind:'absolute-u32',targetOffset:128,targetRecordId:'s1',sourceRecordId:'',status:'confirmed'},{id:'cb',offset:20,pointerKind:'absolute-u32',targetOffset:192,targetRecordId:'c1',sourceRecordId:'',status:'confirmed'},{id:'r1s1',offset:80,pointerKind:'relative-i32',targetOffset:128,targetRecordId:'s1',sourceRecordId:'r1',status:'confirmed'},{id:'r2s2',offset:112,pointerKind:'relative-i32',targetOffset:160,targetRecordId:'s2',sourceRecordId:'r2',status:'confirmed'},{id:'s1c1',offset:128,pointerKind:'relative-i32',targetOffset:192,targetRecordId:'c1',sourceRecordId:'s1',status:'confirmed'},{id:'s2c2',offset:160,pointerKind:'relative-i32',targetOffset:224,targetRecordId:'c2',sourceRecordId:'s2',status:'confirmed'}]},npMulti={domains:[{id:'m1',status:'confirmed',arrayDescriptorIds:['ra','sa','ca'],recordTypes:['Renderer','Sampler','Curve']}]},npProject={renderers:[{id:'nr',name:'Native Renderer',type:'Billboard',properties:{Color:'(0.2,0.3,0.4,0.8)'}}],samplers:[{id:'ns',name:'Native Sampler',type:'Curve',properties:{}}],curves:[{id:'nc',name:'Native Curve',kind:'curve',channels:[]}],extensions:{nodeGraph:{nodes:[{id:'gnr',type:'Renderer',label:'Native Renderer',ref:'nr'},{id:'gns',type:'Sampler',label:'Native Sampler',ref:'ns'},{id:'gnc',type:'Curve',label:'Native Curve',ref:'nc'}],edges:[{id:'e1',from:'gnr',to:'gns',event:'flow'},{id:'e2',from:'gns',to:'gnc',event:'flow'}]}}};if(!NG.NODE_TYPES.includes('Curve'))throw new Error('Native Graph Curve node support verification failed');const npPlan=NP.buildPlan(npDoc,npProject,npProject.extensions.nodeGraph,npLayout,npHierarchy,npMulti,{domainId:'m1',rootNodeId:'gnr',alignment:16}),npApplied=NP.applyPlan(npDoc,npPlan),npOut=new DataView(npApplied.bytes.buffer),npRA=npPlan.transactionPlan.arrayPlans.find(x=>x.recordType==='Renderer'),npSA=npPlan.transactionPlan.arrayPlans.find(x=>x.recordType==='Sampler'),npCA=npPlan.transactionPlan.arrayPlans.find(x=>x.recordType==='Curve'),npR=npRA.newBase+64,npS=npSA.newBase+64,npC=npCA.newBase+64,npResolve=o=>o+4+npOut.getInt32(o,true);if(npPlan.summary.records!==3||npPlan.summary.templateScore<.95||npResolve(npR+16)!==npS||npResolve(npS)!==npC||!npApplied.verification.sourcePreservedOutsideMetadata)throw new Error('PKB v1.5 Native Write Plan verification failed');
  const baked=MB.bakeMathXYZ({variable:'t',min:0,max:1,x:'cos(t*tau)',y:'sin(t*tau)',z:'t',samples:32,a:1,b:1,c:1,d:1},{samples:32,tolerance:.001});
  if(baked.channels.length!==3||!baked.channels.every(ch=>ch.sourceSamples===32&&ch.reducedSamples>1))throw new Error('Effects Math Baker verification failed');

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
console.log('WC3 Asset Studio v1.5 build verification passed.');
