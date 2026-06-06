import AppLayout from "../../components/AppLayout";

export default function Settings() {
  return (
    <AppLayout active="settings">
      <header className="topbar">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Manage your Spreelo workspace</h2>
        </div>
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">Workspace settings</p>
          <h3>Account and publishing setup</h3>
          <p>
            Later this page will include login settings, connected social media
            accounts, billing and team access.
          </p>
        </div>

        <div className="prompt-box">
          <label>Workspace name</label>
          <input className="input" placeholder="Example: My Company" />

          <label>Default language</label>
          <input className="input" placeholder="Example: English, Swedish..." />

          <label>Default posting tone</label>
          <input
            className="input"
            placeholder="Example: Friendly, professional, premium..."
          />

          <button className="primary-button full">Save settings</button>
        </div>
      </section>
    </AppLayout>
  );
}
