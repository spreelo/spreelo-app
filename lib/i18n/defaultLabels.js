export const SUPPORTED_UI_LOCALES = [
  { locale: "en", language: "English" },
  { locale: "sv", language: "Swedish" },
  { locale: "fi", language: "Finnish" },
  { locale: "da", language: "Danish" },
  { locale: "no", language: "Norwegian" },
  { locale: "de", language: "German" },
  { locale: "fr", language: "French" },
  { locale: "es", language: "Spanish" },
  { locale: "it", language: "Italian" },
  { locale: "pt", language: "Portuguese" },
  { locale: "nl", language: "Dutch" },
  { locale: "pl", language: "Polish" },
  { locale: "uk", language: "Ukrainian" },
  { locale: "ru", language: "Russian" },
  { locale: "bg", language: "Bulgarian" },
  { locale: "ar", language: "Arabic" },
];

export const DEFAULT_UI_LOCALE = "en";

export const DEFAULT_UI_LABELS = {
  common: {
    "common.loading": "Loading...",
    "common.createPosts": "Create posts",
    "common.posts": "posts",
    "common.post": "Post {number}",
    "common.daysBefore": "{days} days before",
    "common.publishOnCampaignDate": "Publish on campaign date",
    "common.currentBrand": "Current brand",
    "common.noBrand": "No brand",
    "common.unnamedBrand": "Unnamed brand",
    "common.errorGeneric": "Something went wrong.",
  },

  layout: {
    "layout.nav.dashboard": "Dashboard",
    "layout.nav.content": "Content",
    "layout.nav.automation": "Content Creator",
    "layout.nav.calendar": "Calendar",
    "layout.nav.brand": "Brand profile",
    "layout.nav.socialChannels": "Social channels",
    "layout.nav.settings": "Settings",
    "layout.loadingWorkspace": "Loading your workspace...",
    "layout.loadingBrands": "Loading brands...",
    "layout.noBrandYet": "No brand yet",
    "layout.addNewBrand": "Add new brand",
    "layout.creating": "Creating...",
    "layout.createBrandPrompt": "What should this brand or business be called?",
    "layout.createBrandError": "Could not create brand.",
    "layout.planPro": "Plan: Pro",
    "layout.upgradeText": "Upgrade for more credits & features",
    "layout.logout": "Log out",
    "layout.openMenu": "Open menu",
    "layout.closeMenu": "Close menu",
  },

  calendar: {
    "calendar.loadingTitle": "Loading campaign calendar...",
    "calendar.loadingText": "Please wait while Spreelo loads your campaign opportunities.",
    "calendar.eyebrow": "Campaign calendar",
    "calendar.heroTitle": "Campaign opportunities for {brandName}",
    "calendar.heroText": "Spreelo suggests useful upcoming campaign moments based on your brand, market and content language. Choose one to create a focused content plan.",
    "calendar.heroCardLabel": "Upcoming AI campaign opportunities",
    "calendar.heroCardNote": "No posts are created until you choose a campaign.",
    "calendar.updateEyebrow": "Calendar update",
    "calendar.nextYearReady": "Your {year} campaign calendar is ready. You can plan next year’s posts while keeping the remaining campaigns for this year.",
    "calendar.nextYearLater": "Your {year} campaign calendar will be added automatically on December 1.",
    "calendar.noBrandProfile": "No brand profile found. Create a brand profile first.",
    "calendar.noUpcomingEyebrow": "No upcoming campaigns",
    "calendar.noUpcomingTitle": "Create a new campaign calendar",
    "calendar.noUpcomingText": "There are no upcoming campaign opportunities for this brand. Go to Brand Profile and generate or refresh the campaign calendar.",
    "calendar.generateCalendar": "Generate campaign calendar",
    "calendar.statUpcoming": "Upcoming opportunities",
    "calendar.statUpcomingText": "Upcoming campaigns for the current brand.",
    "calendar.statFixedDates": "Upcoming fixed dates",
    "calendar.statFixedDatesText": "Campaigns tied to a specific future date.",
    "calendar.statFlexible": "Upcoming flexible campaigns",
    "calendar.statFlexibleText": "Useful upcoming campaigns without a strict date.",
    "calendar.opportunitiesEyebrow": "Opportunities",
    "calendar.chooseCampaignTitle": "Choose a campaign to build from",
    "calendar.flexibleCampaign": "Flexible campaign",
    "calendar.flexibleCampaignWithYear": "Flexible campaign · {year}",
    "calendar.fromDate": "From {date}",
    "calendar.dateRange": "{startDate} – {endDate}",
    "calendar.highConfidence": "High confidence",
    "calendar.mediumConfidence": "Medium confidence",
    "calendar.lowConfidence": "Low confidence",
    "calendar.selectedCampaign": "Selected campaign",
    "calendar.relevance": "Relevance",
    "calendar.sales": "Sales",
    "calendar.engagement": "Engagement",
    "calendar.whyItFits": "Why it fits",
    "calendar.whyItFitsFallback": "This campaign can be useful for this brand.",
    "calendar.campaignInstruction": "Campaign instruction",
    "calendar.campaignInstructionFallback": "Create posts connected to this campaign opportunity.",
    "calendar.suggestedAngles": "Suggested angles",
    "calendar.recommendedPostPlan": "Recommended post plan",
    "calendar.recommendedPostPlanNote": "Spreelo recommends {count} posts for this campaign.",
    "calendar.postPurposeFallback": "Create a useful campaign post.",
    "calendar.disclaimer": "Campaign dates are suggested by AI and may vary by market, region or year. You can adjust the schedule before saving the final automation.",

    "calendar.fallback.awarenessRole": "Awareness post",
    "calendar.fallback.awarenessPurpose": "Introduce the campaign and explain why it matters to the audience.",
    "calendar.fallback.educationRole": "Education post",
    "calendar.fallback.educationPurpose": "Share useful information connected to the campaign topic.",
    "calendar.fallback.valueRole": "Value post",
    "calendar.fallback.valuePurpose": "Explain the value, benefit or reason to act before the campaign date.",
    "calendar.fallback.trustRole": "Trust post",
    "calendar.fallback.trustPurpose": "Build trust with an example, reassurance or helpful explanation.",
    "calendar.fallback.engagementRole": "Engagement post",
    "calendar.fallback.engagementPurpose": "Encourage the audience to react, comment or think about the campaign topic.",
    "calendar.fallback.reminderRole": "Reminder post",
    "calendar.fallback.reminderPurpose": "Remind the audience that the campaign date is getting closer.",
    "calendar.fallback.finalReminderRole": "Final campaign reminder",
    "calendar.fallback.finalReminderPurpose": "Create a final reminder connected to the campaign date.",
  },
};

export function normalizeUiLocale(value) {
  const rawLocale = String(value || "").trim().toLowerCase();

  if (!rawLocale) return DEFAULT_UI_LOCALE;

  const locale = rawLocale.replace("_", "-");
  const shortLocale = locale.split("-")[0];

  const exactMatch = SUPPORTED_UI_LOCALES.find(
    (item) => item.locale.toLowerCase() === locale
  );

  if (exactMatch) return exactMatch.locale;

  const shortMatch = SUPPORTED_UI_LOCALES.find(
    (item) => item.locale.toLowerCase() === shortLocale
  );

  return shortMatch ? shortMatch.locale : DEFAULT_UI_LOCALE;
}

export function getUiLanguageName(locale) {
  const normalizedLocale = normalizeUiLocale(locale);
  const match = SUPPORTED_UI_LOCALES.find(
    (item) => item.locale === normalizedLocale
  );

  return match?.language || "English";
}

export function getDefaultNamespaceLabels(namespace) {
  return DEFAULT_UI_LABELS[namespace] || {};
}

export function getDefaultLabelsForNamespaces(namespaces = []) {
  return namespaces.reduce((labels, namespace) => {
    return {
      ...labels,
      ...getDefaultNamespaceLabels(namespace),
    };
  }, {});
}

export function interpolateUiText(text, values = {}) {
  return String(text || "").replace(/\{(\w+)\}/g, (match, key) => {
    const value = values?.[key];

    if (value === null || value === undefined) {
      return match;
    }

    return String(value);
  });
}
