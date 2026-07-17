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
];

export const DEFAULT_CONTENT_FORMAT_LIBRARY = [
  {
    content_type_id: "website_item",
    default_label: "Website item",
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
    content_type_id: "carousel_website_item",
    default_label: "Website carousel",
    category: "image_ads",
    icon_name: "GalleryHorizontalEnd",
    is_featured: true,
    sort_order: 40,
  },
  {
    content_type_id: "problem_solution",
    default_label: "Problem → Solution",
    category: "popular",
    icon_name: "Puzzle",
    is_featured: true,
    sort_order: 50,
  },
  {
    content_type_id: "tips",
    default_label: "Tips & advice",
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
    content_type_id: "focus_source",
    default_label: "Focus on a specific page",
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
  },
  {
    content_type_id: "faq",
    default_label: "FAQ / Questions",
    category: "educational",
    icon_name: "CircleHelp",
    is_featured: false,
    sort_order: 100,
  },
  {
    content_type_id: "behind_scenes",
    default_label: "Behind the scenes",
    category: "popular",
    icon_name: "Clapperboard",
    is_featured: false,
    sort_order: 110,
  },
  {
    content_type_id: "checklist",
    default_label: "Checklist",
    category: "educational",
    icon_name: "ListChecks",
    is_featured: false,
    sort_order: 120,
  },
  {
    content_type_id: "service_focus",
    default_label: "Service in focus",
    category: "sales",
    icon_name: "Wrench",
    is_featured: false,
    sort_order: 130,
  },
  {
    content_type_id: "case_example",
    default_label: "Customer case / example",
    category: "popular",
    icon_name: "Trophy",
    is_featured: false,
    sort_order: 140,
  },
  {
    content_type_id: "myth_fact",
    default_label: "Myth vs fact",
    category: "educational",
    icon_name: "Sparkles",
    is_featured: false,
    sort_order: 150,
  },
  {
    content_type_id: "local",
    default_label: "Local connection",
    category: "popular",
    icon_name: "MapPin",
    is_featured: false,
    sort_order: 160,
  },
  {
    content_type_id: "seasonal",
    default_label: "Seasonal post",
    category: "popular",
    icon_name: "CalendarDays",
    is_featured: false,
    sort_order: 170,
  },
  {
    content_type_id: "comparison",
    default_label: "Comparison",
    category: "educational",
    icon_name: "Scale",
    is_featured: false,
    sort_order: 180,
  },
  {
    content_type_id: "mini_guide",
    default_label: "Mini-guide",
    category: "educational",
    icon_name: "BookOpen",
    is_featured: false,
    sort_order: 190,
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

export function normalizeContentFormatRows(rows = []) {
  const storedMap = Object.fromEntries(
    (Array.isArray(rows) ? rows : []).map((item) => [item.content_type_id, item])
  );

  return DEFAULT_CONTENT_FORMAT_LIBRARY.map((defaults) => ({
    ...defaults,
    ...(storedMap[defaults.content_type_id] || {}),
    active: storedMap[defaults.content_type_id]?.active !== false,
    is_featured:
      storedMap[defaults.content_type_id]?.is_featured ?? defaults.is_featured,
  }));
}
