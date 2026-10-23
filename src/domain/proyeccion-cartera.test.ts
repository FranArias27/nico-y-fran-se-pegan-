import { describe, expect, it } from "vitest";
import { proyectarCartera } from "./proyeccion-cartera";
import { resumirCuenta } from "./cuenta-corriente";
import type { Movimiento } from "./types";

describe("resumen de cartera sin historial cerrado", () => {
  it("conserva saldo, vencimientos y crédito disponible", () => {
    const movimientos: Movimiento[] = [
      {
        id: "a",
        clienteId: "c",
        tipo: "venta",
        fecha: "2026-10-01T12:00:00Z",
        vencimiento: "2026-10-08",
        importe: 10000,
        descripcion: "A",
      },
      {
        id: "b",
        clienteId: "c",
        tipo: "venta",
        fecha: "2026-10-02T12:00:00Z",
        vencimiento: "2026-11-02",
        importe: 5000,
        descripcion: "B",
      },
      {
        id: "p",
        clienteId: "c",
        tipo: "pago",
        fecha: "2026-10-03T12:00:00Z",
        importe: 12000,
        descripcion: "Pago",
        imputaciones: [
          { debitoId: "a", importe: 10000 },
          { debitoId: "b", importe: 2000 },
        ],
      },
    ];
    const p = proyectarCartera(movimientos);
    expect(p.abiertos).toHaveLength(1);
    expect(p.cobrosMes["2026-10"]).toBe(12000);
    const anterior = resumirCuenta(movimientos, "2026-10-22"),
      nuevo = resumirCuenta(p.abiertos, "2026-10-22");
    expect(nuevo.saldo).toBe(anterior.saldo);
    expect(nuevo.tramos).toEqual(anterior.tramos);
  });
  it("mantiene el mes argentino cuando UTC ya cambió de mes", () => {
    const p = proyectarCartera([
      {
        id: "p",
        clienteId: "c",
        tipo: "pago",
        fecha: "2026-11-01T01:00:00Z",
        importe: 1000,
        descripcion: "Pago",
        imputaciones: [],
      },
    ]);
    expect(p.cobrosMes["2026-10"]).toBe(1000);
    expect(resumirCuenta(p.abiertos, "2026-10-31").saldo).toBe(-1000);
  });
});
