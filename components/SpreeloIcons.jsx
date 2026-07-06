function normalizeText(value) {
  return String(value || "").toLowerCase();
}

export function getCampaignGlyphKind(campaign = {}) {
  const eventType = normalizeText(campaign.event_type);
  const title = normalizeText(campaign.title);
  const text = `${eventType} ${title}`;

  if (/halloween|pumpkin/.test(text)) return "pumpkin";
  if (/school|skol|student|backpack|ryggs/.test(text)) return "backpack";
  if (/black friday|sale|offer|discount|shopping|retail|tag|erbjud/.test(text)) {
    return "tag";
  }
  if (/christmas|jul|gift|present|holiday|birthday|mother|father|valentine/.test(text)) {
    return "gift";
  }
  if (/awareness|theme|temadag|social|community/.test(text)) return "spark";

  return "calendar";
}

function GiftGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 10h15v9.5h-15z" />
      <path d="M3.5 7h17v3h-17z" />
      <path d="M12 7v12.5" />
      <path d="M12 7c-3.8 0-5.4-3.8-2.4-4.4 1.7-.4 2.6 1.4 2.4 4.4z" />
      <path d="M12 7c3.8 0 5.4-3.8 2.4-4.4-1.7-.4-2.6 1.4-2.4 4.4z" />
    </svg>
  );
}

function PumpkinGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 6.5c5 0 8.5 3.1 8.5 7.1 0 4.2-3.6 7-8.5 7s-8.5-2.8-8.5-7c0-4 3.5-7.1 8.5-7.1z" />
      <path d="M12 6.6c-2.1 1.1-3.2 3.5-3.2 6.9 0 3.1 1.1 5.5 3.2 7" />
      <path d="M12 6.6c2.1 1.1 3.2 3.5 3.2 6.9 0 3.1-1.1 5.5-3.2 7" />
      <path d="M10.7 6.4c.3-2.2 1.5-3 3.5-2.5" />
      <path d="M8.2 13h.1" />
      <path d="M15.7 13h.1" />
      <path d="M9.2 16.2c1.8 1.2 3.8 1.2 5.6 0" />
    </svg>
  );
}

function BackpackGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 9.5c0-2.8 2-5 5-5s5 2.2 5 5v10h-10z" />
      <path d="M9 9.5h6" />
      <path d="M8 13h8v4h-8z" />
      <path d="M10 4.8v-1.3h4v1.3" />
      <path d="M5.2 11.5v5.7" />
      <path d="M18.8 11.5v5.7" />
    </svg>
  );
}

function TagGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 12.2 12.2 4.5h6.3v6.3l-7.7 7.7z" />
      <path d="M15.8 7.9h.1" />
      <path d="M7.7 12.2l4.1 4.1" />
    </svg>
  );
}

function SparkGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 14.2 9l5.8 2.2-5.8 2.2L12 20l-2.2-6.6L4 11.2 9.8 9z" />
      <path d="M18.2 4.4v3.1" />
      <path d="M16.7 5.9h3.1" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6.5h14v13h-14z" />
      <path d="M5 10h14" />
      <path d="M8 4.5v4" />
      <path d="M16 4.5v4" />
      <path d="M8.5 13.5h2.4" />
      <path d="M13.1 13.5h2.4" />
      <path d="M8.5 16.2h2.4" />
    </svg>
  );
}

const glyphs = {
  backpack: BackpackGlyph,
  calendar: CalendarGlyph,
  gift: GiftGlyph,
  pumpkin: PumpkinGlyph,
  spark: SparkGlyph,
  tag: TagGlyph,
};

export function CampaignGlyph({ campaign, className = "" }) {
  const kind = getCampaignGlyphKind(campaign);
  const Glyph = glyphs[kind] || CalendarGlyph;

  return (
    <span
      className={`campaign-glyph campaign-glyph-${kind} ${className}`.trim()}
      aria-hidden="true"
    >
      <Glyph />
    </span>
  );
}
