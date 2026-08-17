// ── ImgBB image upload ────────────────────────────────────────────────────────
// Images are uploaded to ImgBB and only the URL is stored in pig.photo
// This keeps the Supabase payload tiny regardless of how many photos you add

async function uploadToImgBB(base64Str) {
  // Returns { url, thumb } — url is the medium-size display image, thumb is a
  // tiny square perfect for list cards. On failure both fall back to the input.
  if (!base64Str || (!base64Str.startsWith("data:image") && !base64Str.startsWith("http")))
    return { url: base64Str, thumb: base64Str };
  if (base64Str.startsWith("http")) return { url: base64Str, thumb: base64Str };
  addLog("Uploading image to ImgBB...");
  const b64 = base64Str.split(",")[1];
  if (!b64) return { url: base64Str, thumb: base64Str };
  const form = new FormData();
  form.append("key", IMGBB_KEY);
  form.append("image", b64);
  try {
    const r = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
    const json = await r.json();
    if (json.success && json.data?.url) {
      const url = json.data.medium?.url || json.data.url;
      const thumb = json.data.thumb?.url || url;
      addLog(`Image uploaded: ${url}`);
      return { url, thumb };
    }
    throw new Error(json.error?.message || "Upload failed");
  } catch(e) {
    addLog(`ImgBB upload failed: ${e.message} — keeping local`);
    return { url: base64Str, thumb: base64Str };
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
    body: "Each photo is swapped for a lighter version that loads faster and is much kinder to phone memory. Your pigs keep their pictures throughout. Keep the app open while it runs.",
    confirmLabel: "Optimise"
  });
  if (!go) return;
  let done = 0, shrunk = 0, failed = 0;
  const processOne = async (p) => {
    try {
      const form = new FormData();
      form.append("key", IMGBB_KEY);
      form.append("image", p.photo); // URL source — ImgBB fetches it server-side
      const r = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
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
      try again in a few minutes, or re-upload the photo from the pig's Edit screen.
    </p>
    <div class="wt-list">${broken.map(p=>`<div class="wt-row"><span>${xe(p.n)}</span><button class="btn btnsm" onclick="cov('ov-edit');openEdit('${xe(p.id)}')">Open</button></div>`).join("")}</div>`;
  document.getElementById("ov-edit").classList.add("open");
}
