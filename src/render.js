// Dibujo en canvas de la escena: vistas deformadas por el movimiento, hojas, escala y cota.

// Mismo orden que LAYER_CODES en worker.js.
const PERIMETRO = 0, CONTORNO = 1, DETALLE = 2, RAICES = 3;

export function readColors(el) {
  const cs = getComputedStyle(el);
  const v = n => cs.getPropertyValue(n).trim();
  return {ink: v("--draw-ink"), fill: v("--draw-fill"), shadow: v("--draw-shadow"), muted: v("--muted"), stamp: v("--stamp"), paper: v("--draw-fill"), ui: v("--ink")};
}

// Coloca las vistas en fila, alineadas por abajo (unidades del mundo).
export function layoutScene(views, order) {
  let x = 0, bb = [Infinity, Infinity, -Infinity, -Infinity];
  const gap = Math.max(1, ...order.map(v => (views[v].bb[2] - views[v].bb[0]) * 0.25));
  const items = order.map(v => {
    const b = views[v].bb, it = {v, dx: x - b[0], dy: -b[1]};
    bb = [Math.min(bb[0], b[0] + it.dx), Math.min(bb[1], b[1] + it.dy), Math.max(bb[2], b[2] + it.dx), Math.max(bb[3], b[3] + it.dy)];
    x += b[2] - b[0] + gap;
    return it;
  });
  return {items, bb};
}

// Encaje en pantalla con margen para que la planta pueda moverse sin cortarse.
export function fit(layout, W, H, inset) {
  const {bb} = layout;
  const padX = Math.max(40, W * 0.07), padTop = Math.max(100, H * 0.13), padBottom = inset.bottom + 46;
  const rightRoom = 64 + (inset.right || 0);
  const aw = W - padX * 2 - rightRoom, ah = H - padTop - padBottom;
  const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
  const sc = Math.max(1e-3, Math.min(aw / bw, ah / bh));
  const ox = padX + (aw - bw * sc) / 2 - bb[0] * sc;
  const oy = padTop + ah - (ah - bh * sc) / 2 + bb[1] * sc;
  return {sc, ox, oy};
}

// Pantalla → coordenadas locales (metros) de la vista bajo el puntero.
export function pick(scene, sx, sy) {
  const {sc, ox, oy} = scene.fitted;
  const wx = (sx - ox) / sc, wy = (oy - sy) / sc;
  for (const it of scene.layout.items) {
    const b = scene.views[it.v].bb, x = wx - it.dx, y = wy - it.dy;
    const m = Math.max(b[2] - b[0], b[3] - b[1]) * 0.06;
    if (x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m) return {v: it.v, x, y};
  }
  return null;
}

const tmp = [0, 0];

export function drawScene(ctx, scene, motion, colors, opts) {
  const {views, layout, p} = scene;
  const {sc, ox, oy} = scene.fitted;
  const moving = motion.active();
  const pxmm = Math.max(0.6, Math.min(2.4, sc * 0.012));
  const width = code => {
    const w = code === RAICES ? p.gr : code === PERIMETRO ? (p.perim ? p.gp : p.gc) : code === CONTORNO ? p.gc : p.gd;
    return w / 0.35 * 2 * pxmm;
  };

  ctx.lineCap = "round"; ctx.lineJoin = "round";

  for (const it of layout.items) {
    const V = views[it.v], f = motion.frames[it.v];
    // La planta se deforma con el movimiento; la hojarasca del suelo se queda quieta.
    const toScreen = live => (x, y) => {
      if (live && moving && f) { motion.displace(f, x, y, tmp); x += tmp[0]; y += tmp[1]; }
      return [ox + (x + it.dx) * sc, oy - (y + it.dy) * sc];
    };
    const ringsPath = (rings, closed, X, path = new Path2D()) => {
      const {xy, start} = rings;
      for (let r = 0; r < start.length - 1; r++) {
        for (let i = start[r]; i < start[r + 1]; i++) {
          const q = X(xy[2 * i], xy[2 * i + 1]);
          i === start[r] ? path.moveTo(q[0], q[1]) : path.lineTo(q[0], q[1]);
        }
        if (closed) path.closePath();
      }
      return path;
    };
    const groups = [[V.still, toScreen(false)], [V, toScreen(true)]].filter(([g]) => g);

    const shade = new Path2D(), white = new Path2D();
    for (const [g, X] of groups) { ringsPath(g.shadow, true, X, shade); ringsPath(g.white, true, X, white); }
    ctx.fillStyle = colors.shadow; ctx.fill(shade, "nonzero");
    ctx.fillStyle = colors.fill; ctx.fill(white, "evenodd");

    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (const [g, X] of groups) {
      const {xy, start, layer} = g.lines;
      for (let r = 0; r < start.length - 1; r++) {
        const path = paths[layer[r]];
        for (let i = start[r]; i < start[r + 1]; i++) {
          const q = X(xy[2 * i], xy[2 * i + 1]);
          i === start[r] ? path.moveTo(q[0], q[1]) : path.lineTo(q[0], q[1]);
        }
      }
    }
    ctx.strokeStyle = colors.ink;
    for (const code of [RAICES, DETALLE, CONTORNO, PERIMETRO]) { ctx.lineWidth = width(code); ctx.stroke(paths[code]); }

    // Hojas que caen
    for (const l of motion.leaves) {
      if (l.view !== it.v) continue;
      const alpha = l.landed ? Math.max(0, 1 - Math.max(0, l.age - 3.5) / 2.5) : 1;
      if (alpha <= 0) continue;
      const cx = ox + (l.x + it.dx) * sc, cy = oy - (l.y + it.dy) * sc, s = Math.max(5, l.size * sc);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.rotate(l.landed ? l.rot * 0.15 : l.rot);
      ctx.scale(1, l.landed ? 0.45 : 0.55 + 0.45 * Math.abs(Math.cos(l.age * 4 + l.ph)));
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(-s * 0.1, -s * 0.55, s, 0);
      ctx.quadraticCurveTo(-s * 0.1, s * 0.55, -s, 0);
      ctx.fillStyle = colors.paper; ctx.fill();
      ctx.lineWidth = Math.max(0.8, pxmm * 0.9); ctx.strokeStyle = colors.ink; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.85, 0); ctx.lineTo(s * 0.7, 0); ctx.lineWidth = Math.max(0.5, pxmm * 0.5); ctx.stroke();
      ctx.restore();
    }
  }

  if (layout.items.length > 1) {
    ctx.save();
    ctx.fillStyle = colors.stamp; ctx.textAlign = "center";
    ctx.font = "600 11px Manrope, system-ui, sans-serif";
    for (const it of layout.items) {
      const b = views[it.v].bb;
      ctx.fillText({alzado: "ALZADO", planta: "PLANTA", iso: "ISOMÉTRICA"}[it.v], ox + ((b[0] + b[2]) / 2 + it.dx) * sc, oy - (b[1] + it.dy) * sc + 24);
    }
    ctx.restore();
  }
  drawScaleBar(ctx, sc, opts, colors);
  if (layout.items.length === 1 && layout.items[0].v === "alzado") drawHeight(ctx, scene, colors);
}

function drawScaleBar(ctx, sc, opts, colors) {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10];
  const step = steps.find(s => s * sc >= 36) || 10;
  const n = 4, x0 = opts.scaleX, y0 = opts.scaleY;
  ctx.save();
  ctx.fillStyle = colors.ui; ctx.strokeStyle = colors.ui; ctx.lineWidth = 1;
  for (let i = 0; i < n; i += 2) ctx.fillRect(x0 + i * step * sc, y0 - 4, step * sc, 4);
  ctx.strokeRect(x0 + 0.5, y0 - 4.5, n * step * sc, 4);
  ctx.font = "500 11px Manrope, system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.fillStyle = colors.ui;
  for (let i = 0; i <= n; i++) {
    const v = Math.round(i * step * 100) / 100;
    ctx.fillText(v.toLocaleString("es-ES") + (i === n ? " m" : ""), x0 + i * step * sc, y0 + 14);
  }
  ctx.restore();
}

function drawHeight(ctx, scene, colors) {
  const {sc, ox, oy} = scene.fitted, it = scene.layout.items[0], b = scene.views.alzado.bb;
  const x = ox + (b[2] + it.dx) * sc + 26, y0 = oy - (0 + it.dy) * sc, y1 = oy - (b[3] + it.dy) * sc;
  ctx.save();
  ctx.strokeStyle = colors.stamp; ctx.fillStyle = colors.stamp; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y0); ctx.lineTo(x, y1);
  for (const y of [y0, y1]) { ctx.moveTo(x - 5, y + 5); ctx.lineTo(x + 5, y - 5); }
  ctx.stroke();
  ctx.translate(x + 14, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2);
  ctx.font = "500 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(b[3].toLocaleString("es-ES", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " m", 0, 0);
  ctx.restore();
}

/* ---------- transición 3D entre vistas ---------- */
// Cámara de cada vista: acimut (giro alrededor del eje vertical) y elevación.
// Coincide con proj() del motor: alzado (0°, 0°), planta (0°, 90°) e isométrica (45° + giro, 35,26°).
const ISO_EL = Math.asin(Math.tan(Math.PI / 6));
export function cameraFor(view, isoRot = 0) {
  if (view === "planta") return {az: 0, el: Math.PI / 2};
  if (view === "iso") return {az: (45 + isoRot) * Math.PI / 180, el: ISO_EL};
  return {az: 0, el: 0};
}

function projector(cam) {
  const ca = Math.cos(cam.az), sa = Math.sin(cam.az), ce = Math.cos(cam.el), se = Math.sin(cam.el);
  // devuelve [x pantalla, y pantalla, profundidad] en metros (mayor profundidad = más cerca)
  return (x, y, z) => { const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; return [x1, y * ce - z1 * se, z1 * ce + y * se]; };
}

// Caja del esqueleto vista con una cámara (para encajarlo en pantalla).
export function skeletonBounds(skel, cam) {
  const P = projector(cam), bb = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x, y, r = 0) => { bb[0] = Math.min(bb[0], x - r); bb[1] = Math.min(bb[1], y - r); bb[2] = Math.max(bb[2], x + r); bb[3] = Math.max(bb[3], y + r); };
  const c = skel.clumps;
  for (let i = 0; i < c.length; i += 5) { const q = P(c[i], c[i + 1], c[i + 2]); add(q[0], q[1], c[i + 3]); }
  for (const g of [skel.limbs, skel.leaves, skel.rocks]) for (let i = 0; i < g.xyz.length; i += 3) { const q = P(g.xyz[i], g.xyz[i + 1], g.xyz[i + 2]); add(q[0], q[1]); }
  return bb;
}

// Dibuja el esqueleto con una cámara intermedia. tf = {sc, X0, Y0}: escala y posición en
// pantalla del origen (pie de la planta).
export function drawSkeleton(ctx, skel, cam, tf, colors) {
  const P = projector(cam), {sc, X0, Y0} = tf, ce = Math.cos(cam.el), se = Math.sin(cam.el);
  const S = (q) => [X0 + q[0] * sc, Y0 - q[1] * sc];
  const items = [];
  const c = skel.clumps;
  for (let i = 0; i < c.length; i += 5) {
    const q = P(c[i], c[i + 1], c[i + 2]), r = c[i + 3], ry = r * Math.sqrt((c[i + 4] * ce) ** 2 + se * se);
    items.push({d: q[2], k: 0, q, r, ry});
  }
  const ring = (g, i, k, extra) => {
    const pts = [];
    let d = 0;
    for (let j = g.start[i]; j < g.start[i + 1]; j++) { const q = P(g.xyz[3 * j], g.xyz[3 * j + 1], g.xyz[3 * j + 2]); pts.push(q); d += q[2]; }
    if (pts.length > 1) items.push({d: d / pts.length, k, pts, ...extra});
  };
  for (let i = 0; i < skel.limbs.start.length - 1; i++) ring(skel.limbs, i, 1, {w: (skel.limbs.w[2 * i] + skel.limbs.w[2 * i + 1]) / 2});
  for (let i = 0; i < skel.twigs.start.length - 1; i++) ring(skel.twigs, i, 2);
  for (let i = 0; i < skel.leaves.start.length - 1; i++) ring(skel.leaves, i, 3);
  for (let i = 0; i < skel.rocks.start.length - 1; i++) ring(skel.rocks, i, 4);
  items.sort((a, b) => a.d - b.d);          // de lejos a cerca
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const ink = colors.ink, fill = colors.fill, thin = Math.max(0.7, Math.min(1.6, sc * 0.006));
  const path = it => { ctx.beginPath(); it.pts.forEach((q, j) => { const [x, y] = S(q); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
  // 1) ramas y ramillas, detrás de la copa
  for (const it of items) {
    if (it.k === 1) {
      path(it); const w = Math.max(1, it.w * 2 * sc);
      ctx.strokeStyle = ink; ctx.lineWidth = w + thin * 2.4; ctx.stroke();
      ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.stroke();
    } else if (it.k === 2) { path(it); ctx.strokeStyle = ink; ctx.lineWidth = thin; ctx.stroke(); }
  }
  // 2) la copa como una sola silueta: contorno de tinta por fuera y relleno dentro,
  //    igual que el perímetro del dibujo final
  const masses = items.filter(it => it.k === 0);
  if (masses.length) {
    const blob = grow => { const P2 = new Path2D(); for (const it of masses) { const [x, y] = S(it.q); P2.ellipse(x, y, it.r * sc + grow, it.ry * sc + grow, 0, 0, Math.PI * 2); } return P2; };
    ctx.fillStyle = ink; ctx.fill(blob(thin * 1.8), "nonzero");
    ctx.fillStyle = fill; ctx.fill(blob(0), "nonzero");
  }
  // 3) hojas sueltas y rocas, de lejos a cerca
  for (const it of items) {
    if (it.k < 3) continue;
    path(it); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = thin; ctx.stroke();
  }
  ctx.restore();
}

// Barra de escala sola (para los fotogramas de la transición).
export function drawScale(ctx, sc, opts, colors) { drawScaleBar(ctx, sc, opts, colors); }
