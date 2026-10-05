import sharp from 'sharp';

// Validate shapes, not an arbitrary total ink percentage: bold lettering is valid.
export async function inspectTypographyShape(buffer) {
  const normalized=await sharp(buffer).rotate().ensureAlpha().png().toBuffer();
  const {data,info}=await sharp(normalized).resize({width:352,height:120,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).raw().toBuffer({resolveWithObject:true});
  const count=info.width*info.height, mask=new Uint8Array(count),seen=new Uint8Array(count);
  let visible=0,strong=0;
  for(let i=0;i<count;i++){const a=data[i*4+3];if(a>=28)visible++;if(a>=150){strong++;mask[i]=1;}}
  if(visible/count<.008 || strong/count<.003)throw new Error('Generated transparent Reel typography was visually blank');
  if(visible/count>.82)throw new Error('Generated Reel typography contained an opaque background');
  const queue=new Int32Array(count);
  for(let i=0;i<count;i++){
    if(!mask[i]||seen[i])continue;
    let head=0,tail=1,minX=info.width,minY=info.height,maxX=0,maxY=0;queue[0]=i;seen[i]=1;
    while(head<tail){const n=queue[head++],x=n%info.width,y=Math.floor(n/info.width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const next of [x>0?n-1:-1,x+1<info.width?n+1:-1,y>0?n-info.width:-1,y+1<info.height?n+info.width:-1])if(next>=0&&mask[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
    }
    const fill=tail/((maxX-minX+1)*(maxY-minY+1));
    if(tail/count>.16&&fill>.88)throw new Error('Generated Reel typography contained an opaque card or solid background block');
  }
  const {data:full,info:fullInfo}=await sharp(normalized).raw().toBuffer({resolveWithObject:true});
  let left=fullInfo.width,top=fullInfo.height,right=-1,bottom=-1;
  for(let y=0;y<fullInfo.height;y++)for(let x=0;x<fullInfo.width;x++)if(full[(y*fullInfo.width+x)*4+3]>=28){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const trimmed=await sharp(normalized).extract({left,top,width:right-left+1,height:bottom-top+1}).png().toBuffer();
  return {buffer:trimmed,analysis:{visibleRatio:Number((visible/count).toFixed(4)),strongRatio:Number((strong/count).toFixed(4)),validation:'connected_shapes',trimmedBounds:{left,top,width:right-left+1,height:bottom-top+1}}};
}
const linear=v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;};
const luminance=(r,g,b)=>.2126*linear(r)+.7152*linear(g)+.0722*linear(b);
const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);

// Retain the generated letterforms and alpha. Correct color locally, never retype.
export async function ensureTypographyContrast({overlayBuffer,backgroundBuffers=[],textBox}) {
  if(!backgroundBuffers.length)throw new Error('No background reference available for typography contrast verification');
  const box=textBox||{left:80,top:1380,width:920,height:250};
  const {data,info}=await sharp(overlayBuffer).extract(box).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const samples=[];
  for(const buffer of backgroundBuffers){const scaled=await sharp(buffer).resize(1080,1920,{fit:'cover'}).png().toBuffer();samples.push(await sharp(scaled).extract(box).removeAlpha().raw().toBuffer());}
  const colors=[[255,255,255],[16,24,39]], scores=[0,0];let total=0,originalPass=0;
  for(let i=0;i<info.width*info.height;i+=2){if(data[i*4+3]<180)continue;
    const original=luminance(data[i*4],data[i*4+1],data[i*4+2]);
    for(const bg of samples){const b=luminance(bg[i*3],bg[i*3+1],bg[i*3+2]);total++;if(ratio(original,b)>=4.5)originalPass++;colors.forEach((c,j)=>{if(ratio(luminance(...c),b)>=4.5)scores[j]++;});}
  }
  if(!total)throw new Error('Generated typography has no substantial lettering for contrast verification');
  const originalCoverage=originalPass/total;
  if(originalCoverage>=.9)return {buffer:overlayBuffer,analysis:{contrastCoverage:originalCoverage,contrastCorrected:false,backgroundSamples:samples.length}};
  const chosen=scores[0]>=scores[1]?0:1,color=colors[chosen],opposite=chosen===0?[0,0,0]:[255,255,255];
  const mask=new Uint8Array(info.width*info.height),ink=Buffer.from(data);
  for(let i=0;i<mask.length;i++){mask[i]=data[i*4+3];for(let j=0;j<3;j++)ink[i*4+j]=color[j];}
  // A contrasting outline around the actual glyphs protects changing video areas.
  const dilated=new Uint8Array(mask.length);
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){let a=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<info.width&&yy<info.height)a=Math.max(a,mask[yy*info.width+xx]);}dilated[y*info.width+x]=a;}
  const outline=Buffer.alloc(data.length);
  for(let i=0;i<mask.length;i++){outline[i*4]=opposite[0];outline[i*4+1]=opposite[1];outline[i*4+2]=opposite[2];outline[i*4+3]=Math.round(dilated[i]*.92);}
  const panel=await sharp(outline,{raw:{width:info.width,height:info.height,channels:4}}).composite([{input:await sharp(ink,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer()}]).png().toBuffer();
  const output=await sharp({create:{width:1080,height:1920,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:panel,left:box.left,top:box.top}]).png().toBuffer();
  return {buffer:output,analysis:{contrastCoverage:originalCoverage,contrastCorrected:true,textColor:chosen===0?'white':'dark_navy',outlineColor:chosen===0?'black':'white',colorCoverage:scores[chosen]/total,backgroundSamples:samples.length}};
}
