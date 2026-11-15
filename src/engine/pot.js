// Maceta: tronco de cono (redonda) o de pirámide con esquinas suaves (cuadrada), con borde.
//
// Coordenadas del modelo: la tierra de la maceta está en y = 0, que es donde nace la planta.
// Al dibujar, todo se eleva POT_LIFT (ver draw.js) para que el pie de la maceta quede en el suelo.
import {mulberry, U} from "./random.js";

export const potLift = p => (p.maceta ? p.potH * 0.93 : 0);

// Medidas de la maceta en coordenadas del modelo.
export function potGeometry(p) {
  const H = p.potH, L = potLift(p), R = p.potD / 2;
  return {
    shape: p.potShape === "cuadrada" ? "cuadrada" : "redonda",
    R, L,
    yTop: H - L,               // canto superior del borde
    yRim: H - L - H * 0.14,    // canto inferior del borde
    yBot: -L,                  // pie, en el suelo
    rBody: R * 0.93,           // cuerpo bajo el borde
    rBot: R * 0.72,            // pie (más estrecho)
    rIn: R * 0.86,             // boca
  };
}

// Anillo horizontal de la maceta (64 puntos). La cuadrada es una superelipse: lados rectos y esquinas suaves.
export function potRing(shape, r, y, n = 64) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n;
    let c = Math.cos(a), s = Math.sin(a);
    if (shape === "cuadrada") { c = Math.sign(c) * Math.pow(Math.abs(c), 0.18); s = Math.sign(s) * Math.pow(Math.abs(s), 0.18); }
    pts.push([c * r, y, s * r]);
  }
  return pts;
}

// Envolvente convexa (cadena monótona) de puntos 2D.
export function hull(P) {
  const pts = P.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Piezas de la maceta para una vista: cuerpo y borde (con su línea inferior y la boca),
// y unos granitos de tierra en planta e isométrica. proj es la proyección del motor.
export function potItems(p, v, proj, layers) {
  const G = potGeometry(p), {C, D} = layers;
  const P = pts => pts.map(q => proj(v, q));
  const maxD = arr => arr.reduce((m, o) => Math.max(m, o.d), -Infinity);
  const closed = pts => pts.concat([pts[0].slice()]);

  const bodyP = P(potRing(G.shape, G.rBody, G.yRim).concat(potRing(G.shape, G.rBot, G.yBot)));
  const body = hull(bodyP.map(o => o.s));
  const items = [{d: maxD(bodyP), lines: [{pts: closed(body), layer: C}], poly: body, pot: true}];

  const rimTop = P(potRing(G.shape, G.R, G.yTop)), rimBot = P(potRing(G.shape, G.R, G.yRim));
  const rim = hull(rimTop.concat(rimBot).map(o => o.s));
  const lines = [{pts: closed(rim), layer: C}];
  // canto inferior del borde: solo la mitad que mira al observador
  const cd = proj(v, [0, G.yRim, 0]).d;
  let run = [];
  const flush = () => { if (run.length > 1) lines.push({pts: run, layer: C}); run = []; };
  for (const o of rimBot.concat([rimBot[0]])) { if (o.d >= cd - 1e-9) run.push(o.s); else flush(); }
  flush();
  if (v !== "alzado") {
    lines.push({pts: closed(P(potRing(G.shape, G.rIn, G.yTop)).map(o => o.s)), layer: C});
    // tierra: granitos dentro de la boca
    const R = mulberry(p.seed * 17 + 3), n = Math.round(14 + G.R * 40);
    for (let k = 0; k < n; k++) {
      const a = R() * 6.283, r = G.rIn * 0.85 * Math.sqrt(R()), s = G.R * U(R, 0.015, 0.03);
      const c = [Math.cos(a) * r, 0, Math.sin(a) * r];
      if (G.shape === "cuadrada") { c[0] = U(R, -1, 1) * G.rIn * 0.85; c[2] = U(R, -1, 1) * G.rIn * 0.85; }
      const q = [];
      for (let j = 0; j <= 6; j++) { const b = j / 6 * 6.283; q.push(proj(v, [c[0] + Math.cos(b) * s, 0, c[2] + Math.sin(b) * s]).s); }
      lines.push({pts: q, layer: D});
    }
  }
  items.push({d: maxD(rimTop.concat(rimBot)) + 1e-6, lines, poly: rim, pot: true});

  let top = -Infinity;
  for (const q of rim) top = Math.max(top, q[1]);
  return {items, top, R: G.R};
}

// Polígonos de la maceta en 3D (para la sombra proyectada).
export function potSolids(p) {
  const G = potGeometry(p);
  return [
    potRing(G.shape, G.rBody, G.yRim, 32).concat(potRing(G.shape, G.rBot, G.yBot, 32)),
    potRing(G.shape, G.R, G.yTop, 32).concat(potRing(G.shape, G.R, G.yRim, 32)),
  ];
}
