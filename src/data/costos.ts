import type { Articulo, Centavos, LineaVenta, PuntosBasicos, Venta } from "@/domain/types";

/**
 * Los costos y márgenes solo los ven los administradores. En Firestore se
 * guardan aparte, en colecciones que el vendedor no puede leer:
 *   - `costos/{articuloId}`: costo y margen del artículo.
 *   - `ventasCostos/{ventaId}`: costo unitario de cada línea de la venta.
 * El resto de la app sigue trabajando con `Articulo` y `Venta` completos: sin
 * permiso, los costos se leen como 0.
 */

export interface CostoArticulo {
  costo: Centavos;
  margen: PuntosBasicos;
}

/** Costos de las líneas de una venta, en el mismo orden. `fecha` y `clienteId` sirven para consultarlos. */
export interface CostosVenta {
  fecha: string;
  clienteId: string;
  costos: Centavos[];
}

export type ArticuloPublico = Omit<Articulo, "costo" | "margen"> & Partial<CostoArticulo>;
type LineaPublica = Omit<LineaVenta, "costoUnitario"> & { costoUnitario?: Centavos };
export type VentaPublica = Omit<Venta, "lineas"> & { lineas: LineaPublica[] };

export function separarArticulo(articulo: Articulo): { publico: ArticuloPublico; costo: CostoArticulo } {
  const { costo, margen, ...publico } = articulo;
  return { publico, costo: { costo, margen } };
}

export function unirArticulo(publico: ArticuloPublico, costo?: CostoArticulo): Articulo {
  // Los artículos guardados antes de la separación todavía tienen el costo en el mismo documento.
  return { ...publico, costo: costo?.costo ?? publico.costo ?? 0, margen: costo?.margen ?? publico.margen ?? 0 };
}

export function separarVenta(venta: Venta): { publica: VentaPublica; costos: CostosVenta } {
  return {
    publica: {
      ...venta,
      lineas: venta.lineas.map((l) => {
        const linea: LineaPublica = { ...l };
        delete linea.costoUnitario;
        return linea;
      }),
    },
    costos: { fecha: venta.fecha, clienteId: venta.clienteId, costos: venta.lineas.map((l) => l.costoUnitario) },
  };
}

export function unirVenta(publica: VentaPublica, costos?: CostosVenta): Venta {
  return {
    ...publica,
    lineas: publica.lineas.map((l, i) => ({ ...l, costoUnitario: costos?.costos[i] ?? l.costoUnitario ?? 0 })),
  };
}

/** Une artículos o ventas con sus costos, buscados por id. */
export function unirTodos<P extends { id: string }, C, R>(
  publicos: P[],
  costos: Map<string, C>,
  unir: (p: P, c?: C) => R,
): R[] {
  return publicos.map((p) => unir(p, costos.get(p.id)));
}
