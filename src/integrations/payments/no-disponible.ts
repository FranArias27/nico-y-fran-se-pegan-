import type { PaymentProvider } from "./payment-provider";

/** Empresas reales: no generar URLs ni acreditar pagos sin integración verificada. */
export const pagosNoDisponibles: PaymentProvider = {
  crearCobroQR: async () => { throw new Error("Mercado Pago todavía no está integrado"); },
  consultarCobroQR: async () => { throw new Error("Mercado Pago todavía no está integrado"); },
  crearLinkPago: () => undefined,
};
