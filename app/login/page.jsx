"use client";

import { useEffect, useRef, useState } from "react";
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

export default function LoginPage() {
  const { t, locale, setLocale } = useUiText(["login"]);

  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(EMPTY_OTP_DIGITS);
  const [codeSent, setCodeSent] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const otpInputRefs = useRef([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedEmail = localStorage.getItem(SAVED_LOGIN_EMAIL_KEY);

    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  useEffect(() => {
    if (!codeSent) return;

    const timeout = window.setTimeout(() => {
      otpInputRefs.current[0]?.focus();
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [codeSent]);

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

  async function redirectAfterLogin(loggedInUser) {
    if (!loggedInUser?.id) {
      window.location.href = buildLocalizedPath("/login");
      return;
    }

    const { data: existingBrands, error } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("user_id", loggedInUser.id)
      .limit(1);

    if (error) {
      setMessage(error.message || t("login.errorCheckWorkspace"));
      setMessageType("error");
      setVerifying(false);
      return;
    }

    if ((existingBrands || []).length > 0) {
      if (typeof window !== "undefined") {
        localStorage.setItem(
          getBrandStorageKey(loggedInUser.id),
          existingBrands[0].id
        );
      }

      window.location.href = "/";
      return;
    }

    window.location.href = buildLocalizedPath("/onboarding");
  }

  async function handleSendCode(event) {
    event?.preventDefault?.();

    if (loading || verifying) return;

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setMessage(t("login.errorEmailRequired"));
      setMessageType("error");
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("info");

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      setMessage(error.message || t("login.errorSendCode"));
      setMessageType("error");
      setLoading(false);
      return;
    }

    setEmail(normalizedEmail);

    if (typeof window !== "undefined") {
      localStorage.setItem(SAVED_LOGIN_EMAIL_KEY, normalizedEmail);
    }

    setCodeSent(true);
    resetOtpDigits();
    setMessage("");
    setMessageType("success");
    setLoading(false);
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

    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: "email",
    });

    if (error) {
      setMessage(error.message || t("login.errorCodeRejected"));
      setMessageType("error");
      setVerifying(false);
      return;
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(SAVED_LOGIN_EMAIL_KEY, normalizedEmail);
    }

    await redirectAfterLogin(data?.user);
  }

  function handleChangeEmail() {
    if (loading || verifying) return;

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

            <h1>{t("login.marketingTitle")}</h1>
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

          <div className="login-refresh-illustration" aria-hidden="true">
            <div className="login-refresh-hill hill-one" />
            <div className="login-refresh-hill hill-two" />
            <div className="login-refresh-plant">
              <i className="leaf leaf-one" />
              <i className="leaf leaf-two" />
              <i className="leaf leaf-three" />
              <b />
            </div>
            <div className="login-refresh-monitor">
              <span className="monitor-side" />
              <span className="monitor-line line-one" />
              <span className="monitor-line line-two" />
              <span className="monitor-chart" />
            </div>
            <div className="login-refresh-mug" />
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

          <div className="login-refresh-progress" aria-label={t("login.progressAriaLabel")}>
            <div className={`login-refresh-progress-step ${!codeSent ? "is-active" : "is-complete"}`}>
              <span>{codeSent ? <CheckCircle2 size={17} /> : "1"}</span>
            </div>
            <i />
            <div className={`login-refresh-progress-step ${codeSent ? "is-active" : ""}`}>
              <span>2</span>
            </div>
            <p>{codeSent ? t("login.stepTwoOfTwo") : t("login.stepOneOfTwo")}</p>
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
          </div>

          <div className="login-refresh-heading">
            <p className="login-refresh-eyebrow">
              {codeSent ? t("login.confirmCodeEyebrow") : t("login.eyebrow")}
            </p>
            <h2 id="login-title">{t("login.title")}</h2>

            {!codeSent ? (
              <p>{t("login.description")}</p>
            ) : (
              <p className="login-refresh-sent-to">
                {t("login.codeSentPrefix")} <strong>{email}</strong>.
              </p>
            )}
          </div>

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
                disabled={loading || verifying}
              >
                <span>{loading ? t("login.sending") : t("login.sendCode")}</span>
                <ArrowRight size={20} aria-hidden="true" />
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
                <ArrowRight size={20} aria-hidden="true" />
              </button>

              <button
                className="login-refresh-secondary"
                type="button"
                onClick={handleSendCode}
                disabled={loading || verifying}
              >
                <RefreshCw size={19} aria-hidden="true" />
                {loading ? t("login.sending") : t("login.sendNewCode")}
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
