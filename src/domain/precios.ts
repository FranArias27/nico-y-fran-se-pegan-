import { porcentaje, redondear } from "./dinero";
import type { AlicuotaIva, Articulo, Centavos, PuntosBasicos, Redondeo } from "./types";

/** Precio de venta neto = costo × (1 + % ganancia). */
export function precioDesdeMargen(costo: Centavos, margen: PuntosBasicos): Centavos {
  return redondear((costo * (10000 + margen)) / 10000);
}

/** % de ganancia sobre el costo, en puntos básicos. null si el costo es 0. */
export function margenDesdePrecio(costo: Centavos, precioNeto: Centavos): PuntosBasicos | null {
  if (costo <= 0) return null;
  return redondear(((precioNeto - costo) / costo) * 10000);
}

/** Margen sobre el precio de venta (para reportes): (precio − costo) / precio. */
export function margenSobreVenta(costo: Centavos, precioNeto: Centavos): PuntosBasicos | null {
  if (precioNeto <= 0) return null;
  return redondear(((precioNeto - costo) / precioNeto) * 10000);
}

export function agregarIva(neto: Centavos, alicuota: AlicuotaIva): Centavos {
  return neto + porcentaje(neto, alicuota);
}

export function quitarIva(final: Centavos, alicuota: AlicuotaIva): Centavos {
  return redondear((final * 10000) / (10000 + alicuota));
}

/** Redondea a la centena de pesos (10.000 centavos) más cercana; nunca a 0. */
export function redondearCentena(importe: Centavos): Centavos {
  if (importe <= 0) return importe;
  const redondeado = Math.round(importe / 10000) * 10000;
  return Math.max(redondeado, 10000);
}

export interface PreciosCalculados {
  precioNeto: Centavos;
  precioFinal: Centavos;
}

/**
 * A partir del precio neto "teórico" aplica IVA y, si corresponde, el
 * redondeo a la centena sobre el precio final. Con redondeo, el neto se
 * recalcula desde el final para que ambos sean coherentes.
 */
export function calcularPrecios(
  precioNetoBase: Centavos,
  alicuota: AlicuotaIva,
  redondeo: Redondeo,
): PreciosCalculados {
  const finalBase = agregarIva(precioNetoBase, alicuota);
  if (redondeo === "ninguno") return { precioNeto: precioNetoBase, precioFinal: finalBase };
  const precioFinal = redondearCentena(finalBase);
  return { precioNeto: quitarIva(precioFinal, alicuota), precioFinal };
}

/** Recalcula los precios de un artículo desde su costo y margen. */
export function recalcularDesdeCosto(
  art: Pick<Articulo, "costo" | "margen" | "alicuotaIva" | "redondeo">,
): PreciosCalculados {
  return calcularPrecios(precioDesdeMargen(art.costo, art.margen), art.alicuotaIva, art.redondeo);
}

/** Aplica una variación porcentual al costo (positiva o negativa). */
export function variarCosto(costo: Centavos, variacion: PuntosBasicos): Centavos {
  return Math.max(0, costo + porcentaje(costo, variacion));
}

export interface CambioMasivo {
  articuloId: string;
  costoAnterior: Centavos;
  costoNuevo: Centavos;
  precioFinalAnterior: Centavos;
  precioNetoNuevo: Centavos;
  precioFinalNuevo: Centavos;
}

/**
 * Vista previa de un aumento/rebaja de costos: mantiene el % de ganancia de
 * cada artículo y recalcula los precios.
 */
export function previsualizarCambioCostos(
  articulos: readonly Articulo[],
  variacion: PuntosBasicos,
): CambioMasivo[] {
  return articulos.map((art) => {
    const costoNuevo = variarCosto(art.costo, variacion);
    const precios = recalcularDesdeCosto({ ...art, costo: costoNuevo });
    return {
      articuloId: art.id,
      costoAnterior: art.costo,
      costoNuevo,
      precioFinalAnterior: art.precioFinal,
      precioNetoNuevo: precios.precioNeto,
      precioFinalNuevo: precios.precioFinal,
    };
  });
}
