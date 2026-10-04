(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.WC3_EFFECTS_PKB_INSPECTOR=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const VERSION=1;
  const KNOWN_EXT=new Set(['pkb','pkfx','particles','pkat','pkmm','dds','blp','tga','png','jpg','jpeg','webp','bmp','mdx','mdl','wav','mp3','ogg']);
  const ASSET_EXT=new Set(['pkb','pkfx','particles','pkat','pkmm','dds','blp','tga','png','jpg','jpeg','webp','bmp','mdx','mdl','wav','mp3','ogg']);
  const toU8=data=>{
    if(data instanceof Uint8Array)return data;
    if(data instanceof ArrayBuffer)return new Uint8Array(data);
    if(ArrayBuffer.isView(data))return new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    if(data&&data.type==='Buffer'&&Array.isArray(data.data))return Uint8Array.from(data.data);
    if(Array.isArray(data))return Uint8Array.from(data);
    return new Uint8Array(0);
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const hex=(u8,start=0,count=32)=>Array.from(u8.subarray(start,Math.min(u8.length,start+count))).map(x=>x.toString(16).padStart(2,'0')).join(' ');
  function fnv1a64(data){
    const u8=toU8(data);let h=0xcbf29ce484222325n,p=0x100000001b3n;
    for(let i=0;i<u8.length;i++){h^=BigInt(u8[i]);h=BigInt.asUintN(64,h*p);}
    return h.toString(16).padStart(16,'0');
  }
  function entropy(data){
    const u8=toU8(data);if(!u8.length)return 0;const bins=new Uint32Array(256);for(const b of u8)bins[b]++;let h=0;for(const n of bins){if(!n)continue;const p=n/u8.length;h-=p*Math.log2(p);}return h;
  }
  function printableAscii(b){return b>=32&&b<=126;}
  function extractAsciiStrings(data,min=4,maxStrings=8000){
    const u8=toU8(data),out=[];let start=-1;
    for(let i=0;i<=u8.length;i++){
      const ok=i<u8.length&&printableAscii(u8[i]);
      if(ok&&start<0)start=i;
      if((!ok||i===u8.length)&&start>=0){const len=i-start;if(len>=min){const text=String.fromCharCode(...u8.subarray(start,Math.min(i,start+4096)));out.push({offset:start,length:len,encoding:'ascii',text});if(out.length>=maxStrings)break;}start=-1;}
    }
    return out;
  }
  function extractUtf16Strings(data,min=4,maxStrings=2000){
    const u8=toU8(data),out=[];
    for(let parity=0;parity<2;parity++){
      let start=-1,chars=[];
      for(let i=parity;i+1<u8.length;i+=2){const c=u8[i]|(u8[i+1]<<8),ok=c>=32&&c<=126;
        if(ok){if(start<0)start=i;chars.push(String.fromCharCode(c));}
        else if(start>=0){if(chars.length>=min){out.push({offset:start,length:chars.length*2,encoding:'utf16le',text:chars.slice(0,4096).join('')});if(out.length>=maxStrings)return out;}start=-1;chars=[];}
      }
    }
    return out;
  }
  function normalizePathText(s){return String(s||'').replace(/\0/g,'').trim().replace(/\\\\/g,'\\');}
  function looksLikePath(s){
    s=normalizePathText(s);if(s.length<4||s.length>1024)return false;
    const m=s.match(/\.([A-Za-z0-9]{2,10})(?:[?#].*)?$/);if(!m||!KNOWN_EXT.has(m[1].toLowerCase()))return false;
    return /[\\/:]/.test(s)||/^[A-Za-z0-9_. -]+\.[A-Za-z0-9]{2,10}$/.test(s);
  }
  function pathKind(p){const ext=(String(p).match(/\.([A-Za-z0-9]+)(?:[?#].*)?$/)?.[1]||'').toLowerCase();if(['dds','blp','tga','png','jpg','jpeg','webp','bmp'].includes(ext))return'texture';if(['mdx','mdl','pkmm'].includes(ext))return'model';if(['wav','mp3','ogg'].includes(ext))return'sound';if(['pkb','pkfx','particles'].includes(ext))return'effect';if(ext==='pkat')return'atlas';return'asset';}
  function dependencyList(strings){
    const seen=new Map();
    for(const row of strings){const raw=normalizePathText(row.text);if(!looksLikePath(raw))continue;const key=raw.toLowerCase();if(!seen.has(key))seen.set(key,{path:raw,kind:pathKind(raw),extension:(raw.match(/\.([A-Za-z0-9]+)$/)?.[1]||'').toLowerCase(),offsets:[]});const d=seen.get(key);if(d.offsets.length<16)d.offsets.push(row.offset);}
    return [...seen.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.path.localeCompare(b.path));
  }
  function fourccCandidates(data,max=512){
    const u8=toU8(data),dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength),out=[];
    const goodTag=(o)=>{for(let j=0;j<4;j++){const b=u8[o+j];if(!((b>=48&&b<=57)||(b>=65&&b<=90)||b===95))return false;}return true;};
    for(let o=0;o+8<=u8.length;o+=4){if(!goodTag(o))continue;const size=dv.getUint32(o+4,true);if(size===0||size>u8.length-o-8)continue;const tag=String.fromCharCode(u8[o],u8[o+1],u8[o+2],u8[o+3]);out.push({tag,offset:o,payloadOffset:o+8,size,end:o+8+size,confidence:(o===0||o+8+size===u8.length)?'high':'heuristic'});if(out.length>=max)break;}
    return out;
  }
  function byteRuns(data,byte=0,min=16,max=128){const u8=toU8(data),out=[];let s=-1;for(let i=0;i<=u8.length;i++){if(i<u8.length&&u8[i]===byte){if(s<0)s=i;}else if(s>=0){const len=i-s;if(len>=min)out.push({offset:s,length:len,byte});s=-1;if(out.length>=max)break;}}return out;}
  function histogramSummary(data){const u8=toU8(data),bins=new Uint32Array(256);for(const b of u8)bins[b]++;const top=[...bins].map((n,b)=>({byte:b,count:n,ratio:u8.length?n/u8.length:0})).sort((a,b)=>b.count-a.count).slice(0,10);return top;}
  function inspect(data,meta={}){
    const u8=toU8(data),ascii=extractAsciiStrings(u8),utf16=extractUtf16Strings(u8),strings=[...ascii,...utf16].sort((a,b)=>a.offset-b.offset),deps=dependencyList(strings),chunks=fourccCandidates(u8);
    const extCounts={};for(const d of deps)extCounts[d.extension]=(extCounts[d.extension]||0)+1;
    return {schema:'wc3.effects.pkb-inspection',version:VERSION,name:String(meta.name||''),path:String(meta.path||''),size:u8.length,hash:{algorithm:'fnv1a64',value:fnv1a64(u8)},entropy:Number(entropy(u8).toFixed(5)),headerHex:hex(u8,0,64),tailHex:hex(u8,Math.max(0,u8.length-64),64),strings:{ascii:ascii.length,utf16:utf16.length,total:strings.length,preview:strings.slice(0,240)},dependencies:deps,dependencyCounts:extCounts,chunks,zeroRuns:byteRuns(u8,0,24,96),byteHistogramTop:histogramSummary(u8),notes:['Chunk detection is heuristic unless a candidate matches a verified structure. Unknown bytes are never reinterpreted as a safe writable structure.']};
  }
  function compare(a,b,meta={}){
    const A=toU8(a),B=toU8(b),min=Math.min(A.length,B.length),max=Math.max(A.length,B.length),diffs=[];let first=-1,last=-1,changed=0;
    for(let i=0;i<min;i++){if(A[i]!==B[i]){changed++;if(first<0)first=i;last=i;if(diffs.length<256)diffs.push({offset:i,a:A[i],b:B[i]});}}
    changed+=max-min;if(max>min){if(first<0)first=min;last=max-1;}
    const sampleCount=Math.min(8192,min),step=sampleCount?Math.max(1,Math.floor(min/sampleCount)):1;let sameSamples=0,totalSamples=0;for(let i=0;i<min;i+=step){totalSamples++;if(A[i]===B[i])sameSamples++;}
    const IA=inspect(A,{name:meta.aName||'A'}),IB=inspect(B,{name:meta.bName||'B'}),depA=new Set(IA.dependencies.map(x=>x.path.toLowerCase())),depB=new Set(IB.dependencies.map(x=>x.path.toLowerCase()));
    const added=IB.dependencies.filter(x=>!depA.has(x.path.toLowerCase())),removed=IA.dependencies.filter(x=>!depB.has(x.path.toLowerCase()));
    return {schema:'wc3.effects.pkb-roundtrip',version:VERSION,exact:A.length===B.length&&changed===0,sizeA:A.length,sizeB:B.length,sizeDelta:B.length-A.length,hashA:IA.hash,hashB:IB.hash,firstDifference:first,lastDifference:last,changedBytes:changed,sampledSimilarity:Number((totalSamples?sameSamples/totalSamples:1).toFixed(6)),differences:diffs,dependencies:{added,removed,same:IB.dependencies.length-added.length},structure:{chunksA:IA.chunks.length,chunksB:IB.chunks.length,stringsA:IA.strings.total,stringsB:IB.strings.total,entropyA:IA.entropy,entropyB:IB.entropy},inspectionA:IA,inspectionB:IB};
  }
  function reportText(report){
    if(!report)return'No PKB inspection loaded.';
    if(report.schema==='wc3.effects.pkb-roundtrip')return [
      `PKB ROUND-TRIP ANALYZER`,
      `Exact: ${report.exact?'YES':'NO'}`,
      `A: ${report.sizeA.toLocaleString()} bytes · ${report.hashA.value}`,
      `B: ${report.sizeB.toLocaleString()} bytes · ${report.hashB.value}`,
      `Delta: ${report.sizeDelta>=0?'+':''}${report.sizeDelta.toLocaleString()} bytes`,
      `Changed bytes: ${report.changedBytes.toLocaleString()}`,
      `First difference: ${report.firstDifference<0?'none':'0x'+report.firstDifference.toString(16)}`,
      `Sampled similarity: ${(report.sampledSimilarity*100).toFixed(3)}%`,
      `Dependencies: +${report.dependencies.added.length} / -${report.dependencies.removed.length}`
    ].join('\n');
    return [
      `PKB INSPECTOR`,
      `${report.name||'(unnamed)'}`,
      `${report.path||''}`,
      `Size: ${report.size.toLocaleString()} bytes`,
      `Hash: ${report.hash.algorithm} ${report.hash.value}`,
      `Entropy: ${report.entropy} bits/byte`,
      `Strings: ${report.strings.total.toLocaleString()} (${report.strings.ascii} ASCII / ${report.strings.utf16} UTF-16LE)`,
      `Dependencies: ${report.dependencies.length}`,
      `FourCC candidates: ${report.chunks.length}`,
      '',
      ...report.dependencies.slice(0,100).map(x=>`[${x.kind}] ${x.path}`)
    ].join('\n');
  }
  function dependencyRequests(report){return (report?.dependencies||[]).filter(d=>ASSET_EXT.has(d.extension)).map(d=>({path:d.path,kind:d.kind==='texture'?'texture':d.kind==='sound'?'sound':d.kind==='model'?'model':'effect',artSet:/_hd\.w3mod/i.test(d.path)?'hd':/_de\.w3mod/i.test(d.path)?'de':'sd'}));}
  return Object.freeze({VERSION,toU8,fnv1a64,entropy,inspect,compare,reportText,dependencyRequests,pathKind,looksLikePath});
});
