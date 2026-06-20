"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeOtp(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 6);
  }

  async function redirectAfterLogin(loggedInUser) {
    if (!loggedInUser?.id) {
      window.location.href = "/login";
      return;
    }

    const { data: existingBrands, error } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("user_id", loggedInUser.id)
      .limit(1);

    if (error) {
      setMessage(error.message || "Could not check your workspace.");
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

    window.location.href = "/onboarding";
  }

  async function handleSendCode(event) {
    event.preventDefault();

    if (loading || verifying) return;

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setMessage("Enter your email address first.");
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
      setMessage(error.message || "Could not send sign-in code.");
      setLoading(false);
      return;
    }

    setEmail(normalizedEmail);
    setCodeSent(true);
    setOtpCode("");
    setMessage("We sent a 6-digit sign-in code to your email.");
    setLoading(false);
  }

  async function handleVerifyCode(event) {
    event.preventDefault();

    if (loading || verifying) return;

    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = normalizeOtp(otpCode);

    if (!normalizedEmail) {
      setMessage("Enter your email address first.");
      return;
    }

    if (normalizedCode.length !== 6) {
      setMessage("Enter the 6-digit code from your email.");
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
      setMessage(error.message || "The code was not accepted.");
      setVerifying(false);
      return;
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
          <p className="eyebrow">Login</p>
          <h2>Sign in to your workspace</h2>

          {!codeSent ? (
            <p>
              Enter your email and Spreelo will send you a secure 6-digit
              sign-in code.
            </p>
          ) : (
            <p>
              Enter the 6-digit code we sent to <strong>{email}</strong>.
            </p>
          )}
        </div>

        {!codeSent ? (
          <form onSubmit={handleSendCode} className="login-form">
            <label>Email address</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
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
              {loading ? "Sending..." : "Send sign-in code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="login-form">
            <label>Sign-in code</label>
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
              {verifying ? "Signing in..." : "Sign in"}
            </button>

            <button
              className="secondary-button full"
              type="button"
              onClick={handleSendCode}
              disabled={loading || verifying}
            >
              {loading ? "Sending..." : "Send a new code"}
            </button>

            <button
              className="login-text-button"
              type="button"
              onClick={handleChangeEmail}
              disabled={loading || verifying}
            >
              Use another email
            </button>
          </form>
        )}

        {message && <p className="login-message">{message}</p>}

        {codeSent && (
          <div className="login-help-box">
            <strong>Can’t find the email?</strong>
            <p>
              Check your spam or junk folder. The code can sometimes take up to
              a minute to arrive.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
