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

  const hasMultipleLanguageSeparators = /[,;/|+&]|\band\b|\boch\b/i.test(raw);

  if (!hasMultipleLanguageSeparators) {
    const direct = normalizeSingleContentLanguageLoose(raw);
    if (direct) {
      return direct;
    }
  }

  const parts = raw
    .split(/[,;/|+&]|\band\b|\boch\b/gi)
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


const LANGUAGE_BY_LOCALE_TOKEN = new Map([
  ["se", "Swedish"],
  ["sv", "Swedish"],
  ["sv-se", "Swedish"],
  ["dk", "Danish"],
  ["da", "Danish"],
  ["da-dk", "Danish"],
  ["no", "Norwegian"],
  ["nb", "Norwegian"],
  ["nn", "Norwegian"],
  ["nb-no", "Norwegian"],
  ["fi", "Finnish"],
  ["fi-fi", "Finnish"],
  ["de", "German"],
  ["de-de", "German"],
  ["at", "German"],
  ["ch", "German"],
  ["nl", "Dutch"],
  ["nl-nl", "Dutch"],
  ["be", "Dutch"],
  ["fr", "French"],
  ["fr-fr", "French"],
  ["es", "Spanish"],
  ["es-es", "Spanish"],
  ["it", "Italian"],
  ["it-it", "Italian"],
  ["pt", "Portuguese"],
  ["pt-pt", "Portuguese"],
  ["br", "Portuguese"],
  ["pl", "Polish"],
  ["pl-pl", "Polish"],
  ["en", "English"],
  ["en-us", "English"],
  ["en-gb", "English"],
  ["gb", "English"],
  ["uk", "English"],
  ["us", "English"],
]);

const LANGUAGE_BY_TLD = new Map([
  ["se", "Swedish"],
  ["dk", "Danish"],
  ["no", "Norwegian"],
  ["fi", "Finnish"],
  ["de", "German"],
  ["at", "German"],
  ["ch", "German"],
  ["nl", "Dutch"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["pl", "Polish"],
  ["uk", "English"],
]);

export function inferContentLanguageFromUrl(websiteUrl) {
  try {
    const parsedUrl = new URL(String(websiteUrl || "").trim());
    const hostParts = parsedUrl.hostname.toLowerCase().split(".").filter(Boolean);
    const pathParts = parsedUrl.pathname
      .toLowerCase()
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    const localeTokens = [
      ...pathParts.slice(0, 2),
      hostParts[0],
    ];

    for (const token of localeTokens) {
      const cleanedToken = token.replace(/^intl[-_]/, "").replace(/_/g, "-");
      if (LANGUAGE_BY_LOCALE_TOKEN.has(cleanedToken)) {
        return LANGUAGE_BY_LOCALE_TOKEN.get(cleanedToken);
      }
    }

    const tld = hostParts.at(-1);
    if (LANGUAGE_BY_TLD.has(tld)) {
      return LANGUAGE_BY_TLD.get(tld);
    }
  } catch (_) {
    return "";
  }

  return "";
}

export function inferContentLanguageFromHtmlSignals(html) {
  const source = String(html || "");
  const htmlLangMatch = source.match(/<html[^>]+lang=["']?([a-z]{2}(?:[-_][a-z]{2})?)/i);
  const ogLocaleMatch = source.match(/<meta[^>]+property=["']og:locale["'][^>]+content=["']([^"']+)["']/i) ||
    source.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:locale["']/i);

  const candidates = [htmlLangMatch?.[1], ogLocaleMatch?.[1]]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/_/g, "-"));

  for (const candidate of candidates) {
    if (LANGUAGE_BY_LOCALE_TOKEN.has(candidate)) {
      return LANGUAGE_BY_LOCALE_TOKEN.get(candidate);
    }
    const base = candidate.split("-")[0];
    if (LANGUAGE_BY_LOCALE_TOKEN.has(base)) {
      return LANGUAGE_BY_LOCALE_TOKEN.get(base);
    }
  }

  return "";
}

export function inferContentLanguageFromWebsiteSignals(websiteUrl, html = "") {
  return inferContentLanguageFromUrl(websiteUrl) || inferContentLanguageFromHtmlSignals(html);
}

const MARKET_BY_LOCALE_TOKEN = new Map([
  ["se", { contentMarket: "Sweden", countryCode: "SE", contentLanguage: "Swedish" }],
  ["sv", { contentMarket: "Sweden", countryCode: "SE", contentLanguage: "Swedish" }],
  ["sv-se", { contentMarket: "Sweden", countryCode: "SE", contentLanguage: "Swedish" }],
  ["dk", { contentMarket: "Denmark", countryCode: "DK", contentLanguage: "Danish" }],
  ["da", { contentMarket: "Denmark", countryCode: "DK", contentLanguage: "Danish" }],
  ["da-dk", { contentMarket: "Denmark", countryCode: "DK", contentLanguage: "Danish" }],
  ["no", { contentMarket: "Norway", countryCode: "NO", contentLanguage: "Norwegian" }],
  ["nb", { contentMarket: "Norway", countryCode: "NO", contentLanguage: "Norwegian" }],
  ["nb-no", { contentMarket: "Norway", countryCode: "NO", contentLanguage: "Norwegian" }],
  ["fi", { contentMarket: "Finland", countryCode: "FI", contentLanguage: "Finnish" }],
  ["fi-fi", { contentMarket: "Finland", countryCode: "FI", contentLanguage: "Finnish" }],
  ["de", { contentMarket: "Germany", countryCode: "DE", contentLanguage: "German" }],
  ["de-de", { contentMarket: "Germany", countryCode: "DE", contentLanguage: "German" }],
  ["at", { contentMarket: "Austria", countryCode: "AT", contentLanguage: "German" }],
  ["ch", { contentMarket: "Switzerland", countryCode: "CH", contentLanguage: "German" }],
  ["nl", { contentMarket: "Netherlands", countryCode: "NL", contentLanguage: "Dutch" }],
  ["nl-nl", { contentMarket: "Netherlands", countryCode: "NL", contentLanguage: "Dutch" }],
  ["be", { contentMarket: "Belgium", countryCode: "BE", contentLanguage: "Dutch" }],
  ["fr", { contentMarket: "France", countryCode: "FR", contentLanguage: "French" }],
  ["fr-fr", { contentMarket: "France", countryCode: "FR", contentLanguage: "French" }],
  ["es", { contentMarket: "Spain", countryCode: "ES", contentLanguage: "Spanish" }],
  ["es-es", { contentMarket: "Spain", countryCode: "ES", contentLanguage: "Spanish" }],
  ["it", { contentMarket: "Italy", countryCode: "IT", contentLanguage: "Italian" }],
  ["it-it", { contentMarket: "Italy", countryCode: "IT", contentLanguage: "Italian" }],
  ["pt", { contentMarket: "Portugal", countryCode: "PT", contentLanguage: "Portuguese" }],
  ["pt-pt", { contentMarket: "Portugal", countryCode: "PT", contentLanguage: "Portuguese" }],
  ["br", { contentMarket: "Brazil", countryCode: "BR", contentLanguage: "Portuguese" }],
  ["pl", { contentMarket: "Poland", countryCode: "PL", contentLanguage: "Polish" }],
]);

const MARKET_BY_TLD = new Map([
  ["se", { contentMarket: "Sweden", countryCode: "SE", contentLanguage: "Swedish" }],
  ["dk", { contentMarket: "Denmark", countryCode: "DK", contentLanguage: "Danish" }],
  ["no", { contentMarket: "Norway", countryCode: "NO", contentLanguage: "Norwegian" }],
  ["fi", { contentMarket: "Finland", countryCode: "FI", contentLanguage: "Finnish" }],
  ["de", { contentMarket: "Germany", countryCode: "DE", contentLanguage: "German" }],
  ["at", { contentMarket: "Austria", countryCode: "AT", contentLanguage: "German" }],
  ["ch", { contentMarket: "Switzerland", countryCode: "CH", contentLanguage: "German" }],
  ["nl", { contentMarket: "Netherlands", countryCode: "NL", contentLanguage: "Dutch" }],
  ["fr", { contentMarket: "France", countryCode: "FR", contentLanguage: "French" }],
  ["es", { contentMarket: "Spain", countryCode: "ES", contentLanguage: "Spanish" }],
  ["it", { contentMarket: "Italy", countryCode: "IT", contentLanguage: "Italian" }],
  ["pt", { contentMarket: "Portugal", countryCode: "PT", contentLanguage: "Portuguese" }],
  ["pl", { contentMarket: "Poland", countryCode: "PL", contentLanguage: "Polish" }],
]);

function cloneMarketSignal(signal) {
  return signal ? { ...signal } : null;
}

function marketSignalFromLocaleToken(token) {
  const cleanedToken = String(token || "")
    .toLowerCase()
    .replace(/^intl[-_]/, "")
    .replace(/_/g, "-")
    .trim();

  return cloneMarketSignal(MARKET_BY_LOCALE_TOKEN.get(cleanedToken));
}

export function inferMarketSetupFromWebsiteSignals(websiteUrl, html = "") {
  try {
    const parsedUrl = new URL(String(websiteUrl || "").trim());
    const hostParts = parsedUrl.hostname.toLowerCase().split(".").filter(Boolean);
    const pathParts = parsedUrl.pathname
      .toLowerCase()
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    for (const token of [...pathParts.slice(0, 2), hostParts[0]]) {
      const signal = marketSignalFromLocaleToken(token);
      if (signal) {
        return signal;
      }
    }

    const tldSignal = cloneMarketSignal(MARKET_BY_TLD.get(hostParts.at(-1)));
    if (tldSignal) {
      return tldSignal;
    }
  } catch (_) {
    // Continue to HTML locale signals below.
  }

  const source = String(html || "");
  const htmlLangMatch = source.match(/<html[^>]+lang=["']?([a-z]{2}(?:[-_][a-z]{2})?)/i);
  const ogLocaleMatch =
    source.match(/<meta[^>]+property=["']og:locale["'][^>]+content=["']([^"']+)["']/i) ||
    source.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:locale["']/i);

  const candidates = [htmlLangMatch?.[1], ogLocaleMatch?.[1]]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/_/g, "-"));

  for (const candidate of candidates) {
    const exactSignal = marketSignalFromLocaleToken(candidate);
    if (exactSignal) {
      return exactSignal;
    }

    const baseSignal = marketSignalFromLocaleToken(candidate.split("-")[0]);
    if (baseSignal) {
      return baseSignal;
    }
  }

  return null;
}


export function getKnownContentLanguages() {
  return [...KNOWN_CONTENT_LANGUAGES];
}
