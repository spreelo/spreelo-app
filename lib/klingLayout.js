// Finished-video coordinates are validated before reaching Sharp/Shotstack.
const clamp = (value, min, max, fallback) => {
  const n = value == null ? NaN : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
export function normalizeKlingLayout(raw, fallback, confidence = 0, cta = false) {
  const candidate = raw && confidence >= 0.6 ? raw : fallback;
  const width = Math.round(clamp(candidate?.width, 260, cta ? 500 : 660, 420));
  const height = Math.round(clamp(candidate?.height, 140, cta ? 240 : 300, cta ? 180 : 240));
  return {
    left: Math.round(clamp(candidate?.left, 64, 940 - width, 64)),
    top: Math.round(clamp(candidate?.top, 340, 1536 - height, 340)),
    width, height,
    preferredScale: clamp(raw && confidence >= 0.6 ? raw.preferredScale : null, 0.55, 0.9, 0.74),
    alignment: ['left', 'center', 'right'].includes(candidate?.alignment) ? candidate.alignment : 'left',
  };
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
  const motion = Math.max(2.5, duration - trim);
  const overlay = Math.max(0.6, Math.min(Math.max(0.8, duration - trim - 0.8), Number(selection.overlay_start_seconds ?? 2) || 2));
  const start = Math.min(duration - 0.1, trim + overlay);
  const end = Math.max(start, Math.min(duration - 0.02, trim + motion));
  return [0, 0.25, 0.5, 0.75, 1].map(f => (start + (end - start) * f) / duration);
}
