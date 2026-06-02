export default function BrandProfile() {
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
          <a className="active" href="/brand">Brand profile</a>
          <a href="/settings">Settings</a>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Brand profile</p>
            <h2>Teach Vifsy about your business</h2>
          </div>
          <button className="primary-button">Save profile</button>
        </header>

        <section className="hero-card">
          <div>
            <p className="eyebrow">Business context</p>
            <h3>Your brand voice matters</h3>
            <p>
              Later, Vifsy will use this information to create posts that sound
              like your business, match your audience and fit your offers.
            </p>
          </div>

          <div className="prompt-box">
            <label>Business name</label>
            <input className="input" placeholder="Example: Vifsy" />

            <label>Industry</label>
            <input className="input" placeholder="Example: Restaurant, salon, ecommerce..." />

            <label>Target audience</label>
            <textarea placeholder="Example: Local customers, small business owners, parents..." />

            <button className="primary-button full">Save brand profile</button>
          </div>
        </section>
      </section>
    </main>
  );
}
