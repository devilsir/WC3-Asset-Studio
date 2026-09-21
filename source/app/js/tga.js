(function(){
  'use strict';
  const TGA={};

  TGA.encode=function(imageData){
    const w=imageData.width,h=imageData.height,d=imageData.data;
    const out=new Uint8Array(18+w*h*4);
    out[0]=0; out[1]=0; out[2]=2; // no id, no palette, uncompressed true-color
    out[12]=w&255; out[13]=(w>>8)&255;
    out[14]=h&255; out[15]=(h>>8)&255;
    out[16]=32; out[17]=0x28; // 8 alpha bits + top-left origin
    let o=18;
    for(let i=0;i<d.length;i+=4){
      out[o++]=d[i+2]; out[o++]=d[i+1]; out[o++]=d[i]; out[o++]=d[i+3];
    }
    return new Blob([out],{type:'application/octet-stream'});
  };

  function readPixel(bytes,pos,bpp){
    if(bpp===32) return [bytes[pos+2],bytes[pos+1],bytes[pos],bytes[pos+3]];
    if(bpp===24) return [bytes[pos+2],bytes[pos+1],bytes[pos],255];
    throw new Error('TGA is supported only in 24-bit or 32-bit.');
  }

  TGA.decode=function(buffer){
    const bytes=new Uint8Array(buffer);
    if(bytes.length<18) throw new Error('Invalid TGA file.');
    const idLen=bytes[0], colorMapType=bytes[1], imageType=bytes[2];
    if(colorMapType!==0) throw new Error('Palette-based TGA is not supported in this version.');
    if(imageType!==2 && imageType!==10) throw new Error('Supported TGA types: true-color uncompressed or RLE.');
    const w=bytes[12]|(bytes[13]<<8), h=bytes[14]|(bytes[15]<<8), bpp=bytes[16], desc=bytes[17];
    if(!w||!h) throw new Error('Invalid TGA dimensions.');
    if(bpp!==24 && bpp!==32) throw new Error('TGA must be 24-bit or 32-bit.');
    const pixelSize=bpp>>3, total=w*h, raw=new Uint8ClampedArray(total*4);
    let src=18+idLen, pi=0;
    function put(pixel){ const o=pi*4; raw[o]=pixel[0];raw[o+1]=pixel[1];raw[o+2]=pixel[2];raw[o+3]=pixel[3];pi++; }
    if(imageType===2){
      for(;pi<total;){ if(src+pixelSize>bytes.length) throw new Error('TGA is truncated.'); put(readPixel(bytes,src,bpp)); src+=pixelSize; }
    }else{
      while(pi<total){
        if(src>=bytes.length) throw new Error('RLE TGA is truncated.');
        const header=bytes[src++], count=(header&0x7f)+1;
        if(header&0x80){
          if(src+pixelSize>bytes.length) throw new Error('RLE TGA is truncated.');
          const p=readPixel(bytes,src,bpp); src+=pixelSize;
          for(let k=0;k<count && pi<total;k++) put(p);
        }else{
          for(let k=0;k<count && pi<total;k++){ if(src+pixelSize>bytes.length) throw new Error('RLE TGA is truncated.'); put(readPixel(bytes,src,bpp)); src+=pixelSize; }
        }
      }
    }
    const topOrigin=!!(desc&0x20), rightOrigin=!!(desc&0x10);
    const data=new Uint8ClampedArray(total*4);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const sx=rightOrigin?(w-1-x):x, sy=topOrigin?y:(h-1-y);
      const s=(sy*w+sx)*4, t=(y*w+x)*4;
      data[t]=raw[s];data[t+1]=raw[s+1];data[t+2]=raw[s+2];data[t+3]=raw[s+3];
    }
    return {width:w,height:h,imageData:new ImageData(data,w,h),meta:{encoding:`TGA ${bpp}-bit ${imageType===10?'RLE':'raw'}`}};
  };

  TGA.inspect=function(buffer){
    const b=new Uint8Array(buffer); if(b.length<18) return null;
    return {width:b[12]|(b[13]<<8),height:b[14]|(b[15]<<8),bpp:b[16],imageType:b[2]};
  };
  window.TGA=TGA;
})();
