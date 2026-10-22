import { ErrorConfiguracion } from "../firebase-admin";

/**
 * Cada comercio tiene su propio certificado de ARCA (ver credenciales.ts). Lo
 * único que se configura en el servidor es la clave con la que se cifran las
 * claves privadas en Firestore: ARCA_CLAVE_CIFRADO (32 bytes en base64).
 */

/** Homologación es el entorno de pruebas de ARCA: los CAE no tienen validez fiscal. */
export type EntornoArca = "homologacion" | "produccion";

export const URLS_ARCA: Record<EntornoArca, { wsaa: string; wsfe: string }> = {
  homologacion: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  },
  produccion: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  },
};

export function claveCifrado(): string {
  const clave = process.env.ARCA_CLAVE_CIFRADO;
  if (!clave) throw new ErrorConfiguracion("Falta configurar ARCA_CLAVE_CIFRADO en el servidor");
  return clave;
}
