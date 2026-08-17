// ── Local storage ─────────────────────────────────────────────────────────────
function saveLocal() {
  const write = () => localStorage.setItem(LOCAL_KEY, JSON.stringify({ pigs, pairings, activity, snapshots }));
  try {
    write();
    addLog(`Saved locally (${pigs.length} pigs, ${pairings.length} pairings, ${activity.length} activity entries)`);
  } catch(e) {
    addLog(`Local save error: ${e.message}`);
    const quota = e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22;
    if (!quota) return;
    // Shed the least-critical data and retry once before troubling the user
    snapshots = snapshots.slice(-150);
    activity = activity.slice(-60);
    try { write(); addLog("Recovered from quota error by trimming history"); return; }
    catch(_) {}
    setSync("⚠ Device storage full — export a backup", "err");
    if (typeof toast === "function") toast("Device storage full — changes may not be saved. Export a backup.", "err", 6000);
    else toast("Device storage full \u2014 export a backup from More", "err", 6000);
  }
}
function loadLocal() {
  try {
    const local = localStorage.getItem(LOCAL_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      // Backward compatible: very old local saves were a plain pigs array
      if (Array.isArray(parsed)) {
        pigs = parsed.filter(p => p && typeof p === "object");
        pairings = []; activity = [];
        addLog(`Loaded ${pigs.length} pigs from local storage (legacy format)`);
        return true;
      }
      if (parsed && Array.isArray(parsed.pigs) && parsed.pigs.length > 0) {
        pigs = parsed.pigs.filter(p => p && typeof p === "object");
        pairings = Array.isArray(parsed.pairings) ? parsed.pairings : [];
        activity = Array.isArray(parsed.activity) ? parsed.activity : [];
        snapshots = Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
        addLog(`Loaded ${pigs.length} pigs, ${pairings.length} pairings, ${activity.length} activity entries from local storage`);
        return true;
      }
    }
  } catch(e) { addLog(`Local load error: ${e.message}`); }
  return false;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  addLog(`Herd Manager ${APP_VERSION} starting`);
  const stamp = document.getElementById("build-stamp");
  if (stamp) stamp.textContent = `Version ${APP_VERSION}`;
  const badge = document.getElementById("ver-badge");
  if (badge) badge.textContent = APP_VERSION;
  navGo("herd");
  setSync("Loading…", "busy");
  const hadLocal = loadLocal();
  autoPurgeTrash();               // B4 — runs on every start, including offline
  if (typeof repairFamilyLinks === "function" && repairFamilyLinks()) saveLocal();
  captureSnapshot();               // record today's count locally; cloud sync happens quietly below, never with a prompt
  if (!hadLocal) renderSkeleton(); else renderAll();
  setSync("Connecting to Supabase…", "busy");
  try {
    const cloud = await cloudRead();
    if (cloud && cloud.pigs && cloud.pigs.length > 0) {
      pigs = cloud.pigs.filter(p => p && typeof p === "object");
      pairings = cloud.pairings || [];
      activity = cloud.activity || [];
      snapshots = cloud.snapshots || [];
      addLog(`Cloud loaded: ${pigs.length} pigs, ${pairings.length} pairings, ${activity.length} activity entries, ${snapshots.length} snapshots`);
      autoPurgeTrash();
      if (typeof repairFamilyLinks === "function" && repairFamilyLinks()) { saveLocal(); }
      // FIX — this used to call save(), which can trigger the conflict-guard
      // dialog purely from OPENING the app (whoever opens second on a given
      // day gets asked to resolve a "conflict" against nothing). The daily
      // snapshot is low-stakes, silently-mergeable data: write it straight to
      // the cloud without the interactive guard, and never block the user.
      if (captureSnapshot()) { saveLocal(); silentSnapshotSync(); }
      saveLocal();
      renderAll();
      setSync("✓ Synced", "ok");
    } else if (!cloud) {
      // Table doesn't exist yet — need to create it
      addLog("No data in cloud yet — will create on first save");
      if (!hadLocal) renderAll(); // clear skeleton even if cloud is empty
      setSync("✓ Ready (first use)", "ok");
    } else {
      addLog("Cloud returned empty data");
      if (!hadLocal) renderAll();
      setSync("✓ Synced (empty)", "ok");
    }
  } catch(e) {
    addLog(`Cloud error: ${e.message}`);
    if (!hadLocal) renderAll(); // clear skeleton, fall back to whatever pigs holds (likely empty)
    // Check if table missing (404 or relation does not exist)
    if (e.message.includes("404") || e.message.includes("relation") || e.message.includes("does not exist")) {
      addLog("Table 'herd' not found — see setup instructions");
      setSync("⚠ Setup needed — tap for details", "err");
      // Show setup instructions
      setTimeout(() => {
        confirmSheet({ title: "One-time setup needed", body: "The 'herd' table doesn't exist yet. Open your Supabase dashboard \u2192 SQL Editor and create it, then refresh this page. Full SQL is in the setup notes.", confirmLabel: "Got it", cancelLabel: "Dismiss" });
      }, 500);
    } else {
      setSync("⚠ Offline — tap for details", "err");
    }
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────
let pendingSave = false;
function save() {
  captureSnapshot();
  saveLocal();
  pendingSave = true;
  clearTimeout(saveTimer);
  setSync("Saving…", "busy");
  saveTimer = setTimeout(() => flushSave(), 1500);
}
// B1 — the debounce means a close/background inside 1.5s used to lose the cloud
// write silently. flushSave() is now also called when the page is hidden.
async function flushSave() {
  if (!pendingSave) return;
  clearTimeout(saveTimer);
  pendingSave = false;
  try {
    await cloudWrite(pigs, pairings, activity);
    setSync("✓ Synced", "ok");
    addLog("Cloud save OK");
  } catch(e) {
    if (e.message === "CONFLICT_PULLED") {
      addLog("Sync conflict — pulled partner's version instead of overwriting");
      setSync("✓ Loaded partner's changes", "ok");
      return;
    }
    pendingSave = true; // keep it queued for the next attempt
    addLog(`Cloud save failed: ${e.message}`);
    setSync("⚠ Saved locally only — tap for details", "err");
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSave();
});
window.addEventListener("pagehide", () => {
  if (!pendingSave) return;
  // Last resort: sendBeacon survives the page being torn down
  try {
    const body = JSON.stringify([{ id: 1, data: { pigs, pairings, activity, snapshots }, updated_at: new Date().toISOString() }]);
    navigator.sendBeacon?.(
      `${SUPA_URL}/rest/v1/herd?on_conflict=id&apikey=${encodeURIComponent(SUPA_KEY)}`,
      new Blob([body], { type: "application/json" })
    );
    addLog("pagehide — beacon save attempted");
  } catch(e) { /* nothing more we can do at this point */ }
});

// ── Force pull ────────────────────────────────────────────────────────────────
let lastPullSummary = "";
async function forceCloudPull(silent) {
  setSync("Pulling…", "busy");
  try {
    const cloud = await cloudRead();
    if (cloud && cloud.pigs && cloud.pigs.length > 0) {
      // Work out what actually changed so the user gets a meaningful message
      const before = new Map(pigs.map(p => [p.id, JSON.stringify(p)]));
      const incoming = cloud.pigs.filter(p => p && typeof p === "object");
      let added = 0, changed = 0;
      incoming.forEach(p => {
        const prev = before.get(p.id);
        if (prev === undefined) added++;
        else if (prev !== JSON.stringify(p)) changed++;
      });
      const removed = [...before.keys()].filter(id => !incoming.some(p => p.id === id)).length;
      pigs = incoming;
      pairings = cloud.pairings || [];
      activity = cloud.activity || [];
      snapshots = cloud.snapshots || [];
      if (typeof repairFamilyLinks === "function") repairFamilyLinks();
      lastPullSummary = [
        added ? `${added} added` : null,
        changed ? `${changed} updated` : null,
        removed ? `${removed} removed` : null
      ].filter(Boolean).join(", ") || "no changes";
      saveLocal(); renderAll();
      setSync("✓ Synced", "ok");
      addLog(`Pulled ${pigs.length} pigs, ${pairings.length} pairings from cloud`);
      if (!silent) toast(`Synced \u2713 \u2014 ${lastPullSummary}`);
    }
  } catch(e) {
    addLog(`Pull failed: ${e.message}`);
    setSync("⚠ Pull failed — tap for details", "err");
    if (!silent) toast("Couldn\u2019t reach the cloud \u2014 check your connection", "err", 4000);
  }
}

// ── Activity log ──────────────────────────────────────────────────────────────
// Records a short trail of who-did-what so two editors can see recent changes
async function silentSnapshotSync() {
  try {
    const cur = await supaReq("GET", "/herd?id=eq.1&select=data,updated_at");
    const row = Array.isArray(cur) && cur[0] ? cur[0] : null;
    const cloudData = row ? row.data : {};
    // Merge just the snapshots array into whatever is currently in the cloud,
    // rather than overwriting pigs/pairings/activity with our local copy —
    // this can never clobber a partner's concurrent edit.
    const merged = { ...cloudData, snapshots };
    await supaReq("POST", "/herd?on_conflict=id", [{ id: 1, data: merged, updated_at: row ? row.updated_at : new Date().toISOString() }]);
    addLog("Daily snapshot synced quietly (no conflict check needed)");
  } catch(e) {
    addLog(`Snapshot sync skipped: ${e.message}`);
  }
}
function logActivity(text) {
  // Collapse near-identical consecutive entries — editing one pig used to log
  // "profile updated" and "family connections updated" seconds apart, which
  // buried the genuinely interesting events.
  const now = Date.now();
  const head = activity[0];
  if (head && head.text === text && (now - new Date(head.ts).getTime()) < 120000) {
    head.ts = new Date(now).toISOString();
    return;
  }
  const subjectOf = s => {
    // Strip any leading emoji / HTML entity, then take the name before "'s "
    const cleaned = String(s).replace(/^\s*(?:&#\d+;|[^A-Za-z0-9])+\s*/, "");
    const m = cleaned.match(/^(.+?)['\u2019]s\s/);
    return m ? m[1].trim() : null;
  };
  const subject = subjectOf(text);
  if (head && subject) {
    const headSubject = subjectOf(head.text);
    if (headSubject && headSubject === subject && (now - new Date(head.ts).getTime()) < 60000) {
      head.text = `${subject}'s profile was updated`;
      head.ts = new Date(now).toISOString();
      return;
    }
  }
  activity.unshift({ text, ts: new Date(now).toISOString() });
  if (activity.length > 100) activity.length = 100;
}
