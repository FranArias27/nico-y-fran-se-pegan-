import { describe, expect, it } from "vitest";
import { armarMensajeRecordatorio } from "./whatsapp";
import { pagosNoDisponibles } from "@/integrations/payments/no-disponible";
describe("recordatorios de empresas reales", () => {
  it("envía saldo y vencimientos sin enlaces ficticios", () => {
    const mensaje = armarMensajeRecordatorio({
      nombreCliente: "Ana",
      nombreComercio: "Ferretería",
      saldo: 10000,
      deudas: [],
      hoy: "2026-10-22",
      linkPago: pagosNoDisponibles.crearLinkPago("ana", 10000),
    });
    expect(mensaje).toContain("100,00");
    expect(mensaje).not.toContain("http");
    expect(mensaje).not.toContain("undefined");
  });
});
