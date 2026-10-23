import { URLS_ARCA, type EntornoArca } from "./config";
import { campo, ErrorArca, lista, llamarSoap, xml } from "./soap";
import type { Ticket } from "./wsaa";
import { pesos, type ImportesArca } from "@/integrations/fiscal/arca-datos";

const NS = "http://ar.gov.afip.dif.FEV1/";

/** Datos de un comprobante para FECAESolicitar, ya traducidos a códigos de ARCA. */
export interface DetalleComprobante {
  puntoVenta: number;
  codigoComprobante: number;
  numero: number;
  /** aaaammdd */
  fecha: string;
  documentoTipo: number;
  documentoNumero: number;
  condicionIvaReceptor: number;
  importes: ImportesArca;
  /** Comprobante que anula una nota de crédito. */
  asociado?: { codigoComprobante: number; puntoVenta: number; numero: number; cuit: string; fecha: string };
}

function sobre(metodo: string, ticket: Ticket, cuit: string, contenido: string): string {
  return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}"><soap:Body><ar:${metodo}><ar:Auth><ar:Token>${xml(ticket.token)}</ar:Token><ar:Sign>${xml(ticket.sign)}</ar:Sign><ar:Cuit>${xml(cuit)}</ar:Cuit></ar:Auth>${contenido}</ar:${metodo}></soap:Body></soap:Envelope>`;
}

function erroresDe(resultado: unknown): { codigos: string[]; mensaje: string } {
  const errores = [...lista(campo(resultado, "Errors", "Err")), ...lista(campo(resultado, "Observaciones", "Obs"))];
  return {
    codigos: errores.map((e) => String(e.Code ?? "")),
    mensaje: errores.map((e) => `${e.Code}: ${e.Msg}`).join(" · "),
  };
}

/**
 * Cuerpo de FECAESolicitar para un comprobante. El orden de los elementos
 * importa: es el del WSDL de WSFEv1.
 */
export function xmlSolicitudCae(d: DetalleComprobante): string {
  const i = d.importes;
  const iva =
    i.alicuotas.length > 0
      ? `<ar:Iva>${i.alicuotas
          .map((a) => `<ar:AlicIva><ar:Id>${a.id}</ar:Id><ar:BaseImp>${pesos(a.base)}</ar:BaseImp><ar:Importe>${pesos(a.importe)}</ar:Importe></ar:AlicIva>`)
          .join("")}</ar:Iva>`
      : "";
  const asociado = d.asociado
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${d.asociado.codigoComprobante}</ar:Tipo><ar:PtoVta>${d.asociado.puntoVenta}</ar:PtoVta><ar:Nro>${d.asociado.numero}</ar:Nro><ar:Cuit>${xml(d.asociado.cuit)}</ar:Cuit><ar:CbteFch>${d.asociado.fecha}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>`
    : "";
  return (
    `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${d.puntoVenta}</ar:PtoVta><ar:CbteTipo>${d.codigoComprobante}</ar:CbteTipo></ar:FeCabReq>` +
    `<ar:FeDetReq><ar:FECAEDetRequest>` +
    // Concepto 1: productos (no hace falta informar fechas de servicio).
    `<ar:Concepto>1</ar:Concepto><ar:DocTipo>${d.documentoTipo}</ar:DocTipo><ar:DocNro>${d.documentoNumero}</ar:DocNro>` +
    `<ar:CbteDesde>${d.numero}</ar:CbteDesde><ar:CbteHasta>${d.numero}</ar:CbteHasta><ar:CbteFch>${d.fecha}</ar:CbteFch>` +
    `<ar:ImpTotal>${pesos(i.total)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${pesos(i.neto)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>${pesos(i.exento)}</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${pesos(i.iva)}</ar:ImpIVA>` +
    `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${d.condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
    asociado +
    iva +
    `</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`
  );
}

export async function ultimoAutorizado(
  entorno: EntornoArca,
  ticket: Ticket,
  cuit: string,
  puntoVenta: number,
  codigoComprobante: number,
): Promise<number> {
  const cuerpo = await llamarSoap(
    URLS_ARCA[entorno].wsfe,
    `${NS}FECompUltimoAutorizado`,
    sobre("FECompUltimoAutorizado", ticket, cuit, `<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${codigoComprobante}</ar:CbteTipo>`),
  );
  const resultado = campo(cuerpo, "FECompUltimoAutorizadoResponse", "FECompUltimoAutorizadoResult");
  const numero = campo(resultado, "CbteNro");
  if (numero === undefined) {
    const { codigos, mensaje } = erroresDe(resultado);
    throw new ErrorArca(mensaje || "No se pudo consultar el último comprobante", codigos);
  }
  return Number(numero);
}

export interface Cae {
  cae: string;
  /** aaaammdd */
  vencimiento: string;
}

export async function solicitarCae(entorno: EntornoArca, ticket: Ticket, cuit: string, d: DetalleComprobante): Promise<Cae> {
  const cuerpo = await llamarSoap(
    URLS_ARCA[entorno].wsfe,
    `${NS}FECAESolicitar`,
    sobre("FECAESolicitar", ticket, cuit, xmlSolicitudCae(d)),
  );
  const resultado = campo(cuerpo, "FECAESolicitarResponse", "FECAESolicitarResult");
  const detalle = lista(campo(resultado, "FeDetResp", "FECAEDetResponse"))[0];
  if (detalle?.Resultado === "A" && detalle.CAE) {
    return { cae: String(detalle.CAE), vencimiento: String(detalle.CAEFchVto) };
  }
  const general = erroresDe(resultado);
  const propio = erroresDe(detalle);
  throw new ErrorArca(
    [general.mensaje, propio.mensaje].filter(Boolean).join(" · ") || "ARCA rechazó el comprobante",
    [...general.codigos, ...propio.codigos],
  );
}

/** Comprobante ya autorizado, según FECompConsultar. */
export interface ComprobanteAutorizado extends Cae {
  /** Importe total en pesos, como lo informa ARCA ("1234.56"). */
  total: string;
  documentoNumero: string;
  documentoTipo: string;
  fecha: string;
  neto: string;
  iva: string;
  exento: string;
}

/** Consulta un comprobante emitido. Devuelve undefined si ARCA no lo tiene registrado. */
export async function consultarComprobante(
  entorno: EntornoArca,
  ticket: Ticket,
  cuit: string,
  puntoVenta: number,
  codigoComprobante: number,
  numero: number,
): Promise<ComprobanteAutorizado | undefined> {
  const cuerpo = await llamarSoap(
    URLS_ARCA[entorno].wsfe,
    `${NS}FECompConsultar`,
    sobre(
      "FECompConsultar",
      ticket,
      cuit,
      `<ar:FeCompConsReq><ar:CbteTipo>${codigoComprobante}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${puntoVenta}</ar:PtoVta></ar:FeCompConsReq>`,
    ),
  );
  const resultado = campo(cuerpo, "FECompConsultarResponse", "FECompConsultarResult");
  const comprobante = campo(resultado, "ResultGet");
  if (comprobante && campo(comprobante, "Resultado") === "A" && campo(comprobante, "CodAutorizacion")) {
    return {
      cae: String(campo(comprobante, "CodAutorizacion")),
      vencimiento: String(campo(comprobante, "FchVto")),
      total: String(campo(comprobante, "ImpTotal")),
      documentoNumero: String(campo(comprobante, "DocNro")),
      documentoTipo: String(campo(comprobante, "DocTipo")),
      fecha: String(campo(comprobante, "CbteFch")),
      neto: String(campo(comprobante, "ImpNeto")),
      iva: String(campo(comprobante, "ImpIVA")),
      exento: String(campo(comprobante, "ImpOpEx")),
    };
  }
  const { codigos, mensaje } = erroresDe(resultado);
  // 602: no existe el comprobante.
  if (codigos.includes("602")) return undefined;
  throw new ErrorArca(mensaje || "No se pudo consultar el comprobante", codigos);
}
