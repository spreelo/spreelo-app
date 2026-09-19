import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBrandLearningPlannerContext,
  formatBrandLearningGenerationGuidance,
  getBrandLearningContentTypeAdjustment,
} from "../lib/brandLearning.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const approveRoute = read("app/api/approve-post/route.js");
const rejectRoute = read("app/api/reject-post/route.js");
const plannerRoute = read("app/api/plan-content/route.js");
const cronRoute = read("app/api/cron/run-automations/route.js");
const migration = read("supabase/v144_212_grow_brain_brand_learning.sql");
const packageJson = read("package.json");

const earlyProfile = {
  profile_json: {
    event_count: 2,
    content_types: {
      faq: { observations: 2, score: -80, confidence: 0.25 },
    },
  },
};
assert.equal(getBrandLearningContentTypeAdjustment(earlyProfile, "faq"), 0);
assert.equal(buildBrandLearningPlannerContext(earlyProfile), null);

const learnedProfile = {
  profile_json: {
    learning_state: "early",
    event_count: 8,
    approved_count: 6,
    rejected_count: 2,
    content_types: {
      website_item: { observations: 5, score: 44, confidence: 0.63 },
      faq: { observations: 3, score: -28, confidence: 0.38 },
    },
    rejection_categories: { tone_or_wording: 2 },
    recent_rejection_feedback: [
      { category: "tone_or_wording", text: "Keep the copy shorter and less formal." },
    ],
  },
};
assert.ok(getBrandLearningContentTypeAdjustment(learnedProfile, "website_item") > 0);
assert.ok(getBrandLearningContentTypeAdjustment(learnedProfile, "faq") < 0);
assert.ok(Math.abs(getBrandLearningContentTypeAdjustment(learnedProfile, "website_item")) <= 10);
const plannerContext = buildBrandLearningPlannerContext(learnedProfile);
assert.equal(plannerContext.event_count, 8);
assert.equal(plannerContext.content_type_signals.length, 2);
assert.match(formatBrandLearningGenerationGuidance(learnedProfile), /Keep the copy shorter and less formal/);
assert.match(formatBrandLearningGenerationGuidance(learnedProfile), /soft brand-specific evidence/);

assert.match(migration, /create table if not exists public\.brand_learning_events/);
assert.match(migration, /create unique index if not exists brand_learning_events_post_event_unique_idx/);
assert.match(migration, /create table if not exists public\.brand_learning_profiles/);
assert.match(migration, /grant select on public\.brand_learning_profiles to authenticated/);
assert.match(migration, /auth\.uid\(\) = user_id/);
assert.match(migration, /revoke all on public\.brand_learning_events from anon, authenticated/);

assert.match(approveRoute, /recordBrandLearningEvent\(\{[\s\S]*?eventType: "approved"/);
assert.match(rejectRoute, /recordBrandLearningEvent\(\{[\s\S]*?eventType: "rejected"/);
assert.match(rejectRoute, /rejectionCategory: reasonCategory/);
assert.match(rejectRoute, /rejectionText: reasonText/);

assert.match(plannerRoute, /brand_learning_profiles/);
assert.match(plannerRoute, /CUSTOMER LEARNING SIGNALS/);
assert.match(plannerRoute, /getBrandLearningContentTypeAdjustment/);
assert.match(plannerRoute, /minObservations: 3/);
assert.match(plannerRoute, /Negative customer learning is intentionally conservative/);

assert.match(cronRoute, /loadAdaptiveWeeklyLearningProfiles/);
assert.match(cronRoute, /getBrandLearningContentTypeAdjustment\(learningProfile, contentTypeId/);
assert.match(cronRoute, /brand_learning_profile: learningProfile/);
assert.match(cronRoute, /formatBrandLearningGenerationGuidance/);
assert.match(cronRoute, /learningProfilesByOwner: adaptiveLearningProfilesByOwner/);

assert.ok(packageJson.includes('"test:v144.212"'));
console.log("v144.212 Grow Brain brand-learning checks passed.");
