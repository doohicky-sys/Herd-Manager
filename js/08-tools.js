// ── Milestones widget ─────────────────────────────────────────────────────────
function renderMilestones() {
  const el = document.getElementById("milestone-list");
  const items = [];
  const now = new Date();
  // Upcoming birthdays (within 14 days) for active pigs with a DOB
  pigs.filter(p=>isActiveInCurrentSpecies(p)&&p.d).forEach(p => {
    const dob = new Date(p.d);
    const thisYearBday = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
    if (thisYearBday < now) thisYearBday.setFullYear(now.getFullYear()+1);
    const daysAway = Math.ceil((thisYearBday-now)/86400000);
    if (daysAway <= 14) {
      const turning = thisYearBday.getFullYear() - dob.getFullYear();
      items.push({ icon: icon("cake",18), text: `${xe(p.n)} turns <strong>${turning}</strong> on ${thisYearBday.toLocaleDateString()}${daysAway===0?" &mdash; today!":daysAway===1?" &mdash; tomorrow!":""}`, sortKey: thisYearBday, urgent: false });
    }
  });
  items.sort((a,b)=>a.sortKey-b.sortKey);
  el.innerHTML = items.length
    ? items.slice(0,8).map(it => `<div class="milestone-item">
        <div class="milestone-icon" style="${it.urgent?'background:var(--err-bg)':''}">${it.icon}</div>
        <div class="milestone-text">${it.text}</div>
      </div>`).join("")
    : `<div class="milestones-empty">No upcoming milestones right now.</div>`;
}
function renderActivityList() {
  const el = document.getElementById("activity-list");
  el.innerHTML = activity.length
    ? activity.slice(0,40).map(a => `<div class="activity-item">
        <div class="activity-dot"></div>
        <div class="activity-text">${a.text}</div>
        <div class="activity-time">${timeAgo(a.ts)}</div>
      </div>`).join("")
    : `<div class="milestones-empty">No activity recorded yet.</div>`;
}
function timeAgo(iso) {
  const d = new Date(iso), n = new Date();
  const mins = Math.floor((n-d)/60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins/60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs/24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

// ── Print herd quick-reference ───────────────────────────────────────────────
function printHerdSheet() {
  const active = pigs.filter(isActiveInCurrentSpecies);
  const cfgP = speciesConfig(activeSpecies);
  const showRoan = speciesHasTrait(activeSpecies, "roan");
  const rows = active.map(p => `<tr>
    <td>${xe(p.n)}</td>
    <td>${sexLabel(p)}</td>
    <td>${xe(p.br||"")}</td>
    <td>${getAge(p.d)}</td>
    ${showRoan ? `<td>${p.r==="yes"?"Roan":"&mdash;"}</td>` : ""}
    <td>${p.st==="stock"?"Stock":"For rehome"}</td>
  </tr>`).join("");
  const html = `<!DOCTYPE html><html><head><title>${xe(cfgP.labelPlural)} Quick Reference</title>
  <style>
    body{font-family:Arial,sans-serif;padding:24px;color:#111}
    h1{font-size:20px;margin-bottom:4px}
    p{font-size:12px;color:#555;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{text-align:left;background:#eee;padding:6px 8px;border-bottom:2px solid #999}
    td{padding:5px 8px;border-bottom:1px solid #ddd}
    tr:nth-child(even){background:#f7f7f7}
  </style></head><body>
  <h1>${xe(cfgP.labelPlural)} &mdash; Quick Reference</h1>
  <p>Printed ${new Date().toLocaleDateString()} &middot; ${active.length} active ${active.length===1?xe(speciesNoun(activeSpecies)):xe(speciesNounPlural(activeSpecies))}</p>
  <table><thead><tr><th>Name</th><th>Sex</th><th>Breed</th><th>Age</th>${showRoan?"<th>Roan</th>":""}<th>Status</th></tr></thead>
  <tbody>${rows}</tbody></table>
  </body></html>`;
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ── Export / Import ───────────────────────────────────────────────────────────
function doExport() {
  // FIXED: previously exported ONLY `pigs`, silently leaving out the
  // activity log and the snapshot history behind the dashboard charts — so
  // restoring from a backup would quietly lose both, with no warning.
  const payload = { pigs, pairings, activity, snapshots, locations, exportedAt: new Date().toISOString(), appVersion: typeof APP_VERSION !== "undefined" ? APP_VERSION : "" };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `herd-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  addLog(`Exported ${pigs.length} animals, ${activity.length} activity entries, ${snapshots.length} snapshots`);
}

// ── Import validation ─────────────────────────────────────────────────────────
// Never trust a file. Every field is coerced to a known-safe shape, and any id
// that isn't plain alphanumeric is regenerated — this is what stops a crafted
// backup from injecting markup or script into inline event handlers.
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
function newId() { return `p${Date.now()}${Math.random().toString(36).slice(2,7)}`; }
function sanitisePig(raw) {
  const str = (v, max=2000) => typeof v === "string" ? v.slice(0, max) : "";
  const url = v => (typeof v === "string" && /^https?:\/\//.test(v)) ? v.slice(0, 500) : "";
  const iso = v => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) ? v.slice(0,10) : "";
  const out = {
    id: SAFE_ID.test(raw.id || "") ? raw.id : newId(),
    n: str(raw.n, 120),
    s: raw.s === "male" ? "male" : "female",
    d: iso(raw.d),
    br: str(raw.br, 120),
    de: str(raw.de, 500),
    notes: str(raw.notes, 4000),
    rel: str(raw.rel, 1000),
    r: raw.r === "yes" ? "yes" : "no",
    st: raw.st === "rehome" ? "rehome" : "stock",
    species: (typeof raw.species === "string" && SPECIES_CONFIG[raw.species]) ? raw.species : DEFAULT_SPECIES,
    dead: !!raw.dead,
    rehomed: !!raw.rehomed,
    photo: url(raw.photo) || (typeof raw.photo === "string" && raw.photo.startsWith("data:image") ? raw.photo : ""),
    photoThumb: url(raw.photoThumb),
    litters: Array.isArray(raw.litters) ? raw.litters.slice(0,200).map(l => ({
      date: iso(l && l.date), size: str(l && l.size, 10), notes: str(l && l.notes, 500)
    })) : [],
    weights: Array.isArray(raw.weights) ? raw.weights.slice(0,500)
      .filter(w => w && /^\d{4}-\d{2}-\d{2}$/.test(w.d||"") && !isNaN(parseFloat(w.g)))
      .map(w => ({ d: w.d, g: parseFloat(w.g) })) : [],
    family: Array.isArray(raw.family) ? raw.family.slice(0,200)
      .filter(f => f && SAFE_ID.test(f.pigId || ""))
      .map(f => ({ pigId: f.pigId, relation: str(f.relation, 40) })) : []
  };
  if (raw.deleted) { out.deleted = true; out.deletedAt = iso(raw.deletedAt) || new Date().toISOString(); }
  if (raw.deadAt) out.deadAt = iso(raw.deadAt);
  if (raw.photoOpt) out.photoOpt = 1;
  if (raw.rh && typeof raw.rh === "object") {
    const rh = raw.rh;
    out.rh = {
      stage: ["available","reserved","deposit","collected"].includes(rh.stage) ? rh.stage : "available",
      ownerName: str(rh.ownerName, 120), contact: str(rh.contact, 120), address: str(rh.address, 400),
      deposit: str(rh.deposit, 20), total: str(rh.total, 20), paid: str(rh.paid, 20),
      notes: str(rh.notes, 2000),
      history: Array.isArray(rh.history) ? rh.history.slice(0,100).map(h => ({
        stage: str(h && h.stage, 20), at: iso(h && h.at)
      })) : []
    };
  }
  return out;
}

async function handleImportFile(e) {
  closeDrawer();
  const file = e.target.files[0]; if (!file) return;
  const ok = await confirmSheet({
    title: "Import this file?",
    body: "This replaces ALL current records and syncs to the cloud. A backup of your current herd will be downloaded first.",
    confirmLabel: "Import", danger: true
  });
  if (!ok) { e.target.value=""; return; }
  showLoader("Reading file…");
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const raw = ev.target.result.trim().replace(/^\uFEFF/,"");
      const data = JSON.parse(raw);
      // Accept two shapes: an old-style plain array (backups made before
      // this fix — still fully supported so nothing you've already
      // downloaded stops working), or the new full-backup object that also
      // carries activity and snapshot history.
      let rawPigs, importedPairings = null, importedActivity = null, importedSnapshots = null, importedLocations = null;
      if (Array.isArray(data)) {
        rawPigs = data;
      } else if (data && typeof data === "object" && Array.isArray(data.pigs)) {
        rawPigs = data.pigs;
        if (Array.isArray(data.pairings)) importedPairings = data.pairings;
        if (Array.isArray(data.activity)) importedActivity = data.activity;
        if (Array.isArray(data.snapshots)) importedSnapshots = data.snapshots;
        if (Array.isArray(data.locations)) importedLocations = data.locations;
      } else {
        throw new Error("Not a valid herd backup file");
      }
      let valid = rawPigs.filter(p => p && typeof p === "object").map(sanitisePig);
      // Upload any embedded base64 photos to ImgBB
      let done = 0;
      let photoFailures = 0;
      for (let i = 0; i < valid.length; i++) {
        if (valid[i].photo && valid[i].photo.startsWith("data:image")) {
          showLoader(`Uploading photos… (${done+1}/${valid.filter(p=>p.photo&&p.photo.startsWith("data:image")).length})`);
          const up = await uploadToImgBB(valid[i].photo);
          if (up.ok) {
            valid[i].photo = up.url; valid[i].photoThumb = up.thumb;
          } else {
            // Unlike a live photo pick (handlePhoto in 10-profile.js), a
            // backup import has no "just try again" moment — this photo
            // data only exists in the file being imported right now, so
            // losing the reference entirely would mean losing the photo
            // for good. Genuinely keep the embedded copy here rather than
            // drop it, but count it so the person is told plainly which
            // animals need a fresh photo re-upload once things are calmer,
            // rather than this failing completely silently.
            photoFailures++;
            addLog(`Photo upload failed during import for ${valid[i].n || "an animal"}: ${up.error}`);
          }
          done++;
        }
      }
      // S3 — always take a safety copy before replacing everything. Same
      // fix as doExport(): save the full shape, not just pigs, so undoing
      // an import (by re-importing this safety file) doesn't also lose
      // activity/snapshot history.
      try {
        const backup = JSON.stringify({ pigs, pairings, activity, snapshots, locations });
        localStorage.setItem("gp_pre_import_backup", backup);
        const blob = new Blob([backup], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `herd-backup-before-import-${new Date().toISOString().slice(0,10)}.json`;
        a.click(); URL.revokeObjectURL(a.href);
        addLog("Pre-import backup downloaded");
      } catch(be) { addLog(`Pre-import backup failed: ${be.message}`); }
      pigs = valid;
      // Restore pairings/activity/snapshots too, when the file actually had
      // them (the new full-backup format) — an old plain-array file simply
      // won't have this data to restore, which is expected and fine.
      if (importedPairings) pairings = importedPairings;
      if (importedActivity) activity = importedActivity;
      if (importedSnapshots) snapshots = importedSnapshots;
      if (importedLocations) locations = importedLocations;
      save(); renderAll(); hideLoader();
      const extras = [];
      if (importedActivity) extras.push(`${importedActivity.length} activity entries`);
      if (importedSnapshots) extras.push(`${importedSnapshots.length} snapshots`);
      toast(`Imported ${pigs.length} records${extras.length ? ` \u00b7 ${extras.join(", ")}` : ""} \u2713${done > 0 ? ` \u00b7 ${done-photoFailures} photos uploaded` : ""}${photoFailures ? ` \u00b7 \u26a0\ufe0f ${photoFailures} photo${photoFailures===1?"":"s"} failed to upload (kept locally, re-upload from More \u2192 or the animal's profile when possible)` : ""}`, photoFailures ? "err" : "ok", photoFailures ? 8000 : 4500);
    } catch(err) {
      hideLoader();
      addLog(`Import error: ${err.message}`);
      toast("Couldn\u2019t read that file \u2014 make sure it was exported from this app", "err", 5000);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}
