// ── Pairings & due-date calculator ─────────────────────────────────────────
// Uses the existing `pairings` array (already saved/loaded/synced correctly
// everywhere — see 01-core.js/03-storage.js — but never connected to any UI
// until now). A pairing records that two animals were put together on a
// given date, so an expected due-date window can be calculated from each
// species' real gestation length (see SPECIES_CONFIG in 01-core.js).
//
// Shape of one pairing record:
//   {
//     id: "pr<timestamp>",
//     species: "guinea-pig" | "rabbit" | "ferret",
//     femaleId, maleId,       // pig ids
//     pairedDate: "YYYY-MM-DD",
//     status: "active" | "born" | "ended",
//     outcomeDate: "YYYY-MM-DD" | null,   // set when marked born/ended
//     notes: ""
//   }

// Returns { min, avg, max } as ISO date strings, or null if the pairing/
// species data is missing something needed to calculate.
function pairingDueDates(pairing) {
  if (!pairing || !pairing.pairedDate) return null;
  const cfg = speciesConfig(pairing.species);
  if (!cfg.gestation) return null;
  const base = new Date(pairing.pairedDate + "T00:00:00");
  if (isNaN(base.getTime())) return null;
  const addDays = (d, n) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toISOString().slice(0, 10);
  };
  return {
    min: addDays(base, cfg.gestation.min),
    avg: addDays(base, cfg.gestation.avg),
    max: addDays(base, cfg.gestation.max)
  };
}
// Days from today until the AVERAGE due date (negative = overdue). Used by
// both the profile display and the Needs Attention surfacing logic, so both
// always agree on what "due soon" or "overdue" means.
function daysUntilDue(pairing) {
  const dates = pairingDueDates(pairing);
  if (!dates) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dates.avg + "T00:00:00");
  return Math.round((due - today) / 86400000);
}
function ensurePairingsArray() {
  if (!Array.isArray(pairings)) pairings = [];
  return pairings;
}
// Every currently-active pairing for one animal (as either parent), most
// recent first. An animal can only sensibly be in one ACTIVE pairing at a
// time for the due-date maths to mean anything, but past/ended pairings are
// kept for the record rather than deleted.
function activePairingsFor(pigId) {
  return ensurePairingsArray()
    .filter(pr => pr.status === "active" && (pr.femaleId === pigId || pr.maleId === pigId));
}
function allPairingsFor(pigId) {
  return ensurePairingsArray()
    .filter(pr => pr.femaleId === pigId || pr.maleId === pigId)
    .sort((a,b) => String(b.pairedDate||"").localeCompare(String(a.pairedDate||"")));
}
// Validates a proposed pairing before it's ever written. Returns a plain
// string error message, or null if everything checks out. Kept as pure
// validation (no side effects) so the UI can call it before showing a
// confirm step, and so it's independently testable.
function validatePairing(femaleId, maleId, pairedDate) {
  if (!femaleId || !maleId) return "Choose both animals.";
  if (femaleId === maleId) return "Choose two different animals.";
  const female = pigs.find(p => p.id === femaleId);
  const male = pigs.find(p => p.id === maleId);
  if (!female || !male) return "Couldn't find one of those animals.";
  if (female.s !== "female") return `${female.n || "The first animal"} isn't recorded as female.`;
  if (male.s !== "male") return `${male.n || "The second animal"} isn't recorded as male.`;
  const femaleSpecies = female.species || DEFAULT_SPECIES;
  const maleSpecies = male.species || DEFAULT_SPECIES;
  if (femaleSpecies !== maleSpecies) return "Both animals need to be the same species.";
  if (!pairedDate) return "Enter the date they were paired.";
  const d = new Date(pairedDate + "T00:00:00");
  if (isNaN(d.getTime())) return "That date doesn't look right.";
  if (d.getTime() > Date.now()) return "That date is in the future.";
  if (activePairingsFor(femaleId).length) return `${female.n || "This female"} already has an active pairing recorded.`;
  return null;
}
function recordPairing(femaleId, maleId, pairedDate, notes) {
  const err = validatePairing(femaleId, maleId, pairedDate);
  if (err) { toast(err, "err"); return null; }
  const female = pigs.find(p => p.id === femaleId);
  const pairing = {
    id: `pr${Date.now()}`,
    species: female.species || DEFAULT_SPECIES,
    femaleId, maleId,
    pairedDate,
    status: "active",
    outcomeDate: null,
    notes: (notes || "").trim()
  };
  ensurePairingsArray().push(pairing);
  const male = pigs.find(p => p.id === maleId);
  logActivity(`${icon("heart",14,"icon-inline")} ${xe(female.n)} paired with ${xe(male?.n||"?")}`);
  save();
  return pairing;
}
function endPairing(pairingId, outcome) {
  const pr = ensurePairingsArray().find(x => x.id === pairingId);
  if (!pr) return;
  pr.status = outcome === "born" ? "born" : "ended";
  pr.outcomeDate = new Date().toISOString().slice(0, 10);
  const female = pigs.find(p => p.id === pr.femaleId);
  logActivity(outcome === "born"
    ? `${icon("cake",14,"icon-inline")} ${xe(female?.n||"?")}'s litter arrived`
    : `${xe(female?.n||"?")}'s pairing was ended without a litter`);
  save();
}

// ── Profile card ─────────────────────────────────────────────────────────
// Only rendered for females (see the call site in openDetail, 10-profile.js
// — mirrors exactly how the female-only Litters section already works).
// Always shows a real card, even with zero pairing history — matching the
// existing Weight card's pattern ("No weights recorded yet." + a button to
// add the first one) rather than the Needs Attention card's "show nothing
// until relevant" pattern. The difference: Weight and Pairing are both
// things you actively RECORD per animal, so the entry point to start needs
// to always be reachable — unlike Needs Attention, which is a passive
// summary that has nothing useful to say until there's a real concern.
function pairingCardHTML(p) {
  const history = allPairingsFor(p.id);
  const active = history.find(pr => pr.status === "active");
  const past = history.filter(pr => pr !== active);
  return `
  <div class="ig-card">
    ${active ? pairingActiveBlockHTML(active) : ""}
    ${!active && !past.length ? `<div class="ig-free" style="color:var(--text2)">No pairings recorded yet.</div>` : ""}
    ${past.length ? `
      <div class="wt-list">${past.map(pr => {
        const male = pigs.find(x => x.id === pr.maleId);
        const statusWord = pr.status === "born" ? "Litter arrived" : "Ended, no litter";
        return `<div class="wt-row"><span>${xe(pr.pairedDate)} with ${xe(male?.n||"?")}</span><span>${xe(statusWord)}</span></div>`;
      }).join("")}</div>
    ` : ""}
    <div class="ig-free">${active
      ? `<button class="btn btnsm" onclick="openPairingOutcome('${xe(active.id)}')">Record outcome</button>`
      : `<button class="btn btnsm" onclick="openPairingAdd('${xe(p.id)}')">${icon("heart",16)} Record a pairing</button>`}</div>
  </div>`;
}
// Small helper so the profile-assembly code can decide the accordion badge
// text without duplicating this active/past logic a second time.
function pairingStatusBadge(p) {
  const history = allPairingsFor(p.id);
  if (history.find(pr => pr.status === "active")) return "active";
  if (history.length) return `${history.length}`;
  return "";
}
function pairingActiveBlockHTML(pr) {
  const male = pigs.find(x => x.id === pr.maleId);
  const dates = pairingDueDates(pr);
  const days = daysUntilDue(pr);
  const cfg = speciesConfig(pr.species);
  let statusLine;
  if (days === null) statusLine = "";
  else if (days > 1) statusLine = `Due in about ${days} days`;
  else if (days === 1) statusLine = "Due tomorrow";
  else if (days === 0) statusLine = "Due today";
  else statusLine = `${Math.abs(days)} day${Math.abs(days)===1?"":"s"} overdue \u2014 worth a closer look`;
  return `
    <div class="wt-head">
      <div>
        <div class="wt-now" style="font-size:var(--fs-xl)">${statusLine}</div>
        <div class="wt-when">Paired with ${xe(male?.n||"?")} on ${xe(pr.pairedDate)}</div>
      </div>
    </div>
    ${dates ? `<div class="ig-row"><span class="ig-key">Due window</span><span class="ig-val">${xe(dates.min)} \u2013 ${xe(dates.max)}</span></div>` : ""}
    ${pr.notes ? `<div class="ig-row"><span class="ig-key">Notes</span><span class="ig-val">${xe(pr.notes)}</span></div>` : ""}
  `;
}

// ── Add-pairing form ────────────────────────────────────────────────────
function openPairingAdd(femaleId) {
  const female = pigs.find(p => p.id === femaleId); if (!female) return;
  const species = female.species || DEFAULT_SPECIES;
  const males = pigs.filter(p => isActiveInCurrentSpecies(p) && p.s === "male" && (p.species||DEFAULT_SPECIES) === species);
  cov("ov-detail");
  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit');openDetail('${xe(femaleId)}')" aria-label="Close">&#10005;</button>
    <div class="mt">Record a pairing &mdash; ${xe(female.n)}</div>
    <div class="f"><label>Paired with</label><select id="pr-male">
      <option value="">Select a ${xe(speciesConfig(species).sexLabels.male.toLowerCase())}&#8230;</option>
      ${males.map(m => `<option value="${xe(m.id)}">${xe(m.n||"Unnamed")}</option>`).join("")}
    </select></div>
    <div class="f"><label>Date paired</label><input type="date" id="pr-date" value="${new Date().toISOString().slice(0,10)}" max="${new Date().toISOString().slice(0,10)}"></div>
    <div class="f"><label>Notes (optional)</label><textarea id="pr-notes" placeholder="Anything worth remembering&#8230;"></textarea></div>
    <div class="ma">
      <button class="btn btnsm" onclick="cov('ov-edit');openDetail('${xe(femaleId)}')">Cancel</button>
      <button class="btn btnp btnsm" id="pr-save" onclick="savePairingAdd('${xe(femaleId)}')">Record pairing</button>
    </div>`;
  document.getElementById("ov-edit").classList.add("open");
}
function savePairingAdd(femaleId) {
  const maleId = document.getElementById("pr-male").value;
  const pairedDate = document.getElementById("pr-date").value;
  const notes = document.getElementById("pr-notes").value;
  const pairing = recordPairing(femaleId, maleId, pairedDate, notes);
  if (!pairing) return; // recordPairing already toasted the specific error
  const saveBtn = document.getElementById("pr-save");
  if (saveBtn) pulseButtonSuccess(saveBtn);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cov("ov-edit"); openDetail(femaleId);
    toast("Pairing recorded \u2713");
  }));
}

// ── Outcome form (for an active pairing) ────────────────────────────────
function openPairingOutcome(pairingId) {
  const pr = ensurePairingsArray().find(x => x.id === pairingId); if (!pr) return;
  const female = pigs.find(p => p.id === pr.femaleId); if (!female) return;
  cov("ov-detail");
  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit');openDetail('${xe(female.id)}')" aria-label="Close">&#10005;</button>
    <div class="mt">Pairing outcome &mdash; ${xe(female.n)}</div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:14px">Paired ${xe(pr.pairedDate)}. What happened?</p>
    <div class="ma" style="flex-direction:column;align-items:stretch;gap:8px">
      <button class="btn btnp btnsm" onclick="finishPairingOutcome('${xe(pr.id)}','born')">${icon("cake",16)} Litter arrived &mdash; log it below</button>
      <button class="btn btnsm" onclick="finishPairingOutcome('${xe(pr.id)}','ended')">Ended without a litter</button>
      <button class="btn btnsm" onclick="cov('ov-edit');openDetail('${xe(female.id)}')">Cancel</button>
    </div>`;
  document.getElementById("ov-edit").classList.add("open");
}
function finishPairingOutcome(pairingId, outcome) {
  const pr = ensurePairingsArray().find(x => x.id === pairingId); if (!pr) return;
  const femaleId = pr.femaleId;
  endPairing(pairingId, outcome);
  cov("ov-edit");
  openDetail(femaleId);
  if (outcome === "born") {
    toast("Recorded \u2014 don't forget to log the litter below \u2713", "ok", 4500);
  } else {
    toast("Pairing ended", "ok");
  }
}
