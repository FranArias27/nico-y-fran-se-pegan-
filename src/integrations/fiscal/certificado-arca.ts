/** Estado del certificado de ARCA de un comercio, tal como lo devuelve /api/arca/certificado. */
export interface EstadoCertificado {
  activo?: { cuit: string; entorno: "homologacion" | "produccion"; vence: string };
  pendiente?: { cuit: string; creado: string; pedido: string };
}

async function pedir(token: string, init: RequestInit & { query?: string } = {}): Promise<EstadoCertificado> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api/arca/certificado${init.query ?? ""}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("Sin conexión con el servidor");
  }
  const datos = (await respuesta.json().catch(() => ({}))) as EstadoCertificado & { error?: string };
  if (!respuesta.ok) throw new Error(datos.error ?? `Error ${respuesta.status}`);
  return datos;
}

export function clienteCertificado(empresaId: string, token: () => Promise<string>) {
  return {
    estado: async () => pedir(await token(), { query: `?empresa=${encodeURIComponent(empresaId)}` }),
    generarPedido: async () =>
      pedir(await token(), { method: "POST", body: JSON.stringify({ empresaId, accion: "generar" }) }),
    cargar: async (certificado: string, entorno: "homologacion" | "produccion") =>
      pedir(await token(), { method: "POST", body: JSON.stringify({ empresaId, accion: "cargar", certificado, entorno }) }),
  };
}

/** ARCA a veces entrega el certificado en binario (DER): se pasa a PEM. */
export async function leerCertificado(archivo: File): Promise<string> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const texto = new TextDecoder().decode(bytes);
  if (texto.includes("BEGIN CERTIFICATE")) return texto;
  let binario = "";
  bytes.forEach((b) => (binario += String.fromCharCode(b)));
  const base64 = btoa(binario).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`;
}
