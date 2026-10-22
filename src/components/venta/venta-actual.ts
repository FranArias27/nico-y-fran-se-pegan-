"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/auth/auth-provider";
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

const estados = new Map<string, VentaActual>();
const oyentes = new Set<() => void>();

function leer(clave: string): VentaActual {
  const existente = estados.get(clave);
  if (existente) return existente;
  let estado: VentaActual;
  try {
    const guardado = sessionStorage.getItem(clave);
    estado = guardado ? { ...VENTA_VACIA, ...(JSON.parse(guardado) as VentaActual) } : VENTA_VACIA;
  } catch {
    estado = VENTA_VACIA;
  }
  estados.set(clave, estado);
  return estado;
}

function escribir(clave: string, nuevo: VentaActual) {
  estados.set(clave, nuevo);
  try {
    sessionStorage.setItem(clave, JSON.stringify(nuevo));
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
  const { perfil, usuario } = useAuth();
  const clave = `${CLAVE}:${perfil?.empresaId}:${usuario.id}`;
  const venta = useSyncExternalStore(suscribir, () => leer(clave), () => VENTA_VACIA);
  const actualizar = useCallback((cambio: (v: VentaActual) => VentaActual) => escribir(clave, cambio(leer(clave))), [clave]);
  const reiniciar = useCallback(() => escribir(clave, VENTA_VACIA), [clave]);
  return { venta, actualizar, reiniciar };
}

