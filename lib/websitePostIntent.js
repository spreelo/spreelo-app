// Creation instructions and product selection are separate inputs. Keep default
// prompts shared with their producers so new wording cannot become search terms.
export const DEFAULT_WEBSITE_POST_PROMPTS = Object.freeze({
  "website_item": "Use the website URL from the brand profile. Identify one concrete, verified product with a usable product image from the website. Create a social media post that promotes that specific product in a helpful, trustworthy and sales-focused way. Use only information that clearly appears on the website. Do not substitute a service, listing or generic category, and do not invent prices, discounts, guarantees, features or availability.",
  "website_item_text_ad": "Use the website URL from the brand profile. Identify one concrete product, service, listing, offer or other sellable item from the website. Create a social media post caption that promotes that specific item in a helpful, trustworthy and sales-focused way. The caption should work together with a product-specific ad image. Use only information that clearly appears on the website. Do not invent prices, discounts, guarantees, opening hours, features or availability.",
  "animated_website_item": "Use the website URL from the brand profile. Identify one concrete product, service, listing, offer or other sellable item from the website. Create a social media caption that promotes that exact item in a helpful, trustworthy and sales-focused way. The caption will be paired with a short animated product video. Use only information that clearly appears on the website. Do not invent prices, discounts, guarantees, opening hours, features or availability.",
  "ai_product_video": "Use the website URL from the brand profile. Identify one concrete, verified product with a usable product image from the website. Create a social media caption that promotes that exact product in a helpful, trustworthy and sales-focused way. The caption will be paired with a short AI-generated product video. Use only information that clearly appears on the website. Do not invent prices, discounts, guarantees, features or availability.",
  "carousel_website_item": "Use the website URL from the brand profile. Identify several concrete products, services, listings, offers or other sellable items from the website and create a swipeable carousel draft around them. The carousel should feel like a curated collection, guide, comparison or campaign post with one clear shared theme. Use only information that clearly appears on the website. Do not invent prices, discounts, guarantees, opening hours, features or availability."
});
export const ADMIN_WEBSITE_POST_PROMPTS = Object.freeze({
  "website_item": "Use the website URL from the brand profile. Identify one concrete, verified product with a usable product image from the website. Create a social media post that promotes that specific product in a helpful, trustworthy and sales-focused way. Use only information that clearly appears on the website. Do not invent prices, discounts, guarantees, features or availability.",
  "website_item_text_ad": "Use the website URL from the brand profile. Identify one concrete verified sellable item. Create a trustworthy sales-focused caption that works together with a product-specific ad image. Use only verified website information and never invent offers.",
  "animated_website_item": "Identify one verified website product and create a helpful sales-focused caption for a short animated product Reel. Never invent product facts or offers.",
  "ai_product_video": "Identify one concrete verified website product with a usable image and create a trustworthy caption for a short AI product video. Never invent hidden product details or claims.",
  "carousel_website_item": "Identify several concrete verified website products and create a curated swipeable carousel around one clear theme. Use only verified information and do not invent products or offers."
});

export function removeDefaultWebsitePostInstructions(value) {
  let text = String(value || "");
  for (const prompt of [...Object.values(DEFAULT_WEBSITE_POST_PROMPTS), ...Object.values(ADMIN_WEBSITE_POST_PROMPTS)]) {
    const pattern = prompt.split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    text = text.replace(new RegExp(pattern, "gi"), " ");
  }
  return text.trim();
}
