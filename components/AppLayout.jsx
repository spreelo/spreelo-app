export default function AppLayout({ active, children }) {
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
      </aside>

      <section className="content">{children}</section>
    </main>
  );
}
