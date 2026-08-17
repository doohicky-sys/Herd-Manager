# What I couldn't fix in code — and exactly how you do it

Three audit items need actions only you can take (database access, or design
decisions with trade-offs). Everything else from the audit is implemented in v26.

---

## 1. 🔴 S1 — Lock down the database (30 min + 1 evening)

**Why I can't do it:** enabling RLS requires running SQL in *your* Supabase
dashboard, and turning it on **immediately breaks the app** until a sign-in
screen exists. That's a coordinated change you need to be at the keyboard for.

**Part A — run the SQL (5 minutes).** Open `SUPABASE_SECURITY.sql` (in this
folder), copy it into Supabase → SQL Editor → Run.
⚠️ **Do steps 2-3 only when you're ready to deploy the login build**, or the
app will stop syncing.

**Part B — create the shared account (5 minutes).**
Supabase dashboard → Authentication → Providers → enable **Email**.
Then Authentication → Users → **Add user** → e.g. `herd@yourdomain.com` with a
strong password. One account, shared between you and your partner.

**Part C — add the sign-in screen (~1 evening).** Ask me for "the v27 auth
build" and I'll wire it up: a login screen before the app loads, token storage,
automatic refresh, and `supaReq()` switched from the anon key to the session
token. I've deliberately not shipped it blind, because half-finished auth is
worse than none.

**Interim mitigation you can do today (2 minutes):** in Supabase → Settings →
API, note that anyone with your Netlify URL can read the key. If you want to
reduce exposure *right now* without any code change, you can rotate the anon
key — but the app will need the new key pasted into `js/01-core.js:3` and
redeployed. It doesn't fix the underlying hole; only RLS does.

---

## 2. 🟠 B2 — Atomic conflict guard (15 min, after S1)

v26 still uses the timestamp comparison, which has a small race window.
`SUPABASE_SECURITY.sql` **Step 1** already adds the `rev` column you need.

Once that column exists, ask me for the `rev`-based `cloudWrite()` and I'll
swap it in — it's a 20-line change, but it *requires* the column to exist first,
so shipping it before you run the SQL would break saving.

---

## 3. 🟡 S2c — Content-Security-Policy for scripts (half a day)

A `_headers` file is included and active — it adds `X-Frame-Options`,
`nosniff`, `Referrer-Policy`, `Permissions-Policy` and a CSP covering images,
connections and styles.

**Current state:** `script-src 'self' 'unsafe-inline'` — inline handlers are
allowed, but third-party script injection, plugins, framing and base-tag
hijacking are all blocked.

⚠️ **Note for future edits:** do NOT remove `'unsafe-inline'` from `script-src`
until the delegated-listener refactor below is complete. And be aware that
omitting `script-src` entirely does *not* leave scripts unrestricted — browsers
fall back to `default-src`, which would block all 69 inline `onclick` handlers
and make every button in the app silently stop working. (This is exactly the
bug that broke the first v26 build.)

**The proper fix** is to convert those to delegated event listeners:

```js
// instead of: <div class="card" onclick="openDetail('${xe(p.id)}')">
//   markup:   <div class="card" data-pig="${xe(p.id)}">
document.addEventListener("click", e => {
  const card = e.target.closest("[data-pig]");
  if (card) return openDetail(card.dataset.pig);
  const act = e.target.closest("[data-action]");
  if (act) return ACTIONS[act.dataset.action]?.(act.dataset.arg);
});
```

I've already added `data-pig` to the herd cards as a start. This is a
mechanical but wide-reaching refactor — worth doing if you want the strongest
CSP, but the escaping fixes in v26 already close the actual vulnerability.

---

## 4. 🟢 Deferred by recommendation (not oversights)

| Item | Why deferred |
|---|---|
| **S4** — ImgBB → Supabase Storage | Belongs in the SaaS build (Phase A already covers it). Retrofitting here means re-uploading every photo twice. |
| **P4** — list virtualisation | Not needed under ~250 pigs. Revisit when the herd grows. |
| **U4b** — self-hosted Inter font | Adds ~90 KB and a font-loading strategy; do it when you settle the brand. |
| **P1b** — per-row database | This is the blob-architecture rewrite. It's what the FlutterFlow app *is*. Don't do it twice. |

---

## Deploying v26

1. Drag this whole folder into Netlify → Deploys.
2. **Close and reopen** the installed app (service worker cache name changed).
3. The `_headers` file takes effect automatically on Netlify — no config needed.
