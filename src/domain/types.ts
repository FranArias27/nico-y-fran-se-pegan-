/**
 * Modelo de datos del dominio. Convenciones:
 * - Importes en centavos (enteros).
 * - Cantidades en milésimas (enteros): 1 unidad = 1000, 1,5 m = 1500.
 * - Porcentajes en puntos básicos (enteros): 21 % = 2100, 10,5 % = 1050.
 * - Fechas con hora en ISO 8601; fechas sin hora como "aaaa-mm-dd".
 */

export type Centavos = number;
export type Milesimas = number;
export type PuntosBasicos = number;
/** Fecha sin hora, "aaaa-mm-dd". */
export type FechaISO = string;
/** Fecha y hora ISO 8601. */
export type FechaHoraISO = string;

export const UNIDAD = 1000; // 1 unidad en milésimas

// ---------------------------------------------------------------------------
// Fiscal

export type CondicionIva = "RI" | "MONOTRIBUTO" | "CF" | "EXENTO";

export const ETIQUETA_CONDICION_IVA: Record<CondicionIva, string> = {
  RI: "Responsable inscripto",
  MONOTRIBUTO: "Monotributista",
  CF: "Consumidor final",
  EXENTO: "Exento",
};

/** Alícuota en puntos básicos. 0 = exento. */
export type AlicuotaIva = 0 | 1050 | 2100 | 2700;

export const ALICUOTAS: readonly AlicuotaIva[] = [2100, 1050, 2700, 0];

export const ETIQUETA_ALICUOTA: Record<AlicuotaIva, string> = {
  2100: "21 %",
  1050: "10,5 %",
  2700: "27 %",
  0: "Exento",
};

/**
 * A y B los emite un responsable inscripto; C, un monotributista o exento.
 * X es la nota de pedido (no fiscal, sin IVA).
 */
export type TipoComprobante = "A" | "B" | "C" | "X";

export const ETIQUETA_COMPROBANTE: Record<TipoComprobante, string> = {
  A: "Factura A",
  B: "Factura B",
  C: "Factura C",
  X: "Nota de pedido",
};

/** Una nota de crédito anula total o parcialmente una factura (o una nota de pedido). */
export type ClaseComprobante = "factura" | "nota_credito";

export const ETIQUETA_NOTA_CREDITO: Record<TipoComprobante, string> = {
  A: "Nota de crédito A",
  B: "Nota de crédito B",
  C: "Nota de crédito C",
  X: "Devolución",
};

export interface Comercio {
  razonSocial: string;
  nombreFantasia: string;
  cuit: string;
  condicionIva: CondicionIva;
  ingresosBrutos: string;
  inicioActividades: FechaISO;
  domicilio: string;
  localidad: string;
  telefono: string;
  email: string;
  puntoVenta: number;
  /**
   * Certificado de ARCA cargado (lo escribe solo el servidor). Sin él, un
   * comercio real solo puede emitir notas de pedido.
   */
  certificadoArca?: { entorno: "homologacion" | "produccion"; vence: FechaHoraISO };
}

// ---------------------------------------------------------------------------
// Artículos

export type UnidadMedida = "unidad" | "metro" | "kg";

export const ETIQUETA_UNIDAD: Record<UnidadMedida, { singular: string; corta: string }> = {
  unidad: { singular: "Unidad", corta: "u." },
  metro: { singular: "Metro", corta: "m" },
  kg: { singular: "Kilogramo", corta: "kg" },
};

export type Redondeo = "ninguno" | "centena";

export interface CodigoBarra {
  codigo: string;
  /** Cantidad equivalente en milésimas (una "caja x12" = 12000). */
  cantidad: Milesimas;
}

export interface Categoria {
  id: string;
  nombre: string;
}

export interface Articulo {
  id: string;
  /** Código interno corto, visible en el mostrador. */
  codigo: string;
  nombre: string;
  marca: string;
  categoriaId: string;
  unidad: UnidadMedida;
  /** Costo neto (sin IVA). */
  costo: Centavos;
  /** % de ganancia sobre el costo. */
  margen: PuntosBasicos;
  alicuotaIva: AlicuotaIva;
  redondeo: Redondeo;
  /** Precio de venta neto. Se recalcula cuando cambian costo, margen o redondeo. */
  precioNeto: Centavos;
  /** Precio de venta con IVA (ya redondeado si corresponde). */
  precioFinal: Centavos;
  stock: Milesimas;
  stockMinimo: Milesimas;
  codigosBarra: CodigoBarra[];
  activo: boolean;
  actualizadoEn: FechaHoraISO;
}

// ---------------------------------------------------------------------------
// Clientes

export type EstadoCliente = "habilitado" | "observacion" | "bloqueado";

export const ETIQUETA_ESTADO_CLIENTE: Record<EstadoCliente, string> = {
  habilitado: "Habilitado",
  observacion: "En observación",
  bloqueado: "Bloqueado",
};

export interface Cliente {
  id: string;
  /** Razón social o nombre y apellido. */
  razonSocial: string;
  /** Nombre de fantasía (opcional, para SRL y comercios). */
  nombreFantasia?: string;
  condicionIva: CondicionIva;
  /** CUIT o DNI, solo dígitos. */
  documento: string;
  domicilio?: string;
  telefono?: string;
  email?: string;
  cuentaCorriente: boolean;
  limiteCredito: Centavos;
  /** Plazo de pago en días para las ventas a cuenta. */
  plazoDias: number;
  estado: EstadoCliente;
  notas?: string;
  creadoEn: FechaHoraISO;
}

export const CLIENTE_CONSUMIDOR_FINAL_ID = "cf";

// ---------------------------------------------------------------------------
// Ventas

export type MedioPago = "efectivo" | "transferencia" | "debito" | "credito" | "qr" | "cuenta_corriente";

export const ETIQUETA_MEDIO_PAGO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  debito: "Débito",
  credito: "Crédito",
  qr: "QR Mercado Pago",
  cuenta_corriente: "A cuenta corriente",
};

export type Descuento = { tipo: "porcentaje"; valor: PuntosBasicos } | { tipo: "monto"; valor: Centavos };

export interface LineaVenta {
  articuloId: string;
  codigo: string;
  descripcion: string;
  unidad: UnidadMedida;
  categoriaId: string;
  cantidad: Milesimas;
  alicuotaIva: AlicuotaIva;
  /** Precios unitarios al momento de la venta. */
  precioNeto: Centavos;
  precioFinal: Centavos;
  /** Costo unitario al momento de la venta: la ganancia histórica no cambia. */
  costoUnitario: Centavos;
  descuento?: Descuento;
  // Importes calculados de la línea (con todos los descuentos aplicados):
  /** Neto antes de descuentos. */
  netoBruto: Centavos;
  /** Descuento total en neto (de la línea y la parte prorrateada del total). */
  descuentoNeto: Centavos;
  /** Neto final de la línea (base de la ganancia). */
  neto: Centavos;
  /** IVA de la línea (0 en notas de pedido). */
  iva: Centavos;
  /** Total que paga el cliente por la línea. */
  total: Centavos;
}

export interface IvaPorAlicuota {
  alicuota: AlicuotaIva;
  neto: Centavos;
  iva: Centavos;
}

export interface TotalesComprobante {
  netoBruto: Centavos;
  descuentos: Centavos;
  neto: Centavos;
  iva: Centavos;
  ivaPorAlicuota: IvaPorAlicuota[];
  total: Centavos;
}

export interface Pago {
  medio: MedioPago;
  importe: Centavos;
}

export interface DatosFiscales {
  cae: string;
  caeVencimiento: FechaISO;
  /** Contenido del QR del comprobante. */
  qrUrl: string;
  /** CAE ficticio: el comprobante no tiene validez fiscal. */
  simulado?: boolean;
}

/** Comprobante que anula una nota de crédito. */
export interface ComprobanteAsociado {
  ventaId: string;
  tipo: TipoComprobante;
  puntoVenta: number;
  numero: number;
  fecha: FechaHoraISO;
}

export interface Venta {
  id: string;
  /** Sin definir equivale a "factura" (los datos anteriores no lo tienen). */
  clase?: ClaseComprobante;
  tipo: TipoComprobante;
  puntoVenta: number;
  numero: number;
  fecha: FechaHoraISO;
  clienteId: string;
  /** Copia de los datos del cliente al momento de la venta. */
  clienteNombre: string;
  clienteCondicionIva: CondicionIva;
  clienteDocumento: string;
  vendedorId: string;
  vendedorNombre?: string;
  /** Solo en notas de crédito: la factura que anulan. */
  asociado?: ComprobanteAsociado;
  lineas: LineaVenta[];
  descuentoTotal?: Descuento;
  totales: TotalesComprobante;
  pagos: Pago[];
  /** Efectivo entregado de más. */
  vuelto: Centavos;
  fiscal?: DatosFiscales;
}

// ---------------------------------------------------------------------------
// Cuenta corriente

export type TipoMovimiento = "venta" | "pago" | "nota_credito";

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  venta: "Venta a cuenta",
  pago: "Pago",
  nota_credito: "Nota de crédito",
};

export interface Imputacion {
  /** Movimiento de débito (venta) al que se aplica el crédito. */
  debitoId: string;
  importe: Centavos;
}

interface MovimientoBase {
  id: string;
  clienteId: string;
  fecha: FechaHoraISO;
  /** Siempre positivo; el tipo define si es débito o crédito. */
  importe: Centavos;
  descripcion: string;
}

export interface MovimientoDebito extends MovimientoBase {
  tipo: "venta";
  ventaId?: string;
  vencimiento: FechaISO;
}

export interface MovimientoCredito extends MovimientoBase {
  tipo: "pago" | "nota_credito";
  reciboId?: string;
  medio?: MedioPago;
  imputaciones: Imputacion[];
}

export type Movimiento = MovimientoDebito | MovimientoCredito;

export interface Recibo {
  id: string;
  numero: number;
  puntoVenta: number;
  fecha: FechaHoraISO;
  clienteId: string;
  clienteNombre: string;
  importe: Centavos;
  medio: MedioPago;
  imputaciones: (Imputacion & { descripcion: string })[];
  /** Parte del pago que quedó como saldo a favor. */
  saldoAFavor: Centavos;
  usuarioId: string;
}

/** Venta suspendida en el mostrador para retomarla después. */
export interface VentaEnEspera {
  id: string;
  creadaEn: FechaHoraISO;
  usuarioId: string;
  clienteId: string;
  etiqueta: string;
  items: ItemCarrito[];
  descuentoTotal?: Descuento;
}

export interface ItemCarrito {
  articuloId: string;
  cantidad: Milesimas;
  descuento?: Descuento;
}
