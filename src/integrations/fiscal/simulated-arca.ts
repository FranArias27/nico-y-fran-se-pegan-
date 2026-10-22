import { codigoArca } from "@/domain/comprobante";
import { fechaDe, sumarDias } from "@/domain/fechas";
import { urlQrComprobante } from "./arca-datos";
import type { FiscalProvider, SolicitudAutorizacion } from "./fiscal-provider";

/** CAE ficticio de 14 dígitos, derivado de los datos del comprobante (estable). */
export function caeFicticio(s: { tipo: string; puntoVenta: number; numero: number; fecha: string }): string {
  let hash = 2166136261;
  const texto = `${s.tipo}|${s.puntoVenta}|${s.numero}|${s.fecha}`;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  // Los CAE reales empiezan con dígitos del año en curso; imitamos el formato.
  const prefijo = `7${s.fecha.slice(2, 4)}`;
  return (prefijo + hash.toString().padStart(11, "0")).slice(0, 14);
}

/** Clave del contador local de cada tipo de comprobante. */
export function claveNumeracion(s: Pick<SolicitudAutorizacion, "clase" | "tipo" | "comercio">): string {
  return `${s.clase === "nota_credito" ? "NC" : ""}${s.tipo}-${s.comercio.puntoVenta}`;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Simula la autorización de ARCA: demora breve, numeración local y CAE
 * ficticio. Los comprobantes quedan marcados como sin validez fiscal.
 */
export function crearArcaSimulado(opciones: {
  numerar: (clave: string) => Promise<number>;
  demoraMs?: number;
}): FiscalProvider {
  const demora = opciones.demoraMs ?? 600;
  return {
    async autorizar(solicitud) {
      if (demora > 0) await esperar(demora);
      const { comercio, tipo, clase, fecha } = solicitud;
      const numero = await opciones.numerar(claveNumeracion(solicitud));
      const cae = caeFicticio({ tipo: `${clase}${tipo}`, puntoVenta: comercio.puntoVenta, numero, fecha });
      return {
        numero,
        cae,
        caeVencimiento: sumarDias(fechaDe(fecha), 10),
        simulado: true,
        qrUrl: urlQrComprobante({
          fecha,
          cuit: comercio.cuit,
          puntoVenta: comercio.puntoVenta,
          codigoComprobante: codigoArca(clase, tipo),
          numero,
          total: solicitud.totales.total,
          clienteDocumento: solicitud.clienteDocumento,
          cae,
        }),
      };
    },
  };
}
