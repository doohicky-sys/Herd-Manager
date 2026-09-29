// ── ImgBB image upload ────────────────────────────────────────────────────────
// Images are uploaded to ImgBB and only the URL is stored in pig.photo
// This keeps the Supabase payload tiny regardless of how many photos you add

// SECURITY FIX: this used to send the ImgBB key directly from the browser
// (form.append("key", IMGBB_KEY)), which meant anyone viewing page source
// could read it and burn your upload quota. It now posts to our own
// /imgbb-upload Cloudflare Pages Function (functions/imgbb-upload.js), which
// holds the real key server-side and forwards to ImgBB on our behalf. The
// key never ships to the browser again. Response shape is unchanged — the
// proxy passes ImgBB's own JSON straight through — so nothing below this
// point needed to change.
//
// REAL BUG FIXED HERE: this function used to silently fall back to
// returning the raw base64 image data as `url`/`thumb` on ANY failure —
// meaning a photo that failed to upload would still show correctly on
// screen (a base64 data URL renders fine in an <img> tag), making it look
// like the upload had worked. But nothing had actually reached ImgBB, so
// checking there directly would correctly show nothing — exactly the
// reported symptom. Worse, that base64 string (commonly several hundred KB
// per photo once inflated) then got saved into localStorage as if it were
// a normal short URL, which is a very plausible real cause of the
// "device storage full" errors seen elsewhere — a handful of silently-
// failed uploads is genuinely enough to blow past a small quota.
//
// Now: retries once on a genuine failure (mobile networks blip constantly,
// and a proxy hiccup is not the same as a real, persistent problem), and
// on confirmed failure returns ok:false with no base64 fallback at all —
// the caller decides what to show, and nothing silently corrupts saved
// data with an embedded image pretending to be a URL.
async function uploadToImgBB(base64Str, _isRetry) {
  // Returns { ok, url, thumb, error }. ok:false means the upload genuinely
  // did not happen — url/thumb are omitted rather than silently substituted
  // with something that LOOKS like a photo but isn't actually hosted anywhere.
  if (!base64Str || (!base64Str.startsWith("data:image") && !base64Str.startsWith("http")))
    return { ok: true, url: base64Str, thumb: base64Str };
  if (base64Str.startsWith("http")) return { ok: true, url: base64Str, thumb: base64Str };
  addLog("Uploading image via secure proxy...");
  const b64 = base64Str.split(",")[1];
  if (!b64) return { ok: false, error: "Couldn't read that image file." };
  const form = new FormData();
  form.append("image", b64);
  try {
    const r = await fetch("/imgbb-upload", { method: "POST", body: form });
    let json;
    try { json = await r.json(); }
    catch(_) { throw new Error(`Server returned an unreadable response (HTTP ${r.status})`); }
    if (json.success && json.data?.url) {
      const url = json.data.medium?.url || json.data.url;
      const thumb = json.data.thumb?.url || url;
      addLog(`Image uploaded: ${url}`);
      return { ok: true, url, thumb };
    }
    throw new Error(json.error?.message || `Upload failed (HTTP ${r.status})`);
  } catch(e) {
    addLog(`Image upload failed: ${e.message}${_isRetry ? "" : " — retrying once"}`);
    if (!_isRetry) return uploadToImgBB(base64Str, true);
    return { ok: false, error: e.message };
  }
}

// ── Legacy photo optimiser ────────────────────────────────────────────────────
// Re-uploads existing full-size ImgBB photos and swaps in the medium-size
// rendition. ImgBB accepts a URL as the upload source, so this runs entirely
// server-side — no image data passes through the phone.
async function optimisePhotos() {
  const targets = pigs.filter(p => p.photo && String(p.photo).startsWith("http") && (!p.photoOpt || !p.photoThumb));
  if (!targets.length) { toast("All photos are already optimised \u2728"); return; }
  const go = await confirmSheet({
    title: `Optimise ${targets.length} photo${targets.length===1?"":"s"}?`,
    body: "Each photo is swapped for a lighter version that loads faster and is much kinder to phone memory. Every animal keeps its picture throughout. Keep the app open while it runs.",
    confirmLabel: "Optimise"
  });
  if (!go) return;
  let done = 0, shrunk = 0, failed = 0;
  const processOne = async (p) => {
    try {
      // SECURITY FIX: routed through the same /imgbb-upload proxy as fresh
      // uploads. This call sends a URL (not a file), so it goes as JSON —
      // the proxy's buildImgbbForm() reads either shape and still forwards
      // to ImgBB with the server-side key attached.
      const r = await fetch("/imgbb-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: p.photo }) // URL source — ImgBB fetches it server-side
      });
      const json = await r.json();
      if (json.success && json.data?.url) {
        const best = json.data.medium?.url || json.data.url;
        if (best !== p.photo) shrunk++;
        p.photo = best;
        p.photoThumb = json.data.thumb?.url || best;
        p.photoOpt = 1;
      } else { failed++; }
    } catch(e) { failed++; addLog(`Optimise failed for ${p.n}: ${e.message}`); }
    done++;
    setSync(`Optimising photos\u2026 ${done}/${targets.length}`, "busy");
  };
  // Three at a time — ~150 photos in well under a minute
  for (let i = 0; i < targets.length; i += 3) {
    await Promise.all(targets.slice(i, i+3).map(processOne));
    await new Promise(res => setTimeout(res, 200));
  }
  save(); renderAll();
  setSync("\u2713 Synced", "ok");
  toast(`Photos optimised \u2014 ${done} processed, ${shrunk} slimmed${failed?`, ${failed} to retry`:""}`, "ok", 4500);
  logActivity(`\u{1FA84} Optimised ${shrunk} photos for faster loading`);
}

// ── Photo resilience ──────────────────────────────────────────────────────────
// ImgBB is a free third-party host and, per their own status reports, has
// periods where individual images intermittently fail to load even while the
// site itself is reachable. Previously a failed <img> just sat broken forever
// with no distinction between "still loading" and "gone". This gives every
// pig photo an automatic retry, then a visible fallback if it truly can't load.
function attachPhotoResilience(root) {
  (root || document).querySelectorAll("img[data-pig-photo]").forEach(img => {
    if (img.dataset.resilient) return;
    img.dataset.resilient = "1";
    let attempts = parseInt(img.dataset.attempts || "0");
    img.addEventListener("error", function onErr() {
      attempts++;
      if (attempts <= 2) {
        // Retry with a cache-busting param after a short, increasing delay —
        // covers transient blips without hammering a struggling host.
        setTimeout(() => {
          const base = img.dataset.src || img.src.split("?")[0];
          img.src = `${base}?retry=${attempts}-${Date.now()}`;
        }, attempts * 900);
        img.dataset.attempts = String(attempts);
      } else {
        // Give up gracefully: show initials instead of a broken-image icon
        const wrap = img.closest("[data-photo-wrap]");
        if (wrap) {
          wrap.classList.add("photo-failed");
          const note = wrap.querySelector(".photo-fail-note");
          if (note) note.hidden = false;
        }
        img.style.display = "none";
      }
    }, { once: false });
  });
}
// Call after any render that inserts pig <img> tags
function reattachPhotoResilience() { attachPhotoResilience(document); }

// ── Broken photo finder ──────────────────────────────────────────────────────
// A manual sweep for "Fix broken photos" in More: tests every stored photo URL
// and reports which ones are currently unreachable, so a real outage (rather
// than a one-off blip) is visible and actionable instead of a silent grey circle.
async function checkPhotoHealth() {
  const withPhotos = pigs.filter(p => !p.deleted && p.photo);
  if (!withPhotos.length) { toast("No photos to check"); return; }
  setSync(`Checking photos… 0/${withPhotos.length}`, "busy");
  const broken = [];
  let done = 0;
  for (const p of withPhotos) {
    try {
      const ok = await new Promise(resolve => {
        const test = new Image();
        const timer = setTimeout(() => resolve(false), 6000);
        test.onload = () => { clearTimeout(timer); resolve(true); };
        test.onerror = () => { clearTimeout(timer); resolve(false); };
        test.src = `${p.photo}?healthcheck=${Date.now()}`;
      });
      if (!ok) broken.push(p);
    } catch(e) { broken.push(p); }
    done++;
    setSync(`Checking photos… ${done}/${withPhotos.length}`, "busy");
  }
  setSync("✓ Synced", "ok");
  if (!broken.length) { toast("All photos are loading fine \u2713"); return; }
  document.getElementById("me").innerHTML = `
    <button class="mc" onclick="cov('ov-edit')" aria-label="Close">&#10005;</button>
    <div class="mt">${broken.length} photo${broken.length===1?"":"s"} not loading</div>
    <p style="font-size:var(--fs-sm);color:var(--text2);margin-bottom:12px">
      These images didn't load from the photo host just now. This is usually temporary —
      try again in a few minutes, or re-upload the photo from its Edit screen.
    </p>
    <div class="wt-list">${broken.map(p=>`<div class="wt-row"><span>${xe(p.n)}</span><button class="btn btnsm" onclick="cov('ov-edit');openEdit('${xe(p.id)}')">Open</button></div>`).join("")}</div>`;
  document.getElementById("ov-edit").classList.add("open");
}

// ── One-time cleanup: leftover embedded photos from before this was fixed ──
// A now-fixed bug (see uploadToImgBB in this file) used to silently save the
// RAW photo data itself into an animal's record whenever a genuine upload
// to the photo host failed — rather than a short web link, that's often
// several hundred KB of text sitting where a normal URL should be, and it's
// almost certainly the actual cause behind repeated "can't save to this
// device" warnings: a handful of these is genuinely enough to fill the
// small, fixed amount of space a browser gives any one app to remember
// things in. Fixing the upload function stops NEW ones from happening, but
// doesn't retroactively fix animals that already have one saved from
// before the fix — this finds those and tries to properly upload them now.
function findEmbeddedPhotos() {
  // Deliberately does NOT exclude p.deleted (trashed) animals. saveLocal()
  // serialises the WHOLE `pigs` array on every single app boot — trash is
  // just a soft-delete flag (p.deleted = true), not a separate array the
  // animal moves out of — so a trashed pig with an old embedded base64
  // photo keeps getting written into local storage on every load exactly
  // as much as an active one does. Excluding it here used to mean this
  // tool could report "all clean" while a trashed record was still the
  // actual thing filling up the device — real, confirmed cause of a
  // storage-full error recurring on a device after this cleanup had
  // already been run and appeared to succeed.
  return pigs.filter(p => (p.photo && p.photo.startsWith("data:image")) || (p.photoThumb && p.photoThumb.startsWith("data:image")));
}
async function cleanUpEmbeddedPhotos() {
  const targets = findEmbeddedPhotos();
  if (!targets.length) { toast("No leftover embedded photos found \u2728"); return; }
  const go = await confirmSheet({
    title: `Clean up ${targets.length} large photo${targets.length===1?"":"s"}?`,
    body: `${targets.length} animal${targets.length===1?" has a photo":"s have photos"} saved the old, oversized way (from before this was fixed) — this is very likely why this device keeps running out of space to save to. Each one will be properly re-uploaded now. Keep the app open while it runs.`,
    confirmLabel: "Clean up"
  });
  if (!go) return;
  let done = 0, fixed = 0, failed = 0;
  for (const p of targets) {
    setSync(`Cleaning up photos\u2026 ${done+1}/${targets.length}`, "busy");
    const source = (p.photo && p.photo.startsWith("data:image")) ? p.photo : p.photoThumb;
    const res = await uploadToImgBB(source);
    if (res.ok) {
      p.photo = res.url; p.photoThumb = res.thumb; fixed++;
    } else {
      // Genuinely couldn't re-upload right now — leave the embedded copy in
      // place rather than delete the only picture of this animal; it'll be
      // picked up again next time this cleanup is run.
      failed++;
      addLog(`Cleanup: couldn't re-upload photo for ${p.n || "an animal"}: ${res.error}`);
    }
    done++;
  }
  save();
  setSync("✓ Synced", "ok");
  toast(`${fixed} photo${fixed===1?"":"s"} cleaned up${failed?` \u00b7 ${failed} couldn't be re-uploaded right now (try again later)`:""} \u2713`, failed && !fixed ? "err" : "ok", 6000);
}
