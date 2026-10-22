import { multiplicarCantidad, porcentaje, prorratear, redondear, sumar } from "./dinero";
import { quitarIva } from "./precios";
import {
  ETIQUETA_COMPROBANTE,
  ETIQUETA_NOTA_CREDITO,
  type AlicuotaIva,
  type Centavos,
  type ClaseComprobante,
  type CondicionIva,
  type Descuento,
  type IvaPorAlicuota,
  type Milesimas,
  type TipoComprobante,
  type TotalesComprobante,
  type Venta,
} from "./types";

export const LEYENDA_TRANSPARENCIA_FISCAL =
  "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)";

/**
 * Comprobante fiscal que corresponde según emisor y cliente: el responsable
 * inscripto emite A (a otro inscripto) o B; el monotributista y el exento, C.
 */
export function tipoComprobanteSugerido(
  emisor: CondicionIva,
  cliente: CondicionIva,
): Exclude<TipoComprobante, "X"> {
  if (emisor === "MONOTRIBUTO" || emisor === "EXENTO") return "C";
  if (emisor !== "RI") throw new Error("Un consumidor final no puede emitir comprobantes");
  return cliente === "RI" ? "A" : "B";
}

/** Condiciones frente al IVA que puede tener el comercio que factura. */
export const CONDICIONES_EMISOR: readonly CondicionIva[] = ["RI", "MONOTRIBUTO", "EXENTO"];

export function esNotaCredito(venta: Pick<Venta, "clase">): boolean {
  return venta.clase === "nota_credito";
}

export function etiquetaComprobante(venta: Pick<Venta, "clase" | "tipo">): string {
  return (esNotaCredito(venta) ? ETIQUETA_NOTA_CREDITO : ETIQUETA_COMPROBANTE)[venta.tipo];
}

/** Códigos de comprobante de ARCA (tabla de tipos de comprobante de WSFEv1). */
const CODIGOS_ARCA: Record<ClaseComprobante, Record<Exclude<TipoComprobante, "X">, number>> = {
  factura: { A: 1, B: 6, C: 11 },
  nota_credito: { A: 3, B: 8, C: 13 },
};

export function codigoArca(clase: ClaseComprobante, tipo: Exclude<TipoComprobante, "X">): number {
  return CODIGOS_ARCA[clase][tipo];
}

/** En B y C los precios se muestran con todo incluido; en A y X, netos. */
export function muestraPrecioFinal(tipo: TipoComprobante): boolean {
  return tipo === "B" || tipo === "C";
}

/** Comprobantes que se pueden emitir a un cliente: el sugerido y la nota de pedido. */
export function comprobantesDisponibles(emisor: CondicionIva, cliente: CondicionIva): TipoComprobante[] {
  return [tipoComprobanteSugerido(emisor, cliente), "X"];
}

/** En Factura A el IVA va discriminado; en B va incluido; en X no hay IVA. */
export function discriminaIva(tipo: TipoComprobante): boolean {
  return tipo === "A";
}

export interface LineaACalcular {
  cantidad: Milesimas;
  precioNeto: Centavos;
  precioFinal: Centavos;
  alicuotaIva: AlicuotaIva;
  descuento?: Descuento;
}

export interface LineaCalculada {
  netoBruto: Centavos;
  descuentoNeto: Centavos;
  neto: Centavos;
  iva: Centavos;
  total: Centavos;
}

export interface ComprobanteCalculado {
  lineas: LineaCalculada[];
  totales: TotalesComprobante;
}

export function importeDescuento(base: Centavos, descuento: Descuento | undefined): Centavos {
  if (!descuento || base <= 0) return 0;
  const valor = descuento.tipo === "porcentaje" ? porcentaje(base, descuento.valor) : descuento.valor;
  return Math.min(Math.max(valor, 0), base);
}

/**
 * Calcula importes por línea y totales de un comprobante.
 *
 * - Los descuentos (por ítem y sobre el total) se expresan sobre el neto, que
 *   es lo que se ve en el mostrador. El descuento total se prorratea entre las
 *   líneas para que el IVA de cada alícuota quede bien calculado.
 * - Factura A: IVA = neto × alícuota, calculado por alícuota.
 * - Factura B: el total sale de los precios finales (con el redondeo a la
 *   centena aplicado) y el IVA contenido se obtiene de ese total.
 * - Factura C: el total sale de los precios finales y no se informa IVA
 *   (el monotributista no lo discrimina).
 * - Nota de pedido (X): precio neto, sin IVA.
 */
export function calcularComprobante(
  tipo: TipoComprobante,
  lineas: readonly LineaACalcular[],
  descuentoTotal?: Descuento,
): ComprobanteCalculado {
  // 1. Descuento de cada línea.
  const paso1 = lineas.map((l) => {
    const netoBruto = multiplicarCantidad(l.precioNeto, l.cantidad);
    const finalBruto = multiplicarCantidad(l.precioFinal, l.cantidad);
    const descLinea = importeDescuento(netoBruto, l.descuento);
    const neto = netoBruto - descLinea;
    const final = netoBruto > 0 ? redondear((finalBruto * neto) / netoBruto) : 0;
    return { netoBruto, descLinea, neto, final };
  });

  // 2. Descuento sobre el total, prorrateado.
  const sumaNeto = sumar(paso1, (l) => l.neto);
  const sumaFinal = sumar(paso1, (l) => l.final);
  const descTotal = importeDescuento(sumaNeto, descuentoTotal);
  const descTotalPorLinea = prorratear(
    descTotal,
    paso1.map((l) => l.neto),
  );
  const descFinalTotal = sumaNeto > 0 ? redondear((sumaFinal * descTotal) / sumaNeto) : 0;
  const descFinalPorLinea = prorratear(
    descFinalTotal,
    paso1.map((l) => l.final),
  );

  const paso2 = paso1.map((l, i) => ({
    netoBruto: l.netoBruto,
    descuentoNeto: l.descLinea + descTotalPorLinea[i],
    neto: l.neto - descTotalPorLinea[i],
    final: l.final - descFinalPorLinea[i],
    alicuota: lineas[i].alicuotaIva,
  }));

  // 3. IVA según el tipo de comprobante.
  const resultado: LineaCalculada[] = paso2.map((l) => ({
    netoBruto: l.netoBruto,
    descuentoNeto: l.descuentoNeto,
    neto: l.neto,
    iva: 0,
    total: l.neto,
  }));
  const ivaPorAlicuota: IvaPorAlicuota[] = [];

  if (tipo === "C") {
    paso2.forEach((l, i) => {
      resultado[i].neto = l.final;
      resultado[i].total = l.final;
    });
  } else if (tipo !== "X") {
    const alicuotas = [...new Set(paso2.map((l) => l.alicuota))].sort((a, b) => b - a);
    for (const alicuota of alicuotas) {
      const indices = paso2.flatMap((l, i) => (l.alicuota === alicuota ? [i] : []));

      if (tipo === "A") {
        const netoGrupo = sumar(indices, (i) => paso2[i].neto);
        const ivaGrupo = porcentaje(netoGrupo, alicuota);
        const ivaLineas = prorratear(
          ivaGrupo,
          indices.map((i) => paso2[i].neto),
        );
        indices.forEach((i, k) => {
          resultado[i].iva = ivaLineas[k];
          resultado[i].total = paso2[i].neto + ivaLineas[k];
        });
        ivaPorAlicuota.push({ alicuota, neto: netoGrupo, iva: ivaGrupo });
      } else {
        const totalGrupo = sumar(indices, (i) => paso2[i].final);
        const netoGrupo = quitarIva(totalGrupo, alicuota);
        const ivaGrupo = totalGrupo - netoGrupo;
        const ivaLineas = prorratear(
          ivaGrupo,
          indices.map((i) => paso2[i].final),
        );
        indices.forEach((i, k) => {
          resultado[i].iva = ivaLineas[k];
          resultado[i].total = paso2[i].final;
          resultado[i].neto = paso2[i].final - ivaLineas[k];
        });
        ivaPorAlicuota.push({ alicuota, neto: netoGrupo, iva: ivaGrupo });
      }
    }
  }

  return {
    lineas: resultado,
    totales: {
      netoBruto: sumar(resultado, (l) => l.netoBruto),
      descuentos: sumar(resultado, (l) => l.descuentoNeto),
      neto: sumar(resultado, (l) => l.neto),
      iva: sumar(resultado, (l) => l.iva),
      ivaPorAlicuota,
      total: sumar(resultado, (l) => l.total),
    },
  };
}
