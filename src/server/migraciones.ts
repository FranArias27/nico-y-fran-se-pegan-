import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { separarVenta } from "@/data/costos";
import type { LineaVenta, Venta } from "@/domain/types";
import { adminDb } from "./firebase-admin";

const POR_PAGINA = 300;

/**
 * Pasa los costos guardados antes de la separación (en los artículos y en las
 * líneas de las ventas) a las colecciones que solo leen los administradores.
 * Ver src/data/costos.ts. Se puede repetir sin problema: lo ya migrado no se toca.
 */
export async function separarCostos(empresaId: string): Promise<{ articulos: number; ventas: number }> {
  const db = adminDb();
  const base = db.doc(`empresas/${empresaId}`);
  const marca = base.collection("config").doc("migraciones");
  if ((await marca.get()).data()?.costosSeparados === true) return { articulos: 0, ventas: 0 };

  const escritor = db.bulkWriter();
  let articulos = 0;
  for (const doc of (await base.collection("articulos").get()).docs) {
    const { costo, margen } = doc.data();
    if (costo === undefined && margen === undefined) continue;
    escritor.set(base.collection("costos").doc(doc.id), { costo: costo ?? 0, margen: margen ?? 0 });
    escritor.update(doc.ref, { costo: FieldValue.delete(), margen: FieldValue.delete() });
    articulos++;
  }

  let ventas = 0;
  let ultimo: string | undefined;
  for (;;) {
    let q = base.collection("ventas").orderBy(FieldPath.documentId()).limit(POR_PAGINA);
    if (ultimo) q = q.startAfter(ultimo);
    const pagina = (await q.get()).docs;
    if (pagina.length === 0) break;
    ultimo = pagina[pagina.length - 1].id;
    for (const doc of pagina) {
      const venta = doc.data() as Venta;
      if (!venta.lineas?.some((l: Partial<LineaVenta>) => l.costoUnitario !== undefined)) continue;
      const { publica, costos } = separarVenta(venta);
      escritor.set(base.collection("ventasCostos").doc(doc.id), costos);
      escritor.update(doc.ref, { lineas: publica.lineas });
      ventas++;
    }
  }

  await escritor.close();
  await marca.set({ costosSeparados: true }, { merge: true });
  return { articulos, ventas };
}
