import type { Centavos, Comercio, CondicionIva, DatosFiscales, FechaHoraISO, TipoComprobante } from "@/domain/types";

export interface SolicitudAutorizacion {
  comercio: Comercio;
  tipo: Exclude<TipoComprobante, "X">;
  puntoVenta: number;
  numero: number;
  fecha: FechaHoraISO;
  total: Centavos;
  clienteCondicionIva: CondicionIva;
  clienteDocumento: string;
}

/**
 * Autorización de comprobantes electrónicos. La implementación real hablará
 * con el web service de ARCA (WSFEv1) desde el backend.
 */
export interface FiscalProvider {
  autorizar(solicitud: SolicitudAutorizacion): Promise<DatosFiscales>;
}
