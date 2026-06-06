"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

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

function makeSlotId() {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSlot(weekday = "Monday") {
  return {
    id: makeSlotId(),
    weekday,
    publishTime: "08:35",
    prompt: "",
    generateImage: false,
    imagePrompt: "",
    includeEmojis: true,
    includeHashtags: true,
  };
}

function normalizeTime(value) {
  return String(value || "").slice(0, 5);
}

function getStockholmDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: STOCKHOLM_TIME_ZONE,
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getCurrentWeekday(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: STOCKHOLM_TIME_ZONE,
  }).format(date);
}

function getCurrentTimeHHMM(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: STOCKHOLM_TIME_ZONE,
  }).format(date);
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function stockholmLocalToUtcDate({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
}) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  let offset = getTimeZoneOffsetMs(new Date(utcGuess), STOCKHOLM_TIME_ZONE);
  let utcTime = utcGuess - offset;

  const correctedOffset = getTimeZoneOffsetMs(
    new Date(utcTime),
    STOCKHOLM_TIME_ZONE
  );

  if (correctedOffset !== offset) {
    utcTime = utcGuess - correctedOffset;
  }

  return new Date(utcTime);
}

function getNextWeeklyRunAtIso(weekday, publishTime, now = new Date()) {
  const normalizedPublishTime = normalizeTime(publishTime);

  if (!weekday || !normalizedPublishTime) {
    return null;
  }

  const [hourValue, minuteValue] = normalizedPublishTime.split(":");

  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const targetWeekdayIndex = dayOrder.findIndex(
    (day) => day.toLowerCase() === String(weekday).toLowerCase()
  );

  if (targetWeekdayIndex === -1) {
    return null;
  }

  const currentWeekday = getCurrentWeekday(now);

  const currentWeekdayIndex = dayOrder.findIndex(
    (day) => day.toLowerCase() === String(currentWeekday).toLowerCase()
  );

  if (currentWeekdayIndex === -1) {
    return null;
  }

  const currentTime = getCurrentTimeHHMM(now);

  let daysUntilNextRun =
    (targetWeekdayIndex - currentWeekdayIndex + 7) % 7;

  if (daysUntilNextRun === 0 && normalizedPublishTime <= currentTime) {
    daysUntilNextRun = 7;
  }

  const stockholmParts = getStockholmDateParts(now);

  const nextRunUtcDate = stockholmLocalToUtcDate({
    year: stockholmParts.year,
    month: stockholmParts.month,
    day: stockholmParts.day + daysUntilNextRun,
    hour,
    minute,
    second: 0,
  });

  return nextRunUtcDate.toISOString();
}

function getOneTimeRunAtIso(runDate, publishTime) {
  const normalizedPublishTime = normalizeTime(publishTime);

  if (!runDate || !normalizedPublishTime) {
    return null;
  }

  const [yearValue, monthValue, dayValue] = runDate.split("-");
  const [hourValue, minuteValue] = normalizedPublishTime.split(":");

  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }

  const runUtcDate = stockholmLocalToUtcDate({
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
  });

  return runUtcDate.toISOString();
}

function getInitialNextRunAtIso({ scheduleType, weekday, publishTime, runDate }) {
  if (scheduleType === "once") {
    return getOneTimeRunAtIso(runDate, publishTime);
  }

  if (scheduleType === "weekly") {
    return getNextWeeklyRunAtIso(weekday, publishTime);
  }

  return null;
}

function formatDateTime(value) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: STOCKHOLM_TIME_ZONE,
  }).format(new Date(value));
}

export default function AutomationPage() {
  const [rules, setRules] = useState([]);
  const [creditBalance, setCreditBalance] = useState(null);

  const [slots, setSlots] = useState([createSlot("Monday")]);

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
  const [approvalRequired, setApprovalRequired] = useState(true);

  useEffect(() => {
    loadRules();
  }, []);

  const plannedCredits = useMemo(() => {
    return slots.reduce(
      (total, slot) => total + (slot.generateImage ? 3 : 1),
      0
    );
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

  const hasEnoughCredits =
    !creditBalance || plannedCredits <= creditBalance.credits_remaining;

  async function loadRules() {
    setLoading(true);

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
        if (a.next_run_at && b.next_run_at) {
          return new Date(a.next_run_at) - new Date(b.next_run_at);
        }

        if (a.next_run_at && !b.next_run_at) return -1;
        if (!a.next_run_at && b.next_run_at) return 1;

        const dayDiff =
          dayOrder.indexOf(a.weekday) - dayOrder.indexOf(b.weekday);

        if (dayDiff !== 0) return dayDiff;

        return String(a.publish_time).localeCompare(String(b.publish_time));
      });

      setRules(sortedRules);
    }

    const { data: balanceData, error: balanceError } = await supabase
      .from("user_credit_balances")
      .select("credits_remaining, monthly_credit_limit, plan_name")
      .eq("user_id", user.id)
      .single();

    if (!balanceError && balanceData) {
      setCreditBalance(balanceData);
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
        id: makeSlotId(),
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

    if (creditBalance && plannedCredits > creditBalance.credits_remaining) {
      setMessage(
        `This plan needs ${plannedCredits} credits, but you only have ${creditBalance.credits_remaining} credits remaining.`
      );
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
      include_emojis: slot.includeEmojis,
      include_hashtags: slot.includeHashtags,
      credit_cost: slot.generateImage ? 3 : 1,
      schedule_type: scheduleType,
      run_date: scheduleType === "once" ? runDate : null,
      next_run_at: getInitialNextRunAtIso({
        scheduleType,
        weekday: slot.weekday,
        publishTime: slot.publishTime,
        runDate,
      }),
      approval_required: approvalRequired,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("automation_rules").insert(rows);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(
        `${rows.length} planned post${rows.length === 1 ? "" : "s"} saved.`
      );

      setPlanName("");
      setSlots([createSlot()]);
      await loadRules();
    }

    setSaving(false);
  }

  async function deleteRule(ruleId) {
    const confirmDelete = window.confirm("Delete this planned post?");
    if (!confirmDelete) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { error } = await supabase
      .from("automation_rules")
      .delete()
      .eq("id", ruleId)
      .eq("user_id", user.id);

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
              <span>Credits remaining</span>
              <strong>{creditBalance?.credits_remaining ?? "—"}</strong>
              {creditBalance?.plan_name && (
                <small>{creditBalance.plan_name} plan</small>
              )}
            </div>
            <div className="stat-icon">💳</div>
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
            <p>
              Watch our 2-minute video guide to learn how to schedule recurring
              posts.
            </p>
          </div>
          <button type="button" className="play-button">
            ▶
          </button>
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
                  type="button"
                  className={scheduleType === "weekly" ? "active" : ""}
                  onClick={() => setScheduleType("weekly")}
                >
                  Repeats every week
                </button>
                <button
                  type="button"
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
                          updateSlot(
                            slot.id,
                            "generateImage",
                            event.target.checked
                          )
                        }
                      />
                      Generate AI image for this post
                    </label>

                    <label className="image-check">
                      <input
                        type="checkbox"
                        checked={slot.includeEmojis}
                        onChange={(event) =>
                          updateSlot(
                            slot.id,
                            "includeEmojis",
                            event.target.checked
                          )
                        }
                      />
                      Include emojis
                    </label>

                    <label className="image-check">
                      <input
                        type="checkbox"
                        checked={slot.includeHashtags}
                        onChange={(event) =>
                          updateSlot(
                            slot.id,
                            "includeHashtags",
                            event.target.checked
                          )
                        }
                      />
                      Include hashtags
                    </label>

                    <span className="credit-chip">
                      {slot.generateImage ? "3 Credits" : "1 Credit"}
                    </span>

                    <div className="row-actions">
                      <button
                        type="button"
                        className="tiny-button"
                        onClick={() => duplicateSlot(slot.id)}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
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

          <button type="button" className="add-plan-button" onClick={addSlot}>
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
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                <option>Instagram</option>
                <option>Facebook</option>
                <option>LinkedIn</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>Tone</span>
              <select
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              >
                <option>Friendly</option>
                <option>Professional</option>
                <option>Sales-focused</option>
                <option>Premium</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>Language</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option>English</option>
                <option>Swedish</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>Post type</span>
              <select
                value={postType}
                onChange={(event) => setPostType(event.target.value)}
              >
                <option>Offer</option>
                <option>News</option>
                <option>Educational</option>
                <option>Reminder</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>Length</span>
              <select
                value={length}
                onChange={(event) => setLength(event.target.value)}
              >
                <option>Short</option>
                <option>Medium</option>
                <option>Long</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>CTA type</span>
              <select
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

            <div className="setting-tile">
              <span>Publishing mode</span>
              <select
                value={approvalRequired ? "review" : "auto"}
                onChange={(event) =>
                  setApprovalRequired(event.target.value === "review")
                }
              >
                <option value="review">Review before publishing</option>
                <option value="auto">Publish automatically</option>
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

            {creditBalance && !hasEnoughCredits && (
              <div className="credit-warning">
                This plan needs {plannedCredits} credits, but you only have{" "}
                {creditBalance.credits_remaining} credits remaining.
              </div>
            )}

            <button
              type="button"
              className="save-plan-button"
              onClick={savePlan}
              disabled={saving || !hasEnoughCredits}
            >
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
              <p>Please wait while Spreelo loads your plans.</p>
            </div>
          ) : rules.length === 0 ? (
            <div className="automation-empty">
              <div className="folder-icon">📁</div>
              <div>
                <h4>No automation rules yet</h4>
                <p>
                  Add your first content plan above. Each planned post will be
                  saved as its own automation rule.
                </p>
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
                        {rule.generate_image ? "Text + image" : "Text only"} ·{" "}
                        {rule.approval_required
                          ? "Review first"
                          : "Auto publish"}
                      </p>
                    </div>

                    <div className="post-actions">
                      <span>{rule.credit_cost} credits/run</span>
                      <button
                        type="button"
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

                    <p>
                      <strong>Next run:</strong>{" "}
                      {formatDateTime(rule.next_run_at)}
                    </p>

                    <p>
                      <strong>Status:</strong>{" "}
                      {rule.is_active ? "Active" : "Inactive"}
                    </p>

                    <p>
                      <strong>Options:</strong>{" "}
                      {rule.include_emojis ? "Emojis" : "No emojis"} ·{" "}
                      {rule.include_hashtags ? "Hashtags" : "No hashtags"}
                    </p>

                    {rule.generate_image && rule.image_prompt && (
                      <p>
                        <strong>Image:</strong> {rule.image_prompt}
                      </p>
                    )}

                    {rule.last_error && (
                      <p>
                        <strong>Last error:</strong> {rule.last_error}
                      </p>
                    )}
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
