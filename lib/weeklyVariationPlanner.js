// Deterministic, provider-free weekly content variation. The published schedule
// and manually edited content remain owned by automation_rules/overrides.
export const WEEKLY_VARIATION_MARKER = "SPREELO_ADAPTIVE_V1:";
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function parseWeeklyVariation(rule) {
  if (rule?.schedule_type !== "weekly") return null;
  const notes = String(rule?.strategy_notes || "");
  const start = notes.indexOf(WEEKLY_VARIATION_MARKER);
  if (start === -1) return null;
  const jsonStart = start + WEEKLY_VARIATION_MARKER.length;
  const end = notes.indexOf("\n", jsonStart);
  try {
    const config = JSON.parse(notes.slice(jsonStart, end < 0 ? undefined : end).trim());
    return config?.enabled === true && config?.selectionMode === "history_balanced" &&
      Array.isArray(config.variants) && config.variants.length ? config : null;
  } catch { return null; }
}

export function isoWeekDateForLocalNight(date, timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type) => parts.find((value) => value.type === type)?.value;
  const weekday = part("weekday");
  const hour = Number(part("hour"));
  const dateStr = `${part("year")}-${part("month")}-${part("day")}`;
  if (weekday !== "Sunday" && weekday !== "Monday") return null;
  if (weekday === "Sunday" && hour < 19) return null;
  if (weekday === "Monday" && hour >= 6) return null;
  const localDate = new Date(`${dateStr}T12:00:00Z`);
  if (weekday === "Sunday") localDate.setUTCDate(localDate.getUTCDate() + 1);
  return localDate.toISOString().slice(0, 10);
}

export function localWeeklySlotUtc(weekStart, weekday, publishTime, timeZone) {
  const index = DAY_NAMES.findIndex((day) => day.toLowerCase() === String(weekday || "").toLowerCase());
  const date = new Date(`${weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.max(0, index));
  const day = date.toISOString().slice(0, 10);
  const time = /^\d{2}:\d{2}/.test(String(publishTime || "")) ? String(publishTime).slice(0, 5) : "12:00";
  const desiredLocal = Date.parse(`${day}T${time}:00Z`);
  let guess = desiredLocal;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      }).formatToParts(new Date(guess));
      const val = (type) => parts.find((item) => item.type === type)?.value;
      const observedLocal = Date.parse(`${val("year")}-${val("month")}-${val("day")}T${val("hour")}:${val("minute")}:${val("second")}Z`);
      const drift = desiredLocal - observedLocal;
      guess += drift;
      if (Math.abs(drift) < 1000) break;
    }
  } catch { return new Date(desiredLocal).toISOString(); }
  return new Date(guess).toISOString();
}

export function getWeeklyCycle(rule, config, publishAtIso) {
  const first = String(config?.baseStartDate || "").trim();
  const base = new Date(first ? `${first}T00:00:00Z` : rule?.created_at || rule?.updated_at || 0).getTime();
  const target = new Date(publishAtIso).getTime();
  return Number.isFinite(base) && Number.isFinite(target)
    ? Math.max(0, Math.floor((target - base) / (7 * 86400000))) : 0;
}

export function chooseWeeklyVariant({ rule, config, cycle, recentTypes = [], selectedThisWeek = new Set(), goalWeight = () => 60, learningAdjustment = () => 0, performanceAdjustment = () => 0 }) {
  const count = config.variants.length;
  const slotIndex = Math.max(0, Number(config.slotIndex || 0));
  const target = (cycle * Math.max(1, Number(config.slotCount || 1)) + slotIndex) % count;
  const recentSix = recentTypes.slice(0, 6);
  let chosen = 0;
  let bestScore = -Infinity;
  for (let index = 0; index < count; index += 1) {
    const variant = config.variants[index];
    const type = String(variant?.contentTypeId || rule?.content_type_id || "");
    if (!type) continue;
    const distance = Math.abs(index - target);
    const circularDistance = Math.min(distance, count - distance);
    const firstRecent = recentTypes.indexOf(type);
    const usedRecently = recentTypes.slice(0, 20).filter((item) => item === type).length;
    let score = 100 + Math.max(0, 12 - index * 1.25) + Math.max(0, 16 - circularDistance * 5);
    score += (goalWeight(config.goalId, type) - 60) * 0.35;
    score += learningAdjustment(type) + performanceAdjustment(type);
    if (selectedThisWeek.has(type)) score -= 125;
    if (firstRecent === 0) score -= 115;
    else if (firstRecent === 1) score -= 82;
    else if (firstRecent >= 2 && firstRecent <= 3) score -= 55;
    else if (firstRecent >= 4 && firstRecent <= 7) score -= 28;
    else if (firstRecent >= 8 && firstRecent <= 11) score -= 12;
    score -= usedRecently * 9;
    if (config.goalId !== "sell_more" && recentSix.length >= 4 &&
        recentSix.filter((recent) => ["website_item", "website_item_text_ad", "animated_website_item", "ai_product_video", "carousel_website_item"].includes(recent)).length >= Math.ceil(recentSix.length / 2) &&
        ["website_item", "website_item_text_ad", "animated_website_item", "ai_product_video", "carousel_website_item"].includes(type)) score -= 42;
    if (score > bestScore) { bestScore = score; chosen = index; }
  }
  return chosen;
}

export function lockWeeklyVariant(rule, config, cycle, variantIndex) {
  const notes = String(rule?.strategy_notes || "");
  const marker = notes.indexOf(WEEKLY_VARIATION_MARKER);
  if (marker < 0) return notes;
  const jsonStart = marker + WEEKLY_VARIATION_MARKER.length;
  const lineEnd = notes.indexOf("\n", jsonStart);
  const end = lineEnd < 0 ? notes.length : lineEnd;
  return `${notes.slice(0, jsonStart)}${JSON.stringify({
    ...config,
    lockedVariantIndex: variantIndex,
    lockedVariantCycle: cycle,
  })}${notes.slice(end)}`;
}
