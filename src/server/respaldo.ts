import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { COLECCIONES } from "@/data/filas";

export const COLECCIONES_RESPALDO = [
  ...COLECCIONES,
  "operaciones",
  "caja",
  "cajas",
  "cajaMovimientos",
  "proveedores",
  "compras",
  "pagosProveedores",
  "inventarioMovimientos",
  "gestionRegistros",
  "carteraResumen",
] as const;
export interface DocumentoRespaldo {
  coleccion: string;
  id: string;
  datos: Record<string, unknown>;
}
export interface Respaldo {
  version: 1;
  empresaId: string;
  demo: boolean;
  creado: string;
  documentos: DocumentoRespaldo[];
  sha256: string;
}
const checksum = (datos: Omit<Respaldo, "sha256">) => createHash("sha256").update(JSON.stringify(datos)).digest("hex");

export function crearRespaldo(empresaId: string, documentos: DocumentoRespaldo[], demo = false): Respaldo {
  const datos = { version: 1 as const, empresaId, demo, creado: new Date().toISOString(), documentos };
  return { ...datos, sha256: checksum(datos) };
}

export function validarRespaldo(valor: unknown): Respaldo {
  if (!valor || typeof valor !== "object") throw new Error("Respaldo inválido");
  const r = valor as Respaldo;
  if (
    r.version !== 1 ||
    typeof r.demo !== "boolean" ||
    !/^[a-z0-9-]{1,60}$/.test(r.empresaId) ||
    !Number.isFinite(Date.parse(r.creado)) ||
    !Array.isArray(r.documentos)
  )
    throw new Error("Formato de respaldo incompatible");
  const { sha256, ...datos } = r;
  if (checksum(datos) !== sha256) throw new Error("El respaldo está incompleto o fue modificado (SHA-256)");
  const ids = new Set<string>();
  for (const d of r.documentos) {
    if (
      !COLECCIONES_RESPALDO.includes(d.coleccion as (typeof COLECCIONES_RESPALDO)[number]) ||
      typeof d.id !== "string" ||
      !d.id ||
      /\//.test(d.id) ||
      d.id === "." ||
      d.id === ".." ||
      !d.datos ||
      typeof d.datos !== "object" ||
      Array.isArray(d.datos)
    )
      throw new Error("Documento de respaldo inválido");
    const clave = `${d.coleccion}/${d.id}`;
    if (ids.has(clave)) throw new Error("El respaldo contiene documentos repetidos");
    ids.add(clave);
  }
  if (!ids.has("config/comercio")) throw new Error("Faltan los datos del comercio");
  return r;
}

/** Snapshot consistente: todas las consultas comparten el readTime de la transacción. */
export async function respaldarEmpresa(db: Firestore, empresa: string): Promise<Respaldo> {
  const snapshot = await db.runTransaction(
    async (tx) => {
      const compania = await tx.get(db.doc(`empresas/${empresa}`));
      if (!compania.exists || compania.data()?.restaurando)
        throw new Error("La empresa no está disponible para respaldo");
      const lock = await tx.get(db.doc(`empresas/${empresa}/control/escritura`));
      if (lock.data()?.id) throw new Error("Hay una operación pendiente. Reconciliar antes de respaldar.");
      const filas: DocumentoRespaldo[] = [];
      for (const coleccion of COLECCIONES_RESPALDO) {
        const snap = await tx.get(db.collection(`empresas/${empresa}/${coleccion}`));
        for (const doc of snap.docs) filas.push({ coleccion, id: doc.id, datos: doc.data() });
      }
      return { documentos: filas, demo: compania.data()?.demo === true };
    },
    { readOnly: true },
  );
  return crearRespaldo(empresa, snapshot.documentos, snapshot.demo);
}

/** Solo destinos vacíos, bloqueados durante la copia; repetir el mismo archivo retoma un fallo. */
export async function restaurarEmpresa(db: Firestore, destino: string, valor: unknown) {
  if (!/^[a-z0-9-]{1,60}$/.test(destino)) throw new Error("Empresa destino inválida");
  const respaldo = validarRespaldo(valor);
  if (destino === respaldo.empresaId) throw new Error("Restaurá en una empresa nueva para preservar el original");
  const base = db.doc(`empresas/${destino}`);
  const token = randomUUID();
  await db.runTransaction(async (tx) => {
    const empresa = (await tx.get(base)).data();
    if (!empresa) throw new Error("Primero creá la empresa destino en Administración, sin ingresar a ella");
    if ((empresa.demo === true) !== respaldo.demo)
      throw new Error("El tipo real/demo del destino no coincide con el respaldo");
    if (empresa.restauracionHash && empresa.restauracionHash !== respaldo.sha256)
      throw new Error("El destino tiene otra restauración");
    if (empresa.restauracionHash && !empresa.restaurando)
      throw new Error("La restauración ya terminó. Usá otro destino vacío");
    if (empresa.restauracionToken && Date.now() - Number(empresa.restauracionTomada) < 600_000)
      throw new Error("Ya hay una recuperación en curso");
    if (!empresa.restauracionHash) {
      for (const c of COLECCIONES_RESPALDO) {
        if (!(await tx.get(base.collection(c).limit(1))).empty)
          throw new Error("El destino debe estar completamente vacío");
      }
    }
    tx.update(base, {
      restaurando: true,
      restauracionHash: respaldo.sha256,
      restauracionToken: token,
      restauracionTomada: Date.now(),
      activa: false,
    });
  });
  try {
    // Lotes idempotentes. El mantenimiento no se levanta ante un error.
    for (let i = 0; i < respaldo.documentos.length; i += 400) {
      await db.runTransaction(async (lote) => {
        if ((await lote.get(base)).data()?.restauracionToken !== token)
          throw new Error("Otro proceso retomó la recuperación");
        for (const d of respaldo.documentos.slice(i, i + 400)) {
          const datos = { ...d.datos };
          if (d.coleccion === "config" && d.id === "comercio") delete datos.certificadoArca;
          lote.set(base.collection(d.coleccion).doc(d.id), datos);
        }
      });
    }
    // Verificar lo escrito antes de permitir el acceso.
    for (const c of COLECCIONES_RESPALDO) {
      const esperados = respaldo.documentos.filter((d) => d.coleccion === c);
      const actuales = await base.collection(c).get();
      if (actuales.size !== esperados.length) throw new Error(`Falló la verificación de ${c}`);
      const mapa = new Map(actuales.docs.map((d) => [d.id, d.data()]));
      for (const d of esperados) {
        const esperado = { ...d.datos };
        if (c === "config" && d.id === "comercio") delete esperado.certificadoArca;
        // Firestore puede reordenar las claves: comparar en forma canónica.
        if (canonico(mapa.get(d.id)) !== canonico(esperado)) throw new Error(`Contenido diferente: ${c}/${d.id}`);
      }
    }
    await db.runTransaction(async (tx) => {
      if ((await tx.get(base)).data()?.restauracionToken !== token)
        throw new Error("Otro proceso retomó la recuperación");
      tx.update(base, { restaurando: false, restauracionToken: null, restauradaEn: new Date().toISOString() });
    });
    return { documentos: respaldo.documentos.length, destino, activa: false };
  } catch (error) {
    await db
      .runTransaction(async (tx) => {
        if ((await tx.get(base)).data()?.restauracionToken === token) tx.update(base, { restauracionToken: null });
      })
      .catch(console.error);
    throw error;
  }
}

function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, valor]) => `${JSON.stringify(k)}:${canonico(valor)}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
