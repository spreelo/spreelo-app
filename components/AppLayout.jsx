"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const navItems = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/",
    icon: "⌂",
  },
  {
    id: "create",
    label: "Content",
    href: "/create",
    icon: "▦",
  },
  {
    id: "automation",
    label: "Automation",
    href: "/automation",
    icon: "✦",
  },
  {
    id: "calendar",
    label: "Calendar",
    href: "/calendar",
    icon: "□",
  },
  {
    id: "brand",
    label: "Brand profile",
    href: "/brand",
    icon: "◎",
  },
  {
  id: "social-channels",
  label: "Social channels",
  href: "/social-channels",
  icon: "◉",
},
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: "⚙",
  },
];

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
            <div className="brand-mark">S</div>
            <div>
              <h1>Spreelo</h1>
              <p>AI social media planner</p>
            </div>
          </div>

          <p className="login-message">Loading your workspace...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell spreelo-shell">
      <aside className="sidebar spreelo-sidebar">
        <div className="brand spreelo-brand">
          <div className="brand-mark spreelo-brand-mark">S</div>
          <div>
            <h1>Spreelo</h1>
            <p>AI social media planner</p>
          </div>
        </div>

        <nav className="nav spreelo-nav">
          {navItems.map((item) => (
            <a
              key={item.id}
              className={active === item.id ? "active" : ""}
              href={item.href}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-footer spreelo-sidebar-footer">
          <div className="sidebar-plan-card">
            <div className="sidebar-plan-icon">✦</div>
            <div>
              <strong>Plan: Pro</strong>
              <span>Upgrade for more credits & features</span>
            </div>
            <span className="sidebar-plan-arrow">›</span>
          </div>

          <div className="sidebar-user-email">{user?.email}</div>

          <button type="button" onClick={handleLogout}>
            <span>⇱</span>
            Log out
          </button>
        </div>
      </aside>

      <section className="content spreelo-content">{children}</section>
    </main>
  );
}
