"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "https://app.vifsy.com",
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Check your email for the login link.");
    }

    setLoading(false);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand">
          <div className="brand-mark">V</div>
          <div>
            <h1>Vifsy</h1>
            <p>AI social media planner</p>
          </div>
        </div>

        <div className="login-content">
          <p className="eyebrow">Login</p>
          <h2>Sign in to your workspace</h2>
          <p>
            Enter your email and Vifsy will send you a secure login link.
          </p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <label>Email address</label>
          <input
            className="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <button className="primary-button full" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send login link"}
          </button>
        </form>

        {message && <p className="login-message">{message}</p>}
      </section>
    </main>
  );
}
