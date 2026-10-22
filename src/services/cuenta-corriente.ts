import {
  deudasPendientes,
  esCredito,
  imputarAutomatico,
  imputarSeleccion,
  resumirCuenta,
  tramosVacios,
  TRAMOS,
  type DeudaPorTramo,
  type ResumenCuenta,
} from "@/domain/cuenta-corriente";
import { aFechaISO, enRango, fechaDe, inicioDeMes } from "@/domain/fechas";
import type { Centavos, Cliente, MedioPago, Movimiento, MovimientoCredito, Recibo } from "@/domain/types";
import { formatNumeroComprobante } from "@/lib/format";
import { ErrorDeNegocio, type Contexto } from "./contexto";

export interface CuentaCliente {
  cliente: Cliente;
  movimientos: Movimiento[];
  resumen: ResumenCuenta;
}

export async function cuentaDeCliente(ctx: Contexto, clienteId: string): Promise<CuentaCliente | undefined> {
  const [cliente, movimientos] = await Promise.all([
    ctx.store.clientes.obtener(clienteId),
    ctx.store.movimientos.listarPorCliente(clienteId),
  ]);
  if (!cliente) return undefined;
  return { cliente, movimientos, resumen: resumirCuenta(movimientos, aFechaISO(ctx.ahora())) };
}

export interface NuevoPago {
  /** Id del recibo. Lo elige quien lo pide, para que reintentar el pedido no lo duplique. */
  id?: string;
  clienteId: string;
  importe: Centavos;
  medio: MedioPago;
  /** Comprobantes elegidos para imputar; vacío o ausente = automático (más viejo primero). */
  debitoIds?: string[];
  usuarioId: string;
}

export async function registrarPago(ctx: Contexto, input: NuevoPago): Promise<Recibo> {
  const { store } = ctx;
  if (input.importe <= 0) throw new ErrorDeNegocio("El importe tiene que ser mayor a cero");
  if (input.medio === "cuenta_corriente") throw new ErrorDeNegocio("Medio de pago inválido");

  const [comercio, cliente, movimientos] = await Promise.all([
    store.comercio.obtener(),
    store.clientes.obtener(input.clienteId),
    store.movimientos.listarPorCliente(input.clienteId),
  ]);
  if (!cliente) throw new ErrorDeNegocio("El cliente no existe");

  const deudas = deudasPendientes(movimientos);
  const { imputaciones, sobrante } =
    input.debitoIds && input.debitoIds.length > 0
      ? imputarSeleccion(deudas, input.debitoIds, input.importe)
      : imputarAutomatico(deudas, input.importe);

  const fecha = ctx.ahora().toISOString();
  const numero = await store.contadores.siguiente(`R-${comercio.puntoVenta}`);
  const descripcionDe = new Map(deudas.map((d) => [d.debito.id, d.debito.descripcion]));

  const recibo: Recibo = {
    id: input.id ?? ctx.nuevoId(),
    numero,
    puntoVenta: comercio.puntoVenta,
    fecha,
    clienteId: cliente.id,
    clienteNombre: cliente.razonSocial,
    importe: input.importe,
    medio: input.medio,
    imputaciones: imputaciones.map((i) => ({ ...i, descripcion: descripcionDe.get(i.debitoId) ?? "" })),
    saldoAFavor: sobrante,
    usuarioId: input.usuarioId,
  };

  const movimiento: MovimientoCredito = {
    id: ctx.nuevoId(),
    tipo: "pago",
    clienteId: cliente.id,
    fecha,
    importe: input.importe,
    descripcion: `Recibo ${formatNumeroComprobante(comercio.puntoVenta, numero)}`,
    reciboId: recibo.id,
    medio: input.medio,
    imputaciones,
  };

  await store.transaccion(async () => {
    await store.recibos.agregar(recibo);
    await store.movimientos.guardar(movimiento);
  });
  return recibo;
}

export function obtenerRecibo(ctx: Contexto, id: string) {
  return ctx.store.recibos.obtener(id);
}

// ---------------------------------------------------------------------------
// Cartera (panel de cobranza y listado de clientes)

export interface ResumenCartera {
  cuentas: CuentaCliente[];
  /** Total adeudado por todos los clientes. */
  enLaCalle: Centavos;
  vencido: Centavos;
  cobradoMes: Centavos;
  tramos: DeudaPorTramo;
}

export async function resumenCartera(ctx: Contexto): Promise<ResumenCartera> {
  const [clientes, movimientos] = await Promise.all([
    ctx.store.clientes.listar(),
    ctx.store.movimientos.listar(),
  ]);
  const hoy = aFechaISO(ctx.ahora());
  const mes = { desde: inicioDeMes(hoy), hasta: hoy };

  const porCliente = new Map<string, Movimiento[]>();
  for (const m of movimientos) {
    const lista = porCliente.get(m.clienteId);
    if (lista) lista.push(m);
    else porCliente.set(m.clienteId, [m]);
  }

  const cuentas: CuentaCliente[] = clientes.map((cliente) => {
    const movs = (porCliente.get(cliente.id) ?? []).sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { cliente, movimientos: movs, resumen: resumirCuenta(movs, hoy) };
  });

  const tramos = tramosVacios();
  let enLaCalle = 0;
  let vencido = 0;
  for (const c of cuentas) {
    enLaCalle += c.resumen.deuda;
    vencido += c.resumen.vencido;
    for (const t of TRAMOS) tramos[t] += c.resumen.tramos[t];
  }

  const cobradoMes = movimientos
    .filter((m) => esCredito(m) && m.tipo === "pago" && enRango(fechaDe(m.fecha), mes))
    .reduce((total, m) => total + m.importe, 0);

  return { cuentas, enLaCalle, vencido, cobradoMes, tramos };
}
