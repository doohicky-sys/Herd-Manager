// ── Dashboard visualisations ──────────────────────────────────────────────────
function captureSnapshot() {
  const today = new Date().toISOString().slice(0,10);
  const act = pigs.filter(p=>!p.deleted&&!p.dead&&!p.rehomed);
  const snap = {
    d: today,
    a: act.length,
    s: act.filter(p=>p.s==="female").length,
    b: act.filter(p=>p.s==="male").length,
    p: act.filter(p=>p.st==="rehome").length
  };
  const last = snapshots[snapshots.length-1];
  if (last && last.d === today) {
    // Update today's snapshot in place; report whether anything changed
    const changed = last.a!==snap.a||last.s!==snap.s||last.b!==snap.b||last.p!==snap.p;
    snapshots[snapshots.length-1] = snap;
    return changed;
  }
  snapshots.push(snap);
  if (snapshots.length > 400) snapshots = snapshots.slice(-400); // ~13 months is plenty for a 6-month chart
  return true;
}
// Tiny dependency-free SVG builders
function svgArea(values, colour) {
  if (!values.length) return "";
  const w=260, h=64, pad=3;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const span = (max-min)||1;
  const px = i => pad + i*(w-2*pad)/Math.max(values.length-1,1);
  const py = v => h-pad - (v-min)*(h-2*pad)/span;
  const pts = values.map((v,i)=>`${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const areaPts = `${pad},${h-pad} ${pts} ${(w-pad)},${h-pad}`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:64px;display:block">
    <polygon points="${areaPts}" fill="${colour}" opacity=".18"/>
    <polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${px(values.length-1).toFixed(1)}" cy="${py(values[values.length-1]).toFixed(1)}" r="3.2" fill="${colour}"/>
  </svg>`;
}
function svgBars(values, colour, labels) {
  if (!values.length) return "";
  const w=260, h=64, gap=3;
  const max = Math.max(...values, 1);
  const bw = (w - gap*(values.length-1)) / values.length;
  const bars = values.map((v,i) => {
    const bh = Math.max(2, v/max*(h-14));
    return `<rect x="${(i*(bw+gap)).toFixed(1)}" y="${(h-12-bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2.5" fill="${colour}" opacity="${v?1:.25}"/>`;
  }).join("");
  const labs = labels ? labels.map((l,i)=>`<text x="${(i*(bw+gap)+bw/2).toFixed(1)}" y="${h-2}" font-size="7" text-anchor="middle" fill="currentColor" opacity=".55">${l}</text>`).join("") : "";
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:64px;display:block">${bars}${labs}</svg>`;
}
function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i=n-1;i>=0;i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, label: "JFMAMJJASOND"[d.getMonth()] });
  }
  return out;
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}
function idTime(p) {
  // Bulk/add flows mint ids like p1751234567890 — recover the creation date
  const m = String(p.id||"").match(/^p(\d{13})$/);
  return m ? parseInt(m[1]) : null;
}
function departureTime(p) {
  if (p.deleted && p.deletedAt) return new Date(p.deletedAt).getTime();
  if (p.dead) return p.deadAt ? new Date(p.deadAt).getTime() : 0; // 0 = unknown → excluded from history
  if (p.rehomed) {
    const h = p.rh && p.rh.history && p.rh.history.length ? p.rh.history[p.rh.history.length-1].at : null;
    return h ? new Date(h).getTime() : 0;
  }
  return Infinity; // still with us
}
function reconstructHerdSeries(weeksBack) {
  // Best-effort history: arrival = id timestamp, else DOB, else "always been here".
  // Departure = recorded delete/passing/collection date, else excluded (unknown).
  const pts = [];
  const now = new Date();
  const WEEK = 7*86400000;
  for (let i=weeksBack; i>=1; i--) {
    const at = now.getTime() - (i*WEEK);   // weekly sample points
    let count = 0;
    pigs.forEach(p => {
      const arrive = idTime(p) ?? (p.d ? new Date(p.d).getTime() : -Infinity);
      const depart = departureTime(p);
      if (depart === 0) return;        // left at an unknown time — can't place them
      if (arrive <= at && depart > at) count++;
    });
    const dt = new Date(at);
    pts.push({ t: at, v: count, label: `${dt.getDate()}/${dt.getMonth()+1}` });
  }
  // Final point: today's exact count (and daily snapshots keep sharpening the tail)
  const act = pigs.filter(p=>!p.deleted&&!p.dead&&!p.rehomed).length;
  pts.push({ t: now.getTime(), v: act, label: "now" });
  return pts;
}
function svgLineBig(points, colour) {
  if (points.length < 2) return "";
  const w=320, h=116, padL=6, padR=10, padT=10, padB=18;
  const vals = points.map(p=>p.v);
  const max = Math.max(...vals,1), min = Math.min(...vals,0);
  const span = (max-min)||1;
  const px = i => padL + i*(w-padL-padR)/(points.length-1);
  const py = v => padT + (h-padT-padB) * (1 - (v-min)/span);
  const line = points.map((p,i)=>`${px(i).toFixed(1)},${py(p.v).toFixed(1)}`).join(" ");
  const area = `${padL},${h-padB} ${line} ${(w-padR)},${h-padB}`;
  const grid = [0.25,0.5,0.75].map(f=>`<line x1="${padL}" y1="${(padT+(h-padT-padB)*f).toFixed(1)}" x2="${w-padR}" y2="${(padT+(h-padT-padB)*f).toFixed(1)}" stroke="currentColor" opacity=".12" stroke-width="1"/>`).join("");
  const labels = points.map((p,i)=> (i%3===0||i===points.length-1) ? `<text x="${px(i).toFixed(1)}" y="${h-4}" font-size="8" text-anchor="middle" fill="currentColor" opacity=".55">${p.label}</text>` : "").join("");
  const endDot = `<circle cx="${px(points.length-1).toFixed(1)}" cy="${py(points[points.length-1].v).toFixed(1)}" r="3.6" fill="${colour}"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:116px;display:block">
    ${grid}
    <polygon points="${area}" fill="${colour}" opacity=".15"/>
    <polyline points="${line}" fill="none" stroke="${colour}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    ${endDot}${labels}
  </svg>`;
}
function svgSemiGauge(pct, colour) {
  const clamped = Math.max(0, Math.min(1, pct));
  const r=52, cx=70, cy=64, sw=13;
  const arc = (frac) => {
    const a = Math.PI * (1 - frac);
    const x = cx + r*Math.cos(a), y = cy - r*Math.sin(a);
    return { x, y, large: frac > 0.5 ? 1 : 0 };
  };
  const end = arc(clamped);
  const track = `M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`;
  const fill = clamped > 0.005 ? `M ${cx-r} ${cy} A ${r} ${r} 0 ${end.large} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}` : "";
  return `<svg viewBox="0 0 140 74" style="width:150px;height:auto;display:block;margin:0 auto">
    <path d="${track}" fill="none" stroke="currentColor" opacity=".16" stroke-width="${sw}" stroke-linecap="round"/>
    ${fill?`<path d="${fill}" fill="none" stroke="${colour}" stroke-width="${sw}" stroke-linecap="round"/>`:""}
    <text x="${cx}" y="${cy-8}" font-size="17" font-weight="800" text-anchor="middle" fill="currentColor">${Math.round(clamped*100)}%</text>
  </svg>`;
}
function renderViz() {
  const el = document.getElementById("viz-grid"); if (!el) return;
  const act = pigs.filter(p=>!p.deleted&&!p.dead&&!p.rehomed);
  const months = lastMonths(12);
  const births = months.map(()=>0), litters = months.map(()=>0);
  pigs.forEach(p => (p.litters||[]).forEach(l => {
    if (!l.date) return;
    const idx = months.findIndex(m=>m.key===String(l.date).slice(0,7));
    if (idx>=0) { litters[idx]++; births[idx] += parseInt(l.size)||0; }
  }));
  // Born HERE in the last month: DOB within 30 days AND the record was created
  // while the pig was 10 days old or younger (so it was born into the herd,
  // not acquired). Falls back to DOB-only when the record has no timestamp.
  const MONTH_MS = 30*86400000, TEN_DAYS = 10*86400000;
  const nowMs = Date.now();
  const bornHere = pigs.filter(p => {
    if (!p.d) return false;
    const dob = new Date(p.d).getTime();
    if (isNaN(dob) || nowMs - dob > MONTH_MS || dob > nowMs) return false;
    const created = idTime(p);
    if (created === null) return true;                 // legacy record — count it
    return (created - dob) <= TEN_DAYS;
  }).length;
  const littersThisMonth = pigs.reduce((n,p) => n + (p.litters||[]).filter(l => {
    if (!l.date) return false;
    const t = new Date(l.date).getTime();
    return !isNaN(t) && nowMs - t <= MONTH_MS;
  }).length, 0);
  // Rehomed in last 12 months (from pipeline history)
  // Rehomed in the last month, dated from the pipeline's "collected" record
  const rehomedMonth = pigs.filter(p => {
    if (!p.rehomed) return false;
    const t = departureTime(p);
    return t && t !== Infinity && (nowMs - t) <= MONTH_MS;
  }).length;
  const rehomedUndated = pigs.filter(p => p.rehomed && departureTime(p) === 0).length;
  // Money: received vs outstanding across the live pipeline + collected
  let received=0, outstanding=0;
  pigs.forEach(p => {
    if (!p.rh) return;
    received += parseFloat(p.rh.paid)||0;
    if (!p.rehomed && !p.dead && !p.deleted && p.st==="rehome") outstanding += outstandingAmount(p.rh);
  });
  const moneyTotal = received + outstanding;
  // Herd history: reconstruction, with the daily snapshots sharpening recent points
  const series = reconstructHerdSeries(26);   // ~6 months, sampled weekly
  if (snapshots.length >= 2) {
    // Fold snapshot accuracy into any month-end the snapshots cover
    snapshots.forEach(s => {
      const st = new Date(s.d).getTime();
      series.forEach(pt => { if (Math.abs(pt.t - st) < 3.5*86400000) pt.v = s.a; });
    });
  }
  // Δ over the last two weeks, using the exact daily snapshots
  let delta = null, deltaLabel = "vs 2 weeks ago";
  if (snapshots.length >= 2) {
    const target = Date.now() - 14*86400000;
    let base = null, bestGap = Infinity;
    snapshots.forEach(s => {
      const gap = Math.abs(new Date(s.d).getTime() - target);
      if (gap < bestGap) { bestGap = gap; base = s; }
    });
    if (base) {
      const ageDays = Math.round((Date.now() - new Date(base.d).getTime())/86400000);
      if (ageDays >= 3) { // need a meaningfully old baseline
        delta = Math.round((act.length - base.a)/Math.max(base.a,1)*100);
        if (ageDays < 12 || ageDays > 16) deltaLabel = `vs ${ageDays} days ago`;
      }
    }
  }
  el.innerHTML = `
    <div class="viz-card viz-hero viz-tile-herd">
      <div class="viz-cap">Active herd over time</div>
      <div class="viz-hero-row">
        <div class="viz-num" style="font-size:34px">${act.length}</div>
        ${delta!==null?`<div class="viz-delta">${delta>=0?"&#9650;":"&#9660;"} ${Math.abs(delta)}% ${deltaLabel}</div>`:""}
      </div>
      ${svgLineBig(series, cssVar("--viz-herd-ink"))}
      <div class="viz-note" style="margin-top:6px">History is best-effort from records; it sharpens daily as the app collects real counts.</div>
    </div>
    <div class="viz-tiles">
      <div class="viz-card viz-tile-born">
        <div class="viz-cap">Born here &mdash; last 30 days</div>
        <div class="viz-num">${bornHere}</div>
        <div class="viz-note">${littersThisMonth} litter${littersThisMonth===1?"":"s"} recorded</div>
      </div>
      <div class="viz-card viz-tile-rehomed">
        <div class="viz-cap">Rehomed &mdash; last 30 days</div>
        <div class="viz-num">${rehomedMonth}</div>
        <div class="viz-note">${rehomedUndated ? `${rehomedUndated} older, undated` : "happy new homes &#127968;"}</div>
      </div>
    </div>
    <div class="viz-card viz-tile-births">
      <div class="viz-cap">Births by month</div>
      ${svgBars(births, cssVar("--viz-births-ink"), months.map(m=>m.label))}
    </div>
    <div class="viz-card viz-tile-income">
      <div class="viz-cap">Rehoming income</div>
      ${moneyTotal>0 ? svgSemiGauge(received/moneyTotal, cssVar("--viz-income-ink"))
        : `<div class="viz-note" style="margin-top:8px">No sales recorded yet &mdash; amounts appear here once rehoming details are filled in.</div>`}
      ${moneyTotal>0?`<div class="viz-gauge-legend"><span><strong>&pound;${received.toFixed(0)}</strong> received</span><span><strong>&pound;${outstanding.toFixed(0)}</strong> outstanding</span></div>`:""}
    </div>`;
}
// ── Breed pill tints ─────────────────────────────────────────────────────────
function breedTintClass(br) {
  if (!br) return "";
  const palette = ["tint-pink","tint-blue","tint-amber","tint-green","tint-purple","tint-orange"];
  let h = 0;
  for (const ch of String(br).toLowerCase()) h = (h*31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
