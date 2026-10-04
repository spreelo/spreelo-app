import sharp from 'sharp';

// Layout comes from the visible product, never from an AI-generated replica.
export function calculateAnimatedProductLayout(width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const ratio = w / h;
  const kind = ratio >= 1.35 ? 'wide' : ratio <= 0.7 ? 'tall' : 'balanced';
  const box = kind === 'wide'
    ? { left: 60, top: 800, width: 960, height: 650 }
    : kind === 'tall'
      ? { left: 110, top: 300, width: 860, height: 1040 }
      : { left: 80, top: 340, width: 920, height: 960 };
  const scale = 1.065;
  const fit = Math.min(box.width / w, box.height / h);
  const pw = Math.max(1, Math.floor(w * fit));
  const ph = Math.max(1, Math.floor(h * fit));
  const product = {
    left: Math.round((1080 - pw) / 2),
    top: Math.round(box.top + (box.height - ph) / 2),
    width: pw, height: ph,
  };
  const text = kind === 'wide'
    ? { left: 80, top: 420, width: 920, height: 280 }
    : { left: 80, top: 1380, width: 920, height: 250 };
  return { kind, aspectRatio: Number(ratio.toFixed(4)), product, text,
    logo: { left: 78, top: 185, width: 220, height: 90 },
    motionScale: scale, textStart: 0.6 };
}

export async function prepareAnimatedProductLayout(buffer) {
  const image = await sharp(buffer).rotate().ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  let left=info.width, top=info.height, right=-1, bottom=-1;
  for (let y=0; y<info.height; y++) for (let x=0; x<info.width; x++) {
    if (data[(y*info.width+x)*info.channels+3] < 8) continue;
    left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
  }
  if (right < left) throw new Error('Animated product asset has no visible pixels');
  // Crop alpha-only margins. Never remove white pixels belonging to the product
  // or attempt another cutout on the verified-source fallback panel.
  const width=right-left+1, height=bottom-top+1;
  const cutoutBuffer = await sharp(image).extract({left,top,width,height}).png().toBuffer();
  return { cutoutBuffer, layout: calculateAnimatedProductLayout(width,height),
    sourceBounds: {left,top,width,height} };
}
