import type { Articulo, Venta } from "@/domain/types";
import { separarArticulo, separarVenta } from "./costos";
import type { DatosIniciales } from "./store";

/** Colecciones de cada empresa en Firestore: `empresas/{empresaId}/<coleccion>/<id>`. */
export const COLECCIONES = [
  "config",
  "categorias",
  "articulos",
  "clientes",
  "ventas",
  "movimientos",
  "recibos",
  "enEspera",
  "contadores",
  "costos",
  "ventasCostos",
] as const;

export type Coleccion = (typeof COLECCIONES)[number];

/** Un documento a escribir: colección, id y datos. */
export type Fila = [Coleccion, string, object];

/** Un artículo o una venta se guardan en dos documentos: los datos y los costos (ver ./costos.ts). */
export function filasArticulo(a: Articulo): Fila[] {
  const { publico, costo } = separarArticulo(a);
  return [
    ["articulos", a.id, publico],
    ["costos", a.id, costo],
  ];
}

export function filasVenta(v: Venta): Fila[] {
  const { publica, costos } = separarVenta(v);
  return [
    ["ventas", v.id, publica],
    ["ventasCostos", v.id, costos],
  ];
}

/**
 * Documentos de los datos iniciales de una empresa, salvo el comercio
 * (`config/comercio`), que se escribe al final: mientras no existe, la
 * empresa figura como vacía.
 */
export function filasIniciales(datos: DatosIniciales): Fila[] {
  return [
    ...datos.categorias.map((x): Fila => ["categorias", x.id, x]),
    ...datos.articulos.flatMap(filasArticulo),
    ...datos.clientes.map((x): Fila => ["clientes", x.id, x]),
    ...datos.ventas.flatMap(filasVenta),
    ...datos.movimientos.map((x): Fila => ["movimientos", x.id, x]),
    ...datos.recibos.map((x): Fila => ["recibos", x.id, x]),
    ...Object.entries(datos.contadores).map(([clave, ultimo]): Fila => ["contadores", clave, { clave, ultimo }]),
    // Los datos nuevos ya tienen los costos separados: no hace falta migrarlos.
    ["config", "migraciones", { costosSeparados: true }],
  ];
}
