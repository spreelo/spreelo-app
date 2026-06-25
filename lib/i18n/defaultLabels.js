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


  login: {
    "login.eyebrow": "Login",
    "login.title": "Sign in to your workspace",
    "login.description": "Enter your email and Spreelo will send you a secure 6-digit sign-in code.",
    "login.codeSentPrefix": "Enter the 6-digit code we sent to",
    "login.emailAddress": "Email address",
    "login.emailPlaceholder": "you@example.com",
    "login.sendCode": "Send sign-in code",
    "login.sending": "Sending...",
    "login.signInCode": "Sign-in code",
    "login.signIn": "Sign in",
    "login.signingIn": "Signing in...",
    "login.sendNewCode": "Send a new code",
    "login.useAnotherEmail": "Use another email",
    "login.codeHelpTitle": "Didn’t receive the code?",
    "login.codeHelpText": "Check your spam or junk folder. The code can sometimes take up to a minute to arrive.",
    "login.errorEmailRequired": "Enter your email address first.",
    "login.errorSendCode": "Could not send sign-in code.",
    "login.codeSentMessage": "We sent a 6-digit sign-in code to your email.",
    "login.errorCodeRequired": "Enter the 6-digit code from your email.",
    "login.errorCodeRejected": "The code was not accepted.",
    "login.errorCheckWorkspace": "Could not check your workspace."
  },

  onboarding: {
    "onboarding.checkingWorkspace": "Preparing your workspace...",
    "onboarding.logout": "Log out",
    "onboarding.loggingOut": "Logging out...",
    "onboarding.step": "Step 1 of 3",
    "onboarding.title": "Set up your business",
    "onboarding.description": "Add your website or describe your business. Spreelo will prepare your brand profile, content ideas and campaign calendar automatically.",
    "onboarding.businessName": "Business name",
    "onboarding.businessNamePlaceholder": "Example: Luna Studio",
    "onboarding.websiteUrl": "Website URL",
    "onboarding.websiteUrlPlaceholder": "example.com",
    "onboarding.noWebsite": "I don’t have a website",
    "onboarding.contentMarket": "Content market",
    "onboarding.contentLanguage": "Content language",
    "onboarding.describeBusiness": "Describe your business",
    "onboarding.describeBusinessPlaceholder": "Tell Spreelo what your business does, who your customers are and what you offer.",
    "onboarding.continue": "Continue",
    "onboarding.settingUp": "Setting up...",
    "onboarding.loaderText": "Spreelo is still working. Larger websites and campaign calendars can take a little longer, so please keep this page open.",
    "onboarding.analysis.title": "Analyzing your brand",
    "onboarding.analysis.description": "This usually takes 1–3 minutes. Please keep this page open while Spreelo reads your website and prepares your campaign calendar.",
    "onboarding.analysis.readingWebsite.title": "Reading website content",
    "onboarding.analysis.readingWebsite.description": "Spreelo is fetching the website or reading your business description.",
    "onboarding.analysis.understandingBusiness.title": "Understanding your business",
    "onboarding.analysis.understandingBusiness.description": "Spreelo is identifying industry, audience, market and language.",
    "onboarding.analysis.checkingProducts.title": "Checking products and services",
    "onboarding.analysis.checkingProducts.description": "Spreelo is deciding if website products or services can be safely used.",
    "onboarding.analysis.buildingOpportunities.title": "Building campaign opportunities",
    "onboarding.analysis.buildingOpportunities.description": "Spreelo is preparing relevant seasonal and campaign ideas.",
    "onboarding.analysis.preparingStrategy.title": "Preparing content strategy",
    "onboarding.analysis.preparingStrategy.description": "Spreelo is shaping the brand profile and content direction.",
    "onboarding.ready": "Your brand profile is ready.",
    "onboarding.errorPrepareWorkspace": "Could not prepare your workspace.",
    "onboarding.errorLogout": "Could not log out.",
    "onboarding.errorBusinessName": "Add your business name first.",
    "onboarding.errorMarket": "Choose the market/country this brand targets.",
    "onboarding.errorLanguage": "Choose the content language for this brand.",
    "onboarding.errorWebsite": "Add your website URL, or select that you do not have a website.",
    "onboarding.errorDescription": "Describe your business first.",
    "onboarding.errorCreateBrand": "Could not create brand profile.",
    "onboarding.errorAnalyzeBrand": "Could not analyze brand.",
    "onboarding.errorGeneric": "Something went wrong.",

    "onboarding.step.creatingProfile": "Creating your brand profile...",
    "onboarding.step.fetchingWebsite": "Fetching your website content...",
    "onboarding.step.readingBusiness": "Reading your business information...",
    "onboarding.step.detectingMarket": "Detecting market and language...",
    "onboarding.step.preparingProfile": "Preparing your AI profile...",
    "onboarding.step.findingOpportunities": "Finding relevant content opportunities...",
    "onboarding.step.buildingCalendar": "Building your campaign calendar...",
    "onboarding.step.savingWorkspace": "Saving everything to your workspace...",
    "onboarding.step.stillWorking": "Still working — some websites take a little longer to analyze.",
    "onboarding.step.almostThere": "Almost there — Spreelo is preparing your brand setup.",
    "onboarding.step.largeWebsite": "This can take up to a minute for larger websites.",
    "onboarding.step.keepOpen": "Still processing — please keep this page open.",

    "onboarding.market.GLOBAL": "International / Global",
    "onboarding.market.US": "United States",
    "onboarding.market.GB": "United Kingdom",
    "onboarding.market.DE": "Germany",
    "onboarding.market.SE": "Sweden",
    "onboarding.market.DK": "Denmark",
    "onboarding.market.NO": "Norway",
    "onboarding.market.FI": "Finland",
    "onboarding.market.NL": "Netherlands",
    "onboarding.market.FR": "France",
    "onboarding.market.ES": "Spain",
    "onboarding.market.IT": "Italy",
    "onboarding.market.CA": "Canada",
    "onboarding.market.AU": "Australia",
    "onboarding.market.IN": "India",
    "onboarding.market.AE": "United Arab Emirates",
    "onboarding.market.OTHER": "Other",

    "onboarding.language.English": "English",
    "onboarding.language.Swedish": "Swedish",
    "onboarding.language.German": "German",
    "onboarding.language.Danish": "Danish",
    "onboarding.language.Norwegian": "Norwegian",
    "onboarding.language.Finnish": "Finnish",
    "onboarding.language.Dutch": "Dutch",
    "onboarding.language.French": "French",
    "onboarding.language.Spanish": "Spanish",
    "onboarding.language.Italian": "Italian",
    "onboarding.language.Arabic": "Arabic",
    "onboarding.language.Hindi": "Hindi",
    "onboarding.language.Other": "Other"
  },
};

export function normalizeUiLocale(value) {
  const rawLocale = String(value || "").trim().toLowerCase();

  if (!rawLocale) return DEFAULT_UI_LOCALE;

  const localeAliases = {
    se: "sv",
    dk: "da",
    no: "no",
    nb: "no",
    ua: "uk",
  };

  const locale = rawLocale.replace("_", "-");
  const aliasedLocale = localeAliases[locale] || locale;
  const shortLocale = (localeAliases[aliasedLocale.split("-")[0]] || aliasedLocale.split("-")[0]);

  const exactMatch = SUPPORTED_UI_LOCALES.find(
    (item) => item.locale.toLowerCase() === aliasedLocale
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
