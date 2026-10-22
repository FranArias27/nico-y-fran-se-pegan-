import { validarCodigos, type ConflictoCodigo } from "@/domain/codigos";
import { calcularPrecios, previsualizarCambioCostos, type CambioMasivo } from "@/domain/precios";
import type { Articulo, Centavos, PuntosBasicos } from "@/domain/types";
import { ErrorDeNegocio, type Contexto } from "./contexto";

export function listarArticulos(ctx: Contexto) {
  return ctx.store.articulos.listar();
}

export async function listarCategorias(ctx: Contexto) {
  const categorias = await ctx.store.categorias.listar();
  return categorias.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function obtenerArticulo(ctx: Contexto, id: string) {
  return ctx.store.articulos.obtener(id);
}

export type DatosArticulo = Omit<Articulo, "id" | "precioNeto" | "precioFinal" | "actualizadoEn"> & {
  id?: string;
  /**
   * Precio neto antes del redondeo. Lo calcula el formulario desde el costo y
   * el margen, o lo tipea el usuario (y el margen se deriva de él).
   */
  precioNetoBase: Centavos;
};

export class ErrorCodigos extends ErrorDeNegocio {
  constructor(readonly conflictos: ConflictoCodigo[]) {
    super("Hay códigos de barra repetidos", conflictos);
  }
}

export async function guardarArticulo(ctx: Contexto, datos: DatosArticulo): Promise<Articulo> {
  const nombre = datos.nombre.trim();
  const codigo = datos.codigo.trim();
  if (!nombre) throw new ErrorDeNegocio("El nombre es obligatorio");
  if (!codigo) throw new ErrorDeNegocio("El código interno es obligatorio");
  if (datos.costo < 0 || datos.precioNetoBase < 0) throw new ErrorDeNegocio("Los importes no pueden ser negativos");

  const codigosBarra = datos.codigosBarra
    .map((c) => ({ codigo: c.codigo.trim(), cantidad: c.cantidad }))
    .filter((c) => c.codigo !== "");
  if (codigosBarra.some((c) => c.cantidad <= 0)) {
    throw new ErrorDeNegocio("La cantidad equivalente de cada código tiene que ser mayor a cero");
  }

  const otros = await ctx.store.articulos.listar();
  const conflictos = validarCodigos(datos.id ?? null, codigo, codigosBarra, otros);
  if (conflictos.length > 0) throw new ErrorCodigos(conflictos);

  const { precioNetoBase, ...resto } = datos;
  const precios = calcularPrecios(precioNetoBase, datos.alicuotaIva, datos.redondeo);
  const articulo: Articulo = {
    ...resto,
    id: datos.id ?? ctx.nuevoId(),
    nombre,
    codigo,
    codigosBarra,
    ...precios,
    actualizadoEn: ctx.ahora().toISOString(),
  };
  await ctx.store.articulos.guardar(articulo);
  return articulo;
}

async function articulosDeCategoria(ctx: Contexto, categoriaId: string) {
  const articulos = await ctx.store.articulos.listar();
  return articulos.filter((a) => a.categoriaId === categoriaId && a.activo);
}

export async function previsualizarCambioMasivo(
  ctx: Contexto,
  categoriaId: string,
  variacion: PuntosBasicos,
): Promise<CambioMasivo[]> {
  return previsualizarCambioCostos(await articulosDeCategoria(ctx, categoriaId), variacion);
}

/** Sube o baja el costo de toda una categoría y recalcula precios manteniendo el margen. */
export async function aplicarCambioMasivo(
  ctx: Contexto,
  categoriaId: string,
  variacion: PuntosBasicos,
): Promise<number> {
  const articulos = await articulosDeCategoria(ctx, categoriaId);
  const cambios = new Map(previsualizarCambioCostos(articulos, variacion).map((c) => [c.articuloId, c]));
  const ahora = ctx.ahora().toISOString();
  const actualizados = articulos.map((a) => {
    const c = cambios.get(a.id)!;
    return {
      ...a,
      costo: c.costoNuevo,
      precioNeto: c.precioNetoNuevo,
      precioFinal: c.precioFinalNuevo,
      actualizadoEn: ahora,
    };
  });
  await ctx.store.articulos.guardarVarios(actualizados);
  return actualizados.length;
}
