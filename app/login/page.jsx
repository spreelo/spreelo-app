"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

const SAVED_LOGIN_EMAIL_KEY = "spreelo_last_login_email";

export default function LoginPage() {
  const { t, locale } = useUiText(["login"]);

  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedEmail = localStorage.getItem(SAVED_LOGIN_EMAIL_KEY);

    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeOtp(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 6);
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
    event.preventDefault();

    if (loading || verifying) return;

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setMessage(t("login.errorEmailRequired"));
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      setMessage(error.message || t("login.errorSendCode"));
      setLoading(false);
      return;
    }

    setEmail(normalizedEmail);

    if (typeof window !== "undefined") {
      localStorage.setItem(SAVED_LOGIN_EMAIL_KEY, normalizedEmail);
    }

    setCodeSent(true);
    setOtpCode("");
    setMessage(t("login.codeSentMessage"));
    setLoading(false);
  }

  async function handleVerifyCode(event) {
    event.preventDefault();

    if (loading || verifying) return;

    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = normalizeOtp(otpCode);

    if (!normalizedEmail) {
      setMessage(t("login.errorEmailRequired"));
      return;
    }

    if (normalizedCode.length !== 6) {
      setMessage(t("login.errorCodeRequired"));
      return;
    }

    setVerifying(true);
    setMessage("");

    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: "email",
    });

    if (error) {
      setMessage(error.message || t("login.errorCodeRejected"));
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
    setOtpCode("");
    setMessage("");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand">
          <img
            src="/brand/spreelologo.png"
            alt="Spreelo"
            className="spreelo-logo-image"
          />
        </div>

        <div className="login-content">
          <p className="eyebrow">{t("login.eyebrow")}</p>
          <h2>{t("login.title")}</h2>

          {!codeSent ? (
            <p>{t("login.description")}</p>
          ) : (
            <p>
              {t("login.codeSentPrefix")} <strong>{email}</strong>.
            </p>
          )}
        </div>

        {!codeSent ? (
          <form onSubmit={handleSendCode} className="login-form">
            <label>{t("login.emailAddress")}</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder={t("login.emailPlaceholder")}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setMessage("");
              }}
              required
              disabled={loading || verifying}
            />

            <button
              className="primary-button full"
              type="submit"
              disabled={loading || verifying}
            >
              {loading ? t("login.sending") : t("login.sendCode")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="login-form">
            <label>{t("login.signInCode")}</label>
            <input
              className="input otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={otpCode}
              onChange={(event) => {
                setOtpCode(normalizeOtp(event.target.value));
                setMessage("");
              }}
              required
              disabled={loading || verifying}
            />

            <button
              className="primary-button full"
              type="submit"
              disabled={loading || verifying}
            >
              {verifying ? t("login.signingIn") : t("login.signIn")}
            </button>

            <button
              className="secondary-button full"
              type="button"
              onClick={handleSendCode}
              disabled={loading || verifying}
            >
              {loading ? t("login.sending") : t("login.sendNewCode")}
            </button>

            <button
              className="login-text-button"
              type="button"
              onClick={handleChangeEmail}
              disabled={loading || verifying}
            >
              {t("login.useAnotherEmail")}
            </button>
          </form>
        )}

        {message && <p className="login-message">{message}</p>}

        {codeSent && (
          <div className="login-help-box">
            <strong>{t("login.codeHelpTitle")}</strong>
            <p>{t("login.codeHelpText")}</p>
          </div>
        )}
      </section>
    </main>
  );
}
