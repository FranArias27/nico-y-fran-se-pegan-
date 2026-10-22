import type { Descuento, ItemCarrito, MedioPago, Pago, TipoComprobante } from "@/domain/types";
import type { Devolucion } from "@/domain/nota-credito";
import { ErrorPedido } from "../acceso";

/**
 * Forma de los pedidos a /api/operaciones. Solo valida tipos y rangos: las
 * reglas de negocio las aplican los servicios. Arma objetos nuevos con los
 * campos esperados, así que lo que mande el navegador de más (por ejemplo,
 * el vendedor o los precios) se descarta.
 */

export type Accion = "venta" | "nota_credito" | "pago";

export interface DatosVenta {
  tipo: TipoComprobante;
  clienteId: string;
  items: ItemCarrito[];
  descuentoTotal?: Descuento;
  pagos: Pago[];
}

export interface DatosNotaCredito {
  ventaId: string;
  devoluciones: Devolucion[];
  reintegro: MedioPago;
  reponerStock: boolean;
}

export interface DatosPago {
  clienteId: string;
  importe: number;
  medio: MedioPago;
  debitoIds?: string[];
}

export type Pedido =
  | { empresaId: string; id: string; accion: "venta"; datos: DatosVenta }
  | { empresaId: string; id: string; accion: "nota_credito"; datos: DatosNotaCredito }
  | { empresaId: string; id: string; accion: "pago"; datos: DatosPago };

const MEDIOS: readonly MedioPago[] = ["efectivo", "transferencia", "debito", "credito", "qr", "cuenta_corriente"];
const TIPOS: readonly TipoComprobante[] = ["A", "B", "C", "X"];

class Invalido extends Error {}

function objeto(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Invalido();
  return v as Record<string, unknown>;
}

function texto(v: unknown, patron = /^[\w-]{1,100}$/): string {
  if (typeof v !== "string" || !patron.test(v)) throw new Invalido();
  return v;
}

function entero(v: unknown, minimo = 0): number {
  if (!Number.isSafeInteger(v) || (v as number) < minimo) throw new Invalido();
  return v as number;
}

function lista<T>(v: unknown, maximo: number, leer: (x: unknown) => T, minimo = 0): T[] {
  if (!Array.isArray(v) || v.length < minimo || v.length > maximo) throw new Invalido();
  return v.map(leer);
}

function uno<T>(v: unknown, opciones: readonly T[]): T {
  if (!opciones.includes(v as T)) throw new Invalido();
  return v as T;
}

function descuento(v: unknown): Descuento | undefined {
  if (v === undefined || v === null) return undefined;
  const d = objeto(v);
  if (d.tipo === "porcentaje") {
    const valor = entero(d.valor);
    if (valor > 10000) throw new Invalido();
    return { tipo: "porcentaje", valor };
  }
  if (d.tipo === "monto") return { tipo: "monto", valor: entero(d.valor) };
  throw new Invalido();
}

function leerVenta(v: unknown): DatosVenta {
  const d = objeto(v);
  return {
    tipo: uno(d.tipo, TIPOS),
    clienteId: texto(d.clienteId),
    items: lista(
      d.items,
      500,
      (x) => {
        const i = objeto(x);
        return { articuloId: texto(i.articuloId), cantidad: entero(i.cantidad, 1), descuento: descuento(i.descuento) };
      },
      1,
    ),
    descuentoTotal: descuento(d.descuentoTotal),
    pagos: lista(
      d.pagos,
      10,
      (x) => {
        const p = objeto(x);
        return { medio: uno(p.medio, MEDIOS), importe: entero(p.importe) };
      },
      1,
    ),
  };
}

function leerNotaCredito(v: unknown): DatosNotaCredito {
  const d = objeto(v);
  if (typeof d.reponerStock !== "boolean") throw new Invalido();
  return {
    ventaId: texto(d.ventaId),
    devoluciones: lista(
      d.devoluciones,
      500,
      (x) => {
        const i = objeto(x);
        return { articuloId: texto(i.articuloId), cantidad: entero(i.cantidad) };
      },
      1,
    ),
    reintegro: uno(d.reintegro, MEDIOS),
    reponerStock: d.reponerStock,
  };
}

function leerPago(v: unknown): DatosPago {
  const d = objeto(v);
  return {
    clienteId: texto(d.clienteId),
    importe: entero(d.importe, 1),
    medio: uno(d.medio, MEDIOS),
    debitoIds: d.debitoIds === undefined ? undefined : lista(d.debitoIds, 500, (x) => texto(x)),
  };
}

export function leerPedido(cuerpo: unknown): Pedido {
  try {
    const p = objeto(cuerpo);
    const base = { empresaId: texto(p.empresaId, /^[a-z0-9-]{1,60}$/), id: texto(p.id, /^[\w-]{8,64}$/) };
    switch (p.accion) {
      case "venta":
        return { ...base, accion: "venta", datos: leerVenta(p.datos) };
      case "nota_credito":
        return { ...base, accion: "nota_credito", datos: leerNotaCredito(p.datos) };
      case "pago":
        return { ...base, accion: "pago", datos: leerPago(p.datos) };
      default:
        throw new Invalido();
    }
  } catch (e) {
    if (e instanceof Invalido) throw new ErrorPedido("El pedido no es válido", 400);
    throw e;
  }
}

/** true si la venta tiene algún descuento (solo los administradores pueden hacerlos). */
export function tieneDescuentos(venta: DatosVenta): boolean {
  return [venta.descuentoTotal, ...venta.items.map((i) => i.descuento)].some((d) => d !== undefined && d.valor > 0);
}
