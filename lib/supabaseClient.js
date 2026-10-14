import { createClient } from "@supabase/supabase-js";
import { createPersistentAuthStorage, prepareBrowserStorage } from "./browserStorage.js";
import { invalidateBrowserSession } from "./browserSession.js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isBrowser = typeof window !== "undefined";
if (isBrowser) {
  try { prepareBrowserStorage(window.localStorage); }
  catch (error) {
    // No stored values, tokens or user identifiers in this diagnostic.
    console.warn("Spreelo persistent session storage is unavailable", {code:error?.name || "STORAGE_UNAVAILABLE"});
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, isBrowser ? {
  auth: { persistSession:true, autoRefreshToken:true,
    storage:createPersistentAuthStorage(() => window.localStorage) },
} : undefined);

// No auth calls inside this callback: only invalidate the short-lived,
// server-verified browser cache when Supabase reports a state change.
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange(() => invalidateBrowserSession(supabase));
}
