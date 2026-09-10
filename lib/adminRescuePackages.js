import { inflateRawSync } from "node:zlib";
import { normalizeCampaignOpportunities } from "../app/api/analyze-brand/brandAnalysisEngine.js";

const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_ZIP_FILES = 12;
const MAX_UNCOMPRESSED_BYTES = 12 * 1024 * 1024;
const MAX_SOURCES = 40;

export function cleanRescueText(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

export function cleanRescueUrl(value) {
  const text = cleanRescueText(value, 3000);
  if (!/^https:\/\//i.test(text)) return "";
  try {
    return new URL(text).toString();
  } catch {
    return "";
  }
}

function readZipEntries(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (!buffer.length || buffer.length > MAX_PACKAGE_BYTES) {
    throw new Error("Rescue package is empty or exceeds the 8 MB limit.");
  }

  const minOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP end record was not found.");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 rescue packages are not supported.");
  }
  if (entryCount > MAX_ZIP_FILES || centralOffset + centralSize > buffer.length) {
    throw new Error("The ZIP directory is invalid or contains too many files.");
  }

  const descriptors = [];
  let cursor = centralOffset;
  let declaredUncompressedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("The ZIP central directory is invalid.");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > buffer.length) {
      throw new Error("The ZIP filename record is invalid.");
    }
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    if (flags & 0x0001) throw new Error("Encrypted ZIP entries are not supported.");
    if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP compression method for '${name}'.`);
    if ([compressedSize, uncompressedSize, localOffset].some((value) => value === 0xffffffff)) {
      throw new Error("ZIP64 rescue packages are not supported.");
    }
    declaredUncompressedBytes += uncompressedSize;
    if (declaredUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("The uncompressed rescue package is too large.");
    }
    descriptors.push({ name, method, compressedSize, uncompressedSize, localOffset });
    cursor = nameEnd + extraLength + commentLength;
  }

  const entries = new Map();
  for (const descriptor of descriptors) {
    if (descriptor.name.endsWith("/")) continue;
    if (/^(?:\/|\\)|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(descriptor.name)) {
      throw new Error("ZIP contains an unsafe path.");
    }
    const localOffset = descriptor.localOffset;
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`The ZIP entry '${descriptor.name}' has an invalid local header.`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + descriptor.compressedSize;
    if (dataEnd > buffer.length) throw new Error(`The ZIP entry '${descriptor.name}' is truncated.`);
    const compressed = buffer.subarray(dataStart, dataEnd);
    const output = descriptor.method === 0
      ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
    if (output.length !== descriptor.uncompressedSize) {
      throw new Error(`The ZIP entry '${descriptor.name}' has an invalid uncompressed size.`);
    }
    entries.set(descriptor.name, output);
  }
  return entries;
}

function findManifestEntry(entries) {
  for (const [name, bytes] of entries.entries()) {
    const base = String(name).replaceAll("\\", "/").split("/").pop().toLowerCase();
    if (base === "manifest.json") return bytes;
  }
  return null;
}

export function parseAdminRescuePackage(bytes, filename = "") {
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!input.length || input.length > MAX_PACKAGE_BYTES) {
    throw new Error("Rescue package is empty or exceeds the 8 MB limit.");
  }

  let manifestBytes;
  const lowerName = String(filename || "").toLowerCase();
  const looksZip = input.length >= 4 && input.readUInt32LE(0) === 0x04034b50;
  if (looksZip || lowerName.endsWith(".zip")) {
    manifestBytes = findManifestEntry(readZipEntries(input));
    if (!manifestBytes) throw new Error("The rescue ZIP must contain manifest.json.");
  } else {
    manifestBytes = input;
  }

  if (!manifestBytes.length || manifestBytes.length > MAX_MANIFEST_BYTES) {
    throw new Error("manifest.json is empty or too large.");
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("manifest.json is not valid JSON.");
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("manifest.json must contain a JSON object.");
  }
  return manifest;
}

function normalizeSources(rawSources) {
  const items = Array.isArray(rawSources) ? rawSources : [];
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const url = cleanRescueUrl(item?.url || item?.source_url || item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({
      url,
      supports: cleanRescueText(item?.supports || item?.note || item?.description, 1000),
    });
    if (result.length >= MAX_SOURCES) break;
  }
  return result;
}

function normalizeProfile(rawProfile, fallback = {}) {
  const profile = rawProfile && typeof rawProfile === "object" ? rawProfile : {};
  return {
    business_name: cleanRescueText(profile.business_name || fallback.business_name, 300),
    industry: cleanRescueText(profile.industry || fallback.industry, 500),
    target_audience: cleanRescueText(profile.target_audience || fallback.target_audience, 1200),
    detected_language: cleanRescueText(profile.detected_language || fallback.detected_language, 120),
  };
}

function normalizeMarketSetup(rawSetup, fallback = {}) {
  const setup = rawSetup && typeof rawSetup === "object" ? rawSetup : {};
  return {
    contentMarket: cleanRescueText(setup.content_market || setup.contentMarket || fallback.content_market || fallback.contentMarket, 120),
    countryCode: cleanRescueText(setup.country_code || setup.countryCode || fallback.country_code || fallback.countryCode, 20).toUpperCase(),
    contentLanguage: cleanRescueText(setup.content_language || setup.contentLanguage || fallback.content_language || fallback.contentLanguage, 120),
    reason: cleanRescueText(setup.reason, 500),
  };
}

function normalizeProductMode(rawMode, websiteUrl = "") {
  const mode = rawMode && typeof rawMode === "object" ? rawMode : {};
  return {
    available: Boolean(mode.available),
    source_type: cleanRescueText(mode.source_type, 80),
    reason: cleanRescueText(mode.reason, 500),
    source_url: cleanRescueUrl(mode.source_url) || (Boolean(mode.available) ? cleanRescueUrl(websiteUrl) : ""),
  };
}

export function validateAdminRescueManifest({ manifest, rescueCase, brand }) {
  const type = String(rescueCase?.case_type || "");
  if (!new Set(["brand_analysis", "annual_calendar"]).has(type)) {
    throw new Error("Unsupported rescue case type.");
  }

  const expectedSource = type === "brand_analysis" ? "chatgpt_analysis_rescue" : "chatgpt_calendar_rescue";
  const sourceType = cleanRescueText(manifest?.source_type, 100);
  if (sourceType && sourceType !== expectedSource) {
    throw new Error(`Unexpected source_type. Expected '${expectedSource}'.`);
  }

  const brandWebsiteUrl = cleanRescueUrl(brand?.website_url);
  const manifestWebsiteUrl = cleanRescueUrl(manifest?.website_url);
  const websiteUrl = manifestWebsiteUrl || brandWebsiteUrl;
  if (!websiteUrl && type === "brand_analysis") {
    throw new Error("The analysis rescue manifest must contain a valid HTTPS website_url.");
  }
  if (brandWebsiteUrl && manifestWebsiteUrl) {
    const expectedHost = new URL(brandWebsiteUrl).hostname.replace(/^www\./i, "").toLowerCase();
    const manifestHost = new URL(manifestWebsiteUrl).hostname.replace(/^www\./i, "").toLowerCase();
    if (expectedHost !== manifestHost) {
      throw new Error(`The rescue package belongs to '${manifestHost}', but this case is locked to '${expectedHost}'.`);
    }
  }

  const targetYear = type === "annual_calendar"
    ? Number(rescueCase.target_year || manifest?.target_year || manifest?.calendar_year)
    : Number(manifest?.calendar_year || new Date().getUTCFullYear());
  if (!Number.isInteger(targetYear) || targetYear < 2020 || targetYear > 2100) {
    throw new Error("The rescue manifest contains an invalid calendar year.");
  }
  if (type === "brand_analysis" && targetYear !== new Date().getUTCFullYear()) {
    throw new Error(`This brand-analysis rescue must use calendar year ${new Date().getUTCFullYear()}.`);
  }
  if (type === "annual_calendar" && Number(rescueCase.target_year) !== targetYear) {
    throw new Error(`This rescue case is for ${rescueCase.target_year}, but the manifest is for ${targetYear}.`);
  }

  const profile = normalizeProfile(manifest?.profile, brand || {});
  if (type === "brand_analysis") {
    if (!profile.business_name) throw new Error("The rescue analysis must include profile.business_name.");
    if (!profile.industry) throw new Error("The rescue analysis must include profile.industry.");
    if (!profile.target_audience) throw new Error("The rescue analysis must include profile.target_audience.");
  }

  const opportunities = normalizeCampaignOpportunities(
    manifest?.campaign_opportunities,
    targetYear
  );
  if (!opportunities.length) {
    throw new Error(`The rescue package contains no valid campaign opportunities for ${targetYear}.`);
  }

  const sources = normalizeSources(manifest?.verified_sources || manifest?.sources);
  if (!sources.length) {
    throw new Error("The rescue package must include at least one verified source URL.");
  }

  return {
    version: Number(manifest?.version || 1),
    source_type: expectedSource,
    rescue_type: type,
    website_url: websiteUrl,
    calendar_year: targetYear,
    target_year: targetYear,
    profile,
    market_setup: normalizeMarketSetup(manifest?.market_setup, brand || {}),
    website_product_mode: normalizeProductMode(manifest?.website_product_mode, websiteUrl),
    campaign_opportunities: opportunities,
    verified_sources: sources,
    notes: cleanRescueText(manifest?.notes || manifest?.verification_note, 3000),
  };
}

export function buildAdminRescueBrief({ rescueCase, brand, previousCampaigns = [] }) {
  const isAnnual = rescueCase.case_type === "annual_calendar";
  const currentYear = new Date().getUTCFullYear();
  const targetYear = isAnnual
    ? Number(rescueCase.target_year)
    : currentYear;
  const website = cleanRescueUrl(brand?.website_url);

  const existingProfile = {
    business_name: brand?.business_name || "",
    website_url: website,
    brand_description: brand?.brand_description || "",
    industry: brand?.industry || "",
    target_audience: brand?.target_audience || "",
    content_market: brand?.content_market || "",
    country_code: brand?.country_code || "",
    content_language: brand?.content_language || "",
    website_product_mode_available: Boolean(brand?.website_product_mode_available),
    website_product_mode_reason: brand?.website_product_mode_reason || "",
    website_product_source_url: brand?.website_product_source_url || "",
  };

  const campaignSnapshot = (previousCampaigns || []).slice(0, 30).map((item) => ({
    title: item.title || "",
    event_date: item.event_date || null,
    start_date: item.start_date || null,
    end_date: item.end_date || null,
    event_type: item.event_type || "",
    campaign_category: item.campaign_category || "",
    campaign_goal: item.campaign_goal || "",
    target_customer_need: item.target_customer_need || "",
    website_content_strategy: item.website_content_strategy || "",
    website_product_selection_hint: item.website_product_selection_hint || "",
    recommended_post_count: Number(item.recommended_post_count || 0),
  }));

  const schema = isAnnual
    ? {
        version: 1,
        source_type: "chatgpt_calendar_rescue",
        rescue_type: "annual_calendar",
        website_url: website,
        target_year: targetYear,
        campaign_opportunities: [
          {
            title: "...",
            description: "...",
            event_type: "campaign",
            event_date: `${targetYear}-MM-DD`,
            start_date: null,
            end_date: null,
            relevance_reason: "...",
            relevance_score: 1,
            sales_score: 1,
            engagement_score: 1,
            recommended_post_count: 3,
            prompt_context: "...",
            campaign_angles: [],
            post_plan: [],
            date_confidence: "high",
            website_content_fit: "high",
            website_content_strategy: "product",
            website_product_selection_hint: "...",
            campaign_category: "...",
            campaign_goal: "...",
            target_customer_need: "...",
            recommended_angles: [],
            product_selection_guidance: "...",
            product_search_intent: "...",
            product_match_terms: [],
            product_search_queries: [],
            product_avoid_terms: [],
            tone_guidance: "...",
            cta_guidance: "...",
            image_guidance: "...",
          },
        ],
        verified_sources: [{ url: website, supports: "..." }],
      }
    : {
        version: 1,
        source_type: "chatgpt_analysis_rescue",
        rescue_type: "brand_analysis",
        website_url: website,
        calendar_year: targetYear,
        profile: {
          business_name: existingProfile.business_name || "...",
          industry: "...",
          target_audience: "...",
          detected_language: "...",
        },
        market_setup: {
          content_market: existingProfile.content_market || "...",
          country_code: existingProfile.country_code || "...",
          content_language: existingProfile.content_language || "...",
          reason: "...",
        },
        website_product_mode: {
          available: false,
          source_type: "",
          reason: "...",
          source_url: "",
        },
        campaign_opportunities: [
          {
            title: "...",
            description: "...",
            event_type: "campaign",
            event_date: `${targetYear}-MM-DD`,
            start_date: null,
            end_date: null,
            relevance_reason: "...",
            relevance_score: 1,
            sales_score: 1,
            engagement_score: 1,
            recommended_post_count: 3,
            prompt_context: "...",
            campaign_angles: [],
            post_plan: [],
            date_confidence: "high",
            website_content_fit: "high",
            website_content_strategy: "product",
            website_product_selection_hint: "...",
            campaign_category: "...",
            campaign_goal: "...",
            target_customer_need: "...",
            recommended_angles: [],
            product_selection_guidance: "...",
            product_search_intent: "...",
            product_match_terms: [],
            product_search_queries: [],
            product_avoid_terms: [],
            tone_guidance: "...",
            cta_guidance: "...",
            image_guidance: "...",
          },
        ],
        verified_sources: [{ url: website, supports: "..." }],
      };

  const prompt = isAnnual
    ? `You are helping Spreelo manually update a customer's campaign calendar because the website cannot be analyzed automatically.

CUSTOMER
Brand: ${existingProfile.business_name || "Unknown"}
Website: ${website || "Missing"}
Market: ${existingProfile.content_market || "Auto"}
Country: ${existingProfile.country_code || "Auto"}
Language: ${existingProfile.content_language || "Auto"}
Calendar year to create: ${targetYear}

TASK
Use ChatGPT web search/browser capabilities. Review the company's current public website and verifiable official sources. Create an updated, brand-adapted campaign calendar for ${targetYear}. Preserve the company's real offer and target audience. Update movable dates and choose only campaigns, holidays and seasons that are genuinely relevant to this company and market. Do not invent discounts, warranties, products, services, events or other claims.

The previous calendar is included in the rescue material as a reference. Do not copy old dates blindly; verify ${targetYear}.

Return an actual ZIP file containing manifest.json. manifest.json must follow the output_schema in the material exactly. campaign_opportunities must use the same strategic fields Spreelo currently uses. post_plan must be []. For product/service campaigns, product_match_terms and product_search_queries must be concrete and useful, not empty. verified_sources must contain the HTTPS sources you actually used. If the material cannot be verified, say so instead of filling gaps with uncertain information.`
    : `You are helping Spreelo rescue a failed website analysis.

CUSTOMER
Brand: ${existingProfile.business_name || "Unknown"}
Website: ${website || "Missing"}
Requested market: ${existingProfile.content_market || "Auto"}
Requested language: ${existingProfile.content_language || "Auto"}
Calendar year: ${targetYear}

TASK
Use ChatGPT web search/browser capabilities to gather VERIFIABLE information from the customer's public website and relevant official sources. Analyze what the company actually sells or provides, its industry, target audience, customer language/market, and whether the website has real product/service pages Spreelo can use. Then create the same type of brand-adapted campaign calendar that Spreelo's automatic analysis creates. Choose only commercially relevant campaigns for the company and market. Do not invent products, services, prices, discounts, warranties, events or other facts.

Return an actual ZIP file containing manifest.json. manifest.json must follow the output_schema in the material exactly. campaign_opportunities must use Spreelo's strategic campaign fields; post_plan must always be []. For product/service campaigns, product_match_terms and product_search_queries must be concrete and useful. verified_sources must contain the HTTPS sources that support the analysis. If the analysis cannot be verified, say so instead of filling gaps with uncertain material.`;

  return {
    version: 1,
    source_type: "spreelo_admin_rescue_brief",
    case_id: rescueCase.id,
    case_type: rescueCase.case_type,
    target_year: targetYear,
    failure: {
      error_code: rescueCase.error_code || "",
      error_message: rescueCase.error_message || "",
      source_job_id: rescueCase.source_job_id || null,
    },
    brand: existingProfile,
    previous_campaigns: campaignSnapshot,
    output_schema: schema,
    prompt,
  };
}
