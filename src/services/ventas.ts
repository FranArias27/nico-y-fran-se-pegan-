import { armarLineas } from "@/domain/carrito";
import { calcularCobro, pagosNetosDeVuelto } from "@/domain/cobro";
import { comprobantesDisponibles, esNotaCredito, etiquetaComprobante } from "@/domain/comprobante";
import {
  aplicarCreditosDisponibles,
  calcularSaldo,
  deudasPendientes,
  esCredito,
  esDebito,
  evaluarVentaACuenta,
  imputarSeleccion,
} from "@/domain/cuenta-corriente";
import { fechaDe, sumarDias, type Rango } from "@/domain/fechas";
import { cuitValido } from "@/domain/identificadores";
import { armarNotaCredito, type Devolucion } from "@/domain/nota-credito";
import type {
  Descuento,
  ItemCarrito,
  MedioPago,
  MovimientoCredito,
  MovimientoDebito,
  Pago,
  TipoComprobante,
  Venta,
  VentaEnEspera,
} from "@/domain/types";
import type { SolicitudAutorizacion } from "@/integrations/fiscal/fiscal-provider";
import { formatNumeroComprobante } from "@/lib/format";
import { ErrorDeNegocio, type Contexto } from "./contexto";

export interface NuevaVenta {
  /** Id de la venta. Lo elige quien la pide, para que reintentar el pedido no la duplique. */
  id?: string;
  tipo: TipoComprobante;
  clienteId: string;
  items: ItemCarrito[];
  descuentoTotal?: Descuento;
  pagos: Pago[];
  vendedorId: string;
  vendedorNombre?: string;
}

export function descripcionComprobante(venta: Pick<Venta, "clase" | "tipo" | "puntoVenta" | "numero">): string {
  return `${etiquetaComprobante(venta)} ${formatNumeroComprobante(venta.puntoVenta, venta.numero)}`;
}

/**
 * Número y datos fiscales del comprobante. Los fiscales los numera quien
 * autoriza (ARCA); la nota de pedido y su devolución usan un contador propio.
 */
async function numerarYAutorizar(
  ctx: Contexto,
  datos: Omit<SolicitudAutorizacion, "tipo"> & { tipo: TipoComprobante },
): Promise<Pick<Venta, "numero" | "fiscal">> {
  const { tipo, comercio, clase } = datos;
  if (tipo === "X") {
    const prefijo = clase === "nota_credito" ? "NC" : "";
    return { numero: await ctx.store.contadores.siguiente(`${prefijo}X-${comercio.puntoVenta}`) };
  }
  if (!cuitValido(comercio.cuit)) {
    throw new ErrorDeNegocio("Para emitir comprobantes fiscales, cargá el CUIT del comercio en Configuración");
  }
  try {
    const { numero, ...fiscal } = await ctx.fiscal.autorizar({ ...datos, tipo });
    return { numero, fiscal };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) throw e;
    throw new ErrorDeNegocio(`ARCA no autorizó el comprobante: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function registrarVenta(ctx: Contexto, input: NuevaVenta): Promise<Venta> {
  const { store } = ctx;
  const [comercio, cliente, articulos] = await Promise.all([
    store.comercio.obtener(),
    store.clientes.obtener(input.clienteId),
    store.articulos.listar(),
  ]);
  if (!cliente) throw new ErrorDeNegocio("El cliente no existe");
  if (!comprobantesDisponibles(comercio.condicionIva, cliente.condicionIva).includes(input.tipo)) {
    throw new ErrorDeNegocio("Ese comprobante no corresponde a la condición de IVA del comercio y del cliente");
  }

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

  // La autorización fiscal es una llamada externa: va fuera de la transacción.
  const { numero, fiscal } = await numerarYAutorizar(ctx, {
    comercio,
    clase: "factura",
    tipo: input.tipo,
    fecha,
    totales: calculo.totales,
    clienteCondicionIva: cliente.condicionIva,
    clienteDocumento: cliente.documento,
  });

  const venta: Venta = {
    id: input.id ?? ctx.nuevoId(),
    clase: "factura",
    tipo: input.tipo,
    puntoVenta: comercio.puntoVenta,
    numero,
    fecha,
    clienteId: cliente.id,
    clienteNombre: cliente.razonSocial,
    clienteCondicionIva: cliente.condicionIva,
    clienteDocumento: cliente.documento,
    vendedorId: input.vendedorId,
    vendedorNombre: input.vendedorNombre,
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

/** Comprobantes del rango, del más nuevo al más viejo. */
export async function listarVentas(ctx: Contexto, rango: Rango): Promise<Venta[]> {
  const ventas = await ctx.store.ventas.listar(rango);
  return ventas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function notasDeCredito(ctx: Contexto, ventaId: string): Promise<Venta[]> {
  return ctx.store.ventas.listarNotasDe(ventaId);
}

// ---------------------------------------------------------------------------
// Notas de crédito

export interface NuevaNotaCredito {
  /** Id de la nota. Lo elige quien la pide, para que reintentar el pedido no la duplique. */
  id?: string;
  ventaId: string;
  devoluciones: Devolucion[];
  /** Cómo se le devuelve el dinero al cliente; "cuenta_corriente" lo acredita en su cuenta. */
  reintegro: MedioPago;
  /** Si la mercadería vuelve a la venta (no si está rota o vencida). */
  reponerStock: boolean;
  vendedorId: string;
  vendedorNombre?: string;
}

export async function emitirNotaCredito(ctx: Contexto, input: NuevaNotaCredito): Promise<Venta> {
  const { store } = ctx;
  const [venta, notas, comercio] = await Promise.all([
    store.ventas.obtener(input.ventaId),
    store.ventas.listarNotasDe(input.ventaId),
    store.comercio.obtener(),
  ]);
  if (!venta) throw new ErrorDeNegocio("El comprobante no existe");
  if (esNotaCredito(venta)) throw new ErrorDeNegocio("No se puede emitir una nota de crédito sobre otra nota de crédito");

  const armado = armarNotaCredito(venta, input.devoluciones, notas);
  if ("error" in armado) throw new ErrorDeNegocio(armado.error);
  const { lineas, totales } = armado;

  const aCuenta = input.reintegro === "cuenta_corriente";
  const cliente = aCuenta ? await store.clientes.obtener(venta.clienteId) : undefined;
  if (aCuenta && !cliente?.cuentaCorriente) {
    throw new ErrorDeNegocio("El cliente no tiene cuenta corriente: elegí otra forma de devolver el dinero");
  }
  const movimientosCliente = aCuenta ? await store.movimientos.listarPorCliente(venta.clienteId) : [];

  const fecha = ctx.ahora().toISOString();
  const asociado = {
    ventaId: venta.id,
    tipo: venta.tipo,
    puntoVenta: venta.puntoVenta,
    numero: venta.numero,
    fecha: venta.fecha,
  };
  const { numero, fiscal } = await numerarYAutorizar(ctx, {
    comercio,
    clase: "nota_credito",
    tipo: venta.tipo,
    fecha,
    totales,
    clienteCondicionIva: venta.clienteCondicionIva,
    clienteDocumento: venta.clienteDocumento,
    asociado,
  });

  const nota: Venta = {
    id: input.id ?? ctx.nuevoId(),
    clase: "nota_credito",
    tipo: venta.tipo,
    puntoVenta: comercio.puntoVenta,
    numero,
    fecha,
    clienteId: venta.clienteId,
    clienteNombre: venta.clienteNombre,
    clienteCondicionIva: venta.clienteCondicionIva,
    clienteDocumento: venta.clienteDocumento,
    vendedorId: input.vendedorId,
    vendedorNombre: input.vendedorNombre,
    asociado,
    lineas,
    totales,
    pagos: [{ medio: input.reintegro, importe: totales.total }],
    vuelto: 0,
    fiscal,
  };

  await store.transaccion(async () => {
    await store.ventas.agregar(nota);
    if (input.reponerStock) {
      for (const linea of lineas) await store.articulos.ajustarStock(linea.articuloId, linea.cantidad);
    }
    if (aCuenta) {
      // Se descuenta primero de la deuda de la venta original; lo que sobra queda a favor.
      const debitos = movimientosCliente.filter(esDebito).filter((m) => m.ventaId === venta.id);
      const { imputaciones } = imputarSeleccion(
        deudasPendientes(movimientosCliente),
        debitos.map((d) => d.id),
        totales.total,
      );
      const credito: MovimientoCredito = {
        id: ctx.nuevoId(),
        tipo: "nota_credito",
        clienteId: venta.clienteId,
        fecha,
        importe: totales.total,
        descripcion: descripcionComprobante(nota),
        imputaciones,
      };
      await store.movimientos.guardar(credito);
    }
  });

  return nota;
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
