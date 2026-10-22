import { calcularComprobante, type ComprobanteCalculado } from "./comprobante";
import type { Articulo, Descuento, ItemCarrito, LineaVenta, Milesimas, TipoComprobante } from "./types";

/** Operaciones puras sobre los ítems del mostrador. */

/** Agrega un artículo; si ya está en el carrito, suma la cantidad. */
export function agregarAlCarrito(
  items: readonly ItemCarrito[],
  articuloId: string,
  cantidad: Milesimas,
): ItemCarrito[] {
  const existente = items.findIndex((i) => i.articuloId === articuloId);
  if (existente === -1) return [...items, { articuloId, cantidad }];
  return items.map((item, i) =>
    i === existente ? { ...item, cantidad: item.cantidad + cantidad } : item,
  );
}

export function cambiarCantidad(
  items: readonly ItemCarrito[],
  articuloId: string,
  cantidad: Milesimas,
): ItemCarrito[] {
  if (cantidad <= 0) return quitarDelCarrito(items, articuloId);
  return items.map((i) => (i.articuloId === articuloId ? { ...i, cantidad } : i));
}

export function cambiarDescuentoItem(
  items: readonly ItemCarrito[],
  articuloId: string,
  descuento: Descuento | undefined,
): ItemCarrito[] {
  return items.map((i) => (i.articuloId === articuloId ? { ...i, descuento } : i));
}

export function quitarDelCarrito(items: readonly ItemCarrito[], articuloId: string): ItemCarrito[] {
  return items.filter((i) => i.articuloId !== articuloId);
}

/** Cantidad total de un artículo en el carrito (para el aviso de stock). */
export function cantidadEnCarrito(items: readonly ItemCarrito[], articuloId: string): Milesimas {
  return items.find((i) => i.articuloId === articuloId)?.cantidad ?? 0;
}

/** true si vender `cantidad` deja el stock negativo. */
export function quedaSinStock(articulo: Pick<Articulo, "stock">, cantidad: Milesimas): boolean {
  return articulo.stock - cantidad < 0;
}

/**
 * Arma las líneas de venta "congelando" precio y costo del artículo en este
 * momento, y calcula los importes según el comprobante.
 */
export function armarLineas(
  tipo: TipoComprobante,
  items: readonly ItemCarrito[],
  articulos: ReadonlyMap<string, Articulo>,
  descuentoTotal?: Descuento,
): { lineas: LineaVenta[]; calculo: ComprobanteCalculado } {
  const presentes = items.filter((i) => articulos.has(i.articuloId));
  const base = presentes.map((item) => {
    const art = articulos.get(item.articuloId)!;
    return {
      item,
      art,
      entrada: {
        cantidad: item.cantidad,
        precioNeto: art.precioNeto,
        precioFinal: art.precioFinal,
        alicuotaIva: art.alicuotaIva,
        descuento: item.descuento,
      },
    };
  });

  const calculo = calcularComprobante(
    tipo,
    base.map((b) => b.entrada),
    descuentoTotal,
  );

  const lineas: LineaVenta[] = base.map(({ item, art }, i) => ({
    articuloId: art.id,
    codigo: art.codigo,
    descripcion: art.nombre,
    unidad: art.unidad,
    categoriaId: art.categoriaId,
    cantidad: item.cantidad,
    alicuotaIva: art.alicuotaIva,
    precioNeto: art.precioNeto,
    precioFinal: art.precioFinal,
    costoUnitario: art.costo,
    descuento: item.descuento,
    ...calculo.lineas[i],
  }));

  return { lineas, calculo };
}
