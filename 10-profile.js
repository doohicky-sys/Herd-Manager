// ── Detail modal ──────────────────────────────────────────────────────────────
let currentProfileId = null;
// Horizontal swipe between profiles (mirrors the ‹ › pager)
(function setupProfileSwipe(){
  const ov = document.getElementById("ov-detail");
  if (!ov) return;
  let x0 = null, y0 = null, dx = 0, dy = 0, tracking = false, vertical = false;
  const modal = () => document.getElementById("md");
  ov.addEventListener("touchstart", e => {
    if (!ov.classList.contains("open") || e.touches.length !== 1) { tracking = false; return; }
    // Ignore swipes that begin on something horizontally scrollable
    if (e.target.closest(".fam-grid, .board, .recent-row, textarea, input")) { tracking = false; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; tracking = true;
  }, { passive: true });
  ov.addEventListener("touchmove", e => {
    if (!tracking || x0 === null) return;
    dx = e.touches[0].clientX - x0;
    dy = e.touches[0].clientY - y0;
    const m = modal();
    if (Math.abs(dy) > Math.abs(dx)) {
      // Vertical: only treat a DOWNWARD drag from the top of the modal as a
      // dismiss — otherwise it's an ordinary scroll and we stay out of the way.
      if (dy > 0 && m.scrollTop <= 2 && ov.scrollTop <= 2) {
        vertical = true;
        m.style.transform = `translateY(${dy * 0.5}px)`;
        m.style.opacity = String(Math.max(0.55, 1 - dy / 420));
      } else { tracking = false; m.style.transform = ""; }
      return;
    }
    vertical = false;
    if (Math.abs(dx) > 8) m.style.transform = `translateX(${dx * 0.4}px)`;
  }, { passive: true });
  ov.addEventListener("touchend", () => {
    if (!tracking) return;
    tracking = false;
    const m = modal();
    m.style.transition = "transform .2s ease, opacity .2s ease";
    setTimeout(() => { m.style.transition = ""; }, 220);
    if (vertical) {
      m.style.opacity = "";
      m.style.transform = "";
      if (dy > 110) cov("ov-detail");          // dragged far enough — dismiss
      vertical = false; dx = 0; dy = 0;
      return;
    }
    m.style.transform = "";
    const swipe = dx;          // capture before resetting
    dx = 0; dy = 0;
    if (Math.abs(swipe) < 60) return;
    const id = currentProfileId;
    if (!id) return;
    profileStep(id, swipe < 0 ? 1 : -1);   // swipe left → next pig
  }, { passive: true });
})();

// ── Profile paging (‹ ›) ──────────────────────────────────────────────────────
// Chevrons page through the SAME list the user is looking at, so the order
// matches whatever filter and sort the herd grid currently has.
function currentBrowseList() {
  const ids = [...document.querySelectorAll(".card[data-pig]")].map(el => el.dataset.pig);
  if (ids.length) return ids;
  return pigs.filter(p => !p.deleted && !p.dead && !p.rehomed).map(p => p.id);
}
function profileStep(id, dir) {
  const list = currentBrowseList();
  const i = list.indexOf(id);
  if (i === -1) return;
  const next = list[i + dir];
  if (!next) return;
  if (navigator.vibrate) navigator.vibrate(6);
  openDetail(next);
}
function profileNavHTML(id) {
  const list = currentBrowseList();
  const i = list.indexOf(id);
  if (list.length < 2 || i === -1) return `<div class="pf-pager pf-pager-empty"></div>`;
  return `<div class="pf-pager">
    <button class="pf-pager-btn" ${i<=0?"disabled":""} onclick="profileStep('${xe(id)}',-1)" aria-label="Previous pig">&#8249;</button>
    <span class="pf-pager-pos">${i+1} of ${list.length}</span>
    <button class="pf-pager-btn" ${i>=list.length-1?"disabled":""} onclick="profileStep('${xe(id)}',1)" aria-label="Next pig">&#8250;</button>
  </div>`;
}

// Shared renderer for derived (untagged) relatives
function autoSibCardHTML(sp, label) {
  const sav = sp.photo
    ? `<img loading="lazy" decoding="async" src="${xe(sp.photoThumb||sp.photo)}" alt="${xe(sp.n)}">`
    : `<span>${ini(sp.n)}</span>`;
  return `<div class="fam-card" onclick="closeFamilyAndOpen('${xe(sp.id)}')">
    <div class="av" style="${avStyle(sp)};width:38px;height:38px;font-size:var(--fs-base)">${sav}</div>
    <div class="fam-card-text"><div class="fam-card-name">${xe(sp.n)}</div><div class="fam-card-rel">${xe(label)} <span style="opacity:.6">(auto)</span></div>${sp.dead?`<div class="fam-card-deceased">&#127752; Deceased</div>`:""}</div>
  </div>`;
}
function toggleHalfSibs(pigId) {
  const box = document.getElementById(`halfsibs-${pigId}`);
  const btn = document.getElementById(`halfsibs-btn-${pigId}`);
  if (!box) return;
  const open = box.classList.toggle("open");
  btn?.setAttribute("aria-expanded", open ? "true" : "false");
  if (open && !box.dataset.filled) {
    const p = pigs.find(x => x.id === pigId);
    const halves = getAutoSiblings(p).filter(s => s.type !== "full sibling");
    box.innerHTML = halves.map(s => autoSibCardHTML(s.pig, "half sibling")).join("");
    box.dataset.filled = "1";
  }
}

function openDetail(id) {
  const p = pigs.find(x => x.id===id); if (!p) return;
  const nSafe = String(p.n||"Unnamed");
  const av = p.photo
    ? `<div class="av-wrap" data-photo-wrap style="width:100%;height:100%"><img data-pig-photo decoding="async" fetchpriority="high" width="96" height="96" src="${xe(p.photo)}" alt="Photo of ${xe(nSafe)}" onclick="openPhotoViewer('${xe(p.photo)}')"><div class="av photo-fail-note" style="${avStyle(p)};width:100%;height:100%;font-size:34px;border-radius:50%" hidden>${ini(nSafe)}</div></div>`
    : `<div class="av" style="${avStyle(p)};width:100%;height:100%;font-size:34px;border-radius:50%">${ini(nSafe)}</div>`;
  const age = calcAge(p.d);
  const lits = p.s==="female"
    ? (p.litters&&p.litters.length
        ? p.litters.map((l,i)=>`<div class="ig-row"><span class="ig-key">Litter ${i+1}</span><span class="ig-val"><strong>${xe(l.date)||"Date unknown"}</strong>${l.size?` &middot; ${xe(l.size)} pups`:""}${l.notes?` &middot; ${xe(l.notes)}`:""}</span></div>`).join("")
        : `<div class="ig-free" style="color:var(--text2)">No litters recorded yet.</div>`)
    : "";
  // Family: tagged links + derived auto-siblings
  // Full siblings are shown individually; half siblings are collapsed into a
  // single tappable count, because a big litter's half-siblings can otherwise
  // swamp the whole family section.
  const autoSibs = getAutoSiblings(p);
  const fullSibs = autoSibs.filter(s => s.type === "full sibling");
  const halfSibs = autoSibs.filter(s => s.type !== "full sibling");
  const famCards = (p.family||[]).map(f=>familyCardHTML(f,id)).join("")
    + fullSibs.map(s => autoSibCardHTML(s.pig, "full sibling")).join("")
    + (halfSibs.length ? `
      <button type="button" class="fam-card fam-card-group" onclick="toggleHalfSibs('${xe(id)}')"
              aria-expanded="false" aria-controls="halfsibs-${xe(id)}" id="halfsibs-btn-${xe(id)}">
        <div class="fam-group-count" aria-hidden="true">${halfSibs.length}</div>
        <div class="fam-card-text">
          <div class="fam-card-name">${halfSibs.length} half sibling${halfSibs.length===1?"":"s"}</div>
          <div class="fam-card-rel">Tap to ${halfSibs.length===1?"view":"see them all"}</div>
        </div>
      </button>` : "");
  const statusStrip = p.dead
    ? `<div class="status-strip" style="background:var(--purple-bg);color:var(--purple)">&#127752; Resting on the rainbow bridge</div>`
    : p.rehomed
      ? `<div class="status-strip" style="background:var(--blue-bg);color:var(--blue)">&#127968; Rehomed${p.rh&&p.rh.ownerName?` &mdash; with ${xe(p.rh.ownerName)}`:""}</div>`
      : "";
  const showRhCard = (p.st==="rehome" && !p.dead) || (p.rehomed && p.rh);
  currentProfileId = id;
  noteRecentlyViewed(id);
  document.getElementById("md").innerHTML = `
    <div class="pf-grab" aria-hidden="true"></div>
    <div class="pf-topbar">
      ${profileNavHTML(id)}
      <button class="pf-close" onclick="cov('ov-detail')" aria-label="Close profile">&#10005;</button>
    </div>
    <div class="pf-head">
      <div class="pf-avatar" style="${p.photo?"":avStyle(p)}">${av}</div>
      <div class="pf-name">${xe(nSafe)}</div>
      <!-- Vitals: the three facts you always want, given real hierarchy
           (small label, bold value) instead of five equal-weight pills. -->
      <div class="pf-vitals">
        <div class="pf-vital">
          <div class="pf-vital-label">Sex</div>
          <div class="pf-vital-value ${p.s==="female"?"v-sow":"v-boar"}">${p.s==="female"?"&#9792; Sow":"&#9794; Boar"}</div>
        </div>
        <div class="pf-vital">
          <div class="pf-vital-label">Age</div>
          <div class="pf-vital-value">${age?age.label:"&mdash;"}</div>
        </div>
        <div class="pf-vital">
          <div class="pf-vital-label">Breed</div>
          <div class="pf-vital-value">${p.br?xe(p.br):"&mdash;"}</div>
        </div>
        ${(function(){ const lw = latestWeight(p); return lw ? `
        <div class="pf-vital">
          <div class="pf-vital-label">Weight</div>
          <div class="pf-vital-value">${xe(lw.g)}g</div>
        </div>` : ""; })()}
      </div>
      <!-- Only genuine STATUS gets a coloured pill, so colour keeps meaning -->
      ${(p.r==="yes"||(!p.dead&&!p.rehomed))?`<div class="pf-chips">
        ${p.r==="yes"?`<span class="pf-chip tint-amber">&#129516; Roan carrier</span>`:""}
        ${(!p.dead&&!p.rehomed)?`<span class="pf-chip ${p.st==="stock"?"tint-green":"tint-blue"}">${p.st==="stock"?"&#10003; Stock":"&#127968; For rehome"}</span>`:""}
      </div>`:""}
      ${statusStrip}
    </div>

    <div class="ig-label">About</div>
    <div class="ig-card">
      <div class="ig-row"><span class="ig-key">Description</span><span class="ig-val">${xe(p.de)||"&mdash;"}</span></div>
      <div class="ig-row"><span class="ig-key">Born</span><span class="ig-val">${xe(p.d)||"Unknown"}${age?` &middot; ${age.label} old`:""}</span></div>
      <div class="ig-row"><span class="ig-key">Roan status</span><span class="ig-val">${p.r==="yes"?"Carrier &mdash; don't pair with another carrier":"Non-roan"}</span></div>
      ${p.notes?`<div class="ig-row"><span class="ig-key">Notes</span><span class="ig-val">${xe(p.notes)}</span></div>`:""}
      ${(!p.family||!p.family.length)&&p.rel?`<div class="ig-row"><span class="ig-key">Relations (legacy)</span><span class="ig-val">${xe(p.rel)}</span></div>`:""}
    </div>

    ${showRhCard ? rhCardHTML(p) : ""}

    ${weightCardHTML(p)}

    ${famCards?`<div class="ig-label">Family</div>
    <div class="fam-grid">${famCards}</div>
    <div class="fam-grid fam-halfsibs" id="halfsibs-${xe(id)}"></div>`:""}

    ${p.s==="female"?`<div class="ig-label">Litters (${p.litters?p.litters.length:0})</div>
    <div class="ig-card">${lits}</div>`:""}

    <div class="ma">
      <button class="btn btnsm" onclick="printPedigree('${xe(id)}')">&#128220; Pedigree certificate</button>
      <button class="btn btnd btnsm" onclick="toggleDead('${xe(id)}')">${p.dead?"Mark as alive":"Mark as passed"}</button>
      ${p.rehomed?`<button class="btn btnsm" onclick="toggleRehomed('${xe(id)}')">Move back to herd</button>`:""}
      <button class="btn btnsm" onclick="cov('ov-detail');openEdit('${xe(id)}')">Edit</button>
    </div>`;
  document.getElementById("ov-detail").classList.add("open");
  reattachPhotoResilience();
}
function toggleDead(id) {
  const p = pigs.find(x=>x.id===id); if (!p) return;
  const prev = { dead: p.dead, rehomed: p.rehomed, deadAt: p.deadAt };
  p.dead=!p.dead; if(p.dead){ p.rehomed=false; p.deadAt = new Date().toISOString().slice(0,10); } else { delete p.deadAt; }
  logActivity(p.dead ? `&#127752; ${xe(p.n)} marked as passed` : `${xe(p.n)} marked as alive again`);
  save(); cov("ov-detail"); renderAll();
  toastUndo(p.dead ? `${p.n} marked as passed` : `${p.n} marked as alive`, () => {
    p.dead = prev.dead; p.rehomed = prev.rehomed;
    if (prev.deadAt) p.deadAt = prev.deadAt; else delete p.deadAt;
    save(); renderAll();
  });
}
function toggleRehomed(id) {
  const p = pigs.find(x=>x.id===id); if (!p) return;
  p.rehomed=!p.rehomed; if(p.rehomed) p.dead=false;
  logActivity(p.rehomed ? `&#127968; ${xe(p.n)} marked as rehomed` : `${xe(p.n)} moved back to active herd`);
  save(); cov("ov-detail"); renderAll();
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function lrHTML(i, l) {
  l = l||{};
  return `<div class="le" id="lr${i}">
    <div class="ln">Litter ${i+1} <button class="btn btnd btnsm" style="float:right;height:22px;padding:0 7px;font-size:11px" onclick="rmLitter(${i})">Remove</button></div>
    <div class="twocol" style="margin-top:7px">
      <div class="f"><label>Date</label><input type="date" id="ld${i}" value="${xe(l.date)||""}"></div>
      <div class="f"><label>Litter size</label><input type="number" id="ls${i}" value="${xe(l.size)||""}" min="1" placeholder="No. of pups"></div>
    </div>
    <div class="f"><label>Notes</label><input id="ln${i}" value="${xe(l.notes||"")}" placeholder="Optional notes"></div>
  </div>`;
}
function openEdit(id) {
  editId = id;
  famPendingAdds = [];
  famPendingRemoves = [];
  const p = pigs.find(x=>x.id===id); if (!p) return;
  const lRows = (p.litters||[]).map((l,i)=>lrHTML(i,l)).join("");
  const nSafe = String(p.n||"");
  // Photo area: if URL show img, if base64 show img, if empty show upload prompt
  const photoHTML = p.photo
    ? `<img loading="lazy" decoding="async" src="${xe(p.photo)}" alt="photo">`
    : `<span style="font-size:26px">&#128247;</span><span>Tap to add photo</span>`;
  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit')">&#10005;</button>
    <div class="mt">Edit: ${xe(nSafe)}</div>
    <div class="pdrop" id="pdrop${id}" onclick="document.getElementById('pfi${id}').click()">
      ${photoHTML}
    </div>
    <input type="file" id="pfi${id}" accept="image/*" style="display:none" onchange="handlePhoto('${xe(id)}')">
    <div class="twocol">
      <div class="f"><label>Name</label><input id="en" value="${xe(nSafe)}"></div>
      <div class="f"><label>Sex</label><select id="es">
        <option value="female"${p.s==="female"?" selected":""}>Sow (female)</option>
        <option value="male"${p.s==="male"?" selected":""}>Boar (male)</option>
      </select></div>
    </div>
    <div class="twocol">
      <div class="f"><label>Date of birth</label><input type="date" id="ed" value="${xe(p.d)||""}"></div>
      <div class="f"><label>Breed</label><input id="ebr" value="${xe(p.br||"")}"></div>
    </div>
    <div class="f"><label>Description</label><textarea id="ede">${xe(p.de||"")}</textarea></div>
    <div class="f">
      <label>Family members</label>
      <div class="fam-pending-list" id="fam-list">${(p.family||[]).map((f,i)=>famPendingRowHTML(f,i)).join("")}</div>
      <div class="fam-pending-list" id="fam-pending-adds"></div>
      <div class="fam-add-row">
        <div class="f">
          <input id="fam-search" placeholder="Type a pig's name&#8230;" autocomplete="off" oninput="famSearchInput('${xe(id)}')" onfocus="famSearchInput('${xe(id)}')">
          <div class="fam-autocomplete" id="fam-ac"></div>
        </div>
        <select id="fam-relation" style="width:120px;height:36px">
          ${RELATION_LABELS.map(r=>`<option value="${r}">${r}</option>`).join("")}
        </select>
        <button type="button" class="btn btnsm" onclick="famAddPending()" style="height:36px">Add</button>
      </div>
      <input type="hidden" id="fam-selected-id">
    </div>
    ${p.rel?`<div class="f"><label>Old relations note (read-only, kept for reference)</label><div style="font-size:12px;color:var(--text2);background:var(--bg2);border-radius:var(--r2);padding:8px 10px">${xe(p.rel)}</div></div>`:""}
    <div class="twocol">
      <div class="f"><label>Roan status</label><select id="er">
        <option value="no"${p.r!=="yes"?" selected":""}>Non-roan</option>
        <option value="yes"${p.r==="yes"?" selected":""}>Roan carrier</option>
      </select></div>
      <div class="f"><label>Status</label><select id="est">
        <option value="stock"${p.st==="stock"?" selected":""}>Stock</option>
        <option value="rehome"${p.st==="rehome"?" selected":""}>For rehome</option>
      </select></div>
    </div>
    <div class="f"><label>Notes</label><textarea id="eno">${xe(p.notes||"")}</textarea></div>
    ${p.s==="female"?`
    <div style="display:flex;align-items:center;justify-content:space-between;margin:10px 0 8px">
      <strong style="font-size:13px">Litters</strong>
      <button class="btn btnsm" onclick="addLitter()">+ Add litter</button>
    </div>
    <div id="llist">${lRows}</div>`:""}
    <div class="ma">
      <button class="btn btnd btnsm" onclick="delPig('${xe(id)}')">Delete pig</button>
      <button class="btn btnsm" onclick="cov('ov-edit')">Cancel</button>
      <button class="btn btnp btnsm" onclick="saveEdit('${xe(id)}')">Save changes</button>
    </div>`;
  document.getElementById("ov-edit").classList.add("open");
}

async function handlePhoto(id) {
  const f = document.getElementById(`pfi${id}`).files[0]; if (!f) return;
  const drop = document.getElementById(`pdrop${id}`);
  // Show uploading overlay
  drop.innerHTML += `<div class="uploading">Uploading&#8230;</div>`;
  const reader = new FileReader();
  reader.onload = async e => {
    const res = await uploadToImgBB(e.target.result);
    const p = pigs.find(x=>x.id===id);
    if (p) { p.photo = res.url; p.photoThumb = res.thumb; save(); }
    drop.innerHTML = `<img src="${res.url}" alt="photo">`;
  };
  reader.readAsDataURL(f);
}

function addLitter() {
  const ll = document.getElementById("llist");
  const count = ll.querySelectorAll(".le").length;
  const d = document.createElement("div"); d.innerHTML = lrHTML(count,{});
  ll.appendChild(d.firstChild);
}
function rmLitter(i) { const e = document.getElementById(`lr${i}`); if(e) e.remove(); }
function saveEdit(id) {
  const p = pigs.find(x=>x.id===id); if (!p) return;
  p.n     = document.getElementById("en").value.trim();
  p.s     = document.getElementById("es").value;
  p.d     = document.getElementById("ed").value;
  p.br    = document.getElementById("ebr").value.trim();
  p.de    = document.getElementById("ede").value.trim();
  p.r     = document.getElementById("er").value;
  p.st    = document.getElementById("est").value;
  p.notes = document.getElementById("eno").value.trim();
  let litterAdded = false;
  if (p.s==="female") {
    const rows = document.querySelectorAll("#llist .le");
    const prevCount = (p.litters||[]).length;
    p.litters = Array.from(rows).map((_,i) => ({
      date:  (document.getElementById(`ld${i}`)||{value:""}).value,
      size:  (document.getElementById(`ls${i}`)||{value:""}).value,
      notes: (document.getElementById(`ln${i}`)||{value:""}).value
    }));
    if (p.litters.length > prevCount) litterAdded = true;
  }
  // Apply staged family changes (bidirectional link/unlink)
  let famChanged = false;
  famPendingRemoves.forEach(otherId => { unlinkFamily(id, otherId); famChanged = true; });
  famPendingAdds.forEach(f => { linkFamily(id, f.pigId, f.relation); famChanged = true; });
  famPendingAdds = []; famPendingRemoves = [];
  logActivity(litterAdded ? `&#127880; New litter logged for ${xe(p.n)}` : `${xe(p.n)}'s profile was updated`);
  if (famChanged) logActivity(`${xe(p.n)}'s family connections were updated`);
  save(); cov("ov-edit"); renderAll();
  if (litterAdded) fireConfetti();
}
async function delPig(id) {
  const p = pigs.find(x=>x.id===id);
  if (!p) return;
  const ok = await confirmSheet({
    title: `Move ${p.n} to the bin?`,
    body: "You can restore them from More \u2192 Recently deleted for 30 days.",
    confirmLabel: "Move to bin", danger: true
  });
  if (!ok) return;
  p.deleted = true;
  p.deletedAt = new Date().toISOString();
  logActivity(`&#128465; ${xe(p.n)} was moved to the bin`);
  save(); cov("ov-edit"); renderAll();
  toastUndo(`${p.n} moved to the bin`, () => {
    delete p.deleted; delete p.deletedAt;
    logActivity(`${xe(p.n)} was restored`);
    save(); renderAll();
  });
}

// ── Add modal ─────────────────────────────────────────────────────────────────
function openAdd() {
  document.getElementById("ma").innerHTML = `
    <button class="mc" onclick="cov('ov-add')">&#10005;</button>
    <div class="mt">Add new pig</div>
    <div class="twocol">
      <div class="f"><label>Name</label><input id="an" placeholder="Name or description"></div>
      <div class="f"><label>Sex</label><select id="as"><option value="female">Sow (female)</option><option value="male">Boar (male)</option></select></div>
    </div>
    <div class="twocol">
      <div class="f"><label>Date of birth</label><input type="date" id="ad"></div>
      <div class="f"><label>Breed</label><input id="abr" placeholder="e.g. Teddy, Smooth, Cali&#8230;"></div>
    </div>
    <div class="f"><label>Description</label><textarea id="ade" placeholder="Colour, markings, coat type&#8230;"></textarea></div>
    <p style="font-size:12px;color:var(--text2);margin:-4px 0 4px">&#128106; Family members can be linked once the pig is saved &mdash; open their profile and tap Edit.</p>
    <div class="twocol">
      <div class="f"><label>Roan status</label><select id="ar"><option value="no">Non-roan</option><option value="yes">Roan carrier</option></select></div>
      <div class="f"><label>Status</label><select id="ast"><option value="stock">Stock</option><option value="rehome">For rehome</option></select></div>
    </div>
    <div class="f"><label>Notes</label><textarea id="ano" placeholder="Any additional notes&#8230;"></textarea></div>
    <div class="ma">
      <button class="btn btnsm" onclick="cov('ov-add')">Cancel</button>
      <button class="btn btnp btnsm" onclick="saveAdd()">Add pig</button>
    </div>`;
  document.getElementById("ov-add").classList.add("open");
}
function saveAdd() {
  const n = document.getElementById("an").value.trim();
  if (!n) { toast("Please enter a name or description", "err"); return; }
  pigs.unshift({
    id: `p${Date.now()}`, n,
    s:     document.getElementById("as").value,
    d:     document.getElementById("ad").value,
    br:    document.getElementById("abr").value.trim(),
    de:    document.getElementById("ade").value.trim(),
    r:     document.getElementById("ar").value,
    st:    document.getElementById("ast").value,
    notes: document.getElementById("ano").value.trim(),
    dead: false, rehomed: false, litters: [], photo: "", family: []
  });
  logActivity(`&#127881; ${xe(n)} was added to the herd`);
  save(); cov("ov-add"); renderAll();
  fireConfetti();
}
