import { DEFAULT_CONTENT_FORMAT_LIBRARY } from "./contentFormatLibrary";
import { getDefaultContentCreditCost } from "./contentEconomics";

const BASE = {
  tone: "Friendly",
  language: "Auto",
  post_type: "Social media post",
  length: "Medium",
  cta_type: "Learn more",
  generate_image: true,
  include_emojis: true,
  include_hashtags: true,
};

const DEFINITIONS = {
  website_item: { usesWebsiteContent:true, prompt:"Use the website URL from the brand profile. Identify one concrete, verified product with a usable product image from the website. Create a social media post that promotes that specific product in a helpful, trustworthy and sales-focused way. Use only information that clearly appears on the website. Do not invent prices, discounts, guarantees, features or availability.", imagePrompt:"Create a premium 4:5 editorial product post around the verified website item. If the source already has real transparency, place that exact product inside the 4:5 working canvas and generate the full finished composition around it in one GPT-Image-2 pass while preserving the product unchanged. Otherwise skip cutout/background-removal attempts and faithfully recreate the product in the same GPT-Image-2 composition. Give the product generous space, keep the typography slightly smaller and more restrained, reserve a bottom safe zone for an optional later logo overlay, and use concise centered mobile-readable typography with exactly two visible text roles: a headline and the exact product/model name." },
  website_item_text_ad: { usesWebsiteContent:true, prompt:"Use the website URL from the brand profile. Identify one concrete verified sellable item. Create a trustworthy sales-focused caption that works together with a product-specific ad image. Use only verified website information and never invent offers.", imagePrompt:"Create a polished ad-style image around the verified website item. Include short readable marketing text, but never invent price, rating or discount." },
  animated_website_item: { usesWebsiteContent:true, contentFormat:"animated_video", animationStyle:"product_push", prompt:"Identify one verified website product and create a helpful sales-focused caption for a short animated product Reel. Never invent product facts or offers.", imagePrompt:"Create the normal Spreelo premium 9:16 animated product Reel using the verified product and the existing video-background pipeline." },
  ai_product_video: { usesWebsiteContent:true, contentFormat:"animated_video", animationStyle:"kling_product_video", prompt:"Identify one concrete verified website product with a usable image and create a trustworthy caption for a short AI product video. Never invent hidden product details or claims.", imagePrompt:"Create the normal Spreelo 6-second 9:16 AI product video from the verified product image. Preserve visible branding, angle, colors, proportions and printed details exactly." },
  carousel_website_item: { usesWebsiteContent:true, contentFormat:"carousel", prompt:"Identify several concrete verified website products and create a curated swipeable carousel around one clear theme. Use only verified information and do not invent products or offers.", imagePrompt:"Use verified product images for the normal Spreelo product carousel. Stop rather than inventing products if enough verified items cannot be found." },
  problem_solution: { prompt:"Create a social media post that starts from a real customer problem or need related to this business and explains how the business helps solve it. Be useful, specific and trustworthy.", imagePrompt:"Create a professional believable image visualizing a relevant customer problem being solved. No readable text." },
  tips: { prompt:"Create a useful social media post teaching one practical tip related to this business. Make it specific, helpful and easy to understand.", imagePrompt:"Create a professional image supporting the practical tip. No generic stock-ad feeling." },
  mistakes: { prompt:"Create a helpful social media post about common mistakes customers make related to this business, product or service. Explain them without judging the audience.", imagePrompt:"Create a tasteful professional image suggesting mistakes to avoid. No readable text." },
  faq: { prompt:"Create a social media post answering a common customer question related to this business. Make the answer clear, trustworthy and useful.", imagePrompt:"Create a professional visual supporting a question-and-answer theme without readable text." },
  checklist: { prompt:"Create a practical, save-worthy checklist-style social media post related to this business. Keep it useful and specific.", imagePrompt:"Create a professional visual supporting a checklist or preparation theme without readable text." },
  service_focus: { prompt:"Create a social media post explaining one real service or offer from this business in a clear helpful way. Focus on customer value and do not invent details.", imagePrompt:"Create a believable professional visual of the service or customer benefit." },
  myth_fact: { prompt:"Create a myth-versus-fact social media post related to this business or industry. Correct a common misunderstanding in a simple trustworthy way.", imagePrompt:"Create a professional clarity/comparison visual without readable text." },
  seasonal: { prompt:"Create a timely seasonal social media post that naturally connects the current season or relevant occasion to this business. Do not force a connection or invent offers.", imagePrompt:"Create a polished seasonal image naturally relevant to the business." },
  mini_guide: { prompt:"Create a compact mini-guide that teaches the audience something useful related to this business. Make it structured, practical and trustworthy.", imagePrompt:"Create a professional guide-style supporting image without readable text." },
  offer_campaign: { special:"offer", prompt:"Create a social media post around the exact authorized offer supplied in the test instruction. Preserve offer wording/code/conditions exactly and do not invent any additional discount.", imagePrompt:"Create a polished campaign image for the exact authorized offer. Do not change the supplied offer or code." },
  giveaway: { special:"giveaway", prompt:"Create a clear social media giveaway/competition post using only the exact prize, end date and rules supplied in the test instruction. Do not invent legal conditions or extra prizes.", imagePrompt:"Create a celebratory but professional giveaway visual fitting the exact supplied prize. Avoid invented text/details." },
  focus_source: { special:"focus_url", usesWebsiteContent:true, prompt:"Use only the explicitly supplied focus-page URL as the primary source. Create a useful social media post based on verified information from that page.", imagePrompt:"Create a professional image grounded in the verified focus-page subject." },
  manual_prompt: { special:"manual_prompt", prompt:"Follow the administrator's supplied custom post instruction while respecting verified brand information and normal Spreelo safety/quality rules.", imagePrompt:"Create a professional image that directly supports the supplied custom post instruction." },
};

export function getAdminMassTestFormats(formatRows = []) {
  const stored = Object.fromEntries((formatRows || []).map((r) => [r.content_type_id, r]));
  return DEFAULT_CONTENT_FORMAT_LIBRARY.map((item) => {
    const row = stored[item.content_type_id] || {};
    const definition = DEFINITIONS[item.content_type_id] || {};
    return {
      id: item.content_type_id,
      label: row.display_label || item.default_label,
      description: row.description || null,
      active: row.active !== false,
      estimatedCostSek: row.estimated_cost_sek == null ? null : Number(row.estimated_cost_sek),
      creditCost: Math.max(1, Number(row.customer_credit_cost || getDefaultContentCreditCost(item.content_type_id))),
      special: definition.special || null,
      usesWebsiteContent: Boolean(definition.usesWebsiteContent),
    };
  }).filter((item) => item.active);
}

export function buildMassTestRule({ userId, brand, platform, contentTypeId, batchId, jobKey, repeatIndex=1, specialConfig={}, nowIso, campaign=null, campaignPost=null, campaignIndex=null, campaignCount=null }) {
  const formatDefault = DEFAULT_CONTENT_FORMAT_LIBRARY.find((f) => f.content_type_id === contentTypeId);
  const d = DEFINITIONS[contentTypeId] || DEFINITIONS.manual_prompt;
  let prompt = d.prompt;
  let imagePrompt = d.imagePrompt;
  let contentSourceScope = "whole_website";
  let contentSourceUrl = null;
  if (d.special === "offer") prompt += `\n\nAuthorized offer for this test:\n${String(specialConfig.offer || "").trim()}`;
  if (d.special === "giveaway") prompt += `\n\nAuthorized giveaway details for this test:\n${String(specialConfig.giveaway || "").trim()}`;
  if (d.special === "manual_prompt") prompt += `\n\nAdministrator instruction:\n${String(specialConfig.manualPrompt || "").trim()}`;
  if (d.special === "focus_url") {
    contentSourceUrl = String(specialConfig.focusUrl || "").trim() || null;
    contentSourceScope = "focus_page";
    prompt += `\n\nFocus page: ${contentSourceUrl || "MISSING"}`;
  }
  const campaignTitle = campaign?.title || null;
  if (campaignTitle) {
    const campaignContext = [
      `Calendar campaign: ${campaignTitle}`,
      campaign?.description ? `Campaign description: ${campaign.description}` : "",
      campaignPost?.role ? `Post role: ${campaignPost.role}` : "",
      campaignPost?.purpose ? `Post purpose: ${campaignPost.purpose}` : "",
      campaignPost?.marketing_angle ? `Marketing angle: ${campaignPost.marketing_angle}` : "",
      campaignPost?.customer_need ? `Customer need: ${campaignPost.customer_need}` : "",
      campaignPost?.product_search_intent ? `Product search intent: ${campaignPost.product_search_intent}` : "",
    ].filter(Boolean).join("\n");
    prompt = `${prompt}\n\n${campaignContext}\nThe generated content must clearly fit this campaign theme while still using only verified facts.`;
  }
  const date = new Date(nowIso || Date.now());
  const runDate = new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Stockholm", year:"numeric", month:"2-digit", day:"2-digit" }).format(date);
  const publishTime = new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/Stockholm", hour:"2-digit", minute:"2-digit", hour12:false }).format(date);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone:"Europe/Stockholm", weekday:"long" }).format(date);
  const imageSource = d.contentFormat === "carousel" ? "website_carousel" : d.usesWebsiteContent ? "website" : "ai";
  return {
    user_id:userId, brand_profile_id:brand.id, name:campaignTitle || `Admin mass test · ${brand.business_name || "Brand"}`,
    weekday, publish_time:publishTime, prompt, platform, ...BASE,
    language: brand.content_language || "Auto", image_prompt:imagePrompt || null,
    image_source:imageSource, include_logo:Boolean(brand.logo_url) && brand.logo_enabled_by_default !== false,
    credit_cost:getDefaultContentCreditCost(contentTypeId), schedule_type:"once", run_date:runDate,
    timezone:"Europe/Stockholm", next_run_at:nowIso, approval_required:true,
    queue_source:campaignTitle ? "campaign" : "content_studio", queue_priority:campaignTitle ? 50 : 70,
    is_active:true, credit_reservation_status:"legacy", credit_reserved_amount:0,
    content_type_id:contentTypeId, content_type_label:formatDefault?.default_label || contentTypeId,
    uses_website_content:Boolean(d.usesWebsiteContent), content_format:d.contentFormat || "single_image",
    animation_style:d.animationStyle || null, content_source_scope:contentSourceScope, content_source_url:contentSourceUrl,
    campaign_phase:campaignPost?.phase || null, marketing_angle:campaignPost?.marketing_angle || null,
    customer_stage:campaignPost?.customer_stage || null, cta_strength:campaignPost?.cta_strength || null,
    campaign_post_index:campaignIndex == null ? null : campaignIndex + 1,
    campaign_post_count:campaignCount || null, campaign_goal:campaign?.goal || null,
    target_customer_need:campaignPost?.customer_need || null,
    strategy_notes:campaignPost?.strategy_notes || null,
    product_match_terms:Array.isArray(campaignPost?.product_match_terms) ? campaignPost.product_match_terms : null,
    product_search_queries:Array.isArray(campaignPost?.product_search_queries) ? campaignPost.product_search_queries : null,
    product_avoid_terms:Array.isArray(campaignPost?.product_avoid_terms) ? campaignPost.product_avoid_terms : null,
    avoid_terms:Array.isArray(campaignPost?.product_avoid_terms) ? campaignPost.product_avoid_terms : null,
    product_search_intent:campaignPost?.product_search_intent || null,
    is_admin_test:true, admin_test_batch_id:batchId, admin_test_job_key:jobKey,
    admin_test_repeat_index:repeatIndex, updated_at:nowIso,
  };
}

export function mapCampaignPostContentType(post, brand) {
  const mode = String(post?.content_source_mode || post?.content_type_id || post?.format || "").toLowerCase();
  const mapping = {
    website_product:"website_item", product:"website_item", website_item:"website_item",
    website_product_ad:"website_item_text_ad", product_ad:"website_item_text_ad", website_item_text_ad:"website_item_text_ad",
    website_reel:"animated_website_item", animated_website_item:"animated_website_item",
    ai_product_video:"ai_product_video", website_carousel:"carousel_website_item", carousel_website_item:"carousel_website_item",
    problem_solution:"problem_solution", tips:"tips", mistakes:"mistakes", faq:"faq", checklist:"checklist",
    service_focus:"service_focus", website_service:"service_focus", myth_fact:"myth_fact", seasonal:"seasonal", mini_guide:"mini_guide",
  };
  return mapping[mode] || (brand?.website_product_mode_available ? "website_item_text_ad" : "problem_solution");
}

export function normalizeCampaignPlan(campaign, brand) {
  const source = Array.isArray(campaign?.post_plan) ? campaign.post_plan : [];
  if (source.length) return source.slice(0, 30);
  const count = Math.max(1, Math.min(7, Number(campaign?.recommended_post_count || 3) || 3));
  return Array.from({length:count}, (_,i) => ({
    role:i===0?"Campaign opener":i===count-1?"Campaign closer":`Campaign post ${i+1}`,
    purpose:`Support the ${campaign?.title || "campaign"} theme`,
    content_source_mode:brand?.website_product_mode_available ? (i % 3 === 2 ? "tips" : i % 2 ? "website_product" : "website_product_ad") : (i % 3 === 0 ? "problem_solution" : i % 3 === 1 ? "tips" : "faq"),
  }));
}
