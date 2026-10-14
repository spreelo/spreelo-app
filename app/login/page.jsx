"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isLoginCodeRateLimitError, loginCodeRequestError, remainingLoginCodeCooldown, saveLoginCodeCooldown } from "../../lib/loginCodeCooldown";
import { confirmCodeLoginSession, sessionFailureDetails } from "../../lib/browserSession";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe2,
  LockKeyhole,
  Mail,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";
import { SUPPORTED_UI_LOCALES } from "../../lib/i18n/defaultLabels";
import LanguageSuggestionBanner from "../../components/LanguageSuggestionBanner";

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

const SAVED_LOGIN_EMAIL_KEY = "spreelo_last_login_email";
const EMPTY_OTP_DIGITS = ["", "", "", "", "", ""];
const LOGIN_REQUEST_TIMEOUT_MS = 25000;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

async function withTimeout(promise, timeoutMs = LOGIN_REQUEST_TIMEOUT_MS) {
  let timeoutId;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error("LOGIN_REQUEST_TIMEOUT");
          error.code = "LOGIN_REQUEST_TIMEOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRateLimitError(error) {
  return isLoginCodeRateLimitError(error);
}

function renderMarketingTitle(value) {
  const title = String(value || "").trim();
  const separatorIndex = title.indexOf("—");

  if (separatorIndex === -1) {
    return title;
  }

  return (
    <>
      {title.slice(0, separatorIndex).trim()}
      <span>{` — ${title.slice(separatorIndex + 1).trim()}`}</span>
    </>
  );
}

export default function LoginPage() {
  const { t, locale, setLocale } = useUiText(["login", "layout"]);
  const router = useRouter();
  const acceptedCodeRef = useRef(null);

  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(EMPTY_OTP_DIGITS);
  const [codeSent, setCodeSent] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpInputRefs = useRef([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let savedEmail = "";
    try { savedEmail = localStorage.getItem(SAVED_LOGIN_EMAIL_KEY); } catch { /* Optional preference. */ }

    if (savedEmail) {
      setEmail(savedEmail);
      const remaining = remainingLoginCodeCooldown(window.sessionStorage, savedEmail);
      if (remaining > 0) {
        setCodeSent(true);
        setResendCooldown(remaining);
      }
    }
  }, []);

  useEffect(() => {
    if (!codeSent) return;

    const timeout = window.setTimeout(() => {
      otpInputRefs.current[0]?.focus();
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [codeSent]);


  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timeout = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [resendCooldown]);

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeOtp(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 6);
  }

  function resetOtpDigits() {
    setOtpDigits([...EMPTY_OTP_DIGITS]);
  }

  function buildLocalizedPath(path) {
    if (!locale || locale === "en") return path;

    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}lang=${encodeURIComponent(locale)}`;
  }

  function getSafeNextPath() {
    if (typeof window === "undefined") return "";
    const value = String(
      new URLSearchParams(window.location.search).get("next") || ""
    ).trim();
    return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "";
  }

  function requestWelcomeEmail(accessToken) {
    if (!accessToken) return;
    fetch("/api/account/welcome-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ locale: locale || "en" }),
      keepalive: true,
    }).catch((error) => {
      console.error("Could not request the welcome email:", error);
    });
  }

  async function redirectAfterLogin(loggedInUser) {
    if (!loggedInUser?.id) {
      throw new Error(t("login.errorCheckWorkspace"));
    }

    let existingBrands = [];

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("brand_profiles")
          .select("id")
          .eq("user_id", loggedInUser.id)
          .limit(1)
      );

      if (error) {
        throw error;
      }

      existingBrands = data || [];
    } catch (error) {
      console.error("Could not check workspace after login:", error);
      router.replace("/");
      return;
    }

    if ((existingBrands || []).length > 0) {
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(getBrandStorageKey(loggedInUser.id), existingBrands[0].id);
        } catch { /* The workspace can load its default brand without this preference. */ }
      }

      router.replace(getSafeNextPath() || "/");
      return;
    }

    router.replace(buildLocalizedPath("/onboarding"));
  }

  async function handleSendCode(event) {
    event?.preventDefault?.();

    if (loading || verifying) return;

    if (resendCooldown > 0) {
      setMessage(
        t("login.sendNewCodeIn", { seconds: resendCooldown })
      );
      setMessageType("info");
      return;
    }

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setMessage(t("login.errorEmailRequired"));
      setMessageType("error");
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("info");

    try {
      const safeNextPath = getSafeNextPath();
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/login?lang=${encodeURIComponent(
              locale || "en"
            )}${safeNextPath ? `&next=${encodeURIComponent(safeNextPath)}` : ""}`
          : undefined;

      const response = await withTimeout(
        fetch("/api/auth/send-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: normalizedEmail,
            locale: locale || "en",
            emailRedirectTo,
          }),
        }).then(async (result) => {
          const payload = await result.json().catch(() => ({}));
          if (!result.ok || !payload?.ok) {
            throw loginCodeRequestError(result, payload, t("common.errorGeneric"));
          }
          return payload;
        })
      );

      setEmail(normalizedEmail);

      if (typeof window !== "undefined") {
        try { localStorage.setItem(SAVED_LOGIN_EMAIL_KEY, normalizedEmail); } catch { /* Optional preference. */ }
      }

      acceptedCodeRef.current = null;
      setCodeSent(true);
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      saveLoginCodeCooldown(window.sessionStorage, normalizedEmail, OTP_RESEND_COOLDOWN_SECONDS);
      resetOtpDigits();
      setMessage(t("login.codeSentMessage"));
      setMessageType("success");
    } catch (error) {
      if (
        isRateLimitError(error) ||
        error?.code === "LOGIN_REQUEST_TIMEOUT"
      ) {
        setEmail(normalizedEmail);

        if (typeof window !== "undefined") {
          try { localStorage.setItem(SAVED_LOGIN_EMAIL_KEY, normalizedEmail); } catch { /* Optional preference. */ }
        }

        setCodeSent(true);
        const waitSeconds = isRateLimitError(error) ? error.retryAfterSeconds || OTP_RESEND_COOLDOWN_SECONDS : OTP_RESEND_COOLDOWN_SECONDS;
        setResendCooldown(waitSeconds);
        saveLoginCodeCooldown(window.sessionStorage, normalizedEmail, waitSeconds);
        // A rejected request did not issue a new code. Keep an already-entered
        // code and its successful verification available for continuation.
        setMessage(
          isRateLimitError(error)
            ? t("login.errorTooManyCodes")
            : t("login.errorRequestTimeout")
        );
        setMessageType("info");
      } else {
        setMessage(error?.message || t("login.errorSendCode"));
        setMessageType("error");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();

    if (loading || verifying) return;

    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = normalizeOtp(otpDigits.join(""));

    if (!normalizedEmail) {
      setMessage(t("login.errorEmailRequired"));
      setMessageType("error");
      return;
    }

    if (normalizedCode.length !== 6) {
      setMessage(t("login.errorCodeRequired"));
      setMessageType("error");
      return;
    }

    setVerifying(true);
    setMessage("");
    setMessageType("info");

    try {
      // A successfully consumed code is not submitted again when a later
      // session/workspace check needs a retry.
      let data = acceptedCodeRef.current?.email === normalizedEmail ? acceptedCodeRef.current.data : null;
      if (!data) {
        const response = await withTimeout(supabase.auth.verifyOtp({email:normalizedEmail,token:normalizedCode,type:"email"}));
        if (response.error) throw response.error;
        data = response.data;
        if (!data?.session?.access_token || !data?.user?.id) throw new Error(t("login.errorCheckWorkspace"));
        acceptedCodeRef.current = {email:normalizedEmail,data};
      }
      const checked = await confirmCodeLoginSession(supabase, data.user.id);
      if (checked.status !== "authenticated") {
        console.warn("Code accepted but session confirmation did not complete", sessionFailureDetails(checked.error, checked.stage));
        if (checked.status === "signed_out") acceptedCodeRef.current = null;
        setMessage(checked.status === "unavailable" ? t("layout.sessionTemporaryError") : t("login.errorCheckWorkspace"));
        setMessageType("error");
        return;
      }
      if (typeof window !== "undefined") {
        try { localStorage.setItem(SAVED_LOGIN_EMAIL_KEY, normalizedEmail); } catch { /* Optional preference; never discard a verified session. */ }
      }
      requestWelcomeEmail(checked.session.access_token);
      await redirectAfterLogin(checked.user);
    } catch (error) {
      if (error?.code === "LOGIN_REQUEST_TIMEOUT") {
        setMessage(t("login.errorRequestTimeout"));
      } else {
        setMessage(error?.message || t("login.errorCodeRejected"));
      }

      setMessageType("error");
    } finally {
      setVerifying(false);
    }
  }

  function handleChangeEmail() {
    if (loading || verifying) return;

    acceptedCodeRef.current = null;
    setCodeSent(false);
    resetOtpDigits();
    setMessage("");
    setMessageType("info");
  }

  function handleOtpChange(index, value) {
    const digit = normalizeOtp(value).slice(-1);
    const nextDigits = [...otpDigits];
    nextDigits[index] = digit;
    setOtpDigits(nextDigits);
    setMessage("");
    setMessageType("info");

    if (digit && index < otpInputRefs.current.length - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index, event) {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      const nextDigits = [...otpDigits];
      nextDigits[index - 1] = "";
      setOtpDigits(nextDigits);
      otpInputRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowRight" && index < otpInputRefs.current.length - 1) {
      event.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpPaste(event) {
    const pastedCode = normalizeOtp(event.clipboardData?.getData("text"));

    if (!pastedCode) return;

    event.preventDefault();
    const nextDigits = [...EMPTY_OTP_DIGITS];

    pastedCode.split("").forEach((digit, index) => {
      nextDigits[index] = digit;
    });

    setOtpDigits(nextDigits);
    setMessage("");
    setMessageType("info");

    const focusIndex = Math.min(pastedCode.length, 6) - 1;
    otpInputRefs.current[Math.max(0, focusIndex)]?.focus();
  }

  const currentLocaleIsSupported = SUPPORTED_UI_LOCALES.some(
    (item) => item.locale === locale
  );

  return (
    <main className={`login-page login-refresh-page ${codeSent ? "is-code-step" : "is-email-step"}`}>
      <LanguageSuggestionBanner />

      <section className="login-refresh-shell">
        <aside className="login-refresh-story" aria-label={t("login.marketingAriaLabel")}>
          <div className="login-refresh-story-top">
            <img
              src="/brand/spreelologo.png"
              alt="Spreelo"
              className="login-refresh-logo"
            />

            <span className="login-refresh-story-pill">
              {t("login.welcomeBack")}
            </span>

            <h1>{renderMarketingTitle(t("login.marketingTitle"))}</h1>
            <p>{t("login.marketingText")}</p>
          </div>

          <div className="login-refresh-feature-list">
            <article className="login-refresh-feature">
              <span><Pencil size={22} strokeWidth={2.2} /></span>
              <div>
                <strong>{t("login.featureCreateTitle")}</strong>
                <p>{t("login.featureCreateText")}</p>
              </div>
            </article>

            <article className="login-refresh-feature">
              <span><CalendarDays size={22} strokeWidth={2.2} /></span>
              <div>
                <strong>{t("login.featurePlanTitle")}</strong>
                <p>{t("login.featurePlanText")}</p>
              </div>
            </article>

            <article className="login-refresh-feature">
              <span><Send size={22} strokeWidth={2.2} /></span>
              <div>
                <strong>{t("login.featurePublishTitle")}</strong>
                <p>{t("login.featurePublishText")}</p>
              </div>
            </article>
          </div>

          <div className={`login-refresh-saas-preview${codeSent ? " is-code-illustration" : ""}`} aria-hidden="true">
            <header>
              <div><strong>SPREELO AI</strong><i /></div>
              <b>{t("login.aiAssistantBadge")}</b>
            </header>
            <div className="login-refresh-saas-metrics">
              <span><i /><i /><i /></span>
              <span><i /><i /></span>
            </div>
            <div className="login-refresh-saas-content">
              <article><span /><div><i /><i /></div><b /></article>
              <article><span /><div><i /><i /></div><b /></article>
              <article><span /><div><i /><i /></div><b /></article>
            </div>
            <footer><span /><span /><span /></footer>
          </div>
        </aside>

        <section className="login-refresh-auth" aria-labelledby="login-title">
          <div className="login-refresh-mobile-brand">
            <img
              src="/brand/spreelologo.png"
              alt="Spreelo"
              className="login-refresh-logo"
            />

            <div className="login-refresh-language compact">
              <Globe2 size={18} aria-hidden="true" />
              <select
                aria-label={t("login.appLanguage")}
                value={currentLocaleIsSupported ? locale : ""}
                onChange={(event) => {
                  if (event.target.value) {
                    setLocale(event.target.value);
                  }
                }}
              >
                {!currentLocaleIsSupported && <option value="">{locale}</option>}
                {SUPPORTED_UI_LOCALES.map((item) => (
                  <option key={item.locale} value={item.locale}>
                    {item.nativeName || item.language}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="login-refresh-language desktop-tablet">
            <label htmlFor="login-language-select">
              <Globe2 size={18} aria-hidden="true" />
              {t("login.appLanguage")}
            </label>
            <select
              id="login-language-select"
              value={currentLocaleIsSupported ? locale : ""}
              onChange={(event) => {
                if (event.target.value) {
                  setLocale(event.target.value);
                }
              }}
            >
              {!currentLocaleIsSupported && <option value="">{locale}</option>}
              {SUPPORTED_UI_LOCALES.map((item) => (
                <option key={item.locale} value={item.locale}>
                  {item.nativeName || item.language}
                </option>
              ))}
            </select>
          </div>

          <div className="login-refresh-mobile-hero" aria-hidden="true">
            <span className="login-refresh-mobile-pill">{t("login.welcomeBack")}</span>
            <div className="login-refresh-mobile-scene">
              <div className="login-refresh-mobile-hill" />
              <div className="login-refresh-mobile-mug" />
              <div className="login-refresh-mobile-plant"><i /><i /><b /></div>
            </div>
            <div className="login-refresh-mobile-ai-label">
              <strong>SPREELO AI</strong>
              <b>{t("login.aiAssistantBadge")}</b>
            </div>
          </div>

          <div className="login-refresh-heading">
            <p className="login-refresh-eyebrow">
              {codeSent ? t("login.confirmCodeEyebrow") : t("login.eyebrow")}
            </p>
            <h2 id="login-title">
              {codeSent ? t("login.codeTitle") : t("login.title")}
            </h2>

            {!codeSent ? (
              <p>{t("login.description")}</p>
            ) : (
              <p className="login-refresh-sent-to">
                {t("login.codeSentPrefix")} <strong>{email}</strong>
              </p>
            )}
          </div>

          <div className="login-refresh-form-panel">
          {codeSent && (
              <div className="login-refresh-delivery-status">
                <CheckCircle2 size={22} aria-hidden="true" />
                <div>
                  <strong>{t("login.deliveryStatusTitle")}</strong>
                  <p>{t("login.deliveryStatusText")}</p>
                </div>
              </div>
            )}

            {!codeSent ? (
              <form onSubmit={handleSendCode} className="login-refresh-form">
                <label htmlFor="login-email">{t("login.emailAddress")}</label>
                <div className="login-refresh-input-wrap">
                  <Mail size={19} aria-hidden="true" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder={t("login.emailPlaceholder")}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setMessage("");
                      setMessageType("info");
                    }}
                    required
                    disabled={loading || verifying}
                  />
                </div>

                <button
                  className="login-refresh-primary"
                  type="submit"
                  disabled={loading || verifying || resendCooldown > 0}
                >
                  <span>
                    {loading
                      ? t("login.sending")
                      : resendCooldown > 0
                        ? t("login.sendNewCodeIn", { seconds: resendCooldown })
                        : t("login.sendCode")}
                  </span>
                  {loading ? <RefreshCw className="login-action-spinner" size={20} aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="login-refresh-form">
                <label>{t("login.signInCode")}</label>

                <div className="login-refresh-otp" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(element) => {
                        otpInputRefs.current[index] = element;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      aria-label={`${t("login.signInCode")} ${index + 1}`}
                      maxLength={1}
                      value={digit}
                      onChange={(event) => handleOtpChange(index, event.target.value)}
                      onKeyDown={(event) => handleOtpKeyDown(index, event)}
                      disabled={loading || verifying}
                    />
                  ))}
                </div>

                <button
                  className="login-refresh-primary"
                  type="submit"
                  disabled={loading || verifying}
                >
                  <span>{verifying ? t("login.signingIn") : t("login.signIn")}</span>
                  {verifying ? <RefreshCw className="login-action-spinner" size={20} aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />}
                </button>

                <button
                  className="login-refresh-secondary"
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading || verifying || resendCooldown > 0}
                >
                  <RefreshCw className={loading ? "login-action-spinner" : ""} size={19} aria-hidden="true" />
                  {loading
                    ? t("login.sending")
                    : resendCooldown > 0
                      ? t("login.sendNewCodeIn", { seconds: resendCooldown })
                      : t("login.sendNewCode")}
                </button>

                <div className="login-refresh-or"><span>{t("login.or")}</span></div>

                <button
                  className="login-refresh-text-button"
                  type="button"
                  onClick={handleChangeEmail}
                  disabled={loading || verifying}
                >
                  {t("login.useAnotherEmail")}
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              </form>
            )}

            {message && (
              <div className={`login-refresh-message is-${messageType}`} role="status">
                {messageType === "success" ? (
                  <CheckCircle2 size={20} aria-hidden="true" />
                ) : messageType === "error" ? (
                  <LockKeyhole size={20} aria-hidden="true" />
                ) : (
                  <Mail size={20} aria-hidden="true" />
                )}
                <p>{message}</p>
              </div>
            )}

            <div className="login-refresh-trust-grid">
              <article className="login-refresh-trust-card secure">
                <span><ShieldCheck size={23} aria-hidden="true" /></span>
                <div>
                  <strong>{t("login.secureTitle")}</strong>
                  <p>{t("login.secureText")}</p>
                </div>
              </article>

              {codeSent ? (
                <article className="login-refresh-trust-card help">
                  <span><Mail size={23} aria-hidden="true" /></span>
                  <div>
                    <strong>{t("login.codeHelpTitle")}</strong>
                    <p>{t("login.codeHelpText")}</p>
                  </div>
                </article>
              ) : (
                <article className="login-refresh-trust-card quick">
                  <span><Clock3 size={23} aria-hidden="true" /></span>
                  <div>
                    <strong>{t("login.quickTitle")}</strong>
                    <p>{t("login.quickText")}</p>
                  </div>
                </article>
              )}
            </div>

          </div>

          <div className="login-refresh-tablet-benefits" aria-hidden="true">
            <span><Pencil size={18} /> {t("login.featureCreateTitle")}</span>
            <span><CalendarDays size={18} /> {t("login.featurePlanTitle")}</span>
            <span><Send size={18} /> {t("login.featurePublishTitle")}</span>
          </div>

        </section>
      </section>
    </main>
  );
}
