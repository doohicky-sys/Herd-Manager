const APP_VERSION = "v46.1";
// True when running as an installed home-screen app on iOS/iPadOS (not an
// ordinary Safari tab). Real, confirmed reason this matters: iOS keeps a
// home-screen app's storage completely separate from Safari's — even
// though it's the same site, the app is running in its own isolated
// context, so nothing carries over from the browser and localStorage there
// is genuinely more fragile than an ordinary tab's (Apple's own tracking-
// prevention rules can expire it after a period with no direct Safari
// visits, and a full "remove from home screen" wipes it outright — neither
// has anything to do with Private Browsing or a privacy toggle).
function isStandaloneApp() {
  try {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  } catch(e) { return false; }
}
// ── Config ────────────────────────────────────────────────────────────────────
const SUPA_URL  = "https://zpbvscpbnazqdsrxbovi.supabase.co";
const SUPA_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwYnZzY3BibmF6cWRzcnhib3ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNDYzMDcsImV4cCI6MjA5NDgyMjMwN30.NhoY86X5tpXDPrUqkxpuqxqader3gk_ACsR-0S1Zk_A";
// IMGBB_KEY removed — it now lives ONLY server-side, in the Cloudflare Pages
// environment variable of the same name, read inside functions/imgbb-upload.js.
// See that file for the proxy that 02-photos.js now calls instead of ImgBB
// directly. NOTE: the Supabase anon key above is designed to be public and,
// per Supabase's own model, it is meant to stay world-readable — the anon
// key is not a secret. What actually protects the data is Row Level
// Security (RLS) on the `herd` table plus real sign-in (see js/00-auth.js):
// once RLS is on, this key alone grants no access at all — every request
// also needs a valid user session token, obtained by signing in.
const LOCAL_KEY = "gp_local_v13";

// ── Species config (additive multi-species foundation) ──────────────────────
// Every animal now carries a `species` field. This does NOT change the app's
// behaviour today — guinea pigs remain the only species in active use, and
// this migration is fully backward-compatible (see migrateSpeciesField() in
// 03-storage.js, which defaults any existing/imported animal with no species
// to "guinea-pig"). What it DOES do is stop "Sow"/"Boar" and similar terms
// being hardcoded directly into render strings — they now come from this
// lookup, so a future species (dog, horse, etc.) is a config entry away
// rather than a find-and-replace across the whole render layer. Full
// multi-species UI (a species picker, per-species fields, breed lists) is
// intentionally NOT part of this change — that's real scoped work for
// later; this just makes the data model and terminology ready for it.
const SPECIES_CONFIG = {
  "guinea-pig": {
    label: "Guinea Pig", labelPlural: "Guinea Pigs", emoji: "&#128057;",
    sexLabels: { female: "Sow", male: "Boar" },
    sexIcons:  { female: "&#9792;", male: "&#9794;" },
    traits: { roan: true },
    breedExamples: "Teddy, Smooth, Cali&#8230;",
    // Gestation figures from veterinary references (PMC clinical reference
    // table + multiple veterinary-sourced sources, cross-checked). "avg" is
    // what the due-date calculator centres its estimate on; "min"/"max" mark
    // the realistic earliest/latest window so an estimate is shown as a
    // RANGE, not a single falsely-precise date — actual births vary
    // genuinely this much litter to litter.
    gestation: { min: 59, avg: 65, max: 72 }
  },
  "rabbit": {
    label: "Rabbit", labelPlural: "Rabbits", emoji: "&#128007;",
    sexLabels: { female: "Doe", male: "Buck" },
    sexIcons:  { female: "&#9792;", male: "&#9794;" },
    traits: { roan: false },
    breedExamples: "Netherland Dwarf, Lop, Rex&#8230;",
    gestation: { min: 28, avg: 31, max: 35 }
  },
  "ferret": {
    label: "Ferret", labelPlural: "Ferrets", emoji: "&#129446;",
    sexLabels: { female: "Jill", male: "Hob" },
    sexIcons:  { female: "&#9792;", male: "&#9794;" },
    traits: { roan: false },
    breedExamples: "Sable, Albino, Silver Mitt&#8230;",
    gestation: { min: 39, avg: 41, max: 42 }
  },
  "dog": {
    label: "Dog", labelPlural: "Dogs", emoji: "&#128021;",
    // "Bitch" is the technically correct breeder term, but it's also a
    // common insult and several breeder-facing sources note people avoid
    // saying it day-to-day — this app's existing labels (Sow, Doe, Jill)
    // are everyday-use words, not formal registry terms, so "Female" is
    // the more consistent choice here rather than forcing the technical
    // term in for its own sake.
    sexLabels: { female: "Female", male: "Male" },
    sexIcons:  { female: "&#9792;", male: "&#9794;" },
    traits: { roan: false },
    breedExamples: "Labrador, Spaniel, Collie&#8230;",
    // VCA Animal Hospitals (genuine veterinary source): 57-65 days, average 63.
    gestation: { min: 57, avg: 63, max: 65 }
  },
  "horse": {
    label: "Horse", labelPlural: "Horses", emoji: "&#128014;",
    sexLabels: { female: "Mare", male: "Stallion" },
    sexIcons:  { female: "&#9792;", male: "&#9794;" },
    // Shown instead of the ordinary male label whenever an animal's
    // `altered` flag is set — see speciesHasTrait/sexLabel below for how
    // this hooks in. Only males need an override: horse breeders don't use
    // a distinct one-word term for a spayed mare the way they do for a
    // gelding, so female stays "Mare" either way.
    alteredLabels: { male: "Gelding" },
    traits: { roan: false },
    breedExamples: "Thoroughbred, Cob, Shetland&#8230;",
    // PetMD (genuine veterinary source): ~340 days average, 320-370 day
    // range — the widest of any species in this app by a large margin, so
    // the due-date UI needs to handle a several-week-wide window gracefully
    // rather than assume a tight range like the smaller mammals have.
    gestation: { min: 320, avg: 340, max: 370 }
  }
};
const DEFAULT_SPECIES = "guinea-pig";
function speciesConfig(key) { return SPECIES_CONFIG[key] || SPECIES_CONFIG[DEFAULT_SPECIES]; }
// Small text helpers so copy like "No pigs match your filters" or
// "Add one pig" reads correctly for whichever species tab is open, without
// hardcoding "pig"/"pigs" at every single call site (which is exactly how
// three separate places were missed and shipped saying "pig" regardless of
// the active species). speciesNoun(key) → lowercase singular ("guinea pig",
// "rabbit", "ferret"); speciesNounPlural(key) → lowercase plural.
function speciesNoun(key) {
  const cfg = speciesConfig(key);
  return cfg.label.toLowerCase();
}
function speciesNounPlural(key) {
  const cfg = speciesConfig(key);
  return cfg.labelPlural.toLowerCase();
}
// Gates species-specific traits (e.g. roan carrier is a real guinea pig
// genetics concern; it should not appear at all on a rabbit's profile,
// rather than showing and just always reading "No"). Add new gated traits
// here rather than scattering `if (species === "guinea-pig")` checks
// through the render layer — one place decides what each species has.
function speciesHasTrait(species, trait) {
  const cfg = speciesConfig(species);
  return !!(cfg.traits && cfg.traits[trait]);
}

// ── Icon system ───────────────────────────────────────────────────────────
// Replaces the app's previous icon-by-emoji approach (58 distinct emoji,
// 87 uses) with real SVG icons from Lucide (ISC licence — free to use and
// embed). Emoji render differently on every device (George's Android and
// your partner's iPhone would never show pixel-identical icons), can't be
// recoloured to match the app's palette, and can't be sized precisely —
// all three of those are fixed by using real vector icons that inherit
// currentColor and scale cleanly at any size.
//
// The three SPECIES icons (🐹 guinea pig, 🐇 rabbit, 🦦 ferret used for
// ferrets) are deliberately KEPT as emoji, not converted — they're the
// app's identity marks, and a line-drawn rodent silhouette would lose the
// warmth that makes them work as a face for the app. Every other icon
// below is a genuine UI icon and has been converted.
const ICONS = {
  "bar-chart-3": `<path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />`,
  "cake": `<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" /><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" /><path d="M2 21h20" /><path d="M7 8v3" /><path d="M12 8v3" /><path d="M17 8v3" /><path d="M7 4h.01" /><path d="M12 4h.01" /><path d="M17 4h.01" />`,
  "calendar": `<path d="M8 2v3" /><path d="M16 2v3" /><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" />`,
  "camera": `<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /><circle cx="12" cy="13" r="3" />`,
  "check": `<path d="M20 6 9 17l-5-5" />`,
  "chevron-down": `<path d="m6 9 6 6 6-6" />`,
  "clipboard-list": `<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />`,
  "dna": `<path d="m10 16 1.5 1.5" /><path d="m14 8-1.5-1.5" /><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" /><path d="m16.5 10.5 1 1" /><path d="m17 6-2.891-2.891" /><path d="M2 15c6.667-6 13.333 0 20-6" /><path d="m20 9 .891.891" /><path d="M3.109 14.109 4 15" /><path d="m6.5 12.5 1 1" /><path d="m7 18 2.891 2.891" /><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />`,
  "file-text": `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />`,
  "heart": `<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />`,
  "home": `<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />`,
  "lightbulb": `<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" />`,
  "network": `<rect x="16" y="16" width="6" height="6" rx="1" /><rect x="2" y="16" width="6" height="6" rx="1" /><rect x="9" y="2" width="6" height="6" rx="1" /><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" /><path d="M12 12V8" />`,
  "package": `<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /><path d="M12 22V12" /><polyline points="3.29 7 12 12 20.71 7" /><path d="m7.5 4.27 9 5.15" />`,
  "party-popper": `<path d="M5.8 11.3 2 22l10.7-3.79" /><path d="M4 3h.01" /><path d="M22 8h.01" /><path d="M15 2h.01" /><path d="M22 20h.01" /><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10" /><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17" /><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7" /><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z" />`,
  "printer": `<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" />`,
  "rainbow": `<path d="M22 17a10 10 0 0 0-20 0" /><path d="M6 17a6 6 0 0 1 12 0" /><path d="M10 17a2 2 0 0 1 4 0" />`,
  "refresh-cw": `<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />`,
  "scroll": `<path d="M15 12h-5" /><path d="M15 8h-5" /><path d="M19 17V5a2 2 0 0 0-2-2H4" /><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />`,
  "search": `<path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" />`,
  "sparkle": `<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />`,
  "sparkles": `<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /><path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" />`,
  "stethoscope": `<path d="M11 2v2" /><path d="M5 2v2" /><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" /><path d="M8 15a6 6 0 0 0 12 0v-3" /><circle cx="20" cy="10" r="2" />`,
  "tag": `<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />`,
  "trash-2": `<path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />`,
  "users": `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" />`,
  "x": `<path d="M18 6 6 18" /><path d="m6 6 12 12" />`,};
// Renders one icon as an inline <svg>. size in px (default 18, matching the
// app's existing small-icon usage), colour defaults to "currentColor" so it
// automatically matches whatever text colour surrounds it — exactly the
// behaviour emoji could never have.
function icon(name, size, extraClass) {
  const paths = ICONS[name];
  if (!paths) { console.warn("[Herd] unknown icon:", name); return ""; }
  const s = size || 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon${extraClass?" "+extraClass:""}" aria-hidden="true" focusable="false">${paths}</svg>`;
}

// ── Collapsible profile sections ─────────────────────────────────────────
// The animal profile grew one card per feature added over many sessions
// (Weight, Health, Family, Pairing, Litters) until a breeding female's
// profile could show 7 full sections stacked open at once. Rather than add
// an 8th (Location) and make that worse, secondary sections now collapse
// by default — expanded on tap — while "About" (core identity info) stays
// open, matching the standard accordion-design guidance that the most
// important section should be visible without any interaction needed.
//
// `open` defaults to false (collapsed) unless explicitly passed true.
// `badge` is optional short text shown next to the label even while
// collapsed (e.g. a count), so you can tell at a glance whether a
// collapsed section actually has anything in it before tapping.
function accordionSection(label, bodyHTML, open, badge) {
  const id = `acc${Math.random().toString(36).slice(2,9)}`;
  return `<div class="ig-accordion${open?" ig-accordion-open":""}">
    <button type="button" class="ig-accordion-head" aria-expanded="${open?"true":"false"}" aria-controls="${id}" onclick="toggleAccordion(this)">
      <span class="ig-label" style="margin:0">${xe(label)}${badge?` <span class="ig-accordion-badge">${xe(badge)}</span>`:""}</span>
      ${icon("chevron-down",18,"ig-accordion-chevron")}
    </button>
    <div class="ig-accordion-body" id="${id}">${bodyHTML}</div>
  </div>`;
}
function toggleAccordion(headBtn) {
  const section = headBtn.closest(".ig-accordion");
  if (!section) return;
  const nowOpen = section.classList.toggle("ig-accordion-open");
  headBtn.setAttribute("aria-expanded", nowOpen ? "true" : "false");
}

// ── Active species (which tab the user is currently viewing) ────────────────
// Persisted so switching tabs, closing the app, or reopening it later keeps
// you on whichever species you were last looking at rather than always
// resetting to guinea pigs.
let activeSpecies = (function(){
  try { return localStorage.getItem("gp_active_species") || DEFAULT_SPECIES; }
  catch(e) { return DEFAULT_SPECIES; }
})();
function setActiveSpecies(key) {
  if (!SPECIES_CONFIG[key]) return;
  activeSpecies = key;
  try { localStorage.setItem("gp_active_species", key); } catch(e) {}
  renderSpeciesSwitcher();
  renderAll();
}
function renderSpeciesSwitcher() {
  const btn = document.getElementById("species-dropdown-btn");
  const currentLabel = document.getElementById("species-dropdown-current");
  const panel = document.getElementById("species-dropdown-panel");
  if (!btn || !currentLabel || !panel) return;
  const keys = Object.keys(SPECIES_CONFIG);
  if (keys.length < 2) { btn.style.display = "none"; panel.innerHTML = ""; return; } // nothing to switch between yet
  btn.style.display = "";
  const cfg = speciesConfig(activeSpecies);
  currentLabel.innerHTML = `<span aria-hidden="true">${cfg.emoji}</span> ${xe(cfg.labelPlural)}`;
  panel.innerHTML = keys.map(k => {
    const c = SPECIES_CONFIG[k];
    const on = k === activeSpecies;
    return `<button type="button" role="option" aria-selected="${on}" class="species-dropdown-item${on?" species-dropdown-item-on":""}" onclick="chooseSpecies('${xe(k)}')">
      <span aria-hidden="true">${c.emoji}</span> ${xe(c.labelPlural)}${on?` ${icon("check",16)}`:""}
    </button>`;
  }).join("");
}
function toggleSpeciesDropdown() {
  const btn = document.getElementById("species-dropdown-btn");
  const panel = document.getElementById("species-dropdown-panel");
  if (!btn || !panel) return;
  const open = panel.classList.toggle("open");
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) renderSpeciesSwitcher(); // ensure the panel's contents are current every time it's opened, not just relying on whatever the last renderAll() left behind
}
function closeSpeciesDropdown() {
  const btn = document.getElementById("species-dropdown-btn");
  const panel = document.getElementById("species-dropdown-panel");
  if (panel) panel.classList.remove("open");
  if (btn) btn.setAttribute("aria-expanded", "false");
}
function chooseSpecies(key) {
  closeSpeciesDropdown();
  setActiveSpecies(key);
}
// Tapping anywhere outside the dropdown closes it — same "tap outside to
// dismiss" convention as every other transient panel in the app. Checked
// against a real press (mousedown/touchstart), same reasoning as the
// backdrop guard elsewhere: only trust a genuine outside tap, not just any
// click event, so this can't misfire the same way the old filter sheet did.
document.addEventListener("click", (e) => {
  const panel = document.getElementById("species-dropdown-panel");
  const btn = document.getElementById("species-dropdown-btn");
  if (!panel || !panel.classList.contains("open")) return;
  if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeSpeciesDropdown();
});
// Keeps the ➕ button's "Add one pig" / "Bulk intake" sheet correctly worded
// for whichever species tab is active. Runs from renderAll() so it's correct
// on first load and after every species switch, not just when the sheet
// happens to be opened.
function renderAddSheetText() {
  const cfg = speciesConfig(activeSpecies);
  const iconEl = document.getElementById("add-sheet-icon");
  const oneEl = document.getElementById("add-sheet-one");
  const bulkSubEl = document.getElementById("add-sheet-bulk-sub");
  if (iconEl) iconEl.innerHTML = cfg.emoji;
  if (oneEl) oneEl.textContent = `Add one ${cfg.label.toLowerCase()}`;
  if (bulkSubEl) bulkSubEl.textContent = `Add many ${cfg.labelPlural.toLowerCase()} at once from a list`;
}
// Fills every static icon placeholder in index.html (the More sheet, bottom
// nav, and dashboard section headers) with its real SVG. These are all
// species-INDEPENDENT (unlike renderAddSheetText/renderStaticSpeciesText,
// which change per species tab), so this only genuinely needs to run once
// on boot — but running it every time renderAll() fires is harmless
// (setting the same innerHTML twice costs nothing noticeable) and far
// simpler than tracking whether it's already run.
function renderStaticIcons() {
  const map = {
    "icon-bulk-1": "package", "icon-rehoming": "clipboard-list",
    "icon-rainbow": "rainbow", "icon-rehomed": "home", "icon-bulk-2": "package",
    "icon-trash": "trash-2", "icon-print-1": "printer", "icon-tag": "tag",
    "icon-camera": "camera", "icon-optimise": "sparkle", "icon-refresh": "refresh-cw",
    "icon-dashboard": "bar-chart-3", "icon-family": "network",
    "icon-calendar": "calendar", "icon-health": "stethoscope",
    "icon-activity": "file-text", "icon-print-2": "printer", "icon-locations": "home", "icon-cleanup": "refresh-cw"
  };
  for (const [id, iconName] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = icon(iconName, 18);
  }
}
// Keeps every remaining STATIC piece of HTML (things index.html writes once,
// that no per-tab render function already rewrites) correctly worded for
// the active species. Runs from renderAll() alongside the other species-text
// refreshers, so it's correct on first load and after every species switch.
function renderStaticSpeciesText() {
  const cfg = speciesConfig(activeSpecies);
  const noun = speciesNoun(activeSpecies), nounPlural = speciesNounPlural(activeSpecies);
  const female = cfg.sexLabels.female, male = cfg.sexLabels.male;

  const addBtn = document.getElementById("bnav-add-label");
  if (addBtn) addBtn.setAttribute("aria-label", `Add ${nounPlural}`);

  const fsearchLabel = document.getElementById("fsearch-label");
  if (fsearchLabel) fsearchLabel.textContent = `Search ${nounPlural}`;

  const fsexF = document.getElementById("fsex-f-opt");
  const fsexM = document.getElementById("fsex-m-opt");
  if (fsexF) fsexF.textContent = female + "s";
  if (fsexM) fsexM.textContent = male + "s";

  const ftSearchLabel = document.getElementById("ft-search-label");
  if (ftSearchLabel) ftSearchLabel.textContent = `Search ${nounPlural}`;
  const ftSearchInput = document.getElementById("ft-search");
  if (ftSearchInput) ftSearchInput.placeholder = `Search for a ${noun}\u2026`;

  const rehomingIntro = document.getElementById("rehoming-intro");
  if (rehomingIntro) rehomingIntro.innerHTML = `${icon("clipboard-list",16,"icon-inline")} Every ${xe(noun)} marked "for rehome" moves through this pipeline. Tap a card to open their profile and manage details there.`;
  const trashIntro = document.getElementById("trash-intro");
  if (trashIntro) trashIntro.innerHTML = `${icon("trash-2",16,"icon-inline")} Deleted ${xe(nounPlural)} are kept here for 30 days, then removed permanently. Restore anytime before then.`;
  const rainbowIntro = document.getElementById("rainbow-intro");
  if (rainbowIntro) rainbowIntro.innerHTML = `&#127752; ${xe(cfg.labelPlural)} marked as passed rest here. Records are preserved but separated from the active herd.`;
  const rehomedIntro = document.getElementById("rehomed-intro");
  if (rehomedIntro) rehomedIntro.innerHTML = `${icon("home",16,"icon-inline")} ${xe(cfg.labelPlural)} that have been rehomed live here. Records are kept for reference.`;

  const bsowLabel = document.getElementById("bsow-label");
  const bboarLabel = document.getElementById("bboar-label");
  const bsowOpt = document.getElementById("bsow-opt");
  const bboarOpt = document.getElementById("bboar-opt");
  if (bsowLabel) bsowLabel.textContent = female;
  if (bboarLabel) bboarLabel.textContent = male;
  if (bsowOpt) bsowOpt.textContent = `Select ${female.toLowerCase()}\u2026`;
  if (bboarOpt) bboarOpt.textContent = `Select ${male.toLowerCase()}\u2026`;
  const breedingIntro = document.getElementById("breeding-intro");
  if (breedingIntro) breedingIntro.textContent = `Select a ${female.toLowerCase()} and ${male.toLowerCase()} to check for Roan or relation conflicts before pairing.`;
  // The breeding checker's whole purpose is a Roan-conflict warning — Roan
  // is a guinea-pig-specific genetic trait, so for every other species this
  // screen has nothing meaningful to say. Hide the menu entry point rather
  // than let someone go through the flow to find nothing happens; the
  // in-app relation-conflict check (shared ancestor warnings) is arguably
  // useful for any species, but that's a bigger redesign than a menu-item
  // visibility fix, so left as a known follow-up rather than attempted here.
  const breedingItem = document.getElementById("breeding-checker-item");
  if (breedingItem) breedingItem.style.display = speciesHasTrait(activeSpecies, "roan") ? "" : "none";
}
// ── Filter sheet: custom tap-to-choose chips, replacing native <select> ────
// Fix for a real, repeatedly-confirmed bug: opening ANY dropdown inside the
// filter sheet closed the whole sheet, on both Android Chrome and iOS
// Safari. The cause is a documented cross-browser mobile quirk — when a
// native <select> picker is dismissed, the browser can deliver a synthetic
// "light-dismiss" click to whatever's underneath the tap location, and on
// a swipeable sheet that landed on the backdrop. An earlier attempt guarded
// the backdrop's click handler against exactly this, and it held up in
// every test here — but the bug persisted on real devices regardless,
// which means guarding the SYMPTOM wasn't enough; the real fix is removing
// the native picker from this specific sheet entirely, since it's the only
// place in the app using one inside something swipe-to-dismiss.
//
// This reads each hidden <select>'s own <option> elements as the source of
// truth for labels/values — so the existing species-terminology code
// above (which already updates those options' text) doesn't need to know
// or care that the visible UI changed; it just keeps working.
function renderFilterChipFields() {
  const fields = ["fsex", "froan", "faltered", "fst", "fsort"];
  fields.forEach(id => {
    const select = document.getElementById(id);
    const container = document.getElementById(id + "-chips");
    if (!select || !container) return;
    const options = [...select.options];
    container.innerHTML = options.map(opt => {
      const on = opt.value === select.value;
      return `<button type="button" role="radio" aria-checked="${on}" class="fs-chip${on?" fs-chip-on":""}" onclick="pickFilterChip('${xe(id)}','${xe(opt.value)}')">${xe(opt.textContent)}</button>`;
    }).join("");
  });
  // Roan is a guinea-pig-specific genetic trait — hide the whole filter
  // field for every other species rather than offer a filter that can
  // never match anything. Altered, by contrast, is shown for every
  // species: p.altered is a real, universal field regardless of what
  // kind of animal it is, so it always means something.
  const roanField = document.getElementById("froan-field");
  if (roanField) roanField.style.display = speciesHasTrait(activeSpecies, "roan") ? "" : "none";
}
// Called when a chip is tapped: updates the hidden <select>'s value (so
// every existing filter/sort function keeps reading the same data it
// always has), re-draws every field's chips to reflect the new selection,
// and runs the filter — all without ever touching a native picker, so
// there's nothing left that can trigger the backdrop bug.
function pickFilterChip(selectId, value) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.value = value;
  renderFilterChipFields();
  applyFilters();
  if (navigator.vibrate) navigator.vibrate(5);
}
// ── Shared "is this animal active, and in the species I'm currently viewing"
// filter. Previously every list/stat/dashboard function duplicated its own
// `!p.deleted && !p.dead && !p.rehomed` condition inline (15 separate call
// sites) — introducing rabbits meant every single one of those needed a
// species check added too, and missing even one would mean a rabbit
// silently appearing in a guinea pig stat, or vice versa. This is now the
// one place that decides "active AND correct species"; existing call sites
// are being switched over to it one at a time in this same change.
function isActiveInCurrentSpecies(p) {
  if (!p || p.deleted || p.dead || p.rehomed) return false;
  const species = p.species || DEFAULT_SPECIES;
  return species === activeSpecies;
}
function sexLabel(p) {
  const cfg = speciesConfig(p && p.species);
  // Altered-status override (e.g. "Gelding" for a neutered male horse) —
  // only applies where a species config actually defines one for that sex;
  // every other species has no alteredLabels at all, so this is a no-op
  // for them and their existing Sow/Doe/Jill/Female labels are untouched.
  if (p && p.altered && cfg.alteredLabels && cfg.alteredLabels[p.s]) return cfg.alteredLabels[p.s];
  return cfg.sexLabels[p && p.s] || (p && p.s === "female" ? "Female" : "Male");
}
function sexIcon(p) {
  const cfg = speciesConfig(p && p.species);
  return cfg.sexIcons[p && p.s] || "";
}
// One-time, non-destructive migration: any animal without a `species` field
// (i.e. every animal that existed before this feature) is stamped with the
// default. Follows the same pattern/contract as repairFamilyLinks() —
// returns true only if something actually changed, so the caller knows
// whether a save is needed.
function migrateSpeciesField() {
  let migrated = 0;
  pigs.forEach(p => {
    if (!p.species) { p.species = DEFAULT_SPECIES; migrated++; }
  });
  if (migrated) {
    addLog(`Species migration: ${migrated} animal(s) defaulted to ${DEFAULT_SPECIES}`);
    return true;
  }
  return false;
}

// ── State ─────────────────────────────────────────────────────────────────────
let pigs = [];
let pairings = [];
let locations = [];
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
// ── Save confirmation pulse ────────────────────────────────────────────────
// For flows where someone saves the SAME kind of record repeatedly and
// quickly (weighing a whole litter one at a time, editing several animals
// in a row) — a text toast is fine, but it asks the eyes to leave the
// button and read something elsewhere. This gives the button itself a
// brief, unmistakable "saved" state right where the thumb already is:
// checkmark + colour morph to the ok/green tokens, then reverts. Reads
// peripherally, no reading required, works even if hands are half-busy
// with an animal. Pairs with a real vibration where the device supports it
// — the fully eyes-free version of the same signal.
function pulseButtonSuccess(btn) {
  if (!btn) return;
  if (navigator.vibrate) { try { navigator.vibrate(12); } catch(e) {} }
  const original = btn.innerHTML;
  const wasDisabled = btn.disabled;
  btn.disabled = true;
  btn.classList.add("btn-pulse-ok");
  btn.innerHTML = "&#10003;";
  setTimeout(() => {
    btn.classList.remove("btn-pulse-ok");
    btn.innerHTML = original;
    btn.disabled = wasDisabled;
  }, 900);
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
  // Same safety-net reasoning as cov() in 11-app.js: don't let a pending
  // save sit on the debounce timer if the person's just closed the sheet
  // it was queued from.
  if (typeof flushSave === "function" && typeof pendingSave !== "undefined" && pendingSave) {
    flushSave();
  }
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
// ── Backdrop tap-to-close, guarded against synthetic dismissal clicks ───────
// Fix for: tapping ANY dropdown inside a sheet (e.g. the Filter sheet's Sex/
// Roan/Status/Sort selects) closed the whole sheet, on both Android Chrome
// and iOS Safari.
//
// Root cause: when a native <select> picker is dismissed (after choosing an
// option, or even just closing it), mobile browsers can deliver a
// SYNTHETIC "light-dismiss" click to whatever sits underneath the tap
// location on the page — with no real mousedown/touchstart preceding it on
// that element. The backdrop covers the full screen behind an open sheet,
// so a select sitting inside the sheet is still visually "on top of" the
// backdrop's screen area; the synthetic click lands there and, with a bare
// onclick="closeSheet()", closes everything. This is a documented,
// cross-browser mobile quirk (not specific to iOS or Android), which is
// why the fix has to hold regardless of which platform is real.
//
// Fix: only close on a click whose PRESS (mousedown/touchstart) we
// genuinely observed starting on the backdrop itself. A synthetic
// dismissal click has no matching real press, so it's ignored.
(function guardBackdropClose(){
  const backdrop = document.getElementById("sheet-backdrop");
  if (!backdrop) return;
  let realPressSeen = false;
  const markRealPress = () => { realPressSeen = true; };
  backdrop.addEventListener("mousedown", markRealPress);
  backdrop.addEventListener("touchstart", markRealPress, { passive: true });
  backdrop.addEventListener("click", (e) => {
    if (!realPressSeen) return;  // no real press observed — likely a synthetic post-picker click
    realPressSeen = false;
    closeSheet();
  });
})();
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
//
// BUGFIX (filter-sheet closing on select tap): the drag listener used to be
// bound to touchstart on the WHOLE sheet element. That meant tapping a native
// <select> — which lives inside the sheet, not the backdrop — also started a
// drag gesture. On mobile, opening a <select>'s native picker UI doesn't
// always deliver a clean touchend back to the page (the OS intercepts it for
// its own overlay), so `dragging` could be left true, or ordinary finger
// jitter during the tap produced a touchmove with a `dy` big enough to cross
// the 90px close threshold — slamming the whole sheet shut. This was never a
// backdrop-bubbling issue: #sheet-backdrop is a sibling of .sheet, not an
// ancestor of the <select>, so stopPropagation() on the selects would not
// have touched the real cause.
//
// Fix: only the dedicated `.sheet-grab` handle (the little pill at the top of
// every sheet) can START a drag gesture now. Interactive controls anywhere
// else in the sheet — <select>, <input>, <button>, <textarea>, <a> — are
// explicitly excluded even if a drag is somehow already in progress, so a tap
// on a dropdown can never be reinterpreted as a swipe-to-close.
(function setupSheetDrag(){
  document.querySelectorAll(".sheet").forEach(setupOneSheetDrag);
})();
function setupOneSheetDrag(sh){
  if (!sh) return;
  const grab = sh.querySelector(".sheet-grab");
  const isInteractive = el => !!(el && el.closest && el.closest("select, input, textarea, button, a, label"));
  let startY = null, dy = 0, dragging = false;

  const onTouchStart = e => {
    if (!sh.classList.contains("open")) return;
    // Only the grab handle may initiate a drag. Also refuse to start if the
    // touch landed on any interactive control, belt-and-braces.
    if (e.target !== grab && (!grab || !grab.contains(e.target))) {
      if (isInteractive(e.target)) { dragging = false; return; }
      // Non-grab, non-interactive area (e.g. sheet padding/background):
      // still allow drag only when already scrolled to the top, matching
      // the previous "don't fight list scrolling" behaviour.
      if (sh.scrollTop > 2) { dragging = false; return; }
    }
    startY = e.touches[0].clientY; dy = 0; dragging = true;
    sh.style.transition = "none";
  };
  const onTouchMove = e => {
    if (!dragging || startY === null) return;
    if (isInteractive(e.target)) { dragging = false; sh.style.transform = ""; return; }
    dy = e.touches[0].clientY - startY;
    if (dy > 0) sh.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = () => {
    if (!dragging) return;
    dragging = false;
    sh.style.transition = "";
    if (dy > 90) { closeSheetById(sh.id); }   // far enough — dismiss
    else { sh.style.transform = ""; }         // snap back
    startY = null; dy = 0;
  };

  sh.addEventListener("touchstart", onTouchStart, { passive: true });
  sh.addEventListener("touchmove", onTouchMove, { passive: true });
  sh.addEventListener("touchend", onTouchEnd, { passive: true });
  sh.addEventListener("touchcancel", onTouchEnd, { passive: true });
}
// Back-compat aliases (older callers)
function openDrawer(){ openSheet(); }
function closeDrawer(){ closeSheet(); }
const PANE_IDS = ["herd","dashboard","familytree","bulk","rainbow","rehomed","breeding","rehoming","trash","locations"];
const PAGE_TITLES = { herd:"My herd", dashboard:"Dashboard", familytree:"Family tree", bulk:"Bulk intake", rainbow:"Rainbow bridge", rehomed:"Rehomed", breeding:"Breeding checker", rehoming:"Rehoming board", trash:"Recently deleted", locations:"Locations" };
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
  if(t==="dashboard") { renderMenagerie(); renderRecent(); renderViz(); renderMilestones(); renderHealth(); renderActivityList(); }
  if(t==="familytree") populateFamilyTreeSelect();
  if(t==="bulk") bulkInit();
  if(t==="breeding") populateBreed();
  if(t==="rehoming") renderBoard();
  if(t==="rainbow") renderRainbow();
  if(t==="rehomed") renderRehomed();
  if(t==="trash") renderTrash();
  if(t==="locations") renderLocationsList();
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
  // The anon key still goes in the "apikey" header — Supabase requires that
  // on every request regardless of auth state, it's how it knows which
  // project you mean. What actually authorises the request now is the
  // "Authorization" bearer token: a signed-in user's own session token,
  // not the shared public key. authGetSession() returns null if nobody's
  // signed in (or refreshes an expiring token if they are), so a request
  // made with no valid session fails fast with a clear error rather than
  // silently falling back to the old shared-key behaviour.
  const session = typeof authGetSession === "function" ? await authGetSession() : null;
  if (!session) throw new Error("Not signed in");
  const headers = {
    "apikey": SUPA_KEY,
    "Authorization": `Bearer ${session.access_token}`,
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
    if (r.status === 401 || r.status === 403) {
      // Session token was rejected outright (revoked, or RLS denied it) —
      // this device is not actually signed in as far as the server's
      // concerned, whatever authSession still holds locally. Force back to
      // the login gate rather than looping on requests that will never
      // succeed.
      if (typeof authSaveSession === "function") authSaveSession(null);
      if (typeof showLoginGate === "function") showLoginGate("Your session expired — please sign in again.");
      throw new Error(`HTTP ${r.status}: session expired or not authorised`);
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.substring(0, 120)}`);
    return txt ? JSON.parse(txt) : null;
  } catch(e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("Request timed out after 15s");
    throw e;
  }
}

let lastKnownRev = null;
async function cloudRead() {
  // GET /herd?id=eq.1&select=data,rev
  const res = await supaReq("GET", "/herd?id=eq.1&select=data,updated_at,rev");
  if (Array.isArray(res) && res.length > 0 && res[0].data) {
    lastKnownUpdatedAt = res[0].updated_at || null;
    lastKnownRev = typeof res[0].rev === "number" ? res[0].rev : null;
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
  // last save would silently erase the other's work. This used to compare
  // the row's `updated_at` timestamp, but two writes landing within the
  // same clock tick (or a clock skewed between devices) could both read the
  // same timestamp and both believe they were first — a real gap in an
  // optimistic-concurrency check. `rev` is an integer that only this
  // function increments, by exactly 1, on every successful write, so "did
  // it change since I read it" becomes an exact integer comparison instead
  // of a timestamp that two different writers could coincidentally share.
  // Falls back to the old timestamp comparison only if `rev` genuinely
  // isn't available yet (e.g. this row was read before the column existed
  // in this session), so a partial rollout never leaves the guard disabled.
  try {
    const cur = await supaReq("GET", "/herd?id=eq.1&select=updated_at,rev");
    const row = Array.isArray(cur) && cur[0] ? cur[0] : null;
    const curAt = row ? row.updated_at : null;
    const curRev = row && typeof row.rev === "number" ? row.rev : null;
    const revKnown = lastKnownRev !== null && curRev !== null;
    const changed = revKnown ? curRev !== lastKnownRev
                              : (curAt && lastKnownUpdatedAt && curAt !== lastKnownUpdatedAt);
    if (changed) {
      // A conflict genuinely CAN mean a real partner edit — but if this
      // device's local storage isn't working, lastKnownRev/lastKnownUpdatedAt
      // never survive between app loads either, so every fresh load looks
      // like a "conflict" even with nobody else involved. If it isn't
      // working, report the REAL, DIRECTLY-MEASURED localStorage usage for
      // this site (not navigator.storage.estimate() — confirmed that API
      // does not cover localStorage at all in Chrome/Firefox, so it was
      // reporting an unrelated system's numbers and calling them relevant
      // here, which was genuinely misleading rather than just imprecise).
      let storageNote = "";
      try {
        localStorage.setItem("__gp_probe__", "1"); localStorage.removeItem("__gp_probe__");
      } catch(_) {
        let totalKB = null;
        try {
          let totalChars = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            totalChars += (k?.length || 0) + (localStorage.getItem(k)?.length || 0);
          }
          totalKB = (totalChars / 1024).toFixed(0);
        } catch(_2) {}
        storageNote = ` (This device's local storage isn't working right now${totalKB !== null ? ` — it currently holds about ${totalKB}KB for this site` : ""}, which is the likely reason — not necessarily a real conflict.)`;
      }
      const keepMine = await confirmSheet({
        title: "\u26a0\ufe0f Sync conflict",
        body: `Someone else (possibly your partner) may have saved changes after you last loaded the app, OR this could be a local storage issue on this device.${storageNote} Saving now would overwrite whatever's actually on the cloud right now. Keep yours, or load what's there instead?`,
        confirmLabel: "Keep mine",
        cancelLabel: "Load theirs",
        danger: true
      });
      if (!keepMine) {
        await forceCloudPull(true);
        throw new Error("CONFLICT_PULLED");
      }
      addLog("Conflict overridden — local version kept");
      // Re-read the current rev so the write below targets the row as it
      // actually stands right now, rather than immediately re-triggering
      // this same conflict check against a rev we already know is stale.
      lastKnownRev = curRev;
      lastKnownUpdatedAt = curAt;
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
  const nextRev = (lastKnownRev !== null ? lastKnownRev : 0) + 1;
  await supaReq("POST", "/herd?on_conflict=id", [{ id: 1, data: payload, updated_at: stamp, rev: nextRev }]);
  lastKnownUpdatedAt = stamp;
  lastKnownRev = nextRev;
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
