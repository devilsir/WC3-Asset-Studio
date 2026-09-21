/*
 * BLP Paint Reforged - Warcraft III model core
 * Portions of the format behavior and sanity rules are derived from mdx-m3-viewer
 * by Chananya Freiman and contributors (MIT License).
 * See THIRD_PARTY_LICENSES.md.
 */
(function(){
  'use strict';

  const TRACK_INFO = {
    KMTF:{components:1,kind:'uint',label:'Texture ID'}, KMTA:{components:1,kind:'float',label:'Alpha'}, KMTE:{components:1,kind:'float',label:'Emissive Gain'},
    KFC3:{components:3,kind:'float',label:'Fresnel Color'}, KFCA:{components:1,kind:'float',label:'Fresnel Opacity'}, KFTC:{components:1,kind:'float',label:'Fresnel Team Color'},
    KTAT:{components:3,kind:'float',label:'Translation'}, KTAR:{components:4,kind:'float',label:'Rotation'}, KTAS:{components:3,kind:'float',label:'Scaling'},
    KGAO:{components:1,kind:'float',label:'Alpha'}, KGAC:{components:3,kind:'float',label:'Color'},
    KGTR:{components:3,kind:'float',label:'Translation'}, KGRT:{components:4,kind:'float',label:'Rotation'}, KGSC:{components:3,kind:'float',label:'Scaling'},
    KLAS:{components:1,kind:'float',label:'Attenuation Start'}, KLAE:{components:1,kind:'float',label:'Attenuation End'}, KLAC:{components:3,kind:'float',label:'Color'}, KLAI:{components:1,kind:'float',label:'Intensity'}, KLBI:{components:1,kind:'float',label:'Ambient Intensity'}, KLBC:{components:3,kind:'float',label:'Ambient Color'}, KLAV:{components:1,kind:'float',label:'Visibility'},
    KATV:{components:1,kind:'float',label:'Visibility'},
    KPEE:{components:1,kind:'float',label:'Emission Rate'}, KPEG:{components:1,kind:'float',label:'Gravity'}, KPLN:{components:1,kind:'float',label:'Longitude'}, KPLT:{components:1,kind:'float',label:'Latitude'}, KPEL:{components:1,kind:'float',label:'Lifespan'}, KPES:{components:1,kind:'float',label:'Speed'}, KPEV:{components:1,kind:'float',label:'Visibility'},
    KP2E:{components:1,kind:'float',label:'Emission Rate'}, KP2G:{components:1,kind:'float',label:'Gravity'}, KP2L:{components:1,kind:'float',label:'Latitude'}, KP2R:{components:1,kind:'float',label:'Variation'}, KP2N:{components:1,kind:'float',label:'Length'}, KP2W:{components:1,kind:'float',label:'Width'}, KP2S:{components:1,kind:'float',label:'Speed'}, KP2V:{components:1,kind:'float',label:'Visibility'},
    KPPA:{components:1,kind:'float',label:'Alpha'}, KPPC:{components:3,kind:'float',label:'Color'}, KPPE:{components:1,kind:'float',label:'Emission Rate'}, KPPL:{components:1,kind:'float',label:'LifeSpan'}, KPPS:{components:1,kind:'float',label:'Speed'}, KPPV:{components:1,kind:'float',label:'Visibility'},
    KRHA:{components:1,kind:'float',label:'Height Above'}, KRHB:{components:1,kind:'float',label:'Height Below'}, KRAL:{components:1,kind:'float',label:'Alpha'}, KRCO:{components:3,kind:'float',label:'Color'}, KRTX:{components:1,kind:'uint',label:'Texture Slot'}, KRVS:{components:1,kind:'float',label:'Visibility'},
    KCTR:{components:3,kind:'float',label:'Camera Translation'}, KCRL:{components:1,kind:'float',label:'Camera Rotation'}, KTTR:{components:3,kind:'float',label:'Target Translation'},
  };
  const KNOWN_TOP_LEVEL = new Set(['VERS','MODL','SEQS','GLBS','MTLS','TEXS','TXAN','GEOS','GEOA','BONE','LITE','HELP','ATCH','PIVT','PREM','PRE2','CORN','RIBB','CAMS','EVTS','CLID','FAFX','BPOS']);
  const FILTER_MODES = ['None','Transparent','Blend','Additive','AddAlpha','Modulate','Modulate2x'];
  const P2_FILTER_MODES = ['Blend','Additive','Modulate','Modulate2x','AlphaKey'];
  const SAFE_LIMITS = Object.freeze({
    fileBytes: 512 * 1024 * 1024,
    tracks: 1000000,
    dynamicObjects: 100000,
    geosets: 4096,
    elements: 12000000,
    uvSets: 32,
    layers: 4096,
  });

  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function basename(path){ return String(path||'').replace(/\\/g,'/').split('/').pop()||''; }
  function normalizePath(path){ return String(path||'').replace(/\\/g,'/').toLowerCase(); }
  function blockEnd(text, braceStart){ let depth=0; for(let i=braceStart;i<text.length;i++){ const ch=text[i]; if(ch==='{')depth++; else if(ch==='}'){depth--;if(depth===0)return i;} } return -1; }
  function parseBraceBlocks(text, keyword){ const out=[]; const re=new RegExp('\\b'+keyword+'\\b','g'); let m; while((m=re.exec(text))){ const brace=text.indexOf('{',m.index+m[0].length); if(brace<0)continue; const end=blockEnd(text,brace); if(end<0)continue; out.push(text.slice(brace+1,end)); re.lastIndex=end+1; } return out; }
  function parseNamedBlocks(text, keyword){ const out=[]; const re=new RegExp('\\b'+keyword+'\\s+"([^"]+)"\\s*\\{','g'); let m; while((m=re.exec(text))){ const brace=text.indexOf('{',m.index+m[0].length-1); if(brace<0)continue; const end=blockEnd(text,brace); if(end<0)continue; out.push({name:m[1],body:text.slice(brace+1,end),start:m.index,end:end+1}); re.lastIndex=end+1; } return out; }
  function extractNumberBlock(body,key){ const rx=new RegExp('\\b'+key+'\\s+\\d+\\s*\\{','i'); const m=rx.exec(body); if(!m)return ''; const brace=body.indexOf('{',m.index+m[0].length-1); const end=blockEnd(body,brace); return brace>=0&&end>=0?body.slice(brace+1,end):''; }
  function extractTriplets(block){ const out=[]; const re=/\{\s*([\-\d.eE]+)\s*,\s*([\-\d.eE]+)\s*,\s*([\-\d.eE]+)\s*\}/g; let m; while((m=re.exec(block)))out.push([+m[1],+m[2],+m[3]]); return out; }
  function extractPairs(block){ const out=[]; const re=/\{\s*([\-\d.eE]+)\s*,\s*([\-\d.eE]+)\s*\}/g; let m; while((m=re.exec(block)))out.push([+m[1],+m[2]]); return out; }
  function extractScalar(body,key,def=0){ const m=body.match(new RegExp('(?:static\\s+)?'+key+'\\s+([\\-\\d.eE]+)','i')); return m?+m[1]:def; }
  function extractInt(body,key,def=0){ const m=body.match(new RegExp('(?:static\\s+)?'+key+'\\s+([\\-\\d]+)','i')); return m?parseInt(m[1],10):def; }
  function extractString(body,key,def=''){ const m=body.match(new RegExp(key+'\\s+"([^"]*)"','i')); return m?m[1]:def; }
  function extractVector(body,key,n,def){ const m=body.match(new RegExp('(?:static\\s+)?'+key+'\\s*\\{([^}]*)\\}','i')); if(!m)return def?def.slice():new Array(n).fill(0); const vals=m[1].split(',').map(x=>+x.trim()).filter(Number.isFinite); while(vals.length<n)vals.push(0); return vals.slice(0,n); }

  function parseMdlTrack(body,key,components,kind='float'){
    const re=new RegExp('\\b'+key+'\\s+\\d+\\s*\\{','i'); const m=re.exec(body); if(!m)return null;
    const brace=body.indexOf('{',m.index); const end=blockEnd(body,brace); if(end<0)return null; const block=body.slice(brace+1,end);
    let interpolation='Linear'; if(/DontInterp/i.test(block))interpolation='DontInterp'; else if(/Hermite/i.test(block))interpolation='Hermite'; else if(/Bezier/i.test(block))interpolation='Bezier';
    const globalSeq=(block.match(/GlobalSeqId\s+(-?\d+)/i)||[])[1]; const keys=[];
    const frameRe=/(\-?\d+)\s*:\s*(\{[^}]+\}|[\-\d.eE]+)\s*,?/g; let fm;
    while((fm=frameRe.exec(block))){
      let vals; if(fm[2].trim().startsWith('{')) vals=fm[2].replace(/[{}]/g,'').split(',').map(x=>kind==='uint'?(parseInt(x.trim(),10)>>>0):+x.trim()); else vals=[kind==='uint'?(parseInt(fm[2],10)>>>0):+fm[2]];
      vals=vals.slice(0,components); while(vals.length<components)vals.push(0);
      const after=block.slice(frameRe.lastIndex); let inTan=null,outTan=null;
      if(interpolation==='Hermite'||interpolation==='Bezier'){
        const im=after.match(/^\s*InTan\s*(\{[^}]+\}|[\-\d.eE]+)\s*,?/i); if(im){ inTan=im[1].replace(/[{}]/g,'').split(',').map(x=>+x.trim()).slice(0,components); while(inTan.length<components)inTan.push(0); }
        const consumed=im?im[0].length:0; const om=after.slice(consumed).match(/^\s*OutTan\s*(\{[^}]+\}|[\-\d.eE]+)\s*,?/i); if(om){ outTan=om[1].replace(/[{}]/g,'').split(',').map(x=>+x.trim()).slice(0,components); while(outTan.length<components)outTan.push(0); }
      }
      keys.push({frame:+fm[1],value:vals,inTan,outTan});
    }
    return {tag:'MDL',interpolation,interpolationType:['DontInterp','Linear','Hermite','Bezier'].indexOf(interpolation),globalSequenceId:globalSeq!=null?+globalSeq:-1,keys};
  }
  function collectMdlTracks(body,map){ const out={}; for(const [label,tag] of Object.entries(map||{})){ const info=TRACK_INFO[tag]; if(!info)continue; const tr=parseMdlTrack(body,label,info.components,info.kind); if(tr){tr.tag=tag;tr.label=info.label;out[tag]=tr;} } return out; }
  function convenienceTracks(obj){ obj.translation=obj.tracks.KGTR||null;obj.rotation=obj.tracks.KGRT||null;obj.scaling=obj.tracks.KGSC||null; return obj; }

  function parseMdlMatrixGroups(body){ const m=/Groups\s+\d+\s+\d+\s*\{/i.exec(body); if(!m)return []; const brace=body.indexOf('{',m.index),end=blockEnd(body,brace); if(end<0)return []; const block=body.slice(brace+1,end),out=[]; const re=/Matrices\s*\{([^}]*)\}/gi; let mm; while((mm=re.exec(block)))out.push((mm[1].match(/-?\d+/g)||[]).map(n=>n|0)); return out; }
  function computeBounds(geosets){ let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity,count=0; (geosets||[]).forEach(g=>(g.vertices||[]).forEach(v=>{count++;minX=Math.min(minX,v.x);minY=Math.min(minY,v.y);minZ=Math.min(minZ,v.z);maxX=Math.max(maxX,v.x);maxY=Math.max(maxY,v.y);maxZ=Math.max(maxZ,v.z);})); if(!count)return{center:{x:0,y:0,z:0},size:1,min:{x:0,y:0,z:0},max:{x:1,y:1,z:1}}; return{center:{x:(minX+maxX)/2,y:(minY+maxY)/2,z:(minZ+maxZ)/2},min:{x:minX,y:minY,z:minZ},max:{x:maxX,y:maxY,z:maxZ},size:Math.max(maxX-minX,maxY-minY,maxZ-minZ,1)}; }

  function parseMdlGeneric(type,obj,pivots){
    const body=obj.body; const objectId=extractInt(body,'ObjectId',-1); const p=body.match(/Parent\s+(\d+)/i); const parentId=p?+p[1]:-1;
    const tracks=collectMdlTracks(body,{Translation:'KGTR',Rotation:'KGRT',Scaling:'KGSC'});
    // Node flag bits: 0x1 translation, 0x2 rotation, 0x4 scaling.
    let flags=0; if(/DontInherit\s*\{[^}]*Translation/i.test(body))flags|=1; if(/DontInherit\s*\{[^}]*Rotation/i.test(body))flags|=2; if(/DontInherit\s*\{[^}]*Scaling/i.test(body))flags|=4; if(/Billboarded\b/i.test(body))flags|=8; if(/BillboardedLockX/i.test(body))flags|=16; if(/BillboardedLockY/i.test(body))flags|=32; if(/BillboardedLockZ/i.test(body))flags|=64; if(/CameraAnchored/i.test(body))flags|=128;
    return convenienceTracks({id:objectId,type,name:obj.name,parentId,flags,pivot:objectId>=0?pivots[objectId]||null:null,tracks});
  }

  function parseMDL(buffer){
    const text=typeof buffer==='string'?buffer:new TextDecoder('utf-8',{fatal:false}).decode(buffer);
    const formatVersion=+((text.match(/FormatVersion\s+(\d+)/i)||[])[1]||800);
    const modelMatch=text.match(/Model\s+"([^"]*)"\s*\{/i); const modelName=modelMatch?modelMatch[1]:'';
    const animationFile=extractString(text,'AnimationFile',''); const blendTime=extractInt(text,'BlendTime',0);
    const extent={boundsRadius:extractScalar(text,'BoundsRadius',0),min:extractVector(text,'MinimumExtent',3,[0,0,0]),max:extractVector(text,'MaximumExtent',3,[0,0,0])};

    const sequenceBlocks=parseNamedBlocks(text,'Anim');
    const sequences=sequenceBlocks.map((seq,i)=>{ const interval=seq.body.match(/Interval\s*\{\s*(\d+)\s*,\s*(\d+)\s*\}/i); const start=interval?+interval[1]:0,end=interval?+interval[2]:0; return{id:i,name:seq.name,start,end,length:end-start,moveSpeed:extractScalar(seq.body,'MoveSpeed',0),nonLooping:/\bNonLooping\b/i.test(seq.body)?1:0,rarity:extractScalar(seq.body,'Rarity',0),syncPoint:0,extent:{boundsRadius:extractScalar(seq.body,'BoundsRadius',0),min:extractVector(seq.body,'MinimumExtent',3,[0,0,0]),max:extractVector(seq.body,'MaximumExtent',3,[0,0,0])}}; });
    const globalSequences=[]; const gs=/GlobalSequences\s+\d+\s*\{/i.exec(text); if(gs){ const b=text.indexOf('{',gs.index),e=blockEnd(text,b); if(e>b){ const nums=(text.slice(b+1,e).match(/Duration\s+(\d+)/gi)||[]); nums.forEach(s=>globalSequences.push(+(s.match(/\d+/)||[0])[0])); } }

    const textureBlocks=parseBraceBlocks(text,'Bitmap');
    const textures=textureBlocks.map((body,i)=>({id:i,path:extractString(body,'Image',`Texture_${i}`),replaceableId:extractInt(body,'ReplaceableId',0),wrapWidth:/WrapWidth/i.test(body),wrapHeight:/WrapHeight/i.test(body)}));

    const textureAnimations=parseBraceBlocks(text,'TVertexAnim').map((body,i)=>({id:i,tracks:collectMdlTracks(body,{Translation:'KTAT',Rotation:'KTAR',Scaling:'KTAS'})}));

    const materials=parseBraceBlocks(text,'Material').map((body,i)=>{
      const layers=parseBraceBlocks(body,'Layer').map((lb,li)=>{
        const tracks=collectMdlTracks(lb,{TextureID:'KMTF',Alpha:'KMTA',EmissiveGain:'KMTE',FresnelColor:'KFC3',FresnelOpacity:'KFCA',FresnelTeamColor:'KFTC'});
        let filterMode=(lb.match(/FilterMode\s+(\w+)/i)||[])[1]||'None';
        return{id:li,filterMode,filterModeId:Math.max(0,FILTER_MODES.indexOf(filterMode)),flags:(/Unshaded/i.test(lb)?1:0)|(/SphereEnvMap/i.test(lb)?2:0)|(/TwoSided/i.test(lb)?16:0)|(/Unfogged/i.test(lb)?32:0)|(/NoDepthTest/i.test(lb)?64:0)|(/NoDepthSet/i.test(lb)?128:0)|(/Unlit/i.test(lb)?256:0),textureId:extractInt(lb,'TextureID',0),textureAnimationId:extractInt(lb,'TVertexAnimId',-1),coordId:extractInt(lb,'CoordId',0),alpha:extractScalar(lb,'Alpha',1),emissiveGain:extractScalar(lb,'EmissiveGain',1),fresnelColor:extractVector(lb,'FresnelColor',3,[1,1,1]),fresnelOpacity:extractScalar(lb,'FresnelOpacity',0),fresnelTeamColor:extractScalar(lb,'FresnelTeamColor',0),tracks,twoSided:/TwoSided/i.test(lb),unshaded:/Unshaded/i.test(lb)};
      });
      const first=layers[0]||{}; return{id:i,priorityPlane:extractInt(body,'PriorityPlane',0),flags:(/ConstantColor/i.test(body)?1:0)|(/TwoSided/i.test(body)?2:0)|(/SortPrimsNearZ/i.test(body)?8:0)|(/SortPrimsFarZ/i.test(body)?16:0)|(/FullResolution/i.test(body)?32:0),shader:extractString(body,'Shader',''),layers,textureId:first.textureId||0,filterMode:first.filterMode||'None',twoSided:!!(first.twoSided||/TwoSided/i.test(body)),unshaded:!!first.unshaded};
    });

    const geosets=parseBraceBlocks(text,'Geoset').map((body,i)=>{
      const vertices=extractTriplets(extractNumberBlock(body,'Vertices')).map(v=>({x:v[0],y:v[1],z:v[2]}));
      const normals=extractTriplets(extractNumberBlock(body,'Normals')).map(v=>({x:v[0],y:v[1],z:v[2]}));
      const uvSets=[]; const tvRe=/TVertices\s+\d+\s*\{/gi; let tvm; while((tvm=tvRe.exec(body))){const b=body.indexOf('{',tvm.index),e=blockEnd(body,b);if(e>b){uvSets.push(extractPairs(body.slice(b+1,e)).map(v=>({u:v[0],v:v[1]})));tvRe.lastIndex=e+1;}}
      const triMatch=/Triangles\s*\{/i.exec(body); let triBlock=''; if(triMatch){const b=body.indexOf('{',triMatch.index),e=blockEnd(body,b);if(e>b)triBlock=body.slice(b+1,e);} const triNums=(triBlock.match(/-?\d+/g)||[]).map(n=>n|0),faces=[]; for(let fi=0;fi+2<triNums.length;fi+=3)faces.push([triNums[fi],triNums[fi+1],triNums[fi+2]]);
      const materialId=extractInt(body,'MaterialID',0),vertexGroups=((body.match(/VertexGroup\s*\{([\s\S]*?)\}/i)||[])[1]||'').match(/-?\d+/g)||[],matrixGroups=parseMdlMatrixGroups(body),skinBlock=extractNumberBlock(body,'SkinWeights');
      const skin=skinBlock?(skinBlock.match(/-?\d+/g)||[]).map(n=>clamp(n|0,0,255)):[]; const lod=extractInt(body,'LevelOfDetail',-1),name=extractString(body,'Name','');
      return{id:i,materialId,textureId:(materials[materialId]&&materials[materialId].textureId)||0,vertices,normals,uvSets,tverts:uvSets[0]||[],faces,vertexGroups:vertexGroups.map(Number),matrixGroups,skin,tangents:extractTriplets(extractNumberBlock(body,'Tangents')),lod,name,selectionGroup:extractInt(body,'SelectionGroup',0),selectionFlags:/Unselectable/i.test(body)?4:0,extent:{boundsRadius:extractScalar(body,'BoundsRadius',0),min:extractVector(body,'MinimumExtent',3,[0,0,0]),max:extractVector(body,'MaximumExtent',3,[0,0,0])},sequenceExtents:[]};
    }).filter(g=>g.vertices.length&&g.faces.length);

    const geosetAnimations=parseBraceBlocks(text,'GeosetAnim').map((body,i)=>({id:i,alpha:extractScalar(body,'Alpha',1),flags:(/DropShadow/i.test(body)?1:0)|(/\bColor\b/i.test(body)?2:0),color:extractVector(body,'Color',3,[1,1,1]),geosetId:extractInt(body,'GeosetId',-1),tracks:collectMdlTracks(body,{Alpha:'KGAO',Color:'KGAC'})}));

    const pivots=extractTriplets(extractNumberBlock(text,'PivotPoints')).map(v=>({x:v[0],y:v[1],z:v[2]}));
    const nodes=[];
    function addGeneric(type,keyword,decorate){ parseNamedBlocks(text,keyword).forEach(obj=>{const n=parseMdlGeneric(type,obj,pivots); if(decorate)decorate(n,obj.body);nodes.push(n);}); }
    addGeneric('Bone','Bone',(n,b)=>{const gm=(b.match(/GeosetId\s+([^,\s]+)/i)||[])[1]; n.geosetId=gm==='Multiple'?-1:(gm!=null?+gm:-1); const ga=(b.match(/GeosetAnimId\s+([^,\s]+)/i)||[])[1]; n.geosetAnimId=ga==='None'?-1:(ga!=null?+ga:-1);});
    addGeneric('Helper','Helper');
    addGeneric('Attachment','Attachment',(n,b)=>{n.path=extractString(b,'Path','');n.attachmentId=extractInt(b,'AttachmentID',0);Object.assign(n.tracks,collectMdlTracks(b,{Visibility:'KATV'}));});
    addGeneric('Light','Light',(n,b)=>{n.lightType=/Directional/i.test(b)?1:/Ambient/i.test(b)?2:0;n.attenuation=[extractScalar(b,'AttenuationStart',0),extractScalar(b,'AttenuationEnd',0)];n.color=extractVector(b,'Color',3,[1,1,1]);n.intensity=extractScalar(b,'Intensity',0);n.ambientColor=extractVector(b,'AmbColor',3,[0,0,0]);n.ambientIntensity=extractScalar(b,'AmbIntensity',0);Object.assign(n.tracks,collectMdlTracks(b,{AttenuationStart:'KLAS',AttenuationEnd:'KLAE',Color:'KLAC',Intensity:'KLAI',AmbIntensity:'KLBI',AmbColor:'KLBC',Visibility:'KLAV'}));});
    addGeneric('ParticleEmitter','ParticleEmitter',(n,b)=>{n.emissionRate=extractScalar(b,'EmissionRate',0);n.gravity=extractScalar(b,'Gravity',0);n.longitude=extractScalar(b,'Longitude',0);n.latitude=extractScalar(b,'Latitude',0);n.path=extractString(b,'Path','');n.lifeSpan=extractScalar(b,'LifeSpan',0);n.speed=extractScalar(b,'InitVelocity',0);Object.assign(n.tracks,collectMdlTracks(b,{EmissionRate:'KPEE',Gravity:'KPEG',Longitude:'KPLN',Latitude:'KPLT',LifeSpan:'KPEL',InitVelocity:'KPES',Visibility:'KPEV'}));});
    addGeneric('ParticleEmitter2','ParticleEmitter2',(n,b)=>{n.speed=extractScalar(b,'Speed',0);n.variation=extractScalar(b,'Variation',0);n.latitude=extractScalar(b,'Latitude',0);n.gravity=extractScalar(b,'Gravity',0);n.lifeSpan=extractScalar(b,'LifeSpan',0);n.emissionRate=extractScalar(b,'EmissionRate',0);n.width=extractScalar(b,'Width',0);n.length=extractScalar(b,'Length',0);n.filterMode=/Additive/i.test(b)?1:/Modulate2x/i.test(b)?3:/Modulate/i.test(b)?2:/AlphaKey/i.test(b)?4:0;n.rows=extractInt(b,'Rows',0);n.columns=extractInt(b,'Columns',0);n.headOrTail=/\bBoth\b/i.test(b)?2:/\bTail\b/i.test(b)?1:0;n.tailLength=extractScalar(b,'TailLength',0);n.timeMiddle=extractScalar(b,'Time',0);n.textureId=extractInt(b,'TextureID',-1);n.replaceableId=extractInt(b,'ReplaceableId',0);n.squirt=/\bSquirt\b/i.test(b)?1:0;n.priorityPlane=extractInt(b,'PriorityPlane',0);Object.assign(n.tracks,collectMdlTracks(b,{Speed:'KP2S',Variation:'KP2R',Latitude:'KP2L',Gravity:'KP2G',EmissionRate:'KP2E',Width:'KP2N',Length:'KP2W',Visibility:'KP2V'}));});
    addGeneric('ParticleEmitterPopcorn','ParticleEmitterPopcorn',(n,b)=>{n.lifeSpan=extractScalar(b,'LifeSpan',0);n.emissionRate=extractScalar(b,'EmissionRate',0);n.speed=extractScalar(b,'Speed',0);n.color=extractVector(b,'Color',3,[1,1,1]);n.alpha=extractScalar(b,'Alpha',1);n.replaceableId=extractInt(b,'ReplaceableId',0);n.path=extractString(b,'Path','');n.animationVisibilityGuide=extractString(b,'AnimVisibilityGuide','');Object.assign(n.tracks,collectMdlTracks(b,{LifeSpan:'KPPL',EmissionRate:'KPPE',Speed:'KPPS',Color:'KPPC',Alpha:'KPPA',Visibility:'KPPV'}));});
    addGeneric('RibbonEmitter','RibbonEmitter',(n,b)=>{n.heightAbove=extractScalar(b,'HeightAbove',0);n.heightBelow=extractScalar(b,'HeightBelow',0);n.alpha=extractScalar(b,'Alpha',0);n.color=extractVector(b,'Color',3,[1,1,1]);n.lifeSpan=extractScalar(b,'LifeSpan',0);n.textureSlot=extractInt(b,'TextureSlot',0);n.emissionRate=extractInt(b,'EmissionRate',0);n.rows=extractInt(b,'Rows',0);n.columns=extractInt(b,'Columns',0);n.materialId=extractInt(b,'MaterialID',0);n.gravity=extractScalar(b,'Gravity',0);Object.assign(n.tracks,collectMdlTracks(b,{HeightAbove:'KRHA',HeightBelow:'KRHB',Alpha:'KRAL',Color:'KRCO',TextureSlot:'KRTX',Visibility:'KRVS'}));});
    addGeneric('EventObject','EventObject',(n,b)=>{const em=/EventTrack\s+\d+\s*\{/i.exec(b);n.globalSequenceId=-1;n.eventTracks=[];if(em){const bb=b.indexOf('{',em.index),ee=blockEnd(b,bb),sub=b.slice(bb+1,ee);const gs=(sub.match(/GlobalSeqId\s+(-?\d+)/i)||[])[1];n.globalSequenceId=gs!=null?+gs:-1;n.eventTracks=(sub.match(/\b\d+\b/g)||[]).map(Number).filter(x=>gs==null||x!==+gs);}});
    addGeneric('CollisionShape','CollisionShape',(n,b)=>{n.shape=/\bPlane\b/i.test(b)?1:/\bSphere\b/i.test(b)?2:/\bCylinder\b/i.test(b)?3:0;const vs=extractTriplets(extractNumberBlock(b,'Vertices'));n.collisionVertices=vs.map(v=>({x:v[0],y:v[1],z:v[2]}));n.boundsRadius=extractScalar(b,'BoundsRadius',0);});
    // Preserve the textual Bone block order before sorting the general node list. Reforged
    // SkinWeights use this bone-order index space, just like the binary BONE chunk.
    const bones=nodes.filter(n=>n.type==='Bone');
    const helpers=nodes.filter(n=>n.type==='Helper');
    nodes.sort((a,b)=>a.id-b.id);

    const cameras=parseNamedBlocks(text,'Camera').map((c,i)=>({id:i,name:c.name,position:extractVector(c.body,'Position',3,[0,0,0]),fieldOfView:extractScalar(c.body,'FieldOfView',0),farClippingPlane:extractScalar(c.body,'FarClip',0),nearClippingPlane:extractScalar(c.body,'NearClip',0),targetPosition:(()=>{const tm=/Target\s*\{/i.exec(c.body);if(!tm)return[0,0,0];const b=c.body.indexOf('{',tm.index),e=blockEnd(c.body,b);return extractVector(c.body.slice(b+1,e),'Position',3,[0,0,0]);})(),tracks:collectMdlTracks(c.body,{Translation:'KCTR',Rotation:'KCRL'})}));
    const faceEffects=parseBraceBlocks(text,'FaceFX').map((b,i)=>({id:i,path:extractString(b,'Path',''),type:extractString(b,'Target','')}));
    const bindPose=[]; const bp=/BindPose\s+\d+\s*\{/i.exec(text); if(bp){const b=text.indexOf('{',bp.index),e=blockEnd(text,b),nums=(text.slice(b+1,e).match(/[\-\d.eE]+/g)||[]).map(Number);for(let i=0;i+11<nums.length;i+=12)bindPose.push(nums.slice(i,i+12));}

    const unknownChunks=[]; // MDL is token based; unknown top-level blocks are deliberately not rewritten by this editor yet.
    const hdSkinGeosets=geosets.filter(g=>g.skin&&g.skin.length>=g.vertices.length*8).length;
    const skinningScheme=hdSkinGeosets?'reforged-skin4':'classic-matrix-groups';
    const summary=`MDL text model v${formatVersion}\nTextures: ${textures.length}\nMaterials: ${materials.length}\nGeosets: ${geosets.length}\nSkinning: ${skinningScheme}\nSequences: ${sequences.length}\nNodes/effects: ${nodes.length}`;
    return {type:'MDL',formatVersion,version:formatVersion,name:modelName,animationFile,blendTime,extent,sequences,globalSequences,textures:textures.map(t=>t.path),textureDefs:textures,textureAnimations,materials,geosets,geosetAnimations,pivots,nodes,bones,helpers,cameras,faceEffects,bindPose,unknownChunks,skinningScheme,bounds:computeBounds(geosets),summary};
  }

  function parseMDX(buffer){
    const view=new DataView(buffer); const bytes=new Uint8Array(buffer);
    if(view.byteLength > SAFE_LIMITS.fileBytes) throw new Error(`Model is too large for the web reader (${(view.byteLength/1024/1024).toFixed(1)} MB).`);
    if(view.byteLength<4||String.fromCharCode(...bytes.slice(0,4))!=='MDLX')throw new Error('Invalid MDX header.');
    const latin=new TextDecoder('latin1');
    function tagAt(off){return String.fromCharCode(view.getUint8(off),view.getUint8(off+1),view.getUint8(off+2),view.getUint8(off+3));}
    function zstr(off,len){let end=off;while(end<off+len&&view.getUint8(end)!==0)end++;return latin.decode(bytes.slice(off,end));}
    function chunks(){const out=[];let off=4;while(off+8<=view.byteLength){const tag=tagAt(off),size=view.getUint32(off+4,true),start=off+8,end=start+size;if(end>view.byteLength)throw new Error(`Truncated MDX chunk ${tag}.`);out.push({tag,size,start,end,header:off});off=end;}return out;}
    const chunkList=chunks(), chunkMap=new Map(); chunkList.forEach(c=>{if(!chunkMap.has(c.tag))chunkMap.set(c.tag,[]);chunkMap.get(c.tag).push(c);}); const first=t=>(chunkMap.get(t)||[])[0]||null;
    const vers=first('VERS'); const formatVersion=vers&&vers.size>=4?view.getUint32(vers.start,true):800;
    const unknownChunks=chunkList.filter(c=>!KNOWN_TOP_LEVEL.has(c.tag)).map(c=>({tag:c.tag,size:c.size,offset:c.header,data:bytes.slice(c.start,c.end)}));
    let name='',animationFile='',blendTime=0,extent={boundsRadius:0,min:[0,0,0],max:[0,0,0]}; const modl=first('MODL'); if(modl&&modl.size>=372){name=zstr(modl.start,80);animationFile=zstr(modl.start+80,260);const p=modl.start+340;extent={boundsRadius:view.getFloat32(p,true),min:[view.getFloat32(p+4,true),view.getFloat32(p+8,true),view.getFloat32(p+12,true)],max:[view.getFloat32(p+16,true),view.getFloat32(p+20,true),view.getFloat32(p+24,true)]};blendTime=view.getUint32(p+28,true);}
    function readExtent(off){return{boundsRadius:view.getFloat32(off,true),min:[view.getFloat32(off+4,true),view.getFloat32(off+8,true),view.getFloat32(off+12,true)],max:[view.getFloat32(off+16,true),view.getFloat32(off+20,true),view.getFloat32(off+24,true)]};}
    const sequences=[]; const seqs=first('SEQS'); if(seqs){for(let off=seqs.start,i=0;off+132<=seqs.end;off+=132,i++){const start=view.getUint32(off+80,true),end=view.getUint32(off+84,true);sequences.push({id:i,name:zstr(off,80)||`Sequence_${i}`,start,end,length:end-start,moveSpeed:view.getFloat32(off+88,true),nonLooping:view.getUint32(off+92,true),rarity:view.getFloat32(off+96,true),syncPoint:view.getUint32(off+100,true),extent:readExtent(off+104)});}}
    const globalSequences=[]; const glbs=first('GLBS'); if(glbs){for(let p=glbs.start;p+4<=glbs.end;p+=4)globalSequences.push(view.getUint32(p,true));}
    const textures=[]; const texs=first('TEXS'); if(texs){for(let off=texs.start,i=0;off+268<=texs.end;off+=268,i++)textures.push({id:i,replaceableId:view.getUint32(off,true),path:zstr(off+4,260),flags:view.getUint32(off+264,true),wrapWidth:!!(view.getUint32(off+264,true)&1),wrapHeight:!!(view.getUint32(off+264,true)&2)});}

    function parseAnimationAt(pos,limit){if(pos+16>limit)return null;const tag=tagAt(pos),info=TRACK_INFO[tag];if(!info)return null;const count=view.getUint32(pos+4,true),interp=view.getUint32(pos+8,true),globalRaw=view.getInt32(pos+12,true);if(count>SAFE_LIMITS.tracks)throw new Error(`Invalid ${tag} track count: ${count}`);let p=pos+16;const keys=[],tangent=interp>1;for(let i=0;i<count;i++){const need=4+info.components*4*(tangent?3:1);if(p+need>limit)return null;const frame=view.getInt32(p,true);p+=4;const readValue=()=>{const a=[];for(let c=0;c<info.components;c++,p+=4)a.push(info.kind==='uint'?view.getUint32(p,true):view.getFloat32(p,true));return a;};const value=readValue();let inTan=null,outTan=null;if(tangent){inTan=readValue();outTan=readValue();}keys.push({frame,value,inTan,outTan});}return{tag,track:{tag,label:info.label,interpolation:['DontInterp','Linear','Hermite','Bezier'][interp]||`Type${interp}`,interpolationType:interp,globalSequenceId:globalRaw,keys},next:p};}
    function parseAnimations(pos,limit){const out={};while(pos+16<=limit){const a=parseAnimationAt(pos,limit);if(!a)break;out[a.tag]=a.track;pos=a.next;}return{tracks:out,next:pos};}
    function parseGeneric(pos,limit){if(pos+96>limit)return null;const size=view.getUint32(pos,true),end=pos+size;if(size<96||end>limit)return null;const id=view.getInt32(pos+84,true),rawParent=view.getInt32(pos+88,true),flags=view.getUint32(pos+92,true);const a=parseAnimations(pos+96,end);const node=convenienceTracks({id,type:'Generic',name:zstr(pos+4,80),parentId:rawParent===-1?-1:rawParent,flags,pivot:null,tracks:a.tracks,genericSize:size,genericStart:pos,genericEnd:end});return node;}
    function parseDynamicOuter(chunk,handler){const out=[];if(!chunk)return out;let off=chunk.start;while(off+4<=chunk.end){if(out.length>=SAFE_LIMITS.dynamicObjects)throw new Error(`Too many objects in ${chunk.tag}.`);const size=view.getUint32(off,true);if(size<4||off+size>chunk.end)break;out.push(handler(off,size,out.length));off+=size;}return out;}

    const textureAnimations=parseDynamicOuter(first('TXAN'),(off,size,i)=>({id:i,tracks:parseAnimations(off+4,off+size).tracks}));

    // Material layout is detected structurally. Shipping Reforged v1200 files put
    // LAYS immediately after size/priority/flags, while older Reforged variants may
    // carry an 80-byte shader string before LAYS.
    const materials=parseDynamicOuter(first('MTLS'),(off,size,i)=>{
      const end=off+size; let p=off+4;
      const priorityPlane=view.getInt32(p,true);p+=4;
      const flags=view.getUint32(p,true);p+=4;
      let shader='',layout='classic';
      if(p+8<=end && tagAt(p)==='LAYS'){
        layout=formatVersion>=1200?'reforged-1200':'classic';
      }else if(p+88<=end && tagAt(p+80)==='LAYS'){
        shader=zstr(p,80);p+=80;layout='legacy-reforged-shader-name';
      }
      const layers=[];
      if(p+8<=end&&tagAt(p)==='LAYS'){
        const count=view.getUint32(p+4,true);
        if(count>SAFE_LIMITS.layers)throw new Error(`Invalid material layer count: ${count}`);
        p+=8;
        for(let li=0;li<count&&p+4<=end;li++){
          const ls=view.getUint32(p,true),le=p+ls;
          if(ls<28||le>end)break;
          let q=p+4;
          const filterModeId=view.getUint32(q,true);q+=4;
          const lflags=view.getUint32(q,true);q+=4;
          let textureId=view.getInt32(q,true);q+=4;
          const textureAnimationId=view.getInt32(q,true);q+=4;
          const coordId=view.getUint32(q,true);q+=4;
          const alpha=view.getFloat32(q,true);q+=4;
          let emissiveGain=1,fresnelColor=[1,1,1],fresnelOpacity=0,fresnelTeamColor=0;
          if(formatVersion>800&&q+24<=le&&!TRACK_INFO[tagAt(q)]){
            emissiveGain=view.getFloat32(q,true);q+=4;
            fresnelColor=[view.getFloat32(q,true),view.getFloat32(q+4,true),view.getFloat32(q+8,true)];q+=12;
            fresnelOpacity=view.getFloat32(q,true);q+=4;
            fresnelTeamColor=view.getFloat32(q,true);q+=4;
          }
          const textureSlots={}; let slotTableUnknown=null,slotCount=0;
          if(q+8<=le&&!TRACK_INFO[tagAt(q)]){
            const unknown=view.getInt32(q,true),possibleCount=view.getInt32(q+4,true);
            const tableEnd=q+8+possibleCount*8;
            let plausible=(unknown===0||unknown===1)&&possibleCount>=0&&possibleCount<=16&&tableEnd<=le;
            if(plausible){
              for(let si=0;si<possibleCount;si++){
                const slot=view.getInt32(q+12+si*8,true);
                if(slot<0||slot>31){plausible=false;break;}
              }
              if(plausible && tableEnd<le && !TRACK_INFO[tagAt(tableEnd)]) plausible=false;
            }
            if(plausible){
              slotTableUnknown=unknown;slotCount=possibleCount;q+=8;
              for(let si=0;si<slotCount;si++){
                const tid=view.getInt32(q,true),slot=view.getInt32(q+4,true);q+=8;
                textureSlots[slot]=tid;
              }
              if(Object.prototype.hasOwnProperty.call(textureSlots,0))textureId=textureSlots[0];
            }
          }
          const tracks=parseAnimations(q,le).tracks;
          layers.push({id:li,filterModeId,filterMode:FILTER_MODES[filterModeId]||`Filter ${filterModeId}`,flags:lflags,textureId,textureAnimationId,coordId,alpha,emissiveGain,fresnelColor,fresnelOpacity,fresnelTeamColor,textureSlots,slotTableUnknown,slotCount,normalTextureId:textureSlots[1]??-1,ormTextureId:textureSlots[2]??-1,emissiveTextureId:textureSlots[3]??-1,teamColorTextureId:textureSlots[4]??-1,reflectionsTextureId:textureSlots[5]??-1,tracks,twoSided:!!(lflags&16),unshaded:!!(lflags&1)});
          p=le;
        }
      }
      const l0=layers[0]||{};
      return{id:i,priorityPlane,flags,shader,layout,layers,textureId:l0.textureId??0,filterMode:l0.filterMode||'None',twoSided:!!(flags&2)||!!l0.twoSided,unshaded:!!l0.unshaded};
    });

    function parseGeosets(){const ch=first('GEOS');if(!ch)return[];const out=[];let off=ch.start;while(off+4<=ch.end){if(out.length>=SAFE_LIMITS.geosets)throw new Error('Too many geosets in model.');const recSize=view.getUint32(off,true),recEnd=off+recSize;if(recSize<64||recEnd>ch.end)break;let p=off+4;function countChunk(tag,bpe){if(p+8>recEnd||tagAt(p)!==tag)return null;const count=view.getUint32(p+4,true),start=p+8;if(count>SAFE_LIMITS.elements)throw new Error(`Invalid ${tag} element count: ${count}`);const end=start+count*bpe;if(end>recEnd)return null;p=end;return{count,start,end};}
      const vrtx=countChunk('VRTX',12);if(!vrtx)break;const vertices=[];for(let x=vrtx.start;x<vrtx.end;x+=12)vertices.push({x:view.getFloat32(x,true),y:view.getFloat32(x+4,true),z:view.getFloat32(x+8,true)});
      const nrms=countChunk('NRMS',12);if(!nrms)break;const normals=[];for(let x=nrms.start;x<nrms.end;x+=12)normals.push({x:view.getFloat32(x,true),y:view.getFloat32(x+4,true),z:view.getFloat32(x+8,true)});
      const ptyp=countChunk('PTYP',4);if(!ptyp)break;const faceTypeGroups=[];for(let x=ptyp.start;x<ptyp.end;x+=4)faceTypeGroups.push(view.getUint32(x,true));
      const pcnt=countChunk('PCNT',4);if(!pcnt)break;const faceGroups=[];for(let x=pcnt.start;x<pcnt.end;x+=4)faceGroups.push(view.getUint32(x,true));
      const pvtx=countChunk('PVTX',2);if(!pvtx)break;const indices=[];for(let x=pvtx.start;x<pvtx.end;x+=2)indices.push(view.getUint16(x,true));
      const gndx=countChunk('GNDX',1);if(!gndx)break;const vertexGroups=Array.from(bytes.slice(gndx.start,gndx.end));
      const mtgc=countChunk('MTGC',4);if(!mtgc)break;const groupCounts=[];for(let x=mtgc.start;x<mtgc.end;x+=4)groupCounts.push(view.getUint32(x,true));
      const mats=countChunk('MATS',4);if(!mats)break;const matrixIndices=[];for(let x=mats.start;x<mats.end;x+=4)matrixIndices.push(view.getUint32(x,true));const matrixGroups=[];let mi=0;for(const n of groupCounts){matrixGroups.push(matrixIndices.slice(mi,mi+n));mi+=n;}
      if(p+12>recEnd)break;const materialId=view.getUint32(p,true),selectionGroup=view.getUint32(p+4,true),selectionFlags=view.getUint32(p+8,true);p+=12;let lod=-1,geosetName='';if(formatVersion>800){if(p+84>recEnd)break;lod=view.getInt32(p,true);geosetName=zstr(p+4,80);p+=84;}
      if(p+28>recEnd)break;const geoExtent=readExtent(p);p+=28;if(p+4>recEnd)break;const seqCount=view.getUint32(p,true);p+=4;const sequenceExtents=[];for(let i=0;i<seqCount&&p+28<=recEnd;i++,p+=28)sequenceExtents.push(readExtent(p));
      // Optional Reforged chunks are detected structurally, not only from VERS.
      let tangents=[],skin=[];if(p+8<=recEnd&&tagAt(p)==='TANG'){const n=view.getUint32(p+4,true),s=p+8,e=s+n*16;if(e<=recEnd){for(let x=s;x<e;x+=16)tangents.push([view.getFloat32(x,true),view.getFloat32(x+4,true),view.getFloat32(x+8,true),view.getFloat32(x+12,true)]);p=e;}}
      if(p+8<=recEnd&&tagAt(p)==='SKIN'){const n=view.getUint32(p+4,true),s=p+8,e=s+n;if(e<=recEnd){skin=Array.from(bytes.slice(s,e));p=e;}}
      const uvSets=[];if(p+8<=recEnd&&tagAt(p)==='UVAS'){const n=view.getUint32(p+4,true);if(n>SAFE_LIMITS.uvSets)throw new Error(`Invalid UV set count: ${n}`);p+=8;for(let u=0;u<n;u++){if(p+8>recEnd||tagAt(p)!=='UVBS')break;const count=view.getUint32(p+4,true),s=p+8,e=s+count*8;if(e>recEnd)break;const uv=[];for(let x=s;x<e;x+=8)uv.push({u:view.getFloat32(x,true),v:view.getFloat32(x+4,true)});uvSets.push(uv);p=e;}}
      const faces=[];for(let i=0;i+2<indices.length;i+=3)faces.push([indices[i],indices[i+1],indices[i+2]]);out.push({id:out.length,materialId,textureId:(materials[materialId]&&materials[materialId].textureId)||0,vertices,normals,uvSets,tverts:uvSets[0]||[],faces,faceTypeGroups,faceGroups,vertexGroups,matrixGroups,matrixIndices,skin,tangents,lod,name:geosetName,selectionGroup,selectionFlags,extent:geoExtent,sequenceExtents});off=recEnd;}return out;}
    const geosets=parseGeosets();

    const geosetAnimations=parseDynamicOuter(first('GEOA'),(off,size,i)=>{let p=off+4;const alpha=view.getFloat32(p,true);p+=4;const flags=view.getUint32(p,true);p+=4;const color=[view.getFloat32(p,true),view.getFloat32(p+4,true),view.getFloat32(p+8,true)];p+=12;const geosetId=view.getInt32(p,true);p+=4;return{id:i,alpha,flags,color,geosetId,tracks:parseAnimations(p,off+size).tracks};});

    const pivots=[];const pivt=first('PIVT');if(pivt){for(let p=pivt.start;p+12<=pivt.end;p+=12)pivots.push({x:view.getFloat32(p,true),y:view.getFloat32(p+4,true),z:view.getFloat32(p+8,true)});}
    function decorateGeneric(n,type){n.type=type;n.pivot=n.id>=0?pivots[n.id]||null:null;return n;}
    function parseSimpleGenericChunk(tag,type,tailParser){const ch=first(tag),out=[];if(!ch)return out;let off=ch.start;while(off+96<=ch.end){if(out.length>=SAFE_LIMITS.dynamicObjects)throw new Error(`Too many ${type} objects.`);const g=parseGeneric(off,ch.end);if(!g)break;decorateGeneric(g,type);let end=g.genericEnd;if(tailParser)end=tailParser(g,end,ch.end);out.push(g);if(end<=off)break;off=end;}return out;}
    // Preserve BONE chunk order exactly: Reforged SKIN indices address this bone order,
    // not objectIds and not the classic MATS/matrix-group palette.
    const bones=parseSimpleGenericChunk('BONE','Bone',(n,p,end)=>{if(p+8>end)return p;n.geosetId=view.getInt32(p,true);n.geosetAnimId=view.getInt32(p+4,true);return p+8;});
    const helpers=parseSimpleGenericChunk('HELP','Helper');
    const eventObjects=parseSimpleGenericChunk('EVTS','EventObject',(n,p,end)=>{if(p+12>end||tagAt(p)!=='KEVT')return p;const count=view.getUint32(p+4,true);n.globalSequenceId=view.getInt32(p+8,true);n.eventTracks=[];let q=p+12;for(let i=0;i<count&&q+4<=end;i++,q+=4)n.eventTracks.push(view.getUint32(q,true));return q;});
    const collisionShapes=parseSimpleGenericChunk('CLID','CollisionShape',(n,p,end)=>{if(p+16>end)return p;n.shape=view.getUint32(p,true);p+=4;n.collisionVertices=[{x:view.getFloat32(p,true),y:view.getFloat32(p+4,true),z:view.getFloat32(p+8,true)}];p+=12;if(n.shape!==2&&p+12<=end){n.collisionVertices.push({x:view.getFloat32(p,true),y:view.getFloat32(p+4,true),z:view.getFloat32(p+8,true)});p+=12;}if((n.shape===2||n.shape===3)&&p+4<=end){n.boundsRadius=view.getFloat32(p,true);p+=4;}return p;});

    function parseOuterGenericChunk(tag,type,fixedReader){const ch=first(tag),out=[];if(!ch)return out;let off=ch.start;while(off+4<=ch.end){if(out.length>=SAFE_LIMITS.dynamicObjects)throw new Error(`Too many ${type} objects.`);const total=view.getUint32(off,true),end=off+total;if(total<8||end>ch.end)break;const g=parseGeneric(off+4,end);if(!g)break;decorateGeneric(g,type);let p=g.genericEnd;if(fixedReader)p=fixedReader(g,p,end);const extra=parseAnimations(p,end);Object.assign(g.tracks,extra.tracks);convenienceTracks(g);out.push(g);off=end;}return out;}
    const attachments=parseOuterGenericChunk('ATCH','Attachment',(n,p,end)=>{if(p+264>end)return p;n.path=zstr(p,260);n.attachmentId=view.getInt32(p+260,true);return p+264;});
    const lights=parseOuterGenericChunk('LITE','Light',(n,p,end)=>{if(p+48>end)return p;n.lightType=view.getUint32(p,true);p+=4;n.attenuation=[view.getFloat32(p,true),view.getFloat32(p+4,true)];p+=8;n.color=[view.getFloat32(p,true),view.getFloat32(p+4,true),view.getFloat32(p+8,true)];p+=12;n.intensity=view.getFloat32(p,true);p+=4;n.ambientColor=[view.getFloat32(p,true),view.getFloat32(p+4,true),view.getFloat32(p+8,true)];p+=12;n.ambientIntensity=view.getFloat32(p,true);return p+4;});
    const particleEmitters=parseOuterGenericChunk('PREM','ParticleEmitter',(n,p,end)=>{if(p+284>end)return p;n.emissionRate=view.getFloat32(p,true);n.gravity=view.getFloat32(p+4,true);n.longitude=view.getFloat32(p+8,true);n.latitude=view.getFloat32(p+12,true);n.path=zstr(p+16,260);n.lifeSpan=view.getFloat32(p+276,true);n.speed=view.getFloat32(p+280,true);return p+284;});
    const particleEmitters2=parseOuterGenericChunk('PRE2','ParticleEmitter2',(n,p,end)=>{if(p+171>end)return p;n.speed=view.getFloat32(p,true);n.variation=view.getFloat32(p+4,true);n.latitude=view.getFloat32(p+8,true);n.gravity=view.getFloat32(p+12,true);n.lifeSpan=view.getFloat32(p+16,true);n.emissionRate=view.getFloat32(p+20,true);n.width=view.getFloat32(p+24,true);n.length=view.getFloat32(p+28,true);n.filterMode=view.getUint32(p+32,true);n.filterModeName=P2_FILTER_MODES[n.filterMode]||`Filter ${n.filterMode}`;n.rows=view.getUint32(p+36,true);n.columns=view.getUint32(p+40,true);n.headOrTail=view.getUint32(p+44,true);n.tailLength=view.getFloat32(p+48,true);n.timeMiddle=view.getFloat32(p+52,true);n.segmentColors=[];let q=p+56;for(let i=0;i<3;i++,q+=12)n.segmentColors.push([view.getFloat32(q,true),view.getFloat32(q+4,true),view.getFloat32(q+8,true)]);n.segmentAlphas=Array.from(bytes.slice(q,q+3));q+=3;n.segmentScaling=[view.getFloat32(q,true),view.getFloat32(q+4,true),view.getFloat32(q+8,true)];q+=12;n.headIntervals=[];n.tailIntervals=[];for(let i=0;i<2;i++){n.headIntervals.push([view.getUint32(q,true),view.getUint32(q+4,true),view.getUint32(q+8,true)]);q+=12;}for(let i=0;i<2;i++){n.tailIntervals.push([view.getUint32(q,true),view.getUint32(q+4,true),view.getUint32(q+8,true)]);q+=12;}n.textureId=view.getInt32(q,true);q+=4;n.squirt=view.getUint32(q,true);q+=4;n.priorityPlane=view.getInt32(q,true);q+=4;n.replaceableId=view.getUint32(q,true);return q+4;});
    const popcornEmitters=parseOuterGenericChunk('CORN','ParticleEmitterPopcorn',(n,p,end)=>{if(p+552>end)return p;n.lifeSpan=view.getFloat32(p,true);n.emissionRate=view.getFloat32(p+4,true);n.speed=view.getFloat32(p+8,true);n.color=[view.getFloat32(p+12,true),view.getFloat32(p+16,true),view.getFloat32(p+20,true)];n.alpha=view.getFloat32(p+24,true);n.replaceableId=view.getUint32(p+28,true);n.path=zstr(p+32,260);n.animationVisibilityGuide=zstr(p+292,260);return p+552;});
    const ribbonEmitters=parseOuterGenericChunk('RIBB','RibbonEmitter',(n,p,end)=>{if(p+52>end)return p;n.heightAbove=view.getFloat32(p,true);n.heightBelow=view.getFloat32(p+4,true);n.alpha=view.getFloat32(p+8,true);n.color=[view.getFloat32(p+12,true),view.getFloat32(p+16,true),view.getFloat32(p+20,true)];n.lifeSpan=view.getFloat32(p+24,true);n.textureSlot=view.getUint32(p+28,true);n.emissionRate=view.getUint32(p+32,true);n.rows=view.getUint32(p+36,true);n.columns=view.getUint32(p+40,true);n.materialId=view.getInt32(p+44,true);n.gravity=view.getFloat32(p+48,true);return p+52;});

    const nodes=[...bones,...lights,...helpers,...attachments,...particleEmitters,...particleEmitters2,...popcornEmitters,...ribbonEmitters,...eventObjects,...collisionShapes].sort((a,b)=>a.id-b.id);
    nodes.forEach(n=>{if(!n.pivot&&n.id>=0)n.pivot=pivots[n.id]||null;});

    const cameras=parseDynamicOuter(first('CAMS'),(off,size,i)=>{let p=off+4;const name=zstr(p,80);p+=80;const position=[view.getFloat32(p,true),view.getFloat32(p+4,true),view.getFloat32(p+8,true)];p+=12;const fieldOfView=view.getFloat32(p,true);p+=4;const farClippingPlane=view.getFloat32(p,true);p+=4;const nearClippingPlane=view.getFloat32(p,true);p+=4;const targetPosition=[view.getFloat32(p,true),view.getFloat32(p+4,true),view.getFloat32(p+8,true)];p+=12;return{id:i,name,position,fieldOfView,farClippingPlane,nearClippingPlane,targetPosition,tracks:parseAnimations(p,off+size).tracks};});
    const faceEffects=[];const fafx=first('FAFX');if(fafx){for(let p=fafx.start,i=0;p+340<=fafx.end;p+=340,i++)faceEffects.push({id:i,type:zstr(p,80),path:zstr(p+80,260)});}
    const bindPose=[];const bpos=first('BPOS');if(bpos&&bpos.size>=4){const count=view.getUint32(bpos.start,true);let p=bpos.start+4;for(let i=0;i<count&&p+48<=bpos.end;i++,p+=48){const m=[];for(let k=0;k<12;k++)m.push(view.getFloat32(p+k*4,true));bindPose.push(m);}}

    const hdSkinGeosets=geosets.filter(g=>g.skin&&g.skin.length).length;
    const skinningScheme=hdSkinGeosets?'reforged-skin4':'classic-matrix-groups';
    const summary=`MDX binary model v${formatVersion}\nTextures: ${textures.length}\nMaterials: ${materials.length}\nGeosets: ${geosets.length}\nSkinning: ${skinningScheme}\nSequences: ${sequences.length}\nNodes/effects: ${nodes.length}\nUnknown chunks: ${unknownChunks.length}`;
    return{type:'MDX',formatVersion,version:formatVersion,name,animationFile,blendTime,extent,sequences,globalSequences,textures:textures.map(t=>t.path),textureDefs:textures,textureAnimations,materials,geosets,geosetAnimations,pivots,nodes,bones,lights,helpers,attachments,particleEmitters,particleEmitters2,popcornEmitters,ribbonEmitters,eventObjects,collisionShapes,cameras,faceEffects,bindPose,unknownChunks,skinningScheme,chunks:chunkList.map(c=>({tag:c.tag,size:c.size,offset:c.header})),bounds:computeBounds(geosets),summary};
  }

  function parseModel(buffer,name='model.mdx'){ const lower=String(name||'').toLowerCase(); if(lower.endsWith('.mdl'))return parseMDL(buffer); if(lower.endsWith('.mdx'))return parseMDX(buffer); const u=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer); if(u.length>=4&&String.fromCharCode(...u.slice(0,4))==='MDLX')return parseMDX(buffer); return parseMDL(buffer); }

  function patchTexturePaths(buffer,name,paths){
    const lower=String(name||'').toLowerCase();
    if(lower.endsWith('.mdl')){
      let text=typeof buffer==='string'?buffer:new TextDecoder('utf-8',{fatal:false}).decode(buffer);
      let index=0;
      text=text.replace(/\bImage\s+"([^"]*)"/g,(full,old)=>{
        if(index>=paths.length)return full;
        const next=String(paths[index++]??old).replace(/"/g,'');
        return `Image "${next}"`;
      });
      return new TextEncoder().encode(text);
    }
    const src=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
    const out=new Uint8Array(src); const view=new DataView(out.buffer,out.byteOffset,out.byteLength);
    if(out.length<4||String.fromCharCode(...out.slice(0,4))!=='MDLX')throw new Error('Not an MDX file.');
    let off=4,texs=null;
    while(off+8<=out.length){const tag=String.fromCharCode(out[off],out[off+1],out[off+2],out[off+3]),size=view.getUint32(off+4,true),start=off+8,end=start+size;if(end>out.length)throw new Error(`Truncated MDX chunk ${tag}.`);if(tag==='TEXS'){texs={start,end,size};break;}off=end;}
    if(!texs)throw new Error('MDX has no TEXS chunk.');
    const enc=new TextEncoder(); let i=0;
    for(let p=texs.start;p+268<=texs.end&&i<paths.length;p+=268,i++){
      const raw=enc.encode(String(paths[i]||'')); if(raw.length>259)throw new Error(`Texture path ${i} is longer than 259 bytes.`);
      out.fill(0,p+4,p+264); out.set(raw,p+4);
    }
    return out;
  }

  window.WAR3_MODEL_CORE={
    version:'9.1',
    uvConvention:'warcraft-authored',
    provenance:'Structure-aware MDX/MDL reader. UVBS/TVertices are preserved in authored Warcraft coordinates; display-space conversion is handled only by render/paint code. Node flag bits and Reforged SKIN behavior cross-checked against war3-model and mdx-m3-viewer.',
    TRACK_INFO,FILTER_MODES,P2_FILTER_MODES,
    parseModel,parseMDL,parseMDX,patchTexturePaths,computeBounds,basename,normalizePath,
    helpers:{blockEnd,parseBraceBlocks,parseNamedBlocks,parseMdlTrack,collectMdlTracks}
  };
})();
