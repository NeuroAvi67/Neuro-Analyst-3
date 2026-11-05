"use strict";
/* NEURO ANALYST - mobile-first frontend (vanilla JS). All text is inserted with textContent (no innerHTML). */
const $ = (s, r = document) => r.querySelector(s);
const main = $("#view");
const state = { files: [], primary: null, cmp: new Set(), mode: "auto", provider: null, providers: [], instruction: "", missing: "fill", dedup: true, compare: null, timer: null };
const STAGES = [["inspect", "Inspecting dataset"], ["clean", "Cleaning a copy of the data"], ["plan", "Understanding your request"], ["stats", "Running statistical analysis"], ["advanced", "Running advanced analysis"], ["charts", "Building charts"], ["interpret", "Interpreting verified results"], ["verify", "Checking conclusions against calculations"], ["done", "Complete"]];
const REPORT_TYPES = [["general", "General"], ["scientific", "Scientific"], ["executive", "Executive"], ["business", "Business"], ["statistical", "Statistical"], ["top_findings", "Top findings"]];
const EXAMPLES = ["Analyse this dataset, identify important trends, calculate correlations, detect anomalies and generate a professional scientific report.", "Generate an executive summary.", "Identify the 10 most important findings.", "Explain all significant correlations."];

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; n.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return n;
}
const put = (n, ...k) => n.append(...k.flat(Infinity).filter(x => x != null && x !== false));
const fill = (n, ...k) => { n.replaceChildren(); put(n, ...k); };
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3800); }
async function api(path, opts = {}) {
  let r; try { r = await fetch(path, opts); } catch (e) { throw new Error("Cannot reach the server."); }
  let d = null; if ((r.headers.get("content-type") || "").includes("json")) d = await r.json();
  if (!r.ok) throw new Error((d && d.error) || `Request failed (${r.status})`);
  return d;
}
const post = (p, b) => api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const fmtBytes = b => b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(1) + " MB";
const fmtDate = t => new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const num = v => v == null ? "" : (typeof v === "number" ? (Number.isInteger(v) ? String(v) : Number(v.toPrecision(4)).toString()) : String(v));
const busy = text => el("div", { class: "row", style: "padding:20px 0" }, el("span", { class: "spin" }), el("span", { class: "mut", text }));
const err = m => el("div", { class: "banner bad", text: m });

/* ---------- charts ---------- */
function plot(div, fig) {
  if (!window.Plotly) { div.append(el("p", { class: "mut", text: "Charts need plotly.js, which loads from the internet on first use." })); return; }
  const light = document.documentElement.dataset.theme === "light", L = JSON.parse(JSON.stringify(fig.layout || {}));
  L.font = { ...(L.font || {}), color: getComputedStyle(document.documentElement).getPropertyValue("--chart").trim() || "#cfd6ee" };
  L.paper_bgcolor = "rgba(0,0,0,0)"; L.plot_bgcolor = "rgba(0,0,0,0)";
  for (const a of ["xaxis", "yaxis"]) if (L[a]) L[a].gridcolor = light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.08)";
  Plotly.newPlot(div, fig.data, L, { responsive: true, displaylogo: false, displayModeBar: false });
}
function chartCard(c) { const d = el("div", { class: "chart" }); setTimeout(() => plot(d, c.figure), 0); return el("div", { class: "card" }, d); }

/* ---------- markdown-lite (headings, lists, paragraphs) ---------- */
function mdLite(text) {
  const out = []; let list = null, kind = null;
  const flush = () => { if (list) { out.push(el(kind, {}, list.map(x => el("li", { text: x })))); list = null; } };
  for (const raw of (text || "").split("\n")) {
    const s = raw.trim(); if (!s) { flush(); continue; }
    let m;
    if (s.startsWith("#")) { flush(); out.push(el("h3", { text: s.replace(/^#+\s*/, "") })); }
    else if ((m = s.match(/^[-*]\s+(.*)/))) { if (kind !== "ul") flush(); kind = "ul"; (list = list || []).push(m[1]); }
    else if ((m = s.match(/^\d+\.\s+(.*)/))) { if (kind !== "ol") flush(); kind = "ol"; (list = list || []).push(m[1]); }
    else { flush(); out.push(el("p", { text: s })); }
  }
  flush(); return out;
}
function table(rows) {
  return el("div", { class: "scroll" }, el("table", {}, el("thead", {}, el("tr", {}, rows[0].map(c => el("th", { text: c })))), el("tbody", {}, rows.slice(1).map(r => el("tr", {}, r.map(c => el("td", { text: c })))))));
}
function renderBlocks(blocks, charts) {
  const cm = Object.fromEntries((charts || []).map(c => [c.id, c]));
  return blocks.map(b => {
    if (b[0] === "p") return el("p", { text: b[1] });
    if (b[0] === "ul" || b[0] === "ol") return el(b[0], {}, b[1].map(x => el("li", { text: x })));
    if (b[0] === "table") return table(b[1]);
    if (b[0] === "chart" && cm[b[1]]) return chartCard(cm[b[1]]);
    return null;
  });
}

/* ---------- router ---------- */
function route() {
  clearInterval(state.timer);
  const [path, qs] = (location.hash || "#/home").slice(2).split("?"); const [name, arg] = path.split("/");
  const q = new URLSearchParams(qs || "");
  document.querySelectorAll(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === ({ home: "home", new: "new", work: "new", compare: "new", report: "library", library: "library", settings: "settings" }[name] || "home")));
  main.replaceChildren(); window.scrollTo(0, 0);
  const views = { home: vHome, new: vNew, work: vWork, report: vReport, library: vLibrary, settings: vSettings, compare: vCompare };
  (views[name] || vHome)(arg, q).catch(e => main.replaceChildren(err(e.message)));
}
window.addEventListener("hashchange", route);

/* ---------- A. dashboard ---------- */
async function vHome() {
  main.append(el("h1", {}, "Turn Raw Data Into ", el("span", { class: "grad", text: "Intelligence." })), el("p", { class: "mut", text: "Upload a dataset, say what you want, and get verified statistics, charts and a professional report." }),
    el("div", { class: "grid2", style: "margin-top:14px" }, el("a", { class: "btn primary", href: "#/new", text: "＋ New Analysis" }), el("a", { class: "btn", href: "#/new?pick=1", text: "⇪ Upload Dataset" })));
  const box = el("div", {}, busy("Loading…")); main.append(box);
  const lib = await api("/api/library"), s = lib.storage;
  fill(box, el("h2", { text: "Quick statistics" }), el("div", { class: "grid3" }, [["Datasets", s.datasets], ["Reports", s.reports], ["Storage", fmtBytes(s.uploads_bytes + s.cleaned_bytes + s.reports_bytes)]].map(([k, v]) => el("div", { class: "card stat" }, el("b", { text: v }), el("span", { text: k })))),
    el("h2", { text: "Recent projects" }), lib.datasets.length ? el("div", { class: "card" }, lib.datasets.slice(0, 5).map(d => el("a", { class: "item", href: `#/new?file=${d.id}`, style: "color:inherit;text-decoration:none" }, el("div", { class: "grow" }, el("b", { text: d.name }), el("div", { class: "mut", text: `${d.rows} rows × ${d.cols} cols${d.project ? " · " + d.project : ""}` })), el("span", { class: "badge", text: "Analyse" })))) : el("p", { class: "mut", text: "No datasets yet. Upload one to begin." }),
    el("h2", { text: "Saved reports" }), lib.reports.length ? el("div", { class: "card" }, lib.reports.slice(0, 5).map(r => el("a", { class: "item", href: `#/report/${r.id}`, style: "color:inherit;text-decoration:none" }, el("div", { class: "grow" }, el("b", { text: r.title }), el("div", { class: "mut", text: `${r.report_type} · ${fmtDate(r.created)}` })), el("span", { class: "badge", text: "Open" })))) : el("p", { class: "mut", text: "No reports yet." }));
}

/* ---------- B. new analysis ---------- */
async function vNew(_, q) {
  if (!state.providers.length) { try { state.providers = (await api("/api/ai/status")).providers; } catch (e) { /* offline mode still works */ } }
  const fid = q.get("file");
  if (fid && !state.files.find(f => f.id === fid)) {
    const lib = await api("/api/library"), d = lib.datasets.find(x => x.id === fid);
    if (d) { state.files.push({ id: d.id, name: d.name, size_bytes: d.size_bytes, ext: d.ext, inspection: { rows: d.rows, columns: d.cols, issues: [], preview: [], column_info: [] } }); }
  }
  if (fid) state.primary = fid;
  const zone = el("label", { class: "drop" }, el("div", { style: "font-size:30px", text: "⇪" }), el("b", { text: "Tap to choose files, or drop them here" }), el("div", { class: "mut", text: "CSV · XLSX · XLS · JSON · TXT · PDF tables — up to 25 MB each" }),
    el("input", { type: "file", multiple: true, accept: ".csv,.xlsx,.xls,.json,.txt,.pdf", onchange: e => doUpload(e.target.files) }));
  ["dragover", "dragenter"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove("over"); }));
  zone.addEventListener("drop", e => doUpload(e.dataTransfer.files));
  main.append(el("h1", { text: "New analysis" }), zone, el("div", { id: "files" }), el("div", { id: "preview" }), el("div", { id: "setup" }));
  paintFiles(); if (q.get("pick")) zone.querySelector("input").click();
}
async function doUpload(fl) {
  if (!fl || !fl.length) return;
  const fd = new FormData(); for (const f of fl) fd.append("files", f);
  const st = $("#files"); st.prepend(busy("Uploading and inspecting…"));
  try {
    const d = await api("/api/upload", { method: "POST", body: fd });
    for (const f of d.files) { if (f.error) toast(`${f.name}: ${f.error}`); else { state.files.push(f); state.primary = f.id; } }
  } catch (e) { toast(e.message); }
  paintFiles();
}
function paintFiles() {
  const box = $("#files"), pv = $("#preview"), su = $("#setup"); if (!box) return;
  box.replaceChildren(...(state.files.length ? [el("h2", { text: "Datasets" })] : []), ...state.files.map(f => {
    const i = f.inspection || {};
    return el("div", { class: "card", style: f.id === state.primary ? "border-color:var(--ac)" : "" }, el("div", { class: "row" },
      el("div", { class: "grow", onclick: () => { state.primary = f.id; paintFiles(); } }, el("b", { text: f.name }), el("div", { class: "mut", text: `${fmtBytes(f.size_bytes)} · ${i.rows} rows × ${i.columns} cols · ${(i.issues || []).length} data issue(s)` })),
      el("label", { class: "chip" + (state.cmp.has(f.id) ? " on" : ""), onclick: e => { e.preventDefault(); state.cmp.has(f.id) ? state.cmp.delete(f.id) : state.cmp.add(f.id); paintFiles(); } }, "Compare")));
  }));
  const p = state.files.find(f => f.id === state.primary), i = p && p.inspection;
  fill(pv); if (i && i.preview && i.preview.length) {
    const cols = Object.keys(i.preview[0]);
    put(pv, el("h2", { text: "Preview — " + p.name }), el("div", { class: "card" }, table([cols, ...i.preview.map(r => cols.map(c => r[c] == null ? "—" : typeof r[c] === "number" ? num(r[c]) : String(r[c])))])),
      i.column_info.length ? el("div", { class: "card" }, el("b", { text: "Column types" }), el("div", { class: "chips", style: "margin-top:8px" }, i.column_info.map(c => el("span", { class: "chip", text: `${c.name}: ${c.type}` })))) : null,
      i.issues.length ? el("div", { class: "banner" }, el("b", { text: "Data quality notes" }), el("ul", { style: "margin:6px 0 0;padding-left:18px" }, i.issues.slice(0, 6).map(x => el("li", { text: `${x.column || "Dataset"}: ${x.detail}` })))) : null);
  }
  su.replaceChildren(); if (!state.files.length) return;
  const ta = el("textarea", { placeholder: "Describe what you want, e.g. “Find the strongest relationships and explain them in an executive summary.”", oninput: e => state.instruction = e.target.value }); ta.value = state.instruction;
  const cfg = state.providers.filter(x => x.configured && x.name !== "offline");
  const seg = el("div", { class: "seg" }, [["auto", "Auto"], ["offline", "Offline stats"], ["ai", "AI"]].map(([k, t]) => el("button", { class: state.mode === k ? "on" : "", text: t, onclick: () => { state.mode = k; paintFiles(); } })));
  if (state.mode === "ai" && !state.provider && cfg.length) state.provider = cfg[0].name;
  su.append(el("h2", { text: "Your instruction" }), ta, el("div", { class: "chips", style: "margin-top:8px" }, EXAMPLES.map(t => el("span", { class: "chip", text: t.length > 38 ? t.slice(0, 36) + "…" : t, onclick: () => { state.instruction = t; paintFiles(); } }))),
    el("h2", { text: "Analysis mode" }), seg,
    state.mode === "ai" ? (cfg.length ? el("select", { onchange: e => state.provider = e.target.value }, cfg.map(c => el("option", { value: c.name, text: `${c.name} (${c.model})`, selected: c.name === state.provider }))) : el("div", { class: "banner", text: "No AI provider is configured on the server. Offline statistics will be used. See Settings." })) : el("p", { class: "mut", text: state.mode === "offline" ? "Fully offline: every number is calculated in Python; wording is rule-based." : "Uses the server's default provider if one is configured, otherwise offline statistics." }),
    el("details", { style: "margin-top:12px" }, el("summary", { class: "mut", text: "Cleaning options" }), el("div", { class: "card" }, el("label", { class: "mut", text: "Missing values" }), el("select", { onchange: e => state.missing = e.target.value }, [["fill", "Fill (median / most common)"], ["drop_rows", "Drop rows with gaps"], ["none", "Leave as is"]].map(([v, t]) => el("option", { value: v, text: t, selected: state.missing === v }))),
      el("label", { class: "row", style: "margin-top:10px" }, el("input", { type: "checkbox", checked: state.dedup, onchange: e => state.dedup = e.target.checked }), el("span", { text: "Remove duplicate rows" })), el("p", { class: "mut", text: "Cleaning is applied to a copy; your original file is never changed." }))),
    el("div", { class: "grid2", style: "margin-top:16px" }, el("button", { class: "primary", text: "Start Analysis", disabled: !state.primary, onclick: startAnalysis }), el("button", { text: "Compare 2 datasets", disabled: state.cmp.size !== 2, onclick: startCompare })));
}
async function startAnalysis(ev) {
  ev.target.disabled = true;
  try {
    const provider = state.mode === "offline" ? "offline" : state.mode === "ai" ? state.provider : undefined;
    const d = await post("/api/analyze", { file_id: state.primary, instruction: state.instruction, provider, clean_options: { missing: state.missing, drop_duplicates: state.dedup } });
    location.hash = `#/work/${d.job_id}`;
  } catch (e) { toast(e.message); ev.target.disabled = false; }
}
async function startCompare(ev) {
  ev.target.disabled = true; const ids = [...state.cmp];
  try { const d = await post("/api/compare", { file_ids: ids }); state.compare = { ...d, ids }; location.hash = "#/compare"; }
  catch (e) { toast(e.message); ev.target.disabled = false; }
}

/* ---------- C. analysis workspace ---------- */
async function vWork(jid) {
  const box = el("div"); main.append(el("h1", { text: "Analysis workspace" }), box);
  const draw = j => {
    const idx = Math.max(0, STAGES.findIndex(s => s[0] === j.stage));
    box.replaceChildren(el("div", { class: "card" }, el("div", { class: "row" }, el("b", { class: "grow", text: j.label || "Starting…" }), el("span", { class: "mut", text: (j.progress || 0) + "%" })), el("div", { class: "bar", style: "margin-top:10px" }, el("i", { style: `width:${j.progress || 3}%` })),
      el("ul", { class: "steps" }, STAGES.slice(0, -1).map((s, n) => el("li", { class: n < idx ? "done" : n === idx ? "now" : "" }, el("span", { class: "dot" }), s[1])))));
  };
  draw({ progress: 2, label: "Starting…" });
  const tick = async () => {
    try {
      const j = await api(`/api/jobs/${jid}`);
      if (j.status === "error") { clearInterval(state.timer); box.replaceChildren(err(j.error), el("a", { class: "btn", href: "#/new", text: "Back" })); }
      else if (j.status === "done") { clearInterval(state.timer); await showResult(box, j.report_id); }
      else draw(j);
    } catch (e) { clearInterval(state.timer); box.replaceChildren(err(e.message), el("a", { class: "btn", href: "#/library", text: "Open Library" })); }
  };
  state.timer = setInterval(tick, 800); tick();
}
async function showResult(box, rid) {
  const { result: r } = await api(`/api/reports/${rid}`), i = r.inspection, c = r.cleaning;
  const facts = r.facts.filter(f => f.category !== "dataset").sort((a, b) => b.importance - a.importance).slice(0, r.plan.top_n);
  fill(box,
    el("div", { class: "row wrap" }, el("span", { class: "badge ok", text: "Complete" }), el("span", { class: "badge", text: r.mode }), el("span", { class: "badge" + (r.verification.status === "verified" ? " ok" : " warn"), text: r.verification.status === "verified" ? "numbers verified" : "unverified numbers" })),
    r.warning ? el("div", { class: "banner", text: r.warning }) : null,
    el("div", { class: "grid3", style: "margin-top:12px" }, [["Rows", c.after.rows], ["Columns", i.columns], ["Missing", c.before.missing_cells + " → " + c.after.missing_cells]].map(([k, v]) => el("div", { class: "card stat" }, el("b", { text: v }), el("span", { text: k })))),
    el("div", { class: "grid2" }, el("a", { class: "btn primary", href: `#/report/${rid}`, text: "Open report" }), el("a", { class: "btn", href: `#/new?file=${r.file_id}`, text: "Analyse again" })),
    el("h2", { text: "Key insights (verified)" }), facts.length ? facts.map(f => el("div", { class: "insight" }, el("div", { text: f.text }), el("small", { text: `${f.category} · ${f.id}` }))) : el("p", { class: "mut", text: "No statistically notable patterns were found." }),
    el("h2", { text: "Interactive charts" }), r.charts.length ? r.charts.map(chartCard) : el("p", { class: "mut", text: "Not enough suitable columns for charts." }),
    el("h2", { text: "Summary" }), el("div", { class: "card rep" }, mdLite(r.narrative)),
    el("h2", { text: "Dataset overview" }), el("div", { class: "card" }, table([["Column", "Type", "Missing %", "Unique"], ...i.column_info.slice(0, 30).map(x => [x.name, x.type, num(x.missing_pct), x.unique])])));
}

/* ---------- D. report viewer ---------- */
async function vReport(rid, q) {
  let type = q.get("type") || "";
  const body = el("div", { class: "rep" }), bar = el("div", { class: "chips" });
  main.append(el("h1", { id: "rtitle", text: "Report" }), bar, el("div", { class: "row wrap", style: "margin:12px 0" }), body);
  const actions = main.children[2];
  const load = async () => {
    fill(body, busy("Building report…"));
    const d = await api(`/api/reports/${rid}${type ? "?type=" + type : ""}`), rep = d.report; type = rep.type;
    $("#rtitle").textContent = rep.title;
    bar.replaceChildren(...REPORT_TYPES.map(([k, t]) => el("span", { class: "chip" + (k === type ? " on" : ""), text: t, onclick: () => { type = k; load().catch(e => toast(e.message)); } })));
    actions.replaceChildren(...["pdf", "md", "html"].map(f => el("a", { class: "btn small" + (f === "pdf" ? " primary" : ""), href: `/api/reports/${rid}/export?format=${f}${type ? "&type=" + type : ""}`, download: "", text: f === "pdf" ? "Download PDF" : f === "md" ? "Export Markdown" : "Export HTML" })),
      el("button", { class: "small", text: "Copy findings", onclick: () => copyFindings(rep) }));
    fill(body, el("p", { class: "mut", text: `Generated ${rep.generated} · ${rep.mode}` }), ...rep.sections.flatMap((s, n) => [el("h2", { text: `${n + 1}. ${s.title}` }), ...renderBlocks(s.blocks, d.result.charts)]),
      el("h2", { text: "Continue analysis" }), followUp(d.result));
  };
  await load();
}
function followUp(r) {
  const ta = el("textarea", { placeholder: "Ask a follow-up, e.g. “Focus on outliers in sales and explain them.”" });
  return el("div", { class: "card" }, ta, el("button", { class: "primary block", style: "margin-top:10px", text: "Run follow-up analysis", onclick: async e => { e.target.disabled = true; try { const d = await post("/api/analyze", { file_id: r.file_id, instruction: ta.value || r.instruction }); location.hash = `#/work/${d.job_id}`; } catch (x) { toast(x.message); e.target.disabled = false; } } }));
}
async function copyFindings(rep) {
  const sec = rep.sections.find(s => s.id === "insights") || rep.sections[0], lines = [];
  for (const b of sec.blocks) { if (b[0] === "p") lines.push(b[1]); else if (b[0] === "ul" || b[0] === "ol") b[1].forEach((x, i) => lines.push((b[0] === "ol" ? `${i + 1}. ` : "- ") + x)); }
  const text = lines.join("\n");
  try { await navigator.clipboard.writeText(text); toast("Findings copied"); }
  catch (e) { const t = el("textarea", { style: "position:fixed;opacity:0" }); t.value = text; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); toast("Findings copied"); }
}

/* ---------- comparison ---------- */
async function vCompare() {
  const c = state.compare; if (!c) { location.hash = "#/new"; return; }
  const dl = async f => { try { const r = await fetch("/api/compare/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_ids: c.ids, format: f }) }); if (!r.ok) throw new Error((await r.json()).error); const a = el("a", { href: URL.createObjectURL(await r.blob()), download: `comparison.${f}` }); document.body.append(a); a.click(); a.remove(); } catch (e) { toast(e.message); } };
  main.append(el("h1", { text: c.report.title }), el("div", { class: "row wrap", style: "margin:10px 0" }, ["pdf", "md", "html"].map(f => el("button", { class: "small" + (f === "pdf" ? " primary" : ""), text: f.toUpperCase(), onclick: () => dl(f) }))),
    el("div", { class: "rep" }, c.report.sections.flatMap((s, n) => [el("h2", { text: `${n + 1}. ${s.title}` }), ...renderBlocks(s.blocks, c.comparison.charts)]), c.comparison.charts.map(chartCard)));
}

/* ---------- E. library ---------- */
async function vLibrary() {
  const list = el("div"), s = el("input", { type: "search", placeholder: "Search datasets, reports, projects…" });
  main.append(el("h1", { text: "Research library" }), s, list);
  const load = async () => {
    const lib = await api("/api/library?q=" + encodeURIComponent(s.value));
    const act = (label, fn, cls = "") => el("button", { class: "small " + cls, text: label, onclick: async () => { try { await fn(); await load(); } catch (e) { toast(e.message); } } });
    list.replaceChildren(el("h2", { text: `Datasets (${lib.datasets.length})` }), lib.datasets.length ? el("div", { class: "card" }, lib.datasets.map(d => el("div", { class: "item", style: "flex-wrap:wrap" }, el("div", { class: "grow" }, el("b", { text: d.name }), el("div", { class: "mut", text: `${d.rows}×${d.cols} · ${fmtBytes(d.size_bytes)}${d.project ? " · 📁 " + d.project : ""}` })),
      el("div", { class: "row wrap" }, el("a", { class: "btn small", href: `#/new?file=${d.id}`, text: "Analyse" }),
        act("Rename", async () => { const n = prompt("New name", d.name); if (n) await api(`/api/datasets/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) }); }),
        act("Project", async () => { const n = prompt("Project name (blank to clear)", d.project || ""); if (n !== null) await api(`/api/datasets/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: n }) }); }),
        act("Delete", async () => { if (!confirm(`Delete "${d.name}" and its cleaned copy from the server?`)) return; const w = confirm("Also delete reports built from it?\nOK = delete reports too, Cancel = keep reports."); await api(`/api/datasets/${d.id}?with_reports=${w ? 1 : 0}`, { method: "DELETE" }); state.files = state.files.filter(f => f.id !== d.id); }, "danger"))))) : el("p", { class: "mut", text: "No datasets." }),
      el("h2", { text: `Saved reports (${lib.reports.length})` }), lib.reports.length ? el("div", { class: "card" }, lib.reports.map(r => el("div", { class: "item", style: "flex-wrap:wrap" }, el("div", { class: "grow" }, el("b", { text: r.title }), el("div", { class: "mut", text: `${r.report_type} · ${fmtDate(r.created)} · ${r.mode}${r.project ? " · 📁 " + r.project : ""}` })),
        el("div", { class: "row wrap" }, el("a", { class: "btn small", href: `#/report/${r.id}`, text: "Open" }),
          act("Rename", async () => { const n = prompt("New title", r.title); if (n) await api(`/api/reports/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: n }) }); }),
          act("Delete", async () => { if (confirm("Delete this report?")) await api(`/api/reports/${r.id}`, { method: "DELETE" }); }, "danger"))))) : el("p", { class: "mut", text: "No reports." }));
  };
  let t; s.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => load().catch(e => toast(e.message)), 250); });
  await load();
}

/* ---------- F. settings ---------- */
async function vSettings() {
  const [ai, pv, st] = await Promise.all([api("/api/ai/status"), api("/api/privacy"), api("/api/storage")]);
  const theme = localStorage.getItem("theme") || "dark";
  main.append(el("h1", { text: "Settings" }),
    el("h2", { text: "Theme" }), el("div", { class: "seg" }, ["dark", "light"].map(t => el("button", { class: theme === t ? "on" : "", text: t[0].toUpperCase() + t.slice(1), onclick: () => { localStorage.setItem("theme", t); applyTheme(); route(); } }))),
    el("h2", { text: "AI providers" }), el("div", { class: "card" }, ai.providers.map(p => el("div", { class: "item" }, el("div", { class: "grow" }, el("b", { text: p.name }), el("div", { class: "mut", text: p.model || (p.name === "offline" ? "No AI — statistics only" : "") })), el("span", { class: "badge " + (p.configured ? "ok" : ""), text: p.name === ai.default ? "default" : p.configured ? "configured" : "not set" }))),
      el("p", { class: "mut", text: "API keys are set as environment variables on the server (e.g. GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, or run Ollama locally) and never reach the browser. Choose the default with NEURO_AI_PROVIDER. Free tiers have rate limits and their terms can change." })),
    el("h2", { text: "Privacy" }), el("div", { class: "card" }, el("p", { text: pv.storage }), el("p", { text: pv.ai }), el("p", { class: "mut", text: pv.deletion })),
    el("h2", { text: "Storage" }), el("div", { class: "card" }, [["Uploaded files", fmtBytes(st.uploads_bytes)], ["Cleaned copies", fmtBytes(st.cleaned_bytes)], ["Reports", fmtBytes(st.reports_bytes)], ["Max file size", st.max_file_mb + " MB"]].map(([k, v]) => el("div", { class: "item" }, el("span", { class: "grow", text: k }), el("b", { text: v }))),
      el("button", { class: "danger block", style: "margin-top:12px", text: "Delete ALL data", onclick: async () => { if (confirm("Permanently delete every dataset, cleaned copy and report on the server?")) { await post("/api/storage/clear", {}); state.files = []; state.primary = null; state.cmp.clear(); toast("All data deleted"); route(); } } })));
}
function applyTheme() { document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark"; $("meta[name=theme-color]").content = document.documentElement.dataset.theme === "light" ? "#f4f6fc" : "#070b1a"; }

applyTheme(); route();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
