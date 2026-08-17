const APP_VERSION = "v37";
// ── Config ────────────────────────────────────────────────────────────────────
const SUPA_URL  = "https://zpbvscpbnazqdsrxbovi.supabase.co";
const SUPA_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwYnZzY3BibmF6cWRzcnhib3ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNDYzMDcsImV4cCI6MjA5NDgyMjMwN30.NhoY86X5tpXDPrUqkxpuqxqader3gk_ACsR-0S1Zk_A";
const IMGBB_KEY = "1b6e37b5d59a07d695357ef52f8768ad";
const LOCAL_KEY = "gp_local_v13";

// ── State ─────────────────────────────────────────────────────────────────────
let pigs = [];
let pairings = [];
let activity = [];
let snapshots = []; // daily {d, a(ctive), s(ows), b(oars), p(ipeline)} for charts
let saveTimer = null;
let lastKnownUpdatedAt = null; // cloud updated_at we last loaded — powers the conflict guard
let editId = null;
let famPendingAdds = [];   // { pigId, relation } queued to link on save
let famPendingRemoves = []; // pigIds queued to unlink on save
let famAcResults = []; // current autocomplete result set, for keyboard nav
let logs = [];

function relTime(iso) { return timeAgo(iso); } // alias for any older call sites


// ── Toasts & confirm sheets (replaces native alert/confirm) ───────────────────
function toast(msg, kind = "ok", ms = 2800) {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${kind}`;
  t.setAttribute("role", "status");
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("in"));
  const kill = () => { t.classList.remove("in"); setTimeout(() => t.remove(), 260); };
  setTimeout(kill, ms);
  return kill;
}
// Toast with an Undo button — pairs with destructive actions
function toastUndo(msg, undoFn, ms = 6000) {
  let host = document.getElementById("toast-host");
  if (!host) { host = document.createElement("div"); host.id = "toast-host"; document.body.appendChild(host); }
  const t = document.createElement("div");
  t.className = "toast toast-undo";
  t.setAttribute("role", "status");
  const label = document.createElement("span");
  label.textContent = msg;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "toast-undo-btn"; btn.textContent = "Undo";
  t.append(label, btn);
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("in"));
  const kill = () => { t.classList.remove("in"); setTimeout(() => t.remove(), 260); };
  const timer = setTimeout(kill, ms);
  btn.addEventListener("click", () => { clearTimeout(timer); kill(); try { undoFn(); } catch(e) { addLog(`Undo failed: ${e.message}`); } });
  return kill;
}
// Promise-based replacement for confirm() — styled, accessible, non-blocking
function confirmSheet({ title, body = "", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "confirm-wrap";
    wrap.innerHTML = `
      <div class="confirm-backdrop" data-a="cancel"></div>
      <div class="confirm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="cs-title" aria-describedby="cs-body">
        <div class="sheet-grab" aria-hidden="true"></div>
        <h3 id="cs-title">${xe(title)}</h3>
        <p id="cs-body">${xe(body)}</p>
        <div class="confirm-actions">
          <button type="button" class="btn btnsm" data-a="cancel">${xe(cancelLabel)}</button>
          <button type="button" class="btn btnsm ${danger ? "btnd" : "btnp"}" data-a="ok">${xe(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("open"));
    const okBtn = wrap.querySelector('[data-a="ok"]');
    okBtn.focus();
    const finish = (val) => {
      wrap.classList.remove("open");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => wrap.remove(), 220);
      prevFocus?.focus?.();
      resolve(val);
    };
    wrap.addEventListener("click", e => {
      const a = e.target.dataset?.a;
      if (a) finish(a === "ok");
    });
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
      if (e.key === "Tab") {
        const f = [...wrap.querySelectorAll("button")].filter(b => b.offsetParent !== null);
        const first = f[0], last = f[f.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
  });
}

// ── Logging ───────────────────────────────────────────────────────────────────
function addLog(msg) {
  const t = new Date().toLocaleTimeString();
  logs.push(`${t} — ${msg}`);
  if (logs.length > 50) logs.shift();
  const el = document.getElementById("logbox");
  if (el && el.classList.contains("open"))
    el.innerHTML = logs.slice().reverse().map(l => `<div>${l}</div>`).join("");
  console.log("[Herd]", msg);
}
function toggleLog() {
  const el = document.getElementById("logbox");
  el.classList.toggle("open");
  if (el.classList.contains("open"))
    el.innerHTML = logs.slice().reverse().map(l => `<div>${l}</div>`).join("");
}
let lastFocusedEl = null;
function openSheetById(sheetId) {
  lastFocusedEl = document.activeElement;
  document.getElementById(sheetId).classList.add("open");
  document.getElementById("sheet-backdrop").classList.add("open");
  document.getElementById("main")?.setAttribute("inert", "");
  document.querySelector(`#${sheetId} .sheet-item`)?.focus();
  document.addEventListener("keydown", trapFocusKey);
  if (navigator.vibrate) navigator.vibrate(5);
}
function closeSheetById(sheetId) {
  const sh = document.getElementById(sheetId);
  if (!sh) return;
  sh.style.transform = "";
  sh.classList.remove("open");
  if (!document.querySelector(".sheet.open")) {
    document.getElementById("sheet-backdrop").classList.remove("open");
    document.getElementById("main")?.removeAttribute("inert");
    document.removeEventListener("keydown", trapFocusKey);
    lastFocusedEl?.focus?.();
  }
}
function openSheet() { openSheetById("more-sheet"); }
function openAddChoice() { openSheetById("add-sheet"); }
function closeAddChoice() { closeSheetById("add-sheet"); }
function closeSheet() {
  document.querySelectorAll(".sheet.open").forEach(sh => closeSheetById(sh.id));
}
function anyOverlayOpen() {
  return document.querySelector(".ov.open, .sheet.open, .photo-viewer.open, .confirm-wrap.open");
}
// Closes the top-most dismissible layer. Used by Escape, the hardware/gesture
// back button, and the backdrop.
function dismissTopLayer() {
  const confirmW = document.querySelector(".confirm-wrap.open");
  if (confirmW) { confirmW.querySelector('[data-a="cancel"]')?.click(); return true; }
  const viewer = document.querySelector(".photo-viewer.open");
  if (viewer) { closePhotoViewer && closePhotoViewer(); viewer.classList.remove("open"); return true; }
  const sheet = document.querySelector(".sheet.open");
  if (sheet) { closeSheetById(sheet.id); return true; }
  const ov = document.querySelector(".ov.open");
  if (ov) { cov(ov.id); return true; }
  return false;
}
// A2 — keep Tab inside whatever overlay is open, and restore focus on close
function currentOverlay() {
  return document.querySelector(".sheet.open, .ov.open .modal, .confirm-wrap.open .confirm-sheet");
}
function trapFocusKey(e) {
  if (e.key !== "Tab") return;
  const host = currentOverlay(); if (!host) return;
  const f = [...host.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
              .filter(el => !el.disabled && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
// Swipe-down-to-close, the gesture people naturally reach for on a bottom sheet.
// Dragging only counts when the sheet is already scrolled to its top, so it
// never fights with scrolling the list of items inside it.
(function setupSheetDrag(){
  document.querySelectorAll(".sheet").forEach(setupOneSheetDrag);
})();
function setupOneSheetDrag(sh){
  if (!sh) return;
  let startY = null, dy = 0, dragging = false;
  sh.addEventListener("touchstart", e => {
    if (!sh.classList.contains("open")) return;
    if (sh.scrollTop > 2) { dragging = false; return; }
    startY = e.touches[0].clientY; dy = 0; dragging = true;
    sh.style.transition = "none";
  }, { passive: true });
  sh.addEventListener("touchmove", e => {
    if (!dragging || startY === null) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0) sh.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sh.addEventListener("touchend", () => {
    if (!dragging) return;
    dragging = false;
    sh.style.transition = "";
    if (dy > 90) { closeSheetById(sh.id); }   // far enough — dismiss
    else { sh.style.transform = ""; }         // snap back
    startY = null; dy = 0;
  }, { passive: true });
}
// Back-compat aliases (older callers)
function openDrawer(){ openSheet(); }
function closeDrawer(){ closeSheet(); }
const PANE_IDS = ["herd","dashboard","familytree","bulk","rainbow","rehomed","breeding","rehoming","trash"];
const PAGE_TITLES = { herd:"My herd", dashboard:"Dashboard", familytree:"Family tree", bulk:"Bulk intake", rainbow:"Rainbow bridge", rehomed:"Rehomed", breeding:"Breeding checker", rehoming:"Rehoming board", trash:"Recently deleted" };
function navGo(t) {
  // Smooth cross-fade between panes where the browser supports it
  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return document.startViewTransition(() => navGoInner(t));
  }
  return navGoInner(t);
}
function navGoInner(t) {
  if (navigator.vibrate) navigator.vibrate(5);
  // Bottom-bar highlight: only herd/dashboard/familytree live on the bar
  document.querySelectorAll(".bnav-item").forEach(b => {
    const on = b.dataset.nav === t;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  const ROOT_TABS = ["herd","dashboard","familytree"];
  const title = document.getElementById("page-title");
  if (title) {
    const label = PAGE_TITLES[t] || "Herd Manager";
    title.innerHTML = ROOT_TABS.includes(t)
      ? xe(label)
      : `<button class="title-back" onclick="navGo('herd')" aria-label="Back to herd"><span aria-hidden="true">&#8249;</span></button>${xe(label)}`;
  }
  showTabById(t);
  window.scrollTo({ top: 0, behavior: "instant" });
}
function showTabById(t) {
  PANE_IDS.forEach(id => {
    const pane = document.getElementById(`pane-${id}`);
    if (!pane) return;
    pane.style.display = id===t ? "block" : "none";
    if (id===t) replayFade(pane);
  });
  if(t==="dashboard") { renderRecent(); renderViz(); renderMilestones(); renderHealth(); renderActivityList(); }
  if(t==="familytree") populateFamilyTreeSelect();
  if(t==="bulk") bulkInit();
  if(t==="breeding") populateBreed();
  if(t==="rehoming") renderBoard();
  if(t==="rainbow") renderRainbow();
  if(t==="rehomed") renderRehomed();
  if(t==="trash") renderTrash();
}
function setSync(msg, type) {
  const m = document.getElementById("smsg");
  const p = document.getElementById("spill");
  if (m) m.textContent = msg;
  if (p) p.className = `pill ${type || ""}`;
}
function showLoader(msg) {
  document.getElementById("loader-text").textContent = msg || "Loading...";
  document.getElementById("full-loader").style.display = "flex";
}
function hideLoader() {
  document.getElementById("full-loader").style.display = "none";
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
// We store the entire herd as a single JSON document in a table called 'herd'
// Row structure: { id: 1, data: [...pigs] }
// This means 1 read / 1 write per sync — negligible against Supabase free tier

async function supaReq(method, path, body) {
  const url = `${SUPA_URL}/rest/v1${path}`;
  const headers = {
    "apikey": SUPA_KEY,
    "Authorization": `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
    "Prefer": method === "POST" ? "resolution=merge-duplicates,return=minimal" : "return=minimal"
  };
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  addLog(`${method} ${path}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(timer);
    const txt = await r.text();
    addLog(`HTTP ${r.status} — ${txt.substring(0, 80)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.substring(0, 120)}`);
    return txt ? JSON.parse(txt) : null;
  } catch(e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("Request timed out after 15s");
    throw e;
  }
}

async function cloudRead() {
  // GET /herd?id=eq.1&select=data
  const res = await supaReq("GET", "/herd?id=eq.1&select=data,updated_at");
  if (Array.isArray(res) && res.length > 0 && res[0].data) {
    lastKnownUpdatedAt = res[0].updated_at || null;
    const d = res[0].data;
    // Backward compatible: older saves stored a plain pigs array directly
    if (Array.isArray(d)) return { pigs: d, pairings: [], activity: [] };
    return {
      pigs: Array.isArray(d.pigs) ? d.pigs : [],
      pairings: Array.isArray(d.pairings) ? d.pairings : [],
      activity: Array.isArray(d.activity) ? d.activity : [],
      snapshots: Array.isArray(d.snapshots) ? d.snapshots : []
    };
  }
  return null; // table empty or not yet created
}

let lastPayloadSig = "";
function payloadSig(s){ let h=0; for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;} return `${s.length}:${h}`; }
async function cloudWrite(pigsData, pairingsData, activityData) {
  // ── Conflict guard ──────────────────────────────────────────────────────
  // The whole herd is saved as one blob, so if two people edit at once the
  // last save would silently erase the other's work. Before writing, check
  // whether the cloud copy changed since WE last loaded it.
  try {
    const cur = await supaReq("GET", "/herd?id=eq.1&select=updated_at");
    const curAt = Array.isArray(cur) && cur[0] ? cur[0].updated_at : null;
    if (curAt && lastKnownUpdatedAt && curAt !== lastKnownUpdatedAt) {
      const keepMine = await confirmSheet({
        title: "\u26a0\ufe0f Sync conflict",
        body: "Someone else (probably your partner) saved changes after you last loaded the app. Saving now would overwrite their work. Keep yours, or discard your unsaved changes and load theirs?",
        confirmLabel: "Keep mine",
        cancelLabel: "Load theirs",
        danger: true
      });
      if (!keepMine) {
        await forceCloudPull(true);
        throw new Error("CONFLICT_PULLED");
      }
      addLog("Conflict overridden — local version kept");
    }
  } catch(e) {
    if (e.message === "CONFLICT_PULLED") throw e;
    // If the check itself failed (offline blip), fall through and attempt the write
  }
  const payload = { pigs: pigsData, pairings: pairingsData, activity: activityData, snapshots };
  // P1 — skip the upload entirely when nothing actually changed
  const sig = payloadSig(JSON.stringify(payload));
  if (sig === lastPayloadSig) { addLog("No changes since last sync — skipping upload"); return; }
  const stamp = new Date().toISOString();
  await supaReq("POST", "/herd?on_conflict=id", [{ id: 1, data: payload, updated_at: stamp }]);
  lastKnownUpdatedAt = stamp;
  lastPayloadSig = sig;
}

// ── Force update ──────────────────────────────────────────────────────────────
// Unregisters the service worker, deletes every cache, and reloads bypassing
// whatever the browser was holding onto. The escape hatch for "I deployed but
// I'm still seeing the old version".
async function forceUpdate() {
  try {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch(e) { /* proceed to reload regardless */ }
  location.replace(location.pathname + "?fresh=" + Date.now());
}
