import { creditoSinImputar, deudasPendientes, esCredito } from "./cuenta-corriente";
import type { Movimiento } from "./types";

export interface ProyeccionCartera {
  abiertos: Movimiento[];
  cobrosMes: Record<string, number>;
}
/** Conserva solo deuda pendiente y crédito disponible; el historial queda en movimientos. */
export function proyectarCartera(movimientos: Movimiento[]): ProyeccionCartera {
  const abiertos: Movimiento[] = deudasPendientes(movimientos).map(({ debito, pendiente }) => ({
    ...debito,
    importe: pendiente,
  }));
  const cobrosMes: Record<string, number> = {};
  for (const m of movimientos) {
    if (!esCredito(m)) continue;
    const disponible = creditoSinImputar(m);
    if (disponible > 0) abiertos.push({ ...m, importe: disponible, imputaciones: [] });
    if (m.tipo === "pago") {
      const mes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "2-digit",
      })
        .format(new Date(m.fecha))
        .slice(0, 7);
      cobrosMes[mes] = (cobrosMes[mes] ?? 0) + m.importe;
    }
  }
  return { abiertos, cobrosMes };
}
