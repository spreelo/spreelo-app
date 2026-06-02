"use client";

import { useEffect, useMemo, useState } from "react";
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

const dayOrder = weekdays;

function createSlot() {
  return {
    id: crypto.randomUUID(),
    weekday: "Monday",
    publishTime: "08:35",
    prompt: "",
    generateImage: false,
    imagePrompt: "",
  };
}

export default function AutomationPage() {
  const [rules, setRules] = useState([]);
  const [slots, setSlots] = useState([createSlot()]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [scheduleType, setScheduleType] = useState("weekly");
  const [runDate, setRunDate] = useState("");

  const [planName, setPlanName] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Friendly");
  const [language, setLanguage] = useState("English");
  const [postType, setPostType] = useState("Offer");
  const [length, setLength] = useState("Medium");
  const [ctaType, setCtaType] = useState("Learn more");

  useEffect(() => {
    loadRules();
  }, []);

  const plannedCredits = useMemo(() => {
    return slots.reduce((total, slot) => total + (slot.generateImage ? 3 : 1), 0);
  }, [slots]);

  const textOnlyCount = useMemo(() => {
    return slots.filter((slot) => !slot.generateImage).length;
  }, [slots]);

  const imageCount = useMemo(() => {
    return slots.filter((slot) => slot.generateImage).length;
  }, [slots]);

  const existingWeeklyCredits = useMemo(() => {
    return rules.reduce((total, rule) => {
      if (!rule.is_active) return total;
      if (rule.schedule_type === "once") return total;
      return total + (rule.credit_cost || 1);
    }, 0);
  }, [rules]);

  const monthlyEstimate =
    scheduleType === "weekly"
      ? (existingWeeklyCredits + plannedCredits) * 4
      : existingWeeklyCredits * 4 + plannedCredits;

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

  function updateSlot(slotId, field, value) {
    setSlots((currentSlots) =>
      currentSlots.map((slot) =>
        slot.id === slotId ? { ...slot, [field]: value } : slot
      )
    );
  }

  function addSlot() {
    setSlots((currentSlots) => [...currentSlots, createSlot()]);
  }

  function duplicateSlot(slotId) {
    const slotToCopy = slots.find((slot) => slot.id === slotId);
    if (!slotToCopy) return;

    setSlots((currentSlots) => [
      ...currentSlots,
      {
        ...slotToCopy,
        id: crypto.randomUUID(),
      },
    ]);
  }

  function removeSlot(slotId) {
    if (slots.length === 1) {
      setMessage("You need at least one planned post.");
      return;
    }

    setSlots((currentSlots) =>
      currentSlots.filter((slot) => slot.id !== slotId)
    );
  }

  async function savePlan() {
    setMessage("");

    if (scheduleType === "once" && !runDate) {
      setMessage("Choose a date for the one-time plan.");
      return;
    }

    const invalidSlot = slots.find((slot) => !slot.prompt.trim());

    if (invalidSlot) {
      setMessage("Every planned post needs its own prompt.");
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

    const rows = slots.map((slot) => ({
      user_id: user.id,
      name: planName || `${slot.weekday} ${slot.publishTime}`,
      weekday: slot.weekday,
      publish_time: slot.publishTime,
      prompt: slot.prompt,
      platform,
      tone,
      language,
      post_type: postType,
      length,
      cta_type: ctaType,
      generate_image: slot.generateImage,
      image_prompt: slot.imagePrompt,
      credit_cost: slot.generateImage ? 3 : 1,
      schedule_type: scheduleType,
      run_date: scheduleType === "once" ? runDate : null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("automation_rules").insert(rows);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`${rows.length} planned post${rows.length === 1 ? "" : "s"} saved.`);
      setPlanName("");
      setSlots([createSlot()]);
      await loadRules();
    }

    setSaving(false);
  }

  async function deleteRule(ruleId) {
    const confirmDelete = window.confirm("Delete this planned post?");
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
          <h2>Build your weekly content plan</h2>
        </div>
      </header>

      <section className="grid">
        <div className="stat-card">
          <span>Planned posts</span>
          <strong>{slots.length}</strong>
        </div>
        <div className="stat-card">
          <span>New plan credits</span>
          <strong>{plannedCredits}</strong>
        </div>
        <div className="stat-card">
          <span>Estimated monthly use</span>
          <strong>{monthlyEstimate}</strong>
        </div>
      </section>

      <section className="planner-card">
        <div className="planner-intro">
          <p className="eyebrow">Step 1</p>
          <h3>Choose how this plan should run</h3>
          <p>
            Create one or several planned posts. Each row can have its own day,
            time, prompt and image setting.
          </p>
        </div>

        <div className="planner-section">
          <label className="field-label">Plan type</label>
          <div className="choice-row">
            <button
              className={scheduleType === "weekly" ? "choice active" : "choice"}
              onClick={() => setScheduleType("weekly")}
            >
              Repeats every week
            </button>
            <button
              className={scheduleType === "once" ? "choice active" : "choice"}
              onClick={() => setScheduleType("once")}
            >
              One-time plan
            </button>
          </div>
        </div>

        {scheduleType === "once" && (
          <div className="planner-section compact-field">
            <label className="field-label">Run date</label>
            <input
              className="input"
              type="date"
              value={runDate}
              onChange={(event) => setRunDate(event.target.value)}
            />
          </div>
        )}

        <div className="planner-section">
          <label className="field-label">Plan name</label>
          <input
            className="input"
            value={planName}
            onChange={(event) => setPlanName(event.target.value)}
            placeholder="Example: Weekly social media plan"
          />
        </div>
      </section>

      <section className="planner-card">
        <div className="planner-intro">
          <p className="eyebrow">Step 2</p>
          <h3>Add planned posts</h3>
          <p>
            Add one row for each post you want Vifsy to create. Use different
            prompts for different days and times.
          </p>
        </div>

        <div className="slot-list">
          {slots.map((slot, index) => (
            <article className="slot-card" key={slot.id}>
              <div className="slot-header">
                <div>
                  <p className="eyebrow">Planned post {index + 1}</p>
                  <h4>
                    {slot.weekday} · {slot.publishTime}
                  </h4>
                </div>

                <div className="button-row">
                  <button
                    className="secondary-button small-button"
                    onClick={() => duplicateSlot(slot.id)}
                  >
                    Duplicate
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => removeSlot(slot.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <div>
                  <label>Weekday</label>
                  <select
                    className="input"
                    value={slot.weekday}
                    onChange={(event) =>
                      updateSlot(slot.id, "weekday", event.target.value)
                    }
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
                    value={slot.publishTime}
                    onChange={(event) =>
                      updateSlot(slot.id, "publishTime", event.target.value)
                    }
                  />
                </div>
              </div>

              <label>Prompt for this post</label>
              <textarea
                value={slot.prompt}
                onChange={(event) =>
                  updateSlot(slot.id, "prompt", event.target.value)
                }
                placeholder="Example: Create a post about this week's best offer."
              />

              <div className="slot-options">
                <label>
                  <input
                    type="checkbox"
                    checked={slot.generateImage}
                    onChange={(event) =>
                      updateSlot(slot.id, "generateImage", event.target.checked)
                    }
                  />
                  Generate AI image for this post
                </label>

                <span className="status-pill">
                  {slot.generateImage ? "3 credits" : "1 credit"}
                </span>
              </div>

              {slot.generateImage && (
                <>
                  <label>Image prompt / visual direction</label>
                  <textarea
                    value={slot.imagePrompt}
                    onChange={(event) =>
                      updateSlot(slot.id, "imagePrompt", event.target.value)
                    }
                    placeholder="Example: A bright modern product photo style image with warm light and a clean background."
                  />
                </>
              )}
            </article>
          ))}
        </div>

        <button className="secondary-button" onClick={addSlot}>
          + Add another planned post
        </button>
      </section>

      <section className="hero-card">
        <div>
          <p className="eyebrow">Step 3</p>
          <h3>Default post settings</h3>
          <p>
            These settings apply to all rows in this plan. Later we can allow
            advanced overrides per row if needed.
          </p>
        </div>

        <div className="prompt-box">
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

            <div>
              <label>Length</label>
              <select
                className="input"
                value={length}
                onChange={(event) => setLength(event.target.value)}
              >
                <option>Short</option>
                <option>Medium</option>
                <option>Long</option>
              </select>
            </div>

            <div>
              <label>CTA type</label>
              <select
                className="input"
                value={ctaType}
                onChange={(event) => setCtaType(event.target.value)}
              >
                <option>Learn more</option>
                <option>Visit website</option>
                <option>Contact us</option>
                <option>Book now</option>
                <option>Shop now</option>
              </select>
            </div>
          </div>

          <div className="credit-summary">
            <div>
              <span>Total planned posts</span>
              <strong>{slots.length}</strong>
            </div>
            <div>
              <span>Text only</span>
              <strong>{textOnlyCount}</strong>
            </div>
            <div>
              <span>Text + image</span>
              <strong>{imageCount}</strong>
            </div>
            <div>
              <span>Credits</span>
              <strong>{plannedCredits}</strong>
            </div>
          </div>

          <button className="primary-button full" onClick={savePlan} disabled={saving}>
            {saving ? "Saving..." : "Save content plan"}
          </button>

          {message && <p className="login-message">{message}</p>}
        </div>
      </section>

      <section className="result-card">
        <div className="result-header">
          <div>
            <p className="eyebrow">Saved plans</p>
            <h3>Automation rules</h3>
          </div>
        </div>

        {loading ? (
          <div className="empty-card">
            <h3>Loading automation rules...</h3>
            <p>Please wait while Vifsy loads your plans.</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="empty-card">
            <h3>No automation rules yet</h3>
            <p>
              Add your first content plan above. Each planned post will be saved
              as its own automation rule.
            </p>
          </div>
        ) : (
          <div className="posts-list">
            {rules.map((rule) => (
              <article className="post-item" key={rule.id}>
                <div className="post-item-header">
                  <div>
                    <h4>
                      {rule.schedule_type === "once"
                        ? rule.run_date
                        : rule.weekday}{" "}
                      · {rule.publish_time?.slice(0, 5)}
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
                  {rule.generate_image && rule.image_prompt && (
                    <p>
                      <strong>Image:</strong> {rule.image_prompt}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  );
}
