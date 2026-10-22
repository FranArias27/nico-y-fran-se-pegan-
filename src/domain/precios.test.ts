import { describe, expect, it } from "vitest";
import { prorratear } from "./dinero";
import {
  agregarIva,
  calcularPrecios,
  margenDesdePrecio,
  precioDesdeMargen,
  previsualizarCambioCostos,
  quitarIva,
  redondearCentena,
} from "./precios";
import type { Articulo } from "./types";

describe("precio y margen", () => {
  it("calcula el precio desde el costo y el % de ganancia", () => {
    expect(precioDesdeMargen(10000, 4000)).toBe(14000);
    expect(precioDesdeMargen(12345, 3550)).toBe(16727); // 16727,4
  });

  it("calcula el margen desde el precio", () => {
    expect(margenDesdePrecio(10000, 14000)).toBe(4000);
    expect(margenDesdePrecio(10000, 9000)).toBe(-1000);
    expect(margenDesdePrecio(0, 9000)).toBeNull();
  });
});

describe("IVA", () => {
  it("agrega y quita IVA", () => {
    expect(agregarIva(10000, 2100)).toBe(12100);
    expect(agregarIva(10000, 1050)).toBe(11050);
    expect(agregarIva(10000, 0)).toBe(10000);
    expect(quitarIva(12100, 2100)).toBe(10000);
  });
});

describe("redondeo a la centena", () => {
  it("redondea a los $ 100 más cercanos, nunca a cero", () => {
    expect(redondearCentena(12345)).toBe(10000);
    expect(redondearCentena(15000)).toBe(20000);
    expect(redondearCentena(1234567)).toBe(1230000);
    expect(redondearCentena(4000)).toBe(10000);
  });

  it("sin redondeo devuelve neto y final exactos", () => {
    expect(calcularPrecios(10000, 2100, "ninguno")).toEqual({ precioNeto: 10000, precioFinal: 12100 });
  });

  it("con redondeo, el neto se recalcula desde el final", () => {
    // $ 1.123,50 neto → $ 1.359,44 con IVA → $ 1.400 redondeado
    expect(calcularPrecios(112350, 2100, "centena")).toEqual({ precioNeto: 115702, precioFinal: 140000 });
  });
});

describe("modificación masiva de costos", () => {
  const art = {
    id: "a1",
    costo: 10000,
    margen: 5000,
    alicuotaIva: 2100,
    redondeo: "ninguno",
    precioFinal: 18150,
  } as Articulo;

  it("aumenta el costo y mantiene el margen", () => {
    expect(previsualizarCambioCostos([art], 1000)).toEqual([
      {
        articuloId: "a1",
        costoAnterior: 10000,
        costoNuevo: 11000,
        precioFinalAnterior: 18150,
        precioNetoNuevo: 16500,
        precioFinalNuevo: 19965,
      },
    ]);
  });

  it("rebaja el costo", () => {
    expect(previsualizarCambioCostos([art], -2000)[0].costoNuevo).toBe(8000);
  });
});

describe("prorratear", () => {
  it("reparte sin perder centavos", () => {
    expect(prorratear(1000, [18000, 20000])).toEqual([474, 526]);
    expect(prorratear(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(prorratear(0, [1, 2])).toEqual([0, 0]);
    expect(prorratear(10, [0, 0])).toEqual([0, 0]);
  });
});
