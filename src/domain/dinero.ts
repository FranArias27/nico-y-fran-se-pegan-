import type { Centavos, Milesimas, PuntosBasicos } from "./types";

/** Redondeo comercial (mitad hacia arriba, simétrico para negativos). */
export function redondear(valor: number): number {
  return Math.sign(valor) * Math.round(Math.abs(valor));
}

/** importe × porcentaje. 10000 centavos × 2100 pb → 2100 centavos. */
export function porcentaje(importe: Centavos, pb: PuntosBasicos): Centavos {
  return redondear((importe * pb) / 10000);
}

/** precio unitario × cantidad en milésimas. */
export function multiplicarCantidad(precio: Centavos, cantidad: Milesimas): Centavos {
  return redondear((precio * cantidad) / 1000);
}

/**
 * Reparte `total` entre partes proporcionales a `pesos`, de modo que la suma
 * dé exactamente `total` (método del mayor resto).
 */
export function prorratear(total: Centavos, pesos: readonly number[]): Centavos[] {
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  if (sumaPesos === 0 || total === 0) return pesos.map(() => 0);

  const exactos = pesos.map((p) => (total * p) / sumaPesos);
  const base = exactos.map((x) => Math.floor(x));
  let resto = total - base.reduce((a, b) => a + b, 0);

  const orden = exactos
    .map((x, i) => ({ i, fraccion: x - Math.floor(x) }))
    .sort((a, b) => b.fraccion - a.fraccion || a.i - b.i);

  for (let k = 0; resto > 0 && k < orden.length; k++, resto--) {
    base[orden[k].i] += 1;
  }
  return base;
}

export function sumar<T>(items: readonly T[], f: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += f(item);
  return total;
}
