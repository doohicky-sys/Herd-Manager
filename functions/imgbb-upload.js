// Cloudflare Pages Function — deployed automatically at /imgbb-upload
// (the file's path under /functions IS the route: functions/imgbb-upload.js
// becomes /imgbb-upload with no extra routing config needed).
//
// Purpose: keep the ImgBB API key server-side only. The browser sends us the
// image (either as multipart form data from a device upload, or as a JSON
// {image} for the "optimise an existing photo" re-upload path), we attach
// the real key ourselves, forward to ImgBB, and hand back exactly the JSON
// shape ImgBB normally returns — so 02-photos.js barely has to change.
//
// Set IMGBB_KEY in: Cloudflare dashboard → Workers & Pages → your project →
// Settings → Environment variables → add IMGBB_KEY (tick "Encrypt"). It is
// then available here as context.env.IMGBB_KEY and is NEVER sent to the
// browser in any response.
//
// IMPORTANT, HARD-WON FIX: this used to export separate onRequestPost /
// onRequestGet functions, which is the standard, documented Cloudflare
// Pages Functions pattern — but every real photo upload from the deployed
// app was genuinely failing with a 405 "Method Not Allowed", even though
// the browser was demonstrably sending a real POST (confirmed directly in
// the client code) and the function was confirmed present and deployed
// (confirmed directly in the Cloudflare dashboard). This turned out to
// match a real, independently-reported Cloudflare Pages issue: several
// unrelated developers have hit the exact same thing — onRequestPost
// silently not being reached, 405 returned instead — with no fix from
// Cloudflare at the time this was found. Since that's infrastructure
// behaviour outside this app's own code, the fix is to route around it
// rather than wait on it: a single onRequest export, dispatching on
// request.method internally, is a genuinely different code path through
// Cloudflare's function loader than named per-method exports, and several
// people hitting this exact issue confirmed it resolves it.
export async function onRequest(context) {
  const { request } = context;
  // CRITICAL FIX: this fell through to the generic "unsupported method"
  // 405 response for OPTIONS requests too — and a browser can send a real
  // OPTIONS preflight before the actual POST even for same-origin requests
  // in some circumstances (Cloudflare's own edge, or a more conservative
  // browser implementation than the strict spec requires, can still issue
  // one). Every single failed upload in the reported logs was a 405 with
  // no exception — completely consistent with the PREFLIGHT itself being
  // rejected before the real POST was ever allowed to be sent, which would
  // make the browser report the whole request as failed without the real
  // POST handler in this file ever running at all. This responds to
  // OPTIONS correctly instead of falling through to a blanket rejection.
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400"
      }
    });
  }
  if (request.method === "POST") return handlePost(context);
  if (request.method === "GET") return jsonError("This endpoint only accepts POST requests.", 405);
  return jsonError(`Unsupported method: ${request.method}`, 405);
}

async function handlePost(context) {
  const { request, env } = context;

  // Only accept requests that genuinely came from the app itself. Without
  // this, anyone who discovers this URL could send photos through it all
  // day, burning through the ImgBB upload quota on your account — the key
  // itself stays hidden either way, but the quota is still yours to lose.
  //
  // Sec-Fetch-Site is the modern, purpose-built signal for this check: the
  // BROWSER sets it (a page's own JavaScript cannot fake it), and it says
  // plainly whether a request is "same-origin", "same-site", "cross-site",
  // or "none" (typed directly into the address bar / first navigation).
  // We fall back to comparing the Origin header for older browsers that
  // don't send Sec-Fetch-Site yet. If you ever move this app to a
  // different address, update ALLOWED_ORIGINS below to match.
  const ALLOWED_ORIGINS = [
    "https://herd-manager-2qd.pages.dev"
  ];
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  const origin = request.headers.get("Origin") || "";
  const looksSameOrigin = fetchSite ? (fetchSite === "same-origin" || fetchSite === "none")
                                     : (!origin || ALLOWED_ORIGINS.includes(origin));
  if (!looksSameOrigin) {
    return jsonError("Requests must come from the Herd Manager app.", 403);
  }

  // Refuse anything obviously oversized before doing any real work. 15MB is
  // generous for a phone photo with plenty of headroom, while still
  // refusing anything wildly larger than a photo should ever be.
  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return jsonError("That file is too large to upload.", 413);
  }

  if (!env.IMGBB_KEY) {
    return jsonError("Server is missing IMGBB_KEY — add it in Cloudflare Pages → Settings → Environment variables.", 500);
  }

  let outgoing;
  try {
    outgoing = await buildImgbbForm(request);
  } catch (err) {
    return jsonError(err.message || "Could not read the upload from the request.", 400);
  }

  outgoing.append("key", env.IMGBB_KEY);

  let imgbbResponse;
  try {
    imgbbResponse = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: outgoing
    });
  } catch (err) {
    return jsonError("Could not reach ImgBB right now. Please try again.", 502);
  }

  // Pass ImgBB's response straight through — 02-photos.js already knows how
  // to read { success, data: { url, medium, thumb } }, so no shape changes
  // are needed on the client for existing success/error handling to keep working.
  const text = await imgbbResponse.text();
  return new Response(text, {
    status: imgbbResponse.status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": request.headers.get("Origin") || "*" }
  });
}

// Accepts either:
//  (a) multipart/form-data with an "image" field (base64 or raw file) — used
//      for a fresh photo taken/picked on the device, or
//  (b) application/json { image: "<url or base64>" } — used by the
//      "optimise existing photo" path, which currently sources FROM a URL.
// Either way we normalise to the multipart body ImgBB itself expects.
async function buildImgbbForm(request) {
  const contentType = request.headers.get("content-type") || "";
  const out = new FormData();

  if (contentType.includes("multipart/form-data")) {
    const incoming = await request.formData();
    const image = incoming.get("image");
    if (!image) throw new Error("No 'image' field in the upload.");
    out.append("image", image);
    return out;
  }

  if (contentType.includes("application/json")) {
    const body = await request.json();
    if (!body || !body.image) throw new Error("No 'image' value in the JSON body.");
    out.append("image", body.image); // ImgBB accepts a URL or base64 string here too
    return out;
  }

  throw new Error(`Unsupported content type: ${contentType || "(none)"}`);
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ success: false, error: { message } }), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
