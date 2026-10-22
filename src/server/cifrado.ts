import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado simétrico (AES-256-GCM) para guardar secretos en Firestore, como las
 * claves privadas de ARCA. Aunque alguien lea la base, sin la clave del
 * servidor no puede usarlas.
 *
 * `clave` son 32 bytes en base64 (variable ARCA_CLAVE_CIFRADO). Para generar una:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
function claveDe(base64: string): Buffer {
  const clave = Buffer.from(base64, "base64");
  if (clave.length !== 32) throw new Error("La clave de cifrado tiene que tener 32 bytes en base64");
  return clave;
}

/** Devuelve "iv.etiqueta.datos" en base64. */
export function cifrar(texto: string, clave: string): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", claveDe(clave), iv);
  const datos = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  return [iv, cifrador.getAuthTag(), datos].map((b) => b.toString("base64")).join(".");
}

export function descifrar(cifrado: string, clave: string): string {
  const [iv, etiqueta, datos] = cifrado.split(".").map((p) => Buffer.from(p, "base64"));
  const descifrador = createDecipheriv("aes-256-gcm", claveDe(clave), iv);
  descifrador.setAuthTag(etiqueta);
  return Buffer.concat([descifrador.update(datos), descifrador.final()]).toString("utf8");
}
