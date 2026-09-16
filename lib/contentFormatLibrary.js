import { getDefaultContentCreditCost } from "./contentEconomics";

export const CONTENT_FORMAT_ASSET_BUCKET = "content-format-assets";

export const CONTENT_FORMAT_ICON_OPTIONS = [
  "ShoppingBag",
  "Megaphone",
  "PlayCircle",
  "GalleryHorizontalEnd",
  "Puzzle",
  "Lightbulb",
  "AlertTriangle",
  "CircleHelp",
  "Clapperboard",
  "ListChecks",
  "Wrench",
  "Trophy",
  "Sparkles",
  "MapPin",
  "CalendarDays",
  "Scale",
  "BookOpen",
  "Link2",
  "Tag",
  "PenLine",
  "Gift",
  "MessageCircleHeart",
];

export const DEFAULT_CONTENT_FORMAT_LIBRARY = [
  {
    content_type_id: "website_item",
    default_label: "Product post",
    category: "sales",
    icon_name: "ShoppingBag",
    is_featured: true,
    sort_order: 10,
  },
  {
    content_type_id: "website_item_text_ad",
    default_label: "Text + ad",
    category: "image_ads",
    icon_name: "Megaphone",
    is_featured: true,
    sort_order: 20,
  },
  {
    content_type_id: "animated_website_item",
    default_label: "Product Reel",
    category: "video",
    icon_name: "PlayCircle",
    is_featured: true,
    sort_order: 30,
  },
  {
    content_type_id: "ai_product_video",
    default_label: "AI product video",
    category: "video",
    icon_name: "Clapperboard",
    is_featured: true,
    sort_order: 35,
  },
  {
    content_type_id: "carousel_website_item",
    default_label: "AI-designed carousel – 5 products",
    category: "image_ads",
    icon_name: "GalleryHorizontalEnd",
    is_featured: true,
    sort_order: 40,
  },
  {
    content_type_id: "problem_solution",
    default_label: "Problem & solution",
    category: "popular",
    icon_name: "Puzzle",
    is_featured: true,
    sort_order: 50,
  },
  {
    content_type_id: "tips",
    default_label: "Tips & knowledge",
    category: "educational",
    icon_name: "Lightbulb",
    is_featured: true,
    sort_order: 60,
  },
  {
    content_type_id: "offer_campaign",
    default_label: "Campaign code plan",
    category: "sales",
    icon_name: "Tag",
    is_featured: true,
    sort_order: 70,
  },
  {
    content_type_id: "giveaway",
    default_label: "Giveaway / Competition",
    category: "popular",
    icon_name: "Gift",
    is_featured: true,
    sort_order: 75,
  },
  {
    content_type_id: "focus_source",
    default_label: "Post from web page",
    category: "sales",
    icon_name: "Link2",
    is_featured: false,
    sort_order: 80,
  },
  {
    content_type_id: "mistakes",
    default_label: "Common mistakes",
    category: "educational",
    icon_name: "AlertTriangle",
    is_featured: false,
    sort_order: 90,
    active: false,
  },
  {
    content_type_id: "faq",
    default_label: "Question & answer",
    category: "educational",
    icon_name: "CircleHelp",
    is_featured: true,
    sort_order: 100,
  },
  {
    content_type_id: "checklist",
    default_label: "Checklist",
    category: "educational",
    icon_name: "ListChecks",
    is_featured: false,
    sort_order: 120,
    active: false,
  },
  {
    content_type_id: "service_focus",
    default_label: "Service in focus",
    category: "sales",
    icon_name: "Wrench",
    is_featured: true,
    sort_order: 130,
  },
  {
    content_type_id: "myth_fact",
    default_label: "Myth vs fact",
    category: "educational",
    icon_name: "Sparkles",
    is_featured: false,
    sort_order: 150,
    active: false,
  },
  {
    content_type_id: "seasonal",
    default_label: "Seasonal post",
    category: "popular",
    icon_name: "CalendarDays",
    is_featured: false,
    sort_order: 170,
    active: false,
  },
  {
    content_type_id: "mini_guide",
    default_label: "Mini-guide",
    category: "educational",
    icon_name: "BookOpen",
    is_featured: false,
    sort_order: 190,
    active: false,
  },
  {
    content_type_id: "guide_choice",
    default_label: "Guide & decision help",
    category: "educational",
    icon_name: "BookOpen",
    is_featured: true,
    sort_order: 195,
  },
  {
    content_type_id: "engagement_humor",
    default_label: "Engagement & humour",
    category: "popular",
    icon_name: "MessageCircleHeart",
    is_featured: true,
    sort_order: 197,
  },
  {
    content_type_id: "manual_prompt",
    default_label: "Custom post",
    category: "text",
    icon_name: "PenLine",
    is_featured: false,
    sort_order: 200,
  },
];

export const DEFAULT_CONTENT_FORMAT_MAP = Object.fromEntries(
  DEFAULT_CONTENT_FORMAT_LIBRARY.map((item) => [item.content_type_id, item])
);

export function normalizeContentFormatRows(rows = [], { includeCustom = false } = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const storedMap = Object.fromEntries(
    safeRows.map((item) => [item.content_type_id, item])
  );

  const builtIns = DEFAULT_CONTENT_FORMAT_LIBRARY.map((defaults) => {
    const stored = storedMap[defaults.content_type_id] || {};
    return {
      ...defaults,
      ...stored,
      display_label: stored.display_label || null,
      description: stored.description || null,
      active: stored.active ?? defaults.active ?? true,
      is_featured: stored.is_featured ?? defaults.is_featured,
      image_url: stored.image_url || null,
      image_storage_path: stored.image_storage_path || null,
      icon_url: stored.icon_url || null,
      icon_storage_path: stored.icon_storage_path || null,
      customer_credit_cost: Math.max(1, Number(stored.customer_credit_cost || getDefaultContentCreditCost(defaults.content_type_id))),
      credit_variant_prices: stored.credit_variant_prices && typeof stored.credit_variant_prices === "object" ? stored.credit_variant_prices : {},
      estimated_cost_sek: stored.estimated_cost_sek == null ? null : Number(stored.estimated_cost_sek),
      available_starter: stored.available_starter !== false,
      available_growth: stored.available_growth !== false,
      available_pro: stored.available_pro !== false,
      pending_credit_cost: stored.pending_credit_cost == null ? null : Number(stored.pending_credit_cost),
      pending_effective_at: stored.pending_effective_at || null,
      is_custom: Boolean(stored.is_custom),
      generator_available: true,
    };
  });

  if (!includeCustom) return builtIns;

  const customRows = safeRows
    .filter((item) => !DEFAULT_CONTENT_FORMAT_MAP[item.content_type_id])
    .map((item) => ({
      ...item,
      default_label: item.display_label || item.content_type_id,
      display_label: item.display_label || item.content_type_id,
      description: item.description || null,
      icon_name: item.icon_name || "Sparkles",
      category: item.category || "popular",
      active: item.active === true,
      is_featured: Boolean(item.is_featured),
      sort_order: Number(item.sort_order || 9999),
      customer_credit_cost: Math.max(1, Number(item.customer_credit_cost || 10)),
      credit_variant_prices: item.credit_variant_prices && typeof item.credit_variant_prices === "object" ? item.credit_variant_prices : {},
      estimated_cost_sek: item.estimated_cost_sek == null ? null : Number(item.estimated_cost_sek),
      available_starter: item.available_starter !== false,
      available_growth: item.available_growth !== false,
      available_pro: item.available_pro !== false,
      pending_credit_cost: item.pending_credit_cost == null ? null : Number(item.pending_credit_cost),
      pending_effective_at: item.pending_effective_at || null,
      is_custom: true,
      generator_available: false,
    }));

  return [...builtIns, ...customRows].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}
