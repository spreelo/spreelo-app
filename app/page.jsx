export default function Home() {
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
          <a className="active" href="#">Dashboard</a>
          <a href="#">Create post</a>
          <a href="#">Calendar</a>
          <a href="#">Brand profile</a>
          <a href="#">Settings</a>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h2>Your social media workspace</h2>
          </div>
          <button className="primary-button">Create new post</button>
        </header>

        <section className="hero-card">
          <div>
            <p className="eyebrow">AI post generator</p>
            <h3>Create better posts in minutes</h3>
            <p>
              Let Vifsy help you turn your business, offers and ideas into
              ready-to-use social media content.
            </p>
          </div>

          <div className="prompt-box">
            <label>What do you want to post about?</label>
            <textarea placeholder="Example: Promote our summer offer for local customers..." />
            <button className="primary-button full">Generate post</button>
          </div>
        </section>

        <section className="grid">
          <div className="stat-card">
            <span>Posts created</span>
            <strong>0</strong>
          </div>
          <div className="stat-card">
            <span>Scheduled posts</span>
            <strong>0</strong>
          </div>
          <div className="stat-card">
            <span>Connected channels</span>
            <strong>0</strong>
          </div>
        </section>

        <section className="empty-card">
          <h3>No posts yet</h3>
          <p>
            Your generated and scheduled posts will appear here once you start
            creating content.
          </p>
        </section>
      </section>
    </main>
  );
}
