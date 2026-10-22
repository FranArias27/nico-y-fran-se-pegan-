import { describe, expect, it } from "vitest";
import { leerPedido, tieneDescuentos, type DatosVenta } from "./pedido";

const venta = {
  tipo: "B",
  clienteId: "cf",
  items: [{ articuloId: "art-tor-005", cantidad: 2000 }],
  pagos: [{ medio: "efectivo", importe: 150000 }],
};
const pedido = (datos: unknown, accion = "venta") => ({ empresaId: "ferreteria-1", id: "4b1c2d3e-0000-4000-8000-000000000001", accion, datos });

describe("pedidos de operaciones", () => {
  it("acepta una venta y descarta lo que el navegador no decide", () => {
    const leido = leerPedido(
      pedido({
        ...venta,
        vendedorId: "otro-usuario",
        items: [{ articuloId: "art-tor-005", cantidad: 2000, precioFinal: 1 }],
      }),
    );
    expect(leido.accion).toBe("venta");
    expect(leido.datos).toEqual({
      tipo: "B",
      clienteId: "cf",
      items: [{ articuloId: "art-tor-005", cantidad: 2000, descuento: undefined }],
      descuentoTotal: undefined,
      pagos: [{ medio: "efectivo", importe: 150000 }],
    });
  });

  it.each([
    ["cantidad cero", { ...venta, items: [{ articuloId: "a", cantidad: 0 }] }],
    ["cantidad con decimales", { ...venta, items: [{ articuloId: "a", cantidad: 1.5 }] }],
    ["sin artículos", { ...venta, items: [] }],
    ["medio de pago desconocido", { ...venta, pagos: [{ medio: "cheque", importe: 1 }] }],
    ["descuento mayor al 100 %", { ...venta, descuentoTotal: { tipo: "porcentaje", valor: 10001 } }],
    ["tipo de comprobante desconocido", { ...venta, tipo: "Z" }],
  ])("rechaza una venta con %s", (_, datos) => {
    expect(() => leerPedido(pedido(datos))).toThrow("El pedido no es válido");
  });

  it("rechaza una acción desconocida, un id corto o una empresa inválida", () => {
    expect(() => leerPedido(pedido(venta, "borrar"))).toThrow();
    expect(() => leerPedido({ ...pedido(venta), id: "x" })).toThrow();
    expect(() => leerPedido({ ...pedido(venta), empresaId: "../otra" })).toThrow();
  });

  it("acepta un pago y una nota de crédito", () => {
    expect(leerPedido(pedido({ clienteId: "c-1", importe: 5000, medio: "transferencia" }, "pago")).accion).toBe("pago");
    expect(
      leerPedido(
        pedido(
          { ventaId: "v-1", devoluciones: [{ articuloId: "a", cantidad: 1000 }], reintegro: "efectivo", reponerStock: true },
          "nota_credito",
        ),
      ).accion,
    ).toBe("nota_credito");
  });

  it("detecta descuentos por ítem o al total", () => {
    const base = venta as DatosVenta;
    expect(tieneDescuentos(base)).toBe(false);
    expect(tieneDescuentos({ ...base, descuentoTotal: { tipo: "monto", valor: 0 } })).toBe(false);
    expect(tieneDescuentos({ ...base, descuentoTotal: { tipo: "monto", valor: 100 } })).toBe(true);
    expect(
      tieneDescuentos({ ...base, items: [{ articuloId: "a", cantidad: 1000, descuento: { tipo: "porcentaje", valor: 500 } }] }),
    ).toBe(true);
  });
});
