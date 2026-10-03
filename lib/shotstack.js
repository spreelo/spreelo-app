const SHOTSTACK_API_BASE = "https://api.shotstack.io/edit";
const DEFAULT_DURATION_SECONDS = 5;

function getShotstackConfig() {
  const apiKey = String(process.env.SHOTSTACK_API_KEY || "").trim();
  const rawEnvironment = String(process.env.SHOTSTACK_ENV || "stage")
    .trim()
    .toLowerCase();
  const environment = rawEnvironment === "production" ? "v1" : rawEnvironment;

  if (!apiKey) {
    throw new Error("SHOTSTACK_API_KEY is not configured");
  }

  if (!new Set(["stage", "v1"]).has(environment)) {
    throw new Error("SHOTSTACK_ENV must be stage or v1");
  }

  return {
    apiKey,
    environment,
    renderUrl: `${SHOTSTACK_API_BASE}/${environment}/render`,
  };
}

function getShotstackErrorMessage(payload, fallback) {
  return (
    payload?.response?.error ||
    payload?.response?.message ||
    (typeof payload?.error === "string" ? payload.error : payload?.error?.message) ||
    payload?.errors?.[0]?.detail ||
    payload?.errors?.[0]?.title ||
    payload?.message ||
    fallback
  );
}

export function buildProductPushEdit({
  backgroundVideoUrl,
  productDataUri,
  productWidth = 760,
  productHeight = 860,
  animationLayout = null,
  textOverlayUrl = null,
  logoOverlayUrl = null,
  durationSeconds = DEFAULT_DURATION_SECONDS,
  musicUrl = null,
  musicDurationSeconds = null,
  musicTrimStartSeconds = null,
  musicVolume = 0.5,
}) {
  if (!backgroundVideoUrl || !productDataUri) {
    throw new Error(
      "Animated product Reel requires a video background and an inline product asset"
    );
  }

  const duration = Math.max(
    3,
    Math.min(10, Number(durationSeconds) || DEFAULT_DURATION_SECONDS)
  );
  const half = duration / 2;
  const safeWidth = Math.max(
    1,
    Math.min(960, Math.round(Number(productWidth) || 760))
  );
  const safeHeight = Math.max(
    1,
    Math.min(1100, Math.round(Number(productHeight) || 860))
  );
  const productLeft = Math.round((1080 - safeWidth) / 2);
  const productTop = animationLayout?.product?.top ?? 255;
  const motionScale = animationLayout ? Math.max(1, Number(animationLayout.motionScale) || 1) : 1.08;
  const tracks = [];

  if (logoOverlayUrl) {
    tracks.push({
      clips: [
        {
          asset: {
            type: "image",
            src: logoOverlayUrl,
          },
          start: 0,
          length: duration,
          fit: "none",
          width: 1080,
          height: 1920,
          position: "center",
        },
      ],
    });
  }

  if (textOverlayUrl) {
    tracks.push({
      clips: [
        {
          asset: {
            type: "image",
            src: textOverlayUrl,
          },
          start: animationLayout?.textStart || 0,
          length: duration - (animationLayout?.textStart || 0),
          ...(animationLayout ? { transition: { in: "fade" } } : {}),
          fit: "none",
          width: 1080,
          height: 1920,
          position: "center",
        },
      ],
    });
  }

  const productHtml = `<div class="stage"><div id="product-motion"><img src="${productDataUri}" alt="" /></div></div>`;
  const productCss = [
    "html,body{margin:0;padding:0;width:1080px;height:1920px;overflow:hidden;background:transparent}",
    ".stage{position:relative;width:1080px;height:1920px;overflow:hidden;background:transparent}",
    `#product-motion{position:absolute;left:${productLeft}px;top:${productTop}px;width:${safeWidth}px;height:${safeHeight}px;transform-origin:50% 50%;will-change:transform}`,
    "#product-motion img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 24px 22px rgba(0,0,0,0.24))}",
  ].join("");
  const productJs = [
    "const tl=gsap.timeline();",
    ...(animationLayout ? ["tl.from('#product-motion',{opacity:0,duration:0.4,ease:'sine.out'});"] : []),
    ...(motionScale > 1 ? [
      `tl.to('#product-motion',{scale:${motionScale},duration:${animationLayout ? duration - 0.4 : half},ease:'sine.inOut'});`,
      ...(!animationLayout ? [`tl.to('#product-motion',{scale:1,duration:${duration - half},ease:'sine.inOut'});`] : []),
    ] : []),
  ].join("");

  tracks.push(
    {
      clips: [
        {
          asset: {
            type: "html5",
            html: productHtml,
            css: productCss,
            js: productJs,
          },
          start: 0,
          length: duration,
          width: 1080,
          height: 1920,
        },
      ],
    },
    {
      clips: [
        {
          asset: {
            type: "video",
            src: backgroundVideoUrl,
            trim: 0,
            volume: 0,
          },
          start: 0,
          length: duration,
          fit: "crop",
          position: "center",
        },
      ],
    }
  );

  const safeMusicUrl = String(musicUrl || "").trim();
  const safeMusicDuration = Number(musicDurationSeconds) || 0;
  if (safeMusicUrl && safeMusicDuration >= duration) {
    const latestPossibleTrim = Math.max(0, safeMusicDuration - duration);
    const requestedMusicTrim = Number(musicTrimStartSeconds);
    const musicTrim = Number.isFinite(requestedMusicTrim)
      ? Math.max(0, Math.min(latestPossibleTrim, requestedMusicTrim))
      : latestPossibleTrim;
    tracks.unshift({
      clips: [
        {
          asset: {
            type: "audio",
            src: safeMusicUrl,
            trim: Number(musicTrim.toFixed(3)),
            volume: Math.max(0, Math.min(1, Number(musicVolume) || 0.5)),
            effect: "none",
          },
          start: 0,
          length: duration,
        },
      ],
    });
  }

  return {
    timeline: {
      background: "#111111",
      tracks,
    },
    output: {
      format: "mp4",
      fps: 25,
      quality: "medium",
      size: {
        width: 1080,
        height: 1920,
      },
      poster: {
        capture: 0.1,
      },
    },
  };
}


export function buildVideoOverlayEdit({
  videoUrl,
  textOverlayUrl = null,
  ctaOverlayUrl = null,
  closingFrameUrl = null,
  durationSeconds = 6,
  overlayStartSeconds = 2.8,
  trimStartSeconds = 0,
  closingHoldSeconds = 0.9,
  musicUrl = null,
  musicDurationSeconds = null,
  musicTrimStartSeconds = null,
  musicVolume = 0.5,
}) {
  if (!videoUrl || (!textOverlayUrl && !ctaOverlayUrl)) {
    throw new Error("Kling advertising post-process needs a video URL and at least one transparent advertising overlay");
  }

  const requestedDuration = Math.max(3, Math.min(10, Number(durationSeconds) || 6));
  const trimStart = Math.max(0, Math.min(requestedDuration - 1.2, Number(trimStartSeconds) || 0));
  const duration = Math.max(2.5, requestedDuration - trimStart);
  const closingHold = closingFrameUrl
    ? Math.max(0.6, Math.min(1.5, Number(closingHoldSeconds) || 0.9))
    : 0;
  const totalDuration = duration + closingHold;
  const overlayStart = Math.max(0, Math.min(duration - 0.8, Number(overlayStartSeconds) || 0));
  // v144.114: when a dedicated CTA ending exists, the main headline stops
  // exactly when motion ends. The frozen hero frame then gets only the CTA,
  // which creates a deliberate advertising finish instead of stacking both.
  const overlayLength = Math.max(0.8, (ctaOverlayUrl && closingHold > 0 ? duration : totalDuration) - overlayStart);
  const baseClips = [
    {
      asset: {
        type: "video",
        src: videoUrl,
        trim: trimStart,
        volume: 0,
      },
      start: 0,
      length: duration,
      fit: "crop",
      position: "center",
    },
  ];

  if (closingFrameUrl && closingHold > 0) {
    baseClips.push({
      asset: {
        type: "image",
        src: closingFrameUrl,
      },
      start: duration,
      length: closingHold,
      fit: "crop",
      position: "center",
    });
  }

  const advertisingClips = [];
  if (textOverlayUrl) {
    advertisingClips.push({
      asset: {
        type: "image",
        src: textOverlayUrl,
      },
      start: overlayStart,
      length: overlayLength,
      fit: "none",
      width: 1080,
      height: 1920,
      position: "center",
    });
  }
  if (ctaOverlayUrl && closingFrameUrl && closingHold > 0) {
    advertisingClips.push({
      asset: {
        type: "image",
        src: ctaOverlayUrl,
      },
      start: duration,
      length: closingHold,
      fit: "none",
      width: 1080,
      height: 1920,
      position: "center",
    });
  }

  const tracks = [
    { clips: advertisingClips },
    { clips: baseClips },
  ];

  const safeMusicUrl = String(musicUrl || "").trim();
  const safeMusicDuration = Number(musicDurationSeconds) || 0;
  if (safeMusicUrl && safeMusicDuration >= totalDuration) {
    const latestPossibleTrim = Math.max(0, safeMusicDuration - totalDuration);
    const requestedMusicTrim = Number(musicTrimStartSeconds);
    const musicTrim = Number.isFinite(requestedMusicTrim)
      ? Math.max(0, Math.min(latestPossibleTrim, requestedMusicTrim))
      : latestPossibleTrim;
    tracks.unshift({
      clips: [
        {
          asset: {
            type: "audio",
            src: safeMusicUrl,
            trim: Number(musicTrim.toFixed(3)),
            volume: Math.max(0, Math.min(1, Number(musicVolume) || 0.5)),
            effect: "none",
          },
          start: 0,
          length: totalDuration,
        },
      ],
    });
  }

  return {
    timeline: {
      background: "#000000",
      tracks,
    },
    output: {
      format: "mp4",
      fps: 25,
      quality: "medium",
      size: {
        width: 1080,
        height: 1920,
      },
      poster: {
        capture: closingFrameUrl
          ? Math.max(0.1, totalDuration - Math.min(0.35, closingHold / 2))
          : Math.min(duration - 0.2, Math.max(0.1, overlayStart + 0.4)),
      },
    },
  };
}

export async function queueShotstackRender(edit) {
  const { apiKey, renderUrl } = getShotstackConfig();
  const requestBody = JSON.stringify(edit);
  const requestBytes = Buffer.byteLength(requestBody, "utf8");

  console.info("Shotstack render payload prepared", { requestBytes });

  if (requestBytes > 300_000) {
    throw new Error(`Shotstack render payload is too large before upload (${requestBytes} bytes)`);
  }

  const response = await fetch(renderUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-key": apiKey,
    },
    body: requestBody,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      getShotstackErrorMessage(payload, `Shotstack render request failed (${response.status})`)
    );
  }

  const renderId = payload?.response?.id || payload?.data?.id || payload?.id;

  if (!renderId) {
    throw new Error("Shotstack did not return a render id");
  }

  return renderId;
}

export async function waitForShotstackRender({
  renderId,
  maxAttempts = 60,
  delayMs = 3000,
}) {
  const { apiKey, renderUrl } = getShotstackConfig();
  const startedAt = Date.now();
  let previousStatus = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const response = await fetch(`${renderUrl}/${renderId}?data=false`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
      },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        getShotstackErrorMessage(payload, `Shotstack status request failed (${response.status})`)
      );
    }

    const result = payload?.response || payload?.data?.attributes || payload;
    const status = String(result?.status || "").toLowerCase();
    const elapsedMs = Date.now() - startedAt;

    // Keep enough visibility to diagnose slow Shotstack queues/renders without
    // emitting a log line every three seconds for every active video.
    if (attempt === 1 || status !== previousStatus || attempt % 5 === 0 || attempt === maxAttempts) {
      console.info("Shotstack render status polled", {
        renderId,
        attempt,
        maxAttempts,
        status: status || "unknown",
        elapsedMs,
      });
    }
    previousStatus = status;

    if (status === "done") {
      const url = result?.url || result?.source || result?.output?.url;

      if (!url) {
        throw new Error("Shotstack render completed without a video URL");
      }

      return {
        renderId,
        status,
        url,
        posterUrl: result?.poster || null,
        thumbnailUrl: result?.thumbnail || null,
        billableSeconds: Number(result?.billable ?? result?.duration ?? 0) || 0,
        plan: result?.plan || null,
        environment: getShotstackConfig().environment,
      };
    }

    if (["failed", "error", "cancelled"].includes(status)) {
      throw new Error(
        getShotstackErrorMessage(result, `Shotstack render failed with status ${status}`)
      );
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.warn("Shotstack render polling timed out", {
    renderId,
    maxAttempts,
    delayMs,
    elapsedMs,
    lastStatus: previousStatus || "unknown",
  });
  throw new Error(
    `Shotstack render did not finish before the timeout (${Math.round(elapsedMs / 1000)}s, last status: ${previousStatus || "unknown"})`
  );
}

export async function renderShotstackVideo(edit) {
  const renderId = await queueShotstackRender(edit);
  return waitForShotstackRender({ renderId });
}
