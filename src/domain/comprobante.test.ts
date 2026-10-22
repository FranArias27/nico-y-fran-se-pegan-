import { describe, expect, it } from "vitest";
import {
  calcularComprobante,
  comprobantesDisponibles,
  tipoComprobanteSugerido,
  type LineaACalcular,
} from "./comprobante";

const L1: LineaACalcular = { cantidad: 2000, precioNeto: 10000, precioFinal: 12100, alicuotaIva: 2100 };
const L2: LineaACalcular = { cantidad: 1000, precioNeto: 20000, precioFinal: 22100, alicuotaIva: 1050 };

describe("tipo de comprobante", () => {
  it("emisor RI: Factura A a RI, Factura B al resto", () => {
    expect(tipoComprobanteSugerido("RI", "RI")).toBe("A");
    expect(tipoComprobanteSugerido("RI", "CF")).toBe("B");
    expect(tipoComprobanteSugerido("RI", "MONOTRIBUTO")).toBe("B");
    expect(tipoComprobanteSugerido("RI", "EXENTO")).toBe("B");
  });

  it("siempre ofrece la nota de pedido", () => {
    expect(comprobantesDisponibles("RI", "CF")).toEqual(["B", "X"]);
  });

  it("emisor monotributista o exento: siempre Factura C", () => {
    expect(tipoComprobanteSugerido("MONOTRIBUTO", "CF")).toBe("C");
    expect(tipoComprobanteSugerido("MONOTRIBUTO", "RI")).toBe("C");
    expect(tipoComprobanteSugerido("EXENTO", "RI")).toBe("C");
    expect(comprobantesDisponibles("MONOTRIBUTO", "RI")).toEqual(["C", "X"]);
  });

  it("un consumidor final no emite comprobantes", () => {
    expect(() => tipoComprobanteSugerido("CF", "CF")).toThrow();
  });
});

describe("Factura C", () => {
  it("cobra el precio final y no informa IVA", () => {
    const { totales, lineas } = calcularComprobante("C", [L1, L2]);
    expect(totales.total).toBe(2 * 12100 + 22100);
    expect(totales.iva).toBe(0);
    expect(totales.neto).toBe(totales.total);
    expect(totales.ivaPorAlicuota).toEqual([]);
    expect(lineas[0]).toMatchObject({ neto: 24200, total: 24200, iva: 0 });
  });

  it("aplica el descuento total sobre el precio final", () => {
    const { totales } = calcularComprobante("C", [L1], { tipo: "porcentaje", valor: 1000 });
    expect(totales.total).toBe(21780);
  });
});

describe("nota de pedido (X)", () => {
  it("es a precio neto y sin IVA", () => {
    const { totales } = calcularComprobante("X", [L1, L2]);
    expect(totales.total).toBe(40000);
    expect(totales.iva).toBe(0);
    expect(totales.ivaPorAlicuota).toEqual([]);
  });
});

describe("Factura A", () => {
  it("discrimina IVA por alícuota", () => {
    const { totales, lineas } = calcularComprobante("A", [L1, L2]);
    expect(totales.ivaPorAlicuota).toEqual([
      { alicuota: 2100, neto: 20000, iva: 4200 },
      { alicuota: 1050, neto: 20000, iva: 2100 },
    ]);
    expect(totales.neto).toBe(40000);
    expect(totales.total).toBe(46300);
    expect(lineas[0]).toMatchObject({ neto: 20000, iva: 4200, total: 24200 });
  });

  it("aplica el descuento por ítem antes del IVA", () => {
    const { totales } = calcularComprobante("A", [
      { ...L1, descuento: { tipo: "porcentaje", valor: 5000 } },
      L2,
    ]);
    expect(totales.neto).toBe(30000);
    expect(totales.iva).toBe(2100 + 2100);
    expect(totales.total).toBe(34200);
    expect(totales.descuentos).toBe(10000);
  });
});

describe("Factura B", () => {
  it("el total sale de los precios finales y el IVA va contenido", () => {
    const { totales } = calcularComprobante("B", [L1, L2]);
    expect(totales.total).toBe(46300);
    expect(totales.ivaPorAlicuota).toEqual([
      { alicuota: 2100, neto: 20000, iva: 4200 },
      { alicuota: 1050, neto: 20000, iva: 2100 },
    ]);
  });

  it("respeta el precio redondeado a la centena", () => {
    const redondeado: LineaACalcular = {
      cantidad: 3000,
      precioNeto: 82645,
      precioFinal: 100000,
      alicuotaIva: 2100,
    };
    const { totales } = calcularComprobante("B", [redondeado]);
    expect(totales.total).toBe(300000);
    expect(totales.neto + totales.iva).toBe(300000);
    expect(totales.iva).toBe(52066);
  });

  it("prorratea el descuento sobre el total", () => {
    const { totales } = calcularComprobante("B", [L1, L2], { tipo: "porcentaje", valor: 1000 });
    expect(totales.total).toBe(41670);
    expect(totales.descuentos).toBe(4000);
  });
});

describe("descuentos", () => {
  it("prorratea un descuento en monto sin perder centavos", () => {
    const { lineas, totales } = calcularComprobante(
      "X",
      [{ ...L1, descuento: { tipo: "porcentaje", valor: 1000 } }, L2],
      { tipo: "monto", valor: 1000 },
    );
    expect(lineas.map((l) => l.neto)).toEqual([18000 - 474, 20000 - 526]);
    expect(totales.total).toBe(37000);
    expect(totales.descuentos).toBe(3000);
  });

  it("un descuento mayor al importe deja la línea en cero", () => {
    const { totales } = calcularComprobante("X", [{ ...L1, descuento: { tipo: "monto", valor: 999999 } }]);
    expect(totales.total).toBe(0);
  });

  it("acepta cantidades con decimales", () => {
    const cable: LineaACalcular = { cantidad: 2500, precioNeto: 1234, precioFinal: 1493, alicuotaIva: 2100 };
    const { totales } = calcularComprobante("X", [cable]);
    expect(totales.total).toBe(3085); // 2,5 × 12,34 = 30,85
  });
});
