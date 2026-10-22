import { armarLineas } from "@/domain/carrito";
import { calcularCobro, pagosNetosDeVuelto } from "@/domain/cobro";
import { ETIQUETA_COMPROBANTE } from "@/domain/types";
import {
  aplicarCreditosDisponibles,
  calcularSaldo,
  esCredito,
  evaluarVentaACuenta,
} from "@/domain/cuenta-corriente";
import { fechaDe, sumarDias } from "@/domain/fechas";
import type {
  Descuento,
  ItemCarrito,
  MovimientoCredito,
  MovimientoDebito,
  Pago,
  TipoComprobante,
  Venta,
  VentaEnEspera,
} from "@/domain/types";
import { formatNumeroComprobante } from "@/lib/format";
import { ErrorDeNegocio, type Contexto } from "./contexto";

export interface NuevaVenta {
  tipo: TipoComprobante;
  clienteId: string;
  items: ItemCarrito[];
  descuentoTotal?: Descuento;
  pagos: Pago[];
  vendedorId: string;
}

export function descripcionComprobante(venta: Pick<Venta, "tipo" | "puntoVenta" | "numero">): string {
  return `${ETIQUETA_COMPROBANTE[venta.tipo]} ${formatNumeroComprobante(venta.puntoVenta, venta.numero)}`;
}

export async function registrarVenta(ctx: Contexto, input: NuevaVenta): Promise<Venta> {
  const { store } = ctx;
  const [comercio, cliente, articulos] = await Promise.all([
    store.comercio.obtener(),
    store.clientes.obtener(input.clienteId),
    store.articulos.listar(),
  ]);
  if (!cliente) throw new ErrorDeNegocio("El cliente no existe");

  const mapa = new Map(articulos.map((a) => [a.id, a]));
  const { lineas, calculo } = armarLineas(input.tipo, input.items, mapa, input.descuentoTotal);
  if (lineas.length === 0) throw new ErrorDeNegocio("La venta no tiene artículos");

  const total = calculo.totales.total;
  const cobro = calcularCobro(total, input.pagos);
  if (cobro.error) throw new ErrorDeNegocio(cobro.error);
  if (!cobro.completo) throw new ErrorDeNegocio("El pago no cubre el total de la venta");

  const movimientosCliente = cobro.aCuenta > 0 ? await store.movimientos.listarPorCliente(cliente.id) : [];
  if (cobro.aCuenta > 0) {
    const evaluacion = evaluarVentaACuenta(cliente, calcularSaldo(movimientosCliente), cobro.aCuenta);
    if (!evaluacion.permitido) throw new ErrorDeNegocio(evaluacion.avisos[0]);
  }

  const fecha = ctx.ahora().toISOString();
  const numero = await store.contadores.siguiente(`${input.tipo}-${comercio.puntoVenta}`);

  // La autorización fiscal es una llamada externa: va fuera de la transacción.
  const fiscal =
    input.tipo === "X"
      ? undefined
      : await ctx.fiscal.autorizar({
          comercio,
          tipo: input.tipo,
          puntoVenta: comercio.puntoVenta,
          numero,
          fecha,
          total,
          clienteCondicionIva: cliente.condicionIva,
          clienteDocumento: cliente.documento,
        });

  const venta: Venta = {
    id: ctx.nuevoId(),
    tipo: input.tipo,
    puntoVenta: comercio.puntoVenta,
    numero,
    fecha,
    clienteId: cliente.id,
    clienteNombre: cliente.razonSocial,
    clienteCondicionIva: cliente.condicionIva,
    clienteDocumento: cliente.documento,
    vendedorId: input.vendedorId,
    lineas,
    descuentoTotal: input.descuentoTotal,
    totales: calculo.totales,
    pagos: pagosNetosDeVuelto(input.pagos, cobro.vuelto),
    vuelto: cobro.vuelto,
    fiscal,
  };

  await store.transaccion(async () => {
    await store.ventas.agregar(venta);
    for (const linea of lineas) {
      await store.articulos.ajustarStock(linea.articuloId, -linea.cantidad);
    }

    if (cobro.aCuenta > 0) {
      const debito: MovimientoDebito = {
        id: ctx.nuevoId(),
        tipo: "venta",
        clienteId: cliente.id,
        fecha,
        importe: cobro.aCuenta,
        descripcion: descripcionComprobante(venta),
        ventaId: venta.id,
        vencimiento: sumarDias(fechaDe(fecha), cliente.plazoDias),
      };
      await store.movimientos.guardar(debito);

      // Si el cliente tenía saldo a favor, se aplica a esta venta.
      const creditos = movimientosCliente.filter(esCredito);
      const aplicaciones = aplicarCreditosDisponibles(creditos, debito.id, debito.importe);
      for (const { creditoId, imputacion } of aplicaciones) {
        const credito = creditos.find((c) => c.id === creditoId)!;
        const actualizado: MovimientoCredito = {
          ...credito,
          imputaciones: [...credito.imputaciones, imputacion],
        };
        await store.movimientos.guardar(actualizado);
      }
    }
  });

  return venta;
}

export function obtenerVenta(ctx: Contexto, id: string) {
  return ctx.store.ventas.obtener(id);
}

// ---------------------------------------------------------------------------
// Ventas en espera

export async function ponerEnEspera(
  ctx: Contexto,
  datos: Omit<VentaEnEspera, "id" | "creadaEn">,
): Promise<VentaEnEspera> {
  const venta: VentaEnEspera = { ...datos, id: ctx.nuevoId(), creadaEn: ctx.ahora().toISOString() };
  await ctx.store.enEspera.guardar(venta);
  return venta;
}

export async function listarEnEspera(ctx: Contexto): Promise<VentaEnEspera[]> {
  const ventas = await ctx.store.enEspera.listar();
  return ventas.sort((a, b) => a.creadaEn.localeCompare(b.creadaEn));
}

/** Devuelve la venta en espera y la quita de la lista. */
export async function retomarEnEspera(ctx: Contexto, id: string): Promise<VentaEnEspera | undefined> {
  const ventas = await ctx.store.enEspera.listar();
  const venta = ventas.find((v) => v.id === id);
  if (venta) await ctx.store.enEspera.eliminar(id);
  return venta;
}

export function descartarEnEspera(ctx: Contexto, id: string): Promise<void> {
  return ctx.store.enEspera.eliminar(id);
}
