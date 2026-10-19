import sharp from 'sharp';

// Layout comes from the visible product, never from an AI-generated replica.
export function calculateAnimatedProductLayout(width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const ratio = w / h;
  const kind = ratio >= 1.35 ? 'wide' : ratio <= 0.7 ? 'tall' : 'balanced';
  const box = kind === 'wide'
    ? { left: 60, top: 810, width: 960, height: 620 }
    : kind === 'tall'
      ? { left: 110, top: 330, width: 860, height: 900 }
      : { left: 80, top: 340, width: 920, height: 860 };
  const scale = 1.065;
  const fit = Math.min(box.width / w, box.height / h);
  const pw = Math.max(1, Math.floor(w * fit));
  const ph = Math.max(1, Math.floor(h * fit));
  const product = {
    left: Math.round((1080 - pw) / 2),
    top: Math.round(box.top + (box.height - ph) / 2),
    width: pw, height: ph,
  };
  // The logo occupies y=77..177. The video platform UI occupies the lower
  // edge. Give GPT Image the remaining NEGATIVE SPACE instead of shrinking its
  // art into the historical 250px caption strip. Keep a zoom-safe gap.
  const text = kind === 'wide'
    ? { left: 72, top: 370, width: 936, height: Math.min(400, Math.max(280, product.top - 370 - 72)) }
    : { left: 72, top: Math.round(product.top + product.height + 70), width: 936,
        height: Math.max(240, Math.min(430, 1600 - (product.top + product.height + 70))) };
  if (text.top + text.height > 1610) throw new Error('Product layout leaves no safe space for substantial advertising typography');
  return { kind, aspectRatio: Number(ratio.toFixed(4)), product, text,
    logo: { left: 78, top: 77, width: 220, height: 90 },
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
