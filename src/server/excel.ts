import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { separarArticulo } from "@/data/costos";
import { calcularPrecios, precioDesdeMargen } from "@/domain/precios";
import type { AlicuotaIva, Articulo, UnidadMedida } from "@/domain/types";
import { enteroSeguro } from "@/domain/gestion";
import { normalizarCodigo } from "@/domain/codigos";
import { conExclusion } from "./exclusion";
import { crearStoreAdmin } from "./store-admin";
import type { Firestore } from "firebase-admin/firestore";

export const COLUMNAS = [
  "codigo",
  "nombre",
  "marca",
  "categoriaId",
  "unidad",
  "costo",
  "margen",
  "iva",
  "stock",
  "stockMinimo",
  "codigoBarra",
];

/** Valores de Excel en pesos/unidades/porcentaje; internamente enteros. */
export function articuloDeFila(fila: Record<string, unknown>, categorias: Set<string>, anterior?: Articulo): Articulo {
  const texto = (k: string) => String(fila[k] ?? "").trim();
  const numero = (k: string, factor: number, negativo = false) => {
    const valor = fila[k];
    if (valor === "" || valor === undefined || valor === null || typeof valor === "boolean")
      throw new Error(`Falta ${k}`);
    const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
    if (!Number.isFinite(n)) throw new Error(`${k} no es un número válido`);
    return enteroSeguro(Math.round(n * factor), negativo ? -1e12 : 0);
  };
  const codigo = texto("codigo"),
    nombre = texto("nombre"),
    categoriaId = texto("categoriaId");
  if (!codigo || codigo.length > 100 || !nombre || nombre.length > 200) throw new Error("Código o nombre inválido");
  if (!categorias.has(categoriaId)) throw new Error(`Categoría desconocida: ${categoriaId}`);
  const unidad = texto("unidad") as UnidadMedida;
  if (!["unidad", "metro", "kg"].includes(unidad)) throw new Error("Unidad inválida");
  const costo = numero("costo", 100),
    margen = numero("margen", 100),
    iva = numero("iva", 100) as AlicuotaIva;
  if (![0, 1050, 2100, 2700].includes(iva)) throw new Error("IVA inválido: usar 0, 10.5, 21 o 27");
  const codigoBarra = texto("codigoBarra");
  return {
    id: anterior?.id ?? randomUUID(),
    codigo,
    nombre,
    marca: texto("marca"),
    categoriaId,
    unidad,
    costo,
    margen,
    alicuotaIva: iva,
    redondeo: anterior?.redondeo ?? "ninguno",
    ...calcularPrecios(precioDesdeMargen(costo, margen), iva, anterior?.redondeo ?? "ninguno"),
    // El stock existente se ajusta únicamente mediante inventario o compras.
    stock: anterior?.stock ?? numero("stock", 1000, true),
    stockMinimo: numero("stockMinimo", 1000),
    codigosBarra:
      codigoBarra && codigoBarra !== anterior?.codigosBarra[0]?.codigo
        ? [{ codigo: codigoBarra, cantidad: 1000 }, ...(anterior?.codigosBarra.slice(1) ?? [])]
        : (anterior?.codigosBarra ?? (codigoBarra ? [{ codigo: codigoBarra, cantidad: 1000 }] : [])),
    activo: anterior?.activo ?? true,
    actualizadoEn: new Date().toISOString(),
  };
}

export async function leerExcel(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  if (buffer.byteLength > 3_000_000) throw new Error("El Excel supera 3 MB; dividilo en archivos más pequeños");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  const hoja = libro.worksheets[0];
  if (!hoja || hoja.rowCount > 5001 || hoja.columnCount > 30)
    throw new Error("La planilla admite hasta 5.000 filas y 30 columnas");
  const cabecera = hoja.getRow(1).values as unknown[];
  if (!COLUMNAS.every((c, i) => cabecera[i + 1] === c))
    throw new Error("Las columnas no coinciden. Descargá la plantilla.");
  const filas: Record<string, unknown>[] = [];
  hoja.eachRow((row, i) => {
    if (i === 1) return;
    const fila: Record<string, unknown> = {};
    COLUMNAS.forEach((k, j) => {
      const valor = row.getCell(j + 1).value;
      if (valor !== null && typeof valor === "object") throw new Error(`Fila ${i}: no se admiten fórmulas ni enlaces`);
      fila[k] = valor;
    });
    filas.push(fila);
  });
  if (!filas.length) throw new Error("La planilla está vacía");
  return filas;
}

export async function prepararImportacion(db: Firestore, empresa: string, filas: Record<string, unknown>[]) {
  const store = crearStoreAdmin(db, empresa);
  const [existentes, categorias] = await Promise.all([store.articulos.listar(), store.categorias.listar()]);
  const porCodigo = new Map(existentes.map((a) => [normalizarCodigo(a.codigo), a]));
  const candidatos: Articulo[] = [],
    errores: string[] = [],
    repetidos = new Set<string>();
  filas.forEach((fila, i) => {
    try {
      const codigo = normalizarCodigo(String(fila.codigo ?? ""));
      if (repetidos.has(codigo)) throw new Error("Código repetido en la planilla");
      repetidos.add(codigo);
      candidatos.push(articuloDeFila(fila, new Set(categorias.map((c) => c.id)), porCodigo.get(codigo)));
    } catch (e) {
      errores.push(`Fila ${i + 2}: ${e instanceof Error ? e.message : "Dato inválido"}`);
    }
  });
  const final = new Map(existentes.map((a) => [a.id, a]));
  candidatos.forEach((a) => final.set(a.id, a));
  const codigos = new Map<string, string>();
  for (const a of final.values()) {
    for (const codigo of [a.codigo, ...a.codigosBarra.map((c) => c.codigo)]) {
      const normalizado = normalizarCodigo(codigo);
      if (codigos.has(normalizado) && codigos.get(normalizado) !== a.id)
        errores.push(`Código en más de un artículo: ${codigo}`);
      codigos.set(normalizado, a.id);
    }
  }
  return {
    candidatos,
    errores,
    nuevos: candidatos.filter((a) => !porCodigo.has(normalizarCodigo(a.codigo))).length,
    actualizados: candidatos.filter((a) => porCodigo.has(normalizarCodigo(a.codigo))).length,
  };
}

export async function importarExcel(
  db: Firestore,
  empresa: string,
  uid: string,
  id: string,
  filas: Record<string, unknown>[],
) {
  return conExclusion(db, empresa, id, uid, { accion: "importar", filas }, async (exclusion) => {
    const preparada = await prepararImportacion(db, empresa, filas);
    if (preparada.errores.length) throw new Error(preparada.errores.slice(0, 20).join(" · "));
    // Un lote por bloque, con cursor durable; el mismo id retoma una importación interrumpida.
    exclusion.proteger();
    await exclusion.guardar({ protegida: true });
    const cursor = Number(exclusion.datos.cursor ?? 0);
    for (let i = cursor; i < preparada.candidatos.length; i += 150) {
      await db.runTransaction(async (tx) => {
        await exclusion.verificar(tx);
        for (const a of preparada.candidatos.slice(i, i + 150)) {
          const { publico, costo } = separarArticulo(a);
          tx.set(db.doc(`empresas/${empresa}/articulos/${a.id}`), publico);
          tx.set(db.doc(`empresas/${empresa}/costos/${a.id}`), costo);
        }
        tx.set(db.doc(`empresas/${empresa}/operaciones/${id}`), { cursor: i + 150 }, { merge: true });
      });
    }
    await db.doc(`empresas/${empresa}/control/cambios`).set({ version: Date.now() });
    return { importados: preparada.candidatos.length };
  });
}

export async function generarExcel(db: Firestore, empresa: string, plantilla: boolean) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Articulos");
  hoja.addRow(COLUMNAS);
  hoja.getRow(1).font = { bold: true };
  hoja.columns.forEach((c) => {
    c.width = 20;
  });
  if (!plantilla) {
    for (const a of await crearStoreAdmin(db, empresa).articulos.listar())
      hoja.addRow([
        a.codigo,
        a.nombre,
        a.marca,
        a.categoriaId,
        a.unidad,
        a.costo / 100,
        a.margen / 100,
        a.alicuotaIva / 100,
        a.stock / 1000,
        a.stockMinimo / 1000,
        a.codigosBarra[0]?.codigo ?? "",
      ]);
  }
  const categorias = libro.addWorksheet("Categorias");
  categorias.addRow(["id", "nombre"]);
  for (const c of await crearStoreAdmin(db, empresa).categorias.listar()) categorias.addRow([c.id, c.nombre]);
  return new Uint8Array(await libro.xlsx.writeBuffer());
}
