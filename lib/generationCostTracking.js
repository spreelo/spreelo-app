const USD = "USD";
const PRICE_VERSION = "2026-09-11";

const OPENAI_TEXT_PRICES_PER_MILLION = {
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30, longContextThreshold: 272000, longInputMultiplier: 2, longOutputMultiplier: 1.5 },
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20, longContextThreshold: 272000, longInputMultiplier: 2, longOutputMultiplier: 1.5 },
};

const OPENAI_IMAGE_PRICES_PER_MILLION = {
  "gpt-image-2": { textInput: 2.5, cachedTextInput: 0.625, imageInput: 4, cachedImageInput: 1, imageOutput: 15 },
};

const OPENAI_WEB_SEARCH_USD_PER_CALL = 0.01;
const GPT_4_1_MINI_WEB_SEARCH_CONTENT_TOKENS_PER_CALL = 8_000;

// Current Spreelo Kling trial resource pack: $9.80 / 100 units.
// Keep the monetary value exact only while that package is known to be active.
const KLING_TRIAL_USD_PER_UNIT = 0.098;
const KLING_TRIAL_VALID_FROM = Date.parse("2026-08-22T00:00:00Z");
const KLING_TRIAL_VALID_UNTIL = Date.parse("2026-09-21T23:59:59Z");

function numberOrZero(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 1e9) / 1e9;
}

function normalizeModel(model) {
  return String(model || "").trim().toLowerCase();
}

function canonicalOpenAIModel(model) {
  const normalized = normalizeModel(model);
  if (normalized.startsWith("gpt-5.6-sol") || normalized === "gpt-5.6") return "gpt-5.6-sol";
  if (normalized.startsWith("gpt-5.5")) return "gpt-5.5";
  if (normalized.startsWith("gpt-4.1-mini")) return "gpt-4.1-mini";
  if (normalized.startsWith("gpt-image-2")) return "gpt-image-2";
  return normalized;
}

function countResponseToolCalls(response, type) {
  const wanted = String(type || "").trim().toLowerCase();
  const items = Array.isArray(response?.output) ? response.output : [];
  return items.filter((item) => String(item?.type || "").trim().toLowerCase() === wanted).length;
}

export function calculateOpenAICost({ operation, request, response }) {
  const reportedModel = normalizeModel(request?.model || response?.model);
  const model = canonicalOpenAIModel(reportedModel);
  const usage = response?.usage || {};
  const requestId = String(response?._request_id || response?.id || "").trim() || null;

  if (model === "gpt-image-2") {
    const pricing = OPENAI_IMAGE_PRICES_PER_MILLION["gpt-image-2"];
    const details = usage?.input_tokens_details || {};
    const textTokens = numberOrZero(details?.text_tokens);
    const imageTokens = numberOrZero(details?.image_tokens);
    const totalInputTokens = numberOrZero(usage?.input_tokens);
    const unattributedInputTokens = Math.max(0, totalInputTokens - textTokens - imageTokens);
    const outputTokens = numberOrZero(usage?.output_tokens);
    const cachedDetails = details?.cached_tokens_details || {};
    let cachedTextTokens = numberOrZero(cachedDetails?.text_tokens ?? details?.cached_text_tokens);
    let cachedImageTokens = numberOrZero(cachedDetails?.image_tokens ?? details?.cached_image_tokens);
    const reportedCachedTokens = numberOrZero(details?.cached_tokens);
    let cacheBreakdownExact = true;
    if (reportedCachedTokens > 0 && cachedTextTokens + cachedImageTokens === 0) {
      if (imageTokens === 0) cachedTextTokens = Math.min(reportedCachedTokens, textTokens + unattributedInputTokens);
      else if (textTokens + unattributedInputTokens === 0) cachedImageTokens = Math.min(reportedCachedTokens, imageTokens);
      else cacheBreakdownExact = false;
    }
    cachedTextTokens = Math.min(cachedTextTokens, textTokens + unattributedInputTokens);
    cachedImageTokens = Math.min(cachedImageTokens, imageTokens);
    const uncachedTextTokens = Math.max(0, textTokens + unattributedInputTokens - cachedTextTokens);
    const uncachedImageTokens = Math.max(0, imageTokens - cachedImageTokens);
    const amount = cacheBreakdownExact
      ? ((uncachedTextTokens * pricing.textInput +
          cachedTextTokens * pricing.cachedTextInput +
          uncachedImageTokens * pricing.imageInput +
          cachedImageTokens * pricing.cachedImageInput +
          outputTokens * pricing.imageOutput) /
        1_000_000)
      : null;

    return {
      provider: "openai",
      service: "image_generation",
      model: reportedModel || model,
      operation,
      currency: USD,
      amount: amount == null ? null : roundMoney(amount),
      exact: Boolean(cacheBreakdownExact && usage && (totalInputTokens || outputTokens)),
      requestId,
      pricingVersion: PRICE_VERSION,
      quantity: numberOrZero(usage?.total_tokens) || totalInputTokens + outputTokens,
      unit: "tokens",
      usage: {
        input_tokens: totalInputTokens,
        text_input_tokens: textTokens + unattributedInputTokens,
        image_input_tokens: imageTokens,
        cached_text_input_tokens: cachedTextTokens,
        cached_image_input_tokens: cachedImageTokens,
        output_tokens: outputTokens,
      },
      note: cacheBreakdownExact ? null : "OpenAI reported cached GPT-Image input without a text/image cache split, so Spreelo refused to guess the monetary amount.",
    };
  }

  const pricing = OPENAI_TEXT_PRICES_PER_MILLION[model];
  if (!pricing) {
    return {
      provider: "openai",
      service: "model",
      model: reportedModel || model,
      operation,
      currency: USD,
      amount: null,
      exact: false,
      requestId,
      pricingVersion: PRICE_VERSION,
      quantity: numberOrZero(usage?.total_tokens),
      unit: "tokens",
      usage,
      note: `No pinned Spreelo price for OpenAI model ${model || "unknown"}`,
    };
  }

  const inputTokens = numberOrZero(usage?.input_tokens ?? usage?.prompt_tokens);
  const cachedTokens = Math.min(
    inputTokens,
    numberOrZero(usage?.input_tokens_details?.cached_tokens ?? usage?.prompt_tokens_details?.cached_tokens)
  );
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
  const outputTokens = numberOrZero(usage?.output_tokens ?? usage?.completion_tokens);
  const longContext = pricing.longContextThreshold && inputTokens > pricing.longContextThreshold;
  const inputMultiplier = longContext ? pricing.longInputMultiplier || 1 : 1;
  const outputMultiplier = longContext ? pricing.longOutputMultiplier || 1 : 1;
  let amount =
    (uncachedTokens * pricing.input * inputMultiplier +
      cachedTokens * pricing.cachedInput * inputMultiplier +
      outputTokens * pricing.output * outputMultiplier) /
    1_000_000;

  const webSearchCalls = countResponseToolCalls(response, "web_search_call");
  const webSearchContentTokens =
    model === "gpt-4.1-mini"
      ? webSearchCalls * GPT_4_1_MINI_WEB_SEARCH_CONTENT_TOKENS_PER_CALL
      : 0;
  amount += webSearchCalls * OPENAI_WEB_SEARCH_USD_PER_CALL;
  amount += (webSearchContentTokens * pricing.input) / 1_000_000;

  return {
    provider: "openai",
    service: webSearchCalls ? "model_and_web_search" : "model",
    model: reportedModel || model,
    operation,
    currency: USD,
    amount: roundMoney(amount),
    exact: Boolean(usage && (inputTokens || outputTokens || webSearchCalls)),
    requestId,
    pricingVersion: PRICE_VERSION,
    quantity: (numberOrZero(usage?.total_tokens) || inputTokens + outputTokens) + webSearchContentTokens,
    unit: "tokens",
    usage: {
      input_tokens: inputTokens,
      cached_input_tokens: cachedTokens,
      output_tokens: outputTokens,
      web_search_calls: webSearchCalls,
      billed_web_search_content_tokens: webSearchContentTokens,
      long_context_pricing: Boolean(longContext),
    },
  };
}

export function calculateKlingVideoCost({ model, durationSeconds, resolution, audio, taskId, billingAt = null, succeeded = true }) {
  const duration = numberOrZero(durationSeconds);
  const normalizedResolution = String(resolution || "720p").toLowerCase();
  const normalizedAudio = String(audio || "off").toLowerCase();
  const normalizedModel = normalizeModel(model || "kling-3.0");

  let unitsPerSecond = null;
  if (normalizedResolution === "720p") unitsPerSecond = normalizedAudio === "off" ? 0.6 : 0.9;
  else if (normalizedResolution === "1080p") unitsPerSecond = normalizedAudio === "off" ? 0.8 : 1.2;
  else if (normalizedResolution === "4k") unitsPerSecond = 3.0;

  const units = succeeded && unitsPerSecond != null ? duration * unitsPerSecond : 0;
  const billingTime = billingAt ? new Date(billingAt).getTime() : Date.now();
  const packageKnown = Number.isFinite(billingTime) && billingTime >= KLING_TRIAL_VALID_FROM && billingTime <= KLING_TRIAL_VALID_UNTIL;
  const amount = packageKnown && unitsPerSecond != null ? units * KLING_TRIAL_USD_PER_UNIT : null;

  return {
    provider: "kling",
    service: "image_to_video",
    model: normalizedModel,
    operation: "image_to_video",
    currency: USD,
    amount: amount == null ? null : roundMoney(amount),
    exact: Boolean(packageKnown && unitsPerSecond != null),
    requestId: taskId ? String(taskId) : null,
    pricingVersion: packageKnown ? "trial-100-units-9.80-usd" : PRICE_VERSION,
    quantity: units,
    unit: "units",
    usage: {
      duration_seconds: duration,
      resolution: normalizedResolution,
      audio: normalizedAudio,
      units_per_second: unitsPerSecond,
      units,
      unit_price_usd: packageKnown ? KLING_TRIAL_USD_PER_UNIT : null,
      succeeded: Boolean(succeeded),
      billing_at: billingAt || null,
    },
    note: packageKnown ? null : "Kling resource-pack unit price is not pinned after the current trial package expires.",
  };
}

export function calculateShotstackRenderCost({ renderId, billableSeconds, plan, environment }) {
  const seconds = numberOrZero(billableSeconds);
  const credits = seconds / 60;
  const normalizedPlan = String(plan || "").trim().toLowerCase();
  const normalizedEnvironment = String(environment || "").trim().toLowerCase();

  let usdPerCredit = null;
  let rateSource = null;
  if (normalizedEnvironment === "stage" || normalizedPlan.includes("sandbox")) {
    usdPerCredit = 0;
    rateSource = "shotstack-sandbox";
  } else if (/(pay.?as.?you.?go|payg)/i.test(normalizedPlan)) {
    usdPerCredit = 0.3;
    rateSource = "shotstack-payg-2026-08";
  } else if (/(subscription|monthly)/i.test(normalizedPlan)) {
    usdPerCredit = 0.2;
    rateSource = "shotstack-subscription-2026-08";
  }

  return {
    provider: "shotstack",
    service: "render_video",
    model: null,
    operation: "render_video",
    currency: USD,
    amount: usdPerCredit == null ? null : roundMoney(credits * usdPerCredit),
    exact: usdPerCredit != null,
    requestId: renderId ? String(renderId) : null,
    pricingVersion: rateSource || PRICE_VERSION,
    quantity: credits,
    unit: "credits",
    usage: {
      billable_seconds: seconds,
      credits,
      plan: normalizedPlan || null,
      environment: normalizedEnvironment || null,
      usd_per_credit: usdPerCredit,
    },
    note: usdPerCredit == null ? "Shotstack returned exact billable seconds, but its account-specific USD-per-credit plan rate was not identifiable from the render response." : null,
  };
}

function sanitizeEvent(event) {
  if (!event) return null;
  return {
    provider: String(event.provider || "unknown"),
    service: String(event.service || "unknown"),
    model: event.model ? String(event.model) : null,
    operation: String(event.operation || "unknown"),
    currency: String(event.currency || USD),
    amount: event.amount == null ? null : roundMoney(event.amount),
    exact: event.exact === true,
    provider_request_id: event.requestId ? String(event.requestId) : null,
    pricing_version: String(event.pricingVersion || PRICE_VERSION),
    usage_quantity: event.quantity == null ? null : Number(event.quantity),
    usage_unit: event.unit ? String(event.unit) : null,
    usage: event.usage || {},
    note: event.note || null,
  };
}

async function refreshPostCostSummary(supabase, postId) {
  if (!supabase || !postId) return;
  const [{ data, error }, { data: postMeta, error: postMetaError }] = await Promise.all([
    supabase
      .from("post_generation_cost_events")
      .select("provider, service, model, operation, currency, amount, exact, provider_request_id, usage_quantity, usage_unit, usage, pricing_version, note, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
    supabase
      .from("posts")
      .select("text_model_used, image_model_used, image_status, video_provider, video_status, content_format, content")
      .eq("id", postId)
      .maybeSingle(),
  ]);
  if (error) {
    console.warn("Post generation cost summary could not load events", { postId, message: error.message });
    return;
  }
  if (postMetaError && !/schema cache|does not exist/i.test(String(postMetaError.message || ""))) {
    console.warn("Post generation cost summary could not load post expectations", { postId, message: postMetaError.message });
  }

  const events = data || [];
  const totals = {};
  let complete = true;
  for (const event of events) {
    if (event.amount == null || event.exact !== true) complete = false;
    if (event.amount != null) {
      totals[event.currency || USD] = roundMoney((totals[event.currency || USD] || 0) + Number(event.amount || 0));
    }
  }

  // A list containing only exact rows is not enough to call a post "exact" if
  // a provider operation we know the post required is missing entirely.
  const missingExpectedEvents = [];
  if (postMeta && !postMetaError) {
    const normalizedImageModel = canonicalOpenAIModel(postMeta.image_model_used);
    const normalizedImageStatus = String(postMeta.image_status || "").trim().toLowerCase();
    const imageExpected =
      normalizedImageModel === "gpt-image-2" &&
      !["", "none", "failed", "not_required", "not-required"].includes(normalizedImageStatus);
    if (imageExpected) {
      const hasImageCost = events.some(
        (event) =>
          String(event.provider || "").toLowerCase() === "openai" &&
          canonicalOpenAIModel(event.model) === "gpt-image-2" &&
          (String(event.service || "").toLowerCase() === "image_generation" ||
            ["images.generate", "images.edit"].includes(String(event.operation || "")))
      );
      if (!hasImageCost) missingExpectedEvents.push("openai:gpt-image-2:image_generation");
    }

    const normalizedTextModel = canonicalOpenAIModel(postMeta.text_model_used);
    if (normalizedTextModel && String(postMeta.content || "").trim()) {
      const hasTextCost = events.some(
        (event) =>
          String(event.provider || "").toLowerCase() === "openai" &&
          canonicalOpenAIModel(event.model) === normalizedTextModel &&
          String(event.service || "").toLowerCase() !== "image_generation"
      );
      if (!hasTextCost) missingExpectedEvents.push(`openai:${normalizedTextModel}:text_generation`);
    }

    const videoStatus = String(postMeta.video_status || "").trim().toLowerCase();
    const videoProvider = String(postMeta.video_provider || "").trim().toLowerCase();
    const videoExpected =
      ["kling", "shotstack"].includes(videoProvider) &&
      !["", "none", "failed", "not_required", "not-required"].includes(videoStatus);
    if (videoExpected) {
      const hasVideoCost = events.some(
        (event) => String(event.provider || "").trim().toLowerCase() === videoProvider
      );
      if (!hasVideoCost) missingExpectedEvents.push(`${videoProvider}:video_generation`);
    }
  }

  if (missingExpectedEvents.length) complete = false;

  const currencies = Object.keys(totals);
  const singleCurrency = currencies.length === 1 ? currencies[0] : null;
  const totalAmount = singleCurrency ? totals[singleCurrency] : null;
  const { error: updateError } = await supabase
    .from("post_generation_cost_summaries")
    .upsert({
      post_id: postId,
      amount: totalAmount,
      currency: singleCurrency,
      complete: complete && events.length > 0,
      breakdown: {
        totals,
        events,
        expected_events_checked: Boolean(postMeta && !postMetaError),
        missing_expected_events: missingExpectedEvents,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "post_id" });
  if (updateError) {
    console.warn("Post generation cost summary could not update admin cost table", { postId, message: updateError.message });
  }
}

export function createGenerationCostTracker({
  supabase,
  occurrenceId = null,
  postId = null,
  generationSessionId = null,
  generationUserId = null,
}) {
  let currentPostId = postId || null;
  const currentOccurrenceId = occurrenceId || null;
  const currentGenerationSessionId = generationSessionId || null;
  const currentGenerationUserId = generationUserId || null;

  const record = async (rawEvent) => {
    const event = sanitizeEvent(rawEvent);
    if (!event || !supabase) return event;
    const payload = { ...event };
    // Omit null relationship fields so a later finalization of the same provider
    // request never erases a post/session binding that was written earlier.
    if (currentPostId) payload.post_id = currentPostId;
    if (currentOccurrenceId) payload.occurrence_id = currentOccurrenceId;
    if (currentGenerationSessionId) payload.generation_session_id = currentGenerationSessionId;
    if (currentGenerationUserId) payload.generation_user_id = currentGenerationUserId;
    const { error } = await supabase
      .from("post_generation_cost_events")
      .upsert(payload, { onConflict: "provider,provider_request_id,operation" });
    if (error && !/post_generation_cost_events|schema cache|does not exist/i.test(String(error.message || ""))) {
      console.warn("Generation cost event could not be recorded", {
        provider: event.provider,
        operation: event.operation,
        requestId: event.provider_request_id,
        message: error.message,
      });
    }
    if (currentPostId) await refreshPostCostSummary(supabase, currentPostId);
    return { ...event, persisted: !error };
  };

  return {
    async recordOpenAI(operation, request, response) {
      return record(calculateOpenAICost({ operation, request, response }));
    },
    async recordKling(values) {
      return record(calculateKlingVideoCost(values));
    },
    async recordShotstack(values) {
      return record(calculateShotstackRenderCost(values));
    },
    async bindPost(nextPostId) {
      currentPostId = nextPostId || currentPostId;
      if (!currentPostId || !supabase) return;
      if (currentOccurrenceId) {
        const { error } = await supabase
          .from("post_generation_cost_events")
          .update({ post_id: currentPostId })
          .eq("occurrence_id", currentOccurrenceId)
          .is("post_id", null);
        if (error && !/post_generation_cost_events|schema cache|does not exist/i.test(String(error.message || ""))) {
          console.warn("Generation cost events could not bind to post", { postId: currentPostId, occurrenceId: currentOccurrenceId, message: error.message });
        }
      }
      if (currentGenerationSessionId) {
        let query = supabase
          .from("post_generation_cost_events")
          .update({ post_id: currentPostId })
          .eq("generation_session_id", currentGenerationSessionId)
          .is("post_id", null);
        if (currentGenerationUserId) query = query.eq("generation_user_id", currentGenerationUserId);
        const { error } = await query;
        if (error && !/post_generation_cost_events|schema cache|does not exist/i.test(String(error.message || ""))) {
          console.warn("Manual generation cost events could not bind to post", {
            postId: currentPostId,
            generationSessionId: currentGenerationSessionId,
            message: error.message,
          });
        }
      }
      await refreshPostCostSummary(supabase, currentPostId);
    },
    get postId() {
      return currentPostId;
    },
  };
}

const OPENAI_COST_TRACKED_RESPONSES = new WeakSet();

function normalizeOpenAITrackingInvocation(methodPath, args, response) {
  if (methodPath === "responses.create" && args?.[0]?.background === true) {
    return { operation: "responses.background", request: args[0] || {} };
  }
  if (methodPath === "responses.retrieve") {
    const options = args?.[1] && typeof args[1] === "object" ? args[1] : {};
    return {
      operation: response?.background === true ? "responses.background" : "responses.retrieve",
      request: {
        ...options,
        response_id: typeof args?.[0] === "string" ? args[0] : null,
        model: response?.model || options?.model,
      },
    };
  }
  return {
    operation: methodPath,
    request: args?.[0] && typeof args[0] === "object" ? args[0] : {},
  };
}

export async function ensureOpenAIResponseCostTracked({ tracker, operation, request, response }) {
  if (!tracker?.recordOpenAI || !response) return response;
  const trackableObject = (typeof response === "object" && response !== null) || typeof response === "function";
  if (trackableObject && OPENAI_COST_TRACKED_RESPONSES.has(response)) return response;
  const trackedEvent = await tracker.recordOpenAI(operation, request || {}, response);
  if (trackableObject && trackedEvent?.persisted !== false) OPENAI_COST_TRACKED_RESPONSES.add(response);
  return response;
}

export function wrapOpenAIForCostTracking(openai, getTracker) {
  const trackedMethods = new Set([
    "responses.create",
    "responses.retrieve",
    "chat.completions.create",
    "images.generate",
    "images.edit",
  ]);
  const proxyCache = new WeakMap();

  const wrap = (target, path = []) => {
    if (!target || (typeof target !== "object" && typeof target !== "function")) return target;
    if (proxyCache.has(target)) return proxyCache.get(target);
    const proxy = new Proxy(target, {
      get(obj, prop, receiver) {
        const value = Reflect.get(obj, prop, obj);
        const nextPath = [...path, String(prop)];
        const methodPath = nextPath.join(".");
        if (typeof value === "function") {
          if (!trackedMethods.has(methodPath)) return value.bind(obj);
          return async (...args) => {
            const response = await value.apply(obj, args);
            const tracker = typeof getTracker === "function" ? getTracker() : null;
            if (tracker?.recordOpenAI) {
              try {
                const normalized = normalizeOpenAITrackingInvocation(methodPath, args, response);
                await ensureOpenAIResponseCostTracked({
                  tracker,
                  operation: normalized.operation,
                  request: normalized.request,
                  response,
                });
              } catch (error) {
                console.warn("OpenAI generation cost tracking failed without affecting generation", {
                  operation: methodPath,
                  message: error?.message || String(error),
                });
              }
            }
            return response;
          };
        }
        if (value && typeof value === "object") return wrap(value, nextPath);
        return value;
      },
    });
    proxyCache.set(target, proxy);
    return proxy;
  };

  return wrap(openai, []);
}

export async function attachOccurrenceCostsToPost(supabase, occurrenceId, postId) {
  if (!supabase || !occurrenceId || !postId) return;
  const tracker = createGenerationCostTracker({ supabase, occurrenceId });
  await tracker.bindPost(postId);
}

export async function attachGenerationSessionCostsToPost(
  supabase,
  generationSessionId,
  postId,
  generationUserId = null
) {
  if (!supabase || !generationSessionId || !postId) return;
  const tracker = createGenerationCostTracker({
    supabase,
    generationSessionId,
    generationUserId,
  });
  await tracker.bindPost(postId);
}
