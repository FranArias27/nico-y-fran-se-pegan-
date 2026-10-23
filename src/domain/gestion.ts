import type { MedioPago } from "./types";

export interface Proveedor {
  id: string;
  nombre: string;
  documento: string;
  telefono: string;
  saldo?: number;
}
export interface LineaCompra {
  articuloId: string;
  cantidad: number;
  costo: number;
}
export interface Compra {
  id: string;
  proveedorId: string;
  comprobante: string;
  fecha: string;
  lineas: LineaCompra[];
  total: number;
  pagado: number;
}
export interface Caja {
  sesionId: string;
  abierta: boolean;
  apertura: number;
  esperado: number;
  abiertaEn: string;
  cerradaEn?: string;
  contado?: number;
  diferencia?: number;
}
export type PedidoGestion =
  | { accion: "abrir_caja"; importe: number }
  | { accion: "cerrar_caja"; importe: number }
  | { accion: "movimiento_caja"; importe: number; motivo: string }
  | { accion: "proveedor"; proveedor: Proveedor }
  | {
      accion: "compra";
      proveedorId: string;
      comprobante: string;
      lineas: LineaCompra[];
      pagado: number;
      medio: MedioPago;
    }
  | { accion: "pago_proveedor"; compraId: string; importe: number; medio: MedioPago }
  | { accion: "inventario"; articuloId: string; esperado: number; contado: number; motivo: string };

export function enteroSeguro(v: unknown, minimo = 0): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < minimo || Math.abs(v) > 1e12)
    throw new Error("Importe o cantidad inválida");
  return v;
}
export function textoSeguro(v: unknown, maximo = 200): string {
  if (typeof v !== "string" || !v.trim() || v.length > maximo) throw new Error("Completá los campos obligatorios");
  return v.trim();
}
export function idSeguro(v: unknown): string {
  if (typeof v !== "string" || !/^[\w-]{1,100}$/.test(v)) throw new Error("Identificador inválido");
  return v;
}
export function validarLineasCompra(lineas: LineaCompra[]) {
  if (!Array.isArray(lineas) || !lineas.length || lineas.length > 100)
    throw new Error("La compra admite entre 1 y 100 artículos");
  if (new Set(lineas.map((l) => l.articuloId)).size !== lineas.length) throw new Error("Hay artículos repetidos");
  for (const l of lineas) {
    idSeguro(l.articuloId);
    enteroSeguro(l.cantidad, 1);
    enteroSeguro(l.costo);
  }
}
export function medioCompra(v: unknown): MedioPago {
  if (!["efectivo", "transferencia", "debito", "credito"].includes(String(v)))
    throw new Error("Medio de pago inválido");
  return v as MedioPago;
}
