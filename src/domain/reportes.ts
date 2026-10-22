import { esNotaCredito } from "./comprobante";
import { multiplicarCantidad, sumar } from "./dinero";
import { diasDelRango, fechaDe, type Rango } from "./fechas";
import type { Centavos, LineaVenta, MedioPago, Milesimas, PuntosBasicos, Venta } from "./types";

export function costoLinea(linea: LineaVenta): Centavos {
  return multiplicarCantidad(linea.costoUnitario, linea.cantidad);
}

export function gananciaLinea(linea: LineaVenta): Centavos {
  return linea.neto - costoLinea(linea);
}

/** Margen sobre la venta neta, en puntos básicos (null si no hubo ventas). */
export function margenSobreNeto(ganancia: Centavos, neto: Centavos): PuntosBasicos | null {
  return neto > 0 ? Math.round((ganancia / neto) * 10000) : null;
}

/**
 * Las notas de crédito restan: devuelve las ventas con los importes y
 * cantidades de las notas en negativo, listas para sumar con el resto.
 */
export function aplicarNotasCredito(ventas: readonly Venta[]): Venta[] {
  return ventas.map((v) => {
    if (!esNotaCredito(v)) return v;
    const t = v.totales;
    return {
      ...v,
      lineas: v.lineas.map((l) => ({
        ...l,
        cantidad: -l.cantidad,
        netoBruto: -l.netoBruto,
        descuentoNeto: -l.descuentoNeto,
        neto: -l.neto,
        iva: -l.iva,
        total: -l.total,
      })),
      totales: {
        netoBruto: -t.netoBruto,
        descuentos: -t.descuentos,
        neto: -t.neto,
        iva: -t.iva,
        ivaPorAlicuota: t.ivaPorAlicuota.map((g) => ({ ...g, neto: -g.neto, iva: -g.iva })),
        total: -t.total,
      },
      pagos: v.pagos.map((p) => ({ ...p, importe: -p.importe })),
      vuelto: 0,
    };
  });
}

/** Cantidad de operaciones de venta (las notas de crédito no cuentan como una venta más). */
function operaciones(ventas: readonly Venta[]): number {
  return ventas.filter((v) => !esNotaCredito(v)).length;
}

export interface ResumenVentas {
  cantidad: number;
  /** Total facturado (lo que pagaron los clientes, con IVA si corresponde). */
  total: Centavos;
  /** Ventas netas de IVA (base de la ganancia). */
  neto: Centavos;
  costo: Centavos;
  ganancia: Centavos;
  margen: PuntosBasicos | null;
  ticketPromedio: Centavos;
  descuentos: Centavos;
}

export function resumirVentas(ventas: readonly Venta[]): ResumenVentas {
  const lineas = ventas.flatMap((v) => v.lineas);
  const total = sumar(ventas, (v) => v.totales.total);
  const neto = sumar(lineas, (l) => l.neto);
  const costo = sumar(lineas, costoLinea);
  const cantidad = operaciones(ventas);
  return {
    cantidad,
    total,
    neto,
    costo,
    ganancia: neto - costo,
    margen: margenSobreNeto(neto - costo, neto),
    ticketPromedio: cantidad > 0 ? Math.round(total / cantidad) : 0,
    descuentos: sumar(lineas, (l) => l.descuentoNeto),
  };
}

export interface VentasDelDia {
  fecha: string;
  total: Centavos;
  cantidad: number;
  ganancia: Centavos;
}

export function ventasPorDia(ventas: readonly Venta[], rango: Rango): VentasDelDia[] {
  const porDia = new Map(diasDelRango(rango).map((f) => [f, { fecha: f, total: 0, cantidad: 0, ganancia: 0 }]));
  for (const v of ventas) {
    const dia = porDia.get(fechaDe(v.fecha));
    if (!dia) continue;
    dia.total += v.totales.total;
    if (!esNotaCredito(v)) dia.cantidad += 1;
    dia.ganancia += sumar(v.lineas, gananciaLinea);
  }
  return [...porDia.values()];
}

function agrupar<K, T>(items: readonly T[], clave: (item: T) => K): Map<K, T[]> {
  const grupos = new Map<K, T[]>();
  for (const item of items) {
    const k = clave(item);
    const lista = grupos.get(k);
    if (lista) lista.push(item);
    else grupos.set(k, [item]);
  }
  return grupos;
}

export interface VentasPorVendedor {
  vendedorId: string;
  total: Centavos;
  cantidad: number;
  ticketPromedio: Centavos;
}

export function ventasPorVendedor(ventas: readonly Venta[]): VentasPorVendedor[] {
  return [...agrupar(ventas, (v) => v.vendedorId)]
    .map(([vendedorId, vs]) => {
      const total = sumar(vs, (v) => v.totales.total);
      const cantidad = operaciones(vs);
      return { vendedorId, total, cantidad, ticketPromedio: cantidad > 0 ? Math.round(total / cantidad) : 0 };
    })
    .sort((a, b) => b.total - a.total);
}

export interface VentasPorMedio {
  medio: MedioPago;
  importe: Centavos;
  operaciones: number;
}

export function ventasPorMedioPago(ventas: readonly Venta[]): VentasPorMedio[] {
  const pagos = ventas.flatMap((v) => v.pagos);
  return [...agrupar(pagos, (p) => p.medio)]
    .map(([medio, ps]) => ({ medio, importe: sumar(ps, (p) => p.importe), operaciones: ps.length }))
    .sort((a, b) => b.importe - a.importe);
}

export interface VentasPorGrupo {
  clave: string;
  nombre: string;
  cantidad: Milesimas;
  neto: Centavos;
  costo: Centavos;
  ganancia: Centavos;
  margen: PuntosBasicos | null;
}

function resumirLineas(clave: string, nombre: string, lineas: readonly LineaVenta[]): VentasPorGrupo {
  const neto = sumar(lineas, (l) => l.neto);
  const costo = sumar(lineas, costoLinea);
  return {
    clave,
    nombre,
    cantidad: sumar(lineas, (l) => l.cantidad),
    neto,
    costo,
    ganancia: neto - costo,
    margen: margenSobreNeto(neto - costo, neto),
  };
}

export function ventasPorCategoria(
  ventas: readonly Venta[],
  nombreCategoria: (id: string) => string,
): VentasPorGrupo[] {
  const lineas = ventas.flatMap((v) => v.lineas);
  return [...agrupar(lineas, (l) => l.categoriaId)]
    .map(([id, ls]) => resumirLineas(id, nombreCategoria(id), ls))
    .sort((a, b) => b.neto - a.neto);
}

export function ventasPorArticulo(ventas: readonly Venta[]): VentasPorGrupo[] {
  const lineas = ventas.flatMap((v) => v.lineas);
  return [...agrupar(lineas, (l) => l.articuloId)]
    .map(([id, ls]) => resumirLineas(id, ls[0].descripcion, ls))
    .sort((a, b) => b.ganancia - a.ganancia);
}

export interface VentaBajoCosto {
  ventaId: string;
  fecha: string;
  tipo: Venta["tipo"];
  puntoVenta: number;
  numero: number;
  vendedorId: string;
  descripcion: string;
  cantidad: Milesimas;
  neto: Centavos;
  costo: Centavos;
  perdida: Centavos;
}

/** Líneas vendidas por debajo del costo histórico. */
export function ventasBajoCosto(ventas: readonly Venta[]): VentaBajoCosto[] {
  const resultado: VentaBajoCosto[] = [];
  for (const v of ventas) {
    if (esNotaCredito(v)) continue;
    for (const l of v.lineas) {
      const costo = costoLinea(l);
      if (l.neto >= costo) continue;
      resultado.push({
        ventaId: v.id,
        fecha: v.fecha,
        tipo: v.tipo,
        puntoVenta: v.puntoVenta,
        numero: v.numero,
        vendedorId: v.vendedorId,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        neto: l.neto,
        costo,
        perdida: costo - l.neto,
      });
    }
  }
  return resultado.sort((a, b) => b.perdida - a.perdida);
}

export interface DescuentoOtorgado {
  ventaId: string;
  fecha: string;
  tipo: Venta["tipo"];
  puntoVenta: number;
  numero: number;
  vendedorId: string;
  clienteNombre: string;
  netoBruto: Centavos;
  descuento: Centavos;
}

export function descuentosOtorgados(ventas: readonly Venta[]): DescuentoOtorgado[] {
  return ventas
    .filter((v) => !esNotaCredito(v) && v.totales.descuentos > 0)
    .map((v) => ({
      ventaId: v.id,
      fecha: v.fecha,
      tipo: v.tipo,
      puntoVenta: v.puntoVenta,
      numero: v.numero,
      vendedorId: v.vendedorId,
      clienteNombre: v.clienteNombre,
      netoBruto: v.totales.netoBruto,
      descuento: v.totales.descuentos,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Variación porcentual (pb) de actual vs. anterior; null si no hay base. */
export function variacion(actual: number, anterior: number): PuntosBasicos | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 10000);
}
