// ── Health log ───────────────────────────────────────────────────────────
// Per-animal medical record, stored directly on the pig object (same
// pattern as `weights` — see pigWeights()/latestWeight() in 06-features.js
// for the precedent this follows). Each entry:
//   { id, d: "YYYY-MM-DD", type: "vaccination"|"treatment"|"illness"|"vet-visit"|"other",
//     note: "", reminderDate: "YYYY-MM-DD" | null }
//
// reminderDate is optional — set it when something recurs (a booster due
// in 6 months, a follow-up check) and it'll surface in Needs Attention
// exactly like an overdue litter does, using the same "within 7 days or
// overdue" threshold so the two features feel consistent rather than
// each inventing its own rule for what counts as "soon".

const HEALTH_TYPES = {
  "vaccination": { label: "Vaccination", icon: "stethoscope" },
  "treatment":   { label: "Treatment",   icon: "stethoscope" },
  "illness":     { label: "Illness",     icon: "stethoscope" },
  "vet-visit":   { label: "Vet visit",   icon: "stethoscope" },
  "other":       { label: "Other",       icon: "stethoscope" }
};
function healthLogFor(p) {
  return Array.isArray(p.healthLog) ? p.healthLog.filter(h => h && h.d && h.type) : [];
}
function ensureHealthLog(p) {
  if (!Array.isArray(p.healthLog)) p.healthLog = [];
  return p.healthLog;
}
// Every animal (in the currently active species) with a reminder that's
// due within 7 days or already overdue — the same threshold and framing
// used for due-soon litters, so Needs Attention reads consistently
// regardless of which kind of concern it's showing.
function healthRemindersDue() {
  const today = new Date(); today.setHours(0,0,0,0);
  const out = [];
  pigs.filter(isActiveInCurrentSpecies).forEach(p => {
    healthLogFor(p).forEach(h => {
      if (!h.reminderDate) return;
      const due = new Date(h.reminderDate + "T00:00:00");
      if (isNaN(due.getTime())) return;
      const days = Math.round((due - today) / 86400000);
      if (days <= 7) out.push({ p, entry: h, days });
    });
  });
  return out;
}
function addHealthEntry(pigId, type, date, note, reminderDate) {
  const p = pigs.find(x => x.id === pigId);
  if (!p) return null;
  if (!HEALTH_TYPES[type]) { toast("Choose a type.", "err"); return null; }
  if (!date) { toast("Enter a date.", "err"); return null; }
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) { toast("That date doesn't look right.", "err"); return null; }
  if (reminderDate) {
    const rd = new Date(reminderDate + "T00:00:00");
    if (isNaN(rd.getTime())) { toast("That reminder date doesn't look right.", "err"); return null; }
  }
  const entry = {
    id: `hl${Date.now()}`,
    d: date,
    type,
    note: (note || "").trim(),
    reminderDate: reminderDate || null
  };
  ensureHealthLog(p).push(entry);
  p.healthLog.sort((a,b) => String(a.d).localeCompare(String(b.d)));
  logActivity(`${icon("stethoscope",14,"icon-inline")} ${xe(HEALTH_TYPES[type].label)} logged for ${xe(p.n)}`);
  save();
  return entry;
}
function deleteHealthEntry(pigId, entryId) {
  const p = pigs.find(x => x.id === pigId);
  if (!p || !Array.isArray(p.healthLog)) return;
  p.healthLog = p.healthLog.filter(h => h.id !== entryId);
  save();
}

// ── Profile card ─────────────────────────────────────────────────────────
// Shown for every animal (unlike the pairing card, which is female-only —
// health records apply regardless of sex). Same "always show a real card,
// even empty" convention as Weight and Pairing.
function healthCardHTML(p) {
  const log = healthLogFor(p).slice().reverse(); // most recent first
  return `
  <div class="ig-card">
    ${log.length ? `
      <div class="wt-list">${log.slice(0,6).map(h => {
        const typeInfo = HEALTH_TYPES[h.type] || HEALTH_TYPES.other;
        const reminderBit = h.reminderDate ? ` &middot; reminder ${xe(h.reminderDate)}` : "";
        return `<div class="wt-row"><span>${xe(h.d)} &mdash; ${xe(typeInfo.label)}${h.note?`: ${xe(h.note)}`:""}${reminderBit}</span><button class="btn btnsm" onclick="deleteHealthEntry('${xe(p.id)}','${xe(h.id)}');cov('ov-edit');openDetail('${xe(p.id)}')" aria-label="Delete entry">${icon("x",14)}</button></div>`;
      }).join("")}</div>
      ${log.length > 6 ? `<div class="ig-free" style="color:var(--text2);font-size:12px">+ ${log.length-6} earlier entries</div>` : ""}
    ` : `<div class="ig-free" style="color:var(--text2)">No health records yet.</div>`}
    <div class="ig-free"><button class="btn btnsm" onclick="openHealthAdd('${xe(p.id)}')">${icon("stethoscope",16)} Log a health record</button></div>
  </div>`;
}
function openHealthAdd(pigId) {
  const p = pigs.find(x => x.id === pigId); if (!p) return;
  cov("ov-detail");
  const typeOptions = Object.entries(HEALTH_TYPES).map(([key,info]) => `<option value="${key}">${xe(info.label)}</option>`).join("");
  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit');openDetail('${xe(pigId)}')" aria-label="Close">&#10005;</button>
    <div class="mt">Log a health record &mdash; ${xe(p.n)}</div>
    <div class="twocol">
      <div class="f"><label>Type</label><select id="hl-type">${typeOptions}</select></div>
      <div class="f"><label>Date</label><input type="date" id="hl-date" value="${new Date().toISOString().slice(0,10)}"></div>
    </div>
    <div class="f"><label>Note (optional)</label><textarea id="hl-note" placeholder="e.g. Annual booster, given by Dr. Patel&#8230;"></textarea></div>
    <div class="f"><label>Remind me again on (optional)</label><input type="date" id="hl-reminder"></div>
    <p style="font-size:12px;color:var(--text2);margin:-4px 0 4px">${icon("calendar",14,"icon-inline")} Useful for boosters or follow-ups &mdash; it'll show up in Needs Attention when it's close.</p>
    <div class="ma">
      <button class="btn btnsm" onclick="cov('ov-edit');openDetail('${xe(pigId)}')">Cancel</button>
      <button class="btn btnp btnsm" id="hl-save" onclick="saveHealthAdd('${xe(pigId)}')">Save</button>
    </div>`;
  document.getElementById("ov-edit").classList.add("open");
}
function saveHealthAdd(pigId) {
  const type = document.getElementById("hl-type").value;
  const date = document.getElementById("hl-date").value;
  const note = document.getElementById("hl-note").value;
  const reminderDate = document.getElementById("hl-reminder").value;
  const entry = addHealthEntry(pigId, type, date, note, reminderDate || null);
  if (!entry) return; // addHealthEntry already toasted the specific error
  const saveBtn = document.getElementById("hl-save");
  if (saveBtn) pulseButtonSuccess(saveBtn);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cov("ov-edit"); openDetail(pigId);
    toast("Health record saved \u2713");
  }));
}
