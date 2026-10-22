import { sumar } from "./dinero";
import type { Centavos, MedioPago, Pago } from "./types";

export interface EstadoCobro {
  pagado: Centavos;
  /** Lo que falta cubrir (0 si está completo). */
  faltante: Centavos;
  /** Efectivo a devolver. */
  vuelto: Centavos;
  /** Monto que va a la cuenta corriente del cliente. */
  aCuenta: Centavos;
  completo: boolean;
  error?: string;
}

/**
 * Valida un cobro (simple o mixto). Solo el efectivo puede superar el total:
 * el excedente es el vuelto. Los demás medios no pueden pasarse del total.
 */
export function calcularCobro(total: Centavos, pagos: readonly Pago[]): EstadoCobro {
  const validos = pagos.filter((p) => p.importe > 0);
  const pagado = sumar(validos, (p) => p.importe);
  const efectivo = sumar(
    validos.filter((p) => p.medio === "efectivo"),
    (p) => p.importe,
  );
  const otros = pagado - efectivo;
  const aCuenta = sumar(
    validos.filter((p) => p.medio === "cuenta_corriente"),
    (p) => p.importe,
  );

  if (otros > total) {
    return {
      pagado,
      faltante: 0,
      vuelto: 0,
      aCuenta,
      completo: false,
      error: "Los medios distintos de efectivo superan el total",
    };
  }

  const faltante = Math.max(total - pagado, 0);
  const vuelto = Math.max(pagado - total, 0);
  return { pagado, faltante, vuelto, aCuenta, completo: faltante === 0 };
}

/** Pagos que se registran: el efectivo se guarda neto del vuelto. */
export function pagosNetosDeVuelto(pagos: readonly Pago[], vuelto: Centavos): Pago[] {
  let restante = vuelto;
  return pagos
    .filter((p) => p.importe > 0)
    .map((p) => {
      if (p.medio !== "efectivo" || restante === 0) return p;
      const descuento = Math.min(restante, p.importe);
      restante -= descuento;
      return { ...p, importe: p.importe - descuento };
    })
    .filter((p) => p.importe > 0);
}

export const MEDIOS_COBRO: readonly MedioPago[] = [
  "efectivo",
  "transferencia",
  "debito",
  "credito",
  "qr",
  "cuenta_corriente",
];

/** Medios para registrar pagos de cuenta corriente (no incluye "a cuenta"). */
export const MEDIOS_PAGO_CUENTA: readonly MedioPago[] = [
  "efectivo",
  "transferencia",
  "debito",
  "credito",
  "qr",
];
