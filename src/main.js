import {SPECIES, GROVE} from "./engine/species.js";
import {DEFAULT_SETTINGS, speciesDefaults, buildParams} from "./params.js";
import {Motion} from "./motion.js";
import {readColors, layoutScene, fit, pick, drawScene, cameraFor, skeletonBounds, drawSkeleton, drawScale} from "./render.js";
import {heroScene} from "./hero.js";
import {createLanding} from "./landing.js";
import {initLiquidGlass} from "./liquidGlass.js";
import {SUGGESTIONS} from "./config.js";

const $ = id => document.getElementById(id);
const fmtNum = (v, d = 1) => Number(v).toLocaleString("es-ES", {minimumFractionDigits: d, maximumFractionDigits: d});

/* ---------- estado ---------- */
const state = {
  species: "platano",
  seed: 1 + Math.floor(Math.random() * 99998),   // cada vez que se abre, otra variante
  view: "alzado",
  values: {...DEFAULT_SETTINGS, ...speciesDefaults("platano")},
};
const motion = new Motion();
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- worker ---------- */
let worker = null, reqId = 0, pending = new Map(), scene = null, drawBusy = false;
function startWorker() {
  worker = new Worker(new URL("./worker.js", import.meta.url), {type: "module"});
  worker.onmessage = e => {
    const {id, type} = e.data, job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    type === "error" ? job.reject(new Error(e.data.message)) : job.resolve(e.data);
  };
}
startWorker();
// Un cálculo nuevo cancela el anterior: el worker se reinicia y las peticiones en curso se descartan.
function cancelWorker() {
  worker.terminate();
  for (const job of pending.values()) job.reject(new Error("cancelado"));
  pending.clear();
  startWorker();
}

function ask(msg) {
  const id = ++reqId;
  return new Promise((resolve, reject) => { pending.set(id, {resolve, reject}); worker.postMessage({...msg, id}); });
}

const params = () => buildParams(state.species, state.values, state.seed);
const viewList = () => state.view === "tres" ? ["alzado", "planta", "iso"] : [state.view];

/* ---------- dibujo ---------- */
let drawTimer = 0, latest = 0;
function requestDraw(delay = 0) {
  clearTimeout(drawTimer);
  drawTimer = setTimeout(async () => {
    const id = ++latest, p = params(), list = viewList();
    $("busy").hidden = false;
    if (drawBusy) cancelWorker();          // hay un cálculo obsoleto en curso: se cancela
    drawBusy = true;
    try {
      const res = await ask({type: "draw", params: p, views: list});
      if (id !== latest) return;
      if (res.skeleton) lastSkel = res.skeleton;
      setScene(p, list, res.views, res.name);
      if (tr) tr.ready = true;
      showSimplification(p, res.stats);
    } catch (err) {
      if (err.message !== "cancelado") console.error(err);
    } finally {
      drawBusy = false;
      if (id === latest) $("busy").hidden = true;
    }
  }, delay);
}

function setScene(p, list, views, name) {
  scene = {p, views, layout: layoutScene(views, list)};
  motion.frames = {};
  for (const v of list) { motion.setFrame(v, views[v].bb, v === "planta" ? views[v].potR * 1.05 : views[v].potTop); motion.setCrown(v, views[v].crown); }
  motion.leaves = motion.leaves.filter(l => views[l.view]);
  const S = SPECIES[p.species];
  motion.stiff = S.mode === "roca" ? 0.08 : S.mode === "hiedra" ? 0.45 : 1;
  motion.leafRate = S.mode === "roca" ? 0 : S.caduca
    ? {primavera: 4, verano: 4, otono: 14, invierno: 0}[p.estacion]
    : (S.mode === "graminea" || S.mode === "palmera") ? 2 : 3;
  const total = list.reduce((s, v) => s + views[v].count, 0);
  $("meta").textContent = name + " · " + total.toLocaleString("es-ES") + " polilíneas";
  resize();
}

/* ---------- canvas y bucle ---------- */
const cv = $("cv"), ctx = cv.getContext("2d");
let colors = readColors(document.documentElement), cssW = 0, cssH = 0, dpr = 1;

function dockInset() {
  const dock = document.querySelector(".dock"), stage = $("stage");
  const r = dock.getBoundingClientRect(), s = stage.getBoundingClientRect();
  const drawer = $("ajustes"), wide = innerWidth > 860;
  const right = wide && drawer.classList.contains("open") ? Math.max(0, s.right - (innerWidth - 12 - drawer.offsetWidth) + 16) : 0;
  const ficha = document.querySelector(".ficha").getBoundingClientRect();
  return {bottom: Math.max(0, s.bottom - r.top), right, top: Math.max(0, ficha.bottom - s.top)};
}

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cssW = cv.clientWidth; cssH = cv.clientHeight;
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  if (scene) scene.fitted = fit(scene.layout, cssW, cssH, dockInset());
  paint();
}

function paint() {
  if (tr) return;                       // durante el cambio de vista dibuja la transición
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!scene || !scene.fitted) return;
  const inset = dockInset();
  drawScene(ctx, scene, motion, colors, {scaleX: Math.max(24, cssW * 0.04), scaleY: cssH - inset.bottom - 22, maxW: cssW * 0.45});
}

/* ---------- cambio de vista en 3D ---------- */
// Al pasar de alzado a planta o a isométrica (o al girar la isométrica), la cámara gira
// alrededor de un esqueleto ligero de la planta mientras el motor calcula el dibujo
// definitivo; al llegar, el esqueleto se funde con el dibujo final.
let lastSkel = null, tr = null;
const MOVE_MS = 950, FADE_MS = 280;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const scaleOpts = () => ({scaleX: Math.max(24, cssW * 0.04), scaleY: cssH - dockInset().bottom - 22, maxW: cssW * 0.45});

function startTransition(from, to) {
  if (reduceMotion.matches || !lastSkel || !scene?.fitted || scene.layout.items.length !== 1) return;
  const it = scene.layout.items[0], f0 = scene.fitted;
  const bb = skeletonBounds(lastSkel, to), pad = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.06;
  const f1 = fit({bb: [bb[0] - pad, Math.min(bb[1], 0) - pad, bb[2] + pad, bb[3] + pad]}, cssW, cssH, dockInset());
  tr = {from, to, t0: performance.now(), ready: false, fade: null,
    tf0: {sc: f0.sc, X0: f0.ox + it.dx * f0.sc, Y0: f0.oy - it.dy * f0.sc},
    tf1: {sc: f1.sc, X0: f1.ox, Y0: f1.oy}};
  requestAnimationFrame(stepTransition);
}

function stepTransition(now) {
  if (!tr) return;
  const t = Math.min(1, (now - tr.t0) / MOVE_MS), e = ease(t);
  const cam = {az: lerp(tr.from.az, tr.to.az, e), el: lerp(tr.from.el, tr.to.el, e)};
  const tf = {sc: lerp(tr.tf0.sc, tr.tf1.sc, e), X0: lerp(tr.tf0.X0, tr.tf1.X0, e), Y0: lerp(tr.tf0.Y0, tr.tf1.Y0, e)};
  if (t >= 1 && tr.ready && tr.fade === null) tr.fade = now;
  const a = tr.fade === null ? 0 : Math.min(1, (now - tr.fade) / FADE_MS);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.globalAlpha = 1 - a;
  drawSkeleton(ctx, lastSkel, cam, tf, colors);
  if (a === 0) drawScale(ctx, tf.sc, scaleOpts(), colors);
  if (a > 0 && scene?.fitted) { ctx.globalAlpha = a; drawScene(ctx, scene, motion, colors, scaleOpts()); }
  ctx.globalAlpha = 1;
  if (a >= 1) { tr = null; paint(); if (motion.active()) wake(); return; }
  requestAnimationFrame(stepTransition);
}

let last = 0, running = false;
function loop(t) {
  const dt = last ? (t - last) / 1000 : 0;
  last = t;
  motion.step(dt);
  paint();
  if (motion.active()) requestAnimationFrame(loop);
  else { running = false; last = 0; paint(); }
}
function wake() { if (!running) { running = true; last = 0; requestAnimationFrame(loop); } }

/* ---------- interacción con la planta ---------- */
let press = null;
const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

cv.addEventListener("pointerdown", e => {
  if (!scene) return;
  const [sx, sy] = local(e), hit = pick(scene, sx, sy);
  if (!hit) return;
  press = {sx, sy, hit, dragging: false, id: e.pointerId};
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener("pointermove", e => {
  if (!scene) return;
  const [sx, sy] = local(e);
  if (!press) { cv.style.cursor = pick(scene, sx, sy) ? "grab" : "default"; return; }
  if (!press.dragging && Math.hypot(sx - press.sx, sy - press.sy) > 6) {
    press.dragging = motion.grab(press.hit.v, press.hit.x, press.hit.y);
    cv.style.cursor = "grabbing";
    dismissHint();
  }
  if (press.dragging) {
    const {sc, ox, oy} = scene.fitted, it = scene.layout.items.find(i => i.v === press.hit.v);
    motion.pull((sx - ox) / sc - it.dx, (oy - sy) / sc - it.dy);
    wake();
  }
});
const endPress = () => {
  if (!press) return;
  if (press.dragging) motion.release();
  press = null; cv.style.cursor = "grab";
  dismissHint(); wake();
};
cv.addEventListener("pointerup", endPress);
cv.addEventListener("pointercancel", () => { if (press && press.dragging) motion.release(); press = null; wake(); });
function dismissHint() { $("hint").classList.add("gone"); }

/* ---------- controles ---------- */
const FORMAT = {
  H: v => fmtNum(v) + " m", W: v => fmtNum(v) + " m", tr: v => Math.round(v * 100) + " %",
  dens: v => "× " + fmtNum(v, 2), jag: v => fmtNum(v, 2), huecos: v => fmtNum(v, 2), real: v => Math.round(v * 100) + " %",
  sombra: v => fmtNum(v, 2), cs: v => "× " + fmtNum(v, 2), ramas: v => String(v), tallos: v => String(v),
  sdir: v => v + "° " + ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"][Math.round(v / 45) % 8], salt: v => v + "°", sdist: v => fmtNum(v) + " m",
  rg: v => "× " + fmtNum(v, 2), rp: v => "× " + fmtNum(v, 2),
  simp: v => v > 0 ? Math.round(v * 100) + " %" : "Nada",
  potD: v => fmtNum(v, 2) + " m", potH: v => fmtNum(v, 2) + " m",
  gp: v => fmtNum(v, 2) + " mm", gc: v => fmtNum(v, 2) + " mm", gr: v => fmtNum(v, 2) + " mm", gd: v => fmtNum(v, 2) + " mm",
};

const inputs = [...document.querySelectorAll("[data-key]")];

function syncInputs() {
  for (const el of inputs) {
    const v = state.values[el.dataset.key];
    if (el.type === "checkbox") el.checked = !!v; else el.value = v;
  }
  for (const o of document.querySelectorAll("output[data-for]")) o.textContent = FORMAT[o.dataset.for](state.values[o.dataset.for]);
  for (const el of document.querySelectorAll("input[type=range][data-key]")) {
    const o = document.querySelector(`output[data-for="${el.dataset.key}"]`);
    if (o) el.setAttribute("aria-valuetext", o.textContent);
  }
  const revit = state.values.simp > 0;
  document.querySelectorAll("#destSeg button").forEach(b => b.setAttribute("aria-checked", String((+b.dataset.simp > 0) === revit)));
  $("b_dxf").textContent = revit ? "Descargar DXF para Revit" : "Descargar DXF para AutoCAD";
  const pot = !!state.values.maceta;
  $("potOn").setAttribute("aria-checked", String(pot));
  for (const id of ["potD", "potH"]) { $(id).disabled = !pot; $(id).closest(".range").classList.toggle("off", !pot); }
  document.querySelector('[data-key="potShape"]').disabled = !pot;
  $("gp").disabled = !state.values.perim;
  $("gp").closest(".range").classList.toggle("off", !state.values.perim);
  updateFicha();
}

function updateFicha() {
  const S = SPECIES[state.species], v = state.values;
  $("f_nombre").textContent = $("tipo").selectedOptions[0].textContent.replace(/\s*\(.*\)$/, "");
  const rot = state.values.isoRot || 0, isoShown = state.view === "iso" || state.view === "tres";
  $("isoRot").hidden = !isoShown;
  const what = S.mode === "roca" ? "de largo" : S.shape === "seto" ? "de largo" : S.mode === "hiedra" ? "de ancho" : "de copa";
  const grove = GROVE.has(state.species) && v.tallos > 1 ? `, ${v.tallos} ejemplares` : "";
  const pot = v.maceta ? `, en maceta ${v.potShape} de ${fmtNum(v.potD, 2)} × ${fmtNum(v.potH, 2)} m` : "";
  const view = {alzado: "Alzado", planta: "Planta", iso: "Isométrica", tres: "Las tres vistas"}[state.view];
  const rotTxt = (state.view === "iso" || state.view === "tres") && rot ? ` · giro ${rot}°` : "";
  $("f_medidas").textContent = `${view}${rotTxt} · ${fmtNum(v.H)} m de alto, ${fmtNum(v.W)} m ${what}${grove}${pot}`;
}

function applySpecies() {
  const S = SPECIES[state.species];
  Object.assign(state.values, speciesDefaults(state.species));
  $("s_hint").textContent = S.hint;
  $("r_hint").textContent = "Tipo: " + S.rtxt;
  const est = S.caduca ? state.values.estacion : "verano";
  document.querySelectorAll("#estSeg button").forEach(b => {
    b.disabled = !S.caduca;
    b.setAttribute("aria-checked", String(!!S.caduca && est === b.dataset.s));
  });
  $("estSeg").title = S.caduca ? "" : "Especie de hoja perenne: mantiene las hojas todo el año.";
  const sp = state.species, m = S.mode, masas = ["masas", "olivo", "cipres", "arbusto", "conifera"].includes(m);
  $("lbl_tallos").textContent = GROVE.has(sp) ? "Ejemplares (árboles)" : sp === "olivo" ? "Ramas madre" : sp === "multitallo" ? "Pies (troncos)" : "Tallos";
  const dis = {
    tronco: !(S.tr > 0), ramas: !(masas && S.tr > 0) && m !== "rosetas", tallos: !(masas || m === "multitallo" || m === "hiedra" || GROVE.has(sp)),
    dentado: !(masas || m === "multitallo" || m === "roca"), huecos: !(masas || m === "multitallo"),
    cs: m === "roca", real: !(masas || m === "multitallo"),
  };
  for (const [id, off] of Object.entries(dis)) { $(id).disabled = off; $(id).closest(".range").classList.toggle("off", off); }
  document.querySelector('[data-key="raices"]').disabled = m === "roca";
  syncInputs();
}

for (const el of inputs) {
  el.addEventListener("input", () => {
    const k = el.dataset.key;
    if (k === "maceta") { setPot(el.checked); return; }
    state.values[k] = el.type === "checkbox" ? el.checked : (el.tagName === "SELECT" && !("num" in el.dataset) ? el.value : +el.value);
    syncInputs();
    if (["gp", "gc", "gd", "gr", "perim"].includes(k)) { if (scene) { scene.p = params(); paint(); } return; }
    if (["escala", "tres", "dxfw"].includes(k)) return;
    requestDraw(el.type === "range" ? 90 : 0);
  });
}

// Destino del archivo: CAD conserva todo el perímetro; Revit lo simplifica (y se puede afinar con el deslizador).
document.querySelectorAll("#destSeg button").forEach(b => b.addEventListener("click", () => {
  state.values.simp = +b.dataset.simp;
  syncInputs(); requestDraw();
}));

function showSimplification(p, stats) {
  const all = Object.values(stats || {});
  const before = all.reduce((s, x) => s + x.before, 0), after = all.reduce((s, x) => s + x.after, 0);
  const n = v => v.toLocaleString("es-ES");
  $("simpInfo").textContent = p.simp > 0
    ? `Perímetro exterior: ${n(before)} → ${n(after)} vértices, con una tolerancia de ${fmtNum(Math.max(...all.map(x => x.tol)) * 100)} cm.`
    : `Perímetro exterior con todo el detalle: ${n(before)} vértices. Para Revit, simplifícalo.`;
}

// Maceta: al activarla, si la planta es demasiado grande para una maceta, se reduce a un tamaño de maceta.
function setPot(on) {
  state.values.maceta = on;
  if (on && state.values.H > 4) {
    // tamaño de planta de maceta y una maceta proporcionada a ella
    const k = 2.4 / state.values.H, v = state.values;
    v.H = 2.4; v.W = Math.max(0.3, Math.min(1.8, Math.round(v.W * k * 10) / 10));
    v.potD = Math.round(Math.min(1.2, Math.max(0.4, v.W * 0.45)) * 20) / 20;
    v.potH = Math.round(v.potD * 0.85 * 20) / 20;
  }
  syncInputs(); requestDraw();
}
$("potOn").addEventListener("click", () => setPot(!state.values.maceta));
$("b_potAjustes").addEventListener("click", () => { openDrawer(); const c = $("cardMaceta"); c.open = true; setTimeout(() => c.scrollIntoView({block: "start", behavior: reduceMotion.matches ? "auto" : "smooth"}), 250); });

$("tipo").addEventListener("change", e => { state.species = e.target.value; motion.leaves = []; applySpecies(); requestDraw(); });

document.querySelectorAll("#estSeg button").forEach(b => b.addEventListener("click", () => {
  if (b.disabled) return;
  state.values.estacion = b.dataset.s;
  document.querySelectorAll("#estSeg button").forEach(x => x.setAttribute("aria-checked", String(x === b)));
  requestDraw();
}));

const tabs = [...document.querySelectorAll(".tabs button")];
function markTab(b) { tabs.forEach(x => { x.setAttribute("aria-selected", String(x === b)); x.tabIndex = x === b ? 0 : -1; }); }
markTab(tabs.find(b => b.getAttribute("aria-selected") === "true") || tabs[0]);
tabs.forEach((b, i) => b.addEventListener("keydown", e => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const n = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[n].focus(); tabs[n].click();
}));
tabs.forEach(b => b.addEventListener("click", () => {
  const prev = state.view, next = b.dataset.v;
  if (prev === next) return;
  state.view = next;
  if (prev !== "tres" && next !== "tres") {
    const from = cameraFor(prev, state.values.isoRot), to = cameraFor(next, state.values.isoRot);
    // gira por el camino más corto
    const d = Math.atan2(Math.sin(to.az - from.az), Math.cos(to.az - from.az));
    startTransition(from, {az: from.az + d, el: to.el});
  }
  markTab(b);
  updateFicha();
  requestDraw();
}));

// Giro de la isométrica: cuatro vistas del mismo ejemplar, de 90° en 90°.
function rotateIso(step) {
  const old = state.values.isoRot || 0, next = (old + step + 360) % 360;
  state.values.isoRot = next;
  if (state.view === "iso") {
    const from = cameraFor("iso", old);
    startTransition(from, {az: from.az + step * Math.PI / 180, el: from.el});
  }
  updateFicha();
  requestDraw();
}
$("isoIzq").addEventListener("click", () => rotateIso(-90));
$("isoDer").addEventListener("click", () => rotateIso(90));

const setSeed = s => { state.seed = Math.max(1, Math.min(99999, Math.round(s) || 1)); $("semilla").value = state.seed; requestDraw(); };
$("semilla").addEventListener("change", e => setSeed(+e.target.value));
$("variante").addEventListener("click", () => setSeed(1 + Math.floor(Math.random() * 99998)));
document.addEventListener("keydown", e => {
  if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) $("variante").click();
  if (e.key === "Escape") { closeDrawer(); closeExport(); }
});

/* viento */
function setWind(on) {
  motion.wind.on = on;
  for (const el of document.querySelectorAll(".wind-opts")) el.hidden = !on;
  $("windOn").setAttribute("aria-checked", String(on));
  document.querySelector(".dock").classList.toggle("windy", on);
  if (on) wake();
}
$("windOn").addEventListener("click", () => setWind(!motion.wind.on));
document.querySelectorAll("#windMode button").forEach(b => b.addEventListener("click", () => {
  motion.wind.mode = b.dataset.m;
  document.querySelectorAll("#windMode button").forEach(x => x.setAttribute("aria-checked", String(x === b)));
  setWind(true);
}));
document.querySelectorAll("#windDir button").forEach(b => b.addEventListener("click", () => {
  motion.wind.dir = +b.dataset.d;
  document.querySelectorAll("#windDir button").forEach(x => x.setAttribute("aria-checked", String(x === b)));
  setWind(true);
}));

/* panel de ajustes */
function openDrawer() {
  $("ajustes").hidden = false;
  requestAnimationFrame(() => { $("ajustes").classList.add("open"); resize(); $("b_cerrar").focus({preventScroll: true}); });
  $("b_ajustes").setAttribute("aria-expanded", "true"); closeExport();
}
function closeDrawer() {
  const d = $("ajustes"); if (d.hidden) return;
  if (d.contains(document.activeElement)) $("b_ajustes").focus({preventScroll: true});
  d.classList.remove("open"); $("b_ajustes").setAttribute("aria-expanded", "false"); resize();
  setTimeout(() => { if (!d.classList.contains("open")) d.hidden = true; }, reduceMotion.matches ? 0 : 220);
}
$("b_ajustes").addEventListener("click", () => $("ajustes").hidden ? openDrawer() : closeDrawer());
$("b_cerrar").addEventListener("click", closeDrawer);

/* exportación */
function closeExport() { $("exportar").hidden = true; $("b_export").setAttribute("aria-expanded", "false"); }
$("b_export").addEventListener("click", e => {
  e.stopPropagation();
  const open = $("exportar").hidden;
  $("exportar").hidden = !open; $("b_export").setAttribute("aria-expanded", String(open));
  if (open) $("status").textContent = "";
});
// Cierra el menú al hacer clic fuera (el clic simulado del enlace de descarga no cuenta).
document.addEventListener("click", e => { if (e.isTrusted && !e.target.closest(".export-wrap")) closeExport(); });

async function download(format) {
  const p = params(), list = p.tres || state.view === "tres" ? ["alzado", "planta", "iso"] : [state.view];
  $("status").textContent = "Preparando el archivo…";
  try {
    const {text, filename} = await ask({type: "export", format, params: p, views: list});
    const blob = new Blob([text], {type: format === "dxf" ? "application/dxf" : "image/svg+xml"});
    const a = Object.assign(document.createElement("a"), {href: URL.createObjectURL(blob), download: filename});
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    $("status").textContent = "Descargado: " + filename;
  } catch (err) {
    $("status").textContent = "No se pudo generar el archivo: " + err.message;
  }
}
$("b_dxf").addEventListener("click", () => download("dxf"));
$("b_svg").addEventListener("click", () => download("svg"));

/* ---------- buzón de sugerencias ---------- */
const dlg = $("sugerencias"), sugStatus = $("sugStatus"), sugLink = $("b_sug_enviar");
// El mailto lo construye el propio navegador con el correo predeterminado del usuario.
function mailtoHref() {
  // Solo destinatario y asunto: el cuerpo sale vacío para que la persona escriba su sugerencia.
  return `mailto:${SUGGESTIONS.to}?subject=${encodeURIComponent(SUGGESTIONS.subject)}`;
}
$("b_sugerencias").addEventListener("click", () => { closeExport(); closeDrawer(); sugStatus.textContent = ""; sugLink.href = mailtoHref(); dlg.showModal(); sugLink.focus(); });
sugLink.addEventListener("click", () => { sugLink.href = mailtoHref(); sugStatus.textContent = "Si no se abre el correo, copia efedegam@gmail.com y escribe desde tu cuenta."; });
$("b_sug_cerrar").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });  // clic en el fondo

/* ---------- color de la página: verde, lila o beige ---------- */
const THEMES = ["verde", "lila", "beige"];
function setTheme(t, save = true) {
  if (!THEMES.includes(t)) t = "verde";
  if (t === "verde") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  document.querySelectorAll(".themes button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.theme === t)));
  if (save) try { localStorage.setItem("plantimania-tema", t); } catch {}
  colors = readColors(document.documentElement); paint();
  heroScene($("heroBack"), $("heroFront"));
  landing?.refresh();
}
document.querySelectorAll(".themes button").forEach(b => b.addEventListener("click", () => setTheme(b.dataset.theme)));

/* ---------- página de inicio ---------- */
// #generador abre la herramienta; cualquier otra dirección muestra la portada.
const landing = createLanding($("dotsBack"), $("dotsFront"));
// Tres páginas una debajo de otra: portada, «Qué es» y generador. Al ir hacia abajo la
// página actual sube y la nueva entra por abajo; al volver, al revés.
const PAGES = ["inicio", "sobre", "app"];
const pageEl = n => n === "app" ? document.querySelector(".app") : $(n);
let current = null;
function route() {
  const to = location.hash === "#generador" ? "app" : location.hash === "#sobre" ? "sobre" : "inicio";
  const from = current;
  if (from === to) return;
  current = to;
  pageEl("app").inert = to !== "app";
  document.documentElement.classList.toggle("in-app", to === "app");
  const show = (n, on) => { if (n !== "app") pageEl(n).hidden = !on; };
  if (to === "inicio") landing.start();
  if (to === "app") setTimeout(resize, 30);
  if (to === "sobre") $("sobre").scrollTop = 0;
  if (!from || reduceMotion.matches) {
    for (const n of ["inicio", "sobre"]) show(n, n === to);
    if (to !== "inicio") landing.stop();
    return;
  }
  show(to, true);
  const dir = PAGES.indexOf(to) > PAGES.indexOf(from) ? 1 : -1;
  const opts = {duration: 1000, easing: "cubic-bezier(.65, 0, .25, 1)"};
  const out = pageEl(from).animate([{transform: "translateY(0)"}, {transform: `translateY(${-100 * dir}%)`}], {...opts, fill: "forwards"});
  pageEl(to).animate([{transform: `translateY(${100 * dir}%)`}, {transform: "translateY(0)"}], opts);
  out.onfinish = () => { if (current !== from) show(from, false); out.cancel(); if (from === "inicio" && current !== "inicio") landing.stop(); };
}
addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) landing.stop();
  else if (current === "inicio" && !reduceMotion.matches) landing.start();
});

/* ---------- arranque ---------- */
new ResizeObserver(resize).observe($("stage"));
const paintHero = () => heroScene($("heroBack"), $("heroFront"));
let heroTimer = 0;
new ResizeObserver(() => { clearTimeout(heroTimer); heroTimer = setTimeout(paintHero, 200); }).observe(document.querySelector(".hero"));
document.fonts?.ready.then(() => { colors = readColors(document.documentElement); paint(); });
$("tipo").value = state.species;
$("semilla").value = state.seed;
applySpecies();
requestDraw();
{ let t = "verde"; try { t = localStorage.getItem("plantimania-tema") || t; } catch {} setTheme(t, false); }
route();
initLiquidGlass(".start, .tabs button, .glass, .sheet, .meta, .card");
