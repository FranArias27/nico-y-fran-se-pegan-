import { describe, expect, it } from "vitest";
import { crearRespaldo, validarRespaldo } from "./respaldo";
describe("integridad de respaldos", () => {
  const documentos = [{ coleccion: "config", id: "comercio", datos: { razonSocial: "Prueba" } }];
  it("acepta una copia serializada y rechaza modificaciones", () => {
    const respaldo = crearRespaldo("prueba", documentos);
    expect(validarRespaldo(JSON.parse(JSON.stringify(respaldo)))).toEqual(respaldo);
    const alterado = structuredClone(respaldo);
    alterado.documentos[0].datos.razonSocial = "Otro";
    expect(() => validarRespaldo(alterado)).toThrow("SHA-256");
  });
  it("rechaza rutas fuera de la empresa, colecciones desconocidas y duplicados", () => {
    for (const d of [
      { coleccion: "usuarios", id: "x", datos: {} },
      { coleccion: "ventas", id: "../x", datos: {} },
      documentos[0],
    ]) {
      expect(() => validarRespaldo(crearRespaldo("prueba", [...documentos, d]))).toThrow();
    }
  });
});
