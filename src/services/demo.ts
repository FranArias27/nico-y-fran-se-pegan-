import { generarDatosDemo } from "@/data/seed/generar";
import type { DatosIniciales } from "@/data/store";
import { CLIENTE_CONSUMIDOR_FINAL_ID, type Comercio } from "@/domain/types";
import type { Contexto } from "./contexto";

/** Borra todo y vuelve a cargar los datos de ejemplo (con fechas relativas a hoy). */
export async function reiniciarDatosDemo(ctx: Contexto): Promise<void> {
  await ctx.store.reemplazarTodo(generarDatosDemo(ctx.ahora()));
}

/** Datos mínimos de una empresa recién creada: sin artículos, clientes ni ventas. */
export function datosEmpresaNueva(nombre: string, ahora: Date): DatosIniciales {
  const creadoEn = ahora.toISOString();
  return {
    comercio: {
      razonSocial: nombre,
      nombreFantasia: nombre,
      cuit: "",
      condicionIva: "RI",
      ingresosBrutos: "",
      inicioActividades: "",
      domicilio: "",
      localidad: "",
      telefono: "",
      email: "",
      puntoVenta: 1,
    },
    categorias: [{ id: "general", nombre: "General" }],
    articulos: [],
    clientes: [
      {
        id: CLIENTE_CONSUMIDOR_FINAL_ID,
        razonSocial: "Consumidor final",
        condicionIva: "CF",
        documento: "",
        cuentaCorriente: false,
        limiteCredito: 0,
        plazoDias: 0,
        estado: "habilitado",
        creadoEn,
      },
    ],
    ventas: [],
    movimientos: [],
    recibos: [],
    contadores: {},
  };
}

export function estaVacia(ctx: Contexto): Promise<boolean> {
  return ctx.store.estaVacio();
}

/** Deja lista una empresa nueva la primera vez que entra un administrador. */
export async function inicializarEmpresa(ctx: Contexto, nombre: string): Promise<void> {
  if (await ctx.store.estaVacio()) await ctx.store.reemplazarTodo(datosEmpresaNueva(nombre, ctx.ahora()));
}

export function obtenerComercio(ctx: Contexto): Promise<Comercio> {
  return ctx.store.comercio.obtener();
}

/** El estado del certificado de ARCA lo escribe solo el servidor: no se manda. */
export function guardarComercio(ctx: Contexto, comercio: Comercio): Promise<void> {
  const datos = { ...comercio };
  delete datos.certificadoArca;
  return ctx.store.comercio.guardar(datos);
}
