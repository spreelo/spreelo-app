"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AppLayout({ active, children }) {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUser(user);
      setCheckingSession(false);
    }

    checkUser();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (checkingSession) {
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

          <p className="login-message">Loading your workspace...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div>
            <h1>Vifsy</h1>
            <p>AI social media planner</p>
          </div>
        </div>

        <nav className="nav">
          <a className={active === "dashboard" ? "active" : ""} href="/">
            Dashboard
          </a>
          <a className={active === "create" ? "active" : ""} href="/create">
            Create post
          </a>
          <a className={active === "calendar" ? "active" : ""} href="/calendar">
            Calendar
          </a>
          <a className={active === "brand" ? "active" : ""} href="/brand">
            Brand profile
          </a>
          <a className={active === "settings" ? "active" : ""} href="/settings">
            Settings
          </a>
        </nav>

        <div className="sidebar-footer">
          <p>{user?.email}</p>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </aside>

      <section className="content">{children}</section>
    </main>
  );
}
