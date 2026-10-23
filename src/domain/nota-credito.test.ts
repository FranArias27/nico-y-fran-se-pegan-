import { describe, expect, it } from "vitest";
import { armarLineas } from "./carrito";
import { armarNotaCredito, importePendiente, pendientesDeDevolver } from "./nota-credito";
import type { Articulo, TipoComprobante, Venta } from "./types";

function articulo(id: string, precioNeto: number, alicuotaIva: 0 | 1050 | 2100 = 2100): Articulo {
  return {
    id,
    codigo: id,
    nombre: `Artículo ${id}`,
    marca: "",
    categoriaId: "general",
    unidad: "unidad",
    costo: Math.round(precioNeto / 2),
    margen: 10000,
    alicuotaIva,
    redondeo: "ninguno",
    precioNeto,
    precioFinal: Math.round(precioNeto * (1 + alicuotaIva / 10000)),
    stock: 0,
    stockMinimo: 0,
    codigosBarra: [],
    activo: true,
    actualizadoEn: "2026-10-01T00:00:00.000Z",
  };
}

const ARTICULOS = new Map([
  ["a", articulo("a", 33333)],
  ["b", articulo("b", 10000, 1050)],
]);

it("rechaza repetir el mismo artículo para eludir el límite de devolución", () => {
  const resultado = armarNotaCredito(venta("B"), [{ articuloId: "a", cantidad: 2000 }, { articuloId: "a", cantidad: 2000 }], []);
  expect(resultado).toEqual({ error: "Un artículo no puede repetirse en la devolución" });
});

function venta(tipo: TipoComprobante): Venta {
  const { lineas, calculo } = armarLineas(
    tipo,
    [
      { articuloId: "a", cantidad: 3000 },
      { articuloId: "b", cantidad: 2000 },
    ],
    ARTICULOS,
    { tipo: "porcentaje", valor: 700 },
  );
  return {
    id: "v1",
    tipo,
    puntoVenta: 1,
    numero: 1,
    fecha: "2026-10-01T12:00:00.000Z",
    clienteId: "cf",
    clienteNombre: "Consumidor final",
    clienteCondicionIva: "CF",
    clienteDocumento: "",
    vendedorId: "u",
    lineas,
    totales: calculo.totales,
    pagos: [{ medio: "efectivo", importe: calculo.totales.total }],
    vuelto: 0,
  };
}

function nota(original: Venta, resultado: ReturnType<typeof armarNotaCredito>): Venta {
  if ("error" in resultado) throw new Error(resultado.error);
  return { ...original, id: `nc-${Math.random()}`, clase: "nota_credito", ...resultado };
}

describe("nota de crédito", () => {
  it("la devolución total replica la factura al centavo", () => {
    for (const tipo of ["A", "B", "C", "X"] as const) {
      const v = venta(tipo);
      const nc = armarNotaCredito(v, [
        { articuloId: "a", cantidad: 3000 },
        { articuloId: "b", cantidad: 2000 },
      ], []);
      if ("error" in nc) throw new Error(nc.error);
      expect(nc.totales).toEqual(v.totales);
    }
  });

  it("varias devoluciones parciales suman exactamente lo facturado", () => {
    const v = venta("B");
    const n1 = nota(v, armarNotaCredito(v, [{ articuloId: "a", cantidad: 1000 }], []));
    const n2 = nota(v, armarNotaCredito(v, [{ articuloId: "a", cantidad: 1000 }], [n1]));
    const n3 = nota(v, armarNotaCredito(v, [{ articuloId: "a", cantidad: 1000 }, { articuloId: "b", cantidad: 2000 }], [n1, n2]));
    expect(n1.totales.total + n2.totales.total + n3.totales.total).toBe(v.totales.total);
    expect(n1.totales.iva + n2.totales.iva + n3.totales.iva).toBe(v.totales.iva);
    expect(importePendiente(v, [n1, n2, n3])).toBe(0);
    expect([...pendientesDeDevolver(v, [n1, n2, n3]).values()]).toEqual([0, 0]);
  });

  it("agrupa el IVA por alícuota en A y B, y no lo informa en C ni X", () => {
    const b = nota(venta("B"), armarNotaCredito(venta("B"), [{ articuloId: "b", cantidad: 1000 }], []));
    expect(b.totales.ivaPorAlicuota).toEqual([{ alicuota: 1050, neto: b.totales.neto, iva: b.totales.iva }]);
    const c = nota(venta("C"), armarNotaCredito(venta("C"), [{ articuloId: "b", cantidad: 1000 }], []));
    expect(c.totales.ivaPorAlicuota).toEqual([]);
    expect(c.totales.iva).toBe(0);
  });

  it("no deja devolver más de lo vendido ni una nota vacía", () => {
    const v = venta("B");
    const n1 = nota(v, armarNotaCredito(v, [{ articuloId: "a", cantidad: 2000 }], []));
    expect(armarNotaCredito(v, [{ articuloId: "a", cantidad: 2000 }], [n1])).toHaveProperty("error");
    expect(armarNotaCredito(v, [{ articuloId: "a", cantidad: 0 }], [])).toHaveProperty("error");
    expect(armarNotaCredito(v, [{ articuloId: "zz", cantidad: 1000 }], [])).toHaveProperty("error");
  });
});
