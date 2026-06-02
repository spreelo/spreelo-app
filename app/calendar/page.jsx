import AppLayout from "../../components/AppLayout";

export default function Calendar() {
  return (
    <AppLayout active="calendar">
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
          This is where your planned Facebook, Instagram and other social media
          posts will appear.
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
    </AppLayout>
  );
}
