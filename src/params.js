// Parámetros de generación: valores por defecto y montaje del objeto que espera el motor.
import {SPECIES, GROVE} from "./engine/species.js";

// Ajustes de dibujo y exportación que no dependen de la especie.
export const DEFAULT_SETTINGS = {
  estacion: "primavera",
  real: 0.75, sombra: 0.7,
  relleno: true, simple: false,
  sombraP: false, sdir: 45, salt: 45, sdist: 2,
  raices: false, rg: 0.7, rp: 1,
  suelo: true,
  perim: true, gp: 0.6, gc: 0.3, gr: 0.25, gd: 0.13,
  escala: 100, dxfw: true, tres: false,
  isoRot: 0, // giro de la isométrica en grados (0, 90, 180, 270)
  simp: 0, // simplificación del perímetro exterior (0 = detalle completo para CAD)
};

// Ajustes que cambian con la especie (se reinician al elegir otra).
export function speciesDefaults(id) {
  const S = SPECIES[id];
  // En las especies de arboleda, Tallos es el número de ejemplares: se empieza con uno.
  const tallos = GROVE.has(id) ? 1 : S.tallos;
  return {H: S.H, W: S.W, tr: S.tr, ramas: S.ramas, tallos, dens: S.dens, jag: S.jag, huecos: S.huecos, cs: S.cs};
}

// Objeto completo de parámetros para gen() y drawView().
export function buildParams(species, values, seed) {
  const S = SPECIES[species];
  return {
    ...DEFAULT_SETTINGS, ...speciesDefaults(species), ...values,
    estacion: S.caduca ? (values.estacion ?? "verano") : "verano",
    species, mode: S.mode, tipo: S.shape, twist: S.twist || 0,
    rt: S.rt, rd: S.rd, rs: S.rs,
    seed: Math.max(1, Math.round(seed) || 1),
  };
}
