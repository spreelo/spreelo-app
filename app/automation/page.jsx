"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

const weekdays = [
  { key: "Monday", short: "Mon" },
  { key: "Tuesday", short: "Tue" },
  { key: "Wednesday", short: "Wed" },
  { key: "Thursday", short: "Thu" },
  { key: "Friday", short: "Fri" },
  { key: "Saturday", short: "Sat" },
  { key: "Sunday", short: "Sun" },
];

const dayOrder = weekdays.map((day) => day.key);

export default function AutomationPage() {
  const [rules, setRules] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [repeatMode, setRepeatMode] = useState("selected");
  const [timeMode, setTimeMode] = useState("same");

  const [selectedDays, setSelectedDays] = useState({
    Monday: true,
    Tuesday: false,
    Wednesday: false,
    Thursday: false,
    Friday: false,
    Saturday: false,
    Sunday: false,
  });

  const [sameTimes, setSameTimes] = useState(["08:35"]);

  const [timesByDay, setTimesByDay] = useState({
    Monday: ["08:35"],
    Tuesday: ["08:35"],
    Wednesday: ["08:35"],
    Thursday: ["08:35"],
    Friday: ["08:35"],
    Saturday: ["08:35"],
    Sunday: ["08:35"],
  });

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Friendly");
  const [language, setLanguage] = useState("English");
  const [postType, setPostType] = useState("Offer");
  const [generateImage, setGenerateImage] = useState(false);

  const creditCost = generateImage ? 3 : 1;

  const activeDays = useMemo(() => {
    if (repeatMode === "everyday") {
      return weekdays.map((day) => day.key);
    }

    return weekdays
      .filter((day) => selectedDays[day.key])
      .map((day) => day.key);
  }, [repeatMode, selectedDays]);

  const plannedRuns = useMemo(() => {
    if (timeMode === "same") {
      return activeDays.length * sameTimes.filter(Boolean).length;
    }

    return activeDays.reduce((total, day) => {
      return total + (timesByDay[day] || []).filter(Boolean).length;
    }, 0);
  }, [activeDays, sameTimes, timeMode, timesByDay]);

  const newPlanWeeklyCredits = plannedRuns * creditCost;

  const existingWeeklyCredits = rules.reduce(
    (total, rule) => total + (rule.is_active ? rule.credit_cost || 1 : 0),
    0
  );

  const totalWeeklyCredits = existingWeeklyCredits + newPlanWeeklyCredits;
  const totalMonthlyCredits = totalWeeklyCredits * 4;

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
      .eq("user_id", user.id);

    if (error) {
      setMessage(error.message);
    } else {
      const sortedRules = (data || []).sort((a, b) => {
        const dayDiff =
          dayOrder.indexOf(a.weekday) - dayOrder.indexOf(b.weekday);

        if (dayDiff !== 0) return dayDiff;

        return String(a.publish_time).localeCompare(String(b.publish_time));
      });

      setRules(sortedRules);
    }

    setLoading(false);
  }

  function toggleDay(day) {
    setSelectedDays((current) => ({
      ...current,
      [day]: !current[day],
    }));
  }

  function addSameTime() {
    setSameTimes((current) => [...current, "12:00"]);
  }

  function updateSameTime(index, value) {
    setSameTimes((current) =>
      current.map((time, timeIndex) => (timeIndex === index ? value : time))
    );
  }

  function removeSameTime(index) {
    setSameTimes((current) => current.filter((_, timeIndex) => timeIndex !== index));
  }

  function addDayTime(day) {
    setTimesByDay((current) => ({
      ...current,
      [day]: [...(current[day] || []), "12:00"],
    }));
  }

  function updateDayTime(day, index, value) {
    setTimesByDay((current) => ({
      ...current,
      [day]: (current[day] || []).map((time, timeIndex) =>
        timeIndex === index ? value : time
      ),
    }));
  }

  function removeDayTime(day, index) {
    setTimesByDay((current) => ({
      ...current,
      [day]: (current[day] || []).filter((_, timeIndex) => timeIndex !== index),
    }));
  }

  async function savePlan() {
    setMessage("");

    if (!prompt.trim()) {
      setMessage("Write a prompt for this automation plan.");
      return;
    }

    if (activeDays.length === 0) {
      setMessage("Choose at least one weekday.");
      return;
    }

    if (plannedRuns === 0) {
      setMessage("Add at least one time.");
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

    const rows = [];

    activeDays.forEach((day) => {
      const times =
        timeMode === "same" ? sameTimes : timesByDay[day] || [];

      times.filter(Boolean).forEach((time) => {
        rows.push({
          user_id: user.id,
          name: name || `${day} ${time}`,
          weekday: day,
          publish_time: time,
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
      });
    });

    const { error } = await supabase.from("automation_rules").insert(rows);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`${rows.length} automation rule${rows.length === 1 ? "" : "s"} saved.`);
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
          <span>Existing weekly credits</span>
          <strong>{existingWeeklyCredits}</strong>
        </div>
        <div className="stat-card">
          <span>New plan credits/week</span>
          <strong>{newPlanWeeklyCredits}</strong>
        </div>
        <div className="stat-card">
          <span>Estimated total/month</span>
          <strong>{totalMonthlyCredits}</strong>
        </div>
      </section>

      <section className="planner-card">
        <div className="planner-intro">
          <p className="eyebrow">Step 1</p>
          <h3>Choose when Vifsy should create posts</h3>
          <p>
            Create a weekly plan without building every rule manually. Vifsy
            will save one automation rule for every selected day and time.
          </p>
        </div>

        <div className="planner-section">
          <label className="field-label">Repeat</label>
          <div className="choice-row">
            <button
              className={repeatMode === "everyday" ? "choice active" : "choice"}
              onClick={() => setRepeatMode("everyday")}
            >
              Every day
            </button>
            <button
              className={repeatMode === "selected" ? "choice active" : "choice"}
              onClick={() => setRepeatMode("selected")}
            >
              Selected weekdays
            </button>
          </div>
        </div>

        {repeatMode === "selected" && (
          <div className="planner-section">
            <label className="field-label">Weekdays</label>
            <div className="day-picker">
              {weekdays.map((day) => (
                <button
                  key={day.key}
                  className={selectedDays[day.key] ? "day active" : "day"}
                  onClick={() => toggleDay(day.key)}
                >
                  <span>{day.short}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="planner-section">
          <label className="field-label">Times</label>
          <div className="choice-row">
            <button
              className={timeMode === "same" ? "choice active" : "choice"}
              onClick={() => setTimeMode("same")}
            >
              Same times every selected day
            </button>
            <button
              className={timeMode === "different" ? "choice active" : "choice"}
              onClick={() => setTimeMode("different")}
            >
              Different times per day
            </button>
          </div>
        </div>

        {timeMode === "same" ? (
          <div className="planner-section">
            <div className="time-list">
              {sameTimes.map((time, index) => (
                <div className="time-row" key={index}>
                  <input
                    className="input"
                    type="time"
                    value={time}
                    onChange={(event) => updateSameTime(index, event.target.value)}
                  />
                  {sameTimes.length > 1 && (
                    <button
                      className="danger-button"
                      onClick={() => removeSameTime(index)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button className="secondary-button small-button" onClick={addSameTime}>
              + Add time
            </button>
          </div>
        ) : (
          <div className="planner-section day-time-grid">
            {activeDays.map((day) => (
              <div className="day-time-card" key={day}>
                <div className="day-time-header">
                  <strong>{day}</strong>
                  <button
                    className="secondary-button small-button"
                    onClick={() => addDayTime(day)}
                  >
                    + Time
                  </button>
                </div>

                {(timesByDay[day] || []).length === 0 ? (
                  <p className="muted-text">No times added.</p>
                ) : (
                  <div className="time-list">
                    {(timesByDay[day] || []).map((time, index) => (
                      <div className="time-row" key={index}>
                        <input
                          className="input"
                          type="time"
                          value={time}
                          onChange={(event) =>
                            updateDayTime(day, index, event.target.value)
                          }
                        />
                        <button
                          className="danger-button"
                          onClick={() => removeDayTime(day, index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="hero-card">
        <div>
          <p className="eyebrow">Step 2</p>
          <h3>Tell Vifsy what to create</h3>
          <p>
            This prompt will be used for every selected day and time in this
            plan. Later we can add advanced variations per day.
          </p>
        </div>

        <div className="prompt-box">
          <label>Plan name</label>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Weekly offer posts"
          />

          <div className="form-grid">
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
            placeholder="Example: Create a friendly post about this week's best offer."
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

          <div className="credit-summary">
            <div>
              <span>Posts per week</span>
              <strong>{plannedRuns}</strong>
            </div>
            <div>
              <span>Credits per run</span>
              <strong>{creditCost}</strong>
            </div>
            <div>
              <span>New plan/week</span>
              <strong>{newPlanWeeklyCredits}</strong>
            </div>
            <div>
              <span>Total/month</span>
              <strong>{totalMonthlyCredits}</strong>
            </div>
          </div>

          <button className="primary-button full" onClick={savePlan} disabled={saving}>
            {saving ? "Saving..." : "Save automation plan"}
          </button>

          {message && <p className="login-message">{message}</p>}
        </div>
      </section>

      <section className="result-card">
        <div className="result-header">
          <div>
            <p className="eyebrow">Current weekly plan</p>
            <h3>Saved automation rules</h3>
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
              Add your first plan above. You can skip days, add several times
              per day, and choose if posts should include images.
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
