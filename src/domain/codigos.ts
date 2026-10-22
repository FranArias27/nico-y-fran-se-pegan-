import type { Articulo, CodigoBarra, Milesimas } from "./types";
import { UNIDAD } from "./types";

export interface EntradaEscaner {
  /** Multiplicador tipeado antes del "*", en milésimas (1 unidad si no hay). */
  multiplicador: Milesimas;
  codigo: string;
}

/**
 * Interpreta lo que llega al campo de código: "7790001234567", "5*7790001234567"
 * o "1,5*CAB-2X1". Devuelve null si no hay código.
 */
export function parsearEntrada(texto: string): EntradaEscaner | null {
  const limpio = texto.trim();
  if (limpio === "") return null;

  const match = /^(\d+(?:[.,]\d{1,3})?)\s*\*\s*(.*)$/.exec(limpio);
  if (!match) return { multiplicador: UNIDAD, codigo: limpio };

  const multiplicador = Math.round(Number(match[1].replace(",", ".")) * 1000);
  const codigo = match[2].trim();
  if (codigo === "" || multiplicador <= 0) return null;
  return { multiplicador, codigo };
}

/** Si el texto es solo un multiplicador ("5*"), devuelve su valor en milésimas. */
export function parsearMultiplicadorPendiente(texto: string): Milesimas | null {
  const match = /^(\d+(?:[.,]\d{1,3})?)\s*\*$/.exec(texto.trim());
  if (!match) return null;
  const valor = Math.round(Number(match[1].replace(",", ".")) * 1000);
  return valor > 0 ? valor : null;
}

export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

export interface CoincidenciaCodigo {
  articulo: Articulo;
  /** Cantidad equivalente del código leído (12000 para una caja x12). */
  cantidad: Milesimas;
}

/** Índice código → artículo, incluyendo el código interno (cantidad 1). */
export function indexarCodigos(articulos: readonly Articulo[]): Map<string, CoincidenciaCodigo> {
  const indice = new Map<string, CoincidenciaCodigo>();
  for (const articulo of articulos) {
    if (!articulo.activo) continue;
    indice.set(normalizarCodigo(articulo.codigo), { articulo, cantidad: UNIDAD });
    for (const cb of articulo.codigosBarra) {
      indice.set(normalizarCodigo(cb.codigo), { articulo, cantidad: cb.cantidad });
    }
  }
  return indice;
}

export interface ConflictoCodigo {
  codigo: string;
  /** Artículo que ya tiene el código; null si está repetido en el mismo artículo. */
  articuloExistente: Pick<Articulo, "id" | "nombre"> | null;
}

/**
 * Valida que los códigos (de barra y el interno) de un artículo no estén
 * repetidos ni asignados a otro artículo.
 */
export function validarCodigos(
  articuloId: string | null,
  codigoInterno: string,
  codigosBarra: readonly CodigoBarra[],
  otros: readonly Articulo[],
): ConflictoCodigo[] {
  const conflictos: ConflictoCodigo[] = [];
  const propios = [codigoInterno, ...codigosBarra.map((c) => c.codigo)].map(normalizarCodigo);

  const vistos = new Set<string>();
  for (const codigo of propios) {
    if (codigo === "") continue;
    if (vistos.has(codigo)) conflictos.push({ codigo, articuloExistente: null });
    vistos.add(codigo);
  }

  const ajenos = new Map<string, Articulo>();
  for (const art of otros) {
    if (art.id === articuloId) continue;
    ajenos.set(normalizarCodigo(art.codigo), art);
    for (const cb of art.codigosBarra) ajenos.set(normalizarCodigo(cb.codigo), art);
  }
  for (const codigo of vistos) {
    const existente = ajenos.get(codigo);
    if (existente) {
      conflictos.push({ codigo, articuloExistente: { id: existente.id, nombre: existente.nombre } });
    }
  }
  return conflictos;
}

/** Búsqueda instantánea por nombre, marca o código. Todas las palabras deben coincidir. */
export function buscarArticulos(
  articulos: readonly Articulo[],
  consulta: string,
  limite = 20,
): Articulo[] {
  const palabras = normalizarTexto(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];

  const resultados: { art: Articulo; puntaje: number }[] = [];
  for (const art of articulos) {
    if (!art.activo) continue;
    const codigos = [art.codigo, ...art.codigosBarra.map((c) => c.codigo)].map(normalizarTexto);
    const texto = `${normalizarTexto(art.nombre)} ${normalizarTexto(art.marca)} ${codigos.join(" ")}`;
    if (!palabras.every((p) => texto.includes(p))) continue;

    let puntaje = 0;
    if (codigos.some((c) => c === palabras[0])) puntaje += 100;
    if (codigos.some((c) => c.startsWith(palabras[0]))) puntaje += 50;
    if (normalizarTexto(art.nombre).startsWith(palabras[0])) puntaje += 20;
    resultados.push({ art, puntaje });
  }

  return resultados
    .sort((a, b) => b.puntaje - a.puntaje || a.art.nombre.localeCompare(b.art.nombre, "es"))
    .slice(0, limite)
    .map((r) => r.art);
}

/** Minúsculas y sin tildes, para comparar texto. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
