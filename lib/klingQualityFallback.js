// Deterministic source-photo animation: no generative product pixels or new
// product operations. 6% scale, unchanged centre, one-second closing hold.
export function buildKlingPixelPreservingEdit({ imageUrl, durationSeconds = 6 }) {
  const url = new URL(imageUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Fallback image must use HTTP(S)");
  const src = url.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const duration = Math.max(3, Math.min(10, Number(durationSeconds) || 6));
  return {
    timeline: { background: "#f4f6fb", tracks: [{ clips: [{
      asset: { type: "html5",
        html: `<div class="stage"><img id="verified" src="${src}" alt="" /></div>`,
        css: "html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#f4f6fb}.stage{width:1080px;height:1920px;display:flex;align-items:center;justify-content:center}#verified{width:880px;height:1150px;object-fit:contain;transform-origin:50% 50%}",
        js: `const tl=gsap.timeline();tl.to('#verified',{scale:1.06,duration:${duration - 1},ease:'sine.inOut'});`,
      }, start: 0, length: duration, width: 1080, height: 1920,
    }] }] },
    output: { format: "mp4", fps: 25, quality: "medium", size: { width: 1080, height: 1920 }, poster: { capture: 0.1 } },
  };
}
