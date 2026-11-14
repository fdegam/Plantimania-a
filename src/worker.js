// Worker de dibujo: genera el modelo y las vistas fuera del hilo principal,
// así la interfaz y la animación no se congelan mientras se calcula.
import {gen, seasonModel} from "./engine/model.js";
import {drawView} from "./engine/draw.js";
import {makeDXF, makeSVG, blockName} from "./engine/export.js";
import {simplifyView} from "./engine/simplify.js";

const LAYER_CODES = ["VEG_PERIMETRO", "VEG_CONTORNO", "VEG_DETALLE", "VEG_RAICES"];

// Lo que cambia el modelo 3D; los grosores y la escala no obligan a regenerarlo.
const IGNORED = ["gp", "gc", "gd", "gr", "escala", "perim", "dxfw", "tres", "simp", "isoRot"];
const keyOf = p => JSON.stringify(Object.assign({}, p, Object.fromEntries(IGNORED.map(k => [k, 0]))));

let cacheKey = null, model = null, views = {}, simple = {};

// Vistas completas (cacheadas) y, encima, la versión con el perímetro simplificado.
// Mover el control de simplificación no obliga a redibujar la planta.
function ensure(p, list) {
  const key = keyOf(p);
  if (key !== cacheKey) { cacheKey = key; model = gen(p); views = {}; simple = {}; }
  const out = {}, stats = {};
  for (const v of list) {
    // la isométrica se guarda por giro: cambiar de giro no regenera la planta
    const vk = v === "iso" ? "iso@" + (p.isoRot || 0) : v;
    if (!views[vk]) views[vk] = drawView(model, p, v);
    const k = vk + ":" + (p.simp || 0);
    if (!simple[k]) simple[k] = simplifyView(views[vk], p.simp || 0);
    out[v] = simple[k].view; stats[v] = simple[k].stats;
  }
  return {views: out, stats};
}

// Esqueleto 3D ligero de la planta (masas, ramas, ramillas, hojas y rocas) para
// animar el cambio de vista girando la cámara mientras se calcula el dibujo final.
let skeletonKey = null, skeleton = null;
function buildSkeleton(p) {
  const key = cacheKey + "|" + p.estacion;
  if (key === skeletonKey) return skeleton;
  const m = seasonModel(model, p);
  const clumps = new Float32Array(m.clumps.length * 5);
  m.clumps.forEach((c, i) => clumps.set([c.x, c.y, c.z, c.r, c.sy], i * 5));
  const lines = [], widths = [];
  const every = (pts, k) => pts.filter((_, i) => i % k === 0 || i === pts.length - 1);
  for (const L of m.limbs) { lines.push(every(L.pts, 2)); widths.push(L.w0, L.w1); }
  const twigs = (m.twigs || []).map(t => every(t, 2));
  const leafStride = Math.max(1, Math.ceil((m.leaves || []).length / 1400));
  const leaves = (m.leaves || []).filter((_, i) => i % leafStride === 0).map(l => every(l.outline, Math.max(1, Math.floor(l.outline.length / 8))));
  const rockTris = [];
  for (const rk of m.rocks || []) for (const f of rk.faces) rockTris.push(f.v.map(k => rk.P[k]));
  const flat = rings => {
    let n = 0; for (const r of rings) n += r.length;
    const xyz = new Float32Array(n * 3), start = new Uint32Array(rings.length + 1);
    let k = 0;
    rings.forEach((r, i) => { start[i] = k; for (const q of r) { xyz.set(q, k * 3); k++; } });
    start[rings.length] = k;
    return {xyz, start};
  };
  skeletonKey = key;
  skeleton = {clumps, limbs: {...flat(lines), w: Float32Array.from(widths)}, twigs: flat(twigs), leaves: flat(leaves), rocks: flat(rockTris), H: m.H, W: m.W};
  return skeleton;
}

// Empaqueta polilíneas en arrays planos transferibles.
function packRings(rings) {
  let n = 0; for (const r of rings) n += r.length;
  const xy = new Float32Array(n * 2), start = new Uint32Array(rings.length + 1);
  let k = 0;
  rings.forEach((r, i) => { start[i] = k; for (const q of r) { xy[2 * k] = q[0]; xy[2 * k + 1] = q[1]; k++; } });
  start[rings.length] = k;
  return {xy, start};
}

// Un grupo de líneas, rellenos y sombras ya empaquetado.
function packGroup(lines, white, shadow) {
  const L = packRings(lines.map(l => l.pts));
  const layer = Uint8Array.from(lines.map(l => Math.max(0, LAYER_CODES.indexOf(l.layer))));
  const W = packRings(white.flatMap(w => [w.outer, ...w.holes]));
  const S = packRings(shadow);
  return {
    group: {lines: {...L, layer}, white: W, shadow: S},
    transfer: [L.xy.buffer, L.start.buffer, layer.buffer, W.xy.buffer, W.start.buffer, S.xy.buffer, S.start.buffer],
  };
}

// La planta (que se mueve con el viento) y la hojarasca del suelo (quieta) van por separado.
function pack(v) {
  const isLitter = x => !!x.litter;
  const live = packGroup(v.lines.filter(l => !isLitter(l)), v.white.filter(w => !isLitter(w)), v.shadow.filter(s => !isLitter(s)));
  const still = packGroup(v.lines.filter(isLitter), v.white.filter(isLitter), v.shadow.filter(isLitter));
  const crown = packRings(v.lines.filter(l => l.layer === "VEG_PERIMETRO" && l.outer).map(l => l.pts));
  return {
    bb: v.bb, ...live.group, still: still.group, crown,
    count: v.lines.length,
    transfer: [...live.transfer, ...still.transfer, crown.xy.buffer, crown.start.buffer],
  };
}

self.onmessage = e => {
  const {type, id, params, views: list} = e.data;
  try {
    const {views: ready, stats} = ensure(params, list);
    if (type === "draw") {
      const out = {}, transfer = [];
      for (const v of list) { const pk = pack(ready[v]); transfer.push(...pk.transfer); delete pk.transfer; out[v] = pk; }
      const name = blockName(params, list.length > 1 ? "3V" : list[0]);
      self.postMessage({type, id, views: out, name, stats, skeleton: buildSkeleton(params)}, transfer);
    } else if (type === "export") {
      const name = blockName(params, list.length > 1 ? "3V" : list[0]);
      const text = e.data.format === "dxf" ? makeDXF(params, list, ready) : makeSVG(params, list, ready);
      const tag = params.simp > 0 ? "_SIMPL" : "";
      const filename = e.data.format === "dxf" ? name + tag + ".dxf" : name + tag + "_1-" + params.escala + ".svg";
      self.postMessage({type, id, text, filename});
    }
  } catch (err) {
    self.postMessage({type: "error", id, message: String(err && err.message || err)});
  }
};
