// Spreelo's single canonical language catalogue.
// Keep app-language and content-language choices aligned by deriving both from this list.
export const SPREELO_LANGUAGE_CATALOG = [
  { locale: "en", language: "English", nativeName: "English" },
  { locale: "es", language: "Spanish", nativeName: "Español" },
  { locale: "pt", language: "Portuguese", nativeName: "Português" },
  { locale: "fr", language: "French", nativeName: "Français" },
  { locale: "de", language: "German", nativeName: "Deutsch" },
  { locale: "it", language: "Italian", nativeName: "Italiano" },
  { locale: "nl", language: "Dutch", nativeName: "Nederlands" },
  { locale: "sv", language: "Swedish", nativeName: "Svenska" },
  { locale: "da", language: "Danish", nativeName: "Dansk" },
  { locale: "no", language: "Norwegian", nativeName: "Norsk" },
  { locale: "fi", language: "Finnish", nativeName: "Suomi" },
  { locale: "pl", language: "Polish", nativeName: "Polski" },
  { locale: "tr", language: "Turkish", nativeName: "Türkçe" },
  { locale: "ar", language: "Arabic", nativeName: "العربية" },
  { locale: "hi", language: "Hindi", nativeName: "हिन्दी" },
  { locale: "id", language: "Indonesian", nativeName: "Bahasa Indonesia" },
  { locale: "ja", language: "Japanese", nativeName: "日本語" },
  { locale: "ko", language: "Korean", nativeName: "한국어" },
  { locale: "zh", language: "Chinese (Simplified)", nativeName: "简体中文" },
  { locale: "th", language: "Thai", nativeName: "ไทย" },
  { locale: "uk", language: "Ukrainian", nativeName: "Українська" },
  { locale: "ru", language: "Russian", nativeName: "Русский" },
  { locale: "bg", language: "Bulgarian", nativeName: "Български" },
  { locale: "vi", language: "Vietnamese", nativeName: "Tiếng Việt" },
  { locale: "cs", language: "Czech", nativeName: "Čeština" },
  { locale: "ro", language: "Romanian", nativeName: "Română" },
  { locale: "hu", language: "Hungarian", nativeName: "Magyar" },
  { locale: "el", language: "Greek", nativeName: "Ελληνικά" },
  { locale: "ms", language: "Malay", nativeName: "Bahasa Melayu" },
  { locale: "fil", language: "Filipino", nativeName: "Filipino" },
];

export const SUPPORTED_CONTENT_LANGUAGES = SPREELO_LANGUAGE_CATALOG.map(
  ({ locale, language, nativeName }) => ({ locale, language, nativeName })
);

export function getContentLanguageByLocale(locale, fallback = "English") {
  const normalized = String(locale || "").trim().toLowerCase().split("-")[0];
  return SPREELO_LANGUAGE_CATALOG.find((item) => item.locale === normalized)?.language || fallback;
}

export function getContentLanguageNativeName(language) {
  const normalized = String(language || "").trim().toLowerCase();
  return SPREELO_LANGUAGE_CATALOG.find((item) => item.language.toLowerCase() === normalized)?.nativeName || language || "English";
}
