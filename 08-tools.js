// ── Milestones widget ─────────────────────────────────────────────────────────
function renderMilestones() {
  const el = document.getElementById("milestone-list");
  const items = [];
  const now = new Date();
  // Upcoming birthdays (within 14 days) for active pigs with a DOB
  pigs.filter(p=>!p.deleted&&!p.dead&&!p.rehomed&&p.d).forEach(p => {
    const dob = new Date(p.d);
    const thisYearBday = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
    if (thisYearBday < now) thisYearBday.setFullYear(now.getFullYear()+1);
    const daysAway = Math.ceil((thisYearBday-now)/86400000);
    if (daysAway <= 14) {
      const turning = thisYearBday.getFullYear() - dob.getFullYear();
      items.push({ icon: "&#127874;", text: `${xe(p.n)} turns <strong>${turning}</strong> on ${thisYearBday.toLocaleDateString()}${daysAway===0?" &mdash; today!":daysAway===1?" &mdash; tomorrow!":""}`, sortKey: thisYearBday, urgent: false });
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
  const active = pigs.filter(p=>!p.deleted&&!p.dead&&!p.rehomed);
  const rows = active.map(p => `<tr>
    <td>${xe(p.n)}</td>
    <td>${p.s==="female"?"Sow":"Boar"}</td>
    <td>${xe(p.br||"")}</td>
    <td>${getAge(p.d)}</td>
    <td>${p.r==="yes"?"Roan":"&mdash;"}</td>
    <td>${p.st==="stock"?"Stock":"For rehome"}</td>
  </tr>`).join("");
  const html = `<!DOCTYPE html><html><head><title>Herd Quick Reference</title>
  <style>
    body{font-family:Arial,sans-serif;padding:24px;color:#111}
    h1{font-size:20px;margin-bottom:4px}
    p{font-size:12px;color:#555;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{text-align:left;background:#eee;padding:6px 8px;border-bottom:2px solid #999}
    td{padding:5px 8px;border-bottom:1px solid #ddd}
    tr:nth-child(even){background:#f7f7f7}
  </style></head><body>
  <h1>Guinea Pig Herd &mdash; Quick Reference</h1>
  <p>Printed ${new Date().toLocaleDateString()} &middot; ${active.length} active pigs</p>
  <table><thead><tr><th>Name</th><th>Sex</th><th>Breed</th><th>Age</th><th>Roan</th><th>Status</th></tr></thead>
  <tbody>${rows}</tbody></table>
  </body></html>`;
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ── Export / Import ───────────────────────────────────────────────────────────
function doExport() {
  const blob = new Blob([JSON.stringify(pigs, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `guinea_pigs_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  addLog(`Exported ${pigs.length} pigs`);
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
      if (!Array.isArray(data)) throw new Error("Not a valid pig list");
      let valid = data.filter(p => p && typeof p === "object").map(sanitisePig);
      // Upload any embedded base64 photos to ImgBB
      let done = 0;
      for (let i = 0; i < valid.length; i++) {
        if (valid[i].photo && valid[i].photo.startsWith("data:image")) {
          showLoader(`Uploading photos… (${done+1}/${valid.filter(p=>p.photo&&p.photo.startsWith("data:image")).length})`);
          const up = await uploadToImgBB(valid[i].photo);
          valid[i].photo = up.url; valid[i].photoThumb = up.thumb;
          done++;
        }
      }
      // S3 — always take a safety copy before replacing everything
      try {
        const backup = JSON.stringify(pigs);
        localStorage.setItem("gp_pre_import_backup", backup);
        const blob = new Blob([backup], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `herd-backup-before-import-${new Date().toISOString().slice(0,10)}.json`;
        a.click(); URL.revokeObjectURL(a.href);
        addLog("Pre-import backup downloaded");
      } catch(be) { addLog(`Pre-import backup failed: ${be.message}`); }
      pigs = valid;
      save(); renderAll(); hideLoader();
      toast(`Imported ${pigs.length} records \u2713${done > 0 ? ` \u00b7 ${done} photos uploaded` : ""}`, "ok", 4500);
    } catch(err) {
      hideLoader();
      addLog(`Import error: ${err.message}`);
      toast("Couldn\u2019t read that file \u2014 make sure it was exported from this app", "err", 5000);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}
