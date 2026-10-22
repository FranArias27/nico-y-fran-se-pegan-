import { generarDatosDemo } from "@/data/seed/generar";
import type { Comercio } from "@/domain/types";
import type { Contexto } from "./contexto";

/** Borra todo y vuelve a cargar los datos de ejemplo (con fechas relativas a hoy). */
export async function reiniciarDatosDemo(ctx: Contexto): Promise<void> {
  await ctx.store.reemplazarTodo(generarDatosDemo(ctx.ahora()));
}

/** Carga los datos de ejemplo la primera vez que se abre la app. */
export async function asegurarDatosDemo(ctx: Contexto): Promise<void> {
  if (await ctx.store.estaVacio()) await reiniciarDatosDemo(ctx);
}

export function obtenerComercio(ctx: Contexto): Promise<Comercio> {
  return ctx.store.comercio.obtener();
}

export function guardarComercio(ctx: Contexto, comercio: Comercio): Promise<void> {
  return ctx.store.comercio.guardar(comercio);
}
