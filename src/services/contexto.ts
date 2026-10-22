import type { Store } from "@/data/store";
import type { FiscalProvider } from "@/integrations/fiscal/fiscal-provider";
import type { PaymentProvider } from "@/integrations/payments/payment-provider";

/** Dependencias de los servicios. Se inyectan para poder cambiarlas (tests, backend real). */
export interface Contexto {
  store: Store;
  fiscal: FiscalProvider;
  pagos: PaymentProvider;
  ahora: () => Date;
  nuevoId: () => string;
}

/** Error de una regla de negocio, con un mensaje listo para mostrar al usuario. */
export class ErrorDeNegocio extends Error {
  constructor(
    mensaje: string,
    readonly detalle?: unknown,
  ) {
    super(mensaje);
    this.name = "ErrorDeNegocio";
  }
}
