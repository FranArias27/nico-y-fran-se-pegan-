import { FieldValue, type Firestore, type Query, type Transaction } from "firebase-admin/firestore";
import type { Exclusion } from "./exclusion";
import {
  separarArticulo,
  separarVenta,
  unirArticulo,
  unirVenta,
  type ArticuloPublico,
  type CostoArticulo,
  type CostosVenta,
  type VentaPublica,
} from "@/data/costos";
import type { Store } from "@/data/store";
import { desdeFechaISO, sumarDias } from "@/domain/fechas";
import type { Comercio, Venta } from "@/domain/types";

const porFecha = <T extends { fecha: string }>(lista: T[]) => lista.sort((a, b) => a.fecha.localeCompare(b.fecha));

/**
 * Store sobre Firestore con el Admin SDK, para registrar ventas, notas de
 * crédito y pagos desde el servidor. Saltea las reglas de seguridad: se usa
 * solo después de validar al usuario (ver ./acceso.ts). Siempre lee los
 * costos, que el servidor necesita para guardar el costo histórico de cada
 * línea. Guarda los datos con el mismo formato que el store del navegador
 * (src/data/firestore).
 *
 * `transaccion()` confirma escrituras con una transacción de Firestore que
 * verifica el token de exclusión. El ejecutor mantiene esa exclusión desde
 * antes de leer saldos y devoluciones hasta después de guardar el resultado.
 */
export function crearStoreAdmin(db: Firestore, empresaId: string, exclusion?: Exclusion): Store {
  const col = (nombre: string) => db.collection(`empresas/${empresaId}/${nombre}`);
  const ref = (nombre: string, id: string) => col(nombre).doc(id);

  const leer = async <T>(q: Query) => (await q.get()).docs.map((d) => d.data() as T);
  const leerUno = async <T>(nombre: string, id: string) => (await ref(nombre, id).get()).data() as T | undefined;
  const mapa = async <T>(q: Query) => new Map((await q.get()).docs.map((d) => [d.id, d.data() as T]));

  async function costosDeVentas(ventas: VentaPublica[]) {
    if (ventas.length === 0) return [];
    const snaps = await db.getAll(...ventas.map((v) => ref("ventasCostos", v.id)));
    return ventas.map((v, i) => unirVenta(v, snaps[i].data() as CostosVenta | undefined));
  }

  let pendientes: ((tx: Transaction) => void)[] | null = null;
  let comprobante: Venta | undefined;
  async function confirmar(escrituras: ((tx: Transaction) => void)[]) {
    await db.runTransaction(async (tx) => {
      if (exclusion) await exclusion.verificar(tx);
      for (const escribir of escrituras) escribir(tx);
      tx.set(ref("control", "cambios"), { version: FieldValue.increment(1) }, { merge: true });
    });
  }
  async function escribir(aplicar: (b: Transaction) => void) {
    if (pendientes) { pendientes.push(aplicar); return; }
    await confirmar([aplicar]);
  }

  const noDisponible = (): never => {
    throw new Error("Operación no disponible en el servidor");
  };

  return {
    comercio: {
      async obtener() {
        const comercio = await leerUno<Comercio>("config", "comercio");
        if (!comercio) throw new Error("No hay datos del comercio cargados");
        return comercio;
      },
      guardar: noDisponible,
    },

    categorias: {
      listar: () => leer(col("categorias")),
    },

    articulos: {
      async listar() {
        const [publicos, costos] = await Promise.all([
          leer<ArticuloPublico>(col("articulos")),
          mapa<CostoArticulo>(col("costos")),
        ]);
        return publicos.map((a) => unirArticulo(a, costos.get(a.id)));
      },
      async obtener(id) {
        const [publico, costo] = await Promise.all([
          leerUno<ArticuloPublico>("articulos", id),
          leerUno<CostoArticulo>("costos", id),
        ]);
        return publico && unirArticulo(publico, costo);
      },
      guardar: (a) =>
        escribir((b) => {
          const { publico, costo } = separarArticulo(a);
          b.set(ref("articulos", a.id), publico);
          b.set(ref("costos", a.id), costo);
        }),
      guardarVarios: noDisponible,
      ajustarStock: (id, delta) => escribir((b) => {
        b.update(ref("articulos", id), { stock: FieldValue.increment(delta) });
        if (comprobante) b.set(ref("inventarioMovimientos", `${comprobante.id}-${id}`), {
          id: `${comprobante.id}-${id}`, articuloId: id, delta, fecha: comprobante.fecha,
          motivo: comprobante.clase === "nota_credito" ? "Devolución de venta" : "Venta",
          comprobanteId: comprobante.id, usuarioId: comprobante.vendedorId,
        });
      }),
    },

    clientes: {
      listar: () => leer(col("clientes")),
      obtener: (id) => leerUno("clientes", id),
      guardar: noDisponible,
    },

    ventas: {
      async listar(rango) {
        let q: Query = col("ventas");
        if (rango) {
          const desde = desdeFechaISO(rango.desde).toISOString();
          const hasta = desdeFechaISO(sumarDias(rango.hasta, 1)).toISOString();
          q = q.where("fecha", ">=", desde).where("fecha", "<", hasta);
        }
        return costosDeVentas(await leer<VentaPublica>(q.orderBy("fecha")));
      },
      listarPorCliente: async (clienteId) =>
        porFecha(await costosDeVentas(await leer<VentaPublica>(col("ventas").where("clienteId", "==", clienteId)))),
      listarNotasDe: async (ventaId) =>
        porFecha(await costosDeVentas(await leer<VentaPublica>(col("ventas").where("asociado.ventaId", "==", ventaId)))),
      async obtener(id) {
        const [publica, costos] = await Promise.all([
          leerUno<VentaPublica>("ventas", id),
          leerUno<CostosVenta>("ventasCostos", id),
        ]);
        return publica && unirVenta(publica, costos);
      },
      agregar: (v) => {
        comprobante = v;
        return escribir((b) => {
          const { publica, costos } = separarVenta(v);
          b.set(ref("ventas", v.id), publica);
          b.set(ref("ventasCostos", v.id), costos);
        });
      },
    },

    movimientos: {
      listar: () => leer(col("movimientos")),
      listarPorCliente: async (clienteId) => porFecha(await leer(col("movimientos").where("clienteId", "==", clienteId))),
      guardar: (m) => escribir((b) => b.set(ref("movimientos", m.id), m)),
      guardarVarios: noDisponible,
    },

    recibos: {
      listarPorCliente: (clienteId) => leer(col("recibos").where("clienteId", "==", clienteId)),
      obtener: (id) => leerUno("recibos", id),
      agregar: (r) => escribir((b) => b.set(ref("recibos", r.id), r)),
    },

    enEspera: {
      listar: () => leer(col("enEspera")),
      guardar: noDisponible,
      eliminar: noDisponible,
    },

    contadores: {
      siguiente: (clave) =>
        db.runTransaction(async (tx) => {
          const r = ref("contadores", clave);
          const actual = ((await tx.get(r)).data()?.ultimo as number | undefined) ?? 0;
          tx.set(r, { clave, ultimo: actual + 1 });
          return actual + 1;
        }),
    },

    async transaccion<T>(fn: () => Promise<T>): Promise<T> {
      pendientes = [];
      try {
        const valor = await fn();
        await confirmar(pendientes);
        return valor;
      } finally {
        pendientes = null;
      }
    },

    async estaVacio() {
      return (await leerUno("config", "comercio")) === undefined;
    },
    reemplazarTodo: noDisponible,
    alCambiar: () => () => {},
  };
}

