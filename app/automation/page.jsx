"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function AutomationPage() {
  const [rules, setRules] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [weekday, setWeekday] = useState("Monday");
  const [publishTime, setPublishTime] = useState("08:35");
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Friendly");
  const [language, setLanguage] = useState("English");
  const [postType, setPostType] = useState("Offer");
  const [generateImage, setGenerateImage] = useState(false);

  const creditCost = generateImage ? 3 : 1;

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("user_id", user.id)
      .order("weekday", { ascending: true })
      .order("publish_time", { ascending: true });

    if (error) {
      setMessage(error.message);
    } else {
      setRules(data || []);
    }

    setLoading(false);
  }

  async function addRule() {
    setMessage("");

    if (!prompt.trim()) {
      setMessage("Write a prompt for this automation rule.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { error } = await supabase.from("automation_rules").insert({
      user_id: user.id,
      name: name || `${weekday} ${publishTime}`,
      weekday,
      publish_time: publishTime,
      prompt,
      platform,
      tone,
      language,
      post_type: postType,
      generate_image: generateImage,
      credit_cost: creditCost,
      is_active: true,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Automation rule saved.");
      setName("");
      setPrompt("");
      setGenerateImage(false);
      await loadRules();
    }

    setSaving(false);
  }

  async function deleteRule(ruleId) {
    const confirmDelete = window.confirm("Delete this automation rule?");
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("automation_rules")
      .delete()
      .eq("id", ruleId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setRules((currentRules) =>
      currentRules.filter((rule) => rule.id !== ruleId)
    );
  }

  const weeklyCredits = rules.reduce(
    (total, rule) => total + (rule.is_active ? rule.credit_cost || 1 : 0),
    0
  );

  const monthlyCredits = weeklyCredits * 4;

  return (
    <AppLayout active="automation">
      <header className="topbar">
        <div>
          <p className="eyebrow">Automation</p>
          <h2>Plan recurring AI posts</h2>
        </div>
      </header>

      <section className="grid">
        <div className="stat-card">
          <span>Active rules</span>
          <strong>{rules.filter((rule) => rule.is_active).length}</strong>
        </div>
        <div className="stat-card">
          <span>Credits per week</span>
          <strong>{weeklyCredits}</strong>
        </div>
        <div className="stat-card">
          <span>Estimated per month</span>
          <strong>{monthlyCredits}</strong>
        </div>
      </section>

      <section className="hero-card">
        <div>
          <p className="eyebrow">New rule</p>
          <h3>Create a weekly content prompt</h3>
          <p>
            Choose weekday, time and prompt. Vifsy will later use these rules to
            automatically create posts according to your schedule.
          </p>
        </div>

        <div className="prompt-box">
          <label>Rule name</label>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Monday morning offer"
          />

          <div className="form-grid">
            <div>
              <label>Weekday</label>
              <select
                className="input"
                value={weekday}
                onChange={(event) => setWeekday(event.target.value)}
              >
                {weekdays.map((day) => (
                  <option key={day}>{day}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Time</label>
              <input
                className="input"
                type="time"
                value={publishTime}
                onChange={(event) => setPublishTime(event.target.value)}
              />
            </div>

            <div>
              <label>Platform</label>
              <select
                className="input"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                <option>Instagram</option>
                <option>Facebook</option>
                <option>LinkedIn</option>
              </select>
            </div>

            <div>
              <label>Tone</label>
              <select
                className="input"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              >
                <option>Friendly</option>
                <option>Professional</option>
                <option>Sales-focused</option>
                <option>Premium</option>
              </select>
            </div>

            <div>
              <label>Language</label>
              <select
                className="input"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option>English</option>
                <option>Swedish</option>
              </select>
            </div>

            <div>
              <label>Post type</label>
              <select
                className="input"
                value={postType}
                onChange={(event) => setPostType(event.target.value)}
              >
                <option>Offer</option>
                <option>News</option>
                <option>Educational</option>
                <option>Reminder</option>
              </select>
            </div>
          </div>

          <label>Prompt</label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Example: Create a Monday morning post about this week's best offer."
          />

          <div className="toggle-row">
            <label>
              <input
                type="checkbox"
                checked={generateImage}
                onChange={(event) => setGenerateImage(event.target.checked)}
              />
              Generate AI image
            </label>
          </div>

          <p className="credit-note">
            This rule costs <strong>{creditCost}</strong>{" "}
            {creditCost === 1 ? "credit" : "credits"} each time it runs.
          </p>

          <button className="primary-button full" onClick={addRule} disabled={saving}>
            {saving ? "Saving..." : "Save automation rule"}
          </button>

          {message && <p className="login-message">{message}</p>}
        </div>
      </section>

      <section className="result-card">
        <div className="result-header">
          <div>
            <p className="eyebrow">Weekly plan</p>
            <h3>Your automation rules</h3>
          </div>
        </div>

        {loading ? (
          <div className="empty-card">
            <h3>Loading automation rules...</h3>
            <p>Please wait while Vifsy loads your weekly plan.</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="empty-card">
            <h3>No automation rules yet</h3>
            <p>
              Add your first weekday prompt above. You can skip any days you do
              not want to publish on.
            </p>
          </div>
        ) : (
          <div className="posts-list">
            {rules.map((rule) => (
              <article className="post-item" key={rule.id}>
                <div className="post-item-header">
                  <div>
                    <h4>
                      {rule.weekday} · {rule.publish_time?.slice(0, 5)}
                    </h4>
                    <p>
                      {rule.platform} · {rule.post_type} ·{" "}
                      {rule.generate_image ? "Text + image" : "Text only"}
                    </p>
                  </div>

                  <div className="post-actions">
                    <span>{rule.credit_cost} credits/run</span>
                    <button
                      className="danger-button"
                      onClick={() => deleteRule(rule.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="idea-box">
                  <strong>{rule.name}</strong>
                  <p>{rule.prompt}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  );
}
