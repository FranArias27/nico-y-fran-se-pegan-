import { rangoAnterior, type Periodo, type Rango } from "@/domain/fechas";
import {
  descuentosOtorgados,
  resumirVentas,
  ventasBajoCosto,
  ventasPorArticulo,
  ventasPorCategoria,
  ventasPorDia,
  ventasPorMedioPago,
  ventasPorVendedor,
} from "@/domain/reportes";
import type { Contexto } from "./contexto";

export interface FiltroReporte {
  periodo: Periodo;
  rango: Rango;
}

export async function generarReporte(ctx: Contexto, filtro: FiltroReporte) {
  const anterior = rangoAnterior(filtro.rango, filtro.periodo);
  const [ventas, ventasAnteriores, categorias] = await Promise.all([
    ctx.store.ventas.listar(filtro.rango),
    ctx.store.ventas.listar(anterior),
    ctx.store.categorias.listar(),
  ]);
  const nombres = new Map(categorias.map((c) => [c.id, c.nombre]));
  const nombreCategoria = (id: string) => nombres.get(id) ?? "Sin categoría";

  return {
    rango: filtro.rango,
    rangoAnterior: anterior,
    resumen: resumirVentas(ventas),
    resumenAnterior: resumirVentas(ventasAnteriores),
    porDia: ventasPorDia(ventas, filtro.rango),
    porDiaAnterior: ventasPorDia(ventasAnteriores, anterior),
    porVendedor: ventasPorVendedor(ventas),
    porMedio: ventasPorMedioPago(ventas),
    porCategoria: ventasPorCategoria(ventas, nombreCategoria),
    porArticulo: ventasPorArticulo(ventas),
    bajoCosto: ventasBajoCosto(ventas),
    descuentos: descuentosOtorgados(ventas),
  };
}

export type Reporte = Awaited<ReturnType<typeof generarReporte>>;
