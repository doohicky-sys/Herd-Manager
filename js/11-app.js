// ── Misc ──────────────────────────────────────────────────────────────────────
function cov(id) {
  const ov = document.getElementById(id);
  if (!ov) return;
  ov.classList.remove("open");
  // Flush any pending save immediately on close, rather than leave it to
  // the 1.5s debounce timer or a visibilitychange/pagehide event that may
  // never fire. Real bug this fixes: uploading a photo calls save() the
  // instant the file is picked (not on a "Save" button tap), so someone
  // who uploads a photo and then taps the × to close — without ever
  // pressing Save, and without switching apps or tabs — could genuinely
  // close this sheet before the debounced write ever reached local storage
  // or the cloud. The photo would show correctly until the next reload,
  // then vanish, because nothing had actually persisted it yet.
  if (typeof flushSave === "function" && typeof pendingSave !== "undefined" && pendingSave) {
    flushSave();
  }
  // restore page interactivity + focus once nothing is open
  if (!document.querySelector(".ov.open, .sheet.open")) {
    document.getElementById("main")?.removeAttribute("inert");
    document.removeEventListener("keydown", trapFocusKey);
    lastFocusedEl?.focus?.();
  }
}
// A2 — when any overlay opens, give it dialog semantics, trap Tab inside it,
// and move focus in. Done via observer so every existing call site benefits.
const overlayObserver = new MutationObserver(muts => {
  muts.forEach(m => {
    const el = m.target;
    if (!el.classList || !el.classList.contains("ov")) return;
    if (el.classList.contains("open")) {
      lastFocusedEl = lastFocusedEl || document.activeElement;
      const modal = el.querySelector(".modal");
      if (modal) {
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("tabindex", "-1");
        const focusTarget = modal.querySelector("input,select,textarea,button") || modal;
        setTimeout(() => focusTarget.focus?.(), 60);
      }
      document.getElementById("main")?.setAttribute("inert", "");
      document.addEventListener("keydown", trapFocusKey);
    }
  });
});
document.querySelectorAll(".ov").forEach(ov =>
  overlayObserver.observe(ov, { attributes: true, attributeFilter: ["class"] }));
// Slide the bottom nav out of the way whenever any modal overlay or bottom
// sheet is open, so it never covers Save/Confirm buttons.
const navHider = new MutationObserver(() => {
  const anyOpen = document.querySelector(".ov.open, .sheet.open, .photo-viewer.open");
  document.body.classList.toggle("overlay-open", !!anyOpen);
});
navHider.observe(document.body, { attributes:true, subtree:true, attributeFilter:["class"] });
// ── Overlay backdrop tap-to-close, same synthetic-click guard as the sheet
// backdrop (see guardBackdropClose in 01-core.js for the full explanation).
// The Edit form (#ov-edit) has real <select> elements inside it (sex, roan
// status, herd status), so it's exposed to the identical risk: a native
// picker's dismissal can deliver a synthetic click to the .ov background
// underneath, and the old e.target===e.currentTarget check alone doesn't
// rule that out — the synthetic click's target can still resolve to the
// overlay itself. Requiring a real preceding press closes that gap.
const __ovRealPress = new WeakSet();
document.querySelectorAll(".ov").forEach(ov => {
  const mark = () => __ovRealPress.add(ov);
  ov.addEventListener("mousedown", mark);
  ov.addEventListener("touchstart", mark, { passive: true });
});
function cbg(e,id) {
  const ov = e.currentTarget;
  if (e.target !== e.currentTarget) return;
  if (!__ovRealPress.has(ov)) return;  // no real press seen — likely a synthetic post-picker click
  __ovRealPress.delete(ov);
  cov(id);
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { dismissTopLayer(); return; }
  // ← / → page through profiles while one is open
  const detail = document.getElementById("ov-detail");
  if (detail && detail.classList.contains("open") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    // Selects by POSITION within the pager rather than matching aria-label
    // text — the label itself is now species-aware ("Previous rabbit" /
    // "Previous ferret" / etc.), so a hardcoded '"...pig"' match would have
    // silently stopped working for every species except guinea pigs.
    const pager = detail.querySelector(".pf-pager");
    const btn = pager && pager.querySelectorAll(".pf-pager-btn")[e.key === "ArrowLeft" ? 0 : 1];
    if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
  }
});
function replayFade(pane) {
  pane.classList.remove("tab-pane");
  void pane.offsetWidth; // force reflow so the animation restarts
  pane.classList.add("tab-pane");
}
function showTab(t, btn) { navGo(t); }
function renderAll() {
  if (typeof _gridDebounce !== "undefined") clearTimeout(_gridDebounce);
  try { renderSpeciesSwitcher(); renderStats(); renderGrid(); renderSpotlight(); renderNeedsAttention(); renderAddSheetText(); renderStaticSpeciesText(); renderStaticIcons(); renderFilterChipFields(); }
  catch(e) {
    // B5 — a silent catch used to leave stale content on screen with no clue why
    addLog(`Render error: ${e.message}`);
    console.error("[Herd] render failure", e);
    setSync("⚠ Display error — tap for details", "err");
    if (typeof toast === "function") toast("Something failed to display. Tap the status pill for details.", "err", 5000);
  }
}

// ── Pull-to-refresh ───────────────────────────────────────────────────────────
// Only active on the herd tab, only triggers when already scrolled to the top
// of the page (so it never fights with normal scrolling through the grid).
(function setupPullToRefresh(){
  let startY = null, pulling = false, triggered = false;
  const ind = document.getElementById("ptr-indicator");
  const spinner = document.getElementById("ptr-spinner");
  const text = document.getElementById("ptr-text");
  const THRESHOLD = 70;

  function isHerdTabActive() {
    const herdPane = document.getElementById("pane-herd");
    return herdPane && herdPane.style.display !== "none";
  }
  // Never hijack a drag that belongs to a bottom sheet, modal or photo viewer —
  // dragging those down should just close them, not refresh the whole app.
  function overlayIsOpen() {
    return !!document.querySelector(".ov.open, .sheet.open, .photo-viewer.open");
  }
  function insideOverlay(target) {
    return !!(target && target.closest && target.closest(".sheet, .modal, .ov, .photo-viewer, .bnav"));
  }

  document.addEventListener("touchstart", e => {
    if (overlayIsOpen() || insideOverlay(e.target) || !isHerdTabActive() || window.scrollY > 4) {
      startY = null; pulling = false; return;
    }
    startY = e.touches[0].clientY;
    pulling = true; triggered = false;
  }, { passive: true });

  document.addEventListener("touchmove", e => {
    if (!pulling || startY === null) return;
    if (overlayIsOpen()) { pulling = false; ind.classList.remove("show"); ind.style.height = ""; return; }
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { ind.classList.remove("show"); return; }
    const pull = Math.min(dy, 110);
    ind.classList.add("show");
    ind.style.height = `${Math.min(pull, 56)}px`;
    if (pull >= THRESHOLD && !triggered) {
      triggered = true;
      text.textContent = "Release to refresh";
      spinner.classList.add("spin");
    } else if (pull < THRESHOLD && triggered) {
      triggered = false;
      text.textContent = "Pull to refresh";
      spinner.classList.remove("spin");
    }
  }, { passive: true });

  document.addEventListener("touchend", async () => {
    if (!pulling) return;
    pulling = false;
    if (triggered) {
      text.textContent = "Refreshing\u2026";
      spinner.classList.add("spin");
      await forceCloudPull(true);
      text.textContent = "Pull to refresh";
    }
    spinner.classList.remove("spin");
    ind.classList.remove("show");
    ind.style.height = "";
    startY = null; triggered = false;
  }, { passive: true });
})();

// ── Go! ───────────────────────────────────────────────────────────────────────
init();

// ── Splash ────────────────────────────────────────────────────────────────────
// Shown only on a cold start, never on tab switches, and always removed from
// the DOM afterwards so it can't trap focus or swallow taps.
(function retireSplash(){
  const el = document.getElementById("splash");
  if (!el) return;
  const kill = () => { el.classList.add("done"); el.remove(); };
  setTimeout(kill, 1700);
  // If anything goes wrong with the animation, never leave it covering the app
  window.addEventListener("pageshow", () => { if (document.getElementById("splash")) setTimeout(kill, 200); });
})();

// ── Back button / back gesture ────────────────────────────────────────────────
// Any open layer (sheet, modal, photo viewer, confirm) becomes a history entry,
// so the phone's back gesture closes it instead of leaving the app.
let _layerDepth = 0;
function pushLayerState() {
  _layerDepth++;
  history.pushState({ herdLayer: _layerDepth }, "");
}
window.addEventListener("popstate", () => {
  if (anyOverlayOpen()) {
    // Consume the back press by closing the top layer
    dismissTopLayer();
    _layerDepth = Math.max(0, _layerDepth - 1);
  }
});
// Hook every layer-opening path without touching each call site
(function watchLayers(){
  const seen = new WeakSet();
  const obs = new MutationObserver(muts => {
    muts.forEach(m => {
      const el = m.target;
      if (!el.classList) return;
      const isLayer = el.classList.contains("ov") || el.classList.contains("sheet")
                   || el.classList.contains("photo-viewer") || el.classList.contains("confirm-wrap");
      if (!isLayer) return;
      if (el.classList.contains("open")) {
        if (!seen.has(el)) { seen.add(el); pushLayerState(); }
      } else {
        seen.delete(el);
      }
    });
  });
  obs.observe(document.body, { attributes:true, subtree:true, attributeFilter:["class"] });
})();
