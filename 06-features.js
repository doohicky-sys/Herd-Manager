// ══ v21 features ══════════════════════════════════════════════════════════════

// ── Age helpers ───────────────────────────────────────────────────────────────
function calcAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr); if (isNaN(dob)) return null;
  const now = new Date();
  let months = (now.getFullYear()-dob.getFullYear())*12 + (now.getMonth()-dob.getMonth());
  if (now.getDate() < dob.getDate()) months--;
  if (months < 0) months = 0;
  const days = Math.max(0, Math.floor((now - dob) / 86400000));
  const y = Math.floor(months/12), m = months%12;
  // Under three months, breeders think in DAYS — weaning, sexing and separation
  // windows are all day-scale. Older than that, months/years read better.
  const label = months < 3 ? `${days}d` : (y > 0 ? `${y}y ${m}mo` : `${m}mo`);
  return { y, m, days, months, label };
}

// ── Derived family (parents / auto-siblings / ancestors) ─────────────────────
const PARENT_RELS = ["mother","father","parent"];
function getParentIds(p) {
  return (p.family||[]).filter(f=>PARENT_RELS.includes(f.relation)).map(f=>f.pigId);
}
function getAutoSiblings(p) {
  const myParents = new Set(getParentIds(p));
  if (!myParents.size) return [];
  const taggedIds = new Set((p.family||[]).map(f=>f.pigId));
  return pigs.filter(o => o.id!==p.id && !o.deleted).map(o => {
    const shared = getParentIds(o).filter(id=>myParents.has(id));
    return shared.length ? { pig:o, type: shared.length>=2 ? "full sibling" : "half sibling" } : null;
  }).filter(Boolean).filter(s => !taggedIds.has(s.pig.id));
}
function ancestorsOf(pigId, maxDepth) {
  // Returns Map of ancestorId -> generation depth (1=parent, 2=grandparent…)
  const out = new Map();
  let frontier = [pigId];
  for (let depth=1; depth<=(maxDepth||4); depth++) {
    const next = [];
    frontier.forEach(id => {
      const p = pigs.find(x=>x.id===id); if (!p) return;
      getParentIds(p).forEach(pid => {
        const par = pigs.find(x=>x.id===pid);
        if (!par || par.deleted) return;
        if (!out.has(pid)) { out.set(pid, depth); next.push(pid); }
      });
    });
    frontier = next;
    if (!frontier.length) break;
  }
  return out;
}

// ── Rehoming pipeline ─────────────────────────────────────────────────────────
const RH_STAGES = [
  { key:"available", label:"Available" },
  { key:"reserved",  label:"Reserved" },
  { key:"deposit",   label:"Deposit received" },
  { key:"collected", label:"Collected" }
];
function ensureRh(p) {
  if (!p.rh || typeof p.rh !== "object") p.rh = { stage:"available", ownerName:"", contact:"", address:"", deposit:"", total:"", paid:"", notes:"", history:[] };
  if (!Array.isArray(p.rh.history)) p.rh.history = [];
  return p.rh;
}
function rhStageIndex(stage){ return Math.max(0, RH_STAGES.findIndex(s=>s.key===stage)); }
async function rhSetStage(pigId, stageKey) {
  const p = pigs.find(x=>x.id===pigId); if (!p) return;
  const rh = ensureRh(p);
  if (rh.stage === stageKey) return;
  if (stageKey === "collected") {
    const ok = await confirmSheet({
      title: `Mark ${p.n} as collected?`,
      body: "They'll move to the Rehomed tab, with all their rehoming details kept.",
      confirmLabel: "Mark collected"
    });
    if (!ok) return;
  }
  rh.stage = stageKey;
  rh.history.push({ stage: stageKey, at: new Date().toISOString().slice(0,10) });
  if (stageKey === "collected") {
    p.rehomed = true;
    logActivity(`&#127968; ${xe(p.n)} was collected by their new owner`);
  } else {
    if (p.rehomed) p.rehomed = false;   // stepping back returns them to the herd

    logActivity(`&#128203; ${xe(p.n)} moved to "${RH_STAGES[rhStageIndex(stageKey)].label}"`);
  }
  save();
  if (typeof updateCard === "function") updateCard(pigId); else renderAll();
  const boardPane = document.getElementById("pane-rehoming");
  if (boardPane && boardPane.style.display !== "none") renderBoard();
  openDetail(pigId); // refresh the open profile
}
function rhStepperHTML(p) {
  const rh = ensureRh(p);
  const cur = rhStageIndex(rh.stage);
  return `<div class="rh-stepper"><div class="rh-line"></div>` + RH_STAGES.map((s,i) => `
    <button class="rh-step ${i<cur?"done":""} ${i===cur?"current":""}" onclick="rhSetStage('${xe(p.id)}','${xe(s.key)}')">
      <div class="rh-dot">${i<cur?"&#10003;":i+1}</div>
      <div class="rh-lbl">${s.label}</div>
    </button>`).join("") + `</div>`;
}
function outstandingAmount(rh) {
  const total = parseFloat(rh.total)||0, paid = parseFloat(rh.paid)||0;
  return total>0 ? Math.max(0, total-paid) : 0;
}
function rhCardHTML(p) {
  const rh = ensureRh(p);
  const dates = rh.history.map(h=>`${RH_STAGES[rhStageIndex(h.stage)].label}: ${xe(h.at)}`).join(" &middot; ");
  const out = outstandingAmount(rh);
  return `
  <div class="ig-label">Rehoming</div>
  <div class="ig-card">
    ${rhStepperHTML(p)}
    ${rh.ownerName?`<div class="ig-row"><span class="ig-key">New owner</span><span class="ig-val">${xe(rh.ownerName)}</span></div>`:""}
    ${rh.contact?`<div class="ig-row"><span class="ig-key">Contact</span><span class="ig-val">${xe(rh.contact)}</span></div>`:""}
    ${rh.address?`<div class="ig-row"><span class="ig-key">Address</span><span class="ig-val">${xe(rh.address)}</span></div>`:""}
    ${rh.deposit?`<div class="ig-row"><span class="ig-key">Deposit</span><span class="ig-val">&pound;${xe(rh.deposit)}</span></div>`:""}
    ${rh.total?`<div class="ig-row"><span class="ig-key">Total price</span><span class="ig-val">&pound;${xe(rh.total)}</span></div>`:""}
    ${rh.paid?`<div class="ig-row"><span class="ig-key">Paid so far</span><span class="ig-val">&pound;${xe(rh.paid)}${out?` <span style="color:var(--warn);font-weight:600">(&pound;${out} outstanding)</span>`:""}</span></div>`:""}
    ${rh.notes?`<div class="ig-row"><span class="ig-key">Notes</span><span class="ig-val">${xe(rh.notes)}</span></div>`:""}
    ${dates?`<div class="ig-row"><span class="ig-key">History</span><span class="ig-val" style="font-size:12px;color:var(--text2)">${dates}</span></div>`:""}
    <div class="ig-free"><button class="btn btnsm" onclick="openRhEdit('${xe(p.id)}')">Edit rehoming details</button></div>
  </div>`;
}
function openRhEdit(pigId) {
  const p = pigs.find(x=>x.id===pigId); if (!p) return;
  const rh = ensureRh(p);
  cov("ov-detail");
  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit');openDetail('${xe(p.id)}')">&#10005;</button>
    <div class="mt">Rehoming details &mdash; ${xe(p.n)}</div>
    <div class="f"><label>New owner's name</label><input id="rh-owner" value="${xe(rh.ownerName)}"></div>
    <div class="f"><label>Contact (phone / email)</label><input id="rh-contact" value="${xe(rh.contact)}"></div>
    <div class="f"><label>Address</label><textarea id="rh-address">${xe(rh.address)}</textarea></div>
    <div class="twocol">
      <div class="f"><label>Deposit (&pound;)</label><input id="rh-deposit" type="number" step="0.01" value="${xe(rh.deposit)}"></div>
      <div class="f"><label>Total price (&pound;)</label><input id="rh-total" type="number" step="0.01" value="${xe(rh.total)}"></div>
    </div>
    <div class="f"><label>Paid so far (&pound;)</label><input id="rh-paid" type="number" step="0.01" value="${xe(rh.paid)}"></div>
    <div class="f"><label>Notes</label><textarea id="rh-notes">${xe(rh.notes)}</textarea></div>
    <div class="ma">
      <button class="btn btnsm" onclick="cov('ov-edit');openDetail('${xe(p.id)}')">Cancel</button>
      <button class="btn btnp btnsm" onclick="saveRhEdit('${xe(p.id)}')">Save</button>
    </div>`;
  document.getElementById("ov-edit").classList.add("open");
}
function saveRhEdit(pigId) {
  const p = pigs.find(x=>x.id===pigId); if (!p) return;
  const rh = ensureRh(p);
  rh.ownerName = document.getElementById("rh-owner").value.trim();
  rh.contact = document.getElementById("rh-contact").value.trim();
  rh.address = document.getElementById("rh-address").value.trim();
  rh.deposit = document.getElementById("rh-deposit").value;
  rh.total = document.getElementById("rh-total").value;
  rh.paid = document.getElementById("rh-paid").value;
  rh.notes = document.getElementById("rh-notes").value.trim();
  logActivity(`&#128203; Rehoming details updated for ${xe(p.n)}`);
  save(); cov("ov-edit"); openDetail(pigId);
}

// ── Rehoming board ────────────────────────────────────────────────────────────
function renderBoard() {
  const inPipeline = pigs.filter(p=>!p.deleted&&!p.dead&&!p.rehomed&&p.st==="rehome");
  const collected = pigs.filter(p=>!p.deleted&&!p.dead&&p.rehomed&&p.rh);
  let received=0, outstanding=0;
  [...inPipeline, ...collected].forEach(p => {
    const rh = ensureRh(p);
    received += parseFloat(rh.paid)||0;
    if (!p.rehomed) outstanding += outstandingAmount(rh);
  });
  document.getElementById("board-money").innerHTML = `
    <div class="m"><strong>&pound;${received.toFixed(2)}</strong>received so far</div>
    <div class="m"><strong>&pound;${outstanding.toFixed(2)}</strong>outstanding (pipeline)</div>
    <div class="m"><strong>${inPipeline.length}</strong>in the pipeline</div>`;
  const stageCols = RH_STAGES.slice(0,3); // Collected pigs live in the Rehomed tab
  document.getElementById("board").innerHTML = stageCols.map(s => {
    const col = inPipeline.filter(p=>ensureRh(p).stage===s.key);
    return `<div class="board-col">
      <div class="board-col-title"><span>${s.label}</span><span>${col.length}</span></div>
      ${col.length ? col.map(p => {
        const rh = ensureRh(p);
        const av = p.photo ? `<img loading="lazy" decoding="async" width="32" height="32" alt="" src="${xe(p.photoThumb||p.photo)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : `<div class="av" style="${avStyle(p)};width:32px;height:32px;font-size:11px">${ini(p.n)}</div>`;
        const sub = rh.ownerName ? xe(rh.ownerName) : (s.key==="available" ? "No enquiries yet" : "");
        const due = outstandingAmount(rh);
        const money = due ? `&pound;${due} due` : "";
        return `<div class="board-card" onclick="openDetail('${xe(p.id)}')">${av}
          <div><div class="board-card-name">${xe(p.n)}</div><div class="board-card-sub">${sub}${sub&&money?" &middot; ":""}${money}</div></div>
        </div>`;
      }).join("") : `<div style="font-size:12px;color:var(--text3);padding:6px 2px">Empty</div>`}
    </div>`;
  }).join("");
}

// ── Soft delete & trash ───────────────────────────────────────────────────────
function renderTrash() {
  const bin = pigs.filter(p=>p.deleted);
  document.getElementById("trash-list").innerHTML = bin.length ? bin.map(p => {
    const av = p.photo ? `<img loading="lazy" decoding="async" width="34" height="34" alt="" src="${xe(p.photoThumb||p.photo)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover">` : `<div class="av" style="${avStyle(p)};width:34px;height:34px;font-size:12px">${ini(p.n)}</div>`;
    const days = Math.max(0, 30 - Math.floor((Date.now()-new Date(p.deletedAt||Date.now()))/86400000));
    return `<div class="trash-row">${av}
      <div style="flex:1"><div style="font-size:14px;font-weight:600">${xe(p.n)}</div><div style="font-size:12px;color:var(--text2)">Gone forever in ${days} day${days===1?"":"s"}</div></div>
      <button class="btn btnsm" onclick="restorePig('${xe(p.id)}')">Restore</button>
      <button class="btn btnd btnsm" onclick="purgePig('${xe(p.id)}')">Delete forever</button>
    </div>`;
  }).join("") : `<div class="empty"><span class="empty-icon">&#128465;</span>Nothing in the bin.<div class="empty-sub">Deleted pigs appear here for 30 days.</div></div>`;
}
function restorePig(id) {
  const p = pigs.find(x=>x.id===id); if (!p) return;
  delete p.deleted; delete p.deletedAt;
  logActivity(`${xe(p.n)} was restored from the bin`);
  save(); renderTrash(); renderAll();
}
async function purgePig(id) {
  const ok = await confirmSheet({
    title: "Delete forever?",
    body: "This record will be gone permanently. This cannot be undone.",
    confirmLabel: "Delete forever", danger: true
  });
  if (!ok) return;
  const p = pigs.find(x=>x.id===id);
  pigs = pigs.filter(x=>x.id!==id);
  pigs.forEach(other => { if (Array.isArray(other.family)) other.family = other.family.filter(f=>f.pigId!==id); });
  logActivity(`${xe(p?.n||"A pig")} was permanently deleted`);
  save(); renderTrash(); renderAll();
}
function autoPurgeTrash() {
  const cutoff = Date.now() - 30*86400000;
  const stale = pigs.filter(p=>p.deleted && new Date(p.deletedAt||0).getTime() < cutoff);
  if (!stale.length) return;
  const ids = new Set(stale.map(p=>p.id));
  pigs = pigs.filter(p=>!ids.has(p.id));
  pigs.forEach(other => { if (Array.isArray(other.family)) other.family = other.family.filter(f=>!ids.has(f.pigId)); });
  addLog(`Auto-purged ${stale.length} pig(s) from the bin (30+ days)`);
  save();
}

// ── Data health check (tappable worklist) ────────────────────────────────────
let healthChecks = [];
function renderHealth() {
  const active = pigs.filter(p=>!p.deleted&&!p.dead&&!p.rehomed);
  healthChecks = [
    { key:"dob",    label:"Missing date of birth", list: active.filter(p=>!p.d) },
    { key:"breed",  label:"Missing breed",         list: active.filter(p=>!(p.br||"").trim()) },
    { key:"photo",  label:"No photo",              list: active.filter(p=>!p.photo) },
    { key:"family", label:"No family links",       list: active.filter(p=>!(p.family||[]).length) },
    { key:"weight", label:"No weight recorded",    list: active.filter(p=>!(p.weights||[]).length) }
  ];
  const el = document.getElementById("health-list");
  const total = healthChecks.reduce((s,c)=>s+c.list.length,0);
  if (!total) { el.innerHTML = `<div class="milestones-empty">All records look complete. &#127881;</div>`; return; }
  const suggestions = suggestFamilyLinks();
  el.innerHTML = healthChecks.filter(c=>c.list.length).map(c => `
    <button type="button" class="health-item" onclick="openHealthList('${xe(c.key)}')">
      <span>${c.label}</span>
      <span class="health-right"><span class="health-count">${c.list.length}</span><span class="health-go" aria-hidden="true">&#8250;</span></span>
    </button>`).join("")
    + (suggestions.length ? `
      <button type="button" class="health-item health-suggest" onclick="openLinkSuggestions()">
        <span>&#128161; Suggested family links</span>
        <span class="health-right"><span class="health-count health-count-ok">${suggestions.length}</span><span class="health-go" aria-hidden="true">&#8250;</span></span>
      </button>` : "");
}
// Tapping a health row opens the herd filtered to exactly those pigs
let healthFilterIds = null;
function openHealthList(key) {
  const check = healthChecks.find(c=>c.key===key);
  if (!check) return;
  healthFilterIds = new Set(check.list.map(p=>p.id));
  healthFilterLabel = check.label;
  navGo("herd");
  renderGrid();
  toast(`Showing ${check.list.length} pig${check.list.length===1?"":"s"}: ${check.label.toLowerCase()}`, "ok", 3500);
}
let healthFilterLabel = "";
function clearHealthFilter() {
  healthFilterIds = null; healthFilterLabel = "";
  renderGrid();
}

// ── Suggested family links ───────────────────────────────────────────────────
// Only proposes links it can justify from existing data. Every suggestion is
// reviewed by the user before anything is written.
function suggestFamilyLinks() {
  const out = [];
  const active = pigs.filter(p=>!p.deleted);
  const byId = new Map(active.map(p=>[p.id,p]));
  const linked = (a,b) => (a.family||[]).some(f=>f.pigId===b.id);

  // 1) Litter match — a sow's recorded litter date matching pups' DOB
  active.filter(p=>p.s==="female" && (p.litters||[]).length).forEach(mum => {
    (mum.litters||[]).forEach(l => {
      if (!l.date) return;
      const pups = active.filter(p =>
        p.id!==mum.id && p.d === l.date && !linked(mum,p) &&
        !getParentIds(p).length
      );
      pups.forEach(pup => out.push({
        type:"mother", a:mum.id, b:pup.id,
        reason:`${xe(pup.n)} was born on ${xe(l.date)}, the date of ${xe(mum.n)}'s recorded litter`
      }));
    });
  });

  // 2) Shared birth date — pigs born the same day with no links are littermates
  const byDob = new Map();
  active.filter(p=>p.d && !(p.family||[]).length).forEach(p => {
    if (!byDob.has(p.d)) byDob.set(p.d, []);
    byDob.get(p.d).push(p);
  });
  byDob.forEach((group, dob) => {
    if (group.length < 2 || group.length > 8) return;   // >8 same-day is probably a bulk intake, not a litter
    for (let i=0;i<group.length;i++) for (let j=i+1;j<group.length;j++) {
      if (linked(group[i],group[j])) continue;
      out.push({
        type:"sibling", a:group[i].id, b:group[j].id,
        reason:`${xe(group[i].n)} and ${xe(group[j].n)} share a birth date (${xe(dob)})`
      });
    }
  });

  // 3) Name pattern — "Susie's boy 3" implies Susie is the mother
  active.forEach(p => {
    const m = String(p.n||"").match(/^(.+?)(?:'|\u2019)s\s+(?:baby|boy|girl|pup|son|daughter)/i);
    if (!m) return;
    const mum = active.find(x => x.s==="female" && String(x.n||"").toLowerCase() === m[1].trim().toLowerCase());
    if (!mum || mum.id===p.id || linked(mum,p) || getParentIds(p).length) return;
    out.push({
      type:"mother", a:mum.id, b:p.id,
      reason:`${xe(p.n)}'s name suggests ${xe(mum.n)} is the mother`
    });
  });

  // De-duplicate pairs, cap the list so the sheet stays usable
  const seen = new Set();
  return out.filter(s => {
    const k = [s.a,s.b].sort().join("|") + s.type;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, 40);
}
function openLinkSuggestions() {
  const list = suggestFamilyLinks();
  const body = list.length ? list.map((s,i) => {
    const a = pigs.find(p=>p.id===s.a), b = pigs.find(p=>p.id===s.b);
    if (!a||!b) return "";
    const rel = s.type === "mother" ? "mother of" : "sibling of";
    return `<div class="sug-row" id="sug-${i}">
      <div class="sug-main">
        <div class="sug-pair"><strong>${xe(a.n)}</strong> &rarr; ${rel} &rarr; <strong>${xe(b.n)}</strong></div>
        <div class="sug-why">${s.reason}</div>
      </div>
      <div class="sug-actions">
        <button class="btn btnsm" onclick="dismissSuggestion(${i})" aria-label="Skip this suggestion">Skip</button>
        <button class="btn btnp btnsm" onclick="acceptSuggestion(${i})">Link</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty" style="padding:20px"><span class="empty-icon">&#128161;</span>No suggestions right now.<div class="empty-sub">Suggestions appear when litters, birth dates or names hint at a relationship.</div></div>`;

  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit')" aria-label="Close">&#10005;</button>
    <div class="mt">Suggested family links</div>
    <p style="font-size:var(--fs-sm);color:var(--text2);margin-bottom:12px">
      Worked out from litter dates, shared birthdays and naming patterns. Nothing is saved until you tap Link.
    </p>
    ${list.length > 1 ? `<button class="btn btnsm" style="margin-bottom:12px" onclick="acceptAllSuggestions()">Link all ${list.length}</button>` : ""}
    <div id="sug-list">${body}</div>`;
  window._suggestions = list;
  document.getElementById("ov-edit").classList.add("open");
}
function acceptSuggestion(i) {
  const s = (window._suggestions||[])[i]; if (!s) return;
  linkFamily(s.a, s.b, s.type === "mother" ? "child" : "sibling");
  // linkFamily phrases from the owner's view: on the mother, the pup is her child
  const row = document.getElementById(`sug-${i}`);
  if (row) { row.classList.add("sug-done"); row.querySelector(".sug-actions").innerHTML = `<span class="sug-ok">&#10003; Linked</span>`; }
  save(); renderHealth();
}
function dismissSuggestion(i) {
  const row = document.getElementById(`sug-${i}`);
  if (row) row.remove();
}
function acceptAllSuggestions() {
  const list = window._suggestions || [];
  list.forEach((s,i) => {
    const row = document.getElementById(`sug-${i}`);
    if (row && row.classList.contains("sug-done")) return;
    linkFamily(s.a, s.b, s.type === "mother" ? "child" : "sibling");
    if (row) { row.classList.add("sug-done"); row.querySelector(".sug-actions").innerHTML = `<span class="sug-ok">&#10003; Linked</span>`; }
  });
  save(); renderHealth();
  toast(`${list.length} family link${list.length===1?"":"s"} created \u2713`);
}

// ── Weight tracking ───────────────────────────────────────────────────────────
// Weight is the single most useful husbandry signal in cavies — a steady drop is
// often the only early warning before something serious. Stored per pig as
// { d: "YYYY-MM-DD", g: grams }, newest last.
function pigWeights(p) {
  return Array.isArray(p.weights) ? p.weights.filter(w => w && w.d && !isNaN(parseFloat(w.g))) : [];
}
function latestWeight(p) {
  const w = pigWeights(p);
  return w.length ? w[w.length-1] : null;
}
function weightTrend(p) {
  // Compares the most recent reading with the closest one ~2+ weeks earlier.
  const w = pigWeights(p);
  if (w.length < 2) return null;
  const last = w[w.length-1];
  const lastT = new Date(last.d).getTime();
  let ref = null;
  for (let i = w.length-2; i >= 0; i--) {
    const t = new Date(w[i].d).getTime();
    if (lastT - t >= 12*86400000) { ref = w[i]; break; }
  }
  if (!ref) ref = w[0];
  const diff = parseFloat(last.g) - parseFloat(ref.g);
  const pct = ref.g ? (diff / parseFloat(ref.g)) * 100 : 0;
  return { diff: Math.round(diff), pct: Math.round(pct*10)/10, from: ref, to: last,
           concern: pct <= -8 };   // ~8% loss is the usual "call the vet" threshold
}
function svgSparkline(values, colour) {
  if (values.length < 2) return "";
  const w = 240, h = 44, pad = 4;
  const max = Math.max(...values), min = Math.min(...values);
  const span = (max - min) || 1;
  const px = i => pad + i*(w-2*pad)/(values.length-1);
  const py = v => h-pad - (v-min)*(h-2*pad)/span;
  const pts = values.map((v,i)=>`${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="wt-spark" role="img" aria-label="Weight trend">
    <polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${px(values.length-1).toFixed(1)}" cy="${py(values[values.length-1]).toFixed(1)}" r="3" fill="${colour}"/>
  </svg>`;
}
function weightCardHTML(p) {
  const w = pigWeights(p);
  const last = latestWeight(p);
  const tr = weightTrend(p);
  const inkVar = tr && tr.concern ? "--err" : "--green";
  return `
  <div class="ig-label">Weight</div>
  <div class="ig-card">
    ${last ? `
      <div class="wt-head">
        <div>
          <div class="wt-now">${xe(last.g)}<span class="wt-unit">g</span></div>
          <div class="wt-when">Last weighed ${xe(last.d)}</div>
        </div>
        ${tr ? `<div class="wt-trend ${tr.concern?"wt-concern":(tr.diff>=0?"wt-up":"wt-down")}">
          ${tr.diff>0?"&#9650;":tr.diff<0?"&#9660;":"&#8213;"} ${Math.abs(tr.diff)}g
          <span class="wt-pct">${tr.pct>0?"+":""}${tr.pct}%</span>
        </div>` : ""}
      </div>
      ${w.length>1 ? svgSparkline(w.map(x=>parseFloat(x.g)), `var(${inkVar})`) : ""}
      ${tr && tr.concern ? `<div class="wt-warn">&#9888;&#65039; Down ${Math.abs(tr.pct)}% since ${xe(tr.from.d)} &mdash; worth a closer look.</div>` : ""}
      <div class="wt-list">${w.slice(-5).reverse().map(x=>`<div class="wt-row"><span>${xe(x.d)}</span><span>${xe(x.g)} g</span></div>`).join("")}</div>
    ` : `<div class="ig-free" style="color:var(--text2)">No weights recorded yet.</div>`}
    <div class="ig-free"><button class="btn btnsm" onclick="openWeightAdd('${xe(p.id)}')">&#9878; Record a weight</button></div>
  </div>`;
}
function openWeightAdd(pigId) {
  const p = pigs.find(x=>x.id===pigId); if (!p) return;
  const last = latestWeight(p);
  cov("ov-detail");
  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit');openDetail('${xe(pigId)}')" aria-label="Close">&#10005;</button>
    <div class="mt">Record a weight &mdash; ${xe(p.n)}</div>
    ${last ? `<p style="font-size:var(--fs-sm);color:var(--text2);margin-bottom:12px">Last recorded: <strong>${xe(last.g)} g</strong> on ${xe(last.d)}</p>` : ""}
    <div class="twocol">
      <div class="f"><label for="wt-date">Date</label><input type="date" id="wt-date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="f"><label for="wt-g">Weight (grams)</label><input type="number" id="wt-g" inputmode="numeric" min="1" max="3000" placeholder="e.g. 950"></div>
    </div>
    <div class="ma">
      <button class="btn btnsm" onclick="cov('ov-edit');openDetail('${xe(pigId)}')">Cancel</button>
      <button class="btn btnp btnsm" onclick="saveWeight('${xe(pigId)}')">Save weight</button>
    </div>`;
  document.getElementById("ov-edit").classList.add("open");
  setTimeout(()=>document.getElementById("wt-g")?.focus(), 80);
}
function saveWeight(pigId) {
  const p = pigs.find(x=>x.id===pigId); if (!p) return;
  const d = document.getElementById("wt-date").value;
  const g = parseFloat(document.getElementById("wt-g").value);
  if (!d || !g || g <= 0) { toast("Enter a date and a weight in grams", "err"); return; }
  if (!Array.isArray(p.weights)) p.weights = [];
  const existing = p.weights.find(w => w.d === d);
  if (existing) existing.g = g; else p.weights.push({ d, g });
  p.weights.sort((a,b)=>String(a.d).localeCompare(String(b.d)));
  logActivity(`&#9878; ${xe(p.n)} weighed ${g} g`);
  save();
  cov("ov-edit"); openDetail(pigId);
  const tr = weightTrend(p);
  if (tr && tr.concern) toast(`\u26a0\ufe0f ${p.n} is down ${Math.abs(tr.pct)}% \u2014 worth a closer look`, "err", 6000);
  else toast("Weight recorded \u2713");
}

// ── Herd / breeder identity (appears on certificates) ────────────────────────
function getHerdDetails() {
  try { return JSON.parse(localStorage.getItem("gp_herd_details") || "{}"); }
  catch(e) { return {}; }
}
function openHerdDetails() {
  const h = getHerdDetails();
  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit')" aria-label="Close">&#10005;</button>
    <div class="mt">Herd &amp; breeder details</div>
    <p style="font-size:var(--fs-sm);color:var(--text2);margin-bottom:14px">These appear on pedigree certificates and printed sheets.</p>
    <div class="f"><label for="hd-herd">Herd / stud prefix</label><input id="hd-herd" value="${xe(h.herd||"")}" placeholder="e.g. Willowbank Cavies"></div>
    <div class="f"><label for="hd-breeder">Breeder name</label><input id="hd-breeder" value="${xe(h.breeder||"")}" placeholder="e.g. G. Smith"></div>
    <div class="f"><label for="hd-loc">Location</label><input id="hd-loc" value="${xe(h.location||"")}" placeholder="e.g. Devon, United Kingdom"></div>
    <div class="f"><label for="hd-contact">Contact (optional)</label><input id="hd-contact" value="${xe(h.contact||"")}" placeholder="Email or phone"></div>
    <div class="ma">
      <button class="btn btnsm" onclick="cov('ov-edit')">Cancel</button>
      <button class="btn btnp btnsm" onclick="saveHerdDetails()">Save</button>
    </div>`;
  document.getElementById("ov-edit").classList.add("open");
}
function saveHerdDetails() {
  const d = {
    herd: document.getElementById("hd-herd").value.trim(),
    breeder: document.getElementById("hd-breeder").value.trim(),
    location: document.getElementById("hd-loc").value.trim(),
    contact: document.getElementById("hd-contact").value.trim()
  };
  try { localStorage.setItem("gp_herd_details", JSON.stringify(d)); } catch(e) {}
  cov("ov-edit");
  toast("Herd details saved \u2713");
}

// Resolves a parent by relation, skipping binned pigs. Used by the pedigree
// bracket and by ancestorsOf().
function parentByRel(p, rels) {
  if (!p) return null;
  const link = (p.family||[]).find(f=>rels.includes(f.relation));
  const found = link ? pigs.find(x=>x.id===link.pigId) : null;
  return (found && !found.deleted) ? found : null;
}

// ── Pedigree certificate ──────────────────────────────────────────────────────
// Laid out as a standard bracket pedigree (subject → sire/dam → 4 grandparents
// → 8 great-grandparents), which is the convention used by breed registries.
function pedAncestors(pig, depth) {
  // Returns a flat array of 2^depth slots for the given generation, in the
  // conventional order: sire line above, dam line below, recursively.
  if (!pig) return new Array(Math.pow(2, depth)).fill(null);
  if (depth === 0) return [pig];
  const sire = parentByRel(pig, ["father"]);
  const dam  = parentByRel(pig, ["mother"]);
  return [...pedAncestors(sire, depth-1), ...pedAncestors(dam, depth-1)];
}
function pedCellHTML(pig, gen) {
  if (!pig) return `<div class="ped-cell ped-empty" aria-label="Unrecorded"><span>&mdash;</span></div>`;
  const bits = [];
  if (pig.br) bits.push(xe(pig.br));
  if (pig.d) bits.push(xe(pig.d));
  const marks = pig.de ? xe(pig.de) : "";
  return `<div class="ped-cell">
    <div class="ped-cell-name">${xe(pig.n || "Unnamed")}</div>
    ${bits.length ? `<div class="ped-cell-meta">${bits.join(" &middot; ")}</div>` : ""}
    ${marks && gen <= 1 ? `<div class="ped-cell-meta">${marks}</div>` : ""}
    ${pig.r === "yes" ? `<div class="ped-flag">Roan carrier</div>` : ""}
  </div>`;
}
function certRef(p) {
  // Stable, distinct reference: year of birth + a 6-digit fingerprint of the id.
  let digits = String(p.id || "").replace(/\D/g, "").slice(-6);
  if (digits.length < 6) {
    let hsh = 0;
    for (const ch of String(p.id || p.n || "x")) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    digits = String(hsh % 1000000).padStart(6, "0");
  }
  const yr = (p.d || new Date().toISOString()).slice(0, 4);
  return `${yr}-${digits}`;
}
function printPedigree(pigId) {
  const p = pigs.find(x => x.id === pigId); if (!p) return;
  const h = getHerdDetails();
  const age = calcAge(p.d);
  const gen1 = pedAncestors(p, 1);   // 2  — sire, dam
  const gen2 = pedAncestors(p, 2);   // 4  — grandparents
  const gen3 = pedAncestors(p, 3);   // 8  — great-grandparents
  const recorded = [...gen1, ...gen2, ...gen3].filter(Boolean).length;
  const sexWord = p.s === "female" ? "Sow (female)" : "Boar (male)";
  const litterCount = (p.litters || []).length;

  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Pedigree Certificate — ${xe(p.n)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  *{box-sizing:border-box}
  body{margin:0;padding:22px;background:#f4f2ed;
       font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;color:#1d232b}
  .sheet{max-width:1120px;margin:0 auto;background:#fffdf9;padding:34px 40px 26px;
         border:1px solid #d5cec2;box-shadow:0 1px 0 #fff inset}
  /* Masthead */
  .mast{display:flex;justify-content:space-between;align-items:flex-start;
        border-bottom:2px solid #1d232b;padding-bottom:14px}
  .mast-l .herd{font-size:19px;font-weight:700;letter-spacing:.02em}
  .mast-l .sub{font-size:11px;color:#6a6459;margin-top:3px;letter-spacing:.04em}
  .mast-r{text-align:right}
  .mast-r .title{font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:#6a6459}
  .mast-r .ref{font-size:11px;color:#6a6459;margin-top:5px;font-family:ui-monospace,"SF Mono",Menlo,monospace}
  /* Subject block */
  .subject{display:flex;gap:26px;align-items:flex-start;padding:18px 0 16px;border-bottom:1px solid #e0d9cc}
  .subject-main{flex:1}
  .subject .nm{font-size:31px;font-weight:700;line-height:1.1;letter-spacing:-.01em}
  .subject .strap{font-size:12px;color:#6a6459;margin-top:5px;letter-spacing:.03em}
  .facts{display:grid;grid-template-columns:repeat(4,auto);gap:0 30px;margin-top:14px}
  .fact-k{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:#8a8378;
          font-family:system-ui,-apple-system,sans-serif}
  .fact-v{font-size:13.5px;font-weight:600;margin-top:2px}
  /* Pedigree bracket */
  .ped-title{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#8a8378;
             margin:18px 0 8px;font-family:system-ui,-apple-system,sans-serif}
  .ped{display:grid;grid-template-columns:repeat(3,1fr);gap:0 16px}
  .ped-col{display:flex;flex-direction:column;justify-content:space-around;gap:6px}
  .ped-head{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#8a8378;
            text-align:center;padding-bottom:6px;border-bottom:1px solid #e0d9cc;margin-bottom:8px;
            font-family:system-ui,-apple-system,sans-serif}
  .ped-cell{border:1px solid #d9d2c5;border-left:3px solid #1d232b;background:#fffefb;
            padding:7px 10px;min-height:46px;display:flex;flex-direction:column;justify-content:center}
  .ped-cell-name{font-size:13px;font-weight:700;line-height:1.25}
  .ped-cell-meta{font-size:10px;color:#6a6459;margin-top:2px;line-height:1.35}
  .ped-flag{display:inline-block;font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;
            color:#8a5a00;border:1px solid #d8c08a;background:#fdf6e6;border-radius:2px;
            padding:1px 5px;margin-top:4px;align-self:flex-start;
            font-family:system-ui,-apple-system,sans-serif}
  .ped-empty{border-left-color:#d9d2c5;background:#faf8f3;color:#b8b1a4;
             align-items:center;justify-content:center;font-size:13px}
  /* Footer */
  .foot{display:flex;justify-content:space-between;align-items:flex-end;
        margin-top:20px;padding-top:14px;border-top:1px solid #e0d9cc}
  .decl{font-size:10px;color:#6a6459;max-width:56%;line-height:1.55}
  .sigs{display:flex;gap:34px}
  .sig{width:190px;border-top:1px solid #1d232b;padding-top:5px;
       font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#8a8378;
       font-family:system-ui,-apple-system,sans-serif}
  @media print{
    body{background:#fff;padding:0}
    .sheet{border:none;box-shadow:none;padding:0}
  }
</style></head><body>
<div class="sheet">

  <div class="mast">
    <div class="mast-l">
      <div class="herd">${xe(h.herd || "Guinea Pig Herd")}</div>
      <div class="sub">${[h.breeder ? "Breeder: " + xe(h.breeder) : "", xe(h.location || "")].filter(Boolean).join(" &nbsp;&middot;&nbsp; ") || "&nbsp;"}</div>
    </div>
    <div class="mast-r">
      <div class="title">Certificate of Pedigree</div>
      <div class="ref">Ref ${xe(certRef(p))} &nbsp;|&nbsp; Issued ${new Date().toLocaleDateString("en-GB", {day:"2-digit", month:"short", year:"numeric"})}</div>
    </div>
  </div>

  <div class="subject">
    <div class="subject-main">
      <div class="nm">${xe(p.n || "Unnamed")}</div>
      <div class="strap">${sexWord}${p.br ? " &nbsp;&middot;&nbsp; " + xe(p.br) : ""}${p.de ? " &nbsp;&middot;&nbsp; " + xe(p.de) : ""}</div>
      <div class="facts">
        <div><div class="fact-k">Date of birth</div><div class="fact-v">${p.d ? xe(new Date(p.d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})) : "Not recorded"}</div></div>
        <div><div class="fact-k">Age at issue</div><div class="fact-v">${age ? xe(age.label) : "&mdash;"}</div></div>
        <div><div class="fact-k">Roan carrier</div><div class="fact-v">${p.r === "yes" ? "Yes" : "No"}</div></div>
        <div><div class="fact-k">${p.s === "female" ? "Litters recorded" : "Status"}</div><div class="fact-v">${p.s === "female" ? litterCount : (p.st === "stock" ? "Retained" : "Available")}</div></div>
      </div>
    </div>
  </div>

  <div class="ped-title">Recorded lineage &mdash; three generations</div>
  <div class="ped">
    <div class="ped-col">
      <div class="ped-head">Parents</div>
      ${gen1.map(a => pedCellHTML(a, 1)).join("")}
    </div>
    <div class="ped-col">
      <div class="ped-head">Grandparents</div>
      ${gen2.map(a => pedCellHTML(a, 2)).join("")}
    </div>
    <div class="ped-col">
      <div class="ped-head">Great-grandparents</div>
      ${gen3.map(a => pedCellHTML(a, 3)).join("")}
    </div>
  </div>

  <div class="foot">
    <div class="decl">
      I certify that the details recorded above are a true reflection of my breeding records
      at the date of issue. ${recorded} of 14 ancestral positions are recorded; unrecorded
      positions are shown as &mdash;. This document is issued for informational purposes and
      is not a registration with any governing body.
    </div>
    <div class="sigs">
      <div class="sig">Breeder&rsquo;s signature</div>
      <div class="sig">Date</div>
    </div>
  </div>

</div>
<script>window.print()<\/script>
</body></html>`);
  w.document.close();
}
