import AppLayout from "../components/AppLayout";

export default function Home() {
  return (
    <AppLayout active="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h2>Your social media workspace</h2>
        </div>
        <a className="primary-button" href="/create">
          Create new post
        </a>
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
          <a className="primary-button full" href="/create">
            Generate post
          </a>
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
    </AppLayout>
  );
}
