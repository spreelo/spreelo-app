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
  productUrl,
  productWidth = 1080,
  productHeight = 1920,
  textOverlayUrl = null,
  logoOverlayUrl = null,
  durationSeconds = DEFAULT_DURATION_SECONDS,
}) {
  if (!backgroundVideoUrl || !productUrl) {
    throw new Error(
      "Animated product Reel requires a video background and a public product asset URL"
    );
  }

  const duration = Math.max(
    3,
    Math.min(10, Number(durationSeconds) || DEFAULT_DURATION_SECONDS)
  );
  const half = duration / 2;
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
          start: 0,
          length: duration,
          fit: "none",
          position: "center",
        },
      ],
    });
  }

  tracks.push({
    clips: [
      {
        asset: {
          type: "image",
          src: productUrl,
        },
        start: 0,
        length: half,
        fit: "none",
        position: "center",
        effect: "zoomInSlow",
      },
      {
        asset: {
          type: "image",
          src: productUrl,
        },
        start: half,
        length: duration - half,
        fit: "none",
        position: "center",
        effect: "zoomOutSlow",
      },
    ],
  });

  tracks.push({
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
  });

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

export async function queueShotstackRender(edit) {
  const { apiKey, renderUrl } = getShotstackConfig();
  const response = await fetch(renderUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(edit),
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
  maxAttempts = 30,
  delayMs = 3000,
}) {
  const { apiKey, renderUrl } = getShotstackConfig();

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
      };
    }

    if (["failed", "error", "cancelled"].includes(status)) {
      throw new Error(
        getShotstackErrorMessage(result, `Shotstack render failed with status ${status}`)
      );
    }
  }

  throw new Error("Shotstack render did not finish before the timeout");
}

export async function renderShotstackVideo(edit) {
  const renderId = await queueShotstackRender(edit);
  return waitForShotstackRender({ renderId });
}
