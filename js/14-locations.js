// ── Locations ────────────────────────────────────────────────────────────
// A location is a named space you define yourself — "Back Shed", "Paddock
// 2" — tagged with a type purely to help filter/browse, not to restrict
// what you can assign there (a rabbit can live in a "Field" location if
// that's genuinely true for your setup). Any animal, any species, can be
// assigned to any location.
//
// Shape of one location record:
//   { id, species, name, type, cols, rows,
//     levels: [{ id, name, cells: [{ id, x, y, w, h }] }] }
//
// LEVELS — why they exist: a flat 2D grid genuinely cannot represent a
// three-tier hutch or rack — "Top", "Middle", and "Bottom" occupy the same
// footprint but are physically different spaces, and pretending otherwise
// would just be wrong, not simplified. Real warehouse-management software
// solves this the same way: one 2D footprint, multiple selectable levels
// viewed one at a time (not rendered simultaneously in one flat view).
//
// Levels are OPT-IN, not a mode switch — every location starts with exactly
// one level (created automatically, never shown as a choice), so a field
// or paddock owner never has to think about levels at all. The level
// picker UI only appears once a SECOND level has been added. This is
// deliberately the same system for every location type, not a separate
// "cage mode" vs "field mode" — a rack is just a location that happens to
// have more than one level.
//
// Assignment is two fields on the animal itself — p.locationId and
// p.levelId — same pattern as p.species: simple and direct. p.levelId is
// only meaningful alongside a p.locationId that has more than one level;
// for a single-level location it's set to that one level's id but never
// surfaced in the UI, since there's nothing to choose between.

const LOCATION_TYPES = {
  "cage":    { label: "Cage",    icon: "package" },
  "hutch":   { label: "Hutch",   icon: "home" },
  "pen":     { label: "Pen",     icon: "package" },
  "stable":  { label: "Stable",  icon: "home" },
  "stall":   { label: "Stall",   icon: "package" },
  "field":   { label: "Field",   icon: "rainbow" },
  "paddock": { label: "Paddock", icon: "rainbow" },
  "run":     { label: "Run",     icon: "package" },
  "coop":    { label: "Coop",    icon: "home" },
  "other":   { label: "Other",   icon: "tag" }
};
function ensureLocationsArray() {
  if (!Array.isArray(locations)) locations = [];
  return locations;
}
function locationsForSpecies(species) {
  return ensureLocationsArray().filter(l => (l.species||DEFAULT_SPECIES) === (species||activeSpecies));
}
function locationById(id) {
  return ensureLocationsArray().find(l => l.id === id);
}
// Every location has at least one level once this has run on it — call it
// wherever a location is read, not just where it's created, so a location
// loaded from an older save (or a malformed import) never ends up with a
// missing/empty levels array and breaks the level-picker logic downstream.
function ensureLocationLevels(loc) {
  if (!Array.isArray(loc.levels) || !loc.levels.length) {
    loc.levels = [{ id: `lvl${Date.now()}`, name: "Main", cells: [] }];
  }
  return loc.levels;
}
function levelById(loc, levelId) {
  return ensureLocationLevels(loc).find(l => l.id === levelId);
}
function addLevel(locationId, name) {
  const loc = locationById(locationId); if (!loc) return null;
  const levels = ensureLocationLevels(loc);
  const trimmed = (name||"").trim() || `Level ${levels.length + 1}`;
  const lvl = { id: `lvl${Date.now()}`, name: trimmed, cells: [] };
  levels.push(lvl);
  save();
  return lvl;
}
function renameLevel(locationId, levelId, name) {
  const loc = locationById(locationId); if (!loc) return;
  const lvl = levelById(loc, levelId); if (!lvl) return;
  const trimmed = (name||"").trim();
  if (!trimmed) { toast("Give this level a name.", "err"); return; }
  lvl.name = trimmed;
  save();
}
function deleteLevel(locationId, levelId) {
  const loc = locationById(locationId); if (!loc) return;
  const levels = ensureLocationLevels(loc);
  if (levels.length <= 1) { toast("A location needs at least one level.", "err"); return; }
  // Reassign any animal on the deleted level to whichever level remains
  // first, rather than leave a dangling p.levelId pointing at nothing.
  const fallback = levels.find(l => l.id !== levelId);
  pigs.forEach(p => { if (p.locationId === locationId && p.levelId === levelId) p.levelId = fallback.id; });
  loc.levels = levels.filter(l => l.id !== levelId);
  save();
}
function animalsInLocation(locId, levelId) {
  return pigs.filter(p => isActiveInCurrentSpecies(p) && p.locationId === locId && (levelId ? p.levelId === levelId : true));
}
function animalCountByLocation() {
  const counts = {};
  pigs.filter(isActiveInCurrentSpecies).forEach(p => {
    if (p.locationId) counts[p.locationId] = (counts[p.locationId]||0) + 1;
  });
  return counts;
}
function validateLocationName(name, species, excludeId) {
  const trimmed = (name||"").trim();
  if (!trimmed) return "Give it a name.";
  const dupe = locationsForSpecies(species).find(l => l.id !== excludeId && l.name.toLowerCase() === trimmed.toLowerCase());
  if (dupe) return "You already have a location with this name.";
  return null;
}
function createLocation(name, type, cols, rows) {
  const err = validateLocationName(name, activeSpecies);
  if (err) { toast(err, "err"); return null; }
  const loc = {
    id: `loc${Date.now()}`,
    species: activeSpecies,
    name: name.trim(),
    type: LOCATION_TYPES[type] ? type : "other",
    cols: Math.max(1, Math.min(20, parseInt(cols,10) || 4)),
    rows: Math.max(1, Math.min(20, parseInt(rows,10) || 4)),
    levels: []
  };
  ensureLocationLevels(loc); // seeds the one implicit "Main" level
  ensureLocationsArray().push(loc);
  logActivity(`${icon("home",14,"icon-inline")} "${xe(loc.name)}" added as a new ${xe(LOCATION_TYPES[loc.type].label.toLowerCase())}`);
  save();
  return loc;
}
function renameLocation(id, name, type) {
  const loc = locationById(id); if (!loc) return null;
  const err = validateLocationName(name, loc.species, id);
  if (err) { toast(err, "err"); return null; }
  loc.name = name.trim();
  if (LOCATION_TYPES[type]) loc.type = type;
  save();
  return loc;
}
function deleteLocation(id) {
  const loc = locationById(id); if (!loc) return;
  // Unassign any animals living there rather than leave their locationId
  // pointing at nothing — a dangling reference would silently disappear
  // from every location-based view without explanation.
  pigs.forEach(p => { if (p.locationId === id) { delete p.locationId; delete p.levelId; } });
  locations = ensureLocationsArray().filter(l => l.id !== id);
  logActivity(`"${xe(loc.name)}" was deleted`);
  save();
}
// levelId is optional: omit it for a single-level location (assignAnimalToLocation
// fills in that one level automatically), or pass it explicitly for a
// multi-level location where the person has actually picked one.
function assignAnimalToLocation(pigId, locationId, levelId) {
  const p = pigs.find(x => x.id === pigId); if (!p) return;
  if (!locationId) { delete p.locationId; delete p.levelId; save(); return; }
  const loc = locationById(locationId); if (!loc) return;
  const levels = ensureLocationLevels(loc);
  p.locationId = locationId;
  p.levelId = (levelId && levels.some(l => l.id === levelId)) ? levelId : levels[0].id;
  save();
}

// ── UI: list view ────────────────────────────────────────────────────────
// State for the type-filter chip row on the list screen — kept as a plain
// module-level variable (not persisted) since it's a transient view
// preference, same treatment as the herd grid's own filters.
let locationsTypeFilter = "";
function renderLocationsList() {
  const el = document.getElementById("locations-content");
  if (!el) return;
  const all = locationsForSpecies(activeSpecies);
  const typesPresent = [...new Set(all.map(l => l.type))];
  const counts = animalCountByLocation();
  const filtered = locationsTypeFilter ? all.filter(l => l.type === locationsTypeFilter) : all;

  const chipsHTML = typesPresent.length > 1 ? `
    <div class="fs-chips" style="margin-bottom:14px">
      <button type="button" class="fs-chip${!locationsTypeFilter?" fs-chip-on":""}" onclick="setLocationsTypeFilter('')">All types</button>
      ${typesPresent.map(t => `<button type="button" class="fs-chip${locationsTypeFilter===t?" fs-chip-on":""}" onclick="setLocationsTypeFilter('${xe(t)}')">${xe(LOCATION_TYPES[t].label)}</button>`).join("")}
    </div>` : "";

  const listHTML = filtered.length ? `
    <div class="wt-list">${filtered.map(loc => {
      const count = counts[loc.id] || 0;
      const multiLevel = ensureLocationLevels(loc).length > 1;
      const noun = speciesNounPlural(activeSpecies);
      return `<button type="button" class="sheet-item" style="border-bottom:1px solid var(--border)" onclick="openLocationDetail('${xe(loc.id)}')">
        <span class="si">${icon(LOCATION_TYPES[loc.type].icon, 20)}</span>
        <div style="flex:1;text-align:left">
          <div>${xe(loc.name)}</div>
          <div class="sheet-sub">${xe(LOCATION_TYPES[loc.type].label)}${multiLevel?` &middot; ${ensureLocationLevels(loc).length} levels`:""} &middot; ${count} ${count===1?speciesNoun(activeSpecies):noun}</div>
        </div>
        <span aria-hidden="true" style="color:var(--text3)">&#8250;</span>
      </button>`;
    }).join("")}</div>
  ` : `<div class="empty"><span class="empty-icon">${icon("home",34)}</span>No locations yet.<div class="empty-sub">Add your first ${xe(speciesNoun(activeSpecies))} space below.</div></div>`;

  el.innerHTML = `
    <p class="intro">Map out cages, stables, fields, or anywhere else your ${xe(speciesNounPlural(activeSpecies))} live, then assign animals so you always know who's where.</p>
    ${chipsHTML}
    ${listHTML}
    <button class="btn btnp" style="margin-top:16px;width:100%;justify-content:center" onclick="openLocationAdd()">${icon("home",18)} Add a location</button>
  `;
}
function setLocationsTypeFilter(type) {
  locationsTypeFilter = type;
  renderLocationsList();
}

// ── UI: add a location ──────────────────────────────────────────────────
function openLocationAdd() {
  const typeOptions = Object.entries(LOCATION_TYPES).map(([key,info]) => `<option value="${key}">${xe(info.label)}</option>`).join("");
  cov("ov-detail");
  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit');navGo('locations')" aria-label="Close">&#10005;</button>
    <div class="mt">Add a location</div>
    <div class="f"><label>Name</label><input id="loc-name" placeholder="e.g. Back Shed, Paddock 2&#8230;"></div>
    <div class="f"><label>Type</label><select id="loc-type">${typeOptions}</select></div>
    <p style="font-size:12px;color:var(--text2);margin:-4px 0 4px">Choose how many squares to map it with &mdash; use a bigger grid for more precision, or keep it small and simple.</p>
    <div class="twocol">
      <div class="f"><label>Width (squares)</label><input type="number" id="loc-cols" value="4" min="1" max="20"></div>
      <div class="f"><label>Depth (squares)</label><input type="number" id="loc-rows" value="4" min="1" max="20"></div>
    </div>
    <div class="ma">
      <button class="btn btnsm" onclick="cov('ov-edit');navGo('locations')">Cancel</button>
      <button class="btn btnp btnsm" id="loc-save" onclick="saveLocationAdd()">Add location</button>
    </div>`;
  document.getElementById("ov-edit").classList.add("open");
}
function saveLocationAdd() {
  const name = document.getElementById("loc-name").value;
  const type = document.getElementById("loc-type").value;
  const cols = document.getElementById("loc-cols").value;
  const rows = document.getElementById("loc-rows").value;
  const loc = createLocation(name, type, cols, rows);
  if (!loc) return; // createLocation already toasted the specific error
  const saveBtn = document.getElementById("loc-save");
  if (saveBtn) pulseButtonSuccess(saveBtn);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cov("ov-edit"); navGo("locations");
    toast("Location added \u2713");
  }));
}

// ── UI: location detail (map + roster) ──────────────────────────────────
// Which level is currently showing on screen — transient view state, reset
// each time a detail view opens (below), not saved with the location.
let openLocationId = null;
let openLevelId = null;
function openLocationDetail(locId) {
  const loc = locationById(locId); if (!loc) return;
  openLocationId = locId;
  openLevelId = ensureLocationLevels(loc)[0].id;
  renderLocationDetail();
}
function renderLocationDetail() {
  const el = document.getElementById("locations-content");
  const loc = locationById(openLocationId);
  if (!el || !loc) { renderLocationsList(); return; }
  const levels = ensureLocationLevels(loc);
  const level = levelById(loc, openLevelId) || levels[0];
  const multiLevel = levels.length > 1;
  const assignedHere = animalsInLocation(loc.id, level.id);
  const cellOf = (x,y) => (level.cells||[]).find(c => c.pigId && c.x===x && c.y===y);

  // Build the grid itself: one button per cell, showing the animal
  // assigned there (initial + tiny avatar-style circle) or empty.
  let gridCells = "";
  for (let y=0; y<loc.rows; y++) {
    for (let x=0; x<loc.cols; x++) {
      const cell = cellOf(x,y);
      const p = cell ? pigs.find(a => a.id === cell.pigId) : null;
      gridCells += p
        ? `<button type="button" class="loc-cell loc-cell-filled" onclick="openLocationCellMenu(${x},${y})" title="${xe(p.n)}"><span class="loc-cell-av">${xe((p.n||"?").slice(0,1).toUpperCase())}</span></button>`
        : `<button type="button" class="loc-cell" onclick="openLocationCellMenu(${x},${y})" aria-label="Empty spot"></button>`;
    }
  }

  const levelTabsHTML = multiLevel ? `
    <div class="fs-chips" style="margin-bottom:12px">
      ${levels.map(l => `<button type="button" class="fs-chip${l.id===level.id?" fs-chip-on":""}" onclick="switchLocationLevel('${xe(l.id)}')">${xe(l.name)}</button>`).join("")}
      <button type="button" class="fs-chip" onclick="openAddLevelPrompt()">${icon("check",14)} Add level</button>
    </div>` : `<button type="button" class="btn btnsm" style="margin-bottom:12px" onclick="openAddLevelPrompt()">${icon("check",16)} This has multiple levels &mdash; add another</button>`;

  const unassignedHere = pigs.filter(p => isActiveInCurrentSpecies(p) && !p.locationId);

  el.innerHTML = `
    <button type="button" class="btn btnsm" style="margin-bottom:12px" onclick="navGo('locations')">${icon("x",14)} Back to locations</button>
    <div class="ig-label">${xe(loc.name)} <span style="font-weight:400;color:var(--text2)">&middot; ${xe(LOCATION_TYPES[loc.type].label)}</span></div>
    ${levelTabsHTML}
    <div class="loc-grid" style="grid-template-columns:repeat(${loc.cols},1fr)">${gridCells}</div>
    <p style="font-size:12px;color:var(--text2);margin-top:10px">Tap any square to assign or remove an animal. ${assignedHere.length} of ${loc.cols*loc.rows} squares in use${multiLevel?` on ${xe(level.name)}`:""}.</p>
    <div class="ma" style="margin-top:14px">
      <button class="btn btnsm" onclick="openLocationRename('${xe(loc.id)}')">Rename / change type</button>
      <button class="btn btnd btnsm" onclick="confirmDeleteLocation('${xe(loc.id)}')">Delete location</button>
    </div>
  `;
}
function switchLocationLevel(levelId) {
  openLevelId = levelId;
  renderLocationDetail();
}
function openAddLevelPrompt() {
  const name = prompt("Name this level (e.g. \"Top\", \"Middle\", \"Floor\"):");
  if (name === null) return; // cancelled
  const loc = locationById(openLocationId); if (!loc) return;
  const lvl = addLevel(loc.id, name);
  if (lvl) { openLevelId = lvl.id; renderLocationDetail(); }
}
// Tapping a cell offers: if occupied, remove that animal; if empty, choose
// an unassigned animal to place there. Kept as a simple native-confirm-
// style flow rather than a full modal, since it's a quick, low-stakes
// action reached from deep inside an already-focused screen.
function openLocationCellMenu(x, y) {
  const loc = locationById(openLocationId); if (!loc) return;
  const level = levelById(loc, openLevelId); if (!level) return;
  if (!Array.isArray(level.cells)) level.cells = [];
  const existing = level.cells.find(c => c.x===x && c.y===y);
  if (existing && existing.pigId) {
    const p = pigs.find(a => a.id === existing.pigId);
    if (confirm(`Remove ${p?p.n:"this animal"} from this spot?`)) {
      level.cells = level.cells.filter(c => c !== existing);
      assignAnimalToLocation(existing.pigId, null);
      renderLocationDetail();
    }
    return;
  }
  const candidates = pigs.filter(p => isActiveInCurrentSpecies(p) && p.locationId !== loc.id)
    .sort((a,b) => String(a.n||"").localeCompare(String(b.n||"")));
  if (!candidates.length) { toast("Every animal is already placed somewhere.", "err"); return; }
  const list = candidates.map((p,i) => `${i+1}. ${p.n||"Unnamed"}`).join("\n");
  const choice = prompt(`Place which animal here?\n\n${list}\n\nType a number:`);
  if (choice === null) return;
  const idx = parseInt(choice,10) - 1;
  const chosen = candidates[idx];
  if (!chosen) { toast("Didn't recognise that choice.", "err"); return; }
  level.cells.push({ id:`cell${Date.now()}`, x, y, pigId: chosen.id });
  assignAnimalToLocation(chosen.id, loc.id, level.id);
  renderLocationDetail();
}
function openLocationRename(locId) {
  const loc = locationById(locId); if (!loc) return;
  const typeOptions = Object.entries(LOCATION_TYPES).map(([key,info]) => `<option value="${key}"${key===loc.type?" selected":""}>${xe(info.label)}</option>`).join("");
  cov("ov-detail");
  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit');renderLocationDetail()" aria-label="Close">&#10005;</button>
    <div class="mt">Edit location</div>
    <div class="f"><label>Name</label><input id="loc-rename" value="${xe(loc.name)}"></div>
    <div class="f"><label>Type</label><select id="loc-retype">${typeOptions}</select></div>
    <div class="ma">
      <button class="btn btnsm" onclick="cov('ov-edit');renderLocationDetail()">Cancel</button>
      <button class="btn btnp btnsm" onclick="saveLocationRename('${xe(locId)}')">Save</button>
    </div>`;
  document.getElementById("ov-edit").classList.add("open");
}
function saveLocationRename(locId) {
  const name = document.getElementById("loc-rename").value;
  const type = document.getElementById("loc-retype").value;
  const loc = renameLocation(locId, name, type);
  if (!loc) return;
  cov("ov-edit");
  renderLocationDetail();
  toast("Saved \u2713");
}
async function confirmDeleteLocation(locId) {
  const loc = locationById(locId); if (!loc) return;
  const ok = await confirmSheet({
    title: "Delete this location?",
    body: `Any animals placed here will be unassigned, but their own records are untouched. This can't be undone.`,
    confirmLabel: "Delete", danger: true
  });
  if (!ok) return;
  deleteLocation(locId);
  navGo("locations");
  toast("Location deleted");
}
