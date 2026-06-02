export default function Calendar() {
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
          <a className="active" href="/calendar">Calendar</a>
          <a href="/brand">Brand profile</a>
          <a href="/settings">Settings</a>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2>Plan upcoming posts</h2>
          </div>
          <button className="primary-button">Schedule post</button>
        </header>

        <section className="empty-card">
          <h3>No scheduled posts yet</h3>
          <p>
            This is where your planned Facebook, Instagram and other social
            media posts will appear.
          </p>
        </section>

        <section className="grid calendar-grid">
          <div className="stat-card">
            <span>Today</span>
            <strong>0</strong>
          </div>
          <div className="stat-card">
            <span>This week</span>
            <strong>0</strong>
          </div>
          <div className="stat-card">
            <span>This month</span>
            <strong>0</strong>
          </div>
        </section>
      </section>
    </main>
  );
}
