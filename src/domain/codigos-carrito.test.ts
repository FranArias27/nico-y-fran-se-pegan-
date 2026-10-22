import { describe, expect, it } from "vitest";
import { agregarAlCarrito, armarLineas, cambiarCantidad, quedaSinStock } from "./carrito";
import {
  buscarArticulos,
  indexarCodigos,
  parsearEntrada,
  parsearMultiplicadorPendiente,
  validarCodigos,
} from "./codigos";
import type { Articulo } from "./types";

function articulo(parcial: Partial<Articulo>): Articulo {
  return {
    id: "a",
    codigo: "A",
    nombre: "Artículo",
    marca: "",
    categoriaId: "c",
    unidad: "unidad",
    costo: 1000,
    margen: 5000,
    alicuotaIva: 2100,
    redondeo: "ninguno",
    precioNeto: 1500,
    precioFinal: 1815,
    stock: 10000,
    stockMinimo: 0,
    codigosBarra: [],
    activo: true,
    actualizadoEn: "2026-01-01T00:00:00.000Z",
    ...parcial,
  };
}

const tornillo = articulo({
  id: "t",
  codigo: "TOR-6",
  nombre: "Tornillo autoperforante 6 x 1\"",
  marca: "Fischer",
  codigosBarra: [
    { codigo: "7790001", cantidad: 1000 },
    { codigo: "7790012", cantidad: 12000 },
  ],
});
const cinta = articulo({ id: "c", codigo: "CIN-1", nombre: "Cinta aisladora", marca: "Tacsa" });

describe("entrada del escáner", () => {
  it("lee un código simple", () => {
    expect(parsearEntrada("7790001")).toEqual({ multiplicador: 1000, codigo: "7790001" });
  });

  it("lee el atajo cantidad*código", () => {
    expect(parsearEntrada("5*7790001")).toEqual({ multiplicador: 5000, codigo: "7790001" });
    expect(parsearEntrada("1,5*CAB")).toEqual({ multiplicador: 1500, codigo: "CAB" });
  });

  it("ignora entradas vacías o incompletas", () => {
    expect(parsearEntrada("")).toBeNull();
    expect(parsearEntrada("5*")).toBeNull();
  });

  it("detecta un multiplicador pendiente", () => {
    expect(parsearMultiplicadorPendiente("5*")).toBe(5000);
    expect(parsearMultiplicadorPendiente("2,5*")).toBe(2500);
    expect(parsearMultiplicadorPendiente("abc")).toBeNull();
  });
});

describe("índice de códigos", () => {
  it("resuelve el código de caja con su cantidad equivalente", () => {
    const indice = indexarCodigos([tornillo]);
    expect(indice.get("7790012")?.cantidad).toBe(12000);
    expect(indice.get("7790001")?.cantidad).toBe(1000);
    expect(indice.get("TOR-6")?.articulo.id).toBe("t");
  });
});

describe("validación de códigos", () => {
  it("detecta códigos asignados a otro artículo", () => {
    const conflictos = validarCodigos("nuevo", "X-1", [{ codigo: "7790012", cantidad: 1000 }], [tornillo]);
    expect(conflictos).toEqual([
      { codigo: "7790012", articuloExistente: { id: "t", nombre: tornillo.nombre } },
    ]);
  });

  it("detecta códigos repetidos en el mismo artículo", () => {
    const conflictos = validarCodigos(
      null,
      "X-1",
      [
        { codigo: "111", cantidad: 1000 },
        { codigo: "111", cantidad: 6000 },
      ],
      [],
    );
    expect(conflictos).toEqual([{ codigo: "111", articuloExistente: null }]);
  });

  it("no marca conflicto con los códigos del propio artículo", () => {
    expect(validarCodigos("t", "TOR-6", tornillo.codigosBarra, [tornillo])).toEqual([]);
  });
});

describe("búsqueda", () => {
  it("ignora tildes y mayúsculas", () => {
    expect(buscarArticulos([tornillo, cinta], "AUTOPERFORANTE").map((a) => a.id)).toEqual(["t"]);
    expect(buscarArticulos([tornillo, cinta], "cinta tacsa").map((a) => a.id)).toEqual(["c"]);
    expect(buscarArticulos([tornillo, cinta], "7790012").map((a) => a.id)).toEqual(["t"]);
  });
});

describe("carrito", () => {
  it("si el artículo se repite, suma la cantidad", () => {
    let items = agregarAlCarrito([], "t", 1000);
    items = agregarAlCarrito(items, "t", 12000);
    expect(items).toEqual([{ articuloId: "t", cantidad: 13000 }]);
  });

  it("cantidad cero quita el ítem", () => {
    expect(cambiarCantidad([{ articuloId: "t", cantidad: 1000 }], "t", 0)).toEqual([]);
  });

  it("avisa cuando la venta deja el stock negativo", () => {
    expect(quedaSinStock({ stock: 2000 }, 3000)).toBe(true);
    expect(quedaSinStock({ stock: 2000 }, 2000)).toBe(false);
  });

  it("congela el costo del artículo en la línea", () => {
    const mapa = new Map([["t", tornillo]]);
    const { lineas } = armarLineas("X", [{ articuloId: "t", cantidad: 2000 }], mapa);
    expect(lineas[0]).toMatchObject({ costoUnitario: 1000, precioNeto: 1500, neto: 3000 });
  });
});
