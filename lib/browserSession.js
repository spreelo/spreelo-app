// Browser navigation guards only. Server API authorization and Supabase RLS
// remain authoritative; a local session's user object is never an auth fallback.
export const BROWSER_SESSION_UNAVAILABLE_EVENT = "spreelo-session-unavailable";
const readers = new WeakMap();
const endedCodes = new Set(["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "user_not_found", "user_banned"]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function sessionFailureDetails(error, stage) {
  // Never include tokens, emails, URLs or raw provider messages in diagnostics.
  return { stage, code: String(error?.code || error?.name || "AUTH_CHECK_UNAVAILABLE").slice(0, 80),
    status: Number(error?.status || 0) || null };
}

export function createBrowserSessionReader(auth, { attempts = 3, timeoutMs = 8000, wait = pause, now = Date.now, cacheMs = 10000 } = {}) {
  let pending = null, cached = null;
  async function timed(operation) {
    let timer;
    try { return await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("Session check timed out"), { code: "AUTH_CHECK_TIMEOUT" })), timeoutMs);
    })]); } finally { clearTimeout(timer); }
  }
  const result = (status, error = null, session = null, user = null, stage = "read_session") => ({ status, error, session, user, stage });
  async function verify() {
    let lastError = null, stage = "read_session";
    for (let attempt = 0; attempt < attempts; attempt++) {
      let startingToken;
      try {
        stage = "read_session";
        const stored = await timed(() => auth.getSession());
        if (stored.error) throw stored.error;
        const session = stored.data?.session;
        startingToken = session?.access_token;
        if (!startingToken) {
          cached = null;
          // Give initialization and a just-completed sign-in time to settle.
          if (attempt + 1 === attempts) return lastError ? result("unavailable", lastError, null, null, stage) : result("signed_out");
        } else {
          if (cached?.token === startingToken && cached.until > now()) return cached.result;
          stage = "verify_user";
          const response = await timed(() => auth.getUser(startingToken));
          if (response.error) throw response.error;
          if (!response.data?.user?.id) throw Object.assign(new Error("Auth returned no verified user"), { code: "AUTH_USER_RESPONSE_EMPTY" });
          // A stale response must not sign in the previous account after another
          // tab changed the session, or revive an explicitly signed-out user.
          stage = "confirm_session";
          const current = await timed(() => auth.getSession());
          if (current.error) throw current.error;
          if (!current.data?.session?.access_token) { cached = null; return result("signed_out"); }
          if (current.data.session.access_token !== startingToken) { cached = null; }
          else {
            const verifiedSession = { ...current.data.session, user: response.data.user };
            const verified = result("authenticated", null, verifiedSession, response.data.user, stage);
            cached = { token: startingToken, until: now() + cacheMs, result: verified };
            return verified;
          }
        }
      } catch (error) {
        lastError = error; cached = null;
        if (endedCodes.has(error?.code)) {
          // Confirm that the failure still belongs to the current session.
          // A delayed response for an old token cannot eject a newer login.
          try {
            const latest = await timed(() => auth.getSession());
            if (latest.error) throw latest.error;
            if (!latest.data?.session?.access_token || latest.data.session.access_token === startingToken) return result("signed_out", error, null, null, stage);
          } catch (confirmationError) { lastError = confirmationError; }
        }
      }
      if (attempt + 1 < attempts) await wait(250 * (attempt + 1));
    }
    return result("unavailable", lastError || Object.assign(new Error("Session changed during verification"), { code: "AUTH_SESSION_CHANGED" }), null, null, stage);
  }
  return {
    read() {
      if (!pending) pending = verify().finally(() => { pending = null; });
      return pending;
    },
    invalidate() { cached = null; },
  };
}

export function readBrowserSession(supabase) {
  if (!readers.has(supabase.auth)) readers.set(supabase.auth, createBrowserSessionReader(supabase.auth));
  return readers.get(supabase.auth).read();
}
export function invalidateBrowserSession(supabase) {
  readers.get(supabase.auth)?.invalidate();
}

export async function getBrowserUserOrRedirect(supabase) {
  const checked = await readBrowserSession(supabase);
  if (checked.status === "authenticated") return checked.user;
  const details = sessionFailureDetails(checked.error, checked.stage);
  if (typeof window !== "undefined") {
    if (checked.status === "signed_out") {
      console.warn("Spreelo session ended", details);
      window.location.href = "/login";
    } else {
      console.warn("Spreelo session could not be verified; no logout performed", details);
      window.dispatchEvent(new CustomEvent(BROWSER_SESSION_UNAVAILABLE_EVENT, { detail: details }));
    }
  }
  return null;
}

export async function confirmCodeLoginSession(supabase, expectedUserId) {
  invalidateBrowserSession(supabase);
  const checked = await readBrowserSession(supabase);
  if (checked.status === "authenticated" && checked.user.id !== expectedUserId) {
    return { ...checked, status: "unavailable", user: null, session: null,
      error: Object.assign(new Error("The active account changed during code login"), { code: "AUTH_LOGIN_ACCOUNT_CHANGED" }) };
  }
  return checked;
}
