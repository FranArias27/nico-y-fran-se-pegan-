import { fechaDe } from "@/domain/fechas";
import type { AlicuotaIva, Centavos, CondicionIva, TotalesComprobante } from "@/domain/types";
import type { TipoFiscal } from "./fiscal-provider";

/**
 * Traducción de los datos del dominio a los códigos de ARCA (WSFEv1). Es
 * código puro: lo usan el servidor y la simulación en el navegador.
 */

/** Tipo de documento del receptor: 80 CUIT, 96 DNI, 99 sin identificar. */
export function tipoDocumento(documento: string): { tipo: 80 | 96 | 99; numero: number } {
  const digitos = documento.replace(/\D/g, "");
  if (digitos.length === 11) return { tipo: 80, numero: Number(digitos) };
  if (digitos.length >= 7 && digitos.length <= 8) return { tipo: 96, numero: Number(digitos) };
  return { tipo: 99, numero: 0 };
}

/** Condición frente al IVA del receptor (RG 5616), obligatoria en cada comprobante. */
export const CONDICION_IVA_RECEPTOR: Record<CondicionIva, number> = {
  RI: 1,
  EXENTO: 4,
  CF: 5,
  MONOTRIBUTO: 6,
};

/** Códigos de alícuota de IVA. El exento no lleva alícuota: va en ImpOpEx. */
const ALICUOTA_ID: Record<Exclude<AlicuotaIva, 0>, number> = { 1050: 4, 2100: 5, 2700: 6 };

export interface ImportesArca {
  total: Centavos;
  /** Neto gravado. */
  neto: Centavos;
  /** Operaciones exentas. */
  exento: Centavos;
  iva: Centavos;
  alicuotas: { id: number; base: Centavos; importe: Centavos }[];
}

/** Importes del comprobante como los pide ARCA. Lanza si no cierran al centavo. */
export function importesArca(tipo: TipoFiscal, totales: TotalesComprobante): ImportesArca {
  if (tipo === "C") {
    return { total: totales.total, neto: totales.total, exento: 0, iva: 0, alicuotas: [] };
  }
  const gravados = totales.ivaPorAlicuota.filter(
    (g): g is typeof g & { alicuota: Exclude<AlicuotaIva, 0> } => g.alicuota !== 0,
  );
  const exento = totales.ivaPorAlicuota.filter((g) => g.alicuota === 0).reduce((s, g) => s + g.neto, 0);
  const neto = gravados.reduce((s, g) => s + g.neto, 0);
  const iva = gravados.reduce((s, g) => s + g.iva, 0);
  if (neto + iva + exento !== totales.total) {
    throw new Error("Los importes del comprobante no cierran: neto + IVA + exento no da el total");
  }
  return {
    total: totales.total,
    neto,
    exento,
    iva,
    alicuotas: gravados.map((g) => ({ id: ALICUOTA_ID[g.alicuota], base: g.neto, importe: g.iva })),
  };
}

/** Importe en pesos con dos decimales, como lo espera ARCA. */
export function pesos(centavos: Centavos): string {
  return (centavos / 100).toFixed(2);
}

export interface DatosQr {
  fecha: string;
  cuit: string;
  puntoVenta: number;
  codigoComprobante: number;
  numero: number;
  total: Centavos;
  clienteDocumento: string;
  cae: string;
}

/** Contenido del QR con el formato que define ARCA (JSON en base64 dentro de la URL). */
export function urlQrComprobante(d: DatosQr): string {
  const receptor = tipoDocumento(d.clienteDocumento);
  const datos = {
    ver: 1,
    fecha: fechaDe(d.fecha),
    cuit: Number(d.cuit),
    ptoVta: d.puntoVenta,
    tipoCmp: d.codigoComprobante,
    nroCmp: d.numero,
    importe: d.total / 100,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: receptor.tipo,
    nroDocRec: receptor.numero,
    tipoCodAut: "E",
    codAut: Number(d.cae),
  };
  const json = JSON.stringify(datos);
  const base64 = typeof btoa === "function" ? btoa(json) : Buffer.from(json).toString("base64");
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}
