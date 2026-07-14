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
  backdropUrl,
  ambientUrl,
  overlayUrl,
  productLayerUrl,
  durationSeconds = DEFAULT_DURATION_SECONDS,
  outputFormat = "mp4",
  outputSize = { width: 1080, height: 1350 },
  fps = 25,
  quality = "medium",
}) {
  if (!backdropUrl || !ambientUrl || !overlayUrl || !productLayerUrl) {
    throw new Error(
      "Animated product video requires backdrop, ambient, overlay and product layer URLs"
    );
  }

  const duration = Math.max(
    3,
    Math.min(10, Number(durationSeconds) || DEFAULT_DURATION_SECONDS)
  );
  const half = duration / 2;
  const normalizedFormat = String(outputFormat || "mp4").toLowerCase() === "gif"
    ? "gif"
    : "mp4";
  const size = {
    width: Math.max(320, Math.round(Number(outputSize?.width) || 1080)),
    height: Math.max(400, Math.round(Number(outputSize?.height) || 1350)),
  };
  const normalizedFps = normalizedFormat === "gif" ? 12 : Number(fps) || 25;
  const tweenBase = {
    interpolation: "bezier",
    easing: "easeInOutSine",
  };

  const output = {
    format: normalizedFormat,
    fps: normalizedFps,
    quality,
    size,
    mute: true,
  };

  if (normalizedFormat === "gif") {
    output.repeat = true;
  } else {
    output.poster = {
      capture: 0.1,
    };
  }

  return {
    timeline: {
      background: "#0f172a",
      tracks: [
        {
          clips: [
            {
              asset: {
                type: "image",
                src: overlayUrl,
              },
              start: 0,
              length: duration,
              fit: "crop",
            },
          ],
        },
        {
          clips: [
            {
              asset: {
                type: "image",
                src: productLayerUrl,
              },
              start: 0,
              length: half,
              fit: "none",
              scale: 1.08,
              position: "center",
              offset: {
                x: 0,
                y: -0.008,
              },
              effect: "zoomInSlow",
            },
            {
              asset: {
                type: "image",
                src: productLayerUrl,
              },
              start: half,
              length: duration - half,
              fit: "none",
              scale: 1.08,
              position: "center",
              offset: {
                x: 0,
                y: -0.008,
              },
              effect: "zoomOutSlow",
            },
          ],
        },
        {
          clips: [
            {
              asset: {
                type: "image",
                src: ambientUrl,
              },
              start: 0,
              length: duration,
              fit: "crop",
              opacity: [
                {
                  from: 0.48,
                  to: 0.68,
                  start: 0,
                  length: half,
                  ...tweenBase,
                },
                {
                  from: 0.68,
                  to: 0.48,
                  start: half,
                  length: duration - half,
                  ...tweenBase,
                },
              ],
              offset: {
                x: [
                  {
                    from: -0.006,
                    to: 0.01,
                    start: 0,
                    length: half,
                    ...tweenBase,
                  },
                  {
                    from: 0.01,
                    to: -0.006,
                    start: half,
                    length: duration - half,
                    ...tweenBase,
                  },
                ],
                y: [
                  {
                    from: 0.006,
                    to: -0.006,
                    start: 0,
                    length: half,
                    ...tweenBase,
                  },
                  {
                    from: -0.006,
                    to: 0.006,
                    start: half,
                    length: duration - half,
                    ...tweenBase,
                  },
                ],
              },
              transform: {
                rotate: {
                  angle: [
                    {
                      from: -0.35,
                      to: 0.35,
                      start: 0,
                      length: half,
                      ...tweenBase,
                    },
                    {
                      from: 0.35,
                      to: -0.35,
                      start: half,
                      length: duration - half,
                      ...tweenBase,
                    },
                  ],
                },
              },
            },
          ],
        },
        {
          clips: [
            {
              asset: {
                type: "image",
                src: backdropUrl,
              },
              start: 0,
              length: duration,
              fit: "crop",
            },
          ],
        },
      ],
    },
    output,
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
