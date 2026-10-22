import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
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
import type { Comercio } from "@/domain/types";
import type { DatosIniciales, Store } from "../store";

/** Firestore admite hasta 500 escrituras por lote; dejamos margen. */
const MAXIMO_POR_LOTE = 450;

const COLECCIONES = [
  "config",
  "categorias",
  "articulos",
  "clientes",
  "ventas",
  "movimientos",
  "recibos",
  "enEspera",
  "contadores",
] as const;

type Coleccion = (typeof COLECCIONES)[number];

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
 */
export function crearFirestoreStore(db: Firestore, empresaId: string): Store {
  const col = <T = DocumentData>(nombre: Coleccion) =>
    collection(db, "empresas", empresaId, nombre) as CollectionReference<T>;
  const ref = (nombre: Coleccion, id: string) => doc(db, "empresas", empresaId, nombre, id);

  const leer = async <T>(q: Query<T> | CollectionReference<T>) => (await getDocs(q)).docs.map((d) => d.data());
  const leerUno = async <T>(nombre: Coleccion, id: string) => {
    const snap = await getDoc(ref(nombre, id));
    return snap.exists() ? (snap.data() as T) : undefined;
  };

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
   * Escucha los cambios hechos desde otros dispositivos. Para no descargar
   * todo el historial, de las ventas solo se escucha la última.
   */
  function escucharCambios() {
    const consultas: Query[] = [
      col("config"),
      col("articulos"),
      col("clientes"),
      col("movimientos"),
      col("enEspera"),
      query(col("ventas"), orderBy("fecha", "desc"), limit(1)),
    ];
    const bajas = consultas.map((q) => {
      let primera = true;
      return onSnapshot(q, () => {
        if (primera) primera = false;
        else notificar();
      });
    });
    return () => bajas.forEach((baja) => baja());
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
        const comercio = await leerUno<Comercio>("config", "comercio");
        if (!comercio) throw new Error("No hay datos del comercio cargados");
        return comercio;
      },
      // Con merge, para no pisar los campos que escribe el servidor (certificadoArca).
      guardar: (comercio) => escribir((b) => b.set(ref("config", "comercio"), comercio, { merge: true })),
    },

    categorias: {
      listar: () => leer(col("categorias")),
    },

    articulos: {
      listar: () => leer(col("articulos")),
      obtener: (id) => leerUno("articulos", id),
      guardar: (a) => escribir((b) => b.set(ref("articulos", a.id), a)),
      guardarVarios: (as) => escribirVarios(as, (b, a) => b.set(ref("articulos", a.id), a)),
      ajustarStock: (id, delta) => escribir((b) => b.update(ref("articulos", id), { stock: increment(delta) })),
    },

    clientes: {
      listar: () => leer(col("clientes")),
      obtener: (id) => leerUno("clientes", id),
      guardar: (c) => escribir((b) => b.set(ref("clientes", c.id), c)),
    },

    ventas: {
      async listar(rango) {
        if (!rango) return leer(query(col("ventas"), orderBy("fecha")));
        const [desde, hasta] = limitesISO(rango);
        return leer(query(col("ventas"), where("fecha", ">=", desde), where("fecha", "<", hasta), orderBy("fecha")));
      },
      listarPorCliente: async (clienteId) => porFecha(await leer(query(col("ventas"), where("clienteId", "==", clienteId)))),
      listarNotasDe: async (ventaId) =>
        porFecha(await leer(query(col("ventas"), where("asociado.ventaId", "==", ventaId)))),
      obtener: (id) => leerUno("ventas", id),
      agregar: (v) => escribir((b) => b.set(ref("ventas", v.id), v)),
    },

    movimientos: {
      listar: () => leer(col("movimientos")),
      listarPorCliente: async (clienteId) =>
        porFecha(await leer(query(col("movimientos"), where("clienteId", "==", clienteId)))),
      guardar: (m) => escribir((b) => b.set(ref("movimientos", m.id), m)),
      guardarVarios: (ms) => escribirVarios(ms, (b, m) => b.set(ref("movimientos", m.id), m)),
    },

    recibos: {
      listarPorCliente: (clienteId) => leer(query(col("recibos"), where("clienteId", "==", clienteId))),
      obtener: (id) => leerUno("recibos", id),
      agregar: (r) => escribir((b) => b.set(ref("recibos", r.id), r)),
    },

    enEspera: {
      listar: () => leer(col("enEspera")),
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
     * un solo lote, así que no es atómico: si se corta a mitad, repetirlo.
     */
    async reemplazarTodo(datos: DatosIniciales) {
      for (const nombre of COLECCIONES) await vaciar(nombre);
      const filas: [Coleccion, string, DocumentData][] = [
        ...datos.categorias.map((x): [Coleccion, string, DocumentData] => ["categorias", x.id, x]),
        ...datos.articulos.map((x): [Coleccion, string, DocumentData] => ["articulos", x.id, x]),
        ...datos.clientes.map((x): [Coleccion, string, DocumentData] => ["clientes", x.id, x]),
        ...datos.ventas.map((x): [Coleccion, string, DocumentData] => ["ventas", x.id, x]),
        ...datos.movimientos.map((x): [Coleccion, string, DocumentData] => ["movimientos", x.id, x]),
        ...datos.recibos.map((x): [Coleccion, string, DocumentData] => ["recibos", x.id, x]),
        ...Object.entries(datos.contadores).map(
          ([clave, ultimo]): [Coleccion, string, DocumentData] => ["contadores", clave, { clave, ultimo }],
        ),
      ];
      await escribirVarios(filas, (b, [nombre, id, datos]) => b.set(ref(nombre, id), datos));
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
