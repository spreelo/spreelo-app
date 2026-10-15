// Finished-video coordinates are validated before reaching Sharp/Shotstack.
const clamp = (value, min, max, fallback) => {
  const n = value == null ? NaN : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
export function normalizeKlingLayout(raw, fallback, confidence = 0, cta = false) {
  const candidate = raw && confidence >= 0.6 ? raw : fallback;
  const width = Math.round(clamp(candidate?.width, 520, cta ? 780 : 876, cta ? 660 : 780));
  const height = Math.round(clamp(candidate?.height, cta ? 140 : 120, cta ? 300 : 500, cta ? 220 : 380));
  return {
    left: Math.round(clamp(candidate?.left, 64, 940 - width, 64)),
    top: Math.round(clamp(candidate?.top, 340, 1536 - height, 340)),
    width, height,
    preferredScale: clamp(raw && confidence >= 0.6 ? raw.preferredScale : null, 0.9, 1, 0.96),
    alignment: ['left', 'center', 'right'].includes(candidate?.alignment) ? candidate.alignment : 'left',
  };
}
// The vision planner supplies protected subject rectangles across all sampled
// frames. Enforce separation in code; do not trust a prose placement label.
export function sceneSafeKlingLayout(layout, protectedRegions = []) {
  const subjects = protectedRegions.filter(r => [r?.left,r?.top,r?.width,r?.height].every(Number.isFinite) && r.width > 0 && r.height > 0)
    .map(r => ({left:Math.max(0,r.left-12),top:Math.max(0,r.top-12),width:Math.min(1080,r.width+24),height:Math.min(1920,r.height+24)}));
  const avoids = b => subjects.every(r => b.left+b.width<=r.left || b.left>=r.left+r.width || b.top+b.height<=r.top || b.top>=r.top+r.height);
  if (avoids(layout)) return layout;
  const tops = [340, ...subjects.map(r=>r.top-120), ...subjects.map(r=>r.top+r.height), 1280];
  for (const height of [400,300,240,180,120]) for (const width of [876,780,680,520]) for (const top of tops) for (const left of [64,940-width]) {
    const candidate = {...layout,left,top:Math.round(top),width,height};
    if(candidate.top>=340 && candidate.top+height<=1536 && avoids(candidate)) return candidate;
  }
  throw new Error('No sufficiently clear region for advertising typography across the finished video');
}
export function klingTypographyGeometry(box, width, height) {
  const space = Math.max(0, box.width - width);
  return {
    left: Math.round(box.left + (box.alignment === 'right' ? space : box.alignment === 'center' ? space / 2 : 0)),
    top: Math.round(box.top + Math.max(0, box.height - height) / 2),
  };
}
export function getKlingTextFrameFractions(durationSeconds, selection = {}) {
  const duration = Math.max(3, Number(durationSeconds) || 6);
  const trim = Math.max(0, Math.min(duration - 1.2, Number(selection.scene_trim_start_seconds ?? 1.9) || 1.9));
  const finish=Number(selection.reference_safety?.motionPlan?.finish_seconds);
  const endTime=!selection.quality_fallback && Number.isFinite(finish) && finish>=3 ? Math.min(duration,finish) : duration;
  const motion = Math.max(2.5, endTime - trim);
  const overlay = Math.max(0.6, Math.min(Math.max(0.8, endTime - trim - 0.8), Number(selection.overlay_start_seconds ?? 1.5) || 1.5));
  const start = Math.min(duration - 0.1, trim + overlay);
  const displayEnd=Number.isFinite(finish) && finish>=3 ? Math.max(trim+.8,endTime-.4) : duration-.02;
  const end = Math.max(start, Math.min(displayEnd, trim + motion));
  return [0, 0.25, 0.5, 0.75, 1].map(f => (start + (end - start) * f) / duration);
}
