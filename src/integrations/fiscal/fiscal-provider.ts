import type {
  ClaseComprobante,
  Comercio,
  ComprobanteAsociado,
  CondicionIva,
  DatosFiscales,
  FechaHoraISO,
  TipoComprobante,
  TotalesComprobante,
} from "@/domain/types";

export type TipoFiscal = Exclude<TipoComprobante, "X">;

export interface SolicitudAutorizacion {
  comercio: Comercio;
  clase: ClaseComprobante;
  tipo: TipoFiscal;
  fecha: FechaHoraISO;
  totales: TotalesComprobante;
  clienteCondicionIva: CondicionIva;
  clienteDocumento: string;
  /** Obligatorio en las notas de crédito. */
  asociado?: ComprobanteAsociado;
}

/** Comprobante autorizado: el número lo asigna quien autoriza, para que sea correlativo. */
export interface Autorizacion extends DatosFiscales {
  numero: number;
}

/**
 * Autorización de comprobantes electrónicos. La real habla con el web
 * service de ARCA (WSFEv1) desde el servidor: ver src/app/api/arca.
 */
export interface FiscalProvider {
  autorizar(solicitud: SolicitudAutorizacion): Promise<Autorizacion>;
}
