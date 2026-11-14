// Movimiento de la planta: viento, arrastre de ramas y hojas que caen.
// Todo se aplica como una deformación 2D del dibujo ya calculado, en metros,
// anclada al pie de la planta (el tronco no se mueve en la base).

const WIND = {
  brisa: {amp: 0.016, flutter: 0.22, speed: 4.2, leaves: 0},
  temporal: {amp: 0.05, flutter: 0.34, speed: 6.4, leaves: 1.6},
};

export class Motion {
  constructor() {
    this.t = 0;
    this.wind = {on: false, mode: "brisa", dir: 1};
    this.drag = null;
    this.leaves = [];
    this.leafRate = 0;      // hojas por sacudida según especie y estación
    this.stiff = 1;         // las rocas apenas se mueven
    this.frames = {};       // marco de referencia de cada vista
    this.windAccum = 0;
  }

  // Marco de cada vista: altura, radio y tipo de anclaje.
  setFrame(view, bb) {
    const top = Math.max(0.05, bb[3]);
    const radius = Math.max(Math.abs(bb[0]), Math.abs(bb[2]), Math.abs(bb[1]), Math.abs(bb[3]), 0.05);
    const size = Math.max(bb[2] - bb[0], bb[3] - bb[1], 0.1);
    this.frames[view] = {view, top, radius, size};
  }

  active() {
    return this.wind.on || this.drag !== null || this.leaves.length > 0;
  }

  // Peso de anclaje: 0 en el suelo o en el centro del tronco (planta), 1 en lo más alto o en el borde de la copa.
  weight(f, x, y) {
    if (f.view === "planta") return Math.min(1, Math.hypot(x, y) / f.radius);
    return Math.min(1, Math.max(0, y / f.top));
  }

  // Desplazamiento en metros de un punto (x, y) de la vista.
  displace(f, x, y, out) {
    let dx = 0, dy = 0;
    const w = this.weight(f, x, y);
    if (w <= 0) { out[0] = 0; out[1] = 0; return out; }
    const plan = f.view === "planta";
    const H = plan ? f.radius : f.top;

    if (this.wind.on) {
      const W = WIND[this.wind.mode], t = this.t;
      const gust = 0.7 + 0.3 * Math.sin(0.8 * t) + 0.12 * Math.sin(2.1 * t + 1.3);
      const bend = this.wind.dir * W.amp * H * gust * Math.pow(w, plan ? 1.1 : 1.6) * this.stiff;
      const ph = (x * 1.7 + y * 1.3) / H * 9;
      const fl = W.amp * W.flutter * H * Math.sin(W.speed * t + ph) * Math.pow(w, 1.2) * this.stiff;
      dx += bend + fl;
      dy += plan ? fl * 0.6 * Math.cos(ph) : -Math.abs(bend) * 0.12 * w;
    }


    const dr = this.drag;
    if (dr) {
      const ddx = x - dr.x, ddy = y - dr.y;
      const g = Math.exp(-(ddx * ddx + ddy * ddy) / (dr.sigma * dr.sigma));
      const k = g * w / dr.w0;
      dx += dr.D[0] * k; dy += dr.D[1] * k;
    }
    out[0] = dx; out[1] = dy;
    return out;
  }

  grab(view, x, y) {
    const f = this.frames[view]; if (!f) return false;
    const w0 = Math.max(0.2, this.weight(f, x, y));
    this.drag = {view, x, y, px: x, py: y, sigma: f.size * 0.33, w0, D: [0, 0], V: [0, 0], holding: true, limit: f.size * 0.16 * this.stiff};
    return true;
  }

  pull(x, y) { if (this.drag) { this.drag.px = x; this.drag.py = y; } }
  release() { if (this.drag) this.drag.holding = false; }

  // Puntos de la copa (perímetros cerrados) para que las hojas salgan de dentro.
  setCrown(view, rings) { this.frames[view] && (this.frames[view].crown = rings); }

  spawnLeaves(view, x, y, n) {
    const f = this.frames[view]; if (!f || !f.crown || n <= 0) return;
    const H = f.top, r = f.size * 0.35;
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (py < H * 0.2 || !inside(f.crown, px, py)) continue;
        this.leaves.push(newLeaf(view, px, py, H));
        break;
      }
    }
    if (this.leaves.length > 160) this.leaves.splice(0, this.leaves.length - 160);
  }

  step(dt) {
    dt = Math.min(dt, 1 / 20);
    this.t += dt;


    const dr = this.drag;
    if (dr) {
      if (dr.holding) {
        let tx = dr.px - dr.x, ty = dr.py - dr.y;
        const L = Math.hypot(tx, ty);
        if (L > dr.limit) { tx *= dr.limit / L; ty *= dr.limit / L; }
        const k = 1 - Math.exp(-dt * 18);
        dr.D[0] += (tx - dr.D[0]) * k; dr.D[1] += (ty - dr.D[1]) * k;
        dr.V[0] = 0; dr.V[1] = 0;
      } else {
        for (let i = 0; i < 2; i++) {
          dr.V[i] += (-140 * dr.D[i] - 4.2 * dr.V[i]) * dt;
          dr.D[i] += dr.V[i] * dt;
        }
        if (Math.hypot(...dr.D) < 1e-4 && Math.hypot(...dr.V) < 1e-3) this.drag = null;
      }
    }

    // Con temporal se escapan hojas de la copa.
    const W = this.wind.on ? WIND[this.wind.mode] : null;
    if (W && W.leaves && this.leafRate > 0) {
      this.windAccum += dt * W.leaves * Math.min(1, this.leafRate / 6);
      for (const view in this.frames) {
        const f = this.frames[view];
        if (f.view === "planta" || this.windAccum < 1) continue;
        this.spawnLeaves(view, (Math.random() - 0.5) * f.size * 0.6, f.top * (0.45 + Math.random() * 0.45), 1);
      }
      if (this.windAccum >= 1) this.windAccum = 0;
    }

    const windX = W ? this.wind.dir * W.amp * 9 : 0;
    for (const l of this.leaves) {
      l.age += dt;
      if (!l.landed) {
        const fall = l.H * 0.085;
        l.x += (Math.sin(l.age * 2.6 + l.ph) * l.H * 0.03 + windX * l.H * 0.05) * dt;
        l.y -= fall * dt * (0.75 + 0.25 * Math.sin(l.age * 3.1 + l.ph));
        l.rot += l.vr * dt;
        if (l.y <= l.size * 0.3) { l.y = l.size * 0.3; l.landed = true; l.age = 0; }
      }
    }
    this.leaves = this.leaves.filter(l => !l.landed || l.age < 6);
  }
}

function newLeaf(view, x, y, H) {
  return {view, x, y, H, size: Math.max(0.05, H * 0.014), rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 5, ph: Math.random() * 6.28, age: 0, landed: false};
}

// Punto dentro de alguno de los anillos {xy, start}.
function inside(rings, x, y) {
  const {xy, start} = rings;
  for (let r = 0; r < start.length - 1; r++) {
    let c = false;
    for (let i = start[r], j = start[r + 1] - 1; i < start[r + 1]; j = i++) {
      const ax = xy[2 * i], ay = xy[2 * i + 1], bx = xy[2 * j], by = xy[2 * j + 1];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c;
    }
    if (c) return true;
  }
  return false;
}
