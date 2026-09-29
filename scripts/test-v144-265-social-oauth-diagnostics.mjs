import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function expect(ok, message) { if (!ok) throw new Error(message); }

const social = read("app/social-channels/page.jsx");
const freeTrial = read("lib/freeTrial.js");
const meta = read("app/api/meta/page-selection/route.js");

// v144.265 deliberately restores the pre-v144.264 popup behavior. The
// reconciliation experiment must not remain in the social page.
expect(!social.includes("reconcileClosedOAuth"), "v144.264 popup reconciliation is still present");
expect(!social.includes("oauthReconcileTokenRef"), "v144.264 reconciliation token is still present");
expect(social.includes('window.open("about:blank"'), "Established OAuth popup flow is missing");
expect(social.includes("popupClosed: true"), "Established popup-closed fallback is missing");
expect(social.includes("spreelo-social-oauth-result"), "Established OAuth completion listener is missing");

// Common trial/credit path must emit stage markers without logging secrets.
expect(freeTrial.includes('[social-trial] ${stage}'), "Shared social-trial diagnostic logger missing");
expect(freeTrial.includes('"balance:ensure:start"'), "Balance ensure start marker missing");
expect(freeTrial.includes('"preflight:start"'), "Trial preflight start marker missing");
expect(freeTrial.includes('"preflight:balance_ready"'), "Trial preflight balance marker missing");
expect(freeTrial.includes('"authorize:start"'), "Trial authorization start marker missing");
expect(freeTrial.includes('"authorize:claim_result"'), "Trial claim result marker missing");
expect(freeTrial.includes("diagnosticId"), "Diagnostic IDs are not shortened");

// Facebook page selection gets an explicit stage so one Vercel log is enough
// to identify whether preflight, save, or authorization failed.
expect(meta.includes('let diagnosticStage = "request_start"'), "Meta diagnostic stage missing");
expect(meta.includes('diagnosticStage = "trial_preflight"'), "Meta preflight stage missing");
expect(meta.includes('diagnosticStage = "save_connection"'), "Meta save stage missing");
expect(meta.includes('diagnosticStage = "trial_authorize"'), "Meta authorization stage missing");
expect(meta.includes('"[meta-page-selection] complete"'), "Meta completion marker missing");
expect(meta.includes("stage: diagnosticStage"), "Meta errors do not include diagnostic stage");

console.log("v144.265 social OAuth diagnostic regression checks passed");
