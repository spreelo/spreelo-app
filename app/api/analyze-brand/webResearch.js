import {loadRuntimeAiModels,requireLoadedAiModel} from "../../../lib/aiModelControl.js";
import OpenAI from "openai";
import { wrapSupplementalOpenAIClient, createSupplementalOpenAITracker } from "../../../lib/supplementalOpenAICosts.js";

const DEFAULT_WEB_RESEARCH_MODEL = "gpt-5.5";
const DEFAULT_WEB_RESEARCH_OUTPUT_TOKENS = 6000;
const RETRY_WEB_RESEARCH_OUTPUT_TOKENS = 10000;

function getResearchModel() {
  return (
    String(process.env.BRAND_ANALYSIS_WEB_RESEARCH_MODEL || "").trim() ||
    String(process.env.PRODUCT_RESEARCH_MODEL || "").trim() ||
    DEFAULT_WEB_RESEARCH_MODEL
  );
}

function getAllowedDomain(websiteUrl) {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function collectResearchSources(response) {
  const sources = new Map();

  for (const outputItem of Array.isArray(response?.output) ? response.output : []) {
    for (const contentItem of Array.isArray(outputItem?.content)
      ? outputItem.content
      : []) {
      for (const annotation of Array.isArray(contentItem?.annotations)
        ? contentItem.annotations
        : []) {
        const citation = annotation?.url_citation || annotation;
        const url = String(citation?.url || "").trim();
        if (!url || sources.has(url)) continue;
        sources.set(url, {
          url,
          title: String(citation?.title || "").trim(),
        });
      }
    }
  }

  return [...sources.values()].slice(0, 40);
}

export function isWebResearchTerminalFailure(status) {
  return ["failed", "cancelled", "expired"].includes(
    String(status || "").toLowerCase()
  );
}

export function isWebResearchIncomplete(status) {
  return String(status || "").toLowerCase() === "incomplete";
}

export async function submitBlockedWebsiteResearch({
  job,
  compactRetry = false,
  previousEvidence = "",
} = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const websiteUrl = String(job?.website_url || "").trim();
  const allowedDomain = getAllowedDomain(websiteUrl);
  if (!allowedDomain) throw new Error("The website domain is not valid.");

  const openai = wrapSupplementalOpenAIClient(new OpenAI({ apiKey }), {
    userId: job?.user_id || null,
    sessionId: job?.id || null,
    operationNamespace: "blocked_web_research",
  });
  const model = requireLoadedAiModel(await loadRuntimeAiModels(),"blocked_web_research");
  const compactRetryInstruction = compactRetry
    ? "This is a bounded recovery request because an earlier response ended incomplete. Finish the dossier in a compact form. Prioritize factual coverage over explanation, keep every section concise and do not repeat evidence unnecessarily."
    : "";
  const previousEvidenceExcerpt = compactRetry
    ? String(previousEvidence || "").trim().slice(0, 5000)
    : "";
  const response = await openai.responses.create(
    {
      model,
      background: true,
      store: true,
      tools: [
        {
          type: "web_search",
          filters: { allowed_domains: [allowedDomain] },
          search_context_size: "high",
        },
      ],
      tool_choice: "required",
      // v144.23: keep background brand research bounded too. Web search is the
      // only paid built-in tool in this request.
      max_tool_calls: 18,
      instructions: `You are Spreelo's careful business-research agent. The customer's website blocks automated page requests, so use web search to research only the official domain ${allowedDomain}. Build a factual evidence dossier for a later brand-analysis model. Do not write social media posts and do not invent facts. Prefer official home, about, product, service, category, contact, delivery, store, booking and campaign pages. Distinguish facts found on official pages from cautious inferences. Include exact official URLs next to important evidence. ${compactRetryInstruction}`,
      input: `Research this business using public pages from the official domain only.

Business name: ${job?.business_name || "Not provided"}
Official website: ${websiteUrl}
User description: ${job?.brand_description || "Not provided"}
Selected market: ${job?.content_market || "Not provided"}
Country code: ${job?.country_code || "Not provided"}
Preferred customer-facing language: ${job?.content_language || "Infer from official evidence"}
${previousEvidenceExcerpt ? `\nPartial evidence from the interrupted request (verify it and fill only the missing essentials):\n${previousEvidenceExcerpt}` : ""}

Return a compact but thorough evidence dossier containing:
1. What the business is and what it offers.
2. Main product, service and category groups, with concrete examples where available.
3. Likely customer audience and customer needs.
4. Market, country, language, delivery/service area and local signals.
5. Whether the site appears to contain concrete products, services, bookings or selectable items suitable for Spreelo content.
6. Seasonal, commercial and cultural context that is genuinely relevant to this business and market.
7. A source list of the official URLs used.

Do not create the final campaign calendar. This dossier will be analyzed by Spreelo's existing brand strategy step.`,
      max_output_tokens: compactRetry
        ? RETRY_WEB_RESEARCH_OUTPUT_TOKENS
        : DEFAULT_WEB_RESEARCH_OUTPUT_TOKENS,
    },
    {
      timeout: 30_000,
      maxRetries: 1,
    }
  );

  console.info("Blocked website background research submitted", {
    jobId: job?.id,
    websiteUrl,
    allowedDomain,
    model,
    responseId: response?.id,
    responseStatus: response?.status,
    incompleteReason: response?.incomplete_details?.reason || null,
    compactRetry,
  });

  return {
    id: String(response?.id || ""),
    status: String(response?.status || ""),
    evidence: String(response?.output_text || "").trim(),
    sources: collectResearchSources(response),
    incompleteDetails: response?.incomplete_details || null,
    error: response?.error || null,
  };
}

export async function retrieveBlockedWebsiteResearch(responseId) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  if (!responseId) throw new Error("Missing background research response ID.");

  const openai = new OpenAI({ apiKey });
  const response = await openai.responses.retrieve(responseId);
  try {
    const tracker = createSupplementalOpenAITracker();
    if (tracker) await tracker.recordOpenAI("responses.background", { model: response?.model }, response);
  } catch (error) {
    console.warn("Blocked-site research cost metering failed", { message: String(error?.message || error) });
  }

  return {
    id: String(response?.id || responseId),
    status: String(response?.status || ""),
    evidence: String(response?.output_text || "").trim(),
    sources: collectResearchSources(response),
    error: response?.error || null,
    incompleteDetails: response?.incomplete_details || null,
  };
}
