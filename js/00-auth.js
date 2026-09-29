// ── Authentication ───────────────────────────────────────────────────────────
// Before this file existed, every device talked to Supabase using only the
// public anon key baked into 01-core.js — visible to anyone who viewed the
// page source, and (with Row Level Security still off on the `herd` table)
// enough on its own to read or wipe the whole herd. This file adds a real
// sign-in gate: nobody reaches the app's data until they've signed in with a
// Supabase Auth account, and every request after that carries a personal
// session token instead of the bare public key. Loaded first (before
// 01-core.js) because the login gate has to be able to show itself before
// anything else on the page runs.
//
// Auth talks to Supabase's GoTrue REST API directly with fetch(), the same
// way the rest of this app talks to PostgREST in 01-core.js — no SDK needed
// for the handful of endpoints this uses (password sign-in, token refresh,
// sign-out).

const AUTH_SESSION_KEY = "gp_auth_session_v1";

// The in-memory session mirror. Persisted to localStorage on every change so
// a reload doesn't force signing in again. { access_token, refresh_token,
// expires_at (epoch seconds) } or null when signed out.
let authSession = null;

function authLoadSession() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.access_token && s.refresh_token) return s;
  } catch(e) {}
  return null;
}
function authSaveSession(s) {
  authSession = s;
  try {
    if (s) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(AUTH_SESSION_KEY);
  } catch(e) {
    // Local storage being unavailable here shouldn't crash sign-in — the
    // session just won't survive a reload, which is a lesser problem than
    // being unable to sign in at all.
  }
}

// Raw call to Supabase's auth endpoint. Distinct from supaReq() in
// 01-core.js (which is for the /rest/v1 PostgREST API and, from this point
// on, expects a signed-in session to already exist) because auth calls
// always use the anon key as their bearer token, never a user's own token.
async function authReq(path, body) {
  const url = `${SUPA_URL}/auth/v1${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "apikey": SUPA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    const txt = await r.text();
    const data = txt ? JSON.parse(txt) : null;
    if (!r.ok) {
      const msg = (data && (data.error_description || data.msg || data.error)) || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return data;
  } catch(e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("Sign-in request timed out");
    throw e;
  }
}

async function authSignIn(email, password) {
  const data = await authReq("/token?grant_type=password", { email, password });
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600)
  };
  authSaveSession(session);
  return session;
}

async function authSignOut() {
  // Best-effort — tell Supabase to invalidate the refresh token, but a
  // signed-out state is defined locally (no session in storage), so a
  // network failure here still must not leave someone unable to sign out.
  try {
    if (authSession && authSession.access_token) {
      await fetch(`${SUPA_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${authSession.access_token}` }
      });
    }
  } catch(e) {}
  authSaveSession(null);
}

// Refreshes the access token using the refresh token. Supabase access
// tokens are short-lived (~1hr), but the refresh token is long-lived, so
// this is what actually keeps someone signed in across days/weeks without
// re-entering the password — exactly like the session cookie in a normal
// website, just implemented explicitly here since there's no SDK managing
// it automatically.
async function authRefresh() {
  if (!authSession || !authSession.refresh_token) return null;
  try {
    const data = await authReq("/token?grant_type=refresh_token", { refresh_token: authSession.refresh_token });
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600)
    };
    authSaveSession(session);
    return session;
  } catch(e) {
    // Refresh token itself is invalid/expired/revoked — this device is
    // genuinely signed out, not just offline. Clear the stale session so
    // the login gate shows instead of looping on a token that will never
    // work again.
    authSaveSession(null);
    return null;
  }
}

// Returns a valid session (refreshing first if the current one is expired
// or close to it), or null if nobody is signed in / the session couldn't be
// refreshed. This is the single entry point the rest of the app should use
// before making any /rest/v1 request.
async function authGetSession() {
  if (!authSession) authSession = authLoadSession();
  if (!authSession) return null;
  const now = Math.floor(Date.now() / 1000);
  // Refresh proactively 60s before actual expiry, not reactively after a
  // request already failed — avoids a save silently failing mid-flow.
  if (authSession.expires_at - now < 60) return await authRefresh();
  return authSession;
}

function authIsSignedIn() {
  return !!(authSession || authLoadSession());
}

// ── Login gate UI ────────────────────────────────────────────────────────────
// A full-screen overlay, present in index.html, hidden by default. Shown
// before the rest of the app boots when there's no valid session, and
// removed once sign-in succeeds. Deliberately built the same way as
// confirmSheet() elsewhere in this app (plain DOM, no framework) rather
// than pulled in as a separate page, so it can share the same CSS and so
// there's nowhere for a signed-out person to reach the herd data — the
// gate and the app are the same document.
function showLoginGate(errorMsg) {
  const gate = document.getElementById("login-gate");
  if (!gate) return;
  gate.classList.add("open");
  const err = document.getElementById("login-error");
  if (err) {
    err.textContent = errorMsg || "";
    err.style.display = errorMsg ? "block" : "none";
  }
  document.getElementById("login-email")?.focus();
}
function hideLoginGate() {
  const gate = document.getElementById("login-gate");
  if (gate) gate.classList.remove("open");
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const emailEl = document.getElementById("login-email");
  const passEl = document.getElementById("login-password");
  const btn = document.getElementById("login-submit");
  const email = (emailEl?.value || "").trim();
  const password = passEl?.value || "";
  if (!email || !password) {
    showLoginGate("Enter both an email and password.");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Signing in…";
  try {
    await authSignIn(email, password);
    hideLoginGate();
    if (passEl) passEl.value = "";
    // Auth just went from "none" to "real session" — hand off to the app's
    // normal boot sequence, which was deliberately held back until now.
    if (typeof bootAppAfterAuth === "function") bootAppAfterAuth();
  } catch(e) {
    const msg = /invalid.*credentials|invalid.*grant/i.test(e.message)
      ? "Incorrect email or password."
      : `Couldn't sign in: ${e.message}`;
    showLoginGate(msg);
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
}

async function handleSignOut() {
  const confirmed = await confirmSheet({
    title: "Sign out?",
    body: "You'll need to sign in again to see or edit the herd on this device.",
    confirmLabel: "Sign out",
    cancelLabel: "Cancel",
    danger: true
  });
  if (!confirmed) return;
  await authSignOut();
  location.reload();
}
