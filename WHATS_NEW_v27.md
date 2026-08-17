# v27 — the visible batch

Everything here is something you'll *see or feel*, unlike v26 which was mostly
security and reliability plumbing.

## New

- **Profile ‹ › paging.** Open any pig and page through the herd with chevrons
  ("3 of 138"). It follows your current filter and sort, so if you've filtered
  to sows, you page through sows. Arrow keys work on a laptop.
- **Recently viewed.** A row of the last pigs you opened sits above the herd
  grid — one tap to jump back. Appears once you've viewed two or more.
- **➕ now asks what you want.** Instead of jumping straight to the single-pig
  form, it opens a sheet: "Add one pig" or "Bulk intake". Bulk intake is no
  longer buried three taps deep in More.
- **Search clear button.** An × appears in the search box when you type.
- **Sync tells you what changed.** Instead of "Pulled the latest", you now get
  "Synced ✓ — 1 added, 3 updated, 1 removed".
- **Type scale actually applied.** All 108 hard-coded font sizes are now on an
  11-step scale. This is the one I claimed in v26 but had only defined, not
  applied — typography should now feel more consistent.
- **Smooth pane transitions** where the browser supports View Transitions,
  plus subtle haptic taps on navigation (Android).

## Also fixed / improved

- Both bottom sheets (More and Add) now share swipe-to-close, focus trapping
  and backdrop behaviour — previously only More had it.
- Escape and backdrop taps close either sheet correctly.
- The profile close button now has a proper accessible name.

## Still outstanding — see REMAINING_WORK.md

1. 🔴 **Database lockdown (RLS + auth)** — needs your Supabase dashboard.
2. 🟠 **Atomic conflict guard** — needs the `rev` column from the SQL file.
3. 🟡 **Delegated listeners / strict CSP** — mechanical refactor of ~69 inline
   handlers.
4. 🟢 **Self-hosted font** — deliberately deferred; it needs a ~90 KB font file
   and a loading strategy, and is best decided alongside branding.
