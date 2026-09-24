// ── Bulk intake ───────────────────────────────────────────────────────────────
let bulkMode = "rows";
let bulkParsed = []; // parsed candidates awaiting confirmation

function bulkInit() {
  // Seed the quick-rows area on first open only (don't wipe typed rows on re-visit)
  if (!document.getElementById("bulk-rows").children.length) bulkAddRows(5);
  // Roan is a guinea-pig-specific trait; hide the "Roan for all" default on
  // species where it's meaningless. The field stays in the DOM (not
  // removed) so bulkCommit()'s existing read of #bulk-roan.value never
  // throws — it just won't be shown or acted on for those species.
  const roanWrap = document.getElementById("bulk-roan")?.closest(".f");
  if (roanWrap) roanWrap.style.display = speciesHasTrait(activeSpecies, "roan") ? "" : "none";
  const noun = speciesNounPlural(activeSpecies), sing = speciesNoun(activeSpecies);
  const introEl = document.getElementById("bulk-intro");
  if (introEl) introEl.innerHTML = `${icon("package",16,"icon-inline")} Add many ${xe(noun)} at once. Set the defaults that apply to everyone, then either fill in the quick rows or paste a list. Nothing is saved until you confirm the preview.`;
  const pasteLabelEl = document.getElementById("bulk-paste-label");
  if (pasteLabelEl) pasteLabelEl.textContent = `One ${sing} per line: Name, DOB or age, Breed, Description`;
}
function bulkSetMode(mode) {
  bulkMode = mode;
  document.getElementById("bulk-rows-area").style.display = mode==="rows" ? "block" : "none";
  document.getElementById("bulk-paste-area").style.display = mode==="paste" ? "block" : "none";
  document.getElementById("bulk-mode-rows-btn").classList.toggle("active", mode==="rows");
  document.getElementById("bulk-mode-paste-btn").classList.toggle("active", mode==="paste");
  document.getElementById("bulk-preview").innerHTML = "";
  bulkParsed = [];
}
function bulkAddRows(n) {
  const wrap = document.getElementById("bulk-rows");
  for (let i=0;i<n;i++) {
    const row = document.createElement("div");
    row.className = "bulk-row";
    row.innerHTML = `<input placeholder="Name" data-col="name">
      <input placeholder="2y / 6m / date" data-col="dob">
      <input placeholder="Breed" data-col="breed">
      <input placeholder="Description" data-col="desc">
      <button type="button" class="bulk-row-del" onclick="this.parentElement.remove()" title="Remove row">&#10005;</button>`;
    wrap.appendChild(row);
  }
}
// Accepts "2024-03-01", "01/03/2024" (UK d/m/y), "2y", "6m", "2y 3m", "1.5y", bare "2" (years).
// Returns { d: "YYYY-MM-DD"|"", approx: bool, fail: bool }
function parseDobOrAge(s) {
  s = String(s||"").trim();
  if (!s) return { d:"", approx:false, fail:false };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { d:s, approx:false, fail:false };
  const dm = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
  if (dm) {
    const y = dm[3].length===2 ? "20"+dm[3] : dm[3];
    return { d: `${y}-${String(dm[2]).padStart(2,"0")}-${String(dm[1]).padStart(2,"0")}`, approx:false, fail:false };
  }
  let years=0, months=0, matched=false;
  const ym = s.match(/(\d+(?:\.\d+)?)\s*(?:y|yr|yrs|year|years)/i);
  if (ym) { years = parseFloat(ym[1]); matched = true; }
  const mm = s.match(/(\d+(?:\.\d+)?)\s*(?:m|mo|mos|month|months)\b/i);
  if (mm) { months = parseFloat(mm[1]); matched = true; }
  if (!matched && /^\d+(\.\d+)?$/.test(s)) { years = parseFloat(s); matched = true; }
  if (!matched) return { d:"", approx:false, fail:true };
  const totalMonths = Math.round(years*12 + months);
  const dob = new Date();
  dob.setMonth(dob.getMonth() - totalMonths);
  return { d: dob.toISOString().slice(0,10), approx:true, fail:false };
}
function bulkCollectCandidates() {
  const out = [];
  if (bulkMode === "rows") {
    document.querySelectorAll("#bulk-rows .bulk-row").forEach(row => {
      const get = col => (row.querySelector(`[data-col="${col}"]`)||{value:""}).value.trim();
      const name = get("name");
      if (!name) return; // skip empty rows silently
      out.push({ name, dobRaw: get("dob"), breed: get("breed"), desc: get("desc") });
    });
  } else {
    const lines = document.getElementById("bulk-paste").value.split(/\r?\n/);
    lines.forEach(line => {
      if (!line.trim()) return;
      const parts = line.includes("\t") ? line.split("\t") : line.split(",");
      const name = (parts[0]||"").trim();
      if (!name) return;
      out.push({
        name,
        dobRaw: (parts[1]||"").trim(),
        breed: (parts[2]||"").trim(),
        desc: parts.slice(3).join(",").trim() // desc may itself contain commas
      });
    });
  }
  return out;
}
function bulkPreview() {
  const candidates = bulkCollectCandidates();
  const box = document.getElementById("bulk-preview");
  if (!candidates.length) {
    box.innerHTML = `<div class="wbox" style="margin-top:14px">Nothing to add yet &mdash; fill in at least one name.</div>`;
    bulkParsed = [];
    return;
  }
  const existingNames = new Set(pigs.filter(p=>!p.deleted).map(p=>String(p.n||"").trim().toLowerCase()));
  const seen = new Set();
  bulkParsed = candidates.map(c => {
    const dob = parseDobOrAge(c.dobRaw);
    const warns = [];
    if (dob.fail) warns.push(`couldn't read "${c.dobRaw}" — DOB left blank`);
    if (dob.approx) warns.push("DOB estimated from age");
    const key = c.name.toLowerCase();
    if (existingNames.has(key)) warns.push(`a ${speciesNoun(activeSpecies)} with this name already exists`);
    if (seen.has(key)) warns.push("duplicate name within this intake");
    seen.add(key);
    return { ...c, dobFinal: dob.fail ? "" : dob.d, dobApprox: dob.approx, warns };
  });
  const rows = bulkParsed.map(p => `<tr>
    <td>${xe(p.name)}</td>
    <td>${p.dobFinal ? xe(p.dobFinal) + (p.dobApprox?" <span style='color:var(--text2)'>(approx)</span>":"") : "&mdash;"}</td>
    <td>${xe(p.breed)||"&mdash;"}</td>
    <td>${xe(p.desc)||"&mdash;"}</td>
    <td class="bulk-warn-cell">${p.warns.map(w=>"&#9888;&#65039; "+xe(w)).join("<br>")}</td>
  </tr>`).join("");
  const warnCount = bulkParsed.filter(p=>p.warns.length).length;
  box.innerHTML = `
    <table class="bulk-preview-table">
      <thead><tr><th>Name</th><th>DOB</th><th>Breed</th><th>Description</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="font-size:13px;margin-top:10px">${bulkParsed.length} ${bulkParsed.length===1?speciesNoun(activeSpecies):speciesNounPlural(activeSpecies)} ready to add${warnCount?` &middot; <span style="color:var(--warn)">${warnCount} with warnings (still importable)</span>`:""} &mdash; all will be <strong>${xe(document.getElementById("bulk-sex").value)}</strong>, <strong>${xe(document.getElementById("bulk-status").value)}</strong>${document.getElementById("bulk-altered").checked?`, <strong>neutered/spayed</strong>`:""}${speciesHasTrait(activeSpecies,"roan")?`, <strong>${document.getElementById("bulk-roan").value==="yes"?"roan":"non-roan"}</strong>`:""}.</div>
    <div class="bulk-preview-actions">
      <button class="btn btnsm" onclick="document.getElementById('bulk-preview').innerHTML='';bulkParsed=[]">Cancel</button>
      <button class="btn btnp btnsm" onclick="bulkCommit()">Confirm &mdash; add ${bulkParsed.length} ${bulkParsed.length===1?speciesNoun(activeSpecies):speciesNounPlural(activeSpecies)}</button>
    </div>`;
}
function bulkCommit() {
  if (!bulkParsed.length) return;
  const sex = document.getElementById("bulk-sex").value;
  const status = document.getElementById("bulk-status").value;
  const altered = document.getElementById("bulk-altered").checked;
  const roanEl = document.getElementById("bulk-roan");
  const stampRoan = speciesHasTrait(activeSpecies, "roan");
  const batchNote = document.getElementById("bulk-batchnote").value.trim();
  const stamp = Date.now();
  bulkParsed.forEach((c, i) => {
    const noteBits = [];
    if (batchNote) noteBits.push(batchNote);
    if (c.dobApprox) noteBits.push("DOB estimated from age at intake");
    const newAnimal = {
      id: `p${stamp + i}`, n: c.name, s: sex, altered, d: c.dobFinal, br: c.breed,
      de: c.desc, st: status, notes: noteBits.join(" — "),
      species: activeSpecies,
      dead: false, rehomed: false, litters: [], photo: "", family: []
    };
    // Same rule as the single-animal add/edit forms: don't stamp a roan
    // value at all for species where the trait isn't real.
    if (stampRoan && roanEl) newAnimal.r = roanEl.value;
    pigs.unshift(newAnimal);
  });
  logActivity(`${icon("package",14,"icon-inline")} Bulk intake: ${bulkParsed.length} ${bulkParsed.length===1?speciesNoun(activeSpecies):speciesNounPlural(activeSpecies)} added`);
  save(); renderAll();
  const n = bulkParsed.length;
  const addedNoun = n===1?speciesNoun(activeSpecies):speciesNounPlural(activeSpecies);
  bulkParsed = [];
  document.getElementById("bulk-preview").innerHTML = "";
  document.getElementById("bulk-rows").innerHTML = "";
  document.getElementById("bulk-paste").value = "";
  bulkAddRows(5);
  fireConfetti();
  navGo("herd");
  setTimeout(()=>toast(`${n} ${addedNoun} added to the herd \u{1F389}`, "ok", 4000), 250);
}
