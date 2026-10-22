import type { CobroQR, EstadoCobroQR, PaymentProvider } from "./payment-provider";

/**
 * Mercado Pago simulado: el QR se "paga" solo unos segundos después de
 * generarlo, para mostrar el flujo completo en la demo.
 */
export function crearMercadoPagoSimulado(
  opciones: { aprobarEnMs?: number; linkBase?: string } = {},
): PaymentProvider {
  const aprobarEnMs = opciones.aprobarEnMs ?? 4000;
  const linkBase = opciones.linkBase ?? "https://link.mercadopago.com.ar/eltornillo-demo";
  const creados = new Map<string, number>();
  let secuencia = 0;

  return {
    async crearCobroQR(importe, referencia): Promise<CobroQR> {
      const id = `mp-demo-${Date.now()}-${++secuencia}`;
      creados.set(id, Date.now());
      const qrData = `${linkBase}?ref=${encodeURIComponent(referencia)}&monto=${(importe / 100).toFixed(2)}`;
      return { id, importe, qrData };
    },

    async consultarCobroQR(id): Promise<EstadoCobroQR> {
      const creado = creados.get(id);
      if (creado === undefined) return "rechazado";
      return Date.now() - creado >= aprobarEnMs ? "aprobado" : "pendiente";
    },

    crearLinkPago(clienteId, importe) {
      return `${linkBase}?cliente=${encodeURIComponent(clienteId)}&monto=${(importe / 100).toFixed(2)}`;
    },
  };
}
