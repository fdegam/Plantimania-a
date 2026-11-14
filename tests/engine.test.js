import {describe, it, expect} from "vitest";
import {SPECIES} from "../src/engine/species.js";
import {gen} from "../src/engine/model.js";
import {drawView} from "../src/engine/draw.js";
import {makeDXF, makeSVG} from "../src/engine/export.js";
import {buildParams} from "../src/params.js";

const VIEWS = ["alzado", "planta", "iso"];

describe("motor de vegetación", () => {
  for (const id of Object.keys(SPECIES)) {
    it(`genera y exporta ${id}`, () => {
      const p = buildParams(id, {}, 128);
      const model = gen(p);
      const views = {};
      for (const v of VIEWS) {
        views[v] = drawView(model, p, v);
        expect(views[v].lines.length).toBeGreaterThan(0);
        expect(views[v].bb.every(Number.isFinite)).toBe(true);
      }
      const dxf = makeDXF(p, VIEWS, views);
      expect(dxf.startsWith("0\nSECTION")).toBe(true);
      expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
      expect(dxf).not.toMatch(/NaN|undefined/);
      const svg = makeSVG(p, VIEWS, views);
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/NaN|undefined/);
    });
  }

  it("es determinista con la misma semilla", () => {
    const p = buildParams("olivo", {}, 42);
    const a = drawView(gen(p), p, "alzado").lines.length;
    const b = drawView(gen(p), p, "alzado").lines.length;
    expect(a).toBe(b);
  });

  it("forma una arboleda con varios ejemplares", () => {
    const uno = buildParams("platano", {tallos: 1}, 5), tres = buildParams("platano", {tallos: 3}, 5);
    const a = drawView(gen(uno), uno, "planta").bb, b = drawView(gen(tres), tres, "planta").bb;
    expect(b[2] - b[0]).toBeGreaterThan((a[2] - a[0]) * 1.4);
  });

  it("deja caer las hojas en otoño en especies caducas", () => {
    const p = buildParams("platano", {estacion: "otono"}, 7);
    const verano = buildParams("platano", {estacion: "verano"}, 7);
    expect(gen(p).clumps.length).toBe(gen(verano).clumps.length);
    expect(drawView(gen(p), p, "alzado").lines.length).toBeGreaterThan(0);
  });
});

describe("otoño en planta e isométrica e hiedra", () => {
  it("las caducas dejan hojarasca con perímetro cerrado, relleno y sombra", () => {
    for (const v of ["planta", "iso"]) {
      const p = buildParams("platano", {estacion: "otono", sombraP: true, relleno: true}, 7);
      const V = drawView(gen(p), p, v);
      const leaves = V.lines.filter(l => l.litter && l.closed);
      expect(leaves.length).toBeGreaterThan(10);
      for (const l of leaves) expect(l.pts[0]).toEqual(l.pts[l.pts.length - 1]);
      expect(V.white.filter(w => w.litter).length).toBe(leaves.length);
      expect(V.shadow.filter(s => s.litter).length).toBe(leaves.length);
    }
  });

  it("sin relleno ni sombra, las hojas solo llevan su contorno", () => {
    const p = buildParams("redonda", {estacion: "otono", sombraP: false, relleno: false}, 7);
    const V = drawView(gen(p), p, "planta");
    expect(V.lines.some(l => l.litter)).toBe(true);
    expect(V.white.length + V.shadow.length).toBe(0);
  });

  it("en verano y en alzado no hay hojarasca nueva", () => {
    const verano = buildParams("platano", {estacion: "verano"}, 7);
    expect(drawView(gen(verano), verano, "planta").lines.some(l => l.litter)).toBe(false);
    const otono = buildParams("platano", {estacion: "otono"}, 7);
    expect(drawView(gen(otono), otono, "alzado").lines.some(l => l.litter)).toBe(false);
  });

  it("la hiedra no se envuelve en un perímetro inventado", () => {
    const p = buildParams("hiedra", {}, 128);
    const V = drawView(gen(p), p, "alzado");
    // muchas siluetas reales de hojas y tallos, no una única envolvente
    expect(V.lines.filter(l => l.layer === "VEG_PERIMETRO").length).toBeGreaterThan(20);
  });
});

describe("estaciones y giro de la isométrica", () => {
  it("en verano las caducas son algo menos frondosas que en primavera", () => {
    const pri = buildParams("platano", {estacion: "primavera"}, 9), ver = buildParams("platano", {estacion: "verano"}, 9);
    const n = p => drawView(gen(p), p, "alzado").lines.length;
    expect(n(ver)).toBeLessThan(n(pri));
  });

  it("las perennes no cambian con la estación", () => {
    const pri = buildParams("olivo", {estacion: "primavera"}, 9), ver = buildParams("olivo", {estacion: "verano"}, 9);
    expect(drawView(gen(ver), ver, "alzado").lines.length).toBe(drawView(gen(pri), pri, "alzado").lines.length);
  });

  it("la isométrica se puede girar y el bloque lleva el giro en el nombre", async () => {
    const {blockName} = await import("../src/engine/export.js");
    const a = buildParams("olivo", {isoRot: 0}, 9), b = buildParams("olivo", {isoRot: 90}, 9);
    const m = gen(a);
    expect(drawView(m, b, "iso").bb).not.toEqual(drawView(m, a, "iso").bb);
    expect(blockName(b, "iso")).toContain("ISO90");
    expect(blockName(a, "iso")).toContain("_ISO_");
  });
});
