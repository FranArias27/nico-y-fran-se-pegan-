import { redondear, sumar } from "./dinero";
import type { AlicuotaIva, Centavos, IvaPorAlicuota, LineaVenta, Milesimas, TotalesComprobante, Venta } from "./types";

/** Artículo y cantidad que el cliente devuelve. */
export interface Devolucion {
  articuloId: string;
  cantidad: Milesimas;
}

const IMPORTES = ["netoBruto", "descuentoNeto", "neto", "iva", "total"] as const;
type Importes = Pick<LineaVenta, (typeof IMPORTES)[number]>;

function sumarImportes(lineas: readonly Importes[]): Importes {
  return Object.fromEntries(IMPORTES.map((k) => [k, sumar(lineas, (l) => l[k])])) as unknown as Importes;
}

function lineasDe(notas: readonly Venta[], articuloId: string): LineaVenta[] {
  return notas.flatMap((n) => n.lineas.filter((l) => l.articuloId === articuloId));
}

/** Cantidad de cada artículo de la venta que todavía se puede devolver. */
export function pendientesDeDevolver(venta: Venta, notasAnteriores: readonly Venta[]): Map<string, Milesimas> {
  return new Map(
    venta.lineas.map((l) => [
      l.articuloId,
      l.cantidad - sumar(lineasDe(notasAnteriores, l.articuloId), (d) => d.cantidad),
    ]),
  );
}

/** Total que todavía se puede acreditar (lo facturado menos las notas de crédito anteriores). */
export function importePendiente(venta: Venta, notasAnteriores: readonly Venta[]): Centavos {
  return venta.totales.total - sumar(notasAnteriores, (n) => n.totales.total);
}

function totalesDe(lineas: readonly LineaVenta[], conIva: boolean): TotalesComprobante {
  const ivaPorAlicuota: IvaPorAlicuota[] = [];
  if (conIva) {
    const alicuotas = [...new Set(lineas.map((l) => l.alicuotaIva))].sort((a, b) => b - a);
    for (const alicuota of alicuotas) {
      const grupo = lineas.filter((l) => l.alicuotaIva === (alicuota as AlicuotaIva));
      ivaPorAlicuota.push({ alicuota, neto: sumar(grupo, (l) => l.neto), iva: sumar(grupo, (l) => l.iva) });
    }
  }
  const t = sumarImportes(lineas);
  return {
    netoBruto: t.netoBruto,
    descuentos: t.descuentoNeto,
    neto: t.neto,
    iva: t.iva,
    ivaPorAlicuota,
    total: t.total,
  };
}

/**
 * Arma las líneas de una nota de crédito. Cada línea es la parte proporcional
 * de la línea original (con sus descuentos e IVA); si se devuelve todo lo que
 * quedaba, toma el resto exacto para que la suma de las notas coincida al
 * centavo con la factura.
 */
export function armarNotaCredito(
  venta: Venta,
  devoluciones: readonly Devolucion[],
  notasAnteriores: readonly Venta[],
): { error: string } | { lineas: LineaVenta[]; totales: TotalesComprobante } {
  const pendientes = pendientesDeDevolver(venta, notasAnteriores);
  const pedidas = devoluciones.filter((d) => d.cantidad > 0);
  if (pedidas.length === 0) return { error: "Elegí al menos un artículo para devolver" };

  const lineas: LineaVenta[] = [];
  for (const d of pedidas) {
    const original = venta.lineas.find((l) => l.articuloId === d.articuloId);
    if (!original) return { error: "Uno de los artículos no está en el comprobante" };
    const pendiente = pendientes.get(d.articuloId) ?? 0;
    if (d.cantidad > pendiente) return { error: `De "${original.descripcion}" no se puede devolver tanta cantidad` };

    let importes: Importes;
    if (d.cantidad === pendiente) {
      const yaDevuelto = sumarImportes(lineasDe(notasAnteriores, d.articuloId));
      importes = Object.fromEntries(IMPORTES.map((k) => [k, original[k] - yaDevuelto[k]])) as unknown as Importes;
    } else {
      importes = Object.fromEntries(
        IMPORTES.map((k) => [k, redondear((original[k] * d.cantidad) / original.cantidad)]),
      ) as unknown as Importes;
    }
    lineas.push({ ...original, cantidad: d.cantidad, ...importes });
  }

  return { lineas, totales: totalesDe(lineas, venta.totales.ivaPorAlicuota.length > 0) };
}
