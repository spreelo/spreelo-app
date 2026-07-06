const KNOWN_CONTENT_LANGUAGES = [
  "English",
  "Swedish",
  "German",
  "Danish",
  "Norwegian",
  "Finnish",
  "Dutch",
  "French",
  "Spanish",
  "Italian",
  "Portuguese",
  "Polish",
  "Arabic",
  "Hindi",
  "Other",
];

const LANGUAGE_ALIASES = new Map([
  ["english", "English"],
  ["engelska", "English"],
  ["en", "English"],
  ["swedish", "Swedish"],
  ["svenska", "Swedish"],
  ["sv", "Swedish"],
  ["german", "German"],
  ["deutsch", "German"],
  ["tyska", "German"],
  ["de", "German"],
  ["danish", "Danish"],
  ["dansk", "Danish"],
  ["danska", "Danish"],
  ["da", "Danish"],
  ["norwegian", "Norwegian"],
  ["norsk", "Norwegian"],
  ["norska", "Norwegian"],
  ["no", "Norwegian"],
  ["nb", "Norwegian"],
  ["finnish", "Finnish"],
  ["suomi", "Finnish"],
  ["finska", "Finnish"],
  ["fi", "Finnish"],
  ["dutch", "Dutch"],
  ["nederlands", "Dutch"],
  ["holländska", "Dutch"],
  ["nl", "Dutch"],
  ["french", "French"],
  ["français", "French"],
  ["franska", "French"],
  ["fr", "French"],
  ["spanish", "Spanish"],
  ["español", "Spanish"],
  ["spanska", "Spanish"],
  ["es", "Spanish"],
  ["italian", "Italian"],
  ["italiano", "Italian"],
  ["italienska", "Italian"],
  ["it", "Italian"],
  ["portuguese", "Portuguese"],
  ["português", "Portuguese"],
  ["portugisiska", "Portuguese"],
  ["pt", "Portuguese"],
  ["polish", "Polish"],
  ["polski", "Polish"],
  ["polska", "Polish"],
  ["pl", "Polish"],
  ["arabic", "Arabic"],
  ["arabiska", "Arabic"],
  ["ar", "Arabic"],
  ["hindi", "Hindi"],
  ["hi", "Hindi"],
]);

function cleanLanguageToken(value) {
  return String(value || "")
    .replace(/^brand\.language\./i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(multi[-\s]?language|supported|support|languages?|detected|primary|main|website|customer[-\s]?facing)\b/gi, "")
    .replace(/[\[\]{}]/g, " ")
    .trim();
}

export function normalizeSingleContentLanguage(value, fallback = "English") {
  const fallbackLanguage = normalizeSingleContentLanguageLoose(fallback) || "English";
  const raw = String(value || "").trim();

  if (!raw) {
    return fallbackLanguage;
  }

  const hasMultipleLanguageSeparators = /[,;/|+&]|and|och/i.test(raw);

  if (!hasMultipleLanguageSeparators) {
    const direct = normalizeSingleContentLanguageLoose(raw);
    if (direct) {
      return direct;
    }
  }

  const parts = raw
    .split(/[,;/|+&]|and|och/gi)
    .map(cleanLanguageToken)
    .filter(Boolean);

  for (const part of parts) {
    const normalizedPart = normalizeSingleContentLanguageLoose(part);
    if (normalizedPart) {
      return normalizedPart;
    }
  }

  return fallbackLanguage;
}

function normalizeSingleContentLanguageLoose(value) {
  const cleaned = cleanLanguageToken(value);
  if (!cleaned) return "";

  const normalizedKey = cleaned.toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();

  if (LANGUAGE_ALIASES.has(normalizedKey)) {
    return LANGUAGE_ALIASES.get(normalizedKey);
  }

  for (const language of KNOWN_CONTENT_LANGUAGES) {
    if (language.toLowerCase() === normalizedKey) {
      return language;
    }
  }

  for (const [alias, language] of LANGUAGE_ALIASES.entries()) {
    const tokenPattern = new RegExp(`(^|\\b)${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(\\b|$)`, "i");
    if (tokenPattern.test(normalizedKey)) {
      return language;
    }
  }

  return "";
}

export function getKnownContentLanguages() {
  return [...KNOWN_CONTENT_LANGUAGES];
}
