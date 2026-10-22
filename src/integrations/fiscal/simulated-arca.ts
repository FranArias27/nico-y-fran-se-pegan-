import { fechaDe, sumarDias } from "@/domain/fechas";
import type { FiscalProvider, SolicitudAutorizacion } from "./fiscal-provider";

/** Códigos de comprobante de ARCA. */
const CODIGO_COMPROBANTE = { A: 1, B: 6 } as const;

/** CAE ficticio de 14 dígitos, derivado de los datos del comprobante (estable). */
export function caeFicticio(s: Pick<SolicitudAutorizacion, "tipo" | "puntoVenta" | "numero" | "fecha">): string {
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

/**
 * Contenido del QR con el formato que define ARCA (JSON en base64 dentro de
 * la URL). Los datos son de ejemplo.
 */
export function urlQrComprobante(s: SolicitudAutorizacion, cae: string): string {
  const docTipo = s.clienteDocumento.length === 11 ? 80 : s.clienteDocumento ? 96 : 99;
  const datos = {
    ver: 1,
    fecha: fechaDe(s.fecha),
    cuit: Number(s.comercio.cuit),
    ptoVta: s.puntoVenta,
    tipoCmp: CODIGO_COMPROBANTE[s.tipo],
    nroCmp: s.numero,
    importe: s.total / 100,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: docTipo,
    nroDocRec: Number(s.clienteDocumento || 0),
    tipoCodAut: "E",
    codAut: Number(cae),
  };
  const base64 =
    typeof btoa === "function"
      ? btoa(JSON.stringify(datos))
      : Buffer.from(JSON.stringify(datos)).toString("base64");
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simula la autorización de ARCA: demora breve y CAE ficticio. */
export function crearArcaSimulado(opciones: { demoraMs?: number } = {}): FiscalProvider {
  const demora = opciones.demoraMs ?? 600;
  return {
    async autorizar(solicitud) {
      if (demora > 0) await esperar(demora);
      const cae = caeFicticio(solicitud);
      return {
        cae,
        caeVencimiento: sumarDias(fechaDe(solicitud.fecha), 10),
        qrUrl: urlQrComprobante(solicitud, cae),
      };
    },
  };
}
