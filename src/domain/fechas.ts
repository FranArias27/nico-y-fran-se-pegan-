import type { FechaHoraISO, FechaISO } from "./types";

/** Fechas sin hora ("aaaa-mm-dd") en hora local. */

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function aFechaISO(fecha: Date): FechaISO {
  return `${fecha.getFullYear()}-${pad2(fecha.getMonth() + 1)}-${pad2(fecha.getDate())}`;
}

/** "aaaa-mm-dd" → Date a las 00:00 local. */
export function desdeFechaISO(fecha: FechaISO): Date {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d);
}

/** Fecha local (sin hora) de un instante ISO. */
export function fechaDe(fechaHora: FechaHoraISO): FechaISO {
  return aFechaISO(new Date(fechaHora));
}

export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  const d = desdeFechaISO(fecha);
  d.setDate(d.getDate() + dias);
  return aFechaISO(d);
}

/** Días calendario de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  const a = desdeFechaISO(desde);
  const b = desdeFechaISO(hasta);
  // Date.UTC evita errores por cambios de horario.
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

export function inicioDeMes(fecha: FechaISO): FechaISO {
  return `${fecha.slice(0, 7)}-01`;
}

export function finDeMes(fecha: FechaISO): FechaISO {
  const d = desdeFechaISO(fecha);
  return aFechaISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Lunes de la semana de la fecha. */
export function inicioDeSemana(fecha: FechaISO): FechaISO {
  const d = desdeFechaISO(fecha);
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  return sumarDias(fecha, -dia);
}

export interface Rango {
  desde: FechaISO;
  /** Inclusive. */
  hasta: FechaISO;
}

export function enRango(fecha: FechaISO, rango: Rango): boolean {
  return fecha >= rango.desde && fecha <= rango.hasta;
}

export type Periodo = "hoy" | "semana" | "mes" | "rango";

/** Rango del período que contiene a `hoy` (la semana y el mes, hasta hoy). */
export function rangoDePeriodo(periodo: Exclude<Periodo, "rango">, hoy: FechaISO): Rango {
  switch (periodo) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "semana":
      return { desde: inicioDeSemana(hoy), hasta: hoy };
    case "mes":
      return { desde: inicioDeMes(hoy), hasta: hoy };
  }
}

/**
 * Período anterior comparable: mismo largo, inmediatamente antes.
 * Para "mes" compara contra los mismos días del mes anterior.
 */
export function rangoAnterior(rango: Rango, periodo: Periodo): Rango {
  if (periodo === "mes") {
    const desde = desdeFechaISO(rango.desde);
    const desdeAnterior = new Date(desde.getFullYear(), desde.getMonth() - 1, 1);
    const largo = diasEntre(rango.desde, rango.hasta);
    const finMesAnterior = finDeMes(aFechaISO(desdeAnterior));
    const hasta = sumarDias(aFechaISO(desdeAnterior), largo);
    return { desde: aFechaISO(desdeAnterior), hasta: hasta > finMesAnterior ? finMesAnterior : hasta };
  }
  const largo = diasEntre(rango.desde, rango.hasta) + 1;
  return { desde: sumarDias(rango.desde, -largo), hasta: sumarDias(rango.hasta, -largo) };
}

/** Todas las fechas del rango, en orden. */
export function diasDelRango(rango: Rango): FechaISO[] {
  const dias: FechaISO[] = [];
  for (let f = rango.desde; f <= rango.hasta; f = sumarDias(f, 1)) dias.push(f);
  return dias;
}
