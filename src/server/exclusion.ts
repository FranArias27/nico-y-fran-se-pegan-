import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { ErrorPedido } from "./acceso";

export function huella(valor: unknown): string {
  const normalizado = JSON.stringify(valor, (_clave, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
  return createHash("sha256").update(normalizado).digest("hex");
}

export interface Exclusion {
  verificar(tx: Transaction): Promise<void>;
  proteger(): void;
  desproteger(): void;
  guardar(datos: Record<string, unknown>): Promise<void>;
  datos: Record<string, unknown>;
}

/**
 * Exclusión distribuida por empresa, también durante las llamadas externas.
 * Otro id nunca roba un trabajo abandonado: se reanuda el mismo pedido.
 * El token evita que un proceso anterior confirme después de un reintento.
 * Las operaciones fiscales inciertas conservan el bloqueo hasta reconciliarse.
 */
export async function conExclusion<T>(
  db: Firestore,
  empresa: string,
  id: string,
  uid: string,
  pedido: unknown,
  ejecutar: (exclusion: Exclusion) => Promise<T>,
): Promise<T> {
  const control = db.doc(`empresas/${empresa}/control/escritura`);
  const operacion = db.doc(`empresas/${empresa}/operaciones/${id}`);
  const token = randomUUID();
  const firma = huella(pedido);
  const tomada = await db.runTransaction(async (tx) => {
    const [lock, op, compania] = await tx.getAll(control, operacion, db.doc(`empresas/${empresa}`));
    if (compania.data()?.restaurando) throw new ErrorPedido("La empresa está en recuperación", 409);
    const datos = op.data();
    if (datos && (datos.uid !== uid || datos.huella !== firma)) {
      throw new ErrorPedido("Ese identificador ya corresponde a otro pedido", 409);
    }
    if (datos?.completada) return { resultado: datos.resultado as T, completa: true as const };
    const ocupada = lock.data();
    if (ocupada?.id && (ocupada.id !== id || Date.now() - ocupada.tomada < 120_000)) {
      throw new ErrorPedido(
        `Hay una operación en curso (${ocupada.id}). Reintentá ese pedido antes de continuar.`,
        409,
        ocupada.id === id,
      );
    }
    tx.set(control, { id, token, tomada: Date.now() });
    // Las planillas se reenvían por archivo; no duplicar miles de filas en un documento de 1 MiB.
    const persistido =
      pedido && typeof pedido === "object" && "filas" in pedido ? { accion: "importar", huella: firma } : pedido;
    tx.set(operacion, { uid, huella: firma, pedido: persistido, creada: new Date().toISOString() }, { merge: true });
    return { completa: false as const, datos: datos ?? {} };
  });
  if (tomada.completa) return tomada.resultado;
  let protegida = tomada.datos.protegida === true;
  async function verificar(tx: Transaction) {
    const snap = await tx.get(control);
    if (snap.data()?.token !== token) throw new ErrorPedido("Otro intento retomó esta operación", 409);
  }
  const exclusion: Exclusion = {
    datos: tomada.datos,
    verificar,
    proteger: () => {
      protegida = true;
    },
    desproteger: () => {
      protegida = false;
    },
    guardar: (datos) =>
      db.runTransaction(async (tx) => {
        await verificar(tx);
        tx.set(operacion, datos, { merge: true });
        Object.assign(exclusion.datos, datos);
      }),
  };
  try {
    const resultado = await ejecutar(exclusion);
    await db.runTransaction(async (tx) => {
      await verificar(tx);
      tx.set(operacion, { completada: true, resultado, terminada: new Date().toISOString() }, { merge: true });
      tx.set(control, { id: null, token: null, tomada: 0 });
      tx.set(db.doc(`empresas/${empresa}/control/cambios`), { version: FieldValue.increment(1) }, { merge: true });
    });
    return resultado;
  } catch (error) {
    if (error instanceof Error) Object.assign(error, { pendiente: protegida });
    await db
      .runTransaction(async (tx) => {
        await verificar(tx);
        tx.set(
          operacion,
          { error: error instanceof Error ? error.message : String(error), protegida },
          { merge: true },
        );
        // Un CAE o una respuesta incierta requieren reconciliación, nunca otro id.
        tx.set(control, protegida ? { id, token, tomada: 0 } : { id: null, token: null, tomada: 0 });
      })
      .catch(console.error);
    throw error;
  }
}
