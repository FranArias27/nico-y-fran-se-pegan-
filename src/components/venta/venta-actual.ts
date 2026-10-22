"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CLIENTE_CONSUMIDOR_FINAL_ID, type Descuento, type ItemCarrito, type TipoComprobante } from "@/domain/types";

/**
 * Venta en curso del mostrador. Vive fuera de los componentes para que no se
 * pierda al navegar a otra pantalla, y se respalda en sessionStorage para que
 * sobreviva a una recarga.
 */
export interface VentaActual {
  items: ItemCarrito[];
  clienteId: string;
  descuentoTotal?: Descuento;
  /** null = el comprobante sugerido para el cliente. */
  tipo: TipoComprobante | null;
  /** Último artículo agregado, para resaltarlo. */
  ultimoArticuloId?: string;
}

const CLAVE = "el-tornillo:venta-actual";
export const VENTA_VACIA: VentaActual = { items: [], clienteId: CLIENTE_CONSUMIDOR_FINAL_ID, tipo: null };

let estado: VentaActual | null = null;
const oyentes = new Set<() => void>();

function leer(): VentaActual {
  if (estado) return estado;
  try {
    const guardado = sessionStorage.getItem(CLAVE);
    estado = guardado ? { ...VENTA_VACIA, ...(JSON.parse(guardado) as VentaActual) } : VENTA_VACIA;
  } catch {
    estado = VENTA_VACIA;
  }
  return estado;
}

function escribir(nuevo: VentaActual) {
  estado = nuevo;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(nuevo));
  } catch {
    // Sin almacenamiento: la venta vive solo en memoria.
  }
  for (const o of oyentes) o();
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function useVentaActual() {
  const venta = useSyncExternalStore(suscribir, leer, () => VENTA_VACIA);
  const actualizar = useCallback((cambio: (v: VentaActual) => VentaActual) => escribir(cambio(leer())), []);
  const reiniciar = useCallback(() => escribir(VENTA_VACIA), []);
  return { venta, actualizar, reiniciar };
}
