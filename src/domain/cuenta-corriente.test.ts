import { describe, expect, it } from "vitest";
import {
  aplicarCreditosDisponibles,
  calcularSaldo,
  deudasPendientes,
  evaluarVentaACuenta,
  imputarAutomatico,
  imputarSeleccion,
  resumirCuenta,
  tramoDe,
} from "./cuenta-corriente";
import { diasEntre, rangoAnterior } from "./fechas";
import type { Movimiento, MovimientoCredito, MovimientoDebito } from "./types";
import { armarMensajeRecordatorio, linkWhatsApp, normalizarTelefonoAR } from "./whatsapp";

const HOY = "2026-10-21";

function debito(id: string, fecha: string, vencimiento: string, importe: number): MovimientoDebito {
  return { id, tipo: "venta", clienteId: "c", fecha, vencimiento, importe, descripcion: `Factura ${id}` };
}

const D1 = debito("D1", "2026-08-02T10:00:00.000Z", "2026-09-01", 10000);
const D2 = debito("D2", "2026-09-15T10:00:00.000Z", "2026-10-15", 5000);
const D3 = debito("D3", "2026-10-02T10:00:00.000Z", "2026-11-01", 3000);
const P1: MovimientoCredito = {
  id: "P1",
  tipo: "pago",
  clienteId: "c",
  fecha: "2026-09-10T10:00:00.000Z",
  importe: 4000,
  descripcion: "Recibo 1",
  imputaciones: [{ debitoId: "D1", importe: 4000 }],
};
const MOVS: Movimiento[] = [D3, P1, D1, D2];

describe("saldo y deuda pendiente", () => {
  it("calcula el saldo", () => {
    expect(calcularSaldo(MOVS)).toBe(14000);
  });

  it("lista la deuda pendiente de la más vieja a la más nueva", () => {
    expect(deudasPendientes(MOVS).map((d) => [d.debito.id, d.pendiente])).toEqual([
      ["D1", 6000],
      ["D2", 5000],
      ["D3", 3000],
    ]);
  });
});

describe("imputación de pagos", () => {
  const deudas = deudasPendientes(MOVS);

  it("imputa automáticamente a la deuda más vieja", () => {
    expect(imputarAutomatico(deudas, 8000)).toEqual({
      imputaciones: [
        { debitoId: "D1", importe: 6000 },
        { debitoId: "D2", importe: 2000 },
      ],
      sobrante: 0,
    });
  });

  it("el excedente queda como saldo a favor", () => {
    expect(imputarAutomatico(deudas, 20000).sobrante).toBe(6000);
  });

  it("permite elegir el comprobante", () => {
    expect(imputarSeleccion(deudas, ["D2"], 7000)).toEqual({
      imputaciones: [{ debitoId: "D2", importe: 5000 }],
      sobrante: 2000,
    });
  });

  it("aplica el saldo a favor a una venta nueva", () => {
    const credito: MovimientoCredito = { ...P1, id: "P2", importe: 5000, imputaciones: [{ debitoId: "D1", importe: 3000 }] };
    expect(aplicarCreditosDisponibles([credito], "D9", 3000)).toEqual([
      { creditoId: "P2", imputacion: { debitoId: "D9", importe: 2000 } },
    ]);
  });
});

describe("antigüedad de deuda", () => {
  it("clasifica por tramos", () => {
    expect([0, 1, 7, 8, 15, 16, 30, 31].map(tramoDe)).toEqual([
      "al_dia",
      "1_7",
      "1_7",
      "8_15",
      "8_15",
      "16_30",
      "16_30",
      "mas_30",
    ]);
  });

  it("resume la cuenta", () => {
    const r = resumirCuenta(MOVS, HOY);
    expect(r.tramos).toEqual({ al_dia: 3000, "1_7": 5000, "8_15": 0, "16_30": 0, mas_30: 6000 });
    expect(r.vencido).toBe(11000);
    expect(r.deuda).toBe(14000);
    expect(r.maxDiasVencido).toBe(50);
    expect(r.saldoAFavor).toBe(0);
  });
});

describe("control de crédito", () => {
  const cliente = { cuentaCorriente: true, estado: "habilitado" as const, limiteCredito: 100000 };

  it("permite dentro del límite sin avisos", () => {
    expect(evaluarVentaACuenta(cliente, 50000, 20000)).toEqual({ permitido: true, avisos: [] });
  });

  it("avisa si supera el límite", () => {
    const r = evaluarVentaACuenta(cliente, 90000, 20000);
    expect(r.permitido).toBe(true);
    expect(r.avisos).toHaveLength(1);
  });

  it("avisa si está en observación", () => {
    expect(evaluarVentaACuenta({ ...cliente, estado: "observacion" }, 0, 1000).avisos).toHaveLength(1);
  });

  it("no permite vender a cuenta a un cliente bloqueado o sin cuenta", () => {
    expect(evaluarVentaACuenta({ ...cliente, estado: "bloqueado" }, 0, 1000).permitido).toBe(false);
    expect(evaluarVentaACuenta({ ...cliente, cuentaCorriente: false }, 0, 1000).permitido).toBe(false);
  });
});

describe("WhatsApp", () => {
  it("normaliza teléfonos argentinos", () => {
    expect(normalizarTelefonoAR("011 15 4444-5555")).toBe("5491144445555");
    expect(normalizarTelefonoAR("+54 9 341 555-1234")).toBe("5493415551234");
    expect(normalizarTelefonoAR("(0341) 15-555-1234")).toBe("5493415551234");
    expect(normalizarTelefonoAR("123")).toBeNull();
  });

  it("arma el mensaje con saldo, vencidos y link de pago", () => {
    const mensaje = armarMensajeRecordatorio({
      nombreCliente: "Juan",
      nombreComercio: "Ferretería El Tornillo",
      saldo: 14000,
      deudas: deudasPendientes(MOVS),
      hoy: HOY,
      linkPago: "https://pago.ejemplo/abc",
    });
    expect(mensaje).toContain("Hola Juan");
    expect(mensaje).toContain("$ 140,00");
    expect(mensaje).toContain("Factura D1: $ 60,00");
    expect(mensaje).toContain("Factura D2");
    expect(mensaje).not.toContain("Factura D3");
    expect(mensaje).toContain("https://pago.ejemplo/abc");
  });

  it("resume los vencidos cuando son muchos", () => {
    const muchos = Array.from({ length: 8 }, (_, i) => ({
      debito: debito(`V${i}`, "2026-08-01T10:00:00.000Z", "2026-09-01", 1000),
      pendiente: 1000,
    }));
    const mensaje = armarMensajeRecordatorio({
      nombreCliente: "Juan",
      nombreComercio: "Ferretería El Tornillo",
      saldo: 8000,
      deudas: muchos,
      hoy: HOY,
      linkPago: "https://pago.ejemplo/abc",
    });
    expect(mensaje).toContain("Factura V4");
    expect(mensaje).not.toContain("Factura V5");
    expect(mensaje).toContain("y 3 comprobantes vencidos más por $ 30,00");
  });

  it("arma el link wa.me", () => {
    expect(linkWhatsApp("011 4444-5555", "Hola")).toBe("https://wa.me/5491144445555?text=Hola");
    expect(linkWhatsApp(undefined, "Hola")).toBe("https://wa.me/?text=Hola");
  });
});

describe("fechas", () => {
  it("cuenta días calendario", () => {
    expect(diasEntre("2026-09-01", HOY)).toBe(50);
    expect(diasEntre(HOY, HOY)).toBe(0);
  });

  it("calcula el período anterior", () => {
    expect(rangoAnterior({ desde: "2026-10-19", hasta: "2026-10-21" }, "semana")).toEqual({
      desde: "2026-10-16",
      hasta: "2026-10-18",
    });
    expect(rangoAnterior({ desde: "2026-10-01", hasta: "2026-10-21" }, "mes")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-21",
    });
    expect(rangoAnterior({ desde: "2026-03-01", hasta: "2026-03-31" }, "mes")).toEqual({
      desde: "2026-02-01",
      hasta: "2026-02-28",
    });
  });
});
