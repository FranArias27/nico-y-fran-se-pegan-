import Dexie, { type Table } from "dexie";
import { desdeFechaISO, sumarDias, type Rango } from "@/domain/fechas";
import type {
  Articulo,
  Categoria,
  Cliente,
  Comercio,
  Movimiento,
  Recibo,
  Venta,
  VentaEnEspera,
} from "@/domain/types";
import type { DatosIniciales, Store } from "../store";

interface FilaConfig {
  clave: string;
  valor: unknown;
}

interface FilaContador {
  clave: string;
  ultimo: number;
}

class BaseDeDatos extends Dexie {
  config!: Table<FilaConfig, string>;
  categorias!: Table<Categoria, string>;
  articulos!: Table<Articulo, string>;
  clientes!: Table<Cliente, string>;
  ventas!: Table<Venta, string>;
  movimientos!: Table<Movimiento, string>;
  recibos!: Table<Recibo, string>;
  enEspera!: Table<VentaEnEspera, string>;
  contadores!: Table<FilaContador, string>;

  constructor(nombre: string) {
    super(nombre);
    this.version(1).stores({
      config: "clave",
      categorias: "id",
      articulos: "id, categoriaId",
      clientes: "id",
      ventas: "id, fecha, clienteId",
      movimientos: "id, clienteId, fecha",
      recibos: "id, clienteId",
      enEspera: "id",
      contadores: "clave",
    });
  }
}

/** Límites ISO (UTC) de un rango de fechas locales. */
function limitesISO(rango: Rango): [string, string] {
  const desde = desdeFechaISO(rango.desde).toISOString();
  const hasta = desdeFechaISO(sumarDias(rango.hasta, 1)).toISOString();
  return [desde, hasta];
}

export function crearDexieStore(nombre = "el-tornillo-demo"): Store {
  const db = new BaseDeDatos(nombre);
  const oyentes = new Set<() => void>();
  let pendiente = false;

  // Agrupa varias escrituras seguidas en una sola notificación.
  function notificar() {
    if (pendiente) return;
    pendiente = true;
    queueMicrotask(() => {
      pendiente = false;
      for (const oyente of oyentes) oyente();
    });
  }

  async function escribir<T>(op: Promise<T>): Promise<T> {
    const resultado = await op;
    // Dentro de una transacción, se notifica recién al confirmarla.
    if (!Dexie.currentTransaction) notificar();
    return resultado;
  }

  const todas = () => [
    db.config,
    db.categorias,
    db.articulos,
    db.clientes,
    db.ventas,
    db.movimientos,
    db.recibos,
    db.enEspera,
    db.contadores,
  ];

  return {
    comercio: {
      async obtener() {
        const fila = await db.config.get("comercio");
        if (!fila) throw new Error("No hay datos del comercio cargados");
        return fila.valor as Comercio;
      },
      guardar: (comercio) => escribir(db.config.put({ clave: "comercio", valor: comercio }).then(() => {})),
    },

    categorias: {
      listar: () => db.categorias.toArray(),
    },

    articulos: {
      listar: () => db.articulos.toArray(),
      obtener: (id) => db.articulos.get(id),
      guardar: (articulo) => escribir(db.articulos.put(articulo).then(() => {})),
      guardarVarios: (articulos) => escribir(db.articulos.bulkPut(articulos).then(() => {})),
      ajustarStock: (id, delta) =>
        escribir(
          db.articulos
            .where("id")
            .equals(id)
            .modify((a) => {
              a.stock += delta;
            })
            .then(() => {}),
        ),
    },

    clientes: {
      listar: () => db.clientes.toArray(),
      obtener: (id) => db.clientes.get(id),
      guardar: (cliente) => escribir(db.clientes.put(cliente).then(() => {})),
    },

    ventas: {
      listar(rango) {
        if (!rango) return db.ventas.orderBy("fecha").toArray();
        const [desde, hasta] = limitesISO(rango);
        return db.ventas.where("fecha").between(desde, hasta, true, false).toArray();
      },
      listarPorCliente: (clienteId) => db.ventas.where("clienteId").equals(clienteId).sortBy("fecha"),
      obtener: (id) => db.ventas.get(id),
      agregar: (venta) => escribir(db.ventas.add(venta).then(() => {})),
    },

    movimientos: {
      listar: () => db.movimientos.toArray(),
      listarPorCliente: (clienteId) => db.movimientos.where("clienteId").equals(clienteId).sortBy("fecha"),
      guardar: (m) => escribir(db.movimientos.put(m).then(() => {})),
      guardarVarios: (ms) => escribir(db.movimientos.bulkPut(ms).then(() => {})),
    },

    recibos: {
      listarPorCliente: (clienteId) => db.recibos.where("clienteId").equals(clienteId).toArray(),
      obtener: (id) => db.recibos.get(id),
      agregar: (recibo) => escribir(db.recibos.add(recibo).then(() => {})),
    },

    enEspera: {
      listar: () => db.enEspera.toArray(),
      guardar: (v) => escribir(db.enEspera.put(v).then(() => {})),
      eliminar: (id) => escribir(db.enEspera.delete(id)),
    },

    contadores: {
      async siguiente(clave) {
        return db.transaction("rw", db.contadores, async () => {
          const actual = (await db.contadores.get(clave))?.ultimo ?? 0;
          await db.contadores.put({ clave, ultimo: actual + 1 });
          return actual + 1;
        });
      },
    },

    async transaccion(fn) {
      const resultado = await db.transaction("rw", todas(), fn);
      notificar();
      return resultado;
    },

    async estaVacio() {
      return (await db.config.get("comercio")) === undefined;
    },

    async reemplazarTodo(datos: DatosIniciales) {
      await db.transaction("rw", todas(), async () => {
        await Promise.all(todas().map((t) => t.clear()));
        await db.config.put({ clave: "comercio", valor: datos.comercio });
        await db.categorias.bulkAdd(datos.categorias);
        await db.articulos.bulkAdd(datos.articulos);
        await db.clientes.bulkAdd(datos.clientes);
        await db.ventas.bulkAdd(datos.ventas);
        await db.movimientos.bulkAdd(datos.movimientos);
        await db.recibos.bulkAdd(datos.recibos);
        await db.contadores.bulkAdd(
          Object.entries(datos.contadores).map(([clave, ultimo]) => ({ clave, ultimo })),
        );
      });
      notificar();
    },

    alCambiar(callback) {
      oyentes.add(callback);
      return () => oyentes.delete(callback);
    },
  };
}
