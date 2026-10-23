import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  type Query,
  type WriteBatch,
} from "firebase/firestore";
import { desdeFechaISO, sumarDias, type Rango } from "@/domain/fechas";
import type { Comercio, Movimiento, Recibo } from "@/domain/types";
import {
  unirArticulo,
  unirTodos,
  unirVenta,
  type ArticuloPublico,
  type CostoArticulo,
  type CostosVenta,
  type VentaPublica,
} from "../costos";
import { COLECCIONES, filasArticulo, filasIniciales, filasVenta, type Coleccion, type Fila } from "../filas";
import type { DatosIniciales, Store } from "../store";

/** Firestore admite hasta 500 escrituras por lote; dejamos margen. */
const MAXIMO_POR_LOTE = 450;

/** Firestore admite hasta 30 valores en un filtro "in". */
const MAXIMO_IN = 30;

/** Límites ISO (UTC) de un rango de fechas locales. */
function limitesISO(rango: Rango): [string, string] {
  const desde = desdeFechaISO(rango.desde).toISOString();
  const hasta = desdeFechaISO(sumarDias(rango.hasta, 1)).toISOString();
  return [desde, hasta];
}

const porFecha = <T extends { fecha: string }>(lista: T[]) => lista.sort((a, b) => a.fecha.localeCompare(b.fecha));

/**
 * Store sobre Cloud Firestore. Cada empresa tiene sus datos bajo
 * `empresas/{empresaId}/<coleccion>/<id>`; las reglas de seguridad
 * (firestore.rules) controlan quién lee y escribe cada colección.
 *
 * `transaccion()` agrupa las escrituras en un lote atómico (writeBatch). Las
 * lecturas dentro de `fn` no se bloquean, así que no hay que tomar decisiones
 * a partir de ellas: los servicios leen antes de abrir la transacción. El stock
 * se ajusta con `increment()`, que es atómico aunque vendan dos cajas a la vez.
 *
 * Las ventas, notas de crédito y pagos los registra el servidor
 * (/api/operaciones): las reglas no dejan que el navegador los escriba, salvo
 * al reiniciar una empresa de demostración.
 *
 * Con `verCostos` en false (vendedores) no se leen los costos: ver ../costos.ts.
 */
export function crearFirestoreStore(db: Firestore, empresaId: string, opciones: { verCostos: boolean }): Store {
  const col = <T = DocumentData>(nombre: Coleccion) =>
    collection(db, "empresas", empresaId, nombre) as CollectionReference<T>;
  const ref = (nombre: Coleccion, id: string) => doc(db, "empresas", empresaId, nombre, id);

  const leer = async <T>(q: Query<T> | CollectionReference<T>) => (await getDocs(q)).docs.map((d) => d.data());
  const leerUno = async <T>(nombre: Coleccion, id: string) => {
    const snap = await getDoc(ref(nombre, id));
    return snap.exists() ? (snap.data() as T) : undefined;
  };

  // --- Colecciones en memoria -------------------------------------------------
  // Mientras hay pantallas abiertas, los listeners de escucharCambios() mantienen
  // estas colecciones al día: cada cambio trae solo los documentos modificados, en
  // vez de volver a leer la colección entera (Firestore cobra cada lectura).
  type Cacheada = "config" | "categorias" | "articulos" | "costos" | "clientes" | "movimientos" | "enEspera";
  const cache = new Map<Cacheada, Map<string, DocumentData>>();
  const todos = <T>(nombre: Cacheada): Promise<T[]> => {
    const enMemoria = cache.get(nombre);
    return enMemoria ? Promise.resolve([...enMemoria.values()] as T[]) : leer(col<T>(nombre));
  };
  const uno = <T>(nombre: Coleccion, id: string): Promise<T | undefined> => {
    const enMemoria = cache.get(nombre as Cacheada);
    return enMemoria ? Promise.resolve(enMemoria.get(id) as T | undefined) : leerUno<T>(nombre, id);
  };

  // --- Costos (solo administradores) ----------------------------------------
  type ColeccionCostos = "costos" | "ventasCostos";
  const porId = <C>(docs: { id: string; data: () => DocumentData }[]) => new Map(docs.map((d) => [d.id, d.data() as C]));

  async function costosDe<C>(nombre: ColeccionCostos, q?: Query): Promise<Map<string, C>> {
    if (!opciones.verCostos) return new Map();
    const enMemoria = !q && cache.get(nombre as Cacheada);
    if (enMemoria) return enMemoria as Map<string, C>;
    return porId<C>((await getDocs(q ?? col(nombre))).docs);
  }

  async function costosPorIds<C>(nombre: ColeccionCostos, ids: string[]): Promise<Map<string, C>> {
    if (!opciones.verCostos || ids.length === 0) return new Map();
    const grupos: string[][] = [];
    for (let i = 0; i < ids.length; i += MAXIMO_IN) grupos.push(ids.slice(i, i + MAXIMO_IN));
    const snaps = await Promise.all(grupos.map((g) => getDocs(query(col(nombre), where(documentId(), "in", g)))));
    return porId<C>(snaps.flatMap((s) => s.docs));
  }

  const costoDe = <C>(nombre: ColeccionCostos, id: string) =>
    opciones.verCostos ? uno<C>(nombre, id) : Promise.resolve(undefined);

  async function leerVentas(q: Query<VentaPublica>, qCostos?: Query) {
    const publicas = await leer(q);
    const costos = qCostos
      ? await costosDe<CostosVenta>("ventasCostos", qCostos)
      : await costosPorIds<CostosVenta>("ventasCostos", publicas.map((v) => v.id));
    return unirTodos(publicas, costos, unirVenta);
  }

  const escribirFila = (b: WriteBatch, [nombre, id, datos]: Fila) => b.set(ref(nombre, id), datos);

  // --- Notificaciones -------------------------------------------------------
  const oyentes = new Set<() => void>();
  let pendiente = false;
  let desuscribir: (() => void) | null = null;

  function notificar() {
    if (pendiente) return;
    pendiente = true;
    queueMicrotask(() => {
      pendiente = false;
      for (const oyente of oyentes) oyente();
    });
  }

  /**
   * Escucha catálogo y datos maestros. El historial no mantiene listeners:
   * un documento de versión avisa cuando el servidor termina una operación.
   */
  function escucharCambios() {
    const cacheadas: Cacheada[] = ["config", "categorias", "articulos", "clientes", "enEspera"];
    if (opciones.verCostos) cacheadas.push("costos");
    const bajas = cacheadas.map((nombre) => {
      let primera = true;
      return onSnapshot(col(nombre), { includeMetadataChanges: true }, (snap) => {
        // Lo que viene de la caché del navegador puede estar incompleto hasta que confirma el servidor.
        if (!snap.metadata.fromCache || cache.has(nombre)) {
          cache.set(nombre, new Map(snap.docs.map((d) => [d.id, d.data()])));
        }
        if (primera) primera = false;
        else if (snap.docChanges().length > 0) notificar();
      });
    });
    bajas.push(onSnapshot(doc(db, "empresas", empresaId, "control", "cambios"), () => {
      notificar();
    }));
    return () => {
      bajas.forEach((baja) => baja());
      cache.clear();
    };
  }

  // --- Escrituras -----------------------------------------------------------
  let lote: WriteBatch | null = null;
  let cola: Promise<unknown> = Promise.resolve();

  /** Dentro de una transacción la escritura se suma al lote; si no, se confirma sola. */
  async function escribir(aplicar: (b: WriteBatch) => void) {
    if (lote) {
      aplicar(lote);
      return;
    }
    const b = writeBatch(db);
    aplicar(b);
    await b.commit();
    notificar();
  }

  async function escribirVarios<T>(items: T[], aplicar: (b: WriteBatch, item: T) => void) {
    if (lote) {
      const actual = lote;
      items.forEach((item) => aplicar(actual, item));
      return;
    }
    for (let i = 0; i < items.length; i += MAXIMO_POR_LOTE) {
      const b = writeBatch(db);
      items.slice(i, i + MAXIMO_POR_LOTE).forEach((item) => aplicar(b, item));
      await b.commit();
    }
    notificar();
  }

  async function vaciar(nombre: Coleccion) {
    const docs = (await getDocs(col(nombre))).docs;
    await escribirVarios(docs, (b, d) => b.delete(d.ref));
  }

  return {
    comercio: {
      async obtener() {
        const comercio = await uno<Comercio>("config", "comercio");
        if (!comercio) throw new Error("No hay datos del comercio cargados");
        return comercio;
      },
      // Con merge, para no pisar los campos que escribe el servidor (certificadoArca).
      guardar: (comercio) => escribir((b) => b.set(ref("config", "comercio"), comercio, { merge: true })),
    },

    categorias: {
      listar: () => todos("categorias"),
    },

    articulos: {
      async listar() {
        const [publicos, costos] = await Promise.all([
          todos<ArticuloPublico>("articulos"),
          costosDe<CostoArticulo>("costos"),
        ]);
        return unirTodos(publicos, costos, unirArticulo);
      },
      async obtener(id) {
        const [publico, costo] = await Promise.all([
          uno<ArticuloPublico>("articulos", id),
          costoDe<CostoArticulo>("costos", id),
        ]);
        return publico && unirArticulo(publico, costo);
      },
      guardar: (a) => escribirVarios(filasArticulo(a), escribirFila),
      guardarVarios: (as) => escribirVarios(as.flatMap(filasArticulo), escribirFila),
      ajustarStock: (id, delta) => escribir((b) => b.update(ref("articulos", id), { stock: increment(delta) })),
    },

    clientes: {
      listar: () => todos("clientes"),
      obtener: (id) => uno("clientes", id),
      guardar: (c) => escribir((b) => b.set(ref("clientes", c.id), c)),
    },

    ventas: {
      async listar(rango) {
        const ventas = col<VentaPublica>("ventas");
        if (!rango) return leerVentas(query(ventas, orderBy("fecha")), col("ventasCostos"));
        const [desde, hasta] = limitesISO(rango);
        const enRango = <T>(c: CollectionReference<T>) =>
          query(c, where("fecha", ">=", desde), where("fecha", "<", hasta));
        return leerVentas(query(enRango(ventas), orderBy("fecha")), enRango(col("ventasCostos")));
      },
      listarPorCliente: async (clienteId) =>
        porFecha(
          await leerVentas(
            query(col<VentaPublica>("ventas"), where("clienteId", "==", clienteId)),
            query(col("ventasCostos"), where("clienteId", "==", clienteId)),
          ),
        ),
      listarNotasDe: async (ventaId) =>
        porFecha(await leerVentas(query(col<VentaPublica>("ventas"), where("asociado.ventaId", "==", ventaId)))),
      async obtener(id) {
        const [publica, costos] = await Promise.all([
          leerUno<VentaPublica>("ventas", id),
          costoDe<CostosVenta>("ventasCostos", id),
        ]);
        return publica && unirVenta(publica, costos);
      },
      agregar: (v) => escribirVarios(filasVenta(v), escribirFila),
    },

    movimientos: {
      listar: () => todos("movimientos"),
      async listarPorCliente(clienteId) {
        const enMemoria = cache.get("movimientos");
        const movimientos = enMemoria
          ? ([...enMemoria.values()] as Movimiento[]).filter((m) => m.clienteId === clienteId)
          : await leer(query(col<Movimiento>("movimientos"), where("clienteId", "==", clienteId)));
        return porFecha(movimientos);
      },
      guardar: (m) => escribir((b) => b.set(ref("movimientos", m.id), m)),
      guardarVarios: (ms) => escribirVarios(ms, (b, m) => b.set(ref("movimientos", m.id), m)),
    },

    recibos: {
      listarPorCliente: (clienteId) => leer(query(col<Recibo>("recibos"), where("clienteId", "==", clienteId))),
      obtener: (id) => leerUno("recibos", id),
      agregar: (r) => escribir((b) => b.set(ref("recibos", r.id), r)),
    },

    enEspera: {
      listar: () => todos("enEspera"),
      guardar: (v) => escribir((b) => b.set(ref("enEspera", v.id), v)),
      eliminar: (id) => escribir((b) => b.delete(ref("enEspera", id))),
    },

    contadores: {
      // Transacción del servidor: dos cajas nunca reciben el mismo número.
      // Necesita conexión; sin internet la venta falla en vez de duplicar numeración.
      siguiente: (clave) =>
        runTransaction(db, async (tx) => {
          const r = ref("contadores", clave);
          const actual = ((await tx.get(r)).data()?.ultimo as number | undefined) ?? 0;
          tx.set(r, { clave, ultimo: actual + 1 });
          return actual + 1;
        }),
    },

    transaccion<T>(fn: () => Promise<T>): Promise<T> {
      // Se encolan para que dos transacciones no compartan el mismo lote.
      const resultado = cola.then(async () => {
        lote = writeBatch(db);
        try {
          const valor = await fn();
          await lote.commit();
          return valor;
        } finally {
          lote = null;
        }
      });
      cola = resultado.catch(() => {});
      return resultado.then((valor) => {
        notificar();
        return valor;
      });
    },

    async estaVacio() {
      return (await leerUno("config", "comercio")) === undefined;
    },

    /**
     * Borra todo y carga los datos indicados. Con muchos documentos no entra en
     * un solo lote, así que no es atómico: si se corta a mitad, repetirlo. Se usa
     * para crear una empresa nueva (pocos datos); el reinicio de una demo, con
     * miles de ventas, lo hace el servidor (/api/demo), que es mucho más rápido.
     */
    async reemplazarTodo(datos: DatosIniciales) {
      for (const nombre of COLECCIONES) await vaciar(nombre);
      await escribirVarios(filasIniciales(datos), escribirFila);
      // El comercio va al final: mientras no exista, la empresa figura como vacía.
      await escribir((b) => b.set(ref("config", "comercio"), datos.comercio));
    },

    alCambiar(callback) {
      oyentes.add(callback);
      desuscribir ??= escucharCambios();
      return () => {
        oyentes.delete(callback);
        if (oyentes.size === 0 && desuscribir) {
          desuscribir();
          desuscribir = null;
        }
      };
    },
  };
}
