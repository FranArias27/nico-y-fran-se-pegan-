import { XMLParser } from "fast-xml-parser";

// Valores como texto: el CAE tiene 14 dígitos y los importes no deben pasar por float.
const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false });

export function parsearXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

/** Escapa texto para meterlo dentro de un elemento XML. */
export function xml(texto: string | number): string {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Lee un camino de propiedades del XML parseado sin romper si falta alguna. */
export function campo(objeto: unknown, ...camino: string[]): unknown {
  let actual = objeto;
  for (const clave of camino) {
    if (actual === null || typeof actual !== "object") return undefined;
    actual = (actual as Record<string, unknown>)[clave];
  }
  return actual;
}

/** Los nodos que se repiten llegan como arreglo; si hay uno solo, como objeto. */
export function lista(valor: unknown): Record<string, unknown>[] {
  if (valor === undefined || valor === null || valor === "") return [];
  return (Array.isArray(valor) ? valor : [valor]) as Record<string, unknown>[];
}

export class ErrorArca extends Error {
  constructor(
    mensaje: string,
    readonly codigos: string[] = [],
  ) {
    super(mensaje);
    this.name = "ErrorArca";
  }
}

/** Envía un sobre SOAP y devuelve el Body parseado. Lanza ErrorArca si viene un Fault. */
export async function llamarSoap(url: string, accion: string, sobre: string): Promise<unknown> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: accion },
      body: sobre,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ErrorArca("No se pudo conectar con ARCA. Probá de nuevo en unos minutos.");
  }
  const cuerpo = campo(parsearXml(await respuesta.text()), "Envelope", "Body");
  const falla = campo(cuerpo, "Fault");
  if (falla) {
    const codigo = String(campo(falla, "faultcode") ?? "");
    throw new ErrorArca(String(campo(falla, "faultstring") ?? "Error de ARCA"), [codigo]);
  }
  if (!respuesta.ok || !cuerpo) throw new ErrorArca(`ARCA respondió con un error (${respuesta.status})`);
  return cuerpo;
}
