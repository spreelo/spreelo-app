import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://api-singapore.klingai.com";
const DEFAULT_CURRENT_MODEL = "kling-3.0";
const DEFAULT_LEGACY_MODEL = "kling-v3";
const DEFAULT_DURATION_SECONDS = 6;
const DEFAULT_RESOLUTION = "720p";
const DEFAULT_AUDIO = "off";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createLegacyKlingJwt(accessKey, secretKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: accessKey,
    exp: now + 1800,
    nbf: now - 5,
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(unsigned)
    .digest();

  return `${unsigned}.${base64UrlEncode(signature)}`;
}

function normalizeDuration(value) {
  return Math.max(3, Math.min(15, Math.round(Number(value) || DEFAULT_DURATION_SECONDS)));
}

function normalizeResolution(value) {
  const normalized = String(value || DEFAULT_RESOLUTION).trim().toLowerCase();
  return ["720p", "1080p", "4k"].includes(normalized) ? normalized : DEFAULT_RESOLUTION;
}

function normalizeAudio(value) {
  const normalized = String(value || DEFAULT_AUDIO).trim().toLowerCase();
  return ["off", "native", "on"].includes(normalized) ? normalized : DEFAULT_AUDIO;
}

function getKlingConfig() {
  const baseUrl = trimTrailingSlash(process.env.KLING_API_BASE_URL || DEFAULT_BASE_URL);
  const apiKey = String(process.env.KLING_API_KEY || "").trim();
  const accessKey = String(process.env.KLING_ACCESS_KEY || "").trim();
  const secretKey = String(process.env.KLING_SECRET_KEY || "").trim();
  const requestedFamily = String(process.env.KLING_API_FAMILY || "auto")
    .trim()
    .toLowerCase();

  let apiFamily = requestedFamily;
  if (apiFamily === "auto") {
    apiFamily = apiKey ? "current" : accessKey && secretKey ? "legacy" : "";
  }

  if (!["current", "legacy"].includes(apiFamily)) {
    throw new Error(
      "Kling is not configured. Add KLING_API_KEY for the current API, or KLING_ACCESS_KEY + KLING_SECRET_KEY for the legacy API."
    );
  }

  if (apiFamily === "current" && !apiKey) {
    throw new Error("KLING_API_KEY is required when KLING_API_FAMILY=current");
  }

  if (apiFamily === "legacy" && (!accessKey || !secretKey)) {
    throw new Error(
      "KLING_ACCESS_KEY and KLING_SECRET_KEY are required when KLING_API_FAMILY=legacy"
    );
  }

  return {
    apiFamily,
    baseUrl,
    apiKey,
    accessKey,
    secretKey,
    currentModel: String(
      process.env.KLING_CURRENT_MODEL || process.env.KLING_MODEL_NAME || DEFAULT_CURRENT_MODEL
    ).trim(),
    legacyModel: String(
      process.env.KLING_LEGACY_MODEL || process.env.KLING_MODEL_NAME || DEFAULT_LEGACY_MODEL
    ).trim(),
    durationSeconds: normalizeDuration(process.env.KLING_VIDEO_DURATION_SECONDS),
    resolution: normalizeResolution(process.env.KLING_VIDEO_RESOLUTION),
    audio: normalizeAudio(process.env.KLING_VIDEO_AUDIO),
    requestTimeoutMs: Math.max(
      5_000,
      Math.min(
        120_000,
        Number(process.env.KLING_REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS) ||
          DEFAULT_REQUEST_TIMEOUT_MS
      )
    ),
  };
}

function getAuthorizationHeader(config) {
  if (config.apiFamily === "current") {
    return `Bearer ${config.apiKey}`;
  }

  return `Bearer ${createLegacyKlingJwt(config.accessKey, config.secretKey)}`;
}

function getErrorMessage(payload, fallback) {
  return (
    payload?.message ||
    payload?.error?.message ||
    payload?.error ||
    payload?.data?.message ||
    fallback
  );
}

async function klingFetch(url, options, config) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(
        `Kling API request timed out after ${config.requestTimeoutMs}ms. The generation will not be submitted again automatically.`
      );
      timeoutError.code = "KLING_REQUEST_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseCurrentTask(payload, taskId = "") {
  const data = payload?.data;
  const candidates = Array.isArray(data)
    ? data
    : Array.isArray(data?.tasks)
    ? data.tasks
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(payload?.tasks)
    ? payload.tasks
    : data
    ? [data]
    : [];
  const raw =
    candidates.find((item) => String(item?.id || item?.task_id || "") === String(taskId)) ||
    candidates[0] ||
    null;

  if (!raw) {
    return {
      taskId,
      status: "unknown",
      videoUrl: null,
      durationSeconds: null,
      message: payload?.message || null,
      raw: payload,
    };
  }

  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs
    : Array.isArray(raw?.result?.videos)
    ? raw.result.videos
    : Array.isArray(raw?.task_result?.videos)
    ? raw.task_result.videos
    : [];
  const output = outputs.find((item) => item?.url) || null;
  return {
    taskId: String(raw.id || raw.task_id || taskId || ""),
    status: String(raw.status || raw.task_status || "unknown").toLowerCase(),
    videoUrl: output?.url || null,
    durationSeconds: Number(output?.duration || output?.duration_seconds || 0) || null,
    message: raw.message || raw.task_status_msg || payload?.message || null,
    raw: payload,
  };
}

function parseLegacyTask(payload, taskId = "") {
  const raw = payload?.data || {};
  const videos = raw?.task_result?.videos;
  const output = Array.isArray(videos) ? videos.find((item) => item?.url) : null;
  return {
    taskId: String(raw.task_id || taskId || ""),
    status: String(raw.task_status || "unknown").toLowerCase(),
    videoUrl: output?.url || null,
    durationSeconds: Number(output?.duration || 0) || null,
    message: raw.task_status_msg || payload?.message || null,
    raw: payload,
  };
}

export function getKlingGenerationSettings() {
  const config = getKlingConfig();
  return {
    apiFamily: config.apiFamily,
    durationSeconds: config.durationSeconds,
    resolution: config.resolution,
    audio: config.audio,
    model: config.apiFamily === "current" ? config.currentModel : config.legacyModel,
  };
}

/**
 * Submit exactly one Kling image-to-video task.
 *
 * IMPORTANT: this function intentionally contains NO retry loop. The caller must
 * atomically claim the post before calling it. If a POST times out or fails, do
 * not call it again for the same post because the remote service may already
 * have accepted/billed the first request.
 */
export async function submitKlingImageToVideo({
  imageUrl,
  prompt,
  externalTaskId,
  durationSeconds,
}) {
  if (!imageUrl) throw new Error("Kling image-to-video requires a public start-frame URL");
  if (!String(prompt || "").trim()) throw new Error("Kling image-to-video requires a prompt");

  const config = getKlingConfig();
  const requestedDurationSeconds = Math.max(
    1,
    Math.round(Number(durationSeconds || config.durationSeconds) || config.durationSeconds)
  );
  const authorization = getAuthorizationHeader(config);
  let url;
  let body;

  if (config.apiFamily === "current") {
    url = `${config.baseUrl}/image-to-video/${encodeURIComponent(config.currentModel)}`;
    body = {
      contents: [
        { type: "prompt", text: String(prompt).trim().slice(0, 2500) },
        { type: "first_frame", url: imageUrl },
      ],
      settings: {
        resolution: config.resolution,
        duration: requestedDurationSeconds,
        audio: config.audio === "on" ? "native" : config.audio,
        multi_shot: false,
      },
      options: {
        external_task_id: String(externalTaskId || "").slice(0, 128) || undefined,
        watermark_info: { enabled: false },
      },
    };
  } else {
    url = `${config.baseUrl}/v1/videos/image2video`;
    body = {
      model_name: config.legacyModel,
      image: imageUrl,
      prompt: String(prompt).trim().slice(0, 2500),
      duration: String(requestedDurationSeconds),
      mode: config.resolution === "720p" ? "std" : "pro",
      sound: config.audio === "off" ? "off" : "on",
      external_task_id: String(externalTaskId || "").slice(0, 128) || undefined,
      watermark_info: { enabled: false },
    };
  }

  const response = await klingFetch(
    url,
    {
      method: "POST",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    config
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || (Number.isFinite(Number(payload?.code)) && Number(payload.code) !== 0)) {
    const error = new Error(
      getErrorMessage(payload, `Kling generation request failed (${response.status})`)
    );
    error.code = `KLING_SUBMIT_${response.status || "ERROR"}`;
    error.httpStatus = response.status;
    throw error;
  }

  const taskId =
    config.apiFamily === "current"
      ? payload?.data?.id || payload?.data?.task_id || payload?.data?.task?.id
      : payload?.data?.task_id;

  if (!taskId) {
    const error = new Error("Kling accepted the request but did not return a task id");
    error.code = "KLING_TASK_ID_MISSING";
    throw error;
  }

  return {
    taskId: String(taskId),
    status: String(
      (config.apiFamily === "current" ? payload?.data?.status : payload?.data?.task_status) ||
        "submitted"
    ).toLowerCase(),
    apiFamily: config.apiFamily,
    model: config.apiFamily === "current" ? config.currentModel : config.legacyModel,
    durationSeconds: requestedDurationSeconds,
    resolution: config.resolution,
    audio: config.audio,
  };
}

export async function getKlingImageToVideoTask(taskId) {
  if (!taskId) throw new Error("Kling task id is required");

  const config = getKlingConfig();
  const authorization = getAuthorizationHeader(config);
  const url =
    config.apiFamily === "current"
      ? `${config.baseUrl}/tasks?task_ids=${encodeURIComponent(taskId)}`
      : `${config.baseUrl}/v1/videos/image2video/${encodeURIComponent(taskId)}`;

  const response = await klingFetch(
    url,
    {
      method: "GET",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
      },
    },
    config
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || (Number.isFinite(Number(payload?.code)) && Number(payload.code) !== 0)) {
    const error = new Error(
      getErrorMessage(payload, `Kling task query failed (${response.status})`)
    );
    error.code = `KLING_STATUS_${response.status || "ERROR"}`;
    error.httpStatus = response.status;
    throw error;
  }

  return config.apiFamily === "current"
    ? parseCurrentTask(payload, taskId)
    : parseLegacyTask(payload, taskId);
}

export function isKlingTaskSuccessful(status) {
  return ["succeed", "succeeded", "success", "completed"].includes(
    String(status || "").toLowerCase()
  );
}

export function isKlingTaskFailed(status) {
  return ["failed", "error", "cancelled", "canceled"].includes(
    String(status || "").toLowerCase()
  );
}
