export default function Settings() {
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
          <a href="/">Dashboard</a>
          <a href="/create">Create post</a>
          <a href="/calendar">Calendar</a>
          <a href="/brand">Brand profile</a>
          <a className="active" href="/settings">Settings</a>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Manage your Vifsy workspace</h2>
          </div>
        </header>

        <section className="hero-card">
          <div>
            <p className="eyebrow">Workspace settings</p>
            <h3>Account and publishing setup</h3>
            <p>
              Later this page will include login settings, connected social
              media accounts, billing and team access.
            </p>
          </div>

          <div className="prompt-box">
            <label>Workspace name</label>
            <input className="input" placeholder="Example: My Company" />

            <label>Default language</label>
            <input className="input" placeholder="Example: English, Swedish..." />

            <label>Default posting tone</label>
            <input className="input" placeholder="Example: Friendly, professional, premium..." />

            <button className="primary-button full">Save settings</button>
          </div>
        </section>
      </section>
    </main>
  );
}
