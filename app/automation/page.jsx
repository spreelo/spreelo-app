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
  const [slots, setSlots] = useState([createSlot(), { ...createSlot(), id: crypto.randomUUID(), weekday: "Wednesday" }]);
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
      <div className="automation-page">
        <header className="automation-heading">
          <div>
            <h2>Build your weekly content plan</h2>
          </div>

          <span className="guide-pill">Step-by-step setup guide</span>
        </header>

        <section className="automation-stats">
          <div className="automation-stat-card">
            <div>
              <span>Planned posts</span>
              <strong>{slots.length}</strong>
            </div>
            <div className="stat-icon">📅</div>
          </div>

          <div className="automation-stat-card">
            <div>
              <span>New plan credits</span>
              <strong>{plannedCredits}</strong>
            </div>
            <div className="stat-icon">★</div>
          </div>

          <div className="automation-stat-card">
            <div>
              <span>Estimated monthly use</span>
              <strong>{monthlyEstimate}</strong>
            </div>
            <div className="stat-icon">▮</div>
          </div>
        </section>

        <section className="automation-help">
          <div className="help-icon">💡</div>
          <div>
            <h3>New to automation?</h3>
            <p>Watch our 2-minute video guide to learn how to schedule recurring posts.</p>
          </div>
          <button className="play-button">▶</button>
        </section>

        <section className="setup-card">
          <div className="setup-title">
            <p>Step 1</p>
            <h3>Choose how this plan should run</h3>
            <span>Define the foundation of your automated schedule.</span>
          </div>

          <div className="setup-row">
            <div>
              <label>Plan type</label>
              <div className="plan-toggle">
                <button
                  className={scheduleType === "weekly" ? "active" : ""}
                  onClick={() => setScheduleType("weekly")}
                >
                  Repeats every week
                </button>
                <button
                  className={scheduleType === "once" ? "active" : ""}
                  onClick={() => setScheduleType("once")}
                >
                  One-time plan
                </button>
              </div>
            </div>

            {scheduleType === "once" && (
              <div>
                <label>Run date</label>
                <input
                  className="input"
                  type="date"
                  value={runDate}
                  onChange={(event) => setRunDate(event.target.value)}
                />
              </div>
            )}

            <div className="wide-field">
              <label>Plan name</label>
              <input
                className="input"
                value={planName}
                onChange={(event) => setPlanName(event.target.value)}
                placeholder="Example: Weekly social media plan"
              />
            </div>
          </div>
        </section>

        <section className="setup-card">
          <div className="setup-title">
            <p>Step 2</p>
            <h3>Add planned posts</h3>
            <span>Visually map out your weekly content.</span>
          </div>

          <div className="planned-list">
            {slots.map((slot, index) => (
              <article className="planned-row" key={slot.id}>
                <div className="planned-number">{index + 1}</div>

                <div className="planned-content">
                  <div className="planned-top">
                    <div>
                      <p>Planned post {index + 1}</p>
                      <h4>
                        {slot.weekday} · {slot.publishTime}
                      </h4>
                    </div>
                  </div>

                  <div className="planned-fields">
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

                    <input
                      className="input time-input"
                      type="time"
                      value={slot.publishTime}
                      onChange={(event) =>
                        updateSlot(slot.id, "publishTime", event.target.value)
                      }
                    />

                    <input
                      className="input prompt-input"
                      value={slot.prompt}
                      onChange={(event) =>
                        updateSlot(slot.id, "prompt", event.target.value)
                      }
                      placeholder="Example: Create a post about this"
                    />
                  </div>

                  <div className="planned-bottom">
                    <label className="image-check">
                      <input
                        type="checkbox"
                        checked={slot.generateImage}
                        onChange={(event) =>
                          updateSlot(slot.id, "generateImage", event.target.checked)
                        }
                      />
                      Generate AI image for this post
                    </label>

                    <span className="credit-chip">
                      {slot.generateImage ? "3 Credits" : "1 Credit"}
                    </span>

                    <div className="row-actions">
                      <button
                        className="tiny-button"
                        onClick={() => duplicateSlot(slot.id)}
                      >
                        Duplicate
                      </button>
                      <button
                        className="tiny-button danger"
                        onClick={() => removeSlot(slot.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {slot.generateImage && (
                    <textarea
                      className="image-prompt-box"
                      value={slot.imagePrompt}
                      onChange={(event) =>
                        updateSlot(slot.id, "imagePrompt", event.target.value)
                      }
                      placeholder="Visual direction for the image, for example: bright modern photo style, clean background, warm light."
                    />
                  )}
                </div>
              </article>
            ))}
          </div>

          <button className="add-plan-button" onClick={addSlot}>
            + Add another planned post
          </button>
        </section>

        <section className="settings-card">
          <div className="setup-title">
            <p>Step 3</p>
            <h3>Default post settings</h3>
            <span>These settings apply to all rows in this plan.</span>
          </div>

          <div className="settings-panel">
            <div className="setting-tile">
              <span>Platform</span>
              <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
                <option>Instagram</option>
                <option>Facebook</option>
                <option>LinkedIn</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>Tone</span>
              <select value={tone} onChange={(event) => setTone(event.target.value)}>
                <option>Friendly</option>
                <option>Professional</option>
                <option>Sales-focused</option>
                <option>Premium</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>Language</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option>English</option>
                <option>Swedish</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>Post type</span>
              <select value={postType} onChange={(event) => setPostType(event.target.value)}>
                <option>Offer</option>
                <option>News</option>
                <option>Educational</option>
                <option>Reminder</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>Length</span>
              <select value={length} onChange={(event) => setLength(event.target.value)}>
                <option>Short</option>
                <option>Medium</option>
                <option>Long</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>CTA type</span>
              <select value={ctaType} onChange={(event) => setCtaType(event.target.value)}>
                <option>Learn more</option>
                <option>Visit website</option>
                <option>Contact us</option>
                <option>Book now</option>
                <option>Shop now</option>
              </select>
            </div>

            <div className="setting-tile summary">
              <span>Total planned posts</span>
              <strong>{slots.length}</strong>
            </div>

            <div className="setting-tile summary">
              <span>Text only</span>
              <strong>{textOnlyCount}</strong>
            </div>

            <div className="setting-tile summary">
              <span>Text + image</span>
              <strong>{imageCount}</strong>
            </div>

            <div className="setting-tile summary">
              <span>Credits</span>
              <strong>{plannedCredits}</strong>
            </div>

            <button className="save-plan-button" onClick={savePlan} disabled={saving}>
              {saving ? "Saving..." : "💾 Save content plan"}
            </button>
          </div>

          {message && <p className="login-message">{message}</p>}
        </section>

        <section className="saved-card">
          <div className="setup-title">
            <p>Saved plans</p>
            <h3>Automation rules</h3>
          </div>

          {loading ? (
            <div className="automation-empty">
              <h4>Loading automation rules...</h4>
              <p>Please wait while Vifsy loads your plans.</p>
            </div>
          ) : rules.length === 0 ? (
            <div className="automation-empty">
              <div className="folder-icon">📁</div>
              <div>
                <h4>No automation rules yet</h4>
                <p>Add your first content plan above. Each planned post will be saved as its own automation rule.</p>
              </div>
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
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
