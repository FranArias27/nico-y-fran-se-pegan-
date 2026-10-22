import { describe, expect, it } from "vitest";
import { calcularCobro, pagosNetosDeVuelto } from "./cobro";

describe("cobro", () => {
  it("calcula el vuelto en efectivo", () => {
    expect(calcularCobro(10000, [{ medio: "efectivo", importe: 15000 }])).toMatchObject({
      vuelto: 5000,
      faltante: 0,
      completo: true,
    });
  });

  it("acepta pago mixto con vuelto del efectivo", () => {
    const estado = calcularCobro(10000, [
      { medio: "transferencia", importe: 6000 },
      { medio: "efectivo", importe: 5000 },
    ]);
    expect(estado).toMatchObject({ vuelto: 1000, completo: true });
  });

  it("informa lo que falta", () => {
    expect(calcularCobro(10000, [{ medio: "debito", importe: 4000 }])).toMatchObject({
      faltante: 6000,
      completo: false,
    });
  });

  it("no permite que otros medios superen el total", () => {
    const estado = calcularCobro(10000, [{ medio: "credito", importe: 12000 }]);
    expect(estado.completo).toBe(false);
    expect(estado.error).toBeDefined();
  });

  it("separa lo que va a cuenta corriente", () => {
    const estado = calcularCobro(10000, [
      { medio: "efectivo", importe: 3000 },
      { medio: "cuenta_corriente", importe: 7000 },
    ]);
    expect(estado).toMatchObject({ aCuenta: 7000, completo: true });
  });

  it("registra el efectivo neto del vuelto", () => {
    expect(
      pagosNetosDeVuelto(
        [
          { medio: "transferencia", importe: 6000 },
          { medio: "efectivo", importe: 5000 },
        ],
        1000,
      ),
    ).toEqual([
      { medio: "transferencia", importe: 6000 },
      { medio: "efectivo", importe: 4000 },
    ]);
  });
});
