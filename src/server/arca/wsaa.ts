import forge from "node-forge";
import { URLS_ARCA } from "./config";
import type { Credencial } from "./credenciales";
import { campo, ErrorArca, llamarSoap, parsearXml } from "./soap";

/** Ticket de acceso de WSAA: habilita a llamar a WSFEv1 durante unas 12 horas. */
export interface Ticket {
  token: string;
  sign: string;
  /** ISO 8601. */
  vence: string;
}

const SERVICIO = "wsfe";
/** Se renueva un poco antes de que venza para no usar un ticket a punto de expirar. */
const MARGEN_MS = 10 * 60 * 1000;

function pedidoDeAcceso(ahora: Date): string {
  const desde = new Date(ahora.getTime() - 10 * 60 * 1000).toISOString();
  const hasta = new Date(ahora.getTime() + 10 * 60 * 1000).toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId><generationTime>${desde}</generationTime><expirationTime>${hasta}</expirationTime></header><service>${SERVICIO}</service></loginTicketRequest>`;
}

/** Firma el pedido como CMS (PKCS#7) con el certificado, como pide WSAA. */
export function firmar(credencial: Pick<Credencial, "certificado" | "clave">, contenido: string): string {
  const certificado = forge.pki.certificateFromPem(credencial.certificado);
  const clave = forge.pki.privateKeyFromPem(credencial.clave);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(contenido, "utf8");
  p7.addCertificate(certificado);
  p7.addSigner({
    key: clave,
    certificate: certificado,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      // Sin valor, forge completa la hora de la firma.
      { type: forge.pki.oids.signingTime },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

async function pedirTicket(credencial: Credencial): Promise<Ticket> {
  const cms = firmar(credencial, pedidoDeAcceso(new Date()));
  const sobre = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  const cuerpo = await llamarSoap(URLS_ARCA[credencial.entorno].wsaa, "", sobre);
  const ticket = parsearXml(String(campo(cuerpo, "loginCmsResponse", "loginCmsReturn") ?? ""));
  const token = campo(ticket, "loginTicketResponse", "credentials", "token");
  const sign = campo(ticket, "loginTicketResponse", "credentials", "sign");
  const vence = campo(ticket, "loginTicketResponse", "header", "expirationTime");
  if (!token || !sign || !vence) throw new ErrorArca("WSAA devolvió una respuesta inesperada");
  return { token: String(token), sign: String(sign), vence: new Date(String(vence)).toISOString() };
}

export interface AlmacenTicket {
  leer(): Promise<Ticket | undefined>;
  guardar(ticket: Ticket): Promise<unknown>;
}

/**
 * Devuelve un ticket vigente del certificado. Se guarda en Firestore porque
 * WSAA rechaza pedir otro mientras el anterior siga vigente, y cada instancia
 * del servidor arranca sin memoria.
 */
export async function obtenerTicket(credencial: Credencial, almacen: AlmacenTicket): Promise<Ticket> {
  const guardado = await almacen.leer();
  if (guardado && new Date(guardado.vence).getTime() - MARGEN_MS > Date.now()) return guardado;

  try {
    const ticket = await pedirTicket(credencial);
    await almacen.guardar(ticket);
    return ticket;
  } catch (e) {
    if (e instanceof ErrorArca && e.codigos.some((c) => c.includes("alreadyAuthenticated"))) {
      // Otra instancia lo pidió al mismo tiempo: puede que ya lo haya guardado.
      const otro = await almacen.leer();
      if (otro && new Date(otro.vence).getTime() > Date.now()) return otro;
      throw new ErrorArca(
        "ARCA ya emitió un ticket de acceso que no quedó guardado. Hay que esperar a que venza (hasta 12 horas) o usar otro certificado.",
      );
    }
    throw e;
  }
}
