export default function CreatePost() {
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
          <a className="active" href="/create">Create post</a>
          <a href="/calendar">Calendar</a>
          <a href="/brand">Brand profile</a>
          <a href="/settings">Settings</a>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Create post</p>
            <h2>Generate social media content</h2>
          </div>
        </header>

        <section className="hero-card">
          <div>
            <p className="eyebrow">AI assistant</p>
            <h3>Tell Vifsy what you want to post</h3>
            <p>
              Start by describing your offer, news, product or idea. Later this
              page will generate ready-to-use posts with captions, hashtags and
              scheduling suggestions.
            </p>
          </div>

          <div className="prompt-box">
            <label>Post idea</label>
            <textarea placeholder="Example: We want to promote our new lunch menu this week..." />
            <button className="primary-button full">Generate draft</button>
          </div>
        </section>
      </section>
    </main>
  );
}
