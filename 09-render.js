// ── Recently viewed ───────────────────────────────────────────────────────────
let recentIds = [];
try { recentIds = JSON.parse(localStorage.getItem("gp_recent") || "[]"); } catch(e) { recentIds = []; }
function noteRecentlyViewed(id) {
  recentIds = [id, ...recentIds.filter(x => x !== id)].slice(0, 12);
  try { localStorage.setItem("gp_recent", JSON.stringify(recentIds)); } catch(e) {}
  renderRecent();
}
function renderRecent() {
  const el = document.getElementById("recent-strip");
  if (!el) return;
  const list = recentIds
    .map(id => pigs.find(p => p.id === id))
    .filter(p => p && !p.deleted && !p.dead && !p.rehomed)
    .slice(0, 8);
  if (list.length < 2) { el.innerHTML = ""; el.style.display = "none"; return; }
  el.style.display = "block";
  el.innerHTML = `<div class="recent-label">Recently viewed</div>
    <div class="recent-row">${list.map(p => {
      const av = p.photo
        ? `<div class="av-wrap" data-photo-wrap style="width:44px;height:44px"><img data-pig-photo loading="lazy" decoding="async" width="44" height="44" alt="" src="${xe(p.photoThumb||p.photo)}"><div class="av photo-fail-note" style="${avStyle(p)};width:44px;height:44px;font-size:14px" hidden>${ini(p.n)}</div></div>`
        : `<div class="av" style="${avStyle(p)};width:44px;height:44px;font-size:var(--fs-sm)">${ini(p.n)}</div>`;
      return `<button class="recent-item" onclick="openDetail('${xe(p.id)}')" aria-label="Open ${xe(p.n)}">
        <div class="recent-av">${av}</div><div class="recent-name">${xe(p.n)}</div>
      </button>`;
    }).join("")}</div>`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
// Single source of truth for age formatting. This used to be a second,
// slightly different implementation that only showed days under ONE month —
// which is why a 50-day-old read "50d" on their profile but "1mo" on their
// card. It now simply delegates to calcAge().
function getAge(dob) {
  if (typeof calcAge === "function") {
    const a = calcAge(dob);
    if (a) return a.label;
    return "?";
  }
  // Self-contained fallback so a load-order problem can never resurrect the
  // old "1mo for a 50-day-old" behaviour.
  if (!dob) return "?";
  const d = new Date(dob), n = new Date();
  if (isNaN(d)) return "?";
  const days = Math.max(0, Math.floor((n - d) / 86400000));
  let months = (n.getFullYear()-d.getFullYear())*12 + (n.getMonth()-d.getMonth());
  if (n.getDate() < d.getDate()) months--;
  if (months < 0) months = 0;
  if (months < 3) return `${days}d`;
  const y = Math.floor(months/12), m = months%12;
  return y > 0 ? `${y}y ${m}mo` : `${m}mo`;
}
function ini(name) {
  const w = String(name||"?").trim().split(/\s+/);
  return w.length >= 2 ? (w[0][0]+w[1][0]).toUpperCase() : String(name||"?").substring(0,2).toUpperCase();
}
function avStyle(p) {
  if (p.r==="yes") return "background:var(--amber-bg);color:var(--amber)";
  return p.s==="female" ? "background:var(--pink-bg);color:var(--pink)" : "background:var(--blue-bg);color:var(--blue)";
}
function xe(s) {
  // Escapes ALL five HTML-significant characters. The single quote matters:
  // data is interpolated into onclick="fn('...')" attributes throughout.
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function sbadge(p) {
  if (p.dead)    return `<span class="badge bpassed">Passed</span>`;
  if (p.rehomed) return `<span class="badge brehomed">Rehomed</span>`;
  if (p.st==="stock") return `<span class="badge bstock">Stock</span>`;
  return `<span class="badge brehome">For rehome</span>`;
}

// ── Coat colour swatch detection ────────────────────────────────────────────
// Scans the description text for colour keywords and returns a CSS gradient
// so each pig gets a quick-glance visual identity even without a photo.
const COAT_COLOURS = [
  { words: ["lilac","lavender"], hex: ["#c9b6d9","#e3d4ee"] },
  { words: ["chocolate","choc"], hex: ["#6b4226","#9c6b43"] },
  { words: ["black"], hex: ["#2b2b2b","#4a4a4a"] },
  { words: ["white","dew","rew"], hex: ["#f5f3ee","#e8e4d8"] },
  { words: ["cream"], hex: ["#f3e3c4","#ead9ad"] },
  { words: ["buff"], hex: ["#dcb583","#c99a63"] },
  { words: ["gold","golden"], hex: ["#e0ad3d","#c98f1f"] },
  { words: ["ginger"], hex: ["#d97a2c","#b85f1b"] },
  { words: ["saffron"], hex: ["#e8a93d","#cf8a1e"] },
  { words: ["silver"], hex: ["#c7cdd1","#a6aeb4"] },
  { words: ["slate"], hex: ["#5c6670","#454d54"] },
  { words: ["agouti"], hex: ["#9c7b4f","#7a5d38"] },
  { words: ["brown"], hex: ["#6e4a2e","#523619"] },
  { words: ["lemon"], hex: ["#f0dd87","#dcc564"] },
  { words: ["tricolour","tricolor"], hex: ["#f5f3ee","#2b2b2b"] },
  { words: ["roan"], hex: ["#e8c9d6","#9c7b4f"] },
];
function coatGradient(desc) {
  const d = String(desc||"").toLowerCase();
  const found = [];
  for (const c of COAT_COLOURS) {
    if (c.words.some(w => d.includes(w))) found.push(c.hex);
    if (found.length >= 2) break;
  }
  if (!found.length) return "linear-gradient(135deg,#d8d4c8,#bfb9a8)";
  if (found.length === 1) return `linear-gradient(135deg,${found[0][0]},${found[0][1]})`;
  return `linear-gradient(135deg,${found[0][0]} 0%,${found[0][0]} 48%,${found[1][0]} 52%,${found[1][1]} 100%)`;
}
function swatchDot(p) {
  return `<span class="swatch-dot" style="background:${coatGradient(p.de)}" title="Coat colour"></span>`;
}
function ringClass(p) {
  if (p.dead) return "ring-passed";
  if (p.rehomed) return "ring-rehomed";
  if (p.r === "yes") return "ring-roan";
  return "ring-stock";
}

// ── Photo viewer (tap to zoom) ──────────────────────────────────────────────
let pvScale = 1, pvX = 0, pvY = 0, pvPointers = {}, pvLastDist = 0, pvDragging = false, pvLastPt = null;
function openPhotoViewer(url) {
  if (!url) return;
  const img = document.getElementById("pv-img");
  img.src = url;
  pvScale = 1; pvX = 0; pvY = 0;
  applyPvTransform();
  document.getElementById("photo-viewer").classList.add("open");
}
function closePhotoViewer() {
  document.getElementById("photo-viewer").classList.remove("open");
}
function closeViewerIfBg(e) {
  if (e.target.id === "photo-viewer") closePhotoViewer();
}
function applyPvTransform() {
  const img = document.getElementById("pv-img");
  img.style.transform = `translate(${pvX}px,${pvY}px) scale(${pvScale})`;
}
(function setupPhotoViewerGestures(){
  const img = document.getElementById("pv-img");
  if (!img) return;
  img.addEventListener("wheel", e => {
    e.preventDefault();
    pvScale = Math.min(5, Math.max(1, pvScale - e.deltaY * 0.0015));
    applyPvTransform();
  }, { passive: false });
  img.addEventListener("pointerdown", e => {
    pvPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (Object.keys(pvPointers).length === 1) { pvDragging = true; pvLastPt = { x: e.clientX, y: e.clientY }; }
  });
  img.addEventListener("pointermove", e => {
    if (!pvPointers[e.pointerId]) return;
    pvPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    const pts = Object.values(pvPointers);
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      if (pvLastDist) pvScale = Math.min(5, Math.max(1, pvScale * (dist/pvLastDist)));
      pvLastDist = dist;
      applyPvTransform();
    } else if (pts.length === 1 && pvDragging && pvScale > 1) {
      pvX += e.clientX - pvLastPt.x;
      pvY += e.clientY - pvLastPt.y;
      pvLastPt = { x: e.clientX, y: e.clientY };
      applyPvTransform();
    }
  });
  function endPt(e) {
    delete pvPointers[e.pointerId];
    pvLastDist = 0;
    if (Object.keys(pvPointers).length === 0) pvDragging = false;
  }
  img.addEventListener("pointerup", endPt);
  img.addEventListener("pointercancel", endPt);
  img.addEventListener("dblclick", () => { pvScale = pvScale > 1 ? 1 : 2.2; pvX = 0; pvY = 0; applyPvTransform(); });
})();

// ── Confetti celebration (new litter logged) ────────────────────────────────
function fireConfetti() {
  const canvas = document.getElementById("confetti-canvas");
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  canvas.style.display = "block";
  const ctx = canvas.getContext("2d");
  const colours = ["#f4c0d1","#b5d4f4","#fac775","#c0dd97","#d4b8f5"];
  const pieces = Array.from({length: 90}, () => ({
    x: Math.random()*canvas.width, y: -20-Math.random()*canvas.height*0.3,
    r: 4+Math.random()*5, c: colours[Math.floor(Math.random()*colours.length)],
    vy: 2+Math.random()*3, vx: -1.5+Math.random()*3, rot: Math.random()*360, vr: -6+Math.random()*12
  }));
  let frame = 0;
  function tick() {
    frame++;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r,-p.r*0.6,p.r*2,p.r*1.2);
      ctx.restore();
    });
    if (frame < 110) requestAnimationFrame(tick);
    else { canvas.style.display = "none"; ctx.clearRect(0,0,canvas.width,canvas.height); }
  }
  tick();
}

// ── Pig of the day spotlight ─────────────────────────────────────────────────
function renderSpotlight() {
  const el = document.getElementById("spotlight-container");
  if (!el) return;
  const pool = pigs.filter(p => !p.deleted && !p.dead && !p.rehomed);
  if (!pool.length) { el.innerHTML = ""; return; }
  // Stable pick per day so it doesn't change on every render
  const daySeed = new Date().toISOString().slice(0,10).split("-").join("");
  const idx = parseInt(daySeed, 10) % pool.length;
  const p = pool[idx];
  const av = p.photo ? `<div class="av-wrap" data-photo-wrap><img data-pig-photo loading="lazy" decoding="async" width="56" height="56" src="${xe(p.photoThumb||p.photo)}" alt="Photo of ${xe(p.n)}"><div class="av photo-fail-note" style="${avStyle(p)}" hidden>${ini(p.n)}</div></div>` : `<div class="av" style="${avStyle(p)};width:100%;height:100%;font-size:18px">${ini(p.n)}</div>`;
  el.innerHTML = `<div class="spotlight" onclick="openDetail('${xe(p.id)}')">
    <div class="spotlight-av">${av}</div>
    <div class="spotlight-text">
      <div class="spotlight-label">&#10024; Piggy of the day</div>
      <div class="spotlight-name">${xe(p.n)}</div>
      <div class="spotlight-desc">${xe(p.br||"")} &middot; ${getAge(p.d)}</div>
    </div>
    ${swatchDot(p)}
  </div>`;
  reattachPhotoResilience();
}


// ── Render ────────────────────────────────────────────────────────────────────
function renderStats() {
  if (!Array.isArray(pigs)) return;
  const a = pigs.filter(p => !p.deleted && !p.dead && !p.rehomed);
  document.getElementById("stats").innerHTML = `
    <div class="stat"><div class="sn">${a.length}</div><div class="sl">Active</div></div>
    <div class="stat"><div class="sn">${a.filter(p=>p.s==="female").length}</div><div class="sl">Sows</div></div>
    <div class="stat"><div class="sn">${a.filter(p=>p.s==="male").length}</div><div class="sl">Boars</div></div>
    <div class="stat"><div class="sn">${a.filter(p=>p.r==="yes").length}</div><div class="sl">Roan carriers</div></div>
    <div class="stat" style="cursor:pointer" onclick="navGo('rehomed')"><div class="sn">${pigs.filter(p=>!p.deleted&&p.rehomed&&!p.dead).length}</div><div class="sl">Rehomed &rsaquo;</div></div>
    <div class="stat" style="cursor:pointer" onclick="navGo('rainbow')"><div class="sn">${pigs.filter(p=>!p.deleted&&p.dead).length}</div><div class="sl">Rainbow bridge &rsaquo;</div></div>`;
}
function cardHTML(p) {
  const nSafe = String(p.n||"Unnamed");
  const unnamed = nSafe.startsWith("Unnamed")||nSafe.startsWith("Orphan");
  const descRaw = String(p.de||"");
  const desc = descRaw.length > 58 ? `${xe(descRaw.substring(0,56))}&#8230;` : xe(descRaw);
  const av = p.photo ? `<img loading="lazy" decoding="async" src="${xe(p.photoThumb||p.photo)}" alt="${xe(nSafe)}">` : `<span>${ini(p.n)}</span>`;
  return `<div class="card" data-pig="${xe(p.id)}" onclick="openDetail('${xe(p.id)}')">
    <div class="ch">
      <div class="av" style="${avStyle(p)}">${av}</div>
      <div><div class="cn-row"><div class="cn">${xe(nSafe)}</div></div><div class="cs">${xe(p.br||"")} &middot; ${getAge(p.d)}</div></div>
    </div>
    <div class="cd">${desc}</div>
    <div class="badges">
      <span class="badge ${p.s==="female"?"bsow":"bboar"}">${p.s==="female"?"&#9792; Sow":"&#9794; Boar"}</span>
      ${p.r==="yes"?`<span class="badge broan">Roan carrier</span>`:""}
      ${sbadge(p)}
      ${unnamed?`<span class="badge" style="background:var(--bg3);color:var(--text2)">Unnamed</span>`:""}
    </div>
  </div>`;
}
function skeletonCardHTML() {
  return `<div class="skel-card">
    <div class="skel-row"><div class="skel-line skel-av"></div>
      <div class="skel-text"><div class="skel-line skel-t1"></div><div class="skel-line skel-t2"></div></div>
    </div>
    <div class="skel-line skel-t3"></div><div class="skel-line skel-t4"></div>
  </div>`;
}
function renderSkeleton() {
  const g = document.getElementById("grid");
  if (g) g.innerHTML = Array.from({length:8}).map(skeletonCardHTML).join("");
}
function renderFilterChips() {
  const el = document.getElementById("filter-chips");
  if (!el) return;
  const fs = document.getElementById("fsex").value;
  const fr = document.getElementById("froan").value;
  const fst = document.getElementById("fst").value;
  const q = document.getElementById("fsearch").value;
  const chips = [];
  if (q) chips.push({ label: `"${xe(q)}"`, clear: () => { document.getElementById("fsearch").value=""; renderGrid(); } });
  if (fs) chips.push({ label: fs==="female"?"Sows":"Boars", clear: () => { document.getElementById("fsex").value=""; renderGrid(); } });
  if (fr) chips.push({ label: fr==="yes"?"Roan carrier":"Non-roan", clear: () => { document.getElementById("froan").value=""; renderGrid(); } });
  if (fst) chips.push({ label: fst==="stock"?"Stock":"For rehome", clear: () => { document.getElementById("fst").value=""; renderGrid(); } });
  if (!chips.length) { el.innerHTML = ""; return; }
  window.__chipClears = chips.map(c => c.clear);
  el.innerHTML = chips.map((c,i) => `<span class="filter-chip">${c.label}<button onclick="window.__chipClears[${i}]()">&#10005;</button></span>`).join("");
}
function renderGrid() {
  if (!Array.isArray(pigs)) return;
  const q = (document.getElementById("fsearch").value||"").toLowerCase();
  const fs = document.getElementById("fsex").value;
  const fr = document.getElementById("froan").value;
  const fst = document.getElementById("fst").value;
  const sort = (document.getElementById("fsort")||{value:"recent"}).value;
  const list = pigs.filter(p => {
    if (p.deleted||p.dead||p.rehomed) return false;
    if (healthFilterIds && !healthFilterIds.has(p.id)) return false;
    if (fs && p.s!==fs) return false;
    if (fr && p.r!==fr) return false;
    if (fst && p.st!==fst) return false;
    if (q && !(String(p.n||"")+" "+String(p.br||"")+" "+String(p.de||"")).toLowerCase().includes(q)) return false;
    return true;
  });
  if (sort==="name") list.sort((a,b)=>String(a.n||"").localeCompare(String(b.n||"")));
  else if (sort==="young") list.sort((a,b)=>String(b.d||"0000").localeCompare(String(a.d||"0000")));
  else if (sort==="old") list.sort((a,b)=>String(a.d||"9999").localeCompare(String(b.d||"9999")));
  // "recent" keeps natural array order (newest pigs are unshifted to the front)
  renderFilterChips();
  document.getElementById("grid").innerHTML = list.length
    ? list.map(cardHTML).join("")
    : `<div class="empty"><span class="empty-icon">&#128270;</span>No pigs match your filters.<div class="empty-sub">Try clearing a filter or search term above.</div></div>`;
  reattachPhotoResilience();
  // U3 — always tell the user how much of the herd they're looking at
  const totalActive = pigs.filter(p=>!p.deleted&&!p.dead&&!p.rehomed).length;
  const countEl = document.getElementById("grid-count");
  syncSearchClear();
  updateFilterButton();
  // Only worth saying anything when a filter is actually hiding pigs —
  // the unfiltered total is already in the Active stat at the top.
  if (healthFilterIds && countEl) {
    countEl.innerHTML = `${list.length} pig${list.length===1?"":"s"} &middot; ${xe(healthFilterLabel)} <button class="count-clear" onclick="clearHealthFilter()">Clear</button>`;
  } else if (countEl) countEl.textContent = (q||fs||fr||fst)
    ? `Showing ${list.length} of ${totalActive} pigs`
    : "";
}
// P2 — refresh a single card instead of rebuilding all ~150 of them
function updateCard(id) {
  const p = pigs.find(x => x.id === id);
  const node = document.querySelector(`.card[data-pig="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
  if (!p || !node || p.deleted || p.dead || p.rehomed) { renderGrid(); renderStats(); return; }
  node.outerHTML = cardHTML(p);
  renderStats();
}
function renderRainbow() {
  const rb = pigs.filter(p => !p.deleted && p.dead);
  document.getElementById("rbgrid").innerHTML = rb.length
    ? rb.map(p => `<div style="opacity:.75">${cardHTML(p)}</div>`).join("")
    : `<div class="empty"><span class="empty-icon">&#127752;</span>No pigs on the rainbow bridge.<div class="empty-sub">Pigs marked as passed will appear here.</div></div>`;
}
function renderRehomed() {
  const rh = pigs.filter(p => !p.deleted && p.rehomed&&!p.dead);
  document.getElementById("rhgrid").innerHTML = rh.length
    ? rh.map(p => `<div style="opacity:.8">${cardHTML(p)}</div>`).join("")
    : `<div class="empty"><span class="empty-icon">&#127968;</span>No rehomed pigs recorded.<div class="empty-sub">Pigs marked as rehomed will appear here.</div></div>`;
}
function populateBreed() {
  const sows = pigs.filter(p => !p.deleted&&!p.dead&&!p.rehomed&&p.s==="female");
  const boars = pigs.filter(p => !p.deleted&&!p.dead&&!p.rehomed&&p.s==="male");
  document.getElementById("bsow").innerHTML = `<option value="">Select sow&#8230;</option>`+sows.map(p=>`<option value="${p.id}">${xe(p.n||"Unnamed")}</option>`).join("");
  document.getElementById("bboar").innerHTML = `<option value="">Select boar&#8230;</option>`+boars.map(p=>`<option value="${p.id}">${xe(p.n||"Unnamed")}</option>`).join("");
}
function checkBreed() {
  const sow = pigs.find(p => p.id===document.getElementById("bsow").value);
  const boar = pigs.find(p => p.id===document.getElementById("bboar").value);
  const el = document.getElementById("bres");
  if (!sow||!boar) { el.innerHTML=""; return; }
  const warns = [];
  if (sow.r==="yes"&&boar.r==="yes")
    warns.push("&#9888;&#65039; Both carry Roan &mdash; pairing risks lethal white offspring. Avoid this combination.");
  const directLink = (sow.family||[]).find(f=>f.pigId===boar.id);
  if (directLink) {
    warns.push(`&#9888;&#65039; ${xe(sow.n)} and ${xe(boar.n)} are tagged as ${xe(directLink.relation)} in the family tree &mdash; avoid this pairing.`);
  } else {
    // Walk both ancestries up to 4 generations and look for overlap
    const sowAnc = ancestorsOf(sow.id, 4), boarAnc = ancestorsOf(boar.id, 4);
    const GEN_WORD = {1:"parent",2:"grandparent",3:"great-grandparent",4:"great-great-grandparent"};
    const shared = [];
    sowAnc.forEach((sGen, ancId) => {
      if (boarAnc.has(ancId)) {
        const anc = pigs.find(x=>x.id===ancId);
        if (anc) shared.push(`<strong>${xe(anc.n)}</strong> (${xe(sow.n)}'s ${GEN_WORD[sGen]}, ${xe(boar.n)}'s ${GEN_WORD[boarAnc.get(ancId)]})`);
      }
    });
    // Also catch one being the other's ancestor outright
    if (sowAnc.has(boar.id)) shared.unshift(`<strong>${xe(boar.n)}</strong> is ${xe(sow.n)}'s ${GEN_WORD[sowAnc.get(boar.id)]}`);
    if (boarAnc.has(sow.id)) shared.unshift(`<strong>${xe(sow.n)}</strong> is ${xe(boar.n)}'s ${GEN_WORD[boarAnc.get(sow.id)]}`);
    if (shared.length) {
      warns.push(`&#9888;&#65039; Shared ancestry found &mdash; ${shared.join("; ")}. These two are related &mdash; avoid this pairing.`);
    } else {
      const sr=String(sow.rel||"").toLowerCase(), br=String(boar.rel||"").toLowerCase();
      const legacyTextMatch = (boar.n&&sr.includes(String(boar.n).toLowerCase()))||(sow.n&&br.includes(String(sow.n).toLowerCase()));
      if (legacyTextMatch)
        warns.push(`&#9888;&#65039; ${xe(sow.n)} and ${xe(boar.n)} appear in each other&apos;s legacy relation notes &mdash; possible close relatives, please double check.`);
    }
  }
  el.innerHTML = warns.length
    ? warns.map(w=>`<div class="wbox">${w}</div>`).join("")
    : `<div class="okbox">&#10003; No compatibility issues found for <strong>${xe(sow.n)}</strong> &times; <strong>${xe(boar.n)}</strong> &mdash; no shared ancestors within 4 generations, no Roan conflict.</div>`;
}

// ── Family tree ───────────────────────────────────────────────────────────────
function filterTreeOptions() {
  const q = (document.getElementById("ft-search")||{value:""}).value.toLowerCase();
  const sel = document.getElementById("ft-select");
  if (!sel) return;
  [...sel.options].forEach(o => {
    if (!o.value) return;
    o.hidden = q ? !o.textContent.toLowerCase().includes(q) : false;
  });
  // Jump straight to the first match so typing feels like searching
  if (q) {
    const first = [...sel.options].find(o => o.value && !o.hidden);
    if (first) { sel.value = first.value; renderFamilyTree(); }
  }
}
function defaultTreePig() {
  const linked = pigs.filter(p=>!p.deleted&&!p.dead&&(p.family||[]).length);
  if (!linked.length) return null;
  // Most-connected pig makes the most interesting default tree
  return linked.sort((a,b)=>(b.family||[]).length-(a.family||[]).length)[0];
}
function populateFamilyTreeSelect() {
  const sel = document.getElementById("ft-select");
  const current = sel.value;
  const active = pigs.filter(p=>!p.deleted&&!p.dead).sort((a,b)=>String(a.n||"").localeCompare(String(b.n||"")));
  sel.innerHTML = `<option value="">Select a pig&#8230;</option>` + active.map(p=>`<option value="${p.id}">${xe(p.n||"Unnamed")}</option>`).join("");
  if (current && pigs.some(p=>p.id===current)) {
    sel.value = current;
  } else {
    // Land on the most-connected pig rather than an empty screen with a dropdown
    const def = defaultTreePig();
    if (def) sel.value = def.id;
  }
  renderFamilyTree();
}
function treeNodeHTML(p, opts) {
  opts = opts || {};
  const av = p.photo ? `<img loading="lazy" decoding="async" src="${xe(p.photoThumb||p.photo)}" alt="">` : `<span>${ini(p.n||"?")}</span>`;
  return `<div class="tree-node${opts.center?" center":""}" onclick="jumpToFamilyTree('${xe(p.id)}')">
    <div class="tree-node-av">${av}</div>
    <div class="tree-node-name">${xe(p.n||"Unnamed")}</div>
    ${opts.rel?`<div class="tree-node-rel">${xe(opts.rel)}</div>`:""}
    ${p.dead?`<div class="tree-node-deceased">&#127752; Deceased</div>`:""}
  </div>`;
}
function jumpToFamilyTree(id) {
  const sel = document.getElementById("ft-select");
  sel.value = id;
  renderFamilyTree();
}
// Debounced grid render — avoids re-rendering 150+ cards on every keypress
let _gridDebounce = null;
// ── Filter sheet ─────────────────────────────────────────────────────────────
function openFilterSheet(){ openSheetById("filter-sheet"); }
function closeFilterSheet(){ closeSheetById("filter-sheet"); }
function applyFilters(){ renderGrid(); updateFilterButton(); }
function resetFilters(){
  ["fsex","froan","fst"].forEach(id => { const el=document.getElementById(id); if (el) el.value=""; });
  const s=document.getElementById("fsort"); if (s) s.value="recent";
  applyFilters();
}
function activeFilterCount(){
  return ["fsex","froan","fst"].filter(id => (document.getElementById(id)||{}).value).length;
}
function updateFilterButton(){
  const n = activeFilterCount();
  const btn = document.getElementById("filter-btn");
  const lbl = document.getElementById("filter-btn-label");
  if (!btn || !lbl) return;
  lbl.textContent = n ? `Filter · ${n}` : "Filter";
  btn.classList.toggle("filter-btn-on", n > 0);
  btn.setAttribute("aria-label", n ? `Filter and sort, ${n} filter${n===1?"":"s"} active` : "Filter and sort");
}
function clearSearch() {
  const s = document.getElementById("fsearch");
  if (s) { s.value = ""; s.focus(); }
  renderGrid();
}
function syncSearchClear() {
  const s = document.getElementById("fsearch");
  const b = document.getElementById("fsearch-clear");
  if (s && b) b.style.display = s.value ? "flex" : "none";
}
function debouncedGrid() {
  syncSearchClear();
  clearTimeout(_gridDebounce);
  _gridDebounce = setTimeout(renderGrid, 160);
}
function familyByGroup(p, relations) {
  return (p.family||[]).filter(f=>relations.includes(f.relation)).map(f=>({ link:f, pig: pigs.find(x=>x.id===f.pigId) })).filter(x=>x.pig && !x.pig.deleted);
}
function renderFamilyTree() {
  const id = document.getElementById("ft-select").value;
  const container = document.getElementById("familytree-container");
  if (!id) { container.innerHTML = `<div class="empty"><span class="empty-icon">&#127795;</span>Select a pig above to see their family tree.</div>`; return; }
  const p = pigs.find(x=>x.id===id);
  if (!p) { container.innerHTML = `<div class="empty">Pig not found.</div>`; return; }

  const grandparents = familyByGroup(p, ["grandmother","grandfather","grandparent"]);
  const parents = familyByGroup(p, ["mother","father","parent"]);
  const siblings = familyByGroup(p, ["sister","brother","sibling"])
    .concat(getAutoSiblings(p).map(s=>({ link:{ relation:s.type+" (auto)" }, pig:s.pig })));
  const children = familyByGroup(p, ["son","daughter","child"]);
  const grandchildren = familyByGroup(p, ["grandchild"]);
  const others = familyByGroup(p, ["aunt","uncle","niece","nephew","auntuncle","nibling","partner"]);

  let html = `<div class="tree-wrap">`;
  if (grandparents.length) {
    html += `<div class="tree-section"><div class="tree-col-label">Grandparents</div><div class="tree-row">${grandparents.map(x=>treeNodeHTML(x.pig,{rel:x.link.relation})).join("")}</div><div class="tree-connector"></div></div>`;
  }
  if (parents.length) {
    html += `<div class="tree-section"><div class="tree-col-label">Parents</div><div class="tree-row">${parents.map(x=>treeNodeHTML(x.pig,{rel:x.link.relation})).join("")}</div><div class="tree-connector"></div></div>`;
  }
  html += `<div class="tree-section"><div class="tree-col-label">${xe(p.n||"This pig")}</div><div class="tree-row">${treeNodeHTML(p,{center:true})}</div></div>`;
  if (siblings.length) {
    html += `<div class="tree-section"><div class="tree-col-label">Siblings</div><div class="tree-row">${siblings.map(x=>treeNodeHTML(x.pig,{rel:x.link.relation})).join("")}</div></div>`;
  }
  if (children.length) {
    html += `<div class="tree-section"><div class="tree-connector"></div><div class="tree-col-label">Children</div><div class="tree-row">${children.map(x=>treeNodeHTML(x.pig,{rel:x.link.relation})).join("")}</div></div>`;
  }
  if (grandchildren.length) {
    html += `<div class="tree-section"><div class="tree-connector"></div><div class="tree-col-label">Grandchildren</div><div class="tree-row">${grandchildren.map(x=>treeNodeHTML(x.pig,{rel:x.link.relation})).join("")}</div></div>`;
  }
  if (others.length) {
    html += `<div class="tree-section" style="margin-top:14px"><div class="tree-col-label">Other relations</div><div class="tree-row">${others.map(x=>treeNodeHTML(x.pig,{rel:x.link.relation})).join("")}</div></div>`;
  }
  html += `</div>`;

  if (!grandparents.length && !parents.length && !siblings.length && !children.length && !grandchildren.length && !others.length) {
    html = `<div class="empty"><span class="empty-icon">&#127795;</span>No family members tagged for ${xe(p.n||"this pig")} yet.<div class="empty-sub">Open their profile, tap Edit, and add family members there.</div></div>`;
  }
  container.innerHTML = html;
}
