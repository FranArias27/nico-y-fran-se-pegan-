/** Generador pseudoaleatorio con semilla (mulberry32): los datos demo salen siempre iguales. */
export function crearAzar(semilla: number) {
  let estado = semilla >>> 0;

  function siguiente(): number {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** [0, 1) */
    numero: siguiente,
    /** Entero en [min, max]. */
    entero(min: number, max: number): number {
      return min + Math.floor(siguiente() * (max - min + 1));
    },
    probabilidad(p: number): boolean {
      return siguiente() < p;
    },
    elegir<T>(items: readonly T[]): T {
      return items[Math.floor(siguiente() * items.length)];
    },
    /** Elige según pesos relativos. */
    ponderado<T>(items: readonly T[], peso: (item: T) => number): T {
      const total = items.reduce((s, i) => s + peso(i), 0);
      let r = siguiente() * total;
      for (const item of items) {
        r -= peso(item);
        if (r < 0) return item;
      }
      return items[items.length - 1];
    },
    digitos(cantidad: number): string {
      let s = "";
      for (let i = 0; i < cantidad; i++) s += Math.floor(siguiente() * 10).toString();
      return s;
    },
  };
}

export type Azar = ReturnType<typeof crearAzar>;
