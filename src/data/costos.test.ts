import { describe, expect, it } from "vitest";
import { generarDatosDemo } from "./seed/generar";
import { separarArticulo, separarVenta, unirArticulo, unirVenta } from "./costos";

const datos = generarDatosDemo(new Date(2026, 9, 21, 16, 30));
const articulo = datos.articulos[0];
const venta = datos.ventas.find((v) => v.lineas.length > 1)!;

describe("costos separados", () => {
  it("el artículo sin costos no tiene costo ni margen, y se reconstruye igual", () => {
    const { publico, costo } = separarArticulo(articulo);
    expect(publico).not.toHaveProperty("costo");
    expect(publico).not.toHaveProperty("margen");
    expect(unirArticulo(publico, costo)).toEqual(articulo);
  });

  it("la venta sin costos no tiene el costo de ninguna línea, y se reconstruye igual", () => {
    const { publica, costos } = separarVenta(venta);
    expect(publica.lineas.every((l) => !("costoUnitario" in l))).toBe(true);
    expect(costos).toEqual({ fecha: venta.fecha, clienteId: venta.clienteId, costos: venta.lineas.map((l) => l.costoUnitario) });
    expect(unirVenta(publica, costos)).toEqual(venta);
  });

  it("sin permiso para ver costos, se leen como 0", () => {
    expect(unirArticulo(separarArticulo(articulo).publico)).toMatchObject({ costo: 0, margen: 0 });
    expect(unirVenta(separarVenta(venta).publica).lineas.every((l) => l.costoUnitario === 0)).toBe(true);
  });

  it("los datos anteriores a la separación conservan su costo", () => {
    expect(unirArticulo(articulo)).toEqual(articulo);
    expect(unirVenta(venta)).toEqual(venta);
  });
});
