import AppLayout from "../../components/AppLayout";

export default function CreatePost() {
  return (
    <AppLayout active="create">
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
    </AppLayout>
  );
}
