// ── Family relations ──────────────────────────────────────────────────────────
// Each pig can store `family`: an array of { pigId, relation } links.
// "relation" is always phrased from the OWNER pig's point of view, e.g. on
// Pig A, { pigId: B, relation: "mother" } means "B is A's mother".
// Links are made bidirectional automatically (see linkFamily/unlinkFamily)
// so tagging a mother on one profile also tags the matching child link on
// the other, without the user ever having to edit both sides by hand.
const RELATION_INVERSE = {
  mother: "child", father: "child", child: "parent", parent: "child",
  son: "parent", daughter: "parent", sibling: "sibling", brother: "sibling", sister: "sibling",
  aunt: "nibling", uncle: "nibling", nibling: "auntuncle", auntuncle: "nibling",
  grandmother: "grandchild", grandfather: "grandchild", grandchild: "grandparent", grandparent: "grandchild",
  partner: "partner"
};
// Friendly inverse label that also accounts for the other pig's own sex where useful
function inverseRelationLabel(relation, otherPigSex) {
  const base = RELATION_INVERSE[relation] || "relative";
  if (base === "child") return otherPigSex === "male" ? "son" : (otherPigSex === "female" ? "daughter" : "child");
  if (base === "parent") return otherPigSex === "male" ? "father" : (otherPigSex === "female" ? "mother" : "parent");
  if (base === "sibling") return otherPigSex === "male" ? "brother" : (otherPigSex === "female" ? "sister" : "sibling");
  if (base === "grandchild") return "grandchild";
  if (base === "grandparent") return otherPigSex === "male" ? "grandfather" : (otherPigSex === "female" ? "grandmother" : "grandparent");
  // These two used to fall through and print the raw placeholder words
  // "nibling" / "auntuncle" straight into the family list.
  if (base === "nibling")   return otherPigSex === "male" ? "nephew" : (otherPigSex === "female" ? "niece" : "niece/nephew");
  if (base === "auntuncle") return otherPigSex === "male" ? "uncle"  : (otherPigSex === "female" ? "aunt"  : "aunt/uncle");
  return base;
}
const RELATION_LABELS = ["mother","father","daughter","son","sister","brother","grandmother","grandfather","grandchild","aunt","uncle","partner"];

function linkFamily(ownerId, otherId, relation) {
  const owner = pigs.find(p=>p.id===ownerId), other = pigs.find(p=>p.id===otherId);
  if (!owner || !other || ownerId===otherId) return;
  if (!Array.isArray(owner.family)) owner.family = [];
  if (!Array.isArray(other.family)) other.family = [];
  // One link per pair, per side. Re-tagging updates the existing relation
  // instead of stacking a second, contradictory entry.
  const existing = owner.family.find(f=>f.pigId===otherId);
  if (existing) existing.relation = relation;
  else owner.family.push({ pigId: otherId, relation });
  const inverse = inverseRelationLabel(relation, owner.s);
  const existingOther = other.family.find(f=>f.pigId===ownerId);
  if (existingOther) existingOther.relation = inverse;
  else other.family.push({ pigId: ownerId, relation: inverse });
}
function unlinkFamily(ownerId, otherId) {
  const owner = pigs.find(p=>p.id===ownerId), other = pigs.find(p=>p.id===otherId);
  if (owner && Array.isArray(owner.family)) owner.family = owner.family.filter(f=>f.pigId!==otherId);
  if (other && Array.isArray(other.family)) other.family = other.family.filter(f=>f.pigId!==ownerId);
}
function familyCardHTML(link, ownerId) {
  const p = pigs.find(x=>x.id===link.pigId);
  if (!p || p.deleted) return "";
  const av = p.photo ? `<img loading="lazy" decoding="async" src="${xe(p.photoThumb||p.photo)}" alt="${xe(p.n)}">` : `<span>${ini(p.n)}</span>`;
  return `<div class="fam-card" onclick="closeFamilyAndOpen('${xe(p.id)}')">
    <div class="av" style="${avStyle(p)};width:38px;height:38px;font-size:13px">${av}</div>
    <div class="fam-card-text"><div class="fam-card-name">${xe(p.n)}</div><div class="fam-card-rel">${xe(link.relation)}</div>${p.dead?`<div class="fam-card-deceased">&#127752; Deceased</div>`:""}</div>
  </div>`;
}
function closeFamilyAndOpen(id) {
  cov("ov-detail");
  setTimeout(()=>openDetail(id), 180);
}

// ── Family editor (autocomplete + staged add/remove) ─────────────────────────
function famPendingRowHTML(f, i) {
  const p = pigs.find(x=>x.id===f.pigId);
  return `<div class="fam-pending-item" id="fam-existing-${i}">
    <span>${xe(p?p.n:"Unknown")} &mdash; <em style="color:var(--text2);font-style:normal">${xe(f.relation)}</em></span>
    <button type="button" onclick="famRemoveExisting('${xe(f.pigId)}',${i})">Remove</button>
  </div>`;
}
function famRemoveExisting(pigId, i) {
  if (!famPendingRemoves.includes(pigId)) famPendingRemoves.push(pigId);
  const row = document.getElementById(`fam-existing-${i}`);
  if (row) row.remove();
}
function famPendingAddsHTML() {
  return famPendingAdds.map((f,i) => {
    const p = pigs.find(x=>x.id===f.pigId);
    return `<div class="fam-pending-item" style="background:var(--ok-bg)">
      <span>${xe(p?p.n:"Unknown")} &mdash; <em style="color:var(--text2);font-style:normal">${xe(f.relation)}</em> <span style="color:var(--ok);font-size:11px">(new)</span></span>
      <button type="button" onclick="famRemovePending(${i})">Undo</button>
    </div>`;
  }).join("");
}
function famRemovePending(i) {
  famPendingAdds.splice(i,1);
  refreshFamPendingAdds();
}
function refreshFamPendingAdds() {
  const el = document.getElementById("fam-pending-adds");
  if (el) el.innerHTML = famPendingAddsHTML();
}
function famSearchInput(ownerId) {
  const q = document.getElementById("fam-search").value.trim().toLowerCase();
  const ac = document.getElementById("fam-ac");
  document.getElementById("fam-selected-id").value = "";
  if (!q) { ac.classList.remove("open"); ac.innerHTML=""; famAcResults=[]; return; }
  const existingIds = new Set([
    ...(pigs.find(x=>x.id===ownerId)?.family||[]).map(f=>f.pigId).filter(pid=>!famPendingRemoves.includes(pid)),
    ...famPendingAdds.map(f=>f.pigId)
  ]);
  famAcResults = pigs.filter(p =>
    !p.deleted &&
    p.id!==ownerId && !existingIds.has(p.id) &&
    String(p.n||"").toLowerCase().includes(q)
  ).slice(0,8);
  if (!famAcResults.length) { ac.innerHTML = `<div class="fam-ac-item" style="color:var(--text2)">No matching pigs</div>`; ac.classList.add("open"); return; }
  ac.innerHTML = famAcResults.map((p,i) => {
    const av = p.photo ? `<img loading="lazy" decoding="async" width="24" height="24" alt="" src="${xe(p.photoThumb||p.photo)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover">` : `<div class="av" style="${avStyle(p)};width:24px;height:24px;font-size:10px">${ini(p.n)}</div>`;
    return `<div class="fam-ac-item" onclick="famPickResult(${i})">${av}<span>${xe(p.n)}</span></div>`;
  }).join("");
  ac.classList.add("open");
}
function famPickResult(i) {
  const p = famAcResults[i]; if (!p) return;
  document.getElementById("fam-search").value = p.n;
  document.getElementById("fam-selected-id").value = p.id;
  document.getElementById("fam-ac").classList.remove("open");
}
function famAddPending() {
  const pigId = document.getElementById("fam-selected-id").value;
  const relation = document.getElementById("fam-relation").value;
  if (!pigId) { toast("Pick a pig from the suggestions first", "err"); return; }
  famPendingAdds.push({ pigId, relation });
  document.getElementById("fam-search").value = "";
  document.getElementById("fam-selected-id").value = "";
  document.getElementById("fam-ac").classList.remove("open");
  refreshFamPendingAdds();
}
document.addEventListener("click", e => {
  const ac = document.getElementById("fam-ac");
  if (ac && ac.classList.contains("open") && !ac.contains(e.target) && e.target.id!=="fam-search")
    ac.classList.remove("open");
});

// ── One-time repair of legacy family data ────────────────────────────────────
// Fixes two historical issues: duplicate links to the same pig with different
// relation words, and links still storing the raw "nibling"/"auntuncle" labels.
function repairFamilyLinks() {
  let dupes = 0, relabelled = 0;
  const LEGACY = { nibling: true, auntuncle: true };
  pigs.forEach(p => {
    if (!Array.isArray(p.family)) return;
    const seen = new Map();
    p.family.forEach(f => {
      if (!f || !f.pigId) return;
      if (LEGACY[f.relation]) {
        const other = pigs.find(x => x.id === f.pigId);
        const fixed = f.relation === "nibling"
          ? (p.s === "male" ? "uncle" : "aunt")        // they are MY nibling ⇒ I am their aunt/uncle
          : (p.s === "male" ? "nephew" : "niece");
        // relation is stored from the owner's viewpoint: "<other> is my X"
        f.relation = f.relation === "nibling"
          ? (other && other.s === "male" ? "nephew" : "niece")
          : (other && other.s === "male" ? "uncle" : "aunt");
        relabelled++;
      }
      if (seen.has(f.pigId)) { f._drop = true; dupes++; }
      else seen.set(f.pigId, f);
    });
    if (dupes) p.family = p.family.filter(f => !f._drop);
  });
  if (dupes || relabelled) {
    addLog(`Family repair: ${dupes} duplicate link(s) removed, ${relabelled} label(s) corrected`);
    return true;
  }
  return false;
}
