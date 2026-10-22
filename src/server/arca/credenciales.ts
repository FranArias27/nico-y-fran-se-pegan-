import { generateKeyPairSync } from "node:crypto";
import forge from "node-forge";
import { adminDb } from "../firebase-admin";
import { cifrar, descifrar } from "../cifrado";
import { claveCifrado, type EntornoArca } from "./config";
import type { AlmacenTicket, Ticket } from "./wsaa";

/**
 * Certificado de ARCA de cada comercio, en `arcaCredenciales/{empresaId}`.
 * Las reglas de Firestore no dejan leer esa colección desde el navegador y la
 * clave privada además se guarda cifrada. La clave se genera en el servidor y
 * nunca sale de él: el comercio solo descarga el pedido (CSR) y sube el
 * certificado que le da ARCA, que son públicos.
 */
interface DocCredencial {
  /** Certificado en uso. Sigue funcionando mientras se tramita uno nuevo. */
  activo?: {
    cuit: string;
    clave: string;
    certificado: string;
    entorno: EntornoArca;
    vence: string;
  };
  /** Pedido generado, esperando el certificado de ARCA. */
  pendiente?: {
    cuit: string;
    clave: string;
    pedido: string;
    creado: string;
  };
  ticket?: Ticket;
}

/** Lo que se puede mostrar en la app: sin claves privadas. */
export interface EstadoCredencial {
  activo?: { cuit: string; entorno: EntornoArca; vence: string };
  pendiente?: { cuit: string; creado: string; pedido: string };
}

export interface Credencial {
  cuit: string;
  certificado: string;
  clave: string;
  entorno: EntornoArca;
}

export class ErrorCertificado extends Error {}

// ---------------------------------------------------------------------------
// Funciones puras

/** Clave privada RSA y pedido de certificado (CSR) con los datos que pide ARCA. */
export function generarClaveYPedido(datos: { cuit: string; razonSocial: string }): { clave: string; pedido: string } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.publicKeyFromPem(publicKey);
  csr.setSubject([
    { shortName: "C", value: "AR" },
    // ARCA no acepta caracteres raros en el nombre: se dejan letras, números y espacios.
    { shortName: "O", value: datos.razonSocial.normalize("NFD").replace(/[^\w\s.-]/g, "").slice(0, 60) || "Comercio" },
    { shortName: "CN", value: `facturacion-${datos.cuit}` },
    { name: "serialNumber", value: `CUIT ${datos.cuit}` },
  ]);
  csr.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create());
  return { clave: privateKey, pedido: forge.pki.certificationRequestToPem(csr) };
}

/**
 * Verifica que el certificado corresponda a la clave del pedido y a la CUIT
 * del comercio, y que esté vigente. Devuelve el vencimiento (ISO).
 */
export function validarCertificado(certificadoPem: string, clavePem: string, cuit: string, ahora: Date): string {
  let certificado: forge.pki.Certificate;
  try {
    certificado = forge.pki.certificateFromPem(certificadoPem);
  } catch {
    throw new ErrorCertificado("El archivo no es un certificado válido. Subí el .crt que descargaste de ARCA.");
  }
  const publica = certificado.publicKey as forge.pki.rsa.PublicKey;
  const privada = forge.pki.privateKeyFromPem(clavePem);
  if (publica.n.toString(16) !== privada.n.toString(16)) {
    throw new ErrorCertificado("El certificado no corresponde al último pedido generado. Subí el que obtuviste con ese pedido.");
  }
  const serie = certificado.subject.attributes.find((a) => a.type === forge.pki.oids.serialNumber)?.value;
  if (typeof serie !== "string" || serie.replace(/\D/g, "") !== cuit) {
    throw new ErrorCertificado("El certificado es de otra CUIT.");
  }
  if (certificado.validity.notAfter <= ahora || certificado.validity.notBefore > ahora) {
    throw new ErrorCertificado("El certificado no está vigente.");
  }
  return certificado.validity.notAfter.toISOString();
}

// ---------------------------------------------------------------------------
// Firestore

const referencia = (empresaId: string) => adminDb().doc(`arcaCredenciales/${empresaId}`);

async function leer(empresaId: string): Promise<DocCredencial> {
  return ((await referencia(empresaId).get()).data() as DocCredencial | undefined) ?? {};
}

export async function estadoCredencial(empresaId: string): Promise<EstadoCredencial> {
  const { activo, pendiente } = await leer(empresaId);
  return {
    activo: activo && { cuit: activo.cuit, entorno: activo.entorno, vence: activo.vence },
    pendiente: pendiente && { cuit: pendiente.cuit, creado: pendiente.creado, pedido: pendiente.pedido },
  };
}

/** Genera un pedido nuevo. Si ya había un certificado activo, sigue en uso hasta cargar el nuevo. */
export async function crearPedido(empresaId: string, datos: { cuit: string; razonSocial: string }): Promise<EstadoCredencial> {
  const { clave, pedido } = generarClaveYPedido(datos);
  await referencia(empresaId).set(
    { pendiente: { cuit: datos.cuit, clave: cifrar(clave, claveCifrado()), pedido, creado: new Date().toISOString() } },
    { merge: true },
  );
  return estadoCredencial(empresaId);
}

export async function cargarCertificado(empresaId: string, certificado: string, entorno: EntornoArca): Promise<EstadoCredencial> {
  const { pendiente } = await leer(empresaId);
  if (!pendiente) throw new ErrorCertificado("Primero generá el pedido de certificado.");
  const vence = validarCertificado(certificado, descifrar(pendiente.clave, claveCifrado()), pendiente.cuit, new Date());
  await referencia(empresaId).set({
    activo: { cuit: pendiente.cuit, clave: pendiente.clave, certificado, entorno, vence },
  });
  // Copia pública del estado en el comercio: la app la usa para habilitar las facturas.
  await adminDb()
    .doc(`empresas/${empresaId}/config/comercio`)
    .set({ certificadoArca: { entorno, vence } }, { merge: true });
  return estadoCredencial(empresaId);
}

/** Certificado en uso, con la clave descifrada. Solo para hablar con ARCA. */
export async function credencialActiva(empresaId: string): Promise<Credencial | undefined> {
  const { activo } = await leer(empresaId);
  if (!activo) return undefined;
  return { ...activo, clave: descifrar(activo.clave, claveCifrado()) };
}

/** Dónde se guarda el ticket de WSAA de este comercio (se descarta al cambiar de certificado). */
export function almacenTicket(empresaId: string): AlmacenTicket {
  return {
    leer: async () => (await leer(empresaId)).ticket,
    guardar: (ticket: Ticket) => referencia(empresaId).set({ ticket }, { merge: true }),
  };
}
