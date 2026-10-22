import { sumar } from "./dinero";
import { diasEntre } from "./fechas";
import type {
  Centavos,
  Cliente,
  FechaISO,
  Imputacion,
  Movimiento,
  MovimientoCredito,
  MovimientoDebito,
} from "./types";

export interface DeudaPendiente {
  debito: MovimientoDebito;
  pendiente: Centavos;
}

export function esDebito(m: Movimiento): m is MovimientoDebito {
  return m.tipo === "venta";
}

export function esCredito(m: Movimiento): m is MovimientoCredito {
  return m.tipo !== "venta";
}

/** Saldo del cliente: positivo = debe; negativo = saldo a favor. */
export function calcularSaldo(movimientos: readonly Movimiento[]): Centavos {
  return sumar(movimientos, (m) => (esDebito(m) ? m.importe : -m.importe));
}

export function creditoSinImputar(credito: MovimientoCredito): Centavos {
  return credito.importe - sumar(credito.imputaciones, (i) => i.importe);
}

/** Orden de imputación: primero lo que vence antes; a igual vencimiento, lo más viejo. */
function ordenDeuda(a: MovimientoDebito, b: MovimientoDebito): number {
  return a.vencimiento.localeCompare(b.vencimiento) || a.fecha.localeCompare(b.fecha);
}

/** Comprobantes con saldo pendiente, del más viejo al más nuevo. */
export function deudasPendientes(movimientos: readonly Movimiento[]): DeudaPendiente[] {
  const imputado = new Map<string, Centavos>();
  for (const m of movimientos) {
    if (!esCredito(m)) continue;
    for (const imp of m.imputaciones) {
      imputado.set(imp.debitoId, (imputado.get(imp.debitoId) ?? 0) + imp.importe);
    }
  }
  return movimientos
    .filter(esDebito)
    .sort(ordenDeuda)
    .map((debito) => ({ debito, pendiente: debito.importe - (imputado.get(debito.id) ?? 0) }))
    .filter((d) => d.pendiente > 0);
}

export interface ResultadoImputacion {
  imputaciones: Imputacion[];
  /** Parte del monto que no se imputó: queda como saldo a favor. */
  sobrante: Centavos;
}

/** Imputa el monto a la deuda más vieja primero. */
export function imputarAutomatico(
  deudas: readonly DeudaPendiente[],
  monto: Centavos,
): ResultadoImputacion {
  const imputaciones: Imputacion[] = [];
  let restante = monto;
  for (const d of [...deudas].sort((a, b) => ordenDeuda(a.debito, b.debito))) {
    if (restante <= 0) break;
    const importe = Math.min(restante, d.pendiente);
    if (importe > 0) {
      imputaciones.push({ debitoId: d.debito.id, importe });
      restante -= importe;
    }
  }
  return { imputaciones, sobrante: restante };
}

/**
 * Imputación manual: el monto se aplica solo a los comprobantes elegidos
 * (del más viejo al más nuevo). Lo que sobra queda como saldo a favor.
 */
export function imputarSeleccion(
  deudas: readonly DeudaPendiente[],
  debitoIds: readonly string[],
  monto: Centavos,
): ResultadoImputacion {
  const elegidos = new Set(debitoIds);
  return imputarAutomatico(
    deudas.filter((d) => elegidos.has(d.debito.id)),
    monto,
  );
}

/**
 * Cuando entra una nueva venta a cuenta y el cliente tiene saldo a favor,
 * los créditos disponibles se aplican a esa venta (los más viejos primero).
 */
export function aplicarCreditosDisponibles(
  creditos: readonly MovimientoCredito[],
  debitoId: string,
  importe: Centavos,
): { creditoId: string; imputacion: Imputacion }[] {
  const resultado: { creditoId: string; imputacion: Imputacion }[] = [];
  let restante = importe;
  const ordenados = [...creditos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const credito of ordenados) {
    if (restante <= 0) break;
    const disponible = creditoSinImputar(credito);
    if (disponible <= 0) continue;
    const aplicado = Math.min(disponible, restante);
    resultado.push({ creditoId: credito.id, imputacion: { debitoId, importe: aplicado } });
    restante -= aplicado;
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Antigüedad de deuda

export type Tramo = "al_dia" | "1_7" | "8_15" | "16_30" | "mas_30";

export const TRAMOS: readonly Tramo[] = ["al_dia", "1_7", "8_15", "16_30", "mas_30"];

export const ETIQUETA_TRAMO: Record<Tramo, string> = {
  al_dia: "Al día",
  "1_7": "1–7 días",
  "8_15": "8–15 días",
  "16_30": "16–30 días",
  mas_30: "Más de 30 días",
};

/** Días de atraso respecto del vencimiento (0 si todavía no venció). */
export function diasVencido(vencimiento: FechaISO, hoy: FechaISO): number {
  return Math.max(0, diasEntre(vencimiento, hoy));
}

export function tramoDe(dias: number): Tramo {
  if (dias <= 0) return "al_dia";
  if (dias <= 7) return "1_7";
  if (dias <= 15) return "8_15";
  if (dias <= 30) return "16_30";
  return "mas_30";
}

export type DeudaPorTramo = Record<Tramo, Centavos>;

export function tramosVacios(): DeudaPorTramo {
  return { al_dia: 0, "1_7": 0, "8_15": 0, "16_30": 0, mas_30: 0 };
}

export function deudaPorTramo(deudas: readonly DeudaPendiente[], hoy: FechaISO): DeudaPorTramo {
  const tramos = tramosVacios();
  for (const d of deudas) {
    tramos[tramoDe(diasVencido(d.debito.vencimiento, hoy))] += d.pendiente;
  }
  return tramos;
}

export interface ResumenCuenta {
  saldo: Centavos;
  /** Deuda total pendiente (sin descontar el saldo a favor). */
  deuda: Centavos;
  vencido: Centavos;
  saldoAFavor: Centavos;
  tramos: DeudaPorTramo;
  deudas: DeudaPendiente[];
  /** Atraso del comprobante más viejo impago (0 si no hay vencidos). */
  maxDiasVencido: number;
}

export function resumirCuenta(movimientos: readonly Movimiento[], hoy: FechaISO): ResumenCuenta {
  const deudas = deudasPendientes(movimientos);
  const tramos = deudaPorTramo(deudas, hoy);
  const deuda = sumar(deudas, (d) => d.pendiente);
  const saldoAFavor = sumar(movimientos.filter(esCredito), creditoSinImputar);
  return {
    saldo: calcularSaldo(movimientos),
    deuda,
    vencido: deuda - tramos.al_dia,
    saldoAFavor,
    tramos,
    deudas,
    maxDiasVencido: deudas.reduce((max, d) => Math.max(max, diasVencido(d.debito.vencimiento, hoy)), 0),
  };
}

// ---------------------------------------------------------------------------
// Control de crédito

export interface EvaluacionCredito {
  permitido: boolean;
  avisos: string[];
}

/** Evalúa una venta a cuenta corriente según el estado y el límite del cliente. */
export function evaluarVentaACuenta(
  cliente: Pick<Cliente, "cuentaCorriente" | "estado" | "limiteCredito">,
  saldoActual: Centavos,
  montoACuenta: Centavos,
): EvaluacionCredito {
  if (!cliente.cuentaCorriente) {
    return { permitido: false, avisos: ["El cliente no tiene cuenta corriente habilitada."] };
  }
  if (cliente.estado === "bloqueado") {
    return { permitido: false, avisos: ["El cliente está bloqueado: solo se le puede vender al contado."] };
  }

  const avisos: string[] = [];
  if (cliente.estado === "observacion") {
    avisos.push("El cliente está en observación.");
  }
  const saldoNuevo = saldoActual + montoACuenta;
  if (cliente.limiteCredito > 0 && saldoNuevo > cliente.limiteCredito) {
    avisos.push("La venta supera el límite de crédito del cliente.");
  }
  return { permitido: true, avisos };
}

/** Lo que quedaría disponible de crédito (puede ser negativo si ya está excedido). */
export function creditoDisponible(limite: Centavos, saldo: Centavos): Centavos {
  return limite - saldo;
}
