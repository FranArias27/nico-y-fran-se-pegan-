import type { Centavos } from "@/domain/types";

export type EstadoCobroQR = "pendiente" | "aprobado" | "rechazado";

export interface CobroQR {
  id: string;
  importe: Centavos;
  /** Contenido a mostrar como código QR. */
  qrData: string;
}

/**
 * Cobros electrónicos. La implementación real usará la API de Mercado Pago
 * (QR dinámico y links de pago) desde el backend.
 */
export interface PaymentProvider {
  crearCobroQR(importe: Centavos, referencia: string): Promise<CobroQR>;
  consultarCobroQR(id: string): Promise<EstadoCobroQR>;
  /** Link de pago para enviar a un cliente por su saldo. */
  crearLinkPago(clienteId: string, importe: Centavos): string | undefined;
}
