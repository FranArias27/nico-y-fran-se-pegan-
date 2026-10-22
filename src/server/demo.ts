import { filasIniciales } from "@/data/filas";
import { generarDatosDemo } from "@/data/seed/generar";
import { adminDb } from "./firebase-admin";

/**
 * Borra los datos de una empresa de demostración y vuelve a cargar los de
 * ejemplo (miles de ventas). Con el Admin SDK las escrituras van en paralelo y
 * sin evaluar reglas por documento: tarda segundos, contra minutos desde el
 * navegador. Validar antes que la empresa sea demo y el usuario, administrador.
 */
export async function reiniciarDemo(empresaId: string, ahora: Date): Promise<void> {
  const db = adminDb();
  const base = db.doc(`empresas/${empresaId}`);
  const comercio = base.collection("config").doc("comercio");
  // Sin límite de velocidad: son pocos miles de documentos de una sola empresa.
  const escritor = db.bulkWriter({ throttling: false });

  // Primero el comercio: mientras no existe, la app muestra la empresa como vacía y no usa datos a medias.
  await comercio.delete();
  for (const coleccion of await base.listCollections()) await db.recursiveDelete(coleccion, escritor);
  // Los ids de ejemplo se repiten en cada reinicio: los borrados tienen que terminar antes de escribir.
  await escritor.flush();

  const datos = generarDatosDemo(ahora);
  // Si alguna escritura falla, el comercio no se crea y el error llega a quien reinició.
  const escrituras = Promise.all(
    filasIniciales(datos).map(([coleccion, id, valores]) => escritor.set(base.collection(coleccion).doc(id), valores)),
  );
  await escritor.close();
  await escrituras;
  await comercio.set(datos.comercio);
}
